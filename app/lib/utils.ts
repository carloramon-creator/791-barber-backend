import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from './supabase';
import { Plan } from './types';

export async function getCurrentUserAndTenant() {
    try {
        console.log('[BACKEND] getCurrentUserAndTenant start');

        let userAuthId: string | null = null;

        // 1. Tentar pegar via standard client (mais robusto para token/cookies)
        const client = await supabase();
        const { data: { user }, error: authError } = await client.auth.getUser();

        if (!authError && user) {
            userAuthId = user.id;
            console.log('[BACKEND] User validado via standard client. ID:', user.id);
        } else {
            console.warn('[BACKEND] Falha na validação via client standard:', authError?.message);

            // Fallback manual se o standard falhar por algum motivo de header
            const headersList = await headers();
            const authHeader = headersList.get('authorization');
            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.substring(7);
                const { data: { user: adminUser }, error: adminError } = await supabaseAdmin.auth.getUser(token);
                if (!adminError && adminUser) {
                    userAuthId = adminUser.id;
                    console.log('[BACKEND] User validado via fallback admin. ID:', adminUser.id);
                }
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

        // 3. Atualizar last_seen_at (presença) em background
        supabaseAdmin.from('users').update({ last_seen_at: new Date() }).eq('id', userAuthId).then(({ error }) => {
            if (error) console.error('[PRESENCE UPDATE ERROR]', error.message);
        });

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
        const finalUser = { id: userAuthId };

        return {
            user: finalUser,
            tenant,
            role: userData.role, // Mantendo por compatibilidade temporária
            roles: userData.roles || [userData.role], // Novo padrão
            isSystemAdmin: userData.is_system_admin || false
        };
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

export function checkRolePermission(userRoles: string | string[], action: 'view_finance' | 'manage_users' | 'manage_plan' | 'manage_all_queues' | 'edit_barbershop') {
    const roles = Array.isArray(userRoles) ? userRoles : [userRoles];

    const permissions: Record<string, string[]> = {
        owner: ['view_finance', 'manage_users', 'manage_plan', 'manage_all_queues', 'edit_barbershop'],
        staff: ['manage_all_queues', 'edit_barbershop'],
        barber: []
    };

    const hasPermission = roles.some(role => {
        const allowedActions = permissions[role] || [];
        return allowedActions.includes(action);
    });

    if (!hasPermission) {
        throw new Error('Você não tem permissão para realizar esta ação.');
    }
}

export async function getDynamicBarberAverages(tenantId: string): Promise<Record<string, number>> {
    try {
        // Busca os últimos 50 serviços finalizados do tenant para calcular a média real
        const { data: recentServices, error } = await supabaseAdmin
            .from('client_queue')
            .select('barber_id, started_at, finished_at')
            .eq('tenant_id', tenantId)
            .eq('status', 'finished')
            .not('started_at', 'is', null)
            .not('finished_at', 'is', null)
            .order('finished_at', { ascending: false })
            .limit(50);

        if (error || !recentServices) return {};

        const groupings: Record<string, number[]> = {};
        recentServices.forEach(s => {
            if (s.started_at && s.finished_at) {
                const start = new Date(s.started_at).getTime();
                const finish = new Date(s.finished_at).getTime();
                const duration = (finish - start) / 60000;

                // Ignorar durações irreais (menos de 2min ou mais de 3h)
                if (duration >= 2 && duration <= 180) {
                    if (!groupings[s.barber_id]) groupings[s.barber_id] = [];
                    groupings[s.barber_id].push(duration);
                }
            }
        });

        const averages: Record<string, number> = {};
        Object.keys(groupings).forEach(barberId => {
            const durations = groupings[barberId];
            const sum = durations.reduce((acc, d) => acc + d, 0);
            averages[barberId] = Math.round(sum / durations.length);
        });

        return averages;
    } catch (e) {
        console.error('[DYNAMIC METRICS ERROR]', e);
        return {};
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

    // Permissive CORS for debugging, but still respecting credentials
    if (origin) {
        response.headers.set('Access-Control-Allow-Origin', origin);
    } else {
        response.headers.set('Access-Control-Allow-Origin', '*');
    }

    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    return response;
}
