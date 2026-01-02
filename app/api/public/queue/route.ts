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

        // 1. Buscar todos barbeiros ATIVOS do tenant
        const { data: barbers, error: barbersError } = await supabaseAdmin
            .from('barbers')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('is_active', true)
            .order('name', { ascending: true });

        if (barbersError) throw barbersError;

        // 2. Buscar itens de fila ativos
        const { data: allQueueItems, error: queueError } = await supabaseAdmin
            .from('client_queue')
            .select('*')
            .eq('tenant_id', tenantId)
            .in('status', ['waiting', 'attending'])
            .order('position', { ascending: true });

        if (queueError) throw queueError;

        // 3. Consolidar os dados
        const consolidated = barbers?.map(barber => {
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
