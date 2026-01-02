import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { getCurrentUserAndTenant, getStatusColor } from '@/app/lib/utils';

/**
 * Visão consolidada das filas de todos os barbeiros do tenant.
 */
export async function GET() {
    try {
        const { tenant } = await getCurrentUserAndTenant();

        // 1. Buscar todos barbeiros do tenant
        const { data: barbers, error: barbersError } = await supabaseAdmin
            .from('barbers')
            .select('*')
            .eq('tenant_id', tenant.id)
            .order('name', { ascending: true });

        if (barbersError) throw barbersError;

        // 2. Buscar TODOS os itens de fila ativos (waiting/attending) do tenant de uma vez
        const { data: allQueueItems, error: queueError } = await supabaseAdmin
            .from('client_queue')
            .select('*')
            .eq('tenant_id', tenant.id)
            .in('status', ['waiting', 'attending'])
            .order('position', { ascending: true });

        if (queueError) throw queueError;

        // 3. Consolidar os dados em memória
        const consolidated = barbers.map(barber => {
            const barberQueue = allQueueItems?.filter(q => q.barber_id === barber.id) || [];

            const formattedQueue = barberQueue.map(q => ({
                ...q,
                status_color: getStatusColor(q.status)
            }));

            const totalEstimatedWait = formattedQueue
                .filter(q => q.status === 'waiting')
                .length * barber.avg_time_minutes;

            return {
                barber_id: barber.id,
                barber_name: barber.name,
                photo_url: barber.photo_url,
                status: barber.status, // busy/available para atendimento atual
                is_active: barber.is_active, // Online/Pausa (o que o usuário pediu)
                avg_time_minutes: barber.avg_time_minutes,
                queue: formattedQueue,
                total_estimated_wait_minutes: totalEstimatedWait
            };
        });

        return NextResponse.json(consolidated);
    } catch (error: any) {
        console.error('[STATUS ERROR]', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
