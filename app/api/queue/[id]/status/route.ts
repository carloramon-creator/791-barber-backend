import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id: ticketId } = await params;

    try {
        // 1. Buscar o ticket e o barbeiro associado
        const { data: ticket, error: ticketError } = await supabaseAdmin
            .from('client_queue')
            .select(`
                *,
                barbers (
                    id,
                    name,
                    photo_url,
                    avg_time_minutes
                )
            `)
            .eq('id', ticketId)
            .single();

        if (ticketError || !ticket) {
            return NextResponse.json({ error: 'Ticket não encontrado' }, { status: 404 });
        }

        // 2. Se o status for 'waiting', calcular a posição real (quantos estão na frente)
        let currentPosition = ticket.position;
        let estimatedWait = 0;

        if (ticket.status === 'waiting') {
            const { count, error: countError } = await supabaseAdmin
                .from('client_queue')
                .select('*', { count: 'exact', head: true })
                .eq('barber_id', ticket.barber_id)
                .eq('status', 'waiting')
                .lt('position', ticket.position);

            if (!countError) {
                currentPosition = (count || 0) + 1;
                estimatedWait = (count || 0) * (ticket.barbers?.avg_time_minutes || 30);
            }
        }

        return NextResponse.json({
            ...ticket,
            real_position: currentPosition,
            estimated_wait_minutes: estimatedWait
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
