import { eq, and, desc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db } from './index';
import {
  attachments,
  type AttachmentRecord,
  type AttachmentScope,
} from './schema';

export interface CreateAttachmentInput {
  id?: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  storagePath: string;
  scope: AttachmentScope;
  entityId?: string | null;
  createdAt?: number;
}

/**
 * Creates a new attachment metadata record in SQLite.
 */
export function createAttachment(data: CreateAttachmentInput): AttachmentRecord {
  const now = data.createdAt ?? Math.floor(Date.now() / 1000);
  const record: AttachmentRecord = {
    id: data.id ?? uuidv4(),
    filename: data.filename,
    originalName: data.originalName,
    mimeType: data.mimeType,
    size: data.size,
    storagePath: data.storagePath,
    scope: data.scope,
    entityId: data.entityId ?? null,
    createdAt: now,
  };

  db.insert(attachments).values(record).run();
  return record;
}

/**
 * Retrieves an attachment metadata record by its unique ID.
 */
export function getAttachmentById(id: string): AttachmentRecord | undefined {
  return db
    .select()
    .from(attachments)
    .where(eq(attachments.id, id))
    .get();
}

/**
 * Retrieves attachments associated with a specific entity (e.g. ticketId, commentId, pinId).
 */
export function getAttachmentsByEntity(
  entityId: string,
  scope?: AttachmentScope
): AttachmentRecord[] {
  if (scope) {
    return db
      .select()
      .from(attachments)
      .where(and(eq(attachments.entityId, entityId), eq(attachments.scope, scope)))
      .orderBy(desc(attachments.createdAt))
      .all();
  }

  return db
    .select()
    .from(attachments)
    .where(eq(attachments.entityId, entityId))
    .orderBy(desc(attachments.createdAt))
    .all();
}

/**
 * Retrieves attachments by scope.
 */
export function getAttachmentsByScope(scope: AttachmentScope): AttachmentRecord[] {
  return db
    .select()
    .from(attachments)
    .where(eq(attachments.scope, scope))
    .orderBy(desc(attachments.createdAt))
    .all();
}

/**
 * Updates the entity association of an existing attachment (e.g. when ticket is created).
 */
export function updateAttachmentEntity(id: string, entityId: string): boolean {
  const result = db
    .update(attachments)
    .set({ entityId })
    .where(eq(attachments.id, id))
    .run();
  return result.changes > 0;
}

/**
 * Deletes an attachment metadata record by ID.
 */
export function deleteAttachmentRecord(id: string): boolean {
  const result = db
    .delete(attachments)
    .where(eq(attachments.id, id))
    .run();
  return result.changes > 0;
}
