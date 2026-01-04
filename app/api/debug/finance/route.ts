import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { getCurrentUserAndTenant } from '@/app/lib/utils';

/**
 * Diagnostic endpoint to check finance records
 */
export async function GET() {
    try {
        const { tenant } = await getCurrentUserAndTenant();

        // Get ALL finance records (ignore tenant filter)
        const { data: allFinance, error: allError } = await supabaseAdmin
            .from('finance')
            .select('id, tenant_id, type, description, value, date, is_paid')
            .order('created_at', { ascending: false })
            .limit(50);

        // Get finance records for this tenant
        const { data: tenantFinance, error: tenantError } = await supabaseAdmin
            .from('finance')
            .select('id, tenant_id, type, description, value, date, is_paid')
            .eq('tenant_id', tenant.id)
            .order('created_at', { ascending: false });

        // Get finance records without tenant_id
        const { data: orphanFinance, error: orphanError } = await supabaseAdmin
            .from('finance')
            .select('id, tenant_id, type, description, value, date, is_paid')
            .is('tenant_id', null);

        // Get product movements
        const { data: movements, error: movError } = await supabaseAdmin
            .from('product_movements')
            .select('id, tenant_id, product_id, type, quantity')
            .eq('tenant_id', tenant.id)
            .limit(20);

        const { data: orphanMovements } = await supabaseAdmin
            .from('product_movements')
            .select('id, tenant_id, product_id, type, quantity')
            .is('tenant_id', null)
            .limit(20);

        return NextResponse.json({
            tenant_id: tenant.id,
            all_finance_count: allFinance?.length || 0,
            tenant_finance_count: tenantFinance?.length || 0,
            orphan_finance_count: orphanFinance?.length || 0,
            tenant_movements_count: movements?.length || 0,
            orphan_movements_count: orphanMovements?.length || 0,
            sample_all_finance: allFinance?.slice(0, 3),
            sample_tenant_finance: tenantFinance?.slice(0, 3),
            sample_orphan_finance: orphanFinance?.slice(0, 3),
            sample_movements: movements?.slice(0, 3),
            sample_orphan_movements: orphanMovements?.slice(0, 3),
            errors: {
                allError: allError?.message,
                tenantError: tenantError?.message,
                orphanError: orphanError?.message,
                movError: movError?.message
            }
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
