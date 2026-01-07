import { NextResponse } from 'next/server';
import { getCurrentUserAndTenant, addCorsHeaders } from '@/app/lib/utils';
import { supabaseAdmin } from '@/app/lib/supabase';
import { getSystemInterClient } from '@/app/lib/inter-api';

export async function OPTIONS(req: Request) {
    const response = new NextResponse(null, { status: 200 });
    return addCorsHeaders(req, response);
}

const PLAN_PRICES: Record<string, number> = {
    basic: 49.00,
    complete: 99.00,
    premium: 169.00
};

export async function POST(req: Request) {
    try {
        const { tenant, user } = await getCurrentUserAndTenant();
        if (!tenant || !user) {
            return addCorsHeaders(req, NextResponse.json({ error: 'Não autenticado' }, { status: 401 }));
        }

        const { plan } = await req.json();
        const amount = PLAN_PRICES[plan];

        if (!amount) {
            return addCorsHeaders(req, NextResponse.json({ error: 'Plano inválido' }, { status: 400 }));
        }

        // 1. Get Inter Settings for SaaS
        const { data: setting } = await supabaseAdmin
            .from('system_settings')
            .select('*')
            .eq('key', 'inter_config')
            .single();

        if (!setting || !setting.value?.pix_key) {
            return addCorsHeaders(req, NextResponse.json({ error: 'Pagamento via Pix temporariamente indisponível (SaaS config missing)' }, { status: 500 }));
        }

        const inter = await getSystemInterClient();
        if (!inter) {
            return addCorsHeaders(req, NextResponse.json({ error: 'Erro ao conectar com Banco Inter' }, { status: 500 }));
        }

        // 2. Create Charge in Inter
        // txid must be between 26 and 35 chars for immediate charges in some contexts, but Inter allows UUID
        const txid = `SaaS${tenant.id.replace(/-/g, '').slice(0, 20)}${Date.now().toString().slice(-11)}`;

        const payload = {
            calendario: { expiracao: 3600 }, // 1 hour
            valor: { original: amount.toFixed(2) },
            chave: setting.value.pix_key,
            solicitacaoPagador: `Assinatura 791 Barber - Plano ${plan}`
        };

        const interCharge = await inter.createImmediateCharge(payload as any);

        // 3. Save to our database
        const { data: charge, error: chargeError } = await supabaseAdmin
            .from('saas_pix_charges')
            .insert({
                txid: interCharge.txid,
                tenant_id: tenant.id,
                plan: plan,
                amount: amount,
                pix_payload: interCharge.pixCopiaECola,
                expires_at: new Date(Date.now() + 3600 * 1000).toISOString()
            })
            .select()
            .single();

        if (chargeError) throw chargeError;

        const response = NextResponse.json({
            txid: charge.txid,
            pixPayload: charge.pix_payload,
            amount: charge.amount,
            expiresAt: charge.expires_at
        });

        return addCorsHeaders(req, response);
    } catch (error: any) {
        console.error('[SAAS PIX CHECKOUT ERROR]', error);
        return addCorsHeaders(req, NextResponse.json({ error: error.message }, { status: 500 }));
    }
}
