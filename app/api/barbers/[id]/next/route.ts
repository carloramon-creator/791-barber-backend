import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { getCurrentUserAndTenant } from '@/app/lib/utils';

/**
 * Barbeiro chama o próximo cliente da fila.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id: barberId } = await params;
    try {
        const { tenant, role } = await getCurrentUserAndTenant();
        if (role !== 'owner' && role !== 'barber') {
            return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
        }

        const client = supabaseAdmin;

        // 1. Garantir que não há ninguém 'attending' agora para esse barbeiro
        await client
            .from('client_queue')
            .update({ status: 'finished', finished_at: new Date().toISOString() })
            .eq('barber_id', barberId)
            .eq('tenant_id', tenant.id)
            .eq('status', 'attending');

        // 2. Buscar o próximo 'waiting' - prioridade primeiro, depois menor posição
        const { data: nextClient, error: fetchError } = await client
            .from('client_queue')
            .select('*')
            .eq('barber_id', barberId)
            .eq('tenant_id', tenant.id)
            .eq('status', 'waiting')
            .order('is_priority', { ascending: false, nullsFirst: false })
            .order('position', { ascending: true })
            .limit(1)
            .maybeSingle();

        if (fetchError) throw fetchError;

        if (!nextClient) {
            // Se não tem ninguém esperando, barbeiro fica 'online'
            await client.from('barbers')
                .update({ status: 'online' })
                .eq('id', barberId)
                .eq('tenant_id', tenant.id);

            return NextResponse.json({ message: 'Não há clientes na fila' });
        }

        // 3. Atualizar cliente para 'attending'
        const { data: updatedClient, error: updateError } = await client
            .from('client_queue')
            .update({ status: 'attending', started_at: new Date().toISOString() })
            .eq('id', nextClient.id)
            .eq('tenant_id', tenant.id)
            .select()
            .single();

        if (updateError) throw updateError;

        // 4. Atualizar barbeiro para 'busy'
        await client.from('barbers')
            .update({ status: 'busy' })
            .eq('id', barberId)
            .eq('tenant_id', tenant.id);

        return NextResponse.json(updatedClient);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
