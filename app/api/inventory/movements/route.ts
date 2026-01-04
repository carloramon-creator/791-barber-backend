import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { getCurrentUserAndTenant } from '@/app/lib/utils';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { tenant } = await getCurrentUserAndTenant();
        const { searchParams } = new URL(req.url);
        const start = searchParams.get('start');
        const end = searchParams.get('end');

        let query = supabaseAdmin
            .from('product_movements')
            .select('*')
            .eq('tenant_id', tenant.id)
            .order('created_at', { ascending: false });

        if (start) query = query.gte('created_at', dateToStartISO(start));
        if (end) query = query.lte('created_at', dateToEndISO(end));

        const { data: movements, error } = await query;

        if (error) throw error;

        console.log('[MOVEMENTS API] Fetched movements:', movements?.length || 0);

        if (!movements || movements.length === 0) {
            return NextResponse.json([]);
        }

        // Fetch related products and users
        const productIds = [...new Set(movements.map(m => m.product_id).filter(Boolean))];
        const userIds = [...new Set(movements.map(m => m.user_id).filter(Boolean))];

        const [productsData, usersData] = await Promise.all([
            productIds.length > 0
                ? supabaseAdmin.from('products').select('id, name').in('id', productIds)
                : Promise.resolve({ data: [] }),
            userIds.length > 0
                ? supabaseAdmin.from('users').select('id, name').in('id', userIds)
                : Promise.resolve({ data: [] })
        ]);

        const productsMap = new Map(productsData.data?.map(p => [p.id, p]) || []);
        const usersMap = new Map(usersData.data?.map(u => [u.id, u]) || []);

        // Merge data
        const enrichedData = movements.map(m => ({
            ...m,
            products: m.product_id ? productsMap.get(m.product_id) : null,
            users: m.user_id ? usersMap.get(m.user_id) : null
        }));

        return NextResponse.json(enrichedData);
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
