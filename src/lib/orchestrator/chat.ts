import {
  getAllTickets,
} from '@/lib/db/queries';
import { ChatMessageRecord } from '@/lib/db/schema';
import { openCodeService } from '@/lib/opencode/client';

export interface ChatActionResponse {
  reply: string;
  sessionId?: string;
  promptMsgId?: string;
  isPending?: boolean;
  ticketCreated?: boolean;
  model?: string;
  variant?: string;
  wallPins?: Array<{ id: string; title: string }>;
  wallPinIds?: string[];
  actionTaken?: {
    type: 'ticket_created' | 'ticket_updated' | 'ticket_revived' | 'comment_added' | 'none';
    ticketId?: string;
    details?: string;
  };
}

export class ChatOrchestrator {
  private activeModelOverride: string | null = null;

  // Analyze user message with recent conversation chain history
  async handleUserMessage(
    message: string,
    history: ChatMessageRecord[] = []
  ): Promise<ChatActionResponse> {
    const trimmed = message.trim();
    const lower = trimmed.toLowerCase();

    // 0. Model Override Command
    const modelOverrideMatch = lower.match(
      /(?:override|change|set|switch)\s+(?:the\s+)?(?:orchestrator\s+)?model\s+(?:to\s+)?([a-z0-9_\-./]+)/i
    );
    if (modelOverrideMatch) {
      this.activeModelOverride = modelOverrideMatch[1];
      return {
        reply: `**Model Override Configured**\n\n- **Target Model**: \`${this.activeModelOverride}\`\n- **Scope**: Orchestrator & newly dispatched agent workers.\n\nAll subsequent tasks will pass this model preference to the OpenCode runtime.`,
        actionTaken: {
          type: 'none',
          details: `Model set to ${this.activeModelOverride}`,
        },
      };
    }

    // 1. Session Reset Command
    if (lower === '/reset' || lower === '/clear' || lower === 'reset session' || lower === 'reset manager') {
      await openCodeService.resetSession();
      return {
        reply: `**Session Reset**\n\nThe Orchestrator session has been refreshed with a clean context.`,
        actionTaken: {
          type: 'none',
          details: 'Reset orchestrator session',
        },
      };
    }

    // 2. Direct inquiry to OpenCode Orchestrator Agent
    // Forward full natural language directly to the LLM agent equipped with factory MCP tools
    try {
      const ocResult = await openCodeService.sendPrompt(trimmed, this.activeModelOverride || undefined);
      return {
        reply: ocResult.reply,
        sessionId: ocResult.sessionId,
        promptMsgId: ocResult.promptMsgId,
        isPending: ocResult.isPending,
        ticketCreated: ocResult.ticketCreated,
        model: ocResult.model,
        variant: ocResult.variant,
        wallPins: ocResult.wallPinsCreated || [],
        wallPinIds: (ocResult.wallPinsCreated || []).map((p) => p.id),
        actionTaken: ocResult.actionTaken,
      };
    } catch (err: unknown) {
      console.error('OpenCode Orchestrator query failed:', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        reply: `⚠️ **OpenCode Orchestrator Notice**\n\nCould not reach OpenCode runtime: ${errMsg}\n\nPlease ensure \`opencode service start\` is running.`,
        actionTaken: {
          type: 'none',
        },
      };
    }
  }

  // Get proactive check messages
  async getProactivePrompt(): Promise<{ ticketId: string; title: string; message: string } | null> {
    const allTickets = await getAllTickets();
    const readyForUserTest = allTickets.filter(
      (t) => t.status === 'agent_tested' || t.status === 'agent_done'
    );

    if (readyForUserTest.length > 0) {
      const ticket = readyForUserTest[0];
      return {
        ticketId: ticket.id,
        title: ticket.title,
        message: `Ticket "${ticket.title}" is ready for your verification. Reply "approve" to merge to main!`,
      };
    }

    return null;
  }
}

export const chatOrchestrator = new ChatOrchestrator();
