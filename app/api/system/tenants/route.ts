import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { getCurrentUserAndTenant } from '@/app/lib/utils';

export async function GET(req: Request) {
    try {
        const { isSystemAdmin } = await getCurrentUserAndTenant();
        if (!isSystemAdmin) {
            return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
        }

        // Buscar todos os tenants e seus usuários
        const { data: tenants, error: tenantsError } = await supabaseAdmin
            .from('tenants')
            .select(`
                *,
                users(*)
            `);

        if (tenantsError) throw tenantsError;

        // Processar para identificar o dono (owner) e adicionar estatísticas
        const tenantsWithStats = await Promise.all(tenants.map(async (tenant: any) => {
            const owner = tenant.users?.find((u: any) => u.role === 'owner') || tenant.users?.[0];
            const { data: stats } = await supabaseAdmin.rpc('get_tenant_stats', { tenant_uuid: tenant.id });

            return {
                ...tenant,
                owner: owner ? [owner] : [], // Manter formato de array para compatibilidade com o frontend
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
