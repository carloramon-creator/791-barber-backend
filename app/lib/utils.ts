import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from './supabase';
import { Plan } from './types';

export async function getCurrentUserAndTenant() {
    try {
        console.log('[BACKEND] getCurrentUserAndTenant start');

        let userAuthId: string | null = null;

        // 1. Tentar pegar token do Header (Authorization: Bearer <token>)
        const headersList = await headers();
        const authHeader = headersList.get('authorization');

        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            console.log('[BACKEND] Token encontrado no header Authorization');
            const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
            if (!authError && user) {
                userAuthId = user.id;
                console.log('[BACKEND] Token de header validado com sucesso. User:', user.id);
            } else {
                console.warn('[BACKEND] Token de header inválido ou expirado:', authError?.message);
            }
        }

        // 2. Se não achou no header, tentar cookies (fallback)
        if (!userAuthId) {
            console.log('[BACKEND] Header auth falhou ou ausente. Tentando cookies...');
            const cookieStore = await cookies();
            const allCookies = cookieStore.getAll();

            let sessionData: any = null;
            for (const cookie of allCookies) {
                if (cookie.name.includes('session') || cookie.name.includes('sb-')) {
                    try {
                        sessionData = JSON.parse(decodeURIComponent(cookie.value));
                        if (sessionData?.user?.id) {
                            console.log('[BACKEND] Sessão válida encontrada em cookie:', cookie.name);
                            break;
                        }
                    } catch (e) {
                        continue;
                    }
                }
            }

            if (sessionData && sessionData.user) {
                userAuthId = sessionData.user.id;
            } else {
                console.log('[BACKEND] Nenhuma sessão válida encontrada nos cookies.');
            }
        }

        if (!userAuthId) {
            console.error('[BACKEND] Falha total de autenticação (sem header válido, sem cookie válido)');
            throw new Error('Usuário não autenticado ou sessão expirada');
        }

        console.log('[BACKEND] User autenticado (final):', userAuthId);

        // Buscar dados do usuário (role e tenant_id)
        const { data: userData, error: userError } = await supabaseAdmin
            .from('users')
            .select('*')
            .eq('id', userAuthId)
            .single();

        if (userError || !userData) {
            console.error('[BACKEND] User profile lookup failed:', userError?.message);
            throw new Error('Perfil de usuário não encontrado');
        }

        // Buscar dados da barbearia (todos os campos com *)
        const { data: tenant, error: tenantError } = await supabaseAdmin
            .from('tenants')
            .select('*')
            .eq('id', userData.tenant_id)
            .single();

        if (tenantError || !tenant) {
            console.error('[BACKEND] Tenant not found:', tenantError?.message);
            throw new Error('Barbearia não vinculada ao seu usuário');
        }

        console.log('[BACKEND] Tenant found:', tenant.name, 'Plan:', tenant.plan);
        const user = { id: userAuthId };

        return { user, tenant, role: userData.role };
    } catch (e: any) {
        console.error('[BACKEND] Critical error in getCurrentUserAndTenant:', e.message);
        throw e;
    }
}

export function assertPlanAtLeast(currentPlan: Plan, requiredPlan: Plan) {
    const order: Plan[] = ['trial', 'basic', 'complete', 'premium'];

    // Trial has access to everything for testing
    if (currentPlan === 'trial') return;

    if (order.indexOf(currentPlan) < order.indexOf(requiredPlan)) {
        throw new Error(`Seu plano atual (${currentPlan}) não permite esta funcionalidade. Faça upgrade para o plano ${requiredPlan}.`);
    }
}

export function checkRolePermission(role: string, action: 'view_finance' | 'manage_users' | 'manage_plan' | 'manage_all_queues' | 'edit_barbershop') {
    const permissions: Record<string, string[]> = {
        owner: ['view_finance', 'manage_users', 'manage_plan', 'manage_all_queues', 'edit_barbershop'],
        staff: ['manage_all_queues', 'edit_barbershop'],
        barber: []
    };

    const allowedActions = permissions[role] || [];
    if (!allowedActions.includes(action)) {
        throw new Error('Você não tem permissão para realizar esta ação.');
    }
}

export function getStatusColor(status: string) {
    switch (status) {
        case 'waiting': return 'yellow';
        case 'attending': return 'green';
        case 'finished': return 'gray';
        case 'cancelled': return 'red';
        default: return 'gray';
    }
}

export function addCorsHeaders(req: Request, response: NextResponse) {
    const origin = req.headers.get('origin');

    const isAllowed = origin && (
        origin.endsWith('791barber.com') ||
        origin.endsWith('vercel.app') ||
        origin.startsWith('http://localhost')
    );

    if (isAllowed) {
        response.headers.set('Access-Control-Allow-Origin', origin!);
    } else {
        response.headers.set('Access-Control-Allow-Origin', 'https://791barber.com');
    }

    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    return response;
}
