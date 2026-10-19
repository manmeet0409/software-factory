import { eq, desc, and, inArray } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db } from './index';
import {
  wallPins,
  wallTaxonomy,
  wallRequests,
  type WallPinRecord,
  type WallTaxonomyRecord,
  type WallRequestRecord,
  type WallCategory,
  type TaxonomyType,
} from './schema';

export interface WallPinFilter {
  module?: string;
  tag?: string;
  category?: WallCategory;
  searchQuery?: string;
  includeArchived?: boolean;
  archivedOnly?: boolean;
  limit?: number;
}

export interface CreatePinInput {
  title: string;
  description: string;
  category: WallCategory;
  module: string;
  tags: string[];
  createdBy: string;
}

/**
 * Returns pins from The Wall with optional module/tag/category filters.
 */
export function getWallPins(filter: WallPinFilter = {}): WallPinRecord[] {
  const limit = filter.limit ?? 100;
  const includeArchived = filter.includeArchived ?? false;

  const query = db
    .select()
    .from(wallPins)
    .orderBy(desc(wallPins.createdAt))
    .limit(limit);

  const results = query.all();

  return results.filter((pin) => {
    if (filter.archivedOnly) {
      if (pin.archived !== 1) return false;
    } else if (!includeArchived && pin.archived === 1) {
      return false;
    }
    if (filter.module && pin.module.toLowerCase() !== filter.module.toLowerCase()) return false;
    if (filter.category && pin.category !== filter.category) return false;
    if (filter.tag) {
      try {
        const pinTags: string[] = JSON.parse(pin.tags);
        if (!pinTags.some((t) => t.toLowerCase() === filter.tag!.toLowerCase())) return false;
      } catch {
        return false;
      }
    }
    if (filter.searchQuery) {
      const q = filter.searchQuery.toLowerCase();
      const inTitle = pin.title.toLowerCase().includes(q);
      const inDesc = pin.description.toLowerCase().includes(q);
      if (!inTitle && !inDesc) return false;
    }
    return true;
  });
}

/**
 * Creates and publishes a verified pin to The Wall.
 */
export function createWallPin(input: CreatePinInput): WallPinRecord {
  const now = Math.floor(Date.now() / 1000);
  const pinId = uuidv4();

  const record: WallPinRecord = {
    id: pinId,
    title: input.title,
    description: input.description,
    category: input.category,
    module: input.module.toLowerCase(),
    tags: JSON.stringify(input.tags.map((t) => t.toLowerCase())),
    createdBy: input.createdBy,
    createdAt: now,
    archived: 0,
  };

  db.insert(wallPins).values(record).run();
  return record;
}

/**
 * Updates a pin on The Wall (used by Manager / Orchestrator for organization).
 */
export function updateWallPin(
  id: string,
  updates: Partial<{
    title: string;
    description: string;
    module: string;
    tags: string[];
    category: WallCategory;
    archived: number;
  }>
): WallPinRecord | null {
  const existing = db.select().from(wallPins).where(eq(wallPins.id, id)).get();
  if (!existing) return null;

  const patch: Partial<WallPinRecord> = {};
  if (updates.title !== undefined) patch.title = updates.title;
  if (updates.description !== undefined) patch.description = updates.description;
  if (updates.module !== undefined) patch.module = updates.module.toLowerCase();
  if (updates.tags !== undefined) patch.tags = JSON.stringify(updates.tags.map((t) => t.toLowerCase()));
  if (updates.category !== undefined) patch.category = updates.category;
  if (updates.archived !== undefined) patch.archived = updates.archived;

  db.update(wallPins).set(patch).where(eq(wallPins.id, id)).run();
  return { ...existing, ...patch };
}

/**
 * Archives a pin on The Wall.
 */
export function archiveWallPin(id: string): boolean {
  const res = db.update(wallPins).set({ archived: 1 }).where(eq(wallPins.id, id)).run();
  return res.changes > 0;
}

/**
 * Unarchives / restores a pin back to The Wall.
 */
export function unarchiveWallPin(id: string): boolean {
  const res = db.update(wallPins).set({ archived: 0 }).where(eq(wallPins.id, id)).run();
  return res.changes > 0;
}

/**
 * Retrieves the complete active taxonomy (modules & tags).
 */
export function getWallTaxonomy(): {
  modules: Array<{ name: string; description: string }>;
  tags: Array<{ name: string; description: string }>;
} {
  const records = db.select().from(wallTaxonomy).all();

  const modules = records
    .filter((r) => r.type === 'module')
    .map((r) => ({ name: r.name, description: r.description ?? '' }));

  const tags = records
    .filter((r) => r.type === 'tag')
    .map((r) => ({ name: r.name, description: r.description ?? '' }));

  return { modules, tags };
}

/**
 * Adds an authorized tag or module to the Wall taxonomy.
 */
export function addTaxonomyItem(type: TaxonomyType, name: string, description?: string): WallTaxonomyRecord {
  const cleanName = name.trim().toLowerCase();
  const existing = db
    .select()
    .from(wallTaxonomy)
    .where(and(eq(wallTaxonomy.type, type), eq(wallTaxonomy.name, cleanName)))
    .get();

  if (existing) return existing;

  const record: WallTaxonomyRecord = {
    id: uuidv4(),
    type,
    name: cleanName,
    description: description ?? null,
    createdAt: Math.floor(Date.now() / 1000),
  };

  db.insert(wallTaxonomy).values(record).run();
  return record;
}

/**
 * Submits a draft pin or taxonomy addition to the Manager for review.
 */
export function createWallRequest(
  type: 'pin' | 'taxonomy',
  submittedBy: string,
  payload: unknown
): WallRequestRecord {
  const record: WallRequestRecord = {
    id: uuidv4(),
    type,
    submittedBy,
    status: 'pending',
    payload: JSON.stringify(payload),
    critiqueOrSuggestions: null,
    createdAt: Math.floor(Date.now() / 1000),
    reviewedAt: null,
  };

  db.insert(wallRequests).values(record).run();
  return record;
}

/**
 * Returns pending requests submitted by builders awaiting Manager review.
 */
export function getPendingWallRequests(type?: 'pin' | 'taxonomy'): WallRequestRecord[] {
  const allPending = db
    .select()
    .from(wallRequests)
    .where(eq(wallRequests.status, 'pending'))
    .orderBy(desc(wallRequests.createdAt))
    .all();

  if (!type) return allPending;
  return allPending.filter((r) => r.type === type);
}

/**
 * Manager reviews and acts on a pending request (approve, approve with edits, or reject).
 */
export function reviewWallRequest(
  requestId: string,
  decision: 'approve' | 'approve_with_edits' | 'reject',
  critique: string,
  editedPayload?: unknown
): {
  request: WallRequestRecord;
  publishedPin?: WallPinRecord;
  createdTaxonomy?: WallTaxonomyRecord;
} {
  const request = db.select().from(wallRequests).where(eq(wallRequests.id, requestId)).get();
  if (!request) {
    throw new Error(`Wall request ${requestId} not found`);
  }

  const now = Math.floor(Date.now() / 1000);
  const status = decision === 'reject' ? 'rejected' : 'approved';

  db.update(wallRequests)
    .set({
      status,
      critiqueOrSuggestions: critique,
      reviewedAt: now,
    })
    .where(eq(wallRequests.id, requestId))
    .run();

  const finalPayload = editedPayload ?? JSON.parse(request.payload);

  let publishedPin: WallPinRecord | undefined;
  let createdTaxonomy: WallTaxonomyRecord | undefined;

  if (status === 'approved') {
    if (request.type === 'pin') {
      const pinData = finalPayload as CreatePinInput;
      publishedPin = createWallPin({
        title: pinData.title,
        description: pinData.description,
        category: pinData.category,
        module: pinData.module,
        tags: pinData.tags,
        createdBy: `manager (reviewed from ${request.submittedBy})`,
      });
    } else if (request.type === 'taxonomy') {
      const taxData = finalPayload as { type: TaxonomyType; name: string; description?: string };
      createdTaxonomy = addTaxonomyItem(taxData.type, taxData.name, taxData.description);
    }
  }

  return {
    request: { ...request, status, critiqueOrSuggestions: critique, reviewedAt: now },
    publishedPin,
    createdTaxonomy,
  };
}

/**
 * Retrieves wall pins by IDs, strictly filtering ONLY those created by the orchestrator.
 */
export function getOrchestratorWallPinsByIds(pinIds: string[]): WallPinRecord[] {
  if (!pinIds || pinIds.length === 0) return [];
  return db
    .select()
    .from(wallPins)
    .where(and(inArray(wallPins.id, pinIds), eq(wallPins.createdBy, 'orchestrator')))
    .all();
}

/**
 * Permanently removes wall pins created by the orchestrator.
 * Targets ONLY pins where createdBy === 'orchestrator', never touching user or manager pins.
 */
export function removeOrchestratorWallPins(pinIds: string[]): { count: number; removedTitles: string[] } {
  if (!pinIds || pinIds.length === 0) return { count: 0, removedTitles: [] };

  const targets = getOrchestratorWallPinsByIds(pinIds);
  if (targets.length === 0) return { count: 0, removedTitles: [] };

  const removedTitles: string[] = [];
  for (const pin of targets) {
    db.delete(wallPins)
      .where(and(eq(wallPins.id, pin.id), eq(wallPins.createdBy, 'orchestrator')))
      .run();
    removedTitles.push(pin.title);
  }

  return { count: removedTitles.length, removedTitles };
}
