import { NextRequest, NextResponse } from 'next/server';
import { getTicketById, updateTicketStatus, deleteTicket } from '@/lib/db/queries';
import { taskRunner } from '@/lib/orchestrator/runner';
import { eventBus } from '@/lib/orchestrator/events';
import { TicketStatus } from '@/lib/db/schema';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ticket = await getTicketById(id);

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    return NextResponse.json({ ticket });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status, actor = 'user', summary } = body;

    const ticket = await getTicketById(id);
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    if (status) {
      if (status === 'done') {
        // Complete ticket: auto-merge worktree and trigger next pending tickets
        await taskRunner.completeTicket(id);
      } else if (status === 'in_progress') {
        // Start or restart execution
        await taskRunner.startTicketExecution(id);
      } else {
        await updateTicketStatus(id, status as TicketStatus, actor, summary);
        eventBus.emitEvent('ticket:updated', { ticketId: id, status });
      }
    }

    const updated = await getTicketById(id);
    return NextResponse.json({ ticket: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const deleted = deleteTicket(id);
    if (!deleted) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }
    eventBus.emitEvent('ticket:updated', { ticketId: id, status: 'deleted' });
    return NextResponse.json({ success: true, id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

