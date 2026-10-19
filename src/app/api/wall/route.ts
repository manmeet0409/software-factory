import { NextRequest, NextResponse } from 'next/server';
import {
  getWallPins,
  getWallTaxonomy,
  getPendingWallRequests,
  createWallPin,
  createWallRequest,
  reviewWallRequest,
  addTaxonomyItem,
  archiveWallPin,
  unarchiveWallPin,
  updateWallPin,
} from '@/lib/db/wallQueries';
import {
  PinToWallInputSchema,
  RequestPinToWallInputSchema,
  RequestTaxonomyInputSchema,
  ReviewRequestInputSchema,
} from '@/lib/orchestrator/tools/schemas';
import { eventBus } from '@/lib/orchestrator/events';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const module = searchParams.get('module') || undefined;
    const tag = searchParams.get('tag') || undefined;
    const category = (searchParams.get('category') as any) || undefined;
    const search = searchParams.get('search') || undefined;
    const archivedOnly = searchParams.get('archivedOnly') === 'true';
    const includeArchived = searchParams.get('includeArchived') === 'true';

    const rawPins = getWallPins({
      module,
      tag,
      category,
      searchQuery: search,
      archivedOnly,
      includeArchived,
    });
    const pins = rawPins.map((p) => ({
      ...p,
      tags: JSON.parse(p.tags) as string[],
    }));

    const taxonomy = getWallTaxonomy();
    const pendingRequests = getPendingWallRequests().map((r) => ({
      ...r,
      payload: JSON.parse(r.payload),
    }));

    return NextResponse.json({
      pins,
      taxonomy,
      pendingRequests,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, caller = 'user', data } = body;

    if (action === 'request_pin') {
      const parsed = RequestPinToWallInputSchema.parse(data);
      const reqRecord = createWallRequest('pin', caller, parsed);
      eventBus.emitEvent('wall:updated', { action: 'request_pin' });
      return NextResponse.json({ request: reqRecord });
    }

    if (action === 'pin_direct') {
      const parsed = PinToWallInputSchema.parse(data);
      const pin = createWallPin({
        ...parsed,
        createdBy: caller,
      });
      eventBus.emitEvent('wall:updated', { action: 'pin_direct', pinId: pin.id });
      return NextResponse.json({
        pin: { ...pin, tags: JSON.parse(pin.tags) },
      });
    }

    if (action === 'request_taxonomy') {
      const parsed = RequestTaxonomyInputSchema.parse(data);
      const reqRecord = createWallRequest('taxonomy', caller, parsed);
      eventBus.emitEvent('wall:updated', { action: 'request_taxonomy' });
      return NextResponse.json({ request: reqRecord });
    }

    if (action === 'add_taxonomy') {
      const { type, name, description } = data;
      const item = addTaxonomyItem(type, name, description);
      eventBus.emitEvent('wall:updated', { action: 'add_taxonomy' });
      return NextResponse.json({ item });
    }

    return NextResponse.json({ error: `Unknown action "${action}"` }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, data } = body;

    if (action === 'review_request') {
      const parsed = ReviewRequestInputSchema.parse(data);
      const result = reviewWallRequest(
        parsed.requestId,
        parsed.decision,
        parsed.critiqueOrSuggestions,
        parsed.editedPin
      );
      eventBus.emitEvent('wall:updated', { action: 'review_request' });
      return NextResponse.json(result);
    }

    if (action === 'archive_pin') {
      const { pinId } = data;
      const success = archiveWallPin(pinId);
      eventBus.emitEvent('wall:updated', { action: 'archive_pin', pinId });
      return NextResponse.json({ success });
    }

    if (action === 'unarchive_pin') {
      const { pinId } = data;
      const success = unarchiveWallPin(pinId);
      eventBus.emitEvent('wall:updated', { action: 'unarchive_pin', pinId });
      return NextResponse.json({ success });
    }

    if (action === 'edit_pin') {
      const { pinId, updates } = data;
      const updated = updateWallPin(pinId, updates);
      eventBus.emitEvent('wall:updated', { action: 'edit_pin', pinId });
      return NextResponse.json({
        updatedPin: updated ? { ...updated, tags: JSON.parse(updated.tags) } : null,
      });
    }

    return NextResponse.json({ error: `Unknown action "${action}"` }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
