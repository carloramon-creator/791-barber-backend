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
        const seuNumero = searchParams.get('seuNumero');

        if (!seuNumero) return addCorsHeaders(req, NextResponse.json({ error: 'seuNumero ausente' }, { status: 400 }));

        const { data: charge } = await supabaseAdmin
            .from('finance')
            .select('*')
            .eq('metadata->>seu_numero', seuNumero)
            .maybeSingle();

        if (!charge) return addCorsHeaders(req, NextResponse.json({ ready: false }));

        let isReady = charge.metadata?.nosso_numero && charge.metadata.nosso_numero !== 'PENDING';

        if (!isReady) {
            const cert = (process.env.INTER_CERT_CONTENT || '').replace(/\\n/g, '\n');
            const key = (process.env.INTER_KEY_CONTENT || '').replace(/\\n/g, '\n');

            if (process.env.INTER_CLIENT_ID && cert && key) {
                const inter = new InterAPIV3({
                    clientId: process.env.INTER_CLIENT_ID,
                    clientSecret: process.env.INTER_CLIENT_SECRET || '',
                    cert, key
                });

                const now = new Date();
                const dInit = new Date(now); dInit.setDate(dInit.getDate() - 1);
                const dEnd = new Date(now); dEnd.setDate(dEnd.getDate() + 1);

                try {
                    const token = await inter.getAccessToken();
                    const path = `/cobranca/v3/cobrancas?seuNumero=${seuNumero}&dataInicial=${dInit.toISOString().split('T')[0]}&dataFinal=${dEnd.toISOString().split('T')[0]}`;

                    const response = await inter.makeRequest({
                        hostname: 'cdpj.partners.bancointer.com.br',
                        port: 443,
                        path, method: 'GET',
                        headers: { 'Authorization': `Bearer ${token}` },
                        cert, key, rejectUnauthorized: false, family: 4
                    });

                    const items = response.cobrancas || response.content || [];
                    if (Array.isArray(items) && items.length > 0) {
                        const item = items[0];
                        if (item.nossoNumero) {
                            const meta = { ...charge.metadata, nosso_numero: item.nossoNumero, codigo_barras: item.codigoBarras, linha_digitavel: item.linhaDigitavel };
                            await supabaseAdmin.from('finance').update({ metadata: meta }).eq('id', charge.id);
                            charge.metadata = meta;
                            isReady = true;
                        }
                    }
                } catch (e) {
                    console.error('[POLLING ERROR]', e);
                }
            }
        }

        if (isReady) {
            const isPix = charge.metadata.method === 'pix_inter';
            return addCorsHeaders(req, NextResponse.json({
                ready: true,
                type: isPix ? 'pix' : 'boleto',
                payload: isPix ? {
                    pixPayload: charge.metadata.pix_payload || charge.metadata.linha_digitavel,
                    amount: charge.value,
                    expiresAt: charge.metadata.expires_at
                } : {
                    nossoNumero: charge.metadata.nosso_numero,
                    codigoBarras: charge.metadata.codigo_barras,
                    linhaDigitavel: charge.metadata.linha_digitavel,
                    pdfUrl: `https://api.791barber.com/api/checkout/inter-boleto/pdf?nossoNumero=${charge.metadata.nosso_numero}`
                }
            }));
        }

        return addCorsHeaders(req, NextResponse.json({ ready: false }));

    } catch (error: any) {
        return addCorsHeaders(req, NextResponse.json({ error: error.message }, { status: 500 }));
    }
}
