import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { getCurrentUserAndTenant, getStatusColor } from '@/app/lib/utils';
import { startOfDay, endOfDay } from 'date-fns';

export async function GET() {
    try {
        const { tenant } = await getCurrentUserAndTenant();
        const todayStart = startOfDay(new Date()).toISOString();
        const todayEnd = endOfDay(new Date()).toISOString();

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

        // 1. Processar Métricas
        const billingToday = sales?.reduce((acc, s) => acc + Number(s.total), 0) || 0;
        const waitingCount = allQueueItems?.filter(q => q.status === 'waiting').length || 0;

        // 2. Processar Status dos Barbeiros
        const queueStatus = (barbers || []).map(barber => {
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
                status: barber.status,
                is_active: barber.is_active,
                avg_time_minutes: barber.avg_time_minutes,
                queue: formattedQueue,
                total_estimated_wait_minutes: totalEstimatedWait
            };
        });

        const onlineBarbersCount = queueStatus.filter(b => b.is_active).length;
        const busyBarbersCount = queueStatus.filter(b => b.status === 'busy').length;

        return NextResponse.json({
            metrics: {
                billingToday,
                queueCount: waitingCount,
                avgWaitTime: 25,
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
