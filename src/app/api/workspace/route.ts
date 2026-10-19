import { NextRequest, NextResponse } from 'next/server';
import {
  getWorkspaceInfo,
  setTargetDirectory,
  inspectDirectory,
  browseFolder,
  getSubdirectories,
} from '@/lib/workspace/config';
import { eventBus } from '@/lib/orchestrator/events';
import { openCodeService } from '@/lib/opencode/client';
import { clearChatHistory } from '@/lib/db/queries';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // 1. Native Windows Explorer folder picker invocation
    if (searchParams.get('browse') === 'true') {
      const initialPath = searchParams.get('initialPath') || undefined;
      const selected = await browseFolder(initialPath);
      return NextResponse.json({ selected });
    }

    // 2. Real-time path inspection
    const checkPath = searchParams.get('checkPath');
    if (checkPath) {
      const inspected = inspectDirectory(checkPath);
      return NextResponse.json({ info: inspected });
    }

    // 3. Subdirectory listing for fast in-modal navigation
    const subdirs = searchParams.get('subdirs');
    if (subdirs) {
      const explorer = getSubdirectories(subdirs);
      return NextResponse.json({ explorer });
    }

    // Default: current configured workspace info
    const info = getWorkspaceInfo();
    return NextResponse.json({ workspace: info });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { directory } = body;

    if (!directory || typeof directory !== 'string') {
      return NextResponse.json({ error: 'Directory path string is required' }, { status: 400 });
    }

    const info = setTargetDirectory(directory);

    // 1. Reset OpenCode orchestrator session for new workspace directory profile
    try {
      await openCodeService.resetSession();
    } catch (sessionErr) {
      console.warn('Failed to reset orchestrator session on workspace switch:', sessionErr);
    }

    // 2. Clear old chat context so the user starts fresh in the new directory profile
    try {
      clearChatHistory();
    } catch (chatErr) {
      console.warn('Failed to clear chat history on workspace switch:', chatErr);
    }

    // 3. Emit real-time events for UI components
    eventBus.emitEvent('workspace:changed', {
      directory: info.directory,
      isGit: info.isGit,
      branch: info.branch,
    });
    eventBus.emitEvent('session:updated', {
      action: 'workspace_change',
      directory: info.directory,
    });
    eventBus.emitEvent('activity:logged', {
      action: 'workspace:changed',
      directory: info.directory,
      isGit: info.isGit,
    });

    return NextResponse.json({ workspace: info });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
