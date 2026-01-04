import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { getCurrentUserAndTenant, getStatusColor, getDynamicBarberAverages } from '@/app/lib/utils';

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
        // Ordenar por prioridade primeiro, depois por posição
        const { data: allQueueItems, error: queueError } = await supabaseAdmin
            .from('client_queue')
            .select('*')
            .eq('tenant_id', tenant.id)
            .in('status', ['waiting', 'attending'])
            .order('is_priority', { ascending: false, nullsFirst: false })
            .order('position', { ascending: true });

        if (queueError) throw queueError;

        // 3. Buscar médias dinâmicas
        const dynamicAverages = await getDynamicBarberAverages(tenant.id);

        // 4. Consolidar os dados em memória
        const consolidated = barbers.map(barber => {
            const barberQueue = allQueueItems?.filter(q => q.barber_id === barber.id) || [];
            const attendingItem = barberQueue.find(q => q.status === 'attending');
            const waitingItems = barberQueue.filter(q => q.status === 'waiting');

            // Usa a média dinâmica se disponível, senão usa a do cadastro
            const avgTime = dynamicAverages[barber.id] || barber.avg_time_minutes;

            const formattedQueue = barberQueue.map(q => {
                let itemWait = 0;

                if (q.status === 'waiting') {
                    // Posição dele entre os que estão esperando
                    const posInWaiting = waitingItems.findIndex(w => w.id === q.id);
                    itemWait = posInWaiting * avgTime;

                    // Adiciona o tempo restante de quem está sendo atendido agora
                    if (attendingItem && attendingItem.started_at) {
                        const elapsed = (new Date().getTime() - new Date(attendingItem.started_at).getTime()) / 60000;
                        const remaining = Math.max(2, avgTime - elapsed);
                        itemWait += Math.round(remaining);
                    }
                } else if (q.status === 'attending' && q.started_at) {
                    const elapsed = (new Date().getTime() - new Date(q.started_at).getTime()) / 60000;
                    itemWait = Math.round(Math.max(2, avgTime - elapsed));
                }

                return {
                    ...q,
                    estimated_time_minutes: itemWait,
                    status_color: getStatusColor(q.status)
                };
            });

            // Cálculo dinâmico:
            // 1. Se tem alguém sendo atendido, estimamos quanto falta
            // 2. Multiplicamos pelo número de pessoas esperando
            let totalEstimatedWait = waitingItems.length * avgTime;

            if (attendingItem && attendingItem.started_at) {
                const elapsed = (new Date().getTime() - new Date(attendingItem.started_at).getTime()) / 60000;
                const remaining = Math.max(2, avgTime - elapsed); // Mínimo de 2 minutos se já estourou o tempo
                totalEstimatedWait += Math.round(remaining);
            }

            return {
                barber_id: barber.id,
                barber_name: barber.name,
                user_id: barber.user_id,
                photo_url: barber.photo_url,
                status: barber.status,
                is_active: barber.is_active,
                avg_time_minutes: avgTime, // Retorna a média atual real
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
