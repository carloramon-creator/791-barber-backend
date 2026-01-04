import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { getCurrentUserAndTenant } from '@/app/lib/utils';

/**
 * Cria uma venda para um items items da fila.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id: queueId } = await params;
    try {
        const { tenant, role, user } = await getCurrentUserAndTenant();
        if (role !== 'owner' && role !== 'barber') {
            return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
        }

        const body = await req.json();
        const { services, products, payment_method } = body;

        // Usar supabaseAdmin para garantir a inserção sem bloqueio de RLS
        const client = supabaseAdmin;

        // 1. Buscar info da fila (e validar tenant)
        const { data: queueItem, error: fetchError } = await client
            .from('client_queue')
            .select('id, barber_id, client_id, tenant_id') // Adicionado tenant_id
            .eq('id', queueId)
            .single();

        if (fetchError || !queueItem) return NextResponse.json({ error: 'Atendimento não encontrado' }, { status: 404 });

        // SEGURANÇA: Validar Tenant
        if (queueItem.tenant_id !== tenant.id) {
            return NextResponse.json({ error: 'Acesso não autorizado a este recurso.' }, { status: 403 });
        }

        // 2. Calcular total
        let totalAmount = 0;
        const salesItems: any[] = [];

        // Processar Serviços
        if (services && services.length > 0) {
            const { data: dbServices } = await client
                .from('services')
                .select('id, price, name') // name para log se precisar
                .in('id', services.map((s: any) => s.id));

            if (dbServices) {
                for (const s of services) {
                    const dbService = dbServices.find((ds: any) => ds.id === s.id);
                    if (dbService) {
                        const price = Number(dbService.price);
                        totalAmount += price * s.qty;
                        salesItems.push({
                            item_type: 'service',
                            item_id: s.id,
                            quantity: s.qty,
                            price: price
                        });
                    }
                }
            }
        }

        // Processar Produtos (com verificação de estoque simples, se houver lógica futura)
        if (products && products.length > 0) {
            const { data: dbProducts } = await client
                .from('products')
                .select('id, price, name')
                .in('id', products.map((p: any) => p.id));

            if (dbProducts) {
                for (const p of products) {
                    const dbProduct = dbProducts.find((dp: any) => dp.id === p.id);
                    if (dbProduct) {
                        const price = Number(dbProduct.price);
                        totalAmount += price * p.qty;
                        salesItems.push({
                            item_type: 'product',
                            item_id: p.id,
                            quantity: p.qty,
                            price: price
                        });
                    }
                }
            }
        }

        // 3. Criar Venda (Sale)
        const { data: sale, error: saleError } = await client
            .from('sales')
            .insert({
                tenant_id: tenant.id,
                client_queue_id: queueId, // Adicionado campo obrigatório
                barber_id: queueItem.barber_id,
                client_id: queueItem.client_id,
                total_amount: totalAmount,
                payment_method,
                status: 'completed',
                created_by: user.id
            })
            .select()
            .single();

        if (saleError) throw saleError;

        // 4. Criar Itens da Venda (Sale Items)
        if (salesItems.length > 0) {
            const itemsToInsert = salesItems.map(item => ({
                tenant_id: tenant.id,
                sale_id: sale.id,
                ...item
            }));

            const { error: itemsError } = await client
                .from('sale_items')
                .insert(itemsToInsert);

            if (itemsError) throw itemsError;
        }

        // 5. Se for Pix, gerar payload (mock ou real)
        let pixResponse = null;
        if (payment_method === 'pix') {
            // Exemplo simples Mock
            pixResponse = {
                copyText: `00020126360014BR.GOV.BCB.PIX0114+5511999999999520400005303986540${totalAmount.toFixed(2).replace('.', '')}5802BR5913Barbearia 7916008BRASILIA62070503***6304ABCD`,
                qrBase64: null
            };
        }

        return NextResponse.json({
            message: 'Venda registrada com sucesso',
            saleId: sale.id,
            pix: pixResponse
        });

    } catch (error: any) {
        console.error('[CREATE_SALE_ERROR]', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
