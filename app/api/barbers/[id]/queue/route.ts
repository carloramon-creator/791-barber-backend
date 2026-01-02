import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { getCurrentUserAndTenant } from '@/app/lib/utils';

/**
 * Cliente entra na fila de um barbeiro específico.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id: barberId } = await params;
    try {
        const { tenant } = await getCurrentUserAndTenant();
        const { client_id, client_name } = await req.json();
        const client = await supabase();

        // 1. Buscar barbeiro para pegar avg_time
        const { data: barber, error: barberError } = await client
            .from('barbers')
            .select('avg_time_minutes')
            .eq('id', barberId)
            .single();

        if (barberError || !barber) throw new Error('Barbeiro não encontrado');

        // 2. Buscar maior posição na fila atual (waiting ou attending)
        const { data: lastInQueue, error: queueError } = await client
            .from('client_queue')
            .select('position')
            .eq('barber_id', barberId)
            .in('status', ['waiting', 'attending'])
            .order('position', { ascending: false })
            .limit(1);

        const nextPosition = (lastInQueue && lastInQueue.length > 0) ? lastInQueue[0].position + 1 : 1;

        // 3. Calcular tempo estimado
        // tempo = (número de pessoas na frente + 1) * avg_time
        const estimatedTime = nextPosition * barber.avg_time_minutes;

        // 4. Inserir na fila
        const { data: queueEntry, error: insertError } = await client
            .from('client_queue')
            .insert({
                tenant_id: tenant.id,
                barber_id: barberId,
                client_id: client_id || null,
                client_name,
                status: 'waiting',
                position: nextPosition,
                estimated_time_minutes: estimatedTime
            })
            .select()
            .single();

        if (insertError) throw insertError;

        return NextResponse.json(queueEntry);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
