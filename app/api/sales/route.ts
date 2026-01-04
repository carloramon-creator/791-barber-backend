import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { getCurrentUserAndTenant } from '@/app/lib/utils';

/**
 * Lista todas as vendas do tenant.
 */
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { tenant } = await getCurrentUserAndTenant();

        const { data: sales, error } = await supabaseAdmin
            .from('sales')
            .select(`
                *,
                barbers (
                    name
                ),
                client_queue (
                    client_name
                )
            `)
            .eq('tenant_id', tenant.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Fetch sale_items separately to avoid polymorphic join issues
        if (sales && sales.length > 0) {
            const saleIds = sales.map(s => s.id);
            const { data: items } = await supabaseAdmin
                .from('sale_items')
                .select('*')
                .in('sale_id', saleIds);

            // Fetch products and services
            const productIds = items?.filter(i => i.item_type === 'product').map(i => i.item_id) || [];
            const serviceIds = items?.filter(i => i.item_type === 'service').map(i => i.item_id) || [];

            const [productsData, servicesData] = await Promise.all([
                productIds.length > 0
                    ? supabaseAdmin.from('products').select('id, name').in('id', productIds)
                    : Promise.resolve({ data: [] }),
                serviceIds.length > 0
                    ? supabaseAdmin.from('services').select('id, name').in('id', serviceIds)
                    : Promise.resolve({ data: [] })
            ]);

            const productsMap = new Map(productsData.data?.map(p => [p.id, p]) || []);
            const servicesMap = new Map(servicesData.data?.map(s => [s.id, s]) || []);

            // Attach items to sales with resolved names
            for (const sale of sales) {
                const saleItems = items?.filter(i => i.sale_id === sale.id) || [];
                sale.sale_items = saleItems.map(item => ({
                    ...item,
                    products: item.item_type === 'product' ? productsMap.get(item.item_id) : null,
                    services: item.item_type === 'service' ? servicesMap.get(item.item_id) : null
                }));
            }
        }

        return NextResponse.json(sales || []);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
