import { NextResponse } from 'next/server';
import { stripe, STRIPE_PRICE_IDS, StripePlan } from '@/app/lib/stripe';
import { getCurrentUserAndTenant, addCorsHeaders } from '@/app/lib/utils';
import { supabaseAdmin } from '@/app/lib/supabase';

export async function OPTIONS(req: Request) {
    const response = new NextResponse(null, { status: 200 });
    return addCorsHeaders(req, response);
}

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
        const { plan } = body as { plan: StripePlan };

        if (!plan || !(plan in STRIPE_PRICE_IDS)) {
            return addCorsHeaders(req,
                NextResponse.json({ error: 'Plano inválido' }, { status: 400 })
            );
        }

        const priceId = STRIPE_PRICE_IDS[plan];

        // Buscar ou criar Customer no Stripe
        let customerId = tenant.stripe_customer_id;

        if (!customerId) {
            // Get user email from supabase users table
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

            // Salvar customer_id no banco
            await supabaseAdmin
                .from('tenants')
                .update({ stripe_customer_id: customerId })
                .eq('id', tenant.id);
        }

        // Criar Checkout Session
        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            payment_method_types: ['card'],
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            mode: 'subscription',
            success_url: `${process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3003'}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3003'}/checkout/cancel`,
            metadata: {
                tenant_id: tenant.id,
                plan: plan,
            },
            subscription_data: {
                metadata: {
                    tenant_id: tenant.id,
                    plan: plan,
                },
            },
        });

        console.log('[STRIPE CHECKOUT] Session criada:', session.id);

        const response = NextResponse.json({
            sessionId: session.id,
            url: session.url,
        });
        return addCorsHeaders(req, response);

    } catch (error: any) {
        console.error('[STRIPE CHECKOUT] Erro:', error);
        const response = NextResponse.json(
            { error: error.message || 'Erro ao criar sessão de checkout' },
            { status: 500 }
        );
        return addCorsHeaders(req, response);
    }
}
