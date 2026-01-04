import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { getCurrentUserAndTenant } from '@/app/lib/utils';
import { startOfDay, endOfDay } from 'date-fns';

/**
 * Gera o DRE (Demonstrativo de Resultados do Exercício) filtrado por período.
 */
export async function GET(req: Request) {
    try {
        const { tenant } = await getCurrentUserAndTenant();

        const { searchParams } = new URL(req.url);
        const start = searchParams.get('start') || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
        const end = searchParams.get('end') || new Date().toISOString().split('T')[0];

        // 1. Buscar receitas manuais (finance table)
        // 2. Buscar despesas (finance table)
        // 3. Buscar vendas (sales table)
        const [
            { data: financeData, error: finError },
            { data: salesData, error: salesError }
        ] = await Promise.all([
            supabaseAdmin.from('finance').select('value, type').eq('tenant_id', tenant.id).gte('date', start).lte('date', end),
            supabaseAdmin.from('sales').select('total_amount').eq('tenant_id', tenant.id).gte('created_at', startOfDay(new Date(start)).toISOString()).lte('created_at', endOfDay(new Date(end)).toISOString())
        ]);

        if (finError) throw finError;
        if (salesError) throw salesError;

        const manualRevenue = financeData?.filter(f => f.type === 'revenue').reduce((acc, curr) => acc + Number(curr.value), 0) || 0;
        const salesRevenue = salesData?.reduce((acc, curr) => acc + Number(curr.total_amount), 0) || 0;
        const totalExpenses = financeData?.filter(f => f.type === 'expense').reduce((acc, curr) => acc + Number(curr.value), 0) || 0;

        const totalRevenue = manualRevenue + salesRevenue;

        return NextResponse.json({
            period: { start, end },
            receitas: totalRevenue,
            despesas: totalExpenses,
            lucro: totalRevenue - totalExpenses
        });
    } catch (error: any) {
        console.error('[DRE ERROR]', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
