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
        let trialDays = 0;
        let couponApplied = null;
        let stripeCouponId = undefined;

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
            trialDays = couponData.trial_days ? Number(couponData.trial_days) : 0;
            const discountPercent = couponData.discount_percent ? Number(couponData.discount_percent) : 0;
            const discountValue = couponData.discount_value ? Number(couponData.discount_value) : 0;

            // Generate/Find Stripe Coupon
            try {
                // Remove special chars for ID safety
                const cleanCode = couponApplied.replace(/[^a-zA-Z0-9]/g, '');
                const uniqueCouponId = `COUPON_${cleanCode}_${discountPercent || discountValue}`; // Improved ID format

                try {
                    const existing = await stripe.coupons.retrieve(uniqueCouponId);
                    stripeCouponId = existing.id;
                } catch (e) {
                    if (discountPercent > 0) {
                        const newC = await stripe.coupons.create({
                            id: uniqueCouponId,
                            percent_off: discountPercent,
                            duration: 'forever',
                            name: `Desconto ${couponApplied}`,
                        });
                        stripeCouponId = newC.id;
                    } else if (discountValue > 0) {
                        const newC = await stripe.coupons.create({
                            id: uniqueCouponId,
                            amount_off: Math.round(discountValue * 100),
                            currency: 'brl',
                            duration: 'forever',
                            name: `Desconto ${couponApplied}`,
                        });
                        stripeCouponId = newC.id;
                    }
                }
            } catch (err) {
                console.error('Error handling stripe coupon', err);
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

        // 2.5 Ensure Customer has Address and Tax ID (Required for Boleto)
        // We update this every time to ensure it's fresh
        const doc = (tenant.cnpj || tenant.cpf || tenant.cpf_cnpj || '').replace(/\D/g, '');

        try {
            await stripe.customers.update(customerId, {
                name: tenant.name,
                address: {
                    line1: tenant.street || tenant.address_street || 'Endereço não informado',
                    city: tenant.city || tenant.address_city || 'Cidade',
                    state: tenant.state || tenant.address_state || 'SC',
                    postal_code: tenant.zip || tenant.address_zip || '88000000',
                    country: 'BR',
                },
                shipping: {
                    name: tenant.name,
                    address: {
                        line1: tenant.street || tenant.address_street || 'Endereço não informado',
                        city: tenant.city || tenant.address_city || 'Cidade',
                        state: tenant.state || tenant.address_state || 'SC',
                        postal_code: tenant.zip || tenant.address_zip || '88000000',
                        country: 'BR',
                    }
                },
                metadata: {
                    tax_id: doc // Storing in metadata as hint, real tax_id requires API complexity sometimes
                }
            });
        } catch (updateError) {
            console.log('Erro ao atualizar endereço do cliente Stripe:', updateError);
        }

        // 3. Criar Checkout Session Dinâmica
        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            payment_method_types: ['card', 'boleto'],
            billing_address_collection: 'required',
            phone_number_collection: { enabled: true },
            line_items: [
                {
                    price_data: {
                        currency: 'brl',
                        product_data: {
                            name: `791 Barber - Plano ${plan.charAt(0).toUpperCase() + plan.slice(1)}`,
                            description: 'Assinatura Mensal da Plataforma',
                        },
                        unit_amount: Math.round(baseAmount * 100),
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
                coupon: couponApplied || 'none'
            },
            subscription_data: {
                metadata: {
                    tenant_id: tenant.id,
                    plan: plan,
                },
                ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
                ...(stripeCouponId ? { discounts: [{ coupon: stripeCouponId }] } : {}),
            },
        });

        console.log('[STRIPE CHECKOUT] Session Criada:', session.id, 'Coupon:', stripeCouponId);

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
