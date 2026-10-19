'use client';

import React from 'react';
import { Ticket, TicketStatus } from '@/lib/db/schema';
import { ColumnDefinition } from './types';
import { TicketCard } from './TicketCard';

interface KanbanColumnProps {
  column: ColumnDefinition;
  tickets: Ticket[];
  onSelectTicket: (ticket: Ticket) => void;
  onUpdateStatus: (ticketId: string, newStatus: TicketStatus) => void;
  onDeleteTicket?: (ticketId: string) => void;
}

export function KanbanColumn({
  column,
  tickets,
  onSelectTicket,
  onUpdateStatus,
  onDeleteTicket,
}: KanbanColumnProps) {
  return (
    <div className="flex flex-col min-w-[280px] max-w-[340px] flex-1 rounded-lg border border-white/[0.08] bg-neutral-900/40 p-2.5">
      {/* Column Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.06] px-1">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-medium tracking-wide text-neutral-300">
            {column.title}
          </h3>
          <span className="text-[11px] font-mono text-neutral-500">
            {tickets.length}
          </span>
        </div>
      </div>

      {/* Tickets List */}
      <div className="flex-1 overflow-y-auto pt-2.5 space-y-2 min-h-[450px]">
        {tickets.length > 0 ? (
          tickets.map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              onSelect={onSelectTicket}
              onUpdateStatus={onUpdateStatus}
              onDelete={onDeleteTicket}
            />
          ))
        ) : (
          <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-white/[0.06] p-4 text-center text-xs text-neutral-600">
            No tasks
          </div>
        )}
      </div>
    </div>
  );
}
