import { sqliteTable, text, integer, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

export const TICKET_STATUSES = [
  'pending',
  'in_progress',
  'agent_done',
  'agent_tested',
  'user_tested',
  'done',
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const COMMENT_AUTHORS = ['user', 'orchestrator', 'agent'] as const;
export type CommentAuthor = (typeof COMMENT_AUTHORS)[number];

export const COMMENT_TYPES = ['feedback', 'review', 'iteration', 'system'] as const;
export type CommentType = (typeof COMMENT_TYPES)[number];

export const ACTIVITY_ACTIONS = [
  'created',
  'moved',
  'assigned',
  'completed',
  'revived',
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

export const ACTIVITY_ACTORS = [
  'user',
  'orchestrator',
  'manager',
  'builder',
  'tester',
] as const;
export type ActivityActor = (typeof ACTIVITY_ACTORS)[number];

export const tickets = sqliteTable('tickets', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  status: text('status', { enum: TICKET_STATUSES }).notNull().default('pending'),
  parentTicketId: text('parentTicketId').references((): AnySQLiteColumn => tickets.id),
  summary: text('summary'),
  worktreeDir: text('worktreeDir'),
  acpSessionId: text('acpSessionId'),
  assignedModel: text('assignedModel'),
  createdAt: integer('createdAt').notNull(),
  updatedAt: integer('updatedAt').notNull(),
});

export const comments = sqliteTable('comments', {
  id: text('id').primaryKey(),
  ticketId: text('ticketId')
    .notNull()
    .references(() => tickets.id, { onDelete: 'cascade' }),
  author: text('author', { enum: COMMENT_AUTHORS }).notNull(),
  content: text('content').notNull(),
  type: text('type', { enum: COMMENT_TYPES }).notNull(),
  createdAt: integer('createdAt').notNull(),
});

export const activityLogs = sqliteTable('activityLogs', {
  id: text('id').primaryKey(),
  ticketId: text('ticketId')
    .notNull()
    .references(() => tickets.id, { onDelete: 'cascade' }),
  action: text('action', { enum: ACTIVITY_ACTIONS }).notNull(),
  fromStatus: text('fromStatus'),
  toStatus: text('toStatus'),
  actor: text('actor', { enum: ACTIVITY_ACTORS }).notNull(),
  summary: text('summary'),
  timestamp: integer('timestamp').notNull(),
});

export const ticketsRelations = relations(tickets, ({ one, many }) => ({
  parentTicket: one(tickets, {
    fields: [tickets.parentTicketId],
    references: [tickets.id],
    relationName: 'ticketHierarchy',
  }),
  childTickets: many(tickets, {
    relationName: 'ticketHierarchy',
  }),
  comments: many(comments),
  activityLogs: many(activityLogs),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  ticket: one(tickets, {
    fields: [comments.ticketId],
    references: [tickets.id],
  }),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  ticket: one(tickets, {
    fields: [activityLogs.ticketId],
    references: [tickets.id],
  }),
}));

export type Ticket = typeof tickets.$inferSelect;
export type NewTicket = typeof tickets.$inferInsert;

export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;

export type ActivityLog = typeof activityLogs.$inferSelect;
export type NewActivityLog = typeof activityLogs.$inferInsert;
