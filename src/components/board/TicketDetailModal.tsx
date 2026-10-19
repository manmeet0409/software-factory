'use client';

import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Ticket, TicketStatus, Comment, ActivityLog } from '@/lib/db/schema';
import { TicketWithDetails, KANBAN_COLUMNS } from './types';
import {
  X,
  Send,
  GitBranch,
  Bot,
  User,
  ShieldAlert,
  Clock,
  Layers,
  CheckCircle2,
  Play,
  RotateCcw,
  Sparkles,
  Trash2,
  Paperclip,
} from 'lucide-react';
import { useFileUpload } from '@/lib/hooks/useFileUpload';
import { AttachmentTray } from '@/components/ui/AttachmentTray';

interface TicketDetailModalProps {
  ticketId: string | null;
  onClose: () => void;
  onStatusChange: (ticketId: string, newStatus: TicketStatus) => void;
  onTicketUpdated: () => void;
  onDelete?: (ticketId: string) => void;
}

export function TicketDetailModal({
  ticketId,
  onClose,
  onStatusChange,
  onTicketUpdated,
  onDelete,
}: TicketDetailModalProps) {
  const [ticket, setTicket] = useState<TicketWithDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [commentType, setCommentType] = useState<'feedback' | 'review' | 'iteration'>('feedback');
  const [retrigger, setRetrigger] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const {
    attachments,
    isUploading,
    removeAttachment,
    clearAttachments,
    handlePaste,
    handleDrop,
    handleFileSelect,
  } = useFileUpload({ scope: 'comment', entityId: ticketId || undefined });

  const handleDelete = async () => {
    if (!ticketId) return;
    if (!window.confirm(`Are you sure you want to permanently delete task #${ticketId.slice(0, 8)}: "${ticket?.title || ''}"?`)) {
      return;
    }

    setDeleting(true);
    try {
      if (onDelete) {
        onDelete(ticketId);
        onClose();
        return;
      }
      const res = await fetch(`/api/tickets/${ticketId}`, { method: 'DELETE' });
      if (res.ok) {
        onClose();
        onTicketUpdated();
      }
    } catch (err) {
      console.error('Failed to delete ticket:', err);
    } finally {
      setDeleting(false);
    }
  };

  const fetchTicketDetails = async () => {
    if (!ticketId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/tickets/${ticketId}`);
      if (res.ok) {
        const data = await res.json();
        setTicket(data.ticket);
      }
    } catch (err) {
      console.error('Failed to fetch ticket details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ticketId) {
      fetchTicketDetails();
    } else {
      setTicket(null);
    }
  }, [ticketId]);

  if (!ticketId) return null;

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newComment.trim() && attachments.length === 0) || !ticketId) return;

    setSubmittingComment(true);
    try {
      let fullComment = newComment.trim();
      if (attachments.length > 0) {
        const attachmentsBlock = attachments
          .map((a) => {
            if (a.mimeType.startsWith('image/')) {
              return `![${a.originalName}](${a.url})\n*(Image file on disk: \`${a.localPath}\`)*`;
            }
            return `📎 [${a.originalName}](${a.url})\n*(File on disk: \`${a.localPath}\`)*`;
          })
          .join('\n\n');

        fullComment = fullComment
          ? `${fullComment}\n\n${attachmentsBlock}`
          : attachmentsBlock;
      }

      const res = await fetch(`/api/tickets/${ticketId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: 'user',
          content: fullComment,
          type: commentType,
          retrigger,
        }),
      });

      if (res.ok) {
        setNewComment('');
        clearAttachments();
        setRetrigger(false);
        await fetchTicketDetails();
        onTicketUpdated();
      }
    } catch (err) {
      console.error('Error posting comment:', err);
    } finally {
      setSubmittingComment(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (ticketId) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [ticketId, onClose]);

  const currentColumn = KANBAN_COLUMNS.find((col) => col.id === ticket?.status);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ticket-detail-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
    >
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-neutral-800 bg-neutral-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm text-neutral-400">#{ticket?.id.slice(0, 8)}</span>
            {currentColumn && (
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${currentColumn.badgeBg} ${currentColumn.badgeText}`}
              >
                {currentColumn.title}
              </span>
            )}
            {ticket?.worktreeDir && (
              <span className="flex items-center gap-1 rounded-md bg-blue-950/40 px-2 py-0.5 text-xs text-blue-400 border border-blue-500/20">
                <GitBranch className="h-3 w-3" />
                ticket/{ticket.id.slice(0, 8)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDelete}
              disabled={deleting}
              aria-label="Delete this task"
              title="Delete task"
              className="flex items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-950/70 px-2.5 py-1.5 text-xs text-neutral-400 hover:text-red-400 hover:border-red-900/60 hover:bg-red-950/30 transition-colors disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5 text-neutral-400 group-hover:text-red-400" />
              <span className="hidden sm:inline text-[11px] font-medium">Delete</span>
            </button>

            <button
              onClick={onClose}
              aria-label="Close modal"
              className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {loading && !ticket ? (
            <div className="py-12 text-center text-sm text-neutral-400">Loading details...</div>
          ) : ticket ? (
            <>
              {/* Title & Description */}
              <div>
                <h3 id="ticket-detail-title" className="text-lg font-semibold text-white">{ticket.title}</h3>
                <div className="mt-3 rounded-xl border border-neutral-800/80 bg-neutral-950/50 p-4 text-xs leading-relaxed text-neutral-300">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
                      a: ({ href, children }) => (
                        <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline font-medium">
                          {children}
                        </a>
                      ),
                      img: ({ src, alt }) => {
                        const srcStr = typeof src === 'string' ? src : undefined;
                        return (
                          <img
                            src={srcStr}
                            alt={alt || ''}
                            className="max-h-64 max-w-full rounded-lg border border-neutral-700/80 my-2 object-contain cursor-pointer hover:opacity-95 transition-opacity"
                            onClick={() => srcStr && window.open(srcStr, '_blank')}
                          />
                        );
                      },
                      code: ({ children }) => (
                        <code className="rounded bg-neutral-800 px-1 py-0.5 font-mono text-[11px] text-blue-300">
                          {children}
                        </code>
                      ),
                    }}
                  >
                    {ticket.description}
                  </ReactMarkdown>
                </div>
              </div>

              {/* Status Transition Control Bar */}
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
                <div className="text-xs font-medium text-neutral-400 mb-2">Workflow Status Actions</div>
                <div className="flex flex-wrap gap-2">
                  {ticket.status !== 'in_progress' && (
                    <button
                      onClick={() => onStatusChange(ticket.id, 'in_progress')}
                      className="flex items-center gap-1.5 rounded-lg bg-blue-600/20 px-3 py-1.5 text-xs font-medium text-blue-400 hover:bg-blue-600/30"
                    >
                      <Play className="h-3 w-3 fill-current" />
                      Run Agent in Worktree
                    </button>
                  )}

                  {ticket.status !== 'agent_done' && (
                    <button
                      onClick={() => onStatusChange(ticket.id, 'agent_done')}
                      className="rounded-lg bg-neutral-800 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-700"
                    >
                      Mark Agent Done
                    </button>
                  )}

                  {ticket.status !== 'agent_tested' && (
                    <button
                      onClick={() => onStatusChange(ticket.id, 'agent_tested')}
                      className="flex items-center gap-1.5 rounded-lg bg-purple-600/20 px-3 py-1.5 text-xs font-medium text-purple-400 hover:bg-purple-600/30"
                    >
                      <Sparkles className="h-3 w-3" />
                      Mark Agent Tested
                    </button>
                  )}

                  {ticket.status !== 'user_tested' && (
                    <button
                      onClick={() => onStatusChange(ticket.id, 'user_tested')}
                      className="flex items-center gap-1.5 rounded-lg bg-cyan-600/20 px-3 py-1.5 text-xs font-medium text-cyan-400 hover:bg-cyan-600/30"
                    >
                      <Clock className="h-3 w-3" />
                      Ready for User Test
                    </button>
                  )}

                  {ticket.status !== 'done' && (
                    <button
                      onClick={() => onStatusChange(ticket.id, 'done')}
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-600/20 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-600/30"
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      Approve & Auto-Merge
                    </button>
                  )}

                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-950/20 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-950/40 hover:border-red-500/40 transition-colors ml-auto"
                  >
                    <Trash2 className="h-3 w-3" />
                    Delete Task
                  </button>
                </div>
              </div>

              {/* Comments & Review Feedback */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3">
                  Comments & Review Notes ({ticket.comments?.length || 0})
                </h4>

                <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                  {ticket.comments && ticket.comments.length > 0 ? (
                    ticket.comments.map((comment) => (
                      <div
                        key={comment.id}
                        className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3 text-xs"
                      >
                        <div className="flex items-center justify-between text-neutral-500 mb-1.5">
                          <span className="flex items-center gap-1.5 font-medium text-neutral-300">
                            {comment.author === 'agent' ? (
                              <Bot className="h-3.5 w-3.5 text-blue-400" />
                            ) : comment.author === 'orchestrator' ? (
                              <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                            ) : (
                              <User className="h-3.5 w-3.5 text-emerald-400" />
                            )}
                            <span className="capitalize">{comment.author}</span>
                            <span className="rounded bg-neutral-800 px-1.5 py-0.2 text-[10px] text-neutral-400">
                              {comment.type}
                            </span>
                          </span>
                          <span className="text-[10px]">
                            {new Date(comment.createdAt * 1000).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <div className="text-neutral-300 leading-relaxed break-words">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              p: ({ children }) => <p className="mb-1.5 last:mb-0 leading-relaxed">{children}</p>,
                              a: ({ href, children }) => (
                                <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline font-medium">
                                  {children}
                                </a>
                              ),
                              img: ({ src, alt }) => {
                                const srcStr = typeof src === 'string' ? src : undefined;
                                return (
                                  <img
                                    src={srcStr}
                                    alt={alt || ''}
                                    className="max-h-56 max-w-full rounded-lg border border-neutral-700/80 my-2 object-contain cursor-pointer hover:opacity-95 transition-opacity"
                                    onClick={() => srcStr && window.open(srcStr, '_blank')}
                                  />
                                );
                              },
                              code: ({ children }) => (
                                <code className="rounded bg-neutral-800 px-1 py-0.5 font-mono text-[11px] text-blue-300">
                                  {children}
                                </code>
                              ),
                            }}
                          >
                            {comment.content}
                          </ReactMarkdown>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-4 text-xs text-neutral-500">
                      No comments or reviews yet.
                    </div>
                  )}
                </div>

                {/* Add Comment Form */}
                <form
                  onSubmit={handleAddComment}
                  onPaste={handlePaste}
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  className="mt-4 space-y-2"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3">
                      <span className="text-neutral-400">Type:</span>
                      {(['feedback', 'review', 'iteration'] as const).map((t) => (
                        <label key={t} className="flex items-center gap-1.5 cursor-pointer text-neutral-300">
                          <input
                            type="radio"
                            name="commentType"
                            value={t}
                            checked={commentType === t}
                            onChange={() => setCommentType(t)}
                            className="accent-blue-500"
                          />
                          <span className="capitalize">{t}</span>
                        </label>
                      ))}
                    </div>

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
                        disabled={submittingComment || isUploading}
                        className="flex items-center gap-1 text-[11px] font-medium text-blue-400 hover:text-blue-300 bg-neutral-800/80 hover:bg-neutral-800 px-2 py-0.5 rounded-lg border border-neutral-700/60 transition-colors"
                        title="Attach file or screenshot (or paste via Ctrl+V)"
                      >
                        <Paperclip className="h-3 w-3" />
                        <span>Attach File</span>
                      </button>
                    </div>
                  </div>

                  <AttachmentTray
                    attachments={attachments}
                    onRemove={removeAttachment}
                    isUploading={isUploading}
                  />

                  <div className="flex gap-2 items-end">
                    <textarea
                      rows={2}
                      placeholder="Add review feedback, iteration notes, or paste screenshot (Ctrl+V)..."
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                          e.preventDefault();
                          handleAddComment(e);
                        }
                      }}
                      className="flex-1 rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-xs text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none resize-none"
                    />
                    <button
                      type="submit"
                      disabled={submittingComment || isUploading || (!newComment.trim() && attachments.length === 0)}
                      className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50 h-9 shrink-0"
                    >
                      <Send className="h-3 w-3" />
                      Post
                    </button>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer text-[11px] text-neutral-400">
                    <input
                      type="checkbox"
                      checked={retrigger}
                      onChange={(e) => setRetrigger(e.target.checked)}
                      className="rounded border-neutral-700 bg-neutral-800 accent-blue-500"
                    />
                    <span>Re-trigger agent execution with this iteration note</span>
                  </label>
                </form>
              </div>

              {/* Activity Log Audit Timeline */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">
                  Activity Audit Trail
                </h4>
                <div className="space-y-1.5 border-l border-neutral-800 pl-3">
                  {ticket.activityLogs?.map((log) => (
                    <div key={log.id} className="text-[11px] text-neutral-400">
                      <span className="text-neutral-500">
                        {new Date(log.timestamp * 1000).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>{' '}
                      — <strong className="text-neutral-300 capitalize">{log.actor}</strong>{' '}
                      <span className="text-blue-400">{log.action}</span>
                      {log.fromStatus && log.toStatus && ` (${log.fromStatus} → ${log.toStatus})`}
                      {log.summary && `: ${log.summary}`}
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
