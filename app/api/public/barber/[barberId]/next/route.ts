import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';

/**
 * Endpoint PÚBLICO para barbeiro chamar o próximo cliente.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ barberId: string }> }) {
    const { barberId } = await params;

    try {
        // 1. Finalizar qualquer atendimento atual
        await supabaseAdmin
            .from('client_queue')
            .update({ status: 'finished', finished_at: new Date().toISOString() })
            .eq('barber_id', barberId)
            .eq('status', 'attending');

        // 2. Buscar próximo na fila
        const { data: nextClient, error: fetchError } = await supabaseAdmin
            .from('client_queue')
            .select('*')
            .eq('barber_id', barberId)
            .eq('status', 'waiting')
            .order('position', { ascending: true })
            .limit(1)
            .single();

        if (fetchError || !nextClient) {
            // Fila vazia, barbeiro fica disponível
            await supabaseAdmin.from('barbers').update({ status: 'available' }).eq('id', barberId);
            return NextResponse.json({ message: 'Fila vazia', nextClient: null });
        }

        // 3. Atualizar cliente para 'attending'
        const { data: updatedClient, error: updateError } = await supabaseAdmin
            .from('client_queue')
            .update({ status: 'attending', started_at: new Date().toISOString() })
            .eq('id', nextClient.id)
            .select()
            .single();

        if (updateError) throw updateError;

        // 4. Atualizar barbeiro para 'busy'
        await supabaseAdmin.from('barbers').update({ status: 'busy' }).eq('id', barberId);

        return NextResponse.json(updatedClient);
    } catch (error: any) {
        console.error('[BARBER NEXT ERROR]', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
