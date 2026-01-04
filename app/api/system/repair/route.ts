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
            const { data, error } = await supabaseAdmin
                .from(table)
                .update({ tenant_id: tenant.id })
                .is('tenant_id', null)
                .select();

            if (!error) {
                results[table] = data?.length || 0;
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
            const { data: barbers } = await supabaseAdmin.from('barbers').select('id, user_id');
            const barberUserMap = new Map(barbers?.map(b => [b.id, b.user_id]) || []);

            // Get commission rates from users
            const { data: users } = await supabaseAdmin.from('users').select('id, commission_value, commission_type');
            const userCommissionMap = new Map(users?.map(u => [u.id, { rate: u.commission_value || 50, type: u.commission_type || 'percentage' }]) || []);

            for (const sale of salesErrorSales) {
                if (sale.barber_id && barberUserMap.has(sale.barber_id)) {
                    const userId = barberUserMap.get(sale.barber_id);
                    const commissionInfo = userCommissionMap.get(userId!);

                    if (commissionInfo) {
                        // Calculate services total for this sale
                        const { data: saleItems } = await supabaseAdmin
                            .from('sale_items')
                            .select('item_type, price, quantity')
                            .eq('sale_id', sale.id);

                        const servicesTotal = saleItems
                            ?.filter(item => item.item_type === 'service')
                            .reduce((sum, item) => sum + (item.price * item.quantity), 0) || 0;

                        let newComm = 0;
                        if (commissionInfo.type === 'percentage') {
                            newComm = (servicesTotal * commissionInfo.rate) / 100;
                        } else {
                            newComm = commissionInfo.rate;
                        }

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
        }

        // 3. Fix Barber Status 'unknown' or null -> 'offline'
        const { data: statusData } = await supabaseAdmin
            .from('barbers')
            .update({ status: 'offline' })
            .is('status', null)
            .select();

        return NextResponse.json({
            success: true,
            tenant_backfill: results,
            commissions_recalculated: fixedCommissions,
            status_fixed: statusData?.length || 0
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
