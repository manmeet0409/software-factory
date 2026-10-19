'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Ticket, TicketStatus } from '@/lib/db/schema';
import { KANBAN_COLUMNS } from './types';
import { KanbanColumn } from './KanbanColumn';
import { TicketDetailModal } from './TicketDetailModal';
import { CreateTicketModal } from './CreateTicketModal';
import { Plus, RefreshCw, Zap } from 'lucide-react';

export function KanbanBoard() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const fetchTickets = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/tickets');
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets || []);
      }
    } catch (err) {
      console.error('Failed to fetch tickets:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Initial fetch, periodic auto-refresh, focus listener, and SSE
  useEffect(() => {
    fetchTickets();

    // 1. Silent periodic background poll every 2.5s for instant updates from worker agents & MCP
    const pollInterval = setInterval(() => {
      fetchTickets(true);
    }, 2500);

    // 2. Refocus listener when switching back to tab
    const handleFocus = () => fetchTickets(true);
    window.addEventListener('focus', handleFocus);

    // 3. Real-time SSE listener
    const eventSource = new EventSource('/api/events');

    eventSource.addEventListener('ticket:created', () => {
      fetchTickets(true);
    });

    eventSource.addEventListener('ticket:updated', () => {
      fetchTickets(true);
    });

    eventSource.addEventListener('comment:added', () => {
      fetchTickets(true);
    });

    eventSource.onerror = () => {
      // Reconnection handled automatically by browser EventSource
    };

    return () => {
      clearInterval(pollInterval);
      window.removeEventListener('focus', handleFocus);
      eventSource.close();
    };
  }, [fetchTickets]);

  const handleUpdateStatus = async (ticketId: string, newStatus: TicketStatus) => {
    try {
      // Optimistic update
      setTickets((prev) =>
        prev.map((t) => (t.id === ticketId ? { ...t, status: newStatus } : t))
      );

      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        fetchTickets();
      }
    } catch (err) {
      console.error('Failed to update ticket status:', err);
      fetchTickets();
    }
  };

  const handleDeleteTicket = async (ticketId: string) => {
    try {
      // Optimistic delete
      setTickets((prev) => prev.filter((t) => t.id !== ticketId));
      if (selectedTicketId === ticketId) {
        setSelectedTicketId(null);
      }

      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        fetchTickets();
      }
    } catch (err) {
      console.error('Failed to delete ticket:', err);
      fetchTickets();
    }
  };

  const activeWorkerCount = tickets.filter((t) => t.status === 'in_progress').length;

  return (
    <div className="flex flex-col h-full">
      {/* Board Control Bar */}
      <div className="flex items-center justify-between px-1 pb-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-neutral-100 tracking-tight">Factory Workflow Board</h2>
          <div className="flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-neutral-900/60 px-2 py-0.5 text-xs text-neutral-400">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500"></span>
            <span>Workers: <strong className="text-neutral-200 font-medium">{activeWorkerCount}</strong> / 4 Active</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchTickets()}
            aria-label="Sync tickets from database"
            className="flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-neutral-900/60 px-2.5 py-1 text-xs text-neutral-300 hover:border-white/[0.15] hover:bg-neutral-900 hover:text-white transition-colors"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            Sync
          </button>

          <button
            onClick={() => setIsCreateOpen(true)}
            aria-label="Create new software factory task"
            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500 transition-colors shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" />
            New Task
          </button>
        </div>
      </div>

      {/* Kanban Columns Grid (Horizontal Scrollable) */}
      <div className="flex-1 overflow-x-auto pb-2">
        <div className="flex gap-4 min-w-[1700px] h-full items-start">
          {KANBAN_COLUMNS.map((col) => {
            const columnTickets = tickets.filter((t) => t.status === col.id);
            return (
              <KanbanColumn
                key={col.id}
                column={col}
                tickets={columnTickets}
                onSelectTicket={(ticket) => setSelectedTicketId(ticket.id)}
                onUpdateStatus={handleUpdateStatus}
                onDeleteTicket={handleDeleteTicket}
              />
            );
          })}
        </div>
      </div>

      {/* Ticket Details Modal */}
      {selectedTicketId && (
        <TicketDetailModal
          ticketId={selectedTicketId}
          onClose={() => setSelectedTicketId(null)}
          onStatusChange={handleUpdateStatus}
          onTicketUpdated={fetchTickets}
          onDelete={handleDeleteTicket}
        />
      )}

      {/* Create Ticket Modal */}
      <CreateTicketModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        existingTickets={tickets}
        onTicketCreated={fetchTickets}
      />
    </div>
  );
}
