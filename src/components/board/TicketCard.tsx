'use client';

import React from 'react';
import { Ticket, TicketStatus } from '@/lib/db/schema';
import {
  Play,
  CheckCircle2,
  GitBranch,
  Bot,
  Layers,
  Clock,
  Sparkles,
  RotateCcw,
  Trash2,
} from 'lucide-react';

interface TicketCardProps {
  ticket: Ticket;
  onSelect: (ticket: Ticket) => void;
  onUpdateStatus: (ticketId: string, newStatus: TicketStatus) => void;
  onDelete?: (ticketId: string) => void;
}

export function TicketCard({ ticket, onSelect, onUpdateStatus, onDelete }: TicketCardProps) {
  const shortId = ticket.id.slice(0, 8);
  const summaryText = ticket.summary || ticket.description.slice(0, 120);

  const handleAction = (e: React.MouseEvent, targetStatus: TicketStatus) => {
    e.stopPropagation();
    onUpdateStatus(ticket.id, targetStatus);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(ticket);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(ticket)}
      onKeyDown={handleKeyDown}
      aria-label={`View ticket #${shortId}: ${ticket.title}`}
      className="group relative cursor-pointer rounded-md border border-white/[0.08] bg-neutral-900/70 p-3 transition-colors hover:border-white/[0.18] hover:bg-neutral-900 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
    >
      {/* Top Header: ID & Indicators */}
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-mono text-[11px] text-neutral-500 font-medium group-hover:text-neutral-400">#{shortId}</span>

        <div className="flex items-center gap-1.5">
          {ticket.parentTicketId && (
            <span className="flex items-center gap-1 rounded bg-neutral-800/80 px-1.5 py-0.5 text-[10px] text-neutral-400">
              <Layers className="h-2.5 w-2.5" />
              Subtask
            </span>
          )}

          {ticket.worktreeDir && (
            <span className="flex items-center gap-1 rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-400 border border-blue-500/20">
              <GitBranch className="h-2.5 w-2.5" />
              worktree
            </span>
          )}

          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm(`Delete task #${shortId}: "${ticket.title}"?`)) {
                  onDelete(ticket.id);
                }
              }}
              title="Delete task"
              aria-label={`Delete task #${shortId}`}
              className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-neutral-500 hover:text-red-400 transition-opacity ml-0.5"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Ticket Title */}
      <h4 className="mt-1.5 text-xs font-medium leading-snug text-neutral-200 group-hover:text-white">
        {ticket.title}
      </h4>

      {/* Summary / Description */}
      <p className="mt-1 text-[11px] leading-relaxed text-neutral-400 line-clamp-2">
        {summaryText}
      </p>

      {/* Footer Info: Model & Dynamic Action */}
      <div className="mt-2.5 flex items-center justify-between border-t border-white/[0.06] pt-2 text-[11px]">
        <div className="flex items-center gap-1.5 text-neutral-500">
          <Bot className="h-3 w-3" />
          <span className="truncate max-w-[120px] font-mono text-[10px]">
            {ticket.assignedModel ? ticket.assignedModel.split('/').pop() : 'nemotron-3.5'}
          </span>
        </div>

        {/* Quick status actions */}
        <div>
          {ticket.status === 'pending' && (
            <button
              onClick={(e) => handleAction(e, 'in_progress')}
              className="flex items-center gap-1 rounded bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-400 transition-colors hover:bg-amber-500/20"
              title="Launch Agent in Worktree"
              aria-label={`Run agent on ticket #${shortId}`}
            >
              <Play className="h-2.5 w-2.5 fill-current" />
              Run
            </button>
          )}

          {ticket.status === 'in_progress' && (
            <span className="flex items-center gap-1.5 rounded bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 text-[10px] font-medium text-blue-400">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse"></span>
              Active
            </span>
          )}

          {ticket.status === 'agent_done' && (
            <button
              onClick={(e) => handleAction(e, 'agent_tested')}
              className="flex items-center gap-1 rounded bg-neutral-800 border border-white/[0.08] px-2 py-0.5 text-[10px] font-medium text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-white"
              aria-label={`Mark ticket #${shortId} tested`}
            >
              <Sparkles className="h-2.5 w-2.5" />
              Test
            </button>
          )}

          {ticket.status === 'agent_tested' && (
            <button
              onClick={(e) => handleAction(e, 'user_tested')}
              className="flex items-center gap-1 rounded bg-neutral-800 border border-white/[0.08] px-2 py-0.5 text-[10px] font-medium text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-white"
              aria-label={`Review ticket #${shortId}`}
            >
              <Clock className="h-2.5 w-2.5" />
              Review
            </button>
          )}

          {ticket.status === 'user_tested' && (
            <button
              onClick={(e) => handleAction(e, 'done')}
              className="flex items-center gap-1 rounded bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20"
              aria-label={`Approve ticket #${shortId}`}
            >
              <CheckCircle2 className="h-2.5 w-2.5" />
              Approve
            </button>
          )}

          {ticket.status === 'done' && (
            <button
              onClick={(e) => handleAction(e, 'in_progress')}
              className="flex items-center gap-1 rounded bg-neutral-800 border border-white/[0.08] px-2 py-0.5 text-[10px] text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-white"
              title="Revive Ticket / Fix"
              aria-label={`Revive ticket #${shortId}`}
            >
              <RotateCcw className="h-2.5 w-2.5" />
              Revive
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
