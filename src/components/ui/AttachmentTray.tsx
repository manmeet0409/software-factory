'use client';

import React, { useState } from 'react';
import { FileText, FileCode, File, X, Loader2, Maximize2 } from 'lucide-react';
import type { UploadedAttachment } from '@/lib/hooks/useFileUpload';

interface AttachmentTrayProps {
  attachments: UploadedAttachment[];
  onRemove?: (id: string) => void;
  isUploading?: boolean;
  readOnly?: boolean;
  className?: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(mimeType: string, filename: string) {
  if (mimeType.includes('json') || filename.endsWith('.json') || filename.endsWith('.ts') || filename.endsWith('.js')) {
    return <FileCode className="w-4 h-4 text-amber-400 shrink-0" />;
  }
  if (mimeType.includes('pdf') || mimeType.includes('text') || filename.endsWith('.log')) {
    return <FileText className="w-4 h-4 text-blue-400 shrink-0" />;
  }
  return <File className="w-4 h-4 text-zinc-400 shrink-0" />;
}

export function AttachmentTray({
  attachments,
  onRemove,
  isUploading = false,
  readOnly = false,
  className = '',
}: AttachmentTrayProps) {
  const [zoomedImage, setZoomedImage] = useState<{ url: string; title: string } | null>(null);

  if (attachments.length === 0 && !isUploading) {
    return null;
  }

  return (
    <>
      <div className={`flex flex-wrap items-center gap-2 py-2 px-1 ${className}`}>
        {attachments.map((att) => {
          const isImage = att.mimeType.startsWith('image/');

          return (
            <div
              key={att.id}
              className="group relative flex items-center gap-2 bg-zinc-900/90 hover:bg-zinc-800/90 border border-zinc-800 hover:border-zinc-700 rounded-lg p-1.5 transition-all text-xs max-w-xs shadow-sm"
            >
              {isImage ? (
                <div
                  className="relative w-12 h-12 rounded-md overflow-hidden bg-black/50 border border-zinc-800/60 cursor-pointer shrink-0"
                  onClick={() => setZoomedImage({ url: att.url, title: att.originalName })}
                  title="Click to view full image"
                >
                  <img
                    src={att.url}
                    alt={att.originalName}
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <Maximize2 className="w-3.5 h-3.5 text-white drop-shadow" />
                  </div>
                </div>
              ) : (
                <div className="w-8 h-8 rounded-md bg-zinc-800/80 flex items-center justify-center shrink-0">
                  {getFileIcon(att.mimeType, att.originalName)}
                </div>
              )}

              <div className="flex flex-col min-w-0 pr-1">
                <span className="font-mono text-zinc-200 truncate text-[11px] leading-tight" title={att.originalName}>
                  {att.originalName}
                </span>
                <span className="text-[10px] text-zinc-500 font-mono">
                  {formatFileSize(att.size)}
                </span>
              </div>

              {!readOnly && onRemove && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(att.id);
                  }}
                  className="ml-auto text-zinc-400 hover:text-red-400 p-1 rounded hover:bg-zinc-800 transition-colors"
                  title="Remove file"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}

        {isUploading && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900/80 border border-blue-500/30 rounded-lg text-xs text-blue-400 animate-pulse">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
            <span className="font-mono text-[11px]">Uploading file...</span>
          </div>
        )}
      </div>

      {/* Image Zoom Modal */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150"
          onClick={() => setZoomedImage(null)}
        >
          <div
            className="relative max-w-5xl max-h-[90vh] flex flex-col bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/80">
              <span className="font-mono text-xs text-zinc-200 truncate">{zoomedImage.title}</span>
              <button
                type="button"
                onClick={() => setZoomedImage(null)}
                className="text-zinc-400 hover:text-zinc-100 p-1 rounded hover:bg-zinc-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-2 flex items-center justify-center overflow-auto max-h-[calc(90vh-50px)]">
              <img
                src={zoomedImage.url}
                alt={zoomedImage.title}
                className="max-w-full max-h-[80vh] object-contain rounded"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
