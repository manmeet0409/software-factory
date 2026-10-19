import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import {
  createAttachment,
  getAttachmentsByEntity,
  getAttachmentsByScope,
} from '@/lib/db/attachmentQueries';
import { ATTACHMENT_SCOPES, type AttachmentScope } from '@/lib/db/schema';

// Max file size: 15MB
const MAX_FILE_SIZE = 15 * 1024 * 1024;

const ALLOWED_MIME_PREFIXES = [
  'image/',
  'text/',
  'application/pdf',
  'application/json',
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream',
];

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const scope = (formData.get('scope') as AttachmentScope) || 'chat';
    const entityId = (formData.get('entityId') as string) || null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!ATTACHMENT_SCOPES.includes(scope)) {
      return NextResponse.json(
        { error: `Invalid scope. Allowed scopes: ${ATTACHMENT_SCOPES.join(', ')}` },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File size exceeds maximum limit of 15MB' },
        { status: 400 }
      );
    }

    // Determine extension and storage path
    const fileId = uuidv4();
    const originalName = file.name || 'unnamed_upload';
    const ext = path.extname(originalName) || (file.type.startsWith('image/png') ? '.png' : file.type.startsWith('image/jpeg') ? '.jpg' : '');
    const filename = `${fileId}${ext}`;

    const uploadsDir = path.join(process.cwd(), 'data', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const storagePath = path.join(uploadsDir, filename);

    // Write file buffer to disk
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(storagePath, buffer);

    // Save metadata in SQLite
    const mimeType = file.type || 'application/octet-stream';
    const record = createAttachment({
      id: fileId,
      filename,
      originalName,
      mimeType,
      size: file.size,
      storagePath,
      scope,
      entityId,
    });

    return NextResponse.json({
      id: record.id,
      url: `/api/uploads/${record.id}`,
      filename: record.filename,
      originalName: record.originalName,
      mimeType: record.mimeType,
      size: record.size,
      localPath: record.storagePath,
      scope: record.scope,
      entityId: record.entityId,
      createdAt: record.createdAt,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const entityId = searchParams.get('entityId');
    const scope = searchParams.get('scope') as AttachmentScope | null;

    if (entityId) {
      const records = getAttachmentsByEntity(entityId, scope || undefined);
      return NextResponse.json(records);
    }

    if (scope && ATTACHMENT_SCOPES.includes(scope)) {
      const records = getAttachmentsByScope(scope);
      return NextResponse.json(records);
    }

    return NextResponse.json([]);
  } catch (error) {
    console.error('Error fetching attachments:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch attachments' },
      { status: 500 }
    );
  }
}
