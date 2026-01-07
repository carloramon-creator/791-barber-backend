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

        // 1. Validar e Calcular Valor com Cupom
        let baseAmount = PLAN_BASE_PRICES[plan];
        let finalAmount = baseAmount;
        let trialDays = 0;
        let couponApplied = null;

        let couponData: any = null;

        if (coupon && coupon.trim() !== '') {
            const { data } = await supabaseAdmin
                .from('system_coupons')
                .select('*')
                .eq('code', coupon.trim().toUpperCase())
                .eq('is_active', true)
                .single();

            couponData = data;

            if (!couponData) {
                return addCorsHeaders(req,
                    NextResponse.json({ error: 'Cupom inválido ou expirado' }, { status: 400 })
                );
            }

            couponApplied = couponData.code;
            const discountPercent = couponData.discount_percent ? Number(couponData.discount_percent) : 0;
            const discountValue = couponData.discount_value ? Number(couponData.discount_value) : 0;
            trialDays = couponData.trial_days ? Number(couponData.trial_days) : 0;

            if (discountPercent > 0) {
                finalAmount = baseAmount * (1 - discountPercent / 100);
            } else if (discountValue > 0) {
                finalAmount = Math.max(0, baseAmount - discountValue);
            }

            console.log(`[STRIPE CHECKOUT] Cupom ${couponApplied} aplicado. Valor final: R$${finalAmount}`);
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

        // Create Stripe Coupon if applicable
        let stripeCouponId = undefined;

        if (couponApplied) {
            try {
                // Determine if percentage or amount off
                const couponParams: any = {
                    duration: 'once', // or 'repeating' if you want it monthly
                    name: `Cupom ${couponApplied}`,
                };

                const discountPercent = couponData.discount_percent ? Number(couponData.discount_percent) : 0;
                const discountValue = couponData.discount_value ? Number(couponData.discount_value) : 0;

                // Check if coupon already exists in Stripe to avoid duplication (optional, avoiding for simplicity now)
                // For simplicity, we create a new one-time coupon each time or use a standard naming convention
                // Better approach: Create a unique ID based on the coupon code
                const uniqueCouponId = `COUPON-${couponApplied}-${discountPercent || discountValue}`;

                try {
                    const existingCoupon = await stripe.coupons.retrieve(uniqueCouponId);
                    stripeCouponId = existingCoupon.id;
                } catch (e) {
                    // Create if not exists
                    if (discountPercent > 0) {
                        const newCoupon = await stripe.coupons.create({
                            id: uniqueCouponId,
                            percent_off: discountPercent,
                            duration: 'forever', // Apply to subscription forever? Or 'once'? Usually subscriptions want 'forever' or 'repeating'
                            name: `Desconto ${couponApplied}`,
                        });
                        stripeCouponId = newCoupon.id;
                    } else if (discountValue > 0) {
                        const newCoupon = await stripe.coupons.create({
                            id: uniqueCouponId,
                            amount_off: Math.round(discountValue * 100),
                            currency: 'brl',
                            duration: 'forever',
                            name: `Desconto ${couponApplied}`,
                        });
                        stripeCouponId = newCoupon.id;
                    }
                }
            } catch (couponError) {
                console.error('[STRIPE CHECKOUT] Erro ao criar cupom no Stripe:', couponError);
                // Fallback to manual price modification if coupon creation fails is risky with subscriptions
            }
        }

        // 3. Criar Checkout Session Dinâmica
        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'brl',
                        product_data: {
                            name: `791 Barber - Plano ${plan.charAt(0).toUpperCase() + plan.slice(1)}`,
                            description: 'Assinatura Mensal da Plataforma',
                        },
                        unit_amount: Math.round(baseAmount * 100), // Use Full Price
                        recurring: {
                            interval: 'month',
                        },
                    },
                    quantity: 1,
                },
            ],
            mode: 'subscription',
            ...(stripeCouponId ? { discounts: [{ coupon: stripeCouponId }] } : {}),
            success_url: `${process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://791barber.com'}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://791barber.com'}/checkout/cancel`,
            metadata: {
                tenant_id: tenant.id,
                plan: plan,
                coupon: couponApplied || 'none'
            },
            subscription_data: {
                metadata: {
                    tenant_id: tenant.id,
                    plan: plan,
                    coupon: couponApplied || 'none'
                },
                ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
            },
        });

        console.log('[STRIPE CHECKOUT] Session Criada:', session.id, 'Metadata Coupon:', couponApplied);

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
