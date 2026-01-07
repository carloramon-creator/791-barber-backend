import { NextResponse } from 'next/server';
import { stripe, StripePlan } from '@/app/lib/stripe';
import { getCurrentUserAndTenant, addCorsHeaders } from '@/app/lib/utils';
import { supabaseAdmin } from '@/app/lib/supabase';

export async function OPTIONS(req: Request) {
    const response = new NextResponse(null, { status: 200 });
    return addCorsHeaders(req, response);
}

const PLAN_BASE_PRICES: Record<string, number> = {
    basic: 49.00,
    complete: 99.00,
    premium: 169.00
};

export async function POST(req: Request) {
    try {
        // Autenticação
        const { tenant, user } = await getCurrentUserAndTenant();

        if (!tenant || !user) {
            return addCorsHeaders(req,
                NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
            );
        }

        // Parse do body
        const body = await req.json();
        const { plan, coupon } = body as { plan: StripePlan; coupon?: string };

        if (!plan || !PLAN_BASE_PRICES[plan]) {
            return addCorsHeaders(req,
                NextResponse.json({ error: 'Plano inválido' }, { status: 400 })
            );
        }

        // 1. Calcular Valor com Desconto (Lógica Própria)
        let baseAmount = PLAN_BASE_PRICES[plan];
        let finalAmount = baseAmount;
        let trialDays = 0;

        if (coupon) {
            const { data: couponData } = await supabaseAdmin
                .from('system_coupons')
                .select('*')
                .eq('code', coupon.trim().toUpperCase())
                .eq('is_active', true)
                .single();

            if (couponData) {
                const discountPercent = couponData.discount_percent ? Number(couponData.discount_percent) : 0;
                const discountValue = couponData.discount_value ? Number(couponData.discount_value) : 0;
                trialDays = couponData.trial_days ? Number(couponData.trial_days) : 0;

                if (discountPercent > 0) {
                    finalAmount = baseAmount * (1 - discountPercent / 100);
                } else if (discountValue > 0) {
                    finalAmount = Math.max(0, baseAmount - discountValue);
                }

                console.log(`[STRIPE CHECKOUT] Dinâmico - Plano: ${plan}, Valor Base: R$${baseAmount}, Final: R$${finalAmount}, Trial: ${trialDays}d`);
            }
        }

        // 2. Buscar ou criar Customer no Stripe
        let customerId = tenant.stripe_customer_id;

        if (!customerId) {
            const { data: userProfile } = await supabaseAdmin
                .from('users')
                .select('email, name')
                .eq('id', user.id)
                .single();

            const customer = await stripe.customers.create({
                email: userProfile?.email || `user-${user.id}@791barber.com`,
                name: userProfile?.name || tenant.name,
                metadata: {
                    tenant_id: tenant.id,
                    user_id: user.id,
                },
            });
            customerId = customer.id;

            await supabaseAdmin
                .from('tenants')
                .update({ stripe_customer_id: customerId })
                .eq('id', tenant.id);
        }

        // 3. Criar Checkout Session ÚNICA (Sem depender de IDs de produtos no Dashboard)
        // Usamos price_data para mandar o valor, recorrência e nome na hora.
        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            payment_method_types: ['card', 'boleto'],
            line_items: [
                {
                    price_data: {
                        currency: 'brl',
                        product_data: {
                            name: `791 Barber - Plano ${plan.charAt(0).toUpperCase() + plan.slice(1)}`,
                            description: coupon ? `Cupom ${coupon.toUpperCase()} aplicado` : 'Assinatura Mensal da Plataforma',
                        },
                        unit_amount: Math.round(finalAmount * 100), // Converte para centavos
                        recurring: {
                            interval: 'month',
                        },
                    },
                    quantity: 1,
                },
            ],
            mode: 'subscription',
            success_url: `${process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://791barber.com'}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://791barber.com'}/checkout/cancel`,
            metadata: {
                tenant_id: tenant.id,
                plan: plan,
            },
            subscription_data: {
                metadata: {
                    tenant_id: tenant.id,
                    plan: plan,
                },
                ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
            },
        });

        console.log('[STRIPE CHECKOUT] Session Dinâmica criada:', session.id, 'Valor:', finalAmount);

        const response = NextResponse.json({
            sessionId: session.id,
            url: session.url,
        });
        return addCorsHeaders(req, response);

    } catch (error: any) {
        console.error('[STRIPE CHECKOUT ERROR]', error);
        const response = NextResponse.json(
            { error: error.message || 'Erro ao criar sessão de checkout' },
            { status: 500 }
        );
        return addCorsHeaders(req, response);
    }
}
