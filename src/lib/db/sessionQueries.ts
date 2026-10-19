import { eq, desc, and, like } from 'drizzle-orm';
import { db } from './index';
import {
  agentSessions,
  tickets,
  type AgentSessionRecord,
  type AgentRole,
  type SessionStatus,
} from './schema';

export interface CreateAgentSessionInput {
  id: string; // OpenCode ACP sessionId
  ticketId?: string | null;
  role: AgentRole;
  parentSessionId?: string | null;
  worktreeDir?: string | null;
  model?: string | null;
}

/**
 * Records a new agent session (Orchestrator, Manager, or Subagent).
 */
export function createAgentSession(input: CreateAgentSessionInput): AgentSessionRecord {
  const now = Math.floor(Date.now() / 1000);

  // Orchestrator sessions are singletons: retire any previously active orchestrator
  if (input.role === 'orchestrator') {
    db.update(agentSessions)
      .set({ status: 'completed', updatedAt: now })
      .where(and(eq(agentSessions.role, 'orchestrator'), eq(agentSessions.status, 'active')))
      .run();
  }

  const record: AgentSessionRecord = {
    id: input.id,
    ticketId: input.ticketId ?? null,
    role: input.role,
    parentSessionId: input.parentSessionId ?? null,
    worktreeDir: input.worktreeDir ?? null,
    status: 'active',
    model: input.model ?? null,
    createdAt: now,
    updatedAt: now,
  };

  db.insert(agentSessions).values(record).run();
  return record;
}

/**
 * Updates the lifecycle status of an agent session ('active' | 'idle' | 'completed' | 'failed').
 */
export function updateAgentSessionStatus(sessionId: string, status: SessionStatus): boolean {
  const now = Math.floor(Date.now() / 1000);
  const result = db
    .update(agentSessions)
    .set({ status, updatedAt: now })
    .where(eq(agentSessions.id, sessionId))
    .run();

  return result.changes > 0;
}

/**
 * Updates the model used by an agent session.
 */
export function updateAgentSessionModel(sessionId: string, model: string): boolean {
  const now = Math.floor(Date.now() / 1000);
  const result = db
    .update(agentSessions)
    .set({ model, updatedAt: now })
    .where(eq(agentSessions.id, sessionId))
    .run();

  return result.changes > 0;
}

/**
 * Retrieves a single agent session by ACP session ID.
 */
export function getAgentSession(sessionId: string): AgentSessionRecord | undefined {
  return db.select().from(agentSessions).where(eq(agentSessions.id, sessionId)).get();
}

/**
 * Retrieves all sessions linked to a specific ticket (Manager + Subagents).
 */
export function getSessionsByTicket(ticketId: string): AgentSessionRecord[] {
  return db
    .select()
    .from(agentSessions)
    .where(eq(agentSessions.ticketId, ticketId))
    .orderBy(desc(agentSessions.createdAt))
    .all();
}

/**
 * Returns all currently active agent sessions.
 */
export function getActiveSessions(): AgentSessionRecord[] {
  return db
    .select()
    .from(agentSessions)
    .where(eq(agentSessions.status, 'active'))
    .orderBy(desc(agentSessions.createdAt))
    .all();
}

/**
 * Returns session inventory ordered by creation time, optionally filtered by directory/worktree.
 */
export function getAllSessions(limit = 100, worktreeDir?: string): AgentSessionRecord[] {
  if (worktreeDir && worktreeDir.trim()) {
    const trimmed = worktreeDir.trim();
    return db
      .select()
      .from(agentSessions)
      .where(like(agentSessions.worktreeDir, `%${trimmed}%`))
      .orderBy(desc(agentSessions.createdAt))
      .limit(limit)
      .all();
  }

  return db
    .select()
    .from(agentSessions)
    .orderBy(desc(agentSessions.createdAt))
    .limit(limit)
    .all();
}

/**
 * Updates a ticket with its active ACP session ID and isolated worktree directory.
 */
export function updateTicketExecutionInfo(
  ticketId: string,
  info: { acpSessionId: string; worktreeDir: string }
): void {
  const now = Math.floor(Date.now() / 1000);
  db.update(tickets)
    .set({
      acpSessionId: info.acpSessionId,
      worktreeDir: info.worktreeDir,
      updatedAt: now,
    })
    .where(eq(tickets.id, ticketId))
    .run();
}

/**
 * Deletes an agent session by session ID.
 */
export function deleteAgentSession(sessionId: string): boolean {
  const result = db.delete(agentSessions).where(eq(agentSessions.id, sessionId)).run();
  return result.changes > 0;
}

/**
 * Resumes an agent session by marking it active.
 */
export function resumeAgentSession(sessionId: string): AgentSessionRecord | undefined {
  const now = Math.floor(Date.now() / 1000);
  const target = getAgentSession(sessionId);
  if (!target) return undefined;

  // If resuming an orchestrator, retire all other active orchestrators first
  if (target.role === 'orchestrator') {
    db.update(agentSessions)
      .set({ status: 'completed', updatedAt: now })
      .where(and(eq(agentSessions.role, 'orchestrator'), eq(agentSessions.status, 'active')))
      .run();
  }

  db.update(agentSessions)
    .set({ status: 'active', updatedAt: now })
    .where(eq(agentSessions.id, sessionId))
    .run();

  return getAgentSession(sessionId);
}

/**
 * Marks all manager/orchestrator sessions completed to allow a fresh manager session.
 */
export function resetManagerSession(): void {
  const now = Math.floor(Date.now() / 1000);
  db.update(agentSessions)
    .set({ status: 'completed', updatedAt: now })
    .where(eq(agentSessions.role, 'manager'))
    .run();
}

/**
 * Clears all agent session history.
 */
export function clearAllSessions(): void {
  db.delete(agentSessions).run();
}
