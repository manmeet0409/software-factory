import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import {
  getWallPins,
  createWallPin,
  updateWallPin,
  archiveWallPin,
  getWallTaxonomy,
  addTaxonomyItem,
  createWallRequest,
  getPendingWallRequests,
  reviewWallRequest,
} from '@/lib/db/wallQueries';
import {
  createTicket,
  getTicketById,
  getAllTickets,
  updateTicketStatus,
  addComment,
  deleteTicket,
} from '@/lib/db/queries';
import { taskRunner } from '@/lib/orchestrator/runner';
import { eventBus } from '@/lib/orchestrator/events';
import { getTargetDirectory } from '@/lib/workspace/config';
import type {
  ReadWallInput,
  RequestPinToWallInput,
  PinToWallInput,
  RequestTaxonomyInput,
  ManageWallTaxonomyInput,
  ListPendingRequestsInput,
  ReviewRequestInput,
  OrganizeWallInput,
  CreateTicketToolInput,
  SteerTaskToolInput,
  InspectTaskToolInput,
  ManageTicketToolInput,
  GetBoardStatusToolInput,
  ListWorkspaceToolInput,
} from './schemas';

// ==========================================
// 1. THE WALL HANDLERS
// ==========================================

export async function handleReadWall(input: ReadWallInput) {
  const pins = getWallPins({
    module: input.module,
    tag: input.tag,
    category: input.category,
    searchQuery: input.searchQuery,
    limit: input.limit,
  });

  const taxonomy = getWallTaxonomy();

  return {
    pins: pins.map((p) => ({
      ...p,
      tags: JSON.parse(p.tags) as string[],
    })),
    totalMatches: pins.length,
    allowedTaxonomy: taxonomy,
  };
}

export async function handleRequestPinToWall(input: RequestPinToWallInput, caller: string) {
  const taxonomy = getWallTaxonomy();
  const validModules = taxonomy.modules.map((m) => m.name.toLowerCase());
  const validTags = taxonomy.tags.map((t) => t.name.toLowerCase());

  if (!validModules.includes(input.module.toLowerCase())) {
    throw new Error(
      `Module "${input.module}" is not authorized. Valid modules: [${validModules.join(', ')}]. Use request_taxonomy first.`
    );
  }

  const invalidTags = input.tags.filter((t) => !validTags.includes(t.toLowerCase()));
  if (invalidTags.length > 0) {
    throw new Error(
      `Tags [${invalidTags.join(', ')}] are not authorized. Valid tags: [${validTags.join(', ')}]. Use request_taxonomy first.`
    );
  }

  const request = createWallRequest('pin', caller, input);

  return {
    requestId: request.id,
    status: 'submitted_to_manager',
    message: `Proposed pin "${input.title}" submitted to Manager for critique and approval.`,
  };
}

export async function handlePinToWall(input: PinToWallInput, caller: string) {
  const taxonomy = getWallTaxonomy();
  const validModules = taxonomy.modules.map((m) => m.name.toLowerCase());
  const validTags = taxonomy.tags.map((t) => t.name.toLowerCase());

  if (!validModules.includes(input.module.toLowerCase())) {
    throw new Error(`Module "${input.module}" is not authorized. Authorized: [${validModules.join(', ')}]`);
  }

  const pin = createWallPin({
    title: input.title,
    description: input.description,
    category: input.category,
    module: input.module,
    tags: input.tags,
    createdBy: caller,
  });

  return {
    pin: {
      ...pin,
      tags: JSON.parse(pin.tags) as string[],
    },
    status: 'pinned',
  };
}

export async function handleRequestTaxonomy(input: RequestTaxonomyInput, caller: string) {
  const request = createWallRequest('taxonomy', caller, input);

  return {
    requestId: request.id,
    status: 'pending_manager_critique',
    message: `Request to add ${input.type} "${input.proposedName}" submitted to Manager.`,
  };
}

export async function handleManageWallTaxonomy(input: ManageWallTaxonomyInput) {
  if (input.action === 'add') {
    const item = addTaxonomyItem(input.type, input.name, input.description);
    return {
      status: 'added',
      item,
      currentTaxonomy: getWallTaxonomy(),
    };
  }

  return {
    status: 'retire_not_implemented',
    message: 'Taxonomy items are currently preserved for historical pin integrity.',
    currentTaxonomy: getWallTaxonomy(),
  };
}

export async function handleListPendingRequests(input: ListPendingRequestsInput) {
  const requests = getPendingWallRequests(input.type);
  return {
    count: requests.length,
    requests: requests.map((r) => ({
      id: r.id,
      type: r.type,
      submittedBy: r.submittedBy,
      data: JSON.parse(r.payload),
      createdAt: r.createdAt,
    })),
  };
}

export async function handleReviewRequest(input: ReviewRequestInput) {
  const outcome = reviewWallRequest(
    input.requestId,
    input.decision,
    input.critiqueOrSuggestions,
    input.editedPin
  );

  return {
    requestId: input.requestId,
    decision: input.decision,
    critique: input.critiqueOrSuggestions,
    publishedPin: outcome.publishedPin
      ? {
          ...outcome.publishedPin,
          tags: JSON.parse(outcome.publishedPin.tags) as string[],
        }
      : null,
    createdTaxonomy: outcome.createdTaxonomy ?? null,
  };
}

export async function handleOrganizeWall(input: OrganizeWallInput) {
  if (input.action === 'archive') {
    const success = archiveWallPin(input.pinId);
    return { success, message: success ? `Pin ${input.pinId} archived.` : 'Pin not found.' };
  }

  if (input.action === 'edit' && input.updates) {
    const updated = updateWallPin(input.pinId, input.updates);
    return {
      success: !!updated,
      updatedPin: updated ? { ...updated, tags: JSON.parse(updated.tags) as string[] } : null,
      message: updated ? `Pin ${input.pinId} updated.` : 'Pin not found.',
    };
  }

  return { success: false, message: 'Invalid organize action.' };
}

// ==========================================
// 2. KANBAN & ORCHESTRATOR HANDLERS
// ==========================================

export async function handleCreateTicket(input: CreateTicketToolInput) {
  const newTicket = createTicket({
    title: input.title,
    description: input.description,
    parentTicketId: input.parentTicketId,
  });

  eventBus.emitEvent('ticket:created', { ticketId: newTicket.id, title: newTicket.title });
  taskRunner.processPendingTickets().catch(console.error);

  return {
    ticketId: newTicket.id,
    title: newTicket.title,
    status: newTicket.status,
    assignedWorktreeBranch: `ticket/${newTicket.id.slice(0, 8)}`,
  };
}

export async function handleSteerTask(input: SteerTaskToolInput) {
  const ticket = getTicketById(input.ticketId);
  if (!ticket) throw new Error(`Ticket ${input.ticketId} not found`);

  // 1. Inject guidance comment & re-trigger if needed
  if (input.guidancePrompt) {
    addComment(ticket.id, 'orchestrator', `[STEERING INSTRUCTION]: ${input.guidancePrompt}`, 'feedback');
    eventBus.emitEvent('comment:added', {
      ticketId: ticket.id,
      author: 'orchestrator',
      content: input.guidancePrompt,
    });
  }

  return {
    ticketId: ticket.id,
    steered: true,
    message: `Steering instruction recorded for ticket "${ticket.title}".`,
  };
}

export async function handleInspectTask(input: InspectTaskToolInput) {
  const ticket = getTicketById(input.ticketId);
  if (!ticket) throw new Error(`Ticket ${input.ticketId} not found`);

  let gitDiff: string | undefined;
  if (input.includeDiff && ticket.worktreeDir && fs.existsSync(ticket.worktreeDir)) {
    try {
      gitDiff = execSync('git diff main', {
        cwd: ticket.worktreeDir,
        encoding: 'utf-8',
        maxBuffer: 2 * 1024 * 1024,
      });
    } catch {
      gitDiff = 'Diff unavailable or branch clean.';
    }
  }

  return {
    ticketId: ticket.id,
    title: ticket.title,
    status: ticket.status,
    briefingSummary: ticket.summary,
    gitDiff: gitDiff || 'No diff available.',
    comments: ticket.comments.map((c) => ({
      author: c.author,
      type: c.type,
      content: c.content,
      createdAt: c.createdAt,
    })),
    activityLogs: ticket.activityLogs.map((l) => ({
      action: l.action,
      actor: l.actor,
      summary: l.summary,
      timestamp: l.timestamp,
    })),
  };
}

export async function handleManageTicket(input: ManageTicketToolInput) {
  const ticket = getTicketById(input.ticketId);
  if (!ticket) throw new Error(`Ticket ${input.ticketId} not found`);

  if (input.action === 'approve_and_merge') {
    await taskRunner.completeTicket(ticket.id);
    return {
      ticketId: ticket.id,
      newStatus: 'done' as const,
      details: `Ticket "${ticket.title}" approved, branch merged into main, worktree cleaned up.`,
    };
  }

  if (input.action === 'request_iteration') {
    if (!input.iterationFeedback) {
      throw new Error('iterationFeedback is required when requesting iteration');
    }
    addComment(ticket.id, 'orchestrator', input.iterationFeedback, 'feedback');
    await updateTicketStatus(ticket.id, 'in_progress', 'orchestrator', 'Returned to in_progress for iteration');
    taskRunner.startTicketExecution(ticket.id).catch(console.error);

    return {
      ticketId: ticket.id,
      newStatus: 'in_progress' as const,
      details: `Returned ticket "${ticket.title}" to in_progress with feedback.`,
    };
  }

  if (input.action === 'delete') {
    deleteTicket(ticket.id);
    eventBus.emitEvent('ticket:updated', { ticketId: ticket.id, status: 'deleted' });
    return {
      ticketId: ticket.id,
      newStatus: 'deleted' as const,
      details: `Ticket "${ticket.title}" has been permanently deleted.`,
    };
  }

  throw new Error(`Unsupported action: ${input.action}`);
}

export async function handleGetBoardStatus(input: GetBoardStatusToolInput = {}) {
  const all = getAllTickets();

  const filterModule = (t: { description: string }) => {
    if (!input.moduleFilter) return true;
    return t.description.toLowerCase().includes(input.moduleFilter.toLowerCase());
  };

  const pending = all.filter((t) => t.status === 'pending' && filterModule(t));
  const inProgress = all.filter((t) => t.status === 'in_progress' && filterModule(t));
  const agentDone = all.filter((t) => t.status === 'agent_done' && filterModule(t));
  const agentTested = all.filter((t) => t.status === 'agent_tested' && filterModule(t));
  const userTested = all.filter((t) => t.status === 'user_tested' && filterModule(t));
  const done = all.filter((t) => t.status === 'done' && filterModule(t));

  return {
    activeWorkers: taskRunner.getActiveWorkersCount(),
    maxWorkerSlots: 4,
    columns: {
      pending: pending.map((t) => ({ id: t.id, title: t.title })),
      in_progress: inProgress.map((t) => ({ id: t.id, title: t.title })),
      agent_done: agentDone.map((t) => ({ id: t.id, title: t.title })),
      agent_tested: agentTested.map((t) => ({ id: t.id, title: t.title })),
      user_tested: userTested.map((t) => ({ id: t.id, title: t.title })),
      doneCount: done.length,
    },
  };
}

export async function handleListWorkspace(input: ListWorkspaceToolInput) {
  const rootDir = getTargetDirectory();
  const targetDir = input.subPath ? path.join(rootDir, input.subPath) : rootDir;

  if (!fs.existsSync(targetDir)) {
    throw new Error(`Directory ${targetDir} does not exist`);
  }

  let branch = 'main';
  try {
    branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: rootDir, encoding: 'utf-8' }).trim();
  } catch {
    // ignore
  }

  const entries = fs.readdirSync(targetDir, { withFileTypes: true });
  const files = entries
    .filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules')
    .slice(0, 40)
    .map((e) => ({
      name: e.name,
      isDirectory: e.isDirectory(),
    }));

  return {
    rootPath: rootDir,
    targetPath: targetDir,
    branch,
    totalItems: files.length,
    files,
  };
}
