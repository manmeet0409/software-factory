'use client';

import React, { useState, useEffect } from 'react';
import { Ticket } from '@/lib/db/schema';
import { X, Plus, Sparkles, Layers, Paperclip } from 'lucide-react';
import { useFileUpload } from '@/lib/hooks/useFileUpload';
import { AttachmentTray } from '@/components/ui/AttachmentTray';

interface CreateTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingTickets: Ticket[];
  onTicketCreated: () => void;
}

export function CreateTicketModal({
  isOpen,
  onClose,
  existingTickets,
  onTicketCreated,
}: CreateTicketModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [parentTicketId, setParentTicketId] = useState('');
  const [assignedModel, setAssignedModel] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const {
    attachments,
    isUploading,
    removeAttachment,
    clearAttachments,
    handlePaste,
    handleDrop,
    handleFileSelect,
  } = useFileUpload({ scope: 'ticket' });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || (!description.trim() && attachments.length === 0)) {
      setError('Title and description or attachment are required.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      let fullDescription = description.trim();
      if (attachments.length > 0) {
        const attachmentsBlock = attachments
          .map((a) => {
            if (a.mimeType.startsWith('image/')) {
              return `![${a.originalName}](${a.url})\n*(Image file on disk: \`${a.localPath}\`)*`;
            }
            return `📎 [${a.originalName}](${a.url})\n*(File on disk: \`${a.localPath}\`)*`;
          })
          .join('\n\n');

        fullDescription = fullDescription
          ? `${fullDescription}\n\n### Attachments\n${attachmentsBlock}`
          : `### Attachments\n${attachmentsBlock}`;
      }

      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: fullDescription,
          parentTicketId: parentTicketId || null,
          assignedModel: assignedModel.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create ticket');
      }

      setTitle('');
      setDescription('');
      setParentTicketId('');
      setAssignedModel('');
      clearAttachments();
      onTicketCreated();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-ticket-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <h3 id="create-ticket-title" className="flex items-center gap-2 text-base font-semibold text-white">
            <Plus className="h-4 w-4 text-blue-400" />
            New Software Factory Task
          </h3>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="ticket-title-input" className="block text-xs font-medium text-neutral-300 mb-1">
              Task Title <span className="text-red-400">*</span>
            </label>
            <input
              id="ticket-title-input"
              type="text"
              placeholder="e.g. Add dark mode toggle or implement user authentication"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-xs text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
              required
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="ticket-desc-input" className="block text-xs font-medium text-neutral-300">
                Description & Requirements <span className="text-red-400">*</span>
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  multiple
                  className="hidden"
                  accept="image/*,.pdf,.txt,.log,.json,.md,.zip"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading || isUploading}
                  className="flex items-center gap-1 text-[11px] font-medium text-blue-400 hover:text-blue-300 bg-neutral-800/80 hover:bg-neutral-800 px-2 py-0.5 rounded-lg border border-neutral-700/60 transition-colors"
                  title="Attach file or screenshot (or paste via Ctrl+V)"
                >
                  <Paperclip className="h-3 w-3" />
                  <span>Attach File / Screenshot</span>
                </button>
              </div>
            </div>

            <div
              onPaste={handlePaste}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              className="space-y-2"
            >
              <textarea
                id="ticket-desc-input"
                rows={4}
                placeholder="Specify requirements, files to inspect, acceptance criteria, or paste screenshots (Ctrl+V)..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-xs text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
              />

              <AttachmentTray
                attachments={attachments}
                onRemove={removeAttachment}
                isUploading={isUploading}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ticket-parent-select" className="flex items-center gap-1 text-xs font-medium text-neutral-300 mb-1">
                <Layers className="h-3 w-3 text-neutral-400" />
                Parent Dependency (Optional)
              </label>
              <select
                id="ticket-parent-select"
                value={parentTicketId}
                onChange={(e) => setParentTicketId(e.target.value)}
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-300 focus:border-blue-500 focus:outline-none"
              >
                <option value="">None (Independent task)</option>
                {existingTickets.map((t) => (
                  <option key={t.id} value={t.id}>
                    #{t.id.slice(0, 6)} - {t.title.slice(0, 25)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="ticket-model-input" className="flex items-center gap-1 text-xs font-medium text-neutral-300 mb-1">
                <Sparkles className="h-3 w-3 text-neutral-400" />
                Model Override (Optional)
              </label>
              <input
                id="ticket-model-input"
                type="text"
                placeholder="opencode/nemotron-3.5"
                value={assignedModel}
                onChange={(e) => setAssignedModel(e.target.value)}
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-300 placeholder-neutral-600 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-neutral-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-xs font-medium text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors shadow-md shadow-blue-600/20"
            >
              {loading ? 'Creating...' : 'Create Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
