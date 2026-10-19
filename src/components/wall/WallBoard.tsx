'use client';

import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Layers,
  BookOpen,
  Tag,
  CheckCircle2,
  XCircle,
  Plus,
  Archive,
  RotateCcw,
  RefreshCw,
  Search,
  Filter,
  Lightbulb,
  Cpu,
  BookmarkCheck,
  AlertCircle,
  X,
  Paperclip,
} from 'lucide-react';
import { WallCategory } from '@/lib/db/schema';
import { useFileUpload } from '@/lib/hooks/useFileUpload';
import { AttachmentTray } from '@/components/ui/AttachmentTray';

interface WallPin {
  id: string;
  title: string;
  description: string;
  category: WallCategory;
  module: string;
  tags: string[];
  createdBy: string;
  createdAt: number;
  archived: number;
}

interface WallRequest {
  id: string;
  type: 'pin' | 'taxonomy';
  submittedBy: string;
  status: 'pending' | 'approved' | 'rejected';
  payload: any;
  critiqueOrSuggestions?: string | null;
  createdAt: number;
}

interface WallTaxonomy {
  modules: Array<{ name: string; description?: string | null }>;
  tags: Array<{ name: string; description?: string | null }>;
}

export function WallBoard() {
  const [pins, setPins] = useState<WallPin[]>([]);
  const [taxonomy, setTaxonomy] = useState<WallTaxonomy>({ modules: [], tags: [] });
  const [pendingRequests, setPendingRequests] = useState<WallRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedModule, setSelectedModule] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'pins' | 'requests' | 'archived'>('pins');

  // New Pin Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCategory, setNewCategory] = useState<WallCategory>('fact');
  const [newModule, setNewModule] = useState('core');
  const [newTags, setNewTags] = useState('rules, design');
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const {
    attachments,
    isUploading,
    removeAttachment,
    clearAttachments,
    handlePaste,
    handleDrop,
    handleFileSelect,
  } = useFileUpload({ scope: 'pin' });

  const fetchWall = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeTab === 'archived') {
        params.set('archivedOnly', 'true');
      }
      if (selectedCategory !== 'all') params.set('category', selectedCategory);
      if (selectedModule !== 'all') params.set('module', selectedModule);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());

      const res = await fetch(`/api/wall?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setPins(data.pins || []);

        if (data.taxonomy && !Array.isArray(data.taxonomy)) {
          setTaxonomy({
            modules: data.taxonomy.modules || [],
            tags: data.taxonomy.tags || [],
          });
        } else if (Array.isArray(data.taxonomy)) {
          setTaxonomy({
            modules: data.taxonomy.filter((t: any) => t.type === 'module'),
            tags: data.taxonomy.filter((t: any) => t.type === 'tag'),
          });
        } else {
          setTaxonomy({ modules: [], tags: [] });
        }

        setPendingRequests(data.pendingRequests || []);
      }
    } catch (err) {
      console.error('Failed to load The Wall:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchWall();

    // 1. Silent periodic background poll every 3s so pins added/cleared by agents or MCP appear live
    const pollInterval = setInterval(() => {
      fetchWall(true);
    }, 3000);

    // 2. Refocus listener when switching back to tab
    const handleFocus = () => fetchWall(true);
    window.addEventListener('focus', handleFocus);

    // 3. Real-time SSE listener
    const eventSource = new EventSource('/api/events');
    eventSource.addEventListener('wall:updated', () => fetchWall(true));
    eventSource.onerror = () => {};

    return () => {
      clearInterval(pollInterval);
      window.removeEventListener('focus', handleFocus);
      eventSource.close();
    };
  }, [selectedCategory, selectedModule, searchQuery, activeTab]);

  const handleCreatePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || (!newDescription.trim() && attachments.length === 0)) return;

    setSubmitting(true);
    try {
      const tagArray = newTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      let fullDescription = newDescription.trim();
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

      const res = await fetch('/api/wall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'pin_direct',
          caller: 'user',
          data: {
            title: newTitle.trim(),
            description: fullDescription,
            category: newCategory,
            module: newModule.trim(),
            tags: tagArray,
          },
        }),
      });

      if (res.ok) {
        setNewTitle('');
        setNewDescription('');
        clearAttachments();
        setShowAddModal(false);
        fetchWall();
      }
    } catch (err) {
      console.error('Error adding pin:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReviewRequest = async (requestId: string, decision: 'approved' | 'rejected') => {
    try {
      const res = await fetch('/api/wall', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'review_request',
          data: {
            requestId,
            decision,
            critiqueOrSuggestions: decision === 'approved' ? 'Verified by user' : 'Rejected by user',
          },
        }),
      });

      if (res.ok) {
        fetchWall();
      }
    } catch (err) {
      console.error('Error reviewing request:', err);
    }
  };

  const handleArchivePin = async (pinId: string) => {
    try {
      const res = await fetch('/api/wall', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'archive_pin',
          data: { pinId },
        }),
      });

      if (res.ok) {
        fetchWall();
      }
    } catch (err) {
      console.error('Error archiving pin:', err);
    }
  };

  const handleUnarchivePin = async (pinId: string) => {
    try {
      const res = await fetch('/api/wall', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'unarchive_pin',
          data: { pinId },
        }),
      });

      if (res.ok) {
        fetchWall();
      }
    } catch (err) {
      console.error('Error unarchiving pin:', err);
    }
  };

  // Keyboard escape handler for modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showAddModal) {
        setShowAddModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showAddModal]);

  const categoryBadges: Record<WallCategory, { bg: string; text: string; label: string }> = {
    fact: { bg: 'bg-emerald-500/10 border-emerald-500/20', text: 'text-emerald-400', label: 'FACT' },
    logic: { bg: 'bg-blue-500/10 border-blue-500/20', text: 'text-blue-400', label: 'LOGIC' },
    lesson: { bg: 'bg-amber-500/10 border-amber-500/20', text: 'text-amber-400', label: 'LESSON' },
  };

  const modules = Array.from(new Set(taxonomy.modules.map((t) => t.name)));

  return (
    <div className="flex flex-col h-full bg-neutral-950/60 rounded-2xl border border-neutral-800/80 overflow-hidden shadow-sm">
      {/* Wall Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-neutral-800 px-5 py-3.5 bg-neutral-900/60 gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-600 to-orange-500 text-white shadow-md shadow-orange-500/10">
            <BookOpen className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              The Wall
              <span className="rounded bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-mono text-orange-400 border border-orange-500/20">
                Shared Knowledge Base
              </span>
            </h2>
            <p className="text-[11px] text-neutral-400">
              Cross-Agent Shared Facts, Architectural Logic, & Hard-Won Lessons
            </p>
          </div>
        </div>

        {/* View Switcher & Action */}
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-xl bg-neutral-900 border border-neutral-800 p-0.5 text-xs">
            <button
              onClick={() => setActiveTab('pins')}
              className={`rounded-lg px-3 py-1 font-medium transition-colors ${
                activeTab === 'pins'
                  ? 'bg-neutral-800 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Pinned Truths {activeTab === 'pins' && `(${pins.length})`}
            </button>
            <button
              onClick={() => setActiveTab('archived')}
              className={`flex items-center gap-1 rounded-lg px-3 py-1 font-medium transition-colors ${
                activeTab === 'archived'
                  ? 'bg-neutral-800 text-amber-300 shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Archive className="h-3 w-3" />
              <span>Archived {activeTab === 'archived' && `(${pins.length})`}</span>
            </button>
            <button
              onClick={() => setActiveTab('requests')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1 font-medium transition-colors ${
                activeTab === 'requests'
                  ? 'bg-neutral-800 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Review Requests
              {pendingRequests.length > 0 && (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-[10px] font-bold text-white">
                  {pendingRequests.length}
                </span>
              )}
            </button>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 rounded-xl bg-orange-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-orange-500 transition-colors"
            aria-label="Add New Pin to The Wall"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Pin Knowledge</span>
          </button>

          <button
            onClick={() => fetchWall()}
            disabled={loading}
            className="rounded-xl border border-neutral-800 bg-neutral-900/80 p-1.5 text-neutral-400 hover:text-white hover:border-neutral-700 transition-colors"
            aria-label="Refresh Wall Data"
            title="Refresh The Wall"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-wrap items-center justify-between border-b border-neutral-800/80 px-5 py-2.5 bg-neutral-950/40 gap-3 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-neutral-400">
            <Filter className="h-3.5 w-3.5" />
            <span>Category:</span>
          </div>
          {['all', 'fact', 'logic', 'lesson'].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-medium capitalize transition-colors ${
                selectedCategory === cat
                  ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                  : 'bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}

          {modules.length > 0 && (
            <select
              value={selectedModule}
              onChange={(e) => setSelectedModule(e.target.value)}
              className="rounded-lg border border-neutral-800 bg-neutral-900 px-2.5 py-1 text-[11px] text-neutral-300 focus:outline-none focus:border-orange-500"
              aria-label="Filter by module"
            >
              <option value="all">All Modules</option>
              {modules.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400" />
          <input
            type="text"
            placeholder="Search pinned truths..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchWall()}
            className="w-48 sm:w-64 rounded-xl border border-neutral-800 bg-neutral-900/90 pl-8 pr-3 py-1 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-orange-500 transition-colors"
            aria-label="Search The Wall"
          />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-5">
        {activeTab === 'pins' || activeTab === 'archived' ? (
          pins.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              {activeTab === 'archived' ? (
                <>
                  <Archive className="h-10 w-10 text-neutral-600 mb-2" />
                  <p className="text-sm font-medium text-neutral-300">No Archived Pins</p>
                  <p className="text-xs text-neutral-400 max-w-sm mt-1">
                    Archived facts, constraints, and lessons remain preserved in your database and will appear here. You or the orchestrator can restore them back to the active wall at any time.
                  </p>
                </>
              ) : (
                <>
                  <Lightbulb className="h-10 w-10 text-neutral-600 mb-2" />
                  <p className="text-sm font-medium text-neutral-300">No knowledge pinned yet</p>
                  <p className="text-xs text-neutral-400 max-w-sm mt-1">
                    Pin foundational rules, architectural guidelines, or agent learnings to share across all worktree agents.
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pins.map((pin) => {
                const badge = categoryBadges[pin.category] || categoryBadges.fact;
                const isArchived = activeTab === 'archived' || pin.archived === 1;
                return (
                  <div
                    key={pin.id}
                    className={`flex flex-col justify-between rounded-xl border p-4 transition-all hover:shadow-md hover:shadow-black/40 ${
                      isArchived
                        ? 'border-neutral-800/60 bg-neutral-900/50 opacity-80 hover:opacity-100 hover:border-neutral-700'
                        : 'border-neutral-800 bg-neutral-900/80 hover:border-neutral-700 hover:bg-neutral-900'
                    }`}
                  >
                    <div>
                      {/* Header */}
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-mono font-medium border ${badge.bg} ${badge.text}`}
                        >
                          {badge.label}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {isArchived && (
                            <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-mono text-amber-400 border border-amber-500/20">
                              ARCHIVED
                            </span>
                          )}
                          <span className="rounded bg-neutral-800/80 px-2 py-0.5 text-[10px] font-mono text-neutral-400">
                            {pin.module}
                          </span>
                        </div>
                      </div>

                      {/* Title */}
                      <h3 className="mt-2 text-sm font-semibold text-neutral-100 leading-snug">
                        {pin.title}
                      </h3>

                      {/* Description */}
                      <div className="mt-1.5 text-xs text-neutral-300 leading-relaxed break-words">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            p: ({ children }) => <p className="mb-1.5 last:mb-0 leading-relaxed">{children}</p>,
                            a: ({ href, children }) => (
                              <a href={href} target="_blank" rel="noopener noreferrer" className="text-orange-400 hover:text-orange-300 underline font-medium">
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
                              <code className="rounded bg-neutral-800 px-1 py-0.5 font-mono text-[11px] text-orange-300">
                                {children}
                              </code>
                            ),
                          }}
                        >
                          {pin.description}
                        </ReactMarkdown>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="mt-4 pt-3 border-t border-neutral-800/80 flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-1 flex-wrap">
                        {pin.tags.map((t) => (
                          <span
                            key={t}
                            className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400 font-mono"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-neutral-400 font-mono">
                          {pin.createdBy}
                        </span>
                        {isArchived ? (
                          <button
                            onClick={() => handleUnarchivePin(pin.id)}
                            className="flex items-center gap-1 rounded bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] font-medium text-amber-300 hover:bg-amber-500/20 hover:text-amber-200 transition-colors"
                            title="Restore Pin to Active Board"
                            aria-label={`Restore pin ${pin.title}`}
                          >
                            <RotateCcw className="h-3 w-3" />
                            <span>Restore</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => handleArchivePin(pin.id)}
                            className="rounded p-1 text-neutral-400 hover:text-red-400 hover:bg-neutral-800 transition-colors"
                            title="Archive Pin"
                            aria-label={`Archive pin ${pin.title}`}
                          >
                            <Archive className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          /* Review Requests Tab */
          <div>
            {pendingRequests.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <BookmarkCheck className="h-10 w-10 text-neutral-600 mb-2" />
                <p className="text-sm font-medium text-neutral-300">All Wall Requests Reviewed</p>
                <p className="text-xs text-neutral-400 max-w-sm mt-1">
                  Subagents in isolated worktrees submit proposals here when they discover new facts or design patterns.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingRequests.map((req) => (
                  <div
                    key={req.id}
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-xl border border-neutral-800 bg-neutral-900/90 p-4"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="rounded bg-orange-500/10 px-2 py-0.5 text-[10px] font-mono text-orange-400 border border-orange-500/20">
                          {req.type.toUpperCase()} REQUEST
                        </span>
                        <span className="text-neutral-400">by</span>
                        <span className="font-mono text-neutral-300 font-medium">{req.submittedBy}</span>
                      </div>
                      <h4 className="mt-1 text-sm font-semibold text-white">
                        {req.payload.title || req.payload.name || 'Untitled Request'}
                      </h4>
                      <p className="mt-1 text-xs text-neutral-300">
                        {req.payload.description || JSON.stringify(req.payload)}
                      </p>
                      {req.payload.tags && (
                        <div className="mt-2 flex items-center gap-1">
                          {req.payload.tags.map((t: string) => (
                            <span
                              key={t}
                              className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400 font-mono"
                            >
                              #{t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <button
                        onClick={() => handleReviewRequest(req.id, 'approved')}
                        className="flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 shadow-sm transition-colors"
                        aria-label="Approve knowledge request"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Approve
                      </button>
                      <button
                        onClick={() => handleReviewRequest(req.id, 'rejected')}
                        className="flex items-center gap-1 rounded-xl bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-red-950/60 hover:text-red-400 hover:border-red-900 transition-colors"
                        aria-label="Reject knowledge request"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add New Pin Modal */}
      {showAddModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-pin-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
        >
          <div className="relative w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <h3 id="add-pin-title" className="flex items-center gap-2 text-base font-semibold text-white">
                <Plus className="h-4 w-4 text-orange-400" />
                Pin Truth to The Wall
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePin} className="mt-4 space-y-4">
              <div>
                <label htmlFor="pin-title" className="block text-xs font-medium text-neutral-300 mb-1">
                  Title *
                </label>
                <input
                  id="pin-title"
                  type="text"
                  placeholder="e.g., PostgreSQL UUID primary keys requirement"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-orange-500"
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="pin-desc" className="block text-xs font-medium text-neutral-300">
                    Description / Rule Explanation *
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
                      disabled={submitting || isUploading}
                      className="flex items-center gap-1 text-[11px] font-medium text-orange-400 hover:text-orange-300 bg-neutral-800/80 hover:bg-neutral-800 px-2 py-0.5 rounded-lg border border-neutral-700/60 transition-colors"
                      title="Attach file, diagram, or screenshot (or paste via Ctrl+V)"
                    >
                      <Paperclip className="h-3 w-3" />
                      <span>Attach Diagram / Image</span>
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
                    id="pin-desc"
                    rows={4}
                    placeholder="Explain why this fact, constraint, or lesson is binding, or paste diagrams/screenshots (Ctrl+V)..."
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-orange-500"
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
                  <label htmlFor="pin-cat" className="block text-xs font-medium text-neutral-300 mb-1">
                    Category
                  </label>
                  <select
                    id="pin-cat"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as WallCategory)}
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
                  >
                    <option value="fact">Fact (Immutable Rule)</option>
                    <option value="logic">Logic (Design Architecture)</option>
                    <option value="lesson">Lesson (Learned from Debugging)</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="pin-module" className="block text-xs font-medium text-neutral-300 mb-1">
                    Module
                  </label>
                  <input
                    id="pin-module"
                    type="text"
                    list="module-options"
                    value={newModule}
                    onChange={(e) => setNewModule(e.target.value)}
                    placeholder="e.g. core, database, ui"
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
                  />
                  <datalist id="module-options">
                    {modules.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div>
                <label htmlFor="pin-tags" className="block text-xs font-medium text-neutral-300 mb-1">
                  Tags (comma separated)
                </label>
                <input
                  id="pin-tags"
                  type="text"
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                  placeholder="e.g. drizzle, postgres, schema"
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-2 text-xs font-medium text-neutral-300 hover:bg-neutral-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-orange-600 px-4 py-2 text-xs font-medium text-white hover:bg-orange-500 transition-colors disabled:opacity-50 shadow-md shadow-orange-600/20"
                >
                  {submitting ? 'Pinning...' : 'Confirm Pin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
