import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { getCurrentUserAndTenant } from '@/app/lib/utils';

export async function GET(req: Request) {
    try {
        const { isSystemAdmin } = await getCurrentUserAndTenant();
        if (!isSystemAdmin) {
            return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
        }

        // Buscar todos os tenants
        const { data: tenants, error: tenantsError } = await supabaseAdmin
            .from('tenants')
            .select(`
                *,
                owner:users!inner(*)
            `)
            .eq('users.role', 'owner'); // Simplificação: assume que dono tem role owner e tenant_id

        if (tenantsError) throw tenantsError;

        // Para cada tenant, buscar as estatísticas via RPC ou query separada
        const tenantsWithStats = await Promise.all(tenants.map(async (tenant) => {
            const { data: stats } = await supabaseAdmin.rpc('get_tenant_stats', { tenant_uuid: tenant.id });

            return {
                ...tenant,
                stats: stats || {
                    total_attendances: 0,
                    total_users: 0,
                    total_sales: 0,
                    total_revenue: 0
                }
            };
        }));

        return NextResponse.json(tenantsWithStats);
    } catch (error: any) {
        console.error('[SYSTEM TENANTS GET] Error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
}
