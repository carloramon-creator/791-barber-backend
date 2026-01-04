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

        // 1. Buscar receitas manuais e despesas (finance table)
        // Precisamos de categoria para despesas
        const { data: financeData, error: finError } = await supabaseAdmin
            .from('finance')
            .select(`
                value, 
                type, 
                finance_categories (name),
                is_paid
            `)
            .eq('tenant_id', tenant.id)
            .gte('date', start)
            .lte('date', end);

        // 2. Buscar vendas (sales table)
        const { data: salesData, error: salesError } = await supabaseAdmin
            .from('sales')
            .select('total_amount, barber_commission_paid, commission_value')
            .eq('tenant_id', tenant.id)
            .gte('created_at', startOfDay(new Date(start)).toISOString())
            .lte('created_at', endOfDay(new Date(end)).toISOString());

        if (finError) throw finError;
        if (salesError) throw salesError;

        // Processamento
        // Receitas
        const salesRevenue = salesData?.reduce((acc, curr) => acc + Number(curr.total_amount), 0) || 0;

        // Considerar is_paid se existir, senão considera tudo (fallback)
        const paidFinance = financeData?.filter(f => f.is_paid !== false) || [];

        const manualRevenue = paidFinance.filter(f => f.type === 'revenue')
            .reduce((acc, curr) => acc + Number(curr.value), 0);

        const totalRevenue = salesRevenue + manualRevenue;

        // Despesas Agrupadas
        const expenses = paidFinance.filter(f => f.type === 'expense');
        const expenseTotal = expenses.reduce((acc, curr) => acc + Number(curr.value), 0);

        const expensesByCategory: Record<string, number> = {};
        for (const exp of expenses) {
            // @ts-ignore
            const catName = exp.finance_categories?.name || 'Sem Categoria';
            expensesByCategory[catName] = (expensesByCategory[catName] || 0) + Number(exp.value);
        }

        const expenseBreakdown = Object.entries(expensesByCategory).map(([name, value]) => ({
            name,
            value
        })).sort((a, b) => b.value - a.value);

        return NextResponse.json({
            period: { start, end },
            receitas: {
                total: totalRevenue,
                breakdown: [
                    { name: 'Vendas de Serviços/Produtos', value: salesRevenue },
                    { name: 'Outras Receitas', value: manualRevenue }
                ]
            },
            despesas: {
                total: expenseTotal,
                breakdown: expenseBreakdown
            },
            lucro: totalRevenue - expenseTotal
        });
    } catch (error: any) {
        console.error('[DRE ERROR]', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
