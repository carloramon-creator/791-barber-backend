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

        const inter = await getSystemInterClient();
        if (!inter) {
            return addCorsHeaders(req, NextResponse.json({ error: 'Erro ao conectar com Banco Inter' }, { status: 500 }));
        }

        // 1. Get User email and name for the boleto
        const { data: userProfile } = await supabaseAdmin
            .from('users')
            .select('email, name')
            .eq('id', user.id)
            .single();

        // 2. Create Billing (Boleto) in Inter
        // For Inter V3 Billing, we need more info but we'll use a simplified payload
        // Note: Real implementation would need to handle CPF/CNPJ if not available
        const payload = {
            numDiasAgendaRecebimento: 30,
            boleto: {
                // Simplified for this context
            },
            pagador: {
                cpfCnpj: "00000000000", // placeholder or get from tenant
                nome: userProfile?.name || tenant.name,
                tipoPessoa: "FISICA",
                email: userProfile?.email || "pagamento@791barber.com",
            },
            valorNominal: amount
        };

        // In a real scenario, we'd call inter.createBilling(payload)
        // Since we are simulating for now and explaining the process:
        // const interBoleto = await inter.createBilling(payload);

        return addCorsHeaders(req, NextResponse.json({
            success: true,
            message: 'Integração de Boleto Inter em andamento. CPFs e CNPJs são exigidos pelo Inter.'
        }));
    } catch (error: any) {
        console.error('[SAAS BOLETO CHECKOUT ERROR]', error);
        return addCorsHeaders(req, NextResponse.json({ error: error.message }, { status: 500 }));
    }
}
