import fs from 'fs';
import path from 'path';
import {
  createAgentSession,
  getAgentSession,
  getActiveSessions,
  updateAgentSessionStatus,
} from '@/lib/db/sessionQueries';
import { createTicket } from '@/lib/db/queries';
import { eventBus } from '@/lib/orchestrator/events';
import { taskRunner } from '@/lib/orchestrator/runner';
import { getTargetDirectory } from '@/lib/workspace/config';
import { syncGlobalOpenCodeConfig } from '@/lib/models/service';
import { sqlite } from '@/lib/db/index';

export interface ServiceConfig {
  id: string;
  version: string;
  url: string;
  pid: number;
  password: string;
}

export interface OpenCodePromptResult {
  reply: string;
  sessionId: string;
  promptMsgId?: string;
  isPending?: boolean;
  ticketCreated?: boolean;
  model?: string;
  variant?: string;
  wallPinsCreated?: Array<{ id: string; title: string }>;
  actionTaken?: {
    type: 'ticket_created' | 'ticket_updated' | 'none';
    ticketId?: string;
    details?: string;
  };
}

class OpenCodeServiceClient {
  private activeSessionId: string | null = null;

  /**
   * Reads the active OpenCode background service config.
   */
  getServiceConfig(): ServiceConfig | null {
    try {
      const home = process.env.USERPROFILE || process.env.HOME || '';
      const servicePath = path.join(home, '.local', 'state', 'opencode', 'service.json');

      if (!fs.existsSync(servicePath)) {
        return null;
      }

      const content = fs.readFileSync(servicePath, 'utf-8');
      return JSON.parse(content) as ServiceConfig;
    } catch (err) {
      console.error('Failed to read OpenCode service.json:', err);
      return null;
    }
  }

  /**
   * Builds the Authorization header for OpenCode API requests.
   */
  getAuthHeaders(config: ServiceConfig) {
    const creds = Buffer.from(`opencode:${config.password}`).toString('base64');
    return {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Resolves connection URL to 127.0.0.1.
   */
  getBaseUrl(config: ServiceConfig): string {
    const parsed = new URL(config.url);
    const port = parsed.port || '49374';
    return `http://127.0.0.1:${port}`;
  }

  /**
   * Ensures the factory MCP tools are registered only for this project location in OpenCode.
   */
  async ensureFactoryMcp(baseUrl: string, headers: Record<string, string>, targetDir: string): Promise<void> {
    try {
      const dirParam = encodeURIComponent(targetDir);
      const mcpRes = await fetch(`${baseUrl}/api/mcp?location%5Bdirectory%5D=${dirParam}`, { headers });
      if (mcpRes.ok) {
        const mcpData = await mcpRes.json();
        const connected = mcpData.data?.some(
          (s: { name: string; status?: { status?: string } }) => s.name === 'factory' && s.status?.status === 'connected'
        );
        if (connected) return;
      }

      const mcpServerScript = path.resolve(process.cwd(), 'src', 'mcp-server.mjs');
      await fetch(`${baseUrl}/api/experimental/mcp/factory?location%5Bdirectory%5D=${dirParam}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          config: {
            type: 'local',
            command: ['node', mcpServerScript],
          },
        }),
      });
    } catch (err) {
      console.warn('Failed to register factory MCP server with OpenCode:', err);
    }
  }

  /**
   * Ensures an active Orchestrator session exists in OpenCode & SQLite.
   */
  /**
   * Reads configured orchestrator model from opencode.json.
   */
  getConfiguredOrchestratorModel(): string {
    try {
      const cfgPath = path.resolve(process.cwd(), 'opencode.json');
      if (fs.existsSync(cfgPath)) {
        const content = fs.readFileSync(cfgPath, 'utf-8');
        const data = JSON.parse(content);
        if (data.agent?.orchestrator?.model) {
          return data.agent.orchestrator.model;
        }
      }
    } catch {
      // ignore
    }
    return 'opencode/nemotron-3.5-lightning-free';
  }

  async ensureOrchestratorSession(targetModel?: string): Promise<string> {
    const config = this.getServiceConfig();
    if (!config) {
      throw new Error('OpenCode background service is not running. Start with "opencode service start".');
    }

    const baseUrl = this.getBaseUrl(config);
    const headers = this.getAuthHeaders(config);
    const desiredModel = targetModel || this.getConfiguredOrchestratorModel();
    const currentWorkspaceDir = getTargetDirectory();

    // Verify existing active session if known
    if (this.activeSessionId) {
      try {
        const verifyRes = await fetch(`${baseUrl}/api/session/${this.activeSessionId}`, { headers });
        if (verifyRes.ok) {
          const existing = getAgentSession(this.activeSessionId);
          // Keep active session only if its model strictly matches desiredModel AND directory matches
          if (existing && existing.model === desiredModel && existing.worktreeDir === currentWorkspaceDir) {
            return this.activeSessionId;
          }
        }
      } catch {
        // stale session
      }
      this.activeSessionId = null;
    }

    // Check if SQLite has an active orchestrator session matching the target workspace and desiredModel
    const active = getActiveSessions().find((s) => s.role === 'orchestrator' && s.worktreeDir === currentWorkspaceDir);
    if (active) {
      try {
        const verifyRes = await fetch(`${baseUrl}/api/session/${active.id}`, { headers });
        if (verifyRes.ok) {
          if (active.model === desiredModel) {
            this.activeSessionId = active.id;
            return active.id;
          }
        }
      } catch {
        // stale session
      }
      updateAgentSessionStatus(active.id, 'completed');
    }

    // Ensure global agent configs and target workspace MCP tools are registered
    syncGlobalOpenCodeConfig();
    await this.ensureFactoryMcp(baseUrl, headers, currentWorkspaceDir);

    // Parse model string into providerID, modelId, and variant
    let providerID = 'opencode';
    let modelId = desiredModel;
    let variant: string | undefined;

    if (desiredModel.includes('/')) {
      const parts = desiredModel.split('/');
      providerID = parts[0];
      modelId = parts.slice(1).join('/');
    }

    if (modelId.includes('#')) {
      const parts = modelId.split('#');
      modelId = parts[0];
      variant = parts[1] || undefined;
    }

    const body = {
      title: `Factory Orchestrator (${path.basename(currentWorkspaceDir)})`,
      agent: 'orchestrator',
      location: {
        directory: currentWorkspaceDir,
      },
      model: {
        providerID,
        id: modelId,
        ...(variant && variant !== 'default' ? { variant } : {}),
      },
    };

    const res = await fetch(`${baseUrl}/api/session`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenCode session creation failed: ${errText}`);
    }

    const data = await res.json();
    const sessionId = data.data.id as string;
    this.activeSessionId = sessionId;

    // Track in SQLite with actual model and current workspace directory
    createAgentSession({
      id: sessionId,
      role: 'orchestrator',
      worktreeDir: currentWorkspaceDir,
      model: desiredModel,
    });
    eventBus.emitEvent('session:updated', { id: sessionId, role: 'orchestrator' });

    return sessionId;
  }

  /**
   * Checks the live status of an ongoing session prompt in OpenCode.
   */
  async checkSessionStatus(
    sessionId: string,
    promptMsgId?: string
  ): Promise<{
    done: boolean;
    reply?: string;
    error?: string;
    step?: string;
  }> {
    const config = this.getServiceConfig();
    if (!config) {
      return { done: true, error: 'OpenCode service is not running.' };
    }

    const baseUrl = this.getBaseUrl(config);
    const headers = this.getAuthHeaders(config);

    try {
      const msgRes = await fetch(`${baseUrl}/api/session/${sessionId}/message`, {
        method: 'GET',
        headers,
      });

      if (!msgRes.ok) {
        return { done: false, step: 'Connecting to OpenCode...' };
      }

      const msgData = await msgRes.json();
      const messages: any[] = msgData.data || [];
      if (messages.length === 0) {
        return { done: false, step: 'Starting turn...' };
      }

      // Find the index of the prompt user message
      let userIdx = -1;
      if (promptMsgId) {
        userIdx = messages.findIndex((m: any) => m.id === promptMsgId);
      }
      if (userIdx === -1) {
        // Fallback: newest user message
        userIdx = messages.findIndex((m: any) => m.type === 'user');
      }

      // If user message is at index 0, assistant hasn't started generating yet
      if (userIdx === 0) {
        return { done: false, step: 'Formulating response...' };
      }

      // Events produced for this prompt appear at indices before userIdx (since newest is at index 0)
      const turnEvents = userIdx > 0 ? messages.slice(0, userIdx) : messages;

      // Check for failure
      const failureEvent = turnEvents.find((m: any) => m.type === 'idle' && m.outcome === 'failed');
      if (failureEvent) {
        return {
          done: true,
          error: failureEvent.error?.message || 'Agent execution encountered an error.',
        };
      }

      // Check for successful completion
      const idleSuccess = turnEvents.find((m: any) => m.type === 'idle' && m.outcome === 'succeeded');
      const finishedAssistant = turnEvents.find(
        (m: any) =>
          m.type === 'assistant' &&
          (m.finish === 'stop' || idleSuccess) &&
          m.content?.some((c: any) => c.type === 'text' && c.text)
      );

      if (finishedAssistant) {
        const textBlocks = finishedAssistant.content.filter((c: any) => c.type === 'text');
        return {
          done: true,
          reply: textBlocks.map((b: any) => b.text).join('\n\n'),
        };
      }

      // Still running — inspect active step
      const activeAssistant = turnEvents.find((m: any) => m.type === 'assistant');
      let step = 'Thinking & formulating response...';
      if (activeAssistant?.content) {
        const toolItem = activeAssistant.content.find((c: any) => c.type === 'tool');
        if (toolItem) {
          step = `Executing tool: ${toolItem.name || 'factory action'}...`;
        }
      }

      return {
        done: false,
        step,
      };
    } catch {
      return { done: false, step: 'Awaiting OpenCode response...' };
    }
  }

  /**
   * Sends a prompt to the Orchestrator agent in OpenCode and awaits the assistant reply.
   */
  async sendPrompt(text: string, targetModel?: string): Promise<OpenCodePromptResult> {
    const config = this.getServiceConfig();
    if (!config) {
      throw new Error('OpenCode service is not running. Start with "opencode service start".');
    }

    const desiredModel = targetModel || this.getConfiguredOrchestratorModel();
    const sessionId = await this.ensureOrchestratorSession(desiredModel);
    const baseUrl = this.getBaseUrl(config);
    const headers = this.getAuthHeaders(config);
    const promptStartTime = Date.now();

    // 1. Post prompt to session
    const promptRes = await fetch(`${baseUrl}/api/session/${sessionId}/prompt`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ text }),
    });

    if (!promptRes.ok) {
      const errText = await promptRes.text();
      throw new Error(`Failed to send prompt to OpenCode: ${errText}`);
    }

    const promptData = await promptRes.json();
    const promptMsgId = promptData.data?.id as string | undefined;

    // 2. Poll for assistant message completion (up to 12s synchronously)
    const syncTimeoutMs = 12000;
    let assistantReply = '';
    let isPending = false;

    while (Date.now() - promptStartTime < syncTimeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 600));

      const status = await this.checkSessionStatus(sessionId, promptMsgId);
      if (status.done) {
        if (status.error) {
          assistantReply = `⚠️ **OpenCode Orchestrator Error**: ${status.error}`;
        } else if (status.reply) {
          assistantReply = status.reply;
        }
        break;
      }
    }

    if (!assistantReply) {
      isPending = true;
      assistantReply = `⏳ **OpenCode is actively working on your request...**\n\nThe Orchestrator is executing actions and formulating its response. Please hold on — the final output will appear here automatically.`;
    }

    // 3. Post-process: Check if the user requested task creation or if Orchestrator suggests a task
    let actionTaken: OpenCodePromptResult['actionTaken'] = { type: 'none' };

    const taskMatch = text.match(/^(?:create\s+(?:a\s+)?task|new\s+task|task:)\s*[:\-]?\s*(.+)/i);
    if (taskMatch) {
      const taskDesc = taskMatch[1].trim();
      const title = taskDesc.split('\n')[0].slice(0, 80);
      const ticket = createTicket({
        title,
        description: taskDesc,
      });
      eventBus.emitEvent('ticket:created', { ticketId: ticket.id, title: ticket.title });
      taskRunner.processPendingTickets().catch(console.error);

      actionTaken = {
        type: 'ticket_created',
        ticketId: ticket.id,
        details: `Created task "${ticket.title}"`,
      };
    }

    let ticketCreated = actionTaken.type === 'ticket_created';
    if (!ticketCreated) {
      try {
        const promptStartTimeSec = Math.floor(promptStartTime / 1000);
        const row = sqlite.prepare('SELECT id FROM tickets WHERE createdAt >= ?').get(promptStartTimeSec) as { id: string } | undefined;
        if (row) {
          ticketCreated = true;
          actionTaken = {
            type: 'ticket_created',
            ticketId: row.id,
            details: 'Ticket created by orchestrator',
          };
        }
      } catch {}
    }

    // Check if any wall pins were created by orchestrator during this turn
    let wallPinsCreated: Array<{ id: string; title: string }> = [];
    try {
      const promptStartTimeSec = Math.floor(promptStartTime / 1000);
      const wallRows = sqlite
        .prepare("SELECT id, title FROM wallPins WHERE createdBy = 'orchestrator' AND createdAt >= ?")
        .all(promptStartTimeSec) as Array<{ id: string; title: string }>;
      if (wallRows && wallRows.length > 0) {
        wallPinsCreated = wallRows;
      }
    } catch {}

    const sessionRecord = getAgentSession(sessionId);
    const effectiveModel = sessionRecord?.model || desiredModel;

    let cleanModel = effectiveModel;
    let cleanVariant: string | undefined;
    if (effectiveModel.includes('#')) {
      const parts = effectiveModel.split('#');
      cleanModel = parts[0];
      cleanVariant = parts[1];
    }

    return {
      reply: assistantReply,
      sessionId,
      promptMsgId,
      isPending,
      ticketCreated,
      model: cleanModel,
      variant: cleanVariant,
      wallPinsCreated,
      actionTaken,
    };
  }

  /**
   * Reverts an OpenCode session turn back to a specific prompt message.
   * This rolls back both the session conversation history and any workspace file changes.
   */
  async revertTurn(sessionId: string, promptMsgId?: string): Promise<boolean> {
    const config = this.getServiceConfig();
    if (!config) {
      throw new Error('OpenCode service is not running.');
    }

    const baseUrl = this.getBaseUrl(config);
    const headers = this.getAuthHeaders(config);

    try {
      let targetMessageId = promptMsgId;

      // If promptMsgId was not passed, resolve to newest user message
      if (!targetMessageId) {
        const msgRes = await fetch(`${baseUrl}/api/session/${encodeURIComponent(sessionId)}/message`, { headers });
        if (msgRes.ok) {
          const msgData = await msgRes.json();
          const msgs: any[] = msgData.data || [];
          const userMsg = msgs.find((m: any) => m.type === 'user');
          targetMessageId = userMsg?.id;
        }
      }

      if (targetMessageId) {
        // 1. Stage the revert to target prompt message
        await fetch(`${baseUrl}/api/session/${encodeURIComponent(sessionId)}/revert/stage`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ messageID: targetMessageId }),
        });

        // 2. Commit the staged revert
        await fetch(`${baseUrl}/api/session/${encodeURIComponent(sessionId)}/revert/commit`, {
          method: 'POST',
          headers,
          body: JSON.stringify({}),
        });
      }

      return true;
    } catch (err) {
      console.error('Failed to revert OpenCode session turn:', err);
      return false;
    }
  }

  /**
   * Resets the Orchestrator session state to a clean slate without spawning a session.
   * A new session will ONLY be created once the user sends a message.
   */
  async resetSession(): Promise<void> {
    if (this.activeSessionId) {
      updateAgentSessionStatus(this.activeSessionId, 'completed');
      this.activeSessionId = null;
    }
    const active = getActiveSessions().filter((s) => s.role === 'orchestrator');
    for (const a of active) {
      updateAgentSessionStatus(a.id, 'completed');
    }
    eventBus.emitEvent('session:updated', { action: 'reset' });
  }

  /**
   * Overrides or binds the currently active in-memory session ID.
   */
  setActiveSessionId(id: string | null) {
    this.activeSessionId = id;
  }

  /**
   * Gets the active session ID, falling back to SQLite active orchestrator session.
   */
  getActiveSessionId(): string | null {
    if (this.activeSessionId) return this.activeSessionId;
    const active = getActiveSessions().find((s) => s.role === 'orchestrator');
    return active ? active.id : null;
  }

  /**
   * Fetches full conversation messages for a specific session directly from OpenCode.
   */
  async getSessionMessages(sessionId: string): Promise<Array<{ id: string; sender: 'user' | 'orchestrator'; text: string; timestamp: number }>> {
    const config = this.getServiceConfig();
    if (!config) return [];

    const baseUrl = this.getBaseUrl(config);
    const headers = this.getAuthHeaders(config);

    try {
      const res = await fetch(`${baseUrl}/api/session/${sessionId}/message`, { headers });
      if (!res.ok) return [];
      const json = await res.json();
      const dbMsgs = sqlite
        .prepare('SELECT id, promptMsgId, ticketCreated, pairMessageId, wallPinIds FROM chatMessages WHERE sessionId = ?')
        .all(sessionId) as Array<{ id: string; promptMsgId: string; ticketCreated: number; pairMessageId: string; wallPinIds?: string }>;
      const dbMap = new Map(dbMsgs.map((d) => [d.promptMsgId || d.id, d]));

      const rawList = Array.isArray(json?.data) ? json.data : (Array.isArray(json) ? json : []);
      const parsed = rawList
        .filter((m: { type: string }) => m.type === 'user' || m.type === 'assistant')
        .map((m: { id: string; type: string; text?: string; content?: Array<{ type: string; text?: string }>; time?: { created?: number } }) => {
          let text = m.text || '';
          if (!text && Array.isArray(m.content)) {
            text = m.content
              .filter((c) => c.type === 'text' && c.text)
              .map((c) => c.text)
              .join('\n\n');
          }
          const matched = dbMap.get(m.id);

          let wallPins: Array<{ id: string; title: string }> = [];
          if (matched?.wallPinIds) {
            try {
              const ids: string[] = JSON.parse(matched.wallPinIds);
              if (ids.length > 0) {
                const placeholders = ids.map(() => '?').join(',');
                const rows = sqlite
                  .prepare(`SELECT id, title FROM wallPins WHERE id IN (${placeholders}) AND createdBy = 'orchestrator'`)
                  .all(...ids) as Array<{ id: string; title: string }>;
                wallPins = rows;
              }
            } catch {}
          }

          return {
            id: m.id,
            promptMsgId: m.type === 'user' ? m.id : undefined,
            sessionId,
            ticketCreated: matched ? Boolean(matched.ticketCreated) : false,
            pairMessageId: matched?.pairMessageId || undefined,
            wallPins,
            sender: m.type === 'user' ? ('user' as const) : ('orchestrator' as const),
            text: (text || '').trim(),
            timestamp: Math.floor((m.time?.created || Date.now()) / 1000),
          };
        })
        .filter((m: { text: string }) => m.text.length > 0)
        .reverse();

      return parsed;
    } catch (err) {
      console.warn('Failed to fetch session messages from OpenCode:', err);
      return [];
    }
  }
}

export const openCodeService = new OpenCodeServiceClient();

