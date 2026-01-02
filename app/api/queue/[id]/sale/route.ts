import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { getCurrentUserAndTenant, assertPlanAtLeast } from '@/app/lib/utils';

/**
 * Cria uma venda vinculada a um atendimento na fila.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id: queueId } = await params;
    try {
        const { tenant, role } = await getCurrentUserAndTenant();
        assertPlanAtLeast(tenant.plan, 'intermediate');

        const { services, products, payment_method } = await req.json();
        const client = await supabase();

        // 1. Calcular o total buscando os preços no banco
        let total = 0;

        if (services && services.length > 0) {
            const serviceIds = services.map((s: any) => s.id);
            const { data: dbServices } = await client.from('services').select('id, price').in('id', serviceIds);
            services.forEach((s: any) => {
                const dbS = dbServices?.find(d => d.id === s.id);
                if (dbS) total += dbS.price * (s.qty || 1);
            });
        }

        if (products && products.length > 0) {
            const productIds = products.map((p: any) => p.id);
            const { data: dbProducts } = await client.from('products').select('id, price').in('id', productIds);
            products.forEach((p: any) => {
                const dbP = dbProducts?.find(d => d.id === p.id);
                if (dbP) total += dbP.price * (p.qty || 1);
            });
        }

        // 2. Lógica de PIX
        let pixData = null;
        if (payment_method === 'pix') {
            // Chamar a lógica interna ou fazer fetch no próprio endpoint
            // Aqui vamos chamar a lógica de PIX diretamente por simplicidade (ou simular)
            const res = await fetch(`${new URL(req.url).origin}/api/pix/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value: total, description: `Fila: ${queueId}` })
            });
            pixData = await res.json();
        }

        // 3. Salvar venda
        const { data: sale, error: saleError } = await client
            .from('sales')
            .insert({
                tenant_id: tenant.id,
                client_queue_id: queueId,
                services,
                products,
                total,
                payment_method,
                pix_payload: pixData?.payload || null,
                paid: payment_method !== 'pix' // PIX começa como não pago até confirmação (webhook ou manual)
            })
            .select()
            .single();

        if (saleError) throw saleError;

        // 4. Se plano Complete e já pago (não pix), registrar no financeiro
        if (tenant.plan === 'complete' && sale.paid) {
            await client.from('finance').insert({
                tenant_id: tenant.id,
                type: 'revenue',
                value: total,
                description: `Venda Ref: ${sale.id}`
            });
        }

        return NextResponse.json({
            sale,
            pix: pixData
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
