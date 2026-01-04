import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { getCurrentUserAndTenant } from '@/app/lib/utils';

export async function GET(req: Request) {
    try {
        const { tenant } = await getCurrentUserAndTenant();
        const { searchParams } = new URL(req.url);
        const start = searchParams.get('start');
        const end = searchParams.get('end');

        let query = supabaseAdmin
            .from('product_movements')
            .select('*, products(name)')
            .eq('tenant_id', tenant.id)
            .order('created_at', { ascending: false });

        if (start) query = query.gte('created_at', dateToStartISO(start));
        if (end) query = query.lte('created_at', dateToEndISO(end));

        const { data, error } = await query;

        if (error) throw error;

        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

function dateToStartISO(date: string) {
    return new Date(`${date}T00:00:00`).toISOString();
}
function dateToEndISO(date: string) {
    return new Date(`${date}T23:59:59.999`).toISOString();
}
