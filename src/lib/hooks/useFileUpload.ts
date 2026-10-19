'use client';

import { useState, useCallback } from 'react';

export interface UploadedAttachment {
  id: string;
  url: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  localPath: string;
  scope: string;
  entityId?: string | null;
  createdAt: number;
}

export interface UseFileUploadOptions {
  scope: 'chat' | 'ticket' | 'comment' | 'pin';
  entityId?: string;
  maxFiles?: number;
  onUploadSuccess?: (attachment: UploadedAttachment) => void;
  onUploadError?: (error: string) => void;
}

export function useFileUpload({
  scope,
  entityId,
  maxFiles = 10,
  onUploadSuccess,
  onUploadError,
}: UseFileUploadOptions) {
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadFile = useCallback(
    async (file: File): Promise<UploadedAttachment | null> => {
      setIsUploading(true);
      setError(null);

      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('scope', scope);
        if (entityId) {
          formData.append('entityId', entityId);
        }

        const res = await fetch('/api/uploads', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Upload failed with status ${res.status}`);
        }

        const attachment: UploadedAttachment = await res.json();
        setAttachments((prev) => [...prev, attachment]);
        onUploadSuccess?.(attachment);
        return attachment;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed';
        setError(message);
        onUploadError?.(message);
        return null;
      } finally {
        setIsUploading(false);
      }
    },
    [scope, entityId, onUploadSuccess, onUploadError]
  );

  const uploadFiles = useCallback(
    async (files: FileList | File[]): Promise<UploadedAttachment[]> => {
      const fileArray = Array.from(files);
      const results: UploadedAttachment[] = [];

      for (const file of fileArray) {
        if (attachments.length + results.length >= maxFiles) {
          setError(`Maximum ${maxFiles} files allowed`);
          break;
        }
        const uploaded = await uploadFile(file);
        if (uploaded) {
          results.push(uploaded);
        }
      }

      return results;
    },
    [attachments.length, maxFiles, uploadFile]
  );

  const removeAttachment = useCallback(async (id: string) => {
    try {
      await fetch(`/api/uploads/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.warn('Failed to delete attachment from server:', err);
    }
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments([]);
    setError(null);
  }, []);

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent | ClipboardEvent): Promise<UploadedAttachment[]> => {
      const items = e.clipboardData?.items;
      if (!items || items.length === 0) return [];

      const filesToUpload: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) {
            // For clipboard images, generate a friendly name if needed
            const friendlyName =
              file.name && file.name !== 'image.png'
                ? file.name
                : `pasted_image_${Date.now()}.${file.type.split('/')[1] || 'png'}`;

            const renamedFile = new File([file], friendlyName, { type: file.type });
            filesToUpload.push(renamedFile);
          }
        }
      }

      if (filesToUpload.length > 0) {
        e.preventDefault();
        return uploadFiles(filesToUpload);
      }

      return [];
    },
    [uploadFiles]
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent): Promise<UploadedAttachment[]> => {
      e.preventDefault();
      e.stopPropagation();

      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        return uploadFiles(files);
      }
      return [];
    },
    [uploadFiles]
  );

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>): Promise<UploadedAttachment[]> => {
      const files = e.target.files;
      if (files && files.length > 0) {
        const uploaded = await uploadFiles(files);
        // Reset file input value so user can re-select the same file
        e.target.value = '';
        return uploaded;
      }
      return [];
    },
    [uploadFiles]
  );

  return {
    attachments,
    setAttachments,
    isUploading,
    error,
    uploadFile,
    uploadFiles,
    removeAttachment,
    clearAttachments,
    handlePaste,
    handleDrop,
    handleFileSelect,
  };
}
