import { NextRequest, NextResponse } from 'next/server';
import { getAllTickets, createTicket } from '@/lib/db/queries';
import { taskRunner } from '@/lib/orchestrator/runner';
import { eventBus } from '@/lib/orchestrator/events';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const status = searchParams.get('status');
    const tickets = await getAllTickets();

    if (status) {
      return NextResponse.json({ tickets: tickets.filter((t) => t.status === status) });
    }

    return NextResponse.json({ tickets });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, description, parentTicketId, assignedModel } = body;

    if (!title || !description) {
      return NextResponse.json({ error: 'Title and description are required' }, { status: 400 });
    }

    const ticket = await createTicket({
      title,
      description,
      parentTicketId: parentTicketId || null,
      assignedModel: assignedModel || null,
    });

    eventBus.emitEvent('ticket:created', { ticketId: ticket.id, title: ticket.title });

    // Trigger runner in background to execute if capacity is available
    taskRunner.processPendingTickets().catch(console.error);

    return NextResponse.json({ ticket }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
