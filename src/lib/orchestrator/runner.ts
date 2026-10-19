import path from 'path';
import { ACPClient } from '@/lib/acp';
import { WorktreeManager } from '@/lib/worktree';
import {
  getTicketById,
  updateTicketStatus,
  addComment,
  getActiveTicketCount,
  canStartTicket,
  getTicketsByStatus,
} from '@/lib/db/queries';
import {
  createAgentSession,
  updateAgentSessionStatus,
  updateTicketExecutionInfo,
} from '@/lib/db/sessionQueries';
import { eventBus } from './events';

export const MAX_CONCURRENT_WORKERS = 4; // 4 worker agents + 1 orchestrator = 5 max

class TaskRunner {
  private activeClients = new Map<string, ACPClient>();
  private failedAttempts = new Map<string, number>();
  private worktreeManager: WorktreeManager;

  constructor() {
    this.worktreeManager = new WorktreeManager();
  }

  // Check and pick up any runnable pending tickets
  async processPendingTickets(): Promise<void> {
    const activeCount = await getActiveTicketCount();
    const availableSlots = MAX_CONCURRENT_WORKERS - activeCount;

    if (availableSlots <= 0) {
      return;
    }

    const pendingTickets = await getTicketsByStatus('pending');

    for (const ticket of pendingTickets) {
      if (this.activeClients.size >= MAX_CONCURRENT_WORKERS) break;

      // Skip tickets that have failed 3 or more times
      if ((this.failedAttempts.get(ticket.id) || 0) >= 3) continue;

      const canStart = await canStartTicket(ticket.id);
      if (canStart && !this.activeClients.has(ticket.id)) {
        // Fire and forget background execution
        this.startTicketExecution(ticket.id).catch((err) => {
          console.error(`Error executing ticket ${ticket.id}:`, err);
        });
      }
    }
  }

  // Execute an individual ticket using an isolated worktree and ACP instance
  async startTicketExecution(ticketId: string): Promise<void> {
    const ticket = await getTicketById(ticketId);
    if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

    if (this.activeClients.size >= MAX_CONCURRENT_WORKERS) {
      throw new Error(`Max concurrent workers (${MAX_CONCURRENT_WORKERS}) reached. Ticket queued in pending.`);
    }

    const canStart = await canStartTicket(ticketId);
    if (!canStart) {
      throw new Error(`Ticket has an unfinished parent dependency.`);
    }

    // 1. Move status to in_progress
    await updateTicketStatus(ticketId, 'in_progress', 'orchestrator', 'Started agent execution in worktree');
    eventBus.emitEvent('ticket:updated', { ticketId, status: 'in_progress' });

    let worktreeDir: string | null = null;
    let acpClient: ACPClient | null = null;

    try {
      // 2. Create isolated worktree
      worktreeDir = await this.worktreeManager.create(ticketId);

      // 3. Spawn ACP client inside the worktree
      acpClient = new ACPClient({
        cwd: worktreeDir,
        env: {
          OPENCODE_DB: path.join(worktreeDir, '.opencode.db'),
        },
      });

      this.activeClients.set(ticketId, acpClient);

      // 4. Initialize ACP and create session
      await acpClient.initialize();
      const sessionId = await acpClient.createSession();

      // Persist session ownership and ticket execution info in SQLite
      createAgentSession({
        id: sessionId,
        ticketId,
        role: 'manager',
        worktreeDir,
        model: ticket.assignedModel,
      });
      updateTicketExecutionInfo(ticketId, { acpSessionId: sessionId, worktreeDir });

      // 5. Construct initial prompt for the Manager agent
      const modelInstruction = ticket.assignedModel
        ? `\nPreferred Model: ${ticket.assignedModel}`
        : '';

      const taskPrompt = `You are executing task ticket ${ticket.id}: "${ticket.title}".
Description:
${ticket.description}
${modelInstruction}

Instructions:
1. Examine the current code in your working directory.
2. If the task is complex, consult @planner to break it down.
3. Use @builder to implement the required changes.
4. Run tests and linting via @tester to verify the changes.
5. Have @reviewer check the diff.
6. Provide a concise summary of what was accomplished and whether tests passed.`;

      // 6. Send prompt with streaming callback to event bus
      const response = await acpClient.promptStreaming(sessionId, taskPrompt, (update) => {
        if (update.type === 'message_chunk') {
          eventBus.emitEvent('agent:chunk', { ticketId, text: update.content });
        } else if (update.type === 'tool_call' || update.type === 'tool_update') {
          eventBus.emitEvent('agent:tool', { ticketId, tool: update.content });
        }

        // Track child subagent sessions if present in raw update
        const childId = (update.raw as any)?.childSessionId || (update.raw as any)?.subagentSessionId;
        const subagentName = (update.raw as any)?.agentName || (update.raw as any)?.subagent;
        if (childId && typeof childId === 'string') {
          const role = (['planner', 'builder', 'tester', 'reviewer'].includes(subagentName)
            ? subagentName
            : 'builder') as any;
          try {
            createAgentSession({
              id: childId,
              ticketId,
              role,
              parentSessionId: sessionId,
              worktreeDir,
            });
          } catch {
            // ignore duplicate primary key
          }
        }
      });

      const responseText = response.content || 'Task completed successfully.';
      const shortSummary = responseText.slice(0, 300).trim();

      // 7. Add agent comment with completion details
      await addComment(ticketId, 'agent', responseText, 'feedback');
      eventBus.emitEvent('comment:added', { ticketId, author: 'agent', content: responseText });

      // 8. Move status to agent_done & update session status
      await updateTicketStatus(ticketId, 'agent_done', 'manager', shortSummary);
      updateAgentSessionStatus(sessionId, 'completed');
      eventBus.emitEvent('ticket:updated', { ticketId, status: 'agent_done', summary: shortSummary });

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`Task execution failed for ${ticketId}:`, errorMessage);

      const attempts = (this.failedAttempts.get(ticketId) || 0) + 1;
      this.failedAttempts.set(ticketId, attempts);

      if (ticketId) {
        const ticketRecord = await getTicketById(ticketId);
        if (ticketRecord?.acpSessionId) {
          updateAgentSessionStatus(ticketRecord.acpSessionId, 'failed');
        }
      }

      await addComment(ticketId, 'agent', `Execution Error: ${errorMessage}`, 'system');

      if (attempts >= 3) {
        await updateTicketStatus(ticketId, 'agent_done', 'orchestrator', `Execution stopped after 3 failed attempts: ${errorMessage}`);
        eventBus.emitEvent('ticket:updated', { ticketId, status: 'agent_done', error: errorMessage });
      } else {
        await updateTicketStatus(ticketId, 'pending', 'orchestrator', `Failed (attempt ${attempts}/3): ${errorMessage}. Returned to pending.`);
        eventBus.emitEvent('ticket:updated', { ticketId, status: 'pending', error: errorMessage });
      }
    } finally {
      // Cleanup client process
      if (acpClient) {
        acpClient.destroy();
        this.activeClients.delete(ticketId);
      }
    }
  }

  // User approved and completes ticket: merge worktree into main, clean up, and trigger children
  async completeTicket(ticketId: string): Promise<void> {
    const ticket = await getTicketById(ticketId);
    if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

    // Ensure any running client is terminated
    const runningClient = this.activeClients.get(ticketId);
    if (runningClient) {
      runningClient.destroy();
      this.activeClients.delete(ticketId);
    }

    // Merge git branch into main and delete worktree immediately
    try {
      await this.worktreeManager.mergeAndCleanup(ticketId);
    } catch (mergeErr) {
      console.warn(`Worktree merge/cleanup warning for ${ticketId}:`, mergeErr);
    }

    // Update status to done
    await updateTicketStatus(ticketId, 'done', 'user', 'Ticket verified and merged into main');
    eventBus.emitEvent('ticket:updated', { ticketId, status: 'done' });

    // Process dependent child tickets
    await this.processPendingTickets();
  }

  // Cancel running ticket
  cancelTicket(ticketId: string): boolean {
    const client = this.activeClients.get(ticketId);
    if (client) {
      client.destroy();
      this.activeClients.delete(ticketId);
      return true;
    }
    return false;
  }

  getActiveWorkersCount(): number {
    return this.activeClients.size;
  }
}

// Global singleton to persist across Next.js API reloads
const globalForRunner = global as unknown as { factoryTaskRunner?: TaskRunner };
export const taskRunner = globalForRunner.factoryTaskRunner ?? new TaskRunner();
if (process.env.NODE_ENV !== 'production') globalForRunner.factoryTaskRunner = taskRunner;
