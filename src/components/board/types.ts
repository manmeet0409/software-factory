import { Ticket, Comment, ActivityLog, TicketStatus } from '@/lib/db/schema';

export type TicketWithDetails = Ticket & {
  comments?: Comment[];
  activityLogs?: ActivityLog[];
};

export interface ColumnDefinition {
  id: TicketStatus;
  title: string;
  description: string;
  color: string;
  badgeBg: string;
  badgeText: string;
  borderHover: string;
}

export const KANBAN_COLUMNS: ColumnDefinition[] = [
  {
    id: 'pending',
    title: 'Pending',
    description: 'Queued tasks waiting for available worker capacity',
    color: 'border-amber-500/30 bg-amber-500/5',
    badgeBg: 'bg-amber-500/10',
    badgeText: 'text-amber-400',
    borderHover: 'hover:border-amber-500/60',
  },
  {
    id: 'in_progress',
    title: 'In Progress',
    description: 'OpenCode worker active in isolated worktree',
    color: 'border-blue-500/30 bg-blue-500/5',
    badgeBg: 'bg-blue-500/10',
    badgeText: 'text-blue-400',
    borderHover: 'hover:border-blue-500/60',
  },
  {
    id: 'agent_done',
    title: 'Agent Done',
    description: 'Implementation finished, awaiting test execution',
    color: 'border-indigo-500/30 bg-indigo-500/5',
    badgeBg: 'bg-indigo-500/10',
    badgeText: 'text-indigo-400',
    borderHover: 'hover:border-indigo-500/60',
  },
  {
    id: 'agent_tested',
    title: 'Agent Tested',
    description: 'Verified by Tester agent (build & tests passing)',
    color: 'border-purple-500/30 bg-purple-500/5',
    badgeBg: 'bg-purple-500/10',
    badgeText: 'text-purple-400',
    borderHover: 'hover:border-purple-500/60',
  },
  {
    id: 'user_tested',
    title: 'User Tested',
    description: 'Ready for user evaluation or approved by user',
    color: 'border-cyan-500/30 bg-cyan-500/5',
    badgeBg: 'bg-cyan-500/10',
    badgeText: 'text-cyan-400',
    borderHover: 'hover:border-cyan-500/60',
  },
  {
    id: 'done',
    title: 'Done',
    description: 'Merged to main, worktree pruned and cleaned',
    color: 'border-emerald-500/30 bg-emerald-500/5',
    badgeBg: 'bg-emerald-500/10',
    badgeText: 'text-emerald-400',
    borderHover: 'hover:border-emerald-500/60',
  },
];
