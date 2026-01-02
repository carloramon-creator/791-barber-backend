import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';

/**
 * Endpoint PÚBLICO para barbeiro finalizar um atendimento.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ ticketId: string }> }) {
    const { ticketId } = await params;

    try {
        // 1. Buscar o ticket para pegar o barber_id
        const { data: ticket, error: fetchError } = await supabaseAdmin
            .from('client_queue')
            .select('barber_id')
            .eq('id', ticketId)
            .single();

        if (fetchError || !ticket) {
            return NextResponse.json({ error: 'Ticket não encontrado' }, { status: 404 });
        }

        // 2. Finalizar o atendimento
        const { data: updatedTicket, error: updateError } = await supabaseAdmin
            .from('client_queue')
            .update({
                status: 'finished',
                finished_at: new Date().toISOString()
            })
            .eq('id', ticketId)
            .select()
            .single();

        if (updateError) throw updateError;

        // 3. Atualizar barbeiro para 'available'
        await supabaseAdmin
            .from('barbers')
            .update({ status: 'available' })
            .eq('id', ticket.barber_id);

        return NextResponse.json({
            ...updatedTicket,
            canCreateSale: true
        });
    } catch (error: any) {
        console.error('[BARBER FINISH ERROR]', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
