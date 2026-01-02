'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface Ticket {
  id: string;
  status: 'waiting' | 'attending' | 'finished' | 'cancelled';
  position: number;
  real_position: number;
  estimated_wait_minutes: number;
  barbers?: {
    name: string;
    photo_url?: string;
  };
}

export default function TicketPage() {
  const params = useParams<{ ticketId: string }>();
  const router = useRouter();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const ticketId = params.ticketId;

  useEffect(() => {
    if (!ticketId) return;

    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/queue/${ticketId}/status`);
        if (!res.ok) {
          if (res.status === 404) throw new Error('Ficha não encontrada');
          throw new Error('Erro ao buscar status');
        }
        const data = await res.json();
        setTicket(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
    // Poll every 30 seconds
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [ticketId]);

  const handleCancel = async () => {
    if (!ticket) return;
    
    if (!confirm('Tem certeza que deseja cancelar seu atendimento?')) return;

    setCancelling(true);
    try {
      const res = await fetch(`/api/queue/${ticket.id}/cancel`, {
        method: 'PUT',
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Erro ao cancelar');
      }

      alert('Atendimento cancelado com sucesso.');
      // Refresh status immediately
      setTicket((prev) => prev ? { ...prev, status: 'cancelled' } : null);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4 font-sans text-gray-900">
        <p className="animate-pulse">Carregando status...</p>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 p-4 font-sans text-gray-900">
        <p className="text-red-500">{error || 'Ficha não encontrada'}</p>
        <button 
          onClick={() => window.location.reload()}
          className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  const isCancelled = ticket.status === 'cancelled';
  const isFinished = ticket.status === 'finished';
  const canCancel = ticket.status === 'waiting' || ticket.status === 'attending';

  return (
    <div className="flex min-h-screen flex-col items-center bg-gray-50 p-4 font-sans text-gray-900">
      <main className="flex w-full max-w-md flex-col gap-6 pt-10">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800">Acompanhar Fila</h1>
          {ticket.barbers?.name && (
            <p className="text-gray-500">Barbeiro: {ticket.barbers.name}</p>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex flex-col items-center gap-2">
            <span className="text-sm font-medium uppercase text-gray-400">Sua Posição</span>
            <span className="text-6xl font-bold text-blue-600">
              {ticket.status === 'waiting' ? `#${ticket.real_position}` : '-'}
            </span>
            <span className={`rounded-full px-3 py-1 text-sm font-medium ${
              ticket.status === 'waiting' ? 'bg-yellow-100 text-yellow-700' :
              ticket.status === 'attending' ? 'bg-green-100 text-green-700' :
              ticket.status === 'cancelled' ? 'bg-red-100 text-red-700' :
              'bg-gray-100 text-gray-700'
            }`}>
              {ticket.status === 'waiting' ? 'Na fila' :
               ticket.status === 'attending' ? 'Em atendimento' :
               ticket.status === 'cancelled' ? 'Cancelado' : 'Finalizado'}
            </span>
          </div>

          {ticket.status === 'waiting' && (
             <div className="mb-6 flex items-center justify-between border-t border-gray-100 pt-4">
                <span className="text-gray-500">Tempo estimado</span>
                <span className="font-semibold">{ticket.estimated_wait_minutes} min</span>
             </div>
          )}

          {canCancel && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="w-full rounded-lg bg-red-500 px-4 py-3 font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50"
            >
              {cancelling ? 'Cancelando...' : 'Cancelar Atendimento'}
            </button>
          )}

          {(isCancelled || isFinished) && (
            <div className="text-center text-gray-500">
              {isCancelled ? 'Este atendimento foi cancelado.' : 'Atendimento finalizado.'}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
