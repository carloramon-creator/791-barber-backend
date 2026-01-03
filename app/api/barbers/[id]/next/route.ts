import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { getCurrentUserAndTenant } from '@/app/lib/utils';

/**
 * Barbeiro chama o próximo cliente da fila.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id: barberId } = await params;
    try {
        const { role } = await getCurrentUserAndTenant();
        if (role !== 'owner' && role !== 'barber') {
            return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
        }

        const client = await supabase();

        // 1. Garantir que não há ninguém 'attending' agora para esse barbeiro
        // Se houver, finaliza automaticamente ou retorna erro. Vamos finalizar para ser fluido.
        await client
            .from('client_queue')
            .update({ status: 'finished', finished_at: new Date().toISOString() })
            .eq('barber_id', barberId)
            .eq('status', 'attending');

        // 2. Buscar o próximo 'waiting' com menor posição
        const { data: nextClient, error: fetchError } = await client
            .from('client_queue')
            .select('*')
            .eq('barber_id', barberId)
            .eq('status', 'waiting')
            .order('position', { ascending: true })
            .limit(1)
            .single();

        if (fetchError || !nextClient) {
            // Se não tem ninguém esperando, barbeiro fica 'online'
            await client.from('barbers').update({ status: 'online' }).eq('id', barberId);
            return NextResponse.json({ message: 'Não há clientes na fila' });
        }

        // 3. Atualizar cliente para 'attending'
        const { data: updatedClient, error: updateError } = await client
            .from('client_queue')
            .update({ status: 'attending', started_at: new Date().toISOString() })
            .eq('id', nextClient.id)
            .select()
            .single();

        if (updateError) throw updateError;

        // 4. Atualizar barbeiro para 'busy'
        await client.from('barbers').update({ status: 'busy' }).eq('id', barberId);

        // 5. Re-calcular posições e tempos estimados para os demais (opcional, mas bom)
        // Para simplificar, o frontend pode lidar com a visualização baseada na ordem.
        // Mas aqui poderíamos fazer um loop de update.

        return NextResponse.json(updatedClient);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
