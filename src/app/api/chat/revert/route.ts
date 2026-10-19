import { NextRequest, NextResponse } from 'next/server';
import { openCodeService } from '@/lib/opencode/client';
import { deleteChatTurn } from '@/lib/db/queries';
import { removeOrchestratorWallPins } from '@/lib/db/wallQueries';
import { eventBus } from '@/lib/orchestrator/events';
import { db } from '@/lib/db';
import { chatMessages } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, promptMsgId, userMessageId, orchestratorMessageId } = body;

    if (!userMessageId) {
      return NextResponse.json({ error: 'userMessageId is required for revert' }, { status: 400 });
    }

    // 1. Fetch user message record to get original text for pre-populating the input
    const userMsgRecord = db.select().from(chatMessages).where(eq(chatMessages.id, userMessageId)).get();
    const revertedText = userMsgRecord?.text || '';

    // Safety check: if this turn triggered a ticket, reject revert
    if (userMsgRecord?.ticketCreated) {
      return NextResponse.json(
        { error: 'Cannot revert a chat turn that created a Kanban task ticket.' },
        { status: 400 }
      );
    }

    // 2. Perform OpenCode session rollback if sessionId & promptMsgId are provided
    const targetSessionId = sessionId || userMsgRecord?.sessionId || openCodeService.getActiveSessionId();
    const targetPromptId = promptMsgId || userMsgRecord?.promptMsgId || undefined;

    if (targetSessionId) {
      try {
        await openCodeService.revertTurn(targetSessionId, targetPromptId);
      } catch (err) {
        console.warn('OpenCode session rollback warning:', err);
      }
    }

    // 3. Rollback any Wall pins created by the orchestrator during this turn
    let removedWallPins: string[] = [];
    const pinIdsToClean: string[] = [];

    if (body.wallPinIds && Array.isArray(body.wallPinIds)) {
      pinIdsToClean.push(...body.wallPinIds);
    }
    if (userMsgRecord?.wallPinIds) {
      try {
        const parsed = JSON.parse(userMsgRecord.wallPinIds);
        if (Array.isArray(parsed)) pinIdsToClean.push(...parsed);
      } catch {}
    }

    if (pinIdsToClean.length > 0) {
      const uniquePinIds = Array.from(new Set(pinIdsToClean));
      const res = removeOrchestratorWallPins(uniquePinIds);
      removedWallPins = res.removedTitles;
      if (res.count > 0) {
        eventBus.emitEvent('wall:updated', { action: 'reverted', count: res.count });
      }
    }

    // 4. Purge turn from SQLite chat history
    const targetOrchId = orchestratorMessageId || userMsgRecord?.pairMessageId || undefined;
    deleteChatTurn(userMessageId, targetOrchId);

    return NextResponse.json({
      success: true,
      revertedText,
      userMessageId,
      orchestratorMessageId: targetOrchId,
      removedWallPins,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Error in /api/chat/revert:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
