import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { getCurrentUserAndTenant } from '@/app/lib/utils';

/**
 * Finaliza o atendimento de um cliente.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id: queueId } = await params;
    try {
        const { tenant, role } = await getCurrentUserAndTenant();
        if (role !== 'owner' && role !== 'barber') {
            return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
        }

        // Usar supabaseAdmin para by-passar RLS se necessário,
        // garantindo a segurança pelo tenant_id abaixo
        const client = supabaseAdmin;

        // 1. Buscar a entrada da fila para saber quem é o barbeiro e validar tenant
        const { data: queueEntry, error: fetchError } = await client
            .from('client_queue')
            .select('id, barber_id, tenant_id, status')
            .eq('id', queueId)
            .single();

        if (fetchError || !queueEntry) {
            console.error('[FINISH_ERROR]', fetchError);
            return NextResponse.json({ error: 'Atendimento não encontrado' }, { status: 404 });
        }

        // SEGURANÇA: Validar se pertence ao tenant atual
        if (queueEntry.tenant_id !== tenant.id) {
            return NextResponse.json({ error: 'Acesso não autorizado a este recurso' }, { status: 403 });
        }

        // 2. Finalizar o atendimento
        const { error: finishError } = await client
            .from('client_queue')
            .update({
                status: 'finished',
                finished_at: new Date().toISOString()
            })
            .eq('id', queueId);

        if (finishError) throw finishError;

        // 3. Resetar status do barbeiro para 'available' (Livre) pois ele acabou de terminar um atendimento
        await client.from('barbers').update({ status: 'available' }).eq('id', queueEntry.barber_id);

        // 4. Retornar se o plano permite venda (intermediate, complete, premium ou trial)
        const canCreateSale = ['intermediate', 'complete', 'premium', 'trial'].includes(tenant.plan);

        return NextResponse.json({
            message: 'Atendimento finalizado',
            canCreateSale,
            queueId
        });
    } catch (error: any) {
        console.error('[FINISH_FATAL_ERROR]', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
