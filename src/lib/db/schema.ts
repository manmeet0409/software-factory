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

export const chatMessages = sqliteTable('chatMessages', {
  id: text('id').primaryKey(),
  sender: text('sender', { enum: ['user', 'orchestrator'] }).notNull(),
  text: text('text').notNull(),
  timestamp: integer('timestamp').notNull(),
  ticketCreated: integer('ticketCreated', { mode: 'boolean' }).default(false),
  promptMsgId: text('promptMsgId'),
  sessionId: text('sessionId'),
  pairMessageId: text('pairMessageId'),
  wallPinIds: text('wallPinIds'),
});

export type ChatMessageRecord = typeof chatMessages.$inferSelect;
export type NewChatMessageRecord = typeof chatMessages.$inferInsert;

// ==========================================
// ATTACHMENTS & UPLOADS
// ==========================================

export const ATTACHMENT_SCOPES = ['chat', 'ticket', 'comment', 'pin'] as const;
export type AttachmentScope = (typeof ATTACHMENT_SCOPES)[number];

export const attachments = sqliteTable('attachments', {
  id: text('id').primaryKey(),
  filename: text('filename').notNull(),
  originalName: text('originalName').notNull(),
  mimeType: text('mimeType').notNull(),
  size: integer('size').notNull(),
  storagePath: text('storagePath').notNull(),
  scope: text('scope', { enum: ATTACHMENT_SCOPES }).notNull(),
  entityId: text('entityId'),
  createdAt: integer('createdAt').notNull(),
});

export type AttachmentRecord = typeof attachments.$inferSelect;
export type NewAttachmentRecord = typeof attachments.$inferInsert;

// ==========================================
// THE WALL TABLES
// ==========================================

export const WALL_CATEGORIES = ['fact', 'logic', 'lesson'] as const;
export type WallCategory = (typeof WALL_CATEGORIES)[number];

export const TAXONOMY_TYPES = ['module', 'tag'] as const;
export type TaxonomyType = (typeof TAXONOMY_TYPES)[number];

export const REQUEST_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const wallPins = sqliteTable('wallPins', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  category: text('category', { enum: WALL_CATEGORIES }).notNull(),
  module: text('module').notNull(),
  tags: text('tags').notNull(), // JSON array of tag strings
  createdBy: text('createdBy').notNull(),
  createdAt: integer('createdAt').notNull(),
  archived: integer('archived').default(0).notNull(),
});

export type WallPinRecord = typeof wallPins.$inferSelect;
export type NewWallPinRecord = typeof wallPins.$inferInsert;

export const wallTaxonomy = sqliteTable('wallTaxonomy', {
  id: text('id').primaryKey(),
  type: text('type', { enum: TAXONOMY_TYPES }).notNull(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: integer('createdAt').notNull(),
});

export type WallTaxonomyRecord = typeof wallTaxonomy.$inferSelect;
export type NewWallTaxonomyRecord = typeof wallTaxonomy.$inferInsert;

export const wallRequests = sqliteTable('wallRequests', {
  id: text('id').primaryKey(),
  type: text('type', { enum: ['pin', 'taxonomy'] }).notNull(),
  submittedBy: text('submittedBy').notNull(),
  status: text('status', { enum: REQUEST_STATUSES }).notNull().default('pending'),
  payload: text('payload').notNull(), // JSON string
  critiqueOrSuggestions: text('critiqueOrSuggestions'),
  createdAt: integer('createdAt').notNull(),
  reviewedAt: integer('reviewedAt'),
});

export type WallRequestRecord = typeof wallRequests.$inferSelect;
export type NewWallRequestRecord = typeof wallRequests.$inferInsert;

// ==========================================
// AGENT SESSIONS TRACKING
// ==========================================

export const AGENT_ROLES = [
  'orchestrator',
  'manager',
  'planner',
  'builder',
  'tester',
  'reviewer',
] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

export const SESSION_STATUSES = ['active', 'idle', 'completed', 'failed'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const agentSessions = sqliteTable('agentSessions', {
  id: text('id').primaryKey(), // ACP sessionId
  ticketId: text('ticketId').references((): AnySQLiteColumn => tickets.id, { onDelete: 'set null' }),
  role: text('role', { enum: AGENT_ROLES }).notNull(),
  parentSessionId: text('parentSessionId').references((): AnySQLiteColumn => agentSessions.id, { onDelete: 'cascade' }),
  worktreeDir: text('worktreeDir'),
  status: text('status', { enum: SESSION_STATUSES }).notNull().default('active'),
  model: text('model'),
  createdAt: integer('createdAt').notNull(),
  updatedAt: integer('updatedAt').notNull(),
});

export type AgentSessionRecord = typeof agentSessions.$inferSelect;
export type NewAgentSessionRecord = typeof agentSessions.$inferInsert;



