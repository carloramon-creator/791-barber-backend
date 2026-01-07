import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';

export async function PUT(req: NextRequest) {
    try {
        const { ticketId } = await req.json();

        if (!ticketId) {
            return NextResponse.json({ message: 'ID do ticket é obrigatório.' }, { status: 400 });
        }

        const client = supabaseAdmin;

        // 1. Busca o ticket atual
        const { data: ticket, error: ticketError } = await client
            .from('client_queue')
            .select('*')
            .eq('id', ticketId)
            .single();

        if (ticketError || !ticket) {
            return NextResponse.json({ message: 'Ticket não encontrado.' }, { status: 404 });
        }

        if (!['waiting', 'attending'].includes(ticket.status)) {
            return NextResponse.json({ message: 'Ticket não pode ser cancelado neste status.' }, { status: 400 });
        }

        // 2. Marca como cancelado
        const { error: updateError } = await client
            .from('client_queue')
            .update({ status: 'cancelled' })
            .eq('id', ticketId);

        if (updateError) throw updateError;

        // 3. Se estava em atendimento, libera o barbeiro (opcional, pode depender da lógica do seu app)
        if (ticket.status === 'attending') {
            await client.from('barbers').update({ status: 'available' }).eq('id', ticket.barber_id);
        }

        // 4. Reorganiza posições (opcional mas recomendado)
        const { data: remainingQueue } = await client
            .from('client_queue')
            .select('id')
            .eq('barber_id', ticket.barber_id)
            .eq('status', 'waiting')
            .order('position', { ascending: true });

        if (remainingQueue) {
            for (let i = 0; i < remainingQueue.length; i++) {
                await client.from('client_queue').update({ position: i + 1 }).eq('id', remainingQueue[i].id);
            }
        }

        return NextResponse.json({ message: 'Cancelado com sucesso.' });

    } catch (error: any) {
        console.error('[PUBLIC CANCEL ERROR]', error);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}
