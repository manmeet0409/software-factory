import { NextRequest, NextResponse } from 'next/server';
import { addComment, getTicketById, updateTicketStatus } from '@/lib/db/queries';
import { eventBus } from '@/lib/orchestrator/events';
import { taskRunner } from '@/lib/orchestrator/runner';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { author = 'user', content, type = 'feedback', retrigger = false } = body;

    if (!content) {
      return NextResponse.json({ error: 'Comment content is required' }, { status: 400 });
    }

    const ticket = await getTicketById(id);
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    const comment = await addComment(id, author, content, type);
    eventBus.emitEvent('comment:added', { ticketId: id, author, content, type });

    // If user asked to retrigger execution with this feedback
    if (retrigger && (ticket.status === 'agent_done' || ticket.status === 'agent_tested' || ticket.status === 'user_tested')) {
      await updateTicketStatus(id, 'in_progress', 'user', 'Retriggered execution based on feedback');
      taskRunner.startTicketExecution(id).catch(console.error);
    }

    return NextResponse.json({ comment }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
