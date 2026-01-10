import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { getStatusColor, getDynamicBarberAverages, resolveTenantId } from '@/app/lib/utils';

/**
 * Endpoint PÚBLICO para clientes verem as filas da barbearia.
 * Não requer autenticação.
 * Precisa de um tenant_id no query param ou usa um default.
 */
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        let tenantId = searchParams.get('tenant_id');

        // Se Vier um slug ou ID, resolvemos para o ID real
        if (tenantId) {
            tenantId = await resolveTenantId(tenantId);
        }

        // Se não vier tenant_id ou não resolveu, buscar o primeiro tenant disponível (para demo/dev)
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

        // 0. Buscar dados do Tenant (Branding)
        const { data: tenant, error: tenantError } = await supabaseAdmin
            .from('tenants')
            .select('name, logo_url')
            .eq('id', tenantId)
            .single();

        if (tenantError || !tenant) {
            return NextResponse.json({ error: 'Barbearia não encontrada' }, { status: 404 });
        }

        // 1. Médias dinâmicas
        const dynamicAverages = await getDynamicBarberAverages(tenantId);

        // 2. Buscar todos barbeiros ATIVOS e NÃO-OFFLINE do tenant
        const { data: barbers, error: barbersError } = await supabaseAdmin
            .from('barbers')
            .select('*, users!inner(last_seen_at, photo_url, name, nickname)')
            .eq('tenant_id', tenantId)
            .eq('is_active', true)
            .neq('status', 'offline')
            .order('name', { ascending: true });

        if (barbersError) throw barbersError;

        // 1.1 Para o app público, mostramos todos os barbeiros ativos do tenant
        const activeBarbers = barbers || [];

        // 2. Buscar itens de fila ativos com dados dos clientes
        const { data: allQueueItems, error: queueError } = await supabaseAdmin
            .from('client_queue')
            .select('*, clients(photo_url, name)')
            .eq('tenant_id', tenantId)
            .in('status', ['waiting', 'attending'])
            .order('position', { ascending: true });

        if (queueError) throw queueError;

        // 3. Consolidar os dados
        const consolidatedBarbers = activeBarbers.map(barber => {
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
                    id: q.id,
                    client_name: (q as any).clients?.name || q.client_name,
                    client_photo: (q as any).clients?.photo_url,
                    client_phone: q.client_phone,
                    status: q.status,
                    position: q.position,
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
                barber_name: (barber as any).users?.name || barber.name,
                barber_nickname: (barber as any).users?.nickname || barber.nickname,
                user_id: barber.user_id,
                photo_url: (barber as any).users?.photo_url || barber.photo_url,
                status: barber.status === 'online' ? 'available' : barber.status,
                is_active: barber.is_active,
                avg_time_minutes: avgTime,
                queue: formattedQueue,
                total_estimated_wait_minutes: totalEstimatedWait
            };
        }) || [];

        return NextResponse.json({
            barbers: consolidatedBarbers,
            tenant: {
                name: tenant.name,
                logo_url: tenant.logo_url
            }
        });
    } catch (error: any) {
        console.error('[PUBLIC QUEUE ERROR]', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
