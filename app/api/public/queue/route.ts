import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { getStatusColor } from '@/app/lib/utils';

/**
 * Endpoint PÚBLICO para clientes verem as filas da barbearia.
 * Não requer autenticação.
 * Precisa de um tenant_id no query param ou usa um default.
 */
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        let tenantId = searchParams.get('tenant_id');

        // Se não vier tenant_id, buscar o primeiro tenant disponível (para demo/dev)
        if (!tenantId) {
            const { data: firstTenant } = await supabaseAdmin
                .from('tenants')
                .select('id')
                .limit(1)
                .single();

            tenantId = firstTenant?.id;
        }

        if (!tenantId) {
            return NextResponse.json({ error: 'Nenhuma barbearia encontrada' }, { status: 404 });
        }

        // 1. Buscar todos barbeiros ATIVOS e NÃO-OFFLINE do tenant
        const { data: barbers, error: barbersError } = await supabaseAdmin
            .from('barbers')
            .select('*, users!inner(last_seen_at)')
            .eq('tenant_id', tenantId)
            .eq('is_active', true)
            .neq('status', 'offline')
            .order('name', { ascending: true });

        if (barbersError) throw barbersError;

        // 1.1 Filtrar barbeiros que não estão realmente "logados" (inatividade > 90 min)
        const now = new Date();
        const activeBarbers = (barbers || []).filter(barber => {
            const lastSeen = (barber as any).users?.last_seen_at ? new Date((barber as any).users.last_seen_at) : null;
            if (!lastSeen) return false;
            const diffMinutes = (now.getTime() - lastSeen.getTime()) / 60000;
            return diffMinutes <= 90; // Tolerância de 1h30m de inatividade
        });

        // 2. Buscar itens de fila ativos
        const { data: allQueueItems, error: queueError } = await supabaseAdmin
            .from('client_queue')
            .select('*')
            .eq('tenant_id', tenantId)
            .in('status', ['waiting', 'attending'])
            .order('position', { ascending: true });

        if (queueError) throw queueError;

        // 3. Consolidar os dados
        const consolidated = activeBarbers.map(barber => {
            const barberQueue = allQueueItems?.filter(q => q.barber_id === barber.id) || [];

            const formattedQueue = barberQueue.map(q => ({
                id: q.id,
                client_name: q.client_name,
                client_phone: q.client_phone,
                status: q.status,
                position: q.position,
                estimated_time_minutes: q.estimated_time_minutes,
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
        }) || [];

        return NextResponse.json(consolidated);
    } catch (error: any) {
        console.error('[PUBLIC QUEUE ERROR]', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
