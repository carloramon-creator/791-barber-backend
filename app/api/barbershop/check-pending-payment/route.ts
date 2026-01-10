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
            // 1. Configurar Inter - Buscar do DB primeiro
            const { data: settingsData } = await supabaseAdmin
                .from('system_settings')
                .select('value')
                .eq('key', 'inter_config')
                .single();

            const dbConfig = settingsData?.value;
            const clientId = dbConfig?.client_id || process.env.INTER_CLIENT_ID;
            const certRaw = dbConfig?.crt || process.env.INTER_CERT_CONTENT || '';
            const keyRaw = dbConfig?.key || process.env.INTER_KEY_CONTENT || '';
            const cert = certRaw.replace(/\\n/g, '\n');
            const key = keyRaw.replace(/\\n/g, '\n');

            if (clientId && cert && key) {
                const inter = new InterAPIV3({
                    clientId,
                    clientSecret: dbConfig?.client_secret || process.env.INTER_CLIENT_SECRET || '',
                    cert, key
                });

                try {
                    const today = new Date().toISOString().split('T')[0];
                    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                    const response = await inter.listBillings(yesterday, today);
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
                    console.error('[POLLING INTER ERROR]', e);
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
                    expiresAt: charge.metadata.expires_at || new Date().toISOString(),
                    pdfUrl
                } : {
                    nossoNumero: charge.metadata.nosso_numero,
                    codigoBarras: charge.metadata.codigo_barras,
                    linhaDigitavel: charge.metadata.linha_digitavel,
                    amount: charge.value,
                    pdfUrl
                }
            }));
        }

        return addCorsHeaders(req, NextResponse.json({ ready: false }));

    } catch (error: any) {
        return addCorsHeaders(req, NextResponse.json({ error: error.message }, { status: 500 }));
    }
}
