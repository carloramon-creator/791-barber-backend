import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { getCurrentUserAndTenant, assertPlanAtLeast } from '@/app/lib/utils';
import { Plan } from '@/app/lib/types';

export async function GET() {
    try {
        const { tenant, roles } = await getCurrentUserAndTenant();
        assertPlanAtLeast(tenant.plan as Plan, 'premium');

        if (!roles.includes('owner') && !roles.includes('staff')) {
            return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
        }

        // Fetch movements with product info
        const { data: movements, error } = await supabaseAdmin
            .from('product_movements')
            .select(`
                *,
                products (
                    name,
                    price
                )
            `)
            .eq('tenant_id', tenant.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        return NextResponse.json(movements);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const { tenant, roles } = await getCurrentUserAndTenant();
        assertPlanAtLeast(tenant.plan as Plan, 'premium');

        if (!roles.includes('owner') && !roles.includes('staff')) {
            return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
        }

        const { product_id, type, quantity, cost_price, description } = await req.json();

        if (!product_id || !type || !quantity) {
            return NextResponse.json({ error: 'Campos obrigatórios ausentes' }, { status: 400 });
        }

        // 1. Get current product to update stock
        const { data: product, error: productError } = await supabaseAdmin
            .from('products')
            .select('stock_quantity, price')
            .eq('id', product_id)
            .eq('tenant_id', tenant.id)
            .single();

        if (productError) {
            console.error('[BACKEND] Inventory POST Product Lookup Error:', productError);
            if (productError.code === 'PGRST116') {
                return NextResponse.json({ error: 'Produto não encontrado para este estabelecimento' }, { status: 404 });
            }
            return NextResponse.json({ error: `Erro ao buscar produto: ${productError.message}` }, { status: 500 });
        }

        if (!product) {
            return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 });
        }

        const newQuantity = type === 'entry'
            ? (product.stock_quantity || 0) + quantity
            : (product.stock_quantity || 0) - quantity;

        if (newQuantity < 0) throw new Error('Estoque insuficiente');

        // 2. Insert movement
        const { data: movement, error: movementError } = await supabaseAdmin
            .from('product_movements')
            .insert({
                tenant_id: tenant.id,
                product_id,
                type,
                quantity,
                cost_price: type === 'entry' ? cost_price : null,
                price: type === 'exit' ? product.price : null,
                description
            })
            .select()
            .single();

        if (movementError) throw movementError;

        // 3. Update product stock and optionally cost_price
        const updates: any = { stock_quantity: newQuantity };
        if (type === 'entry' && cost_price) {
            updates.cost_price = cost_price;
        }

        await supabaseAdmin
            .from('products')
            .update(updates)
            .eq('id', product_id);

        return NextResponse.json(movement);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
