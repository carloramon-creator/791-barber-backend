import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { addCorsHeaders } from '@/app/lib/utils';

export async function OPTIONS(req: Request) {
    const response = new NextResponse(null, { status: 200 });
    return addCorsHeaders(req, response);
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { name, email, password, barbershopName } = body;

        console.log('[API SIGNUP] Email:', email, 'Barbershop:', barbershopName);

        if (!name || !email || !password || !barbershopName) {
            const response = NextResponse.json(
                { error: 'Nome, e-mail, senha e barbearia são obrigatórios' },
                { status: 400 }
            );
            return addCorsHeaders(req, response);
        }

        // 1. Criar usuário no Auth
        const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: email,
            password: password,
            email_confirm: true,
            user_metadata: { name }
        });

        if (authError) {
            console.error('[API SIGNUP] Auth error:', authError.message);
            const response = NextResponse.json(
                { error: 'E-mail já cadastrado (Auth)' },
                { status: 400 }
            );
            return addCorsHeaders(req, response);
        }

        const userId = authUser.user.id;
        console.log('[API SIGNUP] Usuário criado:', userId);

        const trialEndsAt = new Date();
        trialEndsAt.setDate(trialEndsAt.getDate() + 7);

        // 2. Criar tenant (Barbearia) com plano PREMIUM e período de trial
        // ADAPTATION: Merged barbershop creation into tenant creation
        const { data: tenant, error: tenantError } = await supabaseAdmin
            .from('tenants')
            .insert({
                name: barbershopName,
                plan: 'premium',
                subscription_status: 'trial',
                subscription_current_period_end: trialEndsAt.toISOString()
            })
            .select()
            .single();

        if (tenantError) {
            console.error('[API SIGNUP] Tenant error:', tenantError);
            // Clean up auth user if tenant fails? Ideally yes, but keeping it simple for now.
            throw tenantError;
        }
        console.log('[API SIGNUP] Tenant criado:', tenant.id);

        // 3. Criar usuário em public.users vinculado ao tenant
        const { error: userError } = await supabaseAdmin
            .from('users')
            .insert({
                id: userId,
                name,
                email,
                tenant_id: tenant.id,
                role: 'owner'
            });

        if (userError) {
            console.error('[API SIGNUP] Public User error:', userError);
            throw userError;
        }

        // 4. Criar trial subscription (7 dias)
        // ADAPTATION: Using tenant_id instead of barbershop_id
        const { error: trialError } = await supabaseAdmin
            .from('trial_subscriptions')
            .insert({
                user_id: userId,
                tenant_id: tenant.id,
                trial_ends_at: trialEndsAt.toISOString()
            });

        if (trialError) {
            console.error('[API SIGNUP] Trial error:', trialError);
            throw trialError;
        }
        console.log('[API SIGNUP] Trial subscription criado');

        const response = NextResponse.json({
            success: true,
            userId,
            tenantId: tenant.id
        }, { status: 201 });
        return addCorsHeaders(req, response);
    } catch (error: any) {
        console.error('[API SIGNUP] Erro:', error.message);
        const response = NextResponse.json(
            { error: error.message },
            { status: 400 }
        );
        return addCorsHeaders(req, response);
    }
}
