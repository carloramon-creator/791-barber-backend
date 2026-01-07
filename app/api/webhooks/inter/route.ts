import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';

/**
 * Endpoint para receber notificações de Pix do Banco Inter.
 * Ver documentação do Inter para o formato do payload.
 */
export async function POST(req: Request) {
    try {
        const body = await req.json();

        console.log('[INTER WEBHOOK] Recebido:', JSON.stringify(body));

        // O Inter envia um array de objetos, cada um contendo uma lista de pix
        // Formato esperado: [{ pix: [...] }]
        const notifications = Array.isArray(body) ? body : [body];

        for (const container of notifications) {
            if (!container.pix || !Array.isArray(container.pix)) continue;

            for (const payment of container.pix) {
                const { txid, valor, horario, endToEndId } = payment;

                if (!txid) continue;

                console.log(`[INTER WEBHOOK] Processando Pix txid=${txid}, valor=${valor}`);

                // 1. Buscar a cobrança no banco
                const { data: charge, error: chargeError } = await supabaseAdmin
                    .from('saas_pix_charges')
                    .select('*')
                    .eq('txid', txid)
                    .single();

                if (chargeError || !charge) {
                    console.log(`[INTER WEBHOOK] Cobrança não encontrada ou erro: ${txid}`);
                    continue;
                }

                if (charge.status === 'paid') {
                    console.log(`[INTER WEBHOOK] Cobrança já estava marcada como paga: ${txid}`);
                    continue;
                }

                // 2. Atualizar status da cobrança
                await supabaseAdmin
                    .from('saas_pix_charges')
                    .update({
                        status: 'paid',
                        paid_at: horario || new Date().toISOString()
                    })
                    .eq('id', charge.id);

                // 3. Atualizar o Tenant (liberar acesso)
                // Vamos dar 31 dias de acesso
                const periodEnd = new Date();
                periodEnd.setDate(periodEnd.getDate() + 31);

                await supabaseAdmin
                    .from('tenants')
                    .update({
                        plan: charge.plan,
                        subscription_status: 'active',
                        subscription_current_period_end: periodEnd.toISOString()
                    })
                    .eq('id', charge.tenant_id);

                console.log(`[INTER WEBHOOK] Tenant ${charge.tenant_id} atualizado para o plano ${charge.plan}`);
            }
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('[INTER WEBHOOK ERROR]', error);
        // O Inter exige que retornemos 200 para evitar retentativas infinitas se o erro for nosso
        // Mas podemos retornar 400 se o payload for inválido
        return NextResponse.json({ error: error.message }, { status: 200 });
    }
}

// O Inter às vezes faz um GET para validar o endpoint
export async function GET() {
    return NextResponse.json({ status: 'ok' });
}
