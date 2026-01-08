import { NextResponse } from 'next/server';
import { getCurrentUserAndTenant, addCorsHeaders } from '@/app/lib/utils';
import { supabaseAdmin } from '@/app/lib/supabase';

export async function OPTIONS(req: Request) {
    return addCorsHeaders(req, new NextResponse(null, { status: 200 }));
}

export async function GET(req: Request) {
    try {
        const { tenant } = await getCurrentUserAndTenant();
        if (!tenant) return addCorsHeaders(req, NextResponse.json({ error: 'Não autorizado' }, { status: 401 }));

        const { searchParams } = new URL(req.url);
        const seuNumero = searchParams.get('seuNumero');

        if (!seuNumero) {
            return addCorsHeaders(req, NextResponse.json({ error: 'seuNumero ausente' }, { status: 400 }));
        }

        // Busca o registro no financeiro que coincida com o seuNumero e o tenant_id (segurança)
        const { data: charge, error } = await supabaseAdmin
            .from('finance')
            .select('*')
            .eq('metadata->>seu_numero', seuNumero)
            .eq('metadata->>tenant_id', tenant.id)
            .maybeSingle();

        if (error) throw error;

        // Se o registro mudou de "PENDING" para um Nosso Número real, significa que o banco processou.
        let isReady = charge && charge.metadata?.nosso_numero !== 'PENDING' && charge.metadata?.nosso_numero !== undefined;

        if (!isReady && charge) {
            console.log('[POLLING] Checking Inter for PENDING record...');
            const cert = (process.env.INTER_CERT_CONTENT || '').replace(/\\n/g, '\n');
            const key = (process.env.INTER_KEY_CONTENT || '').replace(/\\n/g, '\n');
            if (process.env.INTER_CLIENT_ID && cert && key) {
                const { InterAPIV3 } = require('@/app/lib/inter-api-v3');
                const inter = new InterAPIV3({ clientId: process.env.INTER_CLIENT_ID, clientSecret: process.env.INTER_CLIENT_SECRET || '', cert, key });
                const now = new Date();
                const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
                const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
                try {
                    const token = await inter.getAccessToken();
                    const path = `/cobranca/v3/cobrancas?seuNumero=${seuNumero}&dataInicial=${yesterday.toISOString().split('T')[0]}&dataFinal=${tomorrow.toISOString().split('T')[0]}`;
                    const response = await inter.makeRequest({ hostname: 'cdpj.partners.bancointer.com.br', port: 443, path, method: 'GET', headers: { 'Authorization': `Bearer ${token}` }, cert, key, rejectUnauthorized: false, family: 4 });
                    const cobrancas = response.cobrancas || response.content || [];
                    if (Array.isArray(cobrancas) && cobrancas.length > 0) {
                        const info = cobrancas[0];
                        if (info.nossoNumero) {
                            const updatedMetadata = { ...charge.metadata, nosso_numero: info.nossoNumero, codigo_barras: info.codigoBarras, linha_digitavel: info.linhaDigitavel };
                            await supabaseAdmin.from('finance').update({ metadata: updatedMetadata }).eq('id', charge.id);
                            charge.metadata = updatedMetadata;
                            isReady = true;
                        }
                    }
                } catch (e) { console.error('[POLLING INTER CHECK ERROR]', e); }
            }
        }

        if (isReady) {
            const isPix = charge.metadata.method === 'pix_inter';

            return addCorsHeaders(req, NextResponse.json({
                ready: true,
                type: isPix ? 'pix' : 'boleto',
                payload: isPix ? {
                    pixPayload: charge.metadata.pix_payload,
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
        console.error('[POLLING CHECK ERROR]', error);
        return addCorsHeaders(req, NextResponse.json({ error: error.message }, { status: 500 }));
    }
}
