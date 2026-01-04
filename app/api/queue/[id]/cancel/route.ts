import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { getCurrentUserAndTenant } from '@/app/lib/utils';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { tenant } = await getCurrentUserAndTenant();
    const { id: ticketId } = await params;

    // Usar supabaseAdmin para by-passar RLS (permissões de linha)
    const client = supabaseAdmin;

    // 1. Busca o ticket atual e verifica o tenant manualmente
    const { data: ticket, error: ticketError } = await client
      .from('client_queue')
      .select('id, tenant_id, barber_id, status, position')
      .eq('id', ticketId)
      .single();

    if (ticketError || !ticket) {
      return NextResponse.json(
        { message: 'Ficha não encontrada.' },
        { status: 404 }
      );
    }

    // Validação de Segurança Manual: Tenant Isolation
    if (ticket.tenant_id !== tenant.id) {
      return NextResponse.json(
        { message: 'Acesso não autorizado a este recurso.' },
        { status: 403 }
      );
    }

    if (!['waiting', 'attending'].includes(ticket.status)) {
      return NextResponse.json(
        { message: 'Somente fichas em espera ou em atendimento podem ser canceladas.' },
        { status: 400 }
      );
    }

    // 2. Marca como cancelado
    const { error: cancelError } = await client
      .from('client_queue')
      .update({ status: 'cancelled' })
      .eq('id', ticket.id);

    if (cancelError) {
      return NextResponse.json(
        { message: 'Erro ao cancelar ficha.' },
        { status: 500 }
      );
    }

    // Se a ficha estava em atendimento, liberar o barbeiro
    if (ticket.status === 'attending') {
      await client.from('barbers').update({ status: 'available' }).eq('id', ticket.barber_id);
    }

    // 3. Reorganiza posições da fila daquele barbeiro
    const { data: remainingQueue, error: queueError } = await client
      .from('client_queue')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('barber_id', ticket.barber_id)
      .eq('status', 'waiting')
      .order('position', { ascending: true });

    if (!queueError && remainingQueue) {
      let pos = 1;
      for (const q of remainingQueue) {
        await client
          .from('client_queue')
          .update({ position: pos })
          .eq('id', q.id);
        pos += 1;
      }
    }

    return NextResponse.json(
      { message: 'Atendimento cancelado com sucesso.' },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { message: e.message || 'Erro inesperado ao cancelar atendimento.' },
      { status: 500 }
    );
  }
}
