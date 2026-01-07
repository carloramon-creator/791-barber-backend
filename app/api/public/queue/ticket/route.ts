import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';

/**
 * Endpoint PÚBLICO para cliente consultar status do seu ticket.
 * Não requer autenticação.
 */
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const ticketId = searchParams.get('id');

        if (!ticketId) {
            return NextResponse.json({ error: 'ID do ticket é obrigatório' }, { status: 400 });
        }

        // Buscar o ticket e o barbeiro
        const { data: ticket, error: ticketError } = await supabaseAdmin
            .from('client_queue')
            .select(`
                *,
                clients (
                    photo_url,
                    name
                ),
                barbers (
                    id,
                    name,
                    avg_time_minutes,
                    users (
                        photo_url,
                        name,
                        nickname
                    )
                )
            `)
            .eq('id', ticketId)
            .single();

        if (ticketError || !ticket) {
            return NextResponse.json({ error: 'Ticket não encontrado' }, { status: 404 });
        }

        // Se waiting, calcular posição real
        let realPosition = ticket.position;
        let estimatedWait = 0;

        if (ticket.status === 'waiting') {
            const { count } = await supabaseAdmin
                .from('client_queue')
                .select('*', { count: 'exact', head: true })
                .eq('barber_id', ticket.barber_id)
                .eq('status', 'waiting')
                .lt('position', ticket.position);

            realPosition = (count || 0) + 1;
            estimatedWait = (count || 0) * (ticket.barbers?.avg_time_minutes || 30);
        }

        const barberData = ticket.barbers;
        const formattedBarber = barberData ? {
            id: barberData.id,
            name: barberData.users?.name || barberData.name,
            photo_url: barberData.users?.photo_url || (barberData as any).photo_url,
            avg_time_minutes: barberData.avg_time_minutes
        } : null;

        return NextResponse.json({
            ...ticket,
            client_name: ticket.clients?.name || ticket.client_name,
            client_photo: ticket.clients?.photo_url,
            barbers: formattedBarber,
            real_position: realPosition,
            estimated_wait_minutes: estimatedWait
        });

    } catch (error: any) {
        console.error('[PUBLIC TICKET ERROR]', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
