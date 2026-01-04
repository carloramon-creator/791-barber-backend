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
        .eq('barber_commission_paid', false);

    if (error) throw error;

    return NextResponse.json(sales);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id: barberId } = await params;
    const { tenant, role } = await getCurrentUserAndTenant();
    if (role !== 'owner') return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

    const body = await req.json(); // { saleIds: string[], totalCommission: number, bonus?: number }

    // 1. Mark sales as paid
    const { error: updateError } = await supabaseAdmin
        .from('sales')
        .update({ barber_commission_paid: true })
        .in('id', body.saleIds)
        .eq('tenant_id', tenant.id);

    if (updateError) throw updateError;

    // 2. Create a finance record (expense)
    const { error: financeError } = await supabaseAdmin
        .from('finance')
        .insert({
            tenant_id: tenant.id,
            type: 'expense',
            description: `Fechamento Barbeiro - ID ${barberId.slice(0, 8)}`,
            value: body.totalCommission + (body.bonus || 0),
            date: new Date().toISOString().split('T')[0],
            is_paid: false
        });

    if (financeError) throw financeError;

    return NextResponse.json({ success: true });
}
