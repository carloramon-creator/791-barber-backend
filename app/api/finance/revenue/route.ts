import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { getCurrentUserAndTenant, assertPlanAtLeast } from '@/app/lib/utils';

/**
 * Registro manual de receita (apenas Plano Completo).
 */
export async function POST(req: Request) {
    try {
        const { tenant } = await getCurrentUserAndTenant();
        assertPlanAtLeast(tenant.plan, 'complete');

        const { value, description, date } = await req.json();
        const client = await supabase();

        const { data, error } = await client
            .from('finance')
            .insert({
                tenant_id: tenant.id,
                type: 'revenue',
                value,
                description,
                date: date || new Date().toISOString().split('T')[0]
            })
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
