import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { getCurrentUserAndTenant } from '@/app/lib/utils';
import { startOfDay, endOfDay, subDays, subWeeks, subMonths } from 'date-fns';

export async function GET(req: Request) {
    try {
        const { tenant } = await getCurrentUserAndTenant();
        const { searchParams } = new URL(req.url);
        const period = searchParams.get('period') || 'today'; // today, week, fortnight, month

        let startDate = startOfDay(new Date());
        const endDate = endOfDay(new Date());

        if (period === 'week') startDate = startOfDay(subWeeks(new Date(), 1));
        else if (period === 'fortnight') startDate = startOfDay(subDays(new Date(), 15));
        else if (period === 'month') startDate = startOfDay(subMonths(new Date(), 1));

        const startIso = startDate.toISOString();
        const endIso = endDate.toISOString();

        // 1. Faturamento no período
        const { data: sales, error: salesError } = await supabaseAdmin
            .from('sales')
            .select('total_amount')
            .eq('tenant_id', tenant.id)
            .gte('created_at', startIso)
            .lte('created_at', endIso);

        if (salesError) throw salesError;
        const totalBilling = sales?.reduce((acc, s) => acc + Number(s.total_amount), 0) || 0;

        // 2. Total de atendimentos feitos (finished)
        const { count: servicesDone, error: queueError } = await supabaseAdmin
            .from('client_queue')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenant.id)
            .eq('status', 'finished')
            .gte('finished_at', startIso)
            .lte('finished_at', endIso);

        if (queueError) throw queueError;

        // 3. Média de espera entre todos os atendidos (started_at - created_at)
        const { data: servedClients, error: servedError } = await supabaseAdmin
            .from('client_queue')
            .select('created_at, started_at')
            .eq('tenant_id', tenant.id)
            .eq('status', 'finished')
            .not('started_at', 'is', null)
            .gte('finished_at', startIso)
            .lte('finished_at', endIso);

        if (servedError) throw servedError;

        let avgWaitTime = 0;
        if (servedClients && servedClients.length > 0) {
            const totalWait = servedClients.reduce((acc, c) => {
                const wait = (new Date(c.started_at!).getTime() - new Date(c.created_at).getTime()) / 60000;
                return acc + wait;
            }, 0);
            avgWaitTime = Math.round(totalWait / servedClients.length);
        }

        return NextResponse.json({
            totalBilling,
            servicesDone: servicesDone || 0,
            avgWaitTime,
            period
        });
    } catch (error: any) {
        console.error('[DASHBOARD METRICS ERROR]', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
