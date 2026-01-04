import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { getCurrentUserAndTenant } from '@/app/lib/utils';

export async function POST() {
    try {
        const { tenant } = await getCurrentUserAndTenant();

        // 1. Fix Missing Tenant IDs (Backfill)
        // Ideally we would update where tenant_id is null, but we need to know WHICH tenant to assign.
        // For this repair script, we assume the current user's tenant is the target for orphans.

        const tables = ['users', 'barbers', 'sales', 'finance', 'product_movements', 'services', 'products'];
        const results: any = {};

        for (const table of tables) {
            const { count, error } = await supabaseAdmin
                .from(table)
                .update({ tenant_id: tenant.id })
                .is('tenant_id', null)
                .select('*', { count: 'exact', head: true });

            if (!error) {
                results[table] = count;
            } else {
                results[table] = error.message;
            }
        }

        // 2. Fix Zero Commissions
        // Fetch all sales with 0 commission
        const { data: salesErrorSales } = await supabaseAdmin
            .from('sales')
            .select('id, total_amount, barber_id')
            .or('commission_value.is.null,commission_value.eq.0');

        let fixedCommissions = 0;

        if (salesErrorSales && salesErrorSales.length > 0) {
            // Get all barbers map
            const { data: barbers } = await supabaseAdmin.from('barbers').select('id, commission_percentage');
            const barberMap = new Map(barbers?.map(b => [b.id, b.commission_percentage]) || []);

            for (const sale of salesErrorSales) {
                if (sale.barber_id && barberMap.has(sale.barber_id)) {
                    const rate = barberMap.get(sale.barber_id) || 0;
                    const newComm = (sale.total_amount * rate) / 100;

                    if (newComm > 0) {
                        await supabaseAdmin
                            .from('sales')
                            .update({ commission_value: newComm })
                            .eq('id', sale.id);
                        fixedCommissions++;
                    }
                }
            }
        }

        // 3. Fix Barber Status 'unknown' or null -> 'offline'
        const { count: statusFixed } = await supabaseAdmin
            .from('barbers')
            .update({ status: 'offline' })
            .is('status', null)
            .select('*', { count: 'exact', head: true });

        return NextResponse.json({
            success: true,
            tenant_backfill: results,
            commissions_recalculated: fixedCommissions,
            status_fixed: statusFixed
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
