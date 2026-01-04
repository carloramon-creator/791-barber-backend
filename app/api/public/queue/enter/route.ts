import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { findOrCreateClientByPhone } from '@/app/lib/clients';

/**
 * Endpoint PÚBLICO para cliente entrar na fila de um barbeiro específico.
 * Não requer autenticação.
 */
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { barber_id, client_name, client_phone, tenant_id } = body;

        if (!client_name || !client_phone) {
            return NextResponse.json(
                { error: 'Nome e telefone são obrigatórios para entrar na fila.' },
                { status: 400 }
            );
        }

        // Determinar tenant_id
        let finalTenantId = tenant_id;
        if (!finalTenantId) {
            // Fallback para dev: pegar primeiro tenant
            const { data: firstTenant } = await supabaseAdmin
                .from('tenants')
                .select('id')
                .limit(1)
                .single();
            finalTenantId = firstTenant?.id;
        }

        if (!finalTenantId) {
            return NextResponse.json({ error: 'Nenhuma barbearia encontrada' }, { status: 404 });
        }

        // 1. Encontrar ou criar cliente
        const client = await findOrCreateClientByPhone(
            supabaseAdmin,
            finalTenantId,
            client_name,
            client_phone
        );

        if (!client) {
            throw new Error('Falha ao registrar cliente.');
        }

        // 2. Verificar se já está na fila
        const { data: existingQueue } = await supabaseAdmin
            .from('client_queue')
            .select('id, status, barber_id')
            .eq('tenant_id', finalTenantId)
            .eq('client_id', client.id)
            .in('status', ['waiting', 'attending'])
            .maybeSingle();

        if (existingQueue) {
            return NextResponse.json({
                error: 'CLIENT_ALREADY_IN_QUEUE',
                message: 'Você já está na fila. Conclua o atendimento atual antes de entrar novamente.',
                ticketId: existingQueue.id
            }, { status: 409 });
        }

        // 3. Selecionar Barbeiro
        let selectedBarberId = barber_id;

        // Se não especificou barbeiro, pegar o com menor fila (ANY)
        if (!selectedBarberId) {
            const { data: barbers } = await supabaseAdmin
                .from('barbers')
                .select('id, avg_time_minutes')
                .eq('tenant_id', finalTenantId)
                .eq('is_active', true);

            if (!barbers || barbers.length === 0) {
                return NextResponse.json({ error: 'Nenhum barbeiro disponível' }, { status: 404 });
            }

            // Contar fila de cada barbeiro
            const barberQueues = await Promise.all(
                barbers.map(async (barber) => {
                    const { count } = await supabaseAdmin
                        .from('client_queue')
                        .select('*', { count: 'exact', head: true })
                        .eq('barber_id', barber.id)
                        .in('status', ['waiting', 'attending']);
                    return { ...barber, queueSize: count || 0 };
                })
            );

            // Escolher o com menor fila
            barberQueues.sort((a, b) => a.queueSize - b.queueSize);
            selectedBarberId = barberQueues[0].id;
        }

        // Buscar dados do barbeiro selecionado
        const { data: barber, error: barberError } = await supabaseAdmin
            .from('barbers')
            .select('avg_time_minutes, tenant_id')
            .eq('id', selectedBarberId)
            .single();

        if (barberError || !barber) {
            return NextResponse.json({ error: 'Barbeiro não encontrado' }, { status: 404 });
        }

        // 4. Buscar maior posição na fila
        const { data: lastInQueue } = await supabaseAdmin
            .from('client_queue')
            .select('position')
            .eq('barber_id', selectedBarberId)
            .in('status', ['waiting', 'attending'])
            .order('position', { ascending: false })
            .limit(1);

        const nextPosition = (lastInQueue && lastInQueue.length > 0) ? lastInQueue[0].position + 1 : 1;
        const estimatedTime = nextPosition * barber.avg_time_minutes;

        // 5. Inserir na fila
        const { data: queueEntry, error: insertError } = await supabaseAdmin
            .from('client_queue')
            .insert({
                tenant_id: barber.tenant_id,
                barber_id: selectedBarberId,
                client_id: client.id,
                client_name,
                client_phone,
                is_priority: !!body.is_priority, // Aceitar flag de prioridade
                status: 'waiting',
                position: nextPosition,
                estimated_time_minutes: estimatedTime
            })
            .select()
            .single();

        if (insertError) throw insertError;

        return NextResponse.json(queueEntry);
    } catch (error: any) {
        console.error('[PUBLIC QUEUE ENTER ERROR]', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
