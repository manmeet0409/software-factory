import { eq, asc, desc, count } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db } from './index';
import {
  tickets,
  comments,
  activityLogs,
  type Ticket,
  type Comment,
  type ActivityLog,
  type TicketStatus,
  type CommentAuthor,
  type CommentType,
  type ActivityActor,
  type ActivityAction,
} from './schema';

export interface CreateTicketInput {
  title: string;
  description: string;
  status?: TicketStatus;
  parentTicketId?: string | null;
  summary?: string | null;
  worktreeDir?: string | null;
  acpSessionId?: string | null;
  assignedModel?: string | null;
  actor?: ActivityActor;
  logSummary?: string | null;
}

export type TicketWithDetails = Ticket & {
  comments: Comment[];
  activityLogs: ActivityLog[];
};

/**
 * Creates a new ticket and records the initial 'created' activity log entry.
 */
export function createTicket(data: CreateTicketInput): Ticket {
  const now = Math.floor(Date.now() / 1000);
  const ticketId = uuidv4();
  const status: TicketStatus = data.status ?? 'pending';

  const newTicket: Ticket = {
    id: ticketId,
    title: data.title,
    description: data.description,
    status,
    parentTicketId: data.parentTicketId ?? null,
    summary: data.summary ?? null,
    worktreeDir: data.worktreeDir ?? null,
    acpSessionId: data.acpSessionId ?? null,
    assignedModel: data.assignedModel ?? null,
    createdAt: now,
    updatedAt: now,
  };

  const newLog = {
    id: uuidv4(),
    ticketId,
    action: 'created' as ActivityAction,
    fromStatus: null,
    toStatus: status,
    actor: data.actor ?? 'user',
    summary: data.logSummary ?? `Ticket "${data.title}" created`,
    timestamp: now,
  };

  db.transaction((tx) => {
    tx.insert(tickets).values(newTicket).run();
    tx.insert(activityLogs).values(newLog).run();
  });

  return newTicket;
}

/**
 * Updates a ticket's status, updates updatedAt, and records an activity log entry.
 */
export function updateTicketStatus(
  ticketId: string,
  newStatus: TicketStatus,
  actor: ActivityActor,
  summary?: string
): Ticket {
  const now = Math.floor(Date.now() / 1000);

  return db.transaction((tx) => {
    const existing = tx
      .select()
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .get();

    if (!existing) {
      throw new Error(`Ticket with ID ${ticketId} not found`);
    }

    const action: ActivityAction = newStatus === 'done' ? 'completed' : 'moved';

    tx.update(tickets)
      .set({
        status: newStatus,
        updatedAt: now,
      })
      .where(eq(tickets.id, ticketId))
      .run();

    tx.insert(activityLogs)
      .values({
        id: uuidv4(),
        ticketId,
        action,
        fromStatus: existing.status,
        toStatus: newStatus,
        actor,
        summary: summary ?? `Status changed from ${existing.status} to ${newStatus}`,
        timestamp: now,
      })
      .run();

    return {
      ...existing,
      status: newStatus,
      updatedAt: now,
    };
  });
}

/**
 * Returns a ticket with its associated comments and activity logs.
 */
export function getTicketById(ticketId: string): TicketWithDetails | undefined {
  const query = db.query.tickets.findFirst({
    where: eq(tickets.id, ticketId),
    with: {
      comments: {
        orderBy: (commentsTable, { asc: ascOrder }) => [ascOrder(commentsTable.createdAt)],
      },
      activityLogs: {
        orderBy: (logsTable, { asc: ascOrder }) => [ascOrder(logsTable.timestamp)],
      },
    },
  });

  return (query as unknown as { sync: () => TicketWithDetails | undefined }).sync();
}

/**
 * Returns tickets filtered by status, ordered by creation time.
 */
export function getTicketsByStatus(status: TicketStatus): Ticket[] {
  return db
    .select()
    .from(tickets)
    .where(eq(tickets.status, status))
    .orderBy(asc(tickets.createdAt))
    .all();
}

/**
 * Returns all tickets ordered by createdAt.
 */
export function getAllTickets(order: 'asc' | 'desc' = 'asc'): Ticket[] {
  const orderByClause = order === 'desc' ? desc(tickets.createdAt) : asc(tickets.createdAt);
  return db.select().from(tickets).orderBy(orderByClause).all();
}

/**
 * Adds a comment to a ticket.
 */
export function addComment(
  ticketId: string,
  author: CommentAuthor,
  content: string,
  type: CommentType = 'feedback'
): Comment {
  const existing = db.select().from(tickets).where(eq(tickets.id, ticketId)).get();
  if (!existing) {
    throw new Error(`Ticket with ID ${ticketId} not found`);
  }

  const comment: Comment = {
    id: uuidv4(),
    ticketId,
    author,
    content,
    type,
    createdAt: Math.floor(Date.now() / 1000),
  };

  db.insert(comments).values(comment).run();
  return comment;
}

/**
 * Returns child tickets for a given parent ticket ID.
 */
export function getChildTickets(parentTicketId: string): Ticket[] {
  return db
    .select()
    .from(tickets)
    .where(eq(tickets.parentTicketId, parentTicketId))
    .orderBy(asc(tickets.createdAt))
    .all();
}

/**
 * Checks if a ticket can start by verifying whether its parent ticket is 'done'.
 * If the ticket has no parent, returns true.
 */
export function canStartTicket(ticketId: string): boolean {
  const ticket = db.select().from(tickets).where(eq(tickets.id, ticketId)).get();
  if (!ticket) {
    return false;
  }

  if (!ticket.parentTicketId) {
    return true;
  }

  const parent = db
    .select()
    .from(tickets)
    .where(eq(tickets.id, ticket.parentTicketId))
    .get();

  if (!parent) {
    return false;
  }

  return parent.status === 'done';
}

/**
 * Counts tickets currently in 'in_progress' status.
 */
export function getActiveTicketCount(): number {
  const result = db
    .select({ count: count() })
    .from(tickets)
    .where(eq(tickets.status, 'in_progress'))
    .get();

  return result?.count ?? 0;
}
