import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { getCurrentUserAndTenant } from '@/app/lib/utils';
import { generatePixPayload } from '@/app/lib/pix';

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

        // 5. Se for Pix, gerar payload REAL
        let pixResponse = null;
        if (payment_method === 'pix') {
            // Buscar chaves do tenant
            const { data: tenantInfo } = await client
                .from('tenants')
                .select('pix_key, name, bank_account_holder')
                .eq('id', tenant.id)
                .single();

            if (tenantInfo?.pix_key) {
                const merchantName = tenantInfo.bank_account_holder || tenantInfo.name;
                // Gerar payload QRCPS (BR Code)
                const copyText = generatePixPayload(
                    tenantInfo.pix_key,
                    merchantName,
                    'BRASIL', // Cidade (pode vir do banco depois, por enquanto BRASIL funciona na maioria)
                    totalAmount,
                    sale.id.replace(/-/g, '').substring(0, 25) // TxId (max 25)
                );

                pixResponse = {
                    copyText: copyText,
                    qrBase64: null // Frontend gera o QR visualmente
                };
            } else {
                pixResponse = {
                    copyText: '',
                    warning: 'Chave PIX não configurada. Vá em Configurações para adicionar.'
                };
            }
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
