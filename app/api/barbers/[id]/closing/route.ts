import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { getCurrentUserAndTenant } from '@/app/lib/utils';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const { tenant, role } = await getCurrentUserAndTenant();

    if (role !== 'owner' && role !== 'staff') {
        return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const { data: sales, error } = await supabaseAdmin
        .from('sales')
        .select(`
            *,
            client_queue (client_name)
        `)
        .eq('tenant_id', tenant.id)
        .eq('barber_id', id)
        .eq('barber_commission_paid', false)
        .eq('status', 'completed');

    if (error) throw error;

    return NextResponse.json(sales);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id: barberId } = await params;
        const { tenant, role } = await getCurrentUserAndTenant();
        if (role !== 'owner') return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

        const body = await req.json(); // { saleIds: string[], totalCommission: number, bonus?: number }

        console.log('[CLOSING] Received body:', body);
        console.log('[CLOSING] Barber ID:', barberId);
        console.log('[CLOSING] Tenant ID:', tenant.id);

        // 1. Create a finance record (expense) FIRST to get the ID
        const { data: financeData, error: financeError } = await supabaseAdmin
            .from('finance')
            .insert({
                tenant_id: tenant.id,
                barber_id: barberId,
                type: 'expense',
                description: `Fechamento Barbeiro - ID ${barberId.slice(0, 8)}`,
                value: body.totalCommission + (body.bonus || 0),
                date: new Date().toISOString().split('T')[0],
                is_paid: false
            })
            .select()
            .single();

        if (financeError) {
            console.error('[CLOSING] Finance error:', financeError);
            throw financeError;
        }

        console.log('[CLOSING] Finance created:', financeData.id);

        // 2. Mark sales as paid and link to finance record (ONLY if there are sales)
        if (body.saleIds && body.saleIds.length > 0) {
            const { error: updateError } = await supabaseAdmin
                .from('sales')
                .update({
                    barber_commission_paid: true,
                    finance_id: financeData.id // Save the link for reversion
                })
                .in('id', body.saleIds)
                .eq('tenant_id', tenant.id);

            if (updateError) {
                console.error('[CLOSING] Sales update error:', updateError);
                // Rollback finance if sales update fails
                await supabaseAdmin.from('finance').delete().eq('id', financeData.id);
                throw updateError;
            }
            console.log('[CLOSING] Success! Sales updated:', body.saleIds.length);
        } else {
            console.log('[CLOSING] Success! No sales to update (Bonus only).');
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('[CLOSING] Unexpected error:', error);
        return NextResponse.json({ error: error.message || 'Erro desconhecido' }, { status: 500 });
    }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    // This endpoint Reverts a closure. ID passed is likely the FINANCE ID (or we search by barber?).
    // Better design: /api/barbers/[id]/closing?financeId=...
    // But since the route is [id] (barberId), let's assume we pass financeId in searchParams.

    const { id: barberId } = await params;
    const { tenant, role } = await getCurrentUserAndTenant();
    if (role !== 'owner') return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const financeId = searchParams.get('financeId');

    if (!financeId) {
        return NextResponse.json({ error: 'ID do fechamento (financeId) obrigatório' }, { status: 400 });
    }

    // 1. Verify and Get Finance Record
    const { data: financeRec, error: fetchError } = await supabaseAdmin
        .from('finance')
        .select('*')
        .eq('id', financeId)
        .eq('tenant_id', tenant.id)
        .single();

    if (fetchError || !financeRec) return NextResponse.json({ error: 'Fechamento não encontrado' }, { status: 404 });

    // 2. Revert Sales (Set commission paid = false, finance_id = null)
    const { error: salesError } = await supabaseAdmin
        .from('sales')
        .update({ barber_commission_paid: false, finance_id: null })
        .eq('finance_id', financeId)
        .eq('tenant_id', tenant.id);

    if (salesError) throw salesError;

    // 3. Delete Finance Record
    const { error: deleteError } = await supabaseAdmin
        .from('finance')
        .delete()
        .eq('id', financeId);

    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true, message: 'Fechamento revertido com sucesso.' });
}
