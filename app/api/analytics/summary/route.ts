import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { getCurrentUserAndTenant, getStatusColor, getDynamicBarberAverages } from '@/app/lib/utils';
import { startOfDay, endOfDay } from 'date-fns';

export async function GET() {
    try {
        const { tenant } = await getCurrentUserAndTenant();
        const todayStart = startOfDay(new Date()).toISOString();
        const todayEnd = endOfDay(new Date()).toISOString();

        // 1. Médias dinâmicas
        const dynamicAverages = await getDynamicBarberAverages(tenant.id);

        // Fazemos todas as buscas em paralelo usando supabaseAdmin para evitar overhead de RLS
        const [
            { data: barbers, error: barbersError },
            { data: sales, error: salesError },
            { data: allQueueItems, error: queueError }
        ] = await Promise.all([
            supabaseAdmin.from('barbers').select('*').eq('tenant_id', tenant.id).order('name', { ascending: true }),
            supabaseAdmin.from('sales').select('total').eq('tenant_id', tenant.id).gte('created_at', todayStart).lte('created_at', todayEnd),
            supabaseAdmin.from('client_queue').select('*').eq('tenant_id', tenant.id).in('status', ['waiting', 'attending']).order('position', { ascending: true })
        ]);

        if (barbersError) throw barbersError;
        if (salesError) throw salesError;
        if (queueError) throw queueError;

        // 2. Processar Métricas de Faturamento
        const billingToday = sales?.reduce((acc, s) => acc + Number(s.total), 0) || 0;
        const waitingCount = allQueueItems?.filter(q => q.status === 'waiting').length || 0;

        // 3. Processar Status dos Barbeiros com Cálculo Dinâmico
        const queueStatus = (barbers || []).map(barber => {
            const barberQueue = allQueueItems?.filter(q => q.barber_id === barber.id) || [];
            const attendingItem = barberQueue.find(q => q.status === 'attending');
            const waitingItems = barberQueue.filter(q => q.status === 'waiting');

            const avgTime = dynamicAverages[barber.id] || barber.avg_time_minutes;

            const formattedQueue = barberQueue.map(q => {
                let itemWait = 0;

                if (q.status === 'waiting') {
                    const posInWaiting = waitingItems.findIndex(w => w.id === q.id);
                    itemWait = posInWaiting * avgTime;

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

            let totalEstimatedWait = waitingItems.length * avgTime;

            if (attendingItem && attendingItem.started_at) {
                const elapsed = (new Date().getTime() - new Date(attendingItem.started_at).getTime()) / 60000;
                const remaining = Math.max(2, avgTime - elapsed);
                totalEstimatedWait += Math.round(remaining);
            }

            return {
                barber_id: barber.id,
                barber_name: barber.name,
                photo_url: barber.photo_url,
                status: barber.status,
                is_active: barber.is_active,
                avg_time_minutes: avgTime,
                queue: formattedQueue,
                total_estimated_wait_minutes: totalEstimatedWait
            };
        });

        const onlineBarbersCount = queueStatus.filter(b => b.status === 'online' || b.status === 'busy').length;
        const busyBarbersCount = queueStatus.filter(b => b.status === 'busy').length;

        // Média geral de tempo de espera (dos barbeiros que estão atendendo)
        const totalWaitAll = queueStatus.reduce((acc, b) => acc + b.total_estimated_wait_minutes, 0);
        const avgWaitTime = onlineBarbersCount > 0 ? Math.round(totalWaitAll / onlineBarbersCount) : 0;

        return NextResponse.json({
            metrics: {
                billingToday,
                queueCount: waitingCount,
                avgWaitTime,
                busyBarbers: busyBarbersCount,
                onlineBarbers: onlineBarbersCount
            },
            queueStatus
        });

    } catch (error: any) {
        console.error('[SUMMARY ERROR]', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
