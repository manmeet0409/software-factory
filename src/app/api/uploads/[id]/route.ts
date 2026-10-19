import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { getAttachmentById, deleteAttachmentRecord } from '@/lib/db/attachmentQueries';

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const attachment = getAttachmentById(id);

    if (!attachment) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
    }

    if (!fs.existsSync(attachment.storagePath)) {
      return NextResponse.json({ error: 'File missing from storage' }, { status: 404 });
    }

    const fileBuffer = fs.readFileSync(attachment.storagePath);
    const encodedFilename = encodeURIComponent(attachment.originalName);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': attachment.mimeType || 'application/octet-stream',
        'Content-Length': attachment.size.toString(),
        'Content-Disposition': `inline; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('Error serving attachment:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error serving file' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const attachment = getAttachmentById(id);

    if (!attachment) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
    }

    // Attempt to delete physical file
    if (fs.existsSync(attachment.storagePath)) {
      try {
        fs.unlinkSync(attachment.storagePath);
      } catch (err) {
        console.warn('Could not delete file from disk:', err);
      }
    }

    // Delete DB record
    deleteAttachmentRecord(id);

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('Error deleting attachment:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Delete failed' },
      { status: 500 }
    );
  }
}
