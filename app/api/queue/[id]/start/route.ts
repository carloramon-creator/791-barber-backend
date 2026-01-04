import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { getCurrentUserAndTenant } from '@/app/lib/utils';

/**
 * Barbeiro inicia atendimento de um cliente específico da fila.
 * Permite pular a ordem se necessário (ex: cliente prioritário chegou atrasado).
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id: queueId } = await params;
    try {
        const { role } = await getCurrentUserAndTenant();
        if (role !== 'owner' && role !== 'barber') {
            return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
        }

        const client = await supabase();

        // 1. Buscar o item da fila
        const { data: queueItem, error: fetchError } = await client
            .from('client_queue')
            .select('*')
            .eq('id', queueId)
            .single();

        if (fetchError || !queueItem) {
            return NextResponse.json({ error: 'Cliente não encontrado na fila' }, { status: 404 });
        }

        // 2. Verificar se já está sendo atendido
        if (queueItem.status === 'attending') {
            return NextResponse.json({ error: 'Este cliente já está sendo atendido' }, { status: 400 });
        }

        if (queueItem.status !== 'waiting') {
            return NextResponse.json({ error: 'Este cliente não está aguardando' }, { status: 400 });
        }

        // 3. Finalizar qualquer atendimento em curso do mesmo barbeiro
        await client
            .from('client_queue')
            .update({ status: 'finished', finished_at: new Date().toISOString() })
            .eq('barber_id', queueItem.barber_id)
            .eq('status', 'attending');

        // 4. Atualizar o cliente selecionado para 'attending'
        const { data: updatedClient, error: updateError } = await client
            .from('client_queue')
            .update({ status: 'attending', started_at: new Date().toISOString() })
            .eq('id', queueId)
            .select()
            .single();

        if (updateError) throw updateError;

        // 5. Atualizar barbeiro para 'busy'
        await client.from('barbers').update({ status: 'busy' }).eq('id', queueItem.barber_id);

        return NextResponse.json(updatedClient);
    } catch (error: any) {
        console.error('[START SPECIFIC CLIENT ERROR]', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
