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
        // Ou se o campo txid foi preenchido com algo real no pix.
        const isReady = charge && charge.metadata?.nosso_numero !== 'PENDING' && charge.metadata?.nosso_numero !== undefined;

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
