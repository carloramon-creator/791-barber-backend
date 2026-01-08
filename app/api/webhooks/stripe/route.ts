import { NextResponse } from 'next/server';
import { stripe } from '@/app/lib/stripe';
import { supabaseAdmin } from '@/app/lib/supabase';
import Stripe from 'stripe';

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

export async function POST(req: Request) {
    const body = await req.text();
    const signature = req.headers.get('stripe-signature');

    if (!signature) {
        console.error('[STRIPE WEBHOOK] Sem assinatura');
        return NextResponse.json({ error: 'Sem assinatura' }, { status: 400 });
    }

    let event: Stripe.Event;

    try {
        // Verificar assinatura do webhook
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err: any) {
        console.error('[STRIPE WEBHOOK] Erro de assinatura:', err.message);
        return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
    }

    console.log('[STRIPE WEBHOOK] Evento recebido:', event.type);

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object as Stripe.Checkout.Session;
                await handleCheckoutCompleted(session);
                break;
            }

            case 'customer.subscription.created':
            case 'customer.subscription.updated': {
                const subscription = event.data.object as Stripe.Subscription;
                await handleSubscriptionChange(subscription);
                break;
            }

            case 'customer.subscription.deleted': {
                const subscription = event.data.object as Stripe.Subscription;
                await handleSubscriptionDeleted(subscription);
                break;
            }

            case 'invoice.payment_failed': {
                const invoice = event.data.object as Stripe.Invoice;
                await handlePaymentFailed(invoice);
                break;
            }

            case 'invoice.payment_succeeded': {
                const invoice = event.data.object as Stripe.Invoice;
                await handleInvoicePaymentSucceeded(invoice);
                break;
            }

            default:
                console.log('[STRIPE WEBHOOK] Evento não tratado:', event.type);
        }

        return NextResponse.json({ received: true });
    } catch (error: any) {
        console.error('[STRIPE WEBHOOK] Erro ao processar:', error);
        return NextResponse.json(
            { error: 'Erro ao processar webhook' },
            { status: 500 }
        );
    }
}

// Função para tratar checkout completado (primeira assinatura)
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const tenantId = session.metadata?.tenant_id;
    const plan = session.metadata?.plan;
    const couponId = session.metadata?.coupon_id;

    if (!tenantId || !plan) {
        console.error('[STRIPE] Metadata faltando no checkout:', session.id);
        return;
    }

    console.log('[STRIPE] Checkout completado para tenant:', tenantId);

    // Atualizar tenant com informações da assinatura
    await supabaseAdmin
        .from('tenants')
        .update({
            plan: plan,
            stripe_customer_id: session.customer as string,
            subscription_status: 'active',
        })
        .eq('id', tenantId);

    // Marcar trial como convertido
    await supabaseAdmin
        .from('trial_subscriptions')
        .update({ status: 'converted' })
        .eq('tenant_id', tenantId)
        .eq('status', 'active');

    console.log('[STRIPE] Tenant atualizado:', tenantId);

    // Registrar uso do cupom, se aplicável
    if (couponId && couponId !== 'null') {
        try {
            // Calcular desconto aplicado
            const totalDiscount = session.total_details?.amount_discount || 0;
            const discountApplied = totalDiscount / 100; // Converter de centavos para reais

            // Registrar uso do cupom
            await supabaseAdmin
                .from('system_coupon_usage')
                .insert({
                    coupon_id: couponId,
                    tenant_id: tenantId,
                    stripe_session_id: session.id,
                    stripe_subscription_id: session.subscription as string,
                    plan: plan,
                    discount_applied: discountApplied
                });

            // Incrementar contador de usos
            await supabaseAdmin.rpc('increment_coupon_usage', { coupon_uuid: couponId });

            console.log('[STRIPE] Uso do cupom registrado:', couponId);
        } catch (error) {
            console.error('[STRIPE] Erro ao registrar uso do cupom:', error);
        }
    }

    // Registrar faturamento no financeiro global (SaaS)
    // APENAS SE o valor for maior que zero (para evitar duplicidade com invoice.payment_succeeded em pagamentos futuros)
    const amount = session.amount_total ? session.amount_total / 100 : 0;
    if (amount > 0) {
        // Verifica se já não foi registrado pelo invoice.payment_succeeded (corrida de eventos)
        // Mas como checkout.session.completed geralmente chega antes ou é o gatilho principal para primeira compra, mantemos.
        // O ideal é usar payment_intent ou invoice ID para deduplicar.
        await supabaseAdmin
            .from('finance')
            .insert({
                tenant_id: null,
                type: 'revenue',
                value: amount,
                description: `Assinatura SaaS - Plano ${plan} (Stripe - Checkout)`,
                date: new Date().toISOString().split('T')[0],
                is_paid: true,
                metadata: {
                    stripe_session_id: session.id,
                    stripe_customer_id: session.customer
                }
            });
    }
}

// Função para tratar pagamentos recorrentes (renovações e fim de trial)
async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
    const customerId = invoice.customer as string;
    const amount = invoice.amount_paid / 100; // Converter centavos para reais
    const subscriptionId = (invoice as any).subscription as string;

    if (amount <= 0) return; // Ignorar faturas zeradas (trials)

    console.log('[STRIPE] Fatura paga:', invoice.id, 'Valor:', amount);

    // Buscar tenant pelo customer_id
    const { data: tenant } = await supabaseAdmin
        .from('tenants')
        .select('id, plan, name')
        .eq('stripe_customer_id', customerId)
        .single();

    if (!tenant) {
        console.error('[STRIPE] Tenant não encontrado para customer:', customerId);
        return;
    }

    // Registrar receita
    // Nota: Pode haver duplicidade com checkout.session.completed na primeira compra se não tratarmos.
    // Mas geralmente invoice.payment_succeeded ocorre para renovações.
    // Se for a primeira compra, o billing_reason é 'subscription_create'.
    if (invoice.billing_reason === 'subscription_create') {
        console.log('[STRIPE] Fatura de criação de assinatura - evitando duplicidade com checkout');
        return;
    }

    await supabaseAdmin
        .from('finance')
        .insert({
            tenant_id: null,
            type: 'revenue',
            value: amount,
            description: `Renovação SaaS - Plano ${tenant.plan} (Stripe)`,
            date: new Date().toISOString().split('T')[0],
            is_paid: true,
            metadata: {
                stripe_invoice_id: invoice.id,
                stripe_subscription_id: subscriptionId,
                stripe_customer_id: customerId
            }
        });

    // Atualizar status para active caso estivesse past_due
    await supabaseAdmin
        .from('tenants')
        .update({ subscription_status: 'active' })
        .eq('id', tenant.id);

    console.log('[STRIPE] Receita recorrente registrada para:', tenant.name);
}

async function handleSubscriptionChange(subscription: Stripe.Subscription) {
    const tenantId = subscription.metadata?.tenant_id;
    const plan = subscription.metadata?.plan;

    if (!tenantId) {
        console.error('[STRIPE] Tenant ID faltando na subscription:', subscription.id);
        return;
    }

    console.log('[STRIPE] Subscription atualizada:', subscription.id, 'Status:', subscription.status);

    const periodEnd = (subscription as any).current_period_end;

    await supabaseAdmin
        .from('tenants')
        .update({
            stripe_subscription_id: subscription.id,
            subscription_status: subscription.status, // active, past_due, canceled, etc
            subscription_current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
            ...(plan && { plan }),
        })
        .eq('id', tenantId);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    const tenantId = subscription.metadata?.tenant_id;

    if (!tenantId) {
        console.error('[STRIPE] Tenant ID faltando na subscription cancelada:', subscription.id);
        return;
    }

    console.log('[STRIPE] Subscription cancelada:', subscription.id);

    await supabaseAdmin
        .from('tenants')
        .update({
            subscription_status: 'canceled',
            plan: 'basic', // Downgrade para basic ao cancelar
        })
        .eq('id', tenantId);
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
    const customerId = invoice.customer as string;

    if (!customerId) return;

    console.log('[STRIPE] Pagamento falhou para customer:', customerId);

    // Buscar tenant por customer_id
    const { data: tenant } = await supabaseAdmin
        .from('tenants')
        .select('id')
        .eq('stripe_customer_id', customerId)
        .single();

    if (tenant) {
        await supabaseAdmin
            .from('tenants')
            .update({ subscription_status: 'past_due' })
            .eq('id', tenant.id);

        console.log('[STRIPE] Tenant marcado como past_due:', tenant.id);
    }
}
