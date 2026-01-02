import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { getCurrentUserAndTenant } from '@/app/lib/utils';

/**
 * Escolhe o barbeiro com menor tempo total de fila e joga o cliente lá.
 */
export async function POST(req: Request) {
    try {
        const { tenant } = await getCurrentUserAndTenant();
        const { client_id, client_name } = await req.json();
        const client = await supabase();

        // 1. Buscar todos barbeiros do tenant
        const { data: barbers, error: barbersError } = await client
            .from('barbers')
            .select('id, name, avg_time_minutes, status')
            .eq('tenant_id', tenant.id);

        if (barbersError || !barbers || barbers.length === 0) {
            throw new Error('Nenhum barbeiro disponível no momento');
        }

        // 2. Para cada barbeiro, contar fila atual e calcular tempo total
        const barbersWithWaitTimes = await Promise.all(barbers.map(async (barber) => {
            const { count } = await client
                .from('client_queue')
                .select('*', { count: 'exact', head: true })
                .eq('barber_id', barber.id)
                .in('status', ['waiting', 'attending']);

            const totalWaitTime = (count || 0) * barber.avg_time_minutes;
            return { ...barber, totalWaitTime, queueCount: count || 0 };
        }));

        // 3. Escolher o barbeiro com menor tempo total de espera
        const bestBarber = barbersWithWaitTimes.sort((a, b) => a.totalWaitTime - b.totalWaitTime)[0];

        // 4. Entrar na fila desse barbeiro (replicando a lógica de entry)
        const nextPosition = bestBarber.queueCount + 1;
        const estimatedTime = nextPosition * bestBarber.avg_time_minutes;

        const { data: queueEntry, error: insertError } = await client
            .from('client_queue')
            .insert({
                tenant_id: tenant.id,
                barber_id: bestBarber.id,
                client_id: client_id || null,
                client_name,
                status: 'waiting',
                position: nextPosition,
                estimated_time_minutes: estimatedTime
            })
            .select()
            .single();

        if (insertError) throw insertError;

        return NextResponse.json({
            ...queueEntry,
            barber_name: bestBarber.name
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
