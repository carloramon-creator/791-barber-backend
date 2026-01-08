import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';

/**
 * Endpoint para receber notificações de Pix e Boleto (Cobranca) do Banco Inter V3.
 * Doc: https://developers.bancointer.com.br/v4/reference/webhook
 */
export async function POST(req: Request) {
    try {
        const body = await req.json();
        console.log('[INTER WEBHOOK] Recebido:', JSON.stringify(body));

        const notifications = Array.isArray(body) ? body : [body];
        let processedCount = 0;

        for (const notif of notifications) {
            // --- 1. Payload PIX ---
            // Ex: [{ "pix": [ { "txid": "...", "valor": "..." } ] }]
            if (notif.pix) {
                const pixList = Array.isArray(notif.pix) ? notif.pix : [notif.pix];
                for (const pix of pixList) {
                    if (!pix.txid) continue;
                    console.log(`[INTER WEBHOOK] Processando PIX txid=${pix.txid}, valor=${pix.valor}`);
                    await processPayment({
                        identifier: pix.txid,
                        identifierType: 'txid',
                        amount: pix.valor,
                        paidAt: pix.horario,
                        raw: pix
                    });
                    processedCount++;
                }
            }
            // --- 2. Payload Cobrança/Boleto (V3) ---
            // Geralmente campos na raiz como "nossoNumero", "seuNumero", "situacao": "PAGO"
            else if (notif.nossoNumero) {
                console.log(`[INTER WEBHOOK] Processando Cobrança nossoNumero=${notif.nossoNumero}, seuNumero=${notif.seuNumero}`);
                await processPayment({
                    identifier: notif.nossoNumero,
                    identifierType: 'nosso_numero',
                    secondaryIdentifier: notif.seuNumero, // Backup importantíssimo (seu_numero)
                    amount: notif.valorNominal || 0,
                    paidAt: notif.dataHoraSituacao || new Date().toISOString(),
                    raw: notif
                });
                processedCount++;
            }
        }

        return NextResponse.json({ success: true, processed: processedCount });
    } catch (error: any) {
        console.error('[INTER WEBHOOK ERROR]', error);
        // O Inter exige que retornemos 200, senão eles ficam tentando reenviar.
        return NextResponse.json({ error: error.message }, { status: 200 });
    }
}

async function processPayment(params: { identifier: string, identifierType: 'txid' | 'nosso_numero', secondaryIdentifier?: string, amount: string | number, paidAt: string, raw: any }) {
    console.log(`[INTER WEBHOOK] Buscando registro financeiro... Identifier: ${params.identifier} (${params.identifierType})`);

    // Busca na tabela FINANCE (SaaS)
    // 1. Tenta pelo identificador principal (txid ou nosso_numero)
    let { data: charge } = await supabaseAdmin
        .from('finance')
        .select('*')
        .eq('is_paid', false) // Otimização: buscar apenas não pagos primeiro
        .eq(`metadata->>${params.identifierType}`, params.identifier)
        .maybeSingle();

    // 2. Se não achou e tem secundário (seu_numero), tenta por ele
    if (!charge && params.secondaryIdentifier) {
        console.log(`[INTER WEBHOOK] Tentando buscar backup por seu_numero: ${params.secondaryIdentifier}`);
        const { data: chargeSecondary } = await supabaseAdmin
            .from('finance')
            .select('*')
            .eq('is_paid', false)
            .eq(`metadata->>seu_numero`, params.secondaryIdentifier)
            .maybeSingle();
        charge = chargeSecondary;
    }

    // 3. Verifica se já não foi pago anteriormente (caso tenhamos removido filtro is_paid acima para debug)
    if (!charge) {
        // Tenta buscar mesmo se já pago, só pra logar
        const { data: alreadyPaid } = await supabaseAdmin
            .from('finance')
            .select('*')
            // OR logic manual via application code or simpler query
            .eq(`metadata->>${params.identifierType}`, params.identifier)
            .maybeSingle();

        if (alreadyPaid && alreadyPaid.is_paid) {
            console.log('[INTER WEBHOOK] Pagamento já processado anteriormente. Ignorando.');
            return;
        }

        console.log(`[INTER WEBHOOK] Pagamento NÃO ENCONTRADO no sistema. Ignorando.`);
        return;
    }

    // Identificar Plano pela descrição
    // A descrição vem do checkout: "Boleto SaaS Pendente - Plano premium (Nome)"
    const description = charge.description || '';
    let plan = 'basic';
    if (description.toLowerCase().includes('premium')) plan = 'premium';
    else if (description.toLowerCase().includes('completo')) plan = 'complete';
    else if (description.toLowerCase().includes('básico') || description.toLowerCase().includes('basic')) plan = 'basic';

    const tenantId = charge.metadata?.tenant_id;
    console.log(`[INTER WEBHOOK] Encontrado! Atualizando Tenant ${tenantId} para Plano ${plan}`);

    try {
        if (tenantId) {
            // Liberar Tenant
            const periodEnd = new Date();
            periodEnd.setDate(periodEnd.getDate() + 31); // +31 dias de licença

            const { error: tenantError } = await supabaseAdmin
                .from('tenants')
                .update({
                    plan: plan,
                    subscription_status: 'active',
                    subscription_current_period_end: periodEnd.toISOString()
                })
                .eq('id', tenantId);

            if (tenantError) throw tenantError;
        }

        // Marcar Finance como Pago
        const { error: financeError } = await supabaseAdmin
            .from('finance')
            .update({
                is_paid: true,
                // Opcional: Atualizar data efetiva do pagamento se quiser
                // date: params.paidAt.split('T')[0] 
            })
            .eq('id', charge.id);

        if (financeError) throw financeError;

        console.log('[INTER WEBHOOK] Sucesso Absoluto! Tenant liberado e financeiro quitado.');
    } catch (err: any) {
        console.error('[INTER WEBHOOK] Erro ao atualizar banco de dados:', err);
        throw err;
    }
}

export async function GET() {
    return NextResponse.json({ status: 'ok', message: 'Inter Webhook V3 Ready' });
}
