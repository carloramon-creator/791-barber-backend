import { NextResponse } from 'next/server';
import { getCurrentUserAndTenant, addCorsHeaders } from '@/app/lib/utils';
import { supabaseAdmin } from '@/app/lib/supabase';
import { InterAPIV3 } from '@/app/lib/inter-api-v3';

export async function OPTIONS(req: Request) {
    return addCorsHeaders(req, new NextResponse(null, { status: 200 }));
}

export async function GET(req: Request) {
    try {
        const { tenant } = await getCurrentUserAndTenant();
        if (!tenant) return addCorsHeaders(req, NextResponse.json({ error: 'Não autorizado' }, { status: 401 }));

        const { searchParams } = new URL(req.url);
        const seuNumero = searchParams.get('seu_numero') || searchParams.get('seuNumero');

        if (!seuNumero) return addCorsHeaders(req, NextResponse.json({ error: 'seu_numero ausente' }, { status: 400 }));

        const { data: charge } = await supabaseAdmin
            .from('finance')
            .select('*')
            .eq('metadata->>seu_numero', seuNumero)
            .maybeSingle();

        if (!charge) return addCorsHeaders(req, NextResponse.json({ ready: false }));

        let isReady = charge.metadata?.nosso_numero && charge.metadata.nosso_numero !== 'PENDING';
        if (charge.metadata?.method === 'pix_inter' && charge.metadata?.pix_payload) isReady = true;

        if (!isReady) {
            const cert = (process.env.INTER_CERT_CONTENT || '').replace(/\\n/g, '\n');
            const key = (process.env.INTER_KEY_CONTENT || '').replace(/\\n/g, '\n');

            if (process.env.INTER_CLIENT_ID && cert && key) {
                const inter = new InterAPIV3({
                    clientId: process.env.INTER_CLIENT_ID,
                    clientSecret: process.env.INTER_CLIENT_SECRET || '',
                    cert, key
                });

                try {
                    const now = new Date();
                    const dInit = new Date(now); dInit.setDate(dInit.getDate() - 1);
                    const dEnd = new Date(now); dEnd.setDate(dEnd.getDate() + 1);

                    const response = await inter.listBillings(dInit.toISOString().split('T')[0], dEnd.toISOString().split('T')[0]);
                    const items = response.cobrancas || response.content || [];

                    const found = items.find((it: any) => it.seuNumero === seuNumero);
                    if (found) {
                        const meta = {
                            ...charge.metadata,
                            nosso_numero: found.nossoNumero || found.cobranca?.nossoNumero,
                            codigo_barras: found.codigoBarras || found.boleto?.codigoBarras,
                            linha_digitavel: found.linhaDigitavel || found.boleto?.linhaDigitavel,
                            pix_payload: found.pixCopiaECola || found.pix?.pixCopiaECola,
                            txid: found.txid || found.pix?.txid || found.codigoSolicitacao
                        };
                        await supabaseAdmin.from('finance').update({ metadata: meta }).eq('id', charge.id);
                        charge.metadata = meta;
                        isReady = true;
                    }
                } catch (e) {
                    console.error('[POLLING ERROR]', e);
                }
            }
        }

        if (isReady) {
            const isPix = charge.metadata.method === 'pix_inter';
            const pdfUrl = `/api/checkout/inter-boleto/pdf?nossoNumero=${charge.metadata.nosso_numero}&codigoSolicitacao=${charge.metadata.txid || ''}`;

            return addCorsHeaders(req, NextResponse.json({
                ready: true,
                type: isPix ? 'pix' : 'boleto',
                payload: isPix ? {
                    pixPayload: charge.metadata.pix_payload,
                    amount: charge.value,
                    expiresAt: charge.metadata.expires_at || new Date().toISOString()
                } : {
                    nossoNumero: charge.metadata.nosso_numero,
                    codigoBarras: charge.metadata.codigo_barras,
                    linhaDigitavel: charge.metadata.linha_digitavel,
                    pdfUrl
                }
            }));
        }

        return addCorsHeaders(req, NextResponse.json({ ready: false }));

    } catch (error: any) {
        return addCorsHeaders(req, NextResponse.json({ error: error.message }, { status: 500 }));
    }
}
