import { NextRequest, NextResponse } from 'next/server';
import {
  getActiveSessions,
  getAllSessions,
  deleteAgentSession,
  resumeAgentSession,
  resetManagerSession,
  clearAllSessions,
} from '@/lib/db/sessionQueries';
import { clearChatHistory } from '@/lib/db/queries';
import { eventBus } from '@/lib/orchestrator/events';
import { openCodeService } from '@/lib/opencode/client';
import { setTargetDirectory } from '@/lib/workspace/config';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const directory = searchParams.get('directory') || undefined;

    const active = getActiveSessions();
    const all = getAllSessions(100, directory);

    return NextResponse.json({
      activeCount: active.length,
      activeSessions: active,
      allSessions: all,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, sessionId } = body;

    if (action === 'resume') {
      if (!sessionId) {
        return NextResponse.json({ error: 'sessionId required for resume' }, { status: 400 });
      }
      const session = resumeAgentSession(sessionId);
      if (session?.role === 'orchestrator') {
        openCodeService.setActiveSessionId(sessionId);
        if (session.worktreeDir) {
          try {
            setTargetDirectory(session.worktreeDir);
          } catch {
            // ignore
          }
        }
      }
      eventBus.emitEvent('session:updated', { action: 'resume', sessionId, session });
      return NextResponse.json({ success: true, session });
    }

    if (action === 'reset_manager') {
      resetManagerSession();
      eventBus.emitEvent('session:updated', { action: 'reset_manager' });
      return NextResponse.json({ success: true, message: 'Manager session reset' });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (id) {
      const deleted = deleteAgentSession(id);
      eventBus.emitEvent('session:updated', { action: 'delete', id });
      return NextResponse.json({ success: deleted });
    }

    // If no id, check for clear_all body or param
    const clearAll = searchParams.get('clearAll') === 'true';
    if (clearAll) {
      clearAllSessions();
      clearChatHistory();
      await openCodeService.resetSession();
      eventBus.emitEvent('session:updated', { action: 'clear_all' });
      return NextResponse.json({ success: true, message: 'All sessions and chat cleared' });
    }

    return NextResponse.json({ error: 'Missing session id or clearAll parameter' }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
