import { NextRequest, NextResponse } from 'next/server';
import { chatOrchestrator } from '@/lib/orchestrator/chat';
import { getChatHistory, saveChatMessage, clearChatHistory, updateChatMessage } from '@/lib/db/queries';
import { openCodeService } from '@/lib/opencode/client';
import { getAgentSession } from '@/lib/db/sessionQueries';
import { getActiveOrchestratorModel } from '@/lib/models/service';
import { sqlite } from '@/lib/db/index';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const checkSession = searchParams.get('checkSession');
    const promptMsgId = searchParams.get('promptMsgId') || undefined;
    const messageId = searchParams.get('messageId');

    // Async polling endpoint for long-running prompts
    if (checkSession) {
      const status = await openCodeService.checkSessionStatus(checkSession, promptMsgId);
      if (status.done) {
        const finalReply = status.error
          ? `⚠️ **OpenCode Orchestrator Error**: ${status.error}`
          : status.reply || 'Execution completed.';

        if (messageId) {
          updateChatMessage(messageId, finalReply);
        }

        return NextResponse.json({
          done: true,
          reply: finalReply,
          error: status.error,
        });
      }

      return NextResponse.json({
        done: false,
        step: status.step || 'Executing tools & formulating response...',
      });
    }

    const targetSessionId = searchParams.get('sessionId') || openCodeService.getActiveSessionId();
    let sessionModel: string | undefined;
    let sessionVariant: string | undefined;

    if (targetSessionId) {
      const dbSession = getAgentSession(targetSessionId);
      if (dbSession?.model) {
        const raw = dbSession.model;
        if (raw.includes('#')) {
          const [m, v] = raw.split('#');
          sessionModel = m;
          sessionVariant = v;
        } else {
          sessionModel = raw;
        }
      }
    }

    if (!sessionModel) {
      const activeOrch = getActiveOrchestratorModel();
      sessionModel = activeOrch.model;
      sessionVariant = activeOrch.variant;
    }

    if (targetSessionId) {
      const sessionMsgs = await openCodeService.getSessionMessages(targetSessionId);
      if (sessionMsgs.length > 0) {
        return NextResponse.json({
          messages: sessionMsgs,
          sessionId: targetSessionId,
          model: sessionModel,
          variant: sessionVariant,
        });
      }
    }

    const rawMessages = getChatHistory(150);
    const messages = rawMessages.map((m) => {
      let wallPins: Array<{ id: string; title: string }> = [];
      if (m.wallPinIds) {
        try {
          const ids = JSON.parse(m.wallPinIds);
          if (Array.isArray(ids) && ids.length > 0) {
            const placeholders = ids.map(() => '?').join(',');
            const rows = sqlite
              .prepare(`SELECT id, title FROM wallPins WHERE id IN (${placeholders}) AND createdBy = 'orchestrator'`)
              .all(...ids) as Array<{ id: string; title: string }>;
            wallPins = rows;
          }
        } catch {}
      }
      return {
        ...m,
        wallPins,
      };
    });
    return NextResponse.json({
      messages,
      sessionId: targetSessionId || undefined,
      model: sessionModel,
      variant: sessionVariant,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    clearChatHistory();
    await openCodeService.resetSession();

    return NextResponse.json({
      success: true,
      message: 'Chat history cleared. A new session will be created once you send a message.',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message string is required' }, { status: 400 });
    }

    // 1. Retrieve recent chat chain context
    const previousHistory = getChatHistory(30);

    // 2. Process message through factory orchestrator with full chat chain context
    const response = await chatOrchestrator.handleUserMessage(
      message.trim(),
      previousHistory
    );
    const proactivePromptObj = await chatOrchestrator.getProactivePrompt();

    // 3. Persist user message & orchestrator response with revert metadata
    const userRecord = saveChatMessage('user', message.trim(), {
      ticketCreated: response.ticketCreated ?? false,
      promptMsgId: response.promptMsgId,
      sessionId: response.sessionId,
      wallPinIds: response.wallPinIds,
    });

    const orchestratorRecord = saveChatMessage('orchestrator', response.reply, {
      ticketCreated: response.ticketCreated ?? false,
      promptMsgId: response.promptMsgId,
      sessionId: response.sessionId,
      pairMessageId: userRecord.id,
      wallPinIds: response.wallPinIds,
    });

    return NextResponse.json({
      reply: response.reply,
      actionTaken: response.actionTaken,
      ticketCreated: response.ticketCreated ?? false,
      wallPins: response.wallPins || [],
      wallPinIds: response.wallPinIds || [],
      proactiveAlert: proactivePromptObj,
      proactivePrompt: proactivePromptObj?.message || null,
      userMessage: {
        ...userRecord,
        pairMessageId: orchestratorRecord.id,
        wallPins: response.wallPins || [],
      },
      orchestratorMessage: {
        ...orchestratorRecord,
        wallPins: response.wallPins || [],
      },
      sessionId: response.sessionId,
      promptMsgId: response.promptMsgId,
      model: response.model,
      variant: response.variant,
      isPending: response.isPending || false,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
