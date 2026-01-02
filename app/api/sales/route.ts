import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { getCurrentUserAndTenant } from '@/app/lib/utils';

/**
 * Lista todas as vendas do tenant.
 */
export async function GET() {
    try {
        const { tenant } = await getCurrentUserAndTenant();

        const { data: sales, error } = await supabaseAdmin
            .from('sales')
            .select('*')
            .eq('tenant_id', tenant.id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return NextResponse.json(sales || []);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
