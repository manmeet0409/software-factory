'use client';

import React, { useState, useEffect } from 'react';
import {
  History,
  Bot,
  Play,
  Trash2,
  RotateCcw,
  RefreshCw,
  GitBranch,
  Clock,
  CheckCircle,
  AlertCircle,
  Filter,
  Check,
  Zap,
  FolderGit2,
} from 'lucide-react';
import { AgentSessionRecord, AgentRole, SessionStatus } from '@/lib/db/schema';

export function SessionHistory() {
  const [sessions, setSessions] = useState<AgentSessionRecord[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [currentWorkspace, setCurrentWorkspace] = useState<string | null>(null);
  const [scopeToWorkspace, setScopeToWorkspace] = useState(true);

  const fetchWorkspace = async () => {
    try {
      const res = await fetch('/api/workspace');
      if (res.ok) {
        const data = await res.json();
        if (data.workspace?.directory) {
          setCurrentWorkspace(data.workspace.directory);
        }
      }
    } catch {
      // ignore
    }
  };

  const fetchSessions = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/sessions');
      if (res.ok) {
        const data = await res.json();
        setSessions(data.allSessions || []);
        setActiveCount(data.activeCount || 0);
      }
    } catch (err) {
      console.error('Failed to load session history:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
    fetchWorkspace();

    // 1. Silent periodic background poll every 3s for session state transitions
    const pollInterval = setInterval(() => {
      fetchSessions(true);
    }, 3000);

    // 2. Refocus listener when switching back to tab
    const handleFocus = () => {
      fetchSessions(true);
      fetchWorkspace();
    };
    window.addEventListener('focus', handleFocus);

    // 3. Listen to local window workspace changes
    const handleDirectoryChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.directory) {
        setCurrentWorkspace(detail.directory);
        fetchSessions(true);
        setActionNotice(
          `Profile switched: ${detail.directory.split(/[\\/]/).filter(Boolean).pop() || detail.directory}`
        );
        setTimeout(() => setActionNotice(null), 3000);
      }
    };
    window.addEventListener('factory:directory-changed', handleDirectoryChange);

    // 4. Real-time SSE listener
    const eventSource = new EventSource('/api/events');
    eventSource.addEventListener('session:updated', () => fetchSessions(true));
    eventSource.addEventListener('workspace:changed', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data.data?.directory) {
          setCurrentWorkspace(data.data.directory);
          fetchSessions(true);
        }
      } catch {
        // ignore
      }
    });
    eventSource.onerror = () => {};

    return () => {
      clearInterval(pollInterval);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('factory:directory-changed', handleDirectoryChange);
      eventSource.close();
    };
  }, []);

  const showNotification = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 3000);
  };

  const handleResume = async (sessionId: string) => {
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resume', sessionId }),
      });
      if (res.ok) {
        const data = await res.json();
        const shortId = sessionId.slice(0, 14);
        showNotification(`Session #${shortId} activated — conversation restored`);
        window.dispatchEvent(
          new CustomEvent('factory:session-resumed', {
            detail: {
              sessionId,
              shortId,
              worktreeDir: data.session?.worktreeDir,
              model: data.session?.model,
            },
          })
        );
        fetchSessions();
      }
    } catch (err) {
      console.error('Error resuming session:', err);
    }
  };

  const handleDelete = async (sessionId: string) => {
    const shortId = sessionId.slice(0, 14);
    if (!window.confirm(`Delete session #${shortId}?`)) return;

    try {
      const res = await fetch(`/api/sessions?id=${sessionId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        showNotification(`Session #${shortId} deleted`);
        fetchSessions();
      }
    } catch (err) {
      console.error('Error deleting session:', err);
    }
  };

  const handleResetManager = async () => {
    if (!window.confirm('Reset the active Manager session? Next ticket will spawn a clean single manager session.')) return;

    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset_manager' }),
      });
      if (res.ok) {
        showNotification('Manager session reset successfully');
        fetchSessions();
      }
    } catch (err) {
      console.error('Error resetting manager:', err);
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm('Clear all session history records and reset active agents?')) return;

    try {
      const res = await fetch('/api/sessions?clearAll=true', {
        method: 'DELETE',
      });
      if (res.ok) {
        showNotification('All session history cleared');
        window.dispatchEvent(new CustomEvent('factory:sessions-cleared'));
        fetchSessions();
      }
    } catch (err) {
      console.error('Error clearing sessions:', err);
    }
  };

  const handleClearChatHistory = async () => {
    if (!window.confirm('Clear all Orchestrator chat messages?')) return;

    try {
      const res = await fetch('/api/chat', {
        method: 'DELETE',
      });
      if (res.ok) {
        showNotification('Chat history cleared');
      }
    } catch (err) {
      console.error('Error clearing chat history:', err);
    }
  };

  const filtered = sessions.filter((s) => {
    if (roleFilter !== 'all' && s.role !== roleFilter) return false;
    if (statusFilter !== 'all' && s.status !== statusFilter) return false;

    // Scope sessions to currently active project profile
    if (scopeToWorkspace && currentWorkspace) {
      if (!s.worktreeDir) return true;
      const normSess = s.worktreeDir.replace(/\\/g, '/').toLowerCase();
      const normWs = currentWorkspace.replace(/\\/g, '/').toLowerCase();
      const wsName = normWs.split('/').filter(Boolean).pop() || '';

      const matches =
        normSess === normWs ||
        normSess.startsWith(normWs) ||
        (wsName.length > 2 && normSess.includes(wsName));
      if (!matches) return false;
    }

    return true;
  });

  const getStatusBadge = (status: SessionStatus) => {
    switch (status) {
      case 'active':
        return (
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            ACTIVE
          </span>
        );
      case 'idle':
        return (
          <span className="rounded-full bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-400">
            IDLE
          </span>
        );
      case 'completed':
        return (
          <span className="rounded-full bg-neutral-800 border border-neutral-700 px-2 py-0.5 text-[10px] font-medium text-neutral-300">
            COMPLETED
          </span>
        );
      case 'failed':
        return (
          <span className="rounded-full bg-red-500/10 border border-red-500/20 px-2 py-0.5 text-[10px] font-medium text-red-400">
            FAILED
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col h-full bg-neutral-950/60 rounded-2xl border border-neutral-800/80 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-neutral-800 px-5 py-3.5 bg-neutral-900/60 gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-500/10">
            <History className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              Session History
              <span className="rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-mono text-purple-400 border border-purple-500/20">
                {activeCount} Active
              </span>
              {currentWorkspace && (
                <span className="hidden sm:inline-flex items-center gap-1 rounded bg-blue-500/10 px-2 py-0.5 text-[10px] font-mono text-blue-400 border border-blue-500/20">
                  <FolderGit2 className="h-3 w-3" />
                  {currentWorkspace.split(/[\\/]/).filter(Boolean).pop()}
                </span>
              )}
            </h2>
            <p className="text-[11px] text-neutral-400">
              Orchestrator and Worktree Agent ACP Session Lifecycle & Audit Trail
            </p>
          </div>
        </div>

        {/* Global Operations */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleResetManager}
            className="flex items-center gap-1.5 rounded-xl border border-neutral-700 bg-neutral-900/90 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:text-white hover:border-neutral-600 transition-colors shadow-sm"
            title="Reset active Manager session to single clean session state"
          >
            <RotateCcw className="h-3.5 w-3.5 text-amber-400" />
            <span>Reset Manager</span>
          </button>

          <button
            onClick={handleClearChatHistory}
            className="flex items-center gap-1.5 rounded-xl border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-xs text-neutral-400 hover:text-amber-400 hover:border-amber-500/30 transition-colors"
            title="Clear Chat messages"
          >
            <span>Clear Chat</span>
          </button>

          <button
            onClick={handleClearAll}
            className="flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-950/20 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-900/40 hover:text-red-300 hover:border-red-500/50 transition-colors shadow-sm"
            title="Permanently clear all session history and reset active agents"
            aria-label="Clear all sessions"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Clear All Sessions</span>
          </button>

          <button
            onClick={() => fetchSessions()}
            disabled={loading}
            className="rounded-xl border border-neutral-800 bg-neutral-900/80 p-1.5 text-neutral-400 hover:text-white hover:border-neutral-700 transition-colors"
            aria-label="Refresh session list"
            title="Refresh Sessions"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Notification Toast */}
      {actionNotice && (
        <div className="bg-blue-600/20 border-b border-blue-500/30 px-5 py-2 text-xs text-blue-300 flex items-center gap-2">
          <Check className="h-3.5 w-3.5 text-blue-400" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between border-b border-neutral-800/80 px-5 py-2.5 bg-neutral-950/40 gap-3 text-xs">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-neutral-400">
            <Filter className="h-3.5 w-3.5" />
            <span>Role:</span>
          </div>
          {['all', 'orchestrator', 'manager', 'builder', 'tester'].map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-medium capitalize transition-colors ${
                roleFilter === r
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                  : 'bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Project Profile Scope Filter */}
          {currentWorkspace && (
            <button
              onClick={() => setScopeToWorkspace(!scopeToWorkspace)}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                scopeToWorkspace
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                  : 'bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white'
              }`}
              title="Toggle between current project only and all sessions"
            >
              <FolderGit2 className="h-3 w-3 text-blue-400" />
              <span>
                {scopeToWorkspace
                  ? `Project: ${currentWorkspace.split(/[\\/]/).filter(Boolean).pop() || currentWorkspace}`
                  : 'All Projects'}
              </span>
            </button>
          )}

          <span className="text-neutral-400">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-neutral-800 bg-neutral-900 px-2.5 py-1 text-[11px] text-neutral-300 focus:outline-none focus:border-purple-500"
            aria-label="Filter sessions by status"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="idle">Idle</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto p-5">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <Bot className="h-10 w-10 text-neutral-600 mb-2" />
            <p className="text-sm font-medium text-neutral-300">No agent sessions recorded</p>
            <p className="text-xs text-neutral-400 max-w-sm mt-1">
              Sessions are automatically generated and tracked when agents execute tasks in isolated worktrees.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((sess) => {
              const isActive = sess.status === 'active';
              const shortId = sess.id.slice(0, 14);

              return (
                <div
                  key={sess.id}
                  className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-xl border p-4 transition-all shadow-sm ${
                    isActive
                      ? 'border-emerald-500/40 bg-emerald-950/15 ring-1 ring-emerald-500/30'
                      : 'border-neutral-800 bg-neutral-900/80 hover:border-neutral-700 hover:bg-neutral-900'
                  }`}
                >
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-semibold text-white">
                        #{shortId}
                      </span>
                      <span className="rounded bg-neutral-800 px-2 py-0.5 text-[10px] font-mono uppercase text-purple-300 font-semibold border border-purple-500/20">
                        {sess.role}
                      </span>
                      {getStatusBadge(sess.status)}

                      {sess.ticketId && (
                        <span className="flex items-center gap-1 rounded bg-blue-950/40 px-2 py-0.5 text-[10px] font-mono text-blue-400 border border-blue-500/20">
                          ticket #{sess.ticketId.slice(0, 8)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-xs text-neutral-400 flex-wrap">
                      {sess.worktreeDir && (
                        <div className="flex items-center gap-1 text-neutral-400 font-mono text-[11px]">
                          <GitBranch className="h-3 w-3 text-neutral-400" />
                          <span className="truncate max-w-[200px]">{sess.worktreeDir.split(/[\\/]/).pop()}</span>
                        </div>
                      )}

                      <div className="flex items-center gap-1 text-[11px]">
                        <Clock className="h-3 w-3 text-neutral-400" />
                        <span>{new Date(sess.createdAt * 1000).toLocaleString()}</span>
                      </div>

                      {sess.model && (
                        <div className="flex items-center gap-1 text-[11px] text-neutral-400 font-mono">
                          <Bot className="h-3 w-3" />
                          <span>{sess.model.split('/').pop()}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Session Actions: Resume / Delete */}
                  <div className="flex items-center gap-2 self-end sm:self-center">
                    {!isActive ? (
                      <button
                        onClick={() => handleResume(sess.id)}
                        className="flex items-center gap-1.5 rounded-xl bg-purple-600/20 border border-purple-500/30 px-3 py-1.5 text-xs font-medium text-purple-300 hover:bg-purple-600/30 transition-colors shadow-sm"
                        title={`Activate session #${shortId}`}
                        aria-label={`Activate session #${shortId}`}
                      >
                        <Play className="h-3 w-3 fill-current" />
                        <span>Resume</span>
                      </button>
                    ) : (
                      <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                        <Zap className="h-3.5 w-3.5 fill-current animate-pulse" />
                        Active Now
                      </span>
                    )}

                    <button
                      onClick={() => handleDelete(sess.id)}
                      className="rounded-xl border border-neutral-800 bg-neutral-900 p-2 text-neutral-400 hover:text-red-400 hover:border-red-900 transition-colors"
                      title="Delete session"
                      aria-label={`Delete session #${shortId}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
