import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { getCurrentUserAndTenant } from '@/app/lib/utils';
import { startOfDay, endOfDay } from 'date-fns';

export async function GET() {
    try {
        const { tenant } = await getCurrentUserAndTenant();
        const client = await supabase();

        const todayStart = startOfDay(new Date()).toISOString();
        const todayEnd = endOfDay(new Date()).toISOString();

        // Buscar vendas de hoje
        const { data: sales, error: salesError } = await client
            .from('sales')
            .select('total')
            .eq('tenant_id', tenant.id)
            .gte('created_at', todayStart)
            .lte('created_at', todayEnd);

        if (salesError) throw salesError;

        const billingToday = sales?.reduce((acc, s) => acc + Number(s.total), 0) || 0;

        // Buscar tempo médio de espera (simplificado: média dos barbeiros ativos)
        const { data: barbers, error: barbersError } = await client
            .from('barbers')
            .select('id, avg_time_minutes')
            .eq('tenant_id', tenant.id);

        if (barbersError) throw barbersError;

        // Buscar contagem da fila
        const { count: queueCount, error: queueError } = await client
            .from('client_queue')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenant.id)
            .eq('status', 'waiting');

        if (queueError) throw queueError;

        return NextResponse.json({
            billingToday,
            avgWaitTime: 25, // Placeholder por enquanto ou lógica mais complexa
            queueCount: queueCount || 0
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
