'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  FolderGit2,
  Check,
  AlertCircle,
  Edit3,
  X,
  GitBranch,
  Folder,
  FolderOpen,
  RefreshCw,
  Clock,
} from 'lucide-react';
import { createPortal } from 'react-dom';

interface WorkspaceInfo {
  directory: string;
  exists: boolean;
  isGit: boolean;
  branch: string | null;
  canBrowse?: boolean;
  isConfigured?: boolean;
  recentDirs?: string[];
}

export function DirectorySelector() {
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [inputDir, setInputDir] = useState('');
  const [liveInfo, setLiveInfo] = useState<WorkspaceInfo | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const browseAbortControllerRef = useRef<AbortController | null>(null);

  const cancelBrowse = React.useCallback(() => {
    if (browseAbortControllerRef.current) {
      browseAbortControllerRef.current.abort();
      browseAbortControllerRef.current = null;
    }
    setBrowsing(false);
  }, []);

  const closeModal = React.useCallback(() => {
    cancelBrowse();
    setIsOpen(false);
    setError('');
  }, [cancelBrowse]);

  const fetchWorkspace = React.useCallback(async () => {
    try {
      const res = await fetch('/api/workspace');
      if (res.ok) {
        const data = await res.json();
        setWorkspace(data.workspace);
        setInputDir(data.workspace.directory || '');

        // Auto-open modal on first landing if no directory configured yet
        if (data.workspace && !data.workspace.isConfigured) {
          setIsOpen(true);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchWorkspace();

    // Listen for custom trigger to open selector from anywhere in UI
    const handleOpen = () => setIsOpen(true);
    window.addEventListener('factory:open-directory-selector', handleOpen);
    return () => window.removeEventListener('factory:open-directory-selector', handleOpen);
  }, [fetchWorkspace]);

  // Live path validation
  useEffect(() => {
    if (!isOpen || !inputDir.trim()) {
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/workspace?checkPath=${encodeURIComponent(inputDir.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setLiveInfo(data.info);
        }
      } catch {
        // ignore
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [inputDir, isOpen]);

  // Open native Windows Explorer folder picker (with abort & timeout safety)
  const handleBrowseExplorer = async () => {
    if (browsing) {
      cancelBrowse();
      return;
    }

    setBrowsing(true);
    setError('');

    const controller = new AbortController();
    browseAbortControllerRef.current = controller;

    // Auto-cancel after 60s if no response
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 60000);

    try {
      const params = new URLSearchParams();
      params.set('browse', 'true');
      if (inputDir.trim()) {
        params.set('initialPath', inputDir.trim());
      }

      const res = await fetch(`/api/workspace?${params.toString()}`, {
        signal: controller.signal,
      });
      if (res.ok) {
        const data = await res.json();
        if (data.selected) {
          setInputDir(data.selected);
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.info('Browse canceled or timed out');
      } else {
        console.warn('Browse error:', err);
      }
    } finally {
      clearTimeout(timeoutId);
      browseAbortControllerRef.current = null;
      setBrowsing(false);
    }
  };

  const saveDirectory = async (targetDir: string) => {
    if (!targetDir.trim()) return;

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: targetDir.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update workspace');
      }

      setWorkspace(data.workspace);
      setInputDir(data.workspace.directory);
      setSuccess('Working directory updated! Profile context switched.');

      // Notify entire app of profile/directory change
      window.dispatchEvent(
        new CustomEvent('factory:directory-changed', { detail: data.workspace })
      );

      setTimeout(() => {
        closeModal();
        setSuccess('');
      }, 700);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveDirectory(inputDir);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        closeModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const activeInfo = liveInfo || workspace;

  return (
    <>
      {/* Header Pill / Selector */}
      <button
        onClick={() => {
          setIsOpen(true);
          if (workspace?.directory) {
            setInputDir(workspace.directory);
          }
        }}
        className={`group flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors ${
          !workspace?.isConfigured
            ? 'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:border-amber-500/60'
            : 'border-white/[0.08] bg-neutral-900/60 text-neutral-300 hover:border-white/[0.15] hover:bg-neutral-900 hover:text-white'
        }`}
        title="Click to select or change working directory"
        aria-label="Working directory selector"
      >
        <FolderGit2
          className={`h-3.5 w-3.5 shrink-0 ${
            !workspace?.isConfigured ? 'text-amber-400 animate-pulse' : 'text-neutral-400 group-hover:text-neutral-200'
          }`}
        />
        <span className="font-mono text-[11px] truncate max-w-[200px] sm:max-w-[280px]">
          {workspace?.isConfigured && workspace?.directory
            ? workspace.directory
            : 'Select Project Directory...'}
        </span>

        {workspace?.isConfigured && workspace?.branch && (
          <span className="flex items-center gap-0.5 rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-400 border border-blue-500/20 font-mono">
            <GitBranch className="h-2.5 w-2.5" />
            {workspace.branch}
          </span>
        )}

        <Edit3 className="h-3 w-3 text-neutral-400 group-hover:text-neutral-300 ml-0.5" />
      </button>

      {/* Directory Selection Modal (Centered directly in viewport via React Portal) */}
      {mounted && isOpen && typeof document !== 'undefined' && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="dir-selector-title"
          className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        >
          <div className="relative w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <h3 id="dir-selector-title" className="flex items-center gap-2 text-base font-semibold text-white">
                <FolderOpen className="h-5 w-5 text-blue-400" />
                Select Factory Working Directory
              </h3>
              <button
                onClick={closeModal}
                aria-label="Close modal"
                className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mt-2 text-xs text-neutral-400 leading-relaxed">
              All OpenCode agents and Git worktrees will operate exclusively within this project folder.
            </p>

            {/* If no workspace configured yet, show onboarding notice */}
            {!workspace?.isConfigured && (
              <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
                <FolderOpen className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                <div>
                  <div className="font-semibold text-amber-200">Welcome to Software Factory!</div>
                  <div className="text-[11px] text-amber-300/80 mt-0.5">
                    Please select a project repository or folder to begin. You can choose from previous directories below or browse your system.
                  </div>
                </div>
              </div>
            )}

            {/* Previously Worked-In Directories (Recent Projects) */}
            {workspace?.recentDirs && workspace.recentDirs.length > 0 && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-medium text-neutral-400">
                  <span className="flex items-center gap-1.5 text-neutral-300">
                    <Clock className="h-3.5 w-3.5 text-blue-400" />
                    Previously Worked-In Directories
                  </span>
                  <span className="text-[10px] text-neutral-500 font-mono">
                    {workspace.recentDirs.length} recent
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-1.5 max-h-36 overflow-y-auto pr-1">
                  {workspace.recentDirs.map((dir) => {
                    const isCurrent = workspace.directory === dir;
                    const folderName = dir.split(/[\\/]/).filter(Boolean).pop() || dir;

                    return (
                      <button
                        key={dir}
                        type="button"
                        onClick={() => {
                          setInputDir(dir);
                          saveDirectory(dir);
                        }}
                        disabled={loading}
                        className={`group flex items-center justify-between gap-3 rounded-xl border p-2.5 text-left text-xs transition-all ${
                          isCurrent
                            ? 'border-blue-500/40 bg-blue-500/15 text-white'
                            : 'border-neutral-800 bg-neutral-950/60 text-neutral-300 hover:border-neutral-700 hover:bg-neutral-800 hover:text-white'
                        }`}
                        title={`Switch profile to ${dir}`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <Folder
                            className={`h-4 w-4 shrink-0 ${
                              isCurrent ? 'text-blue-400' : 'text-neutral-500 group-hover:text-blue-400'
                            }`}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-xs truncate flex items-center gap-1.5 text-neutral-200 group-hover:text-white">
                              <span>{folderName}</span>
                              {isCurrent && (
                                <span className="rounded bg-blue-500/20 px-1.5 py-0.2 text-[9px] font-mono text-blue-400 border border-blue-500/30">
                                  Current
                                </span>
                              )}
                            </div>
                            <div className="font-mono text-[10px] text-neutral-500 truncate group-hover:text-neutral-400">
                              {dir}
                            </div>
                          </div>
                        </div>

                        <span
                          className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-lg transition-colors ${
                            isCurrent
                              ? 'text-blue-400 font-semibold'
                              : 'text-neutral-400 group-hover:text-blue-300 group-hover:bg-blue-500/10'
                          }`}
                        >
                          {isCurrent ? 'Active' : 'Switch →'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {error && (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-400">
                <Check className="h-4 w-4 shrink-0" />
                <span>{success}</span>
              </div>
            )}

            <form onSubmit={handleSave} className="mt-4 space-y-4">
              <div>
                <label htmlFor="workspace-dir-input" className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Directory Path
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="workspace-dir-input"
                    type="text"
                    placeholder="e.g. D:\Projects\my-repo or C:\workspace\project"
                    value={inputDir}
                    onChange={(e) => setInputDir(e.target.value)}
                    className="flex-1 rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 font-mono text-xs text-neutral-200 placeholder-neutral-600 focus:border-blue-500 focus:outline-none"
                    required
                  />

                  {/* Native Windows Explorer Folder Picker Button (only on Windows desktop environments) */}
                  {workspace?.canBrowse !== false && (
                    <button
                      type="button"
                      onClick={handleBrowseExplorer}
                      className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2.5 text-xs font-medium active:scale-95 transition-all shadow-sm shrink-0 ${
                        browsing
                          ? 'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
                          : 'border-neutral-700 bg-neutral-800 text-white hover:bg-neutral-700 hover:border-neutral-600'
                      }`}
                      title={browsing ? 'Click to cancel folder picker' : 'Open Windows Explorer to browse and choose a folder'}
                    >
                      {browsing ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-400" />
                          <span>Cancel Browse</span>
                        </>
                      ) : (
                        <>
                          <Folder className="h-3.5 w-3.5 text-amber-400" />
                          <span>Browse...</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Status Details */}
              {activeInfo && (
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3 text-xs space-y-1.5">
                  <div className="flex items-center justify-between text-neutral-400">
                    <span>Path Exists:</span>
                    <span className={activeInfo.exists ? 'text-emerald-400 font-medium' : 'text-red-400'}>
                      {activeInfo.exists ? 'Yes' : 'No (path will be invalid)'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-neutral-400">
                    <span>Git Status:</span>
                    <span className={activeInfo.isGit ? 'text-emerald-400 font-medium' : 'text-amber-400'}>
                      {activeInfo.isGit
                        ? `Git Repository (branch: ${activeInfo.branch || 'HEAD'})`
                        : 'No .git repository found'}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-xl px-4 py-2 text-xs font-medium text-neutral-400 hover:bg-neutral-800 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !inputDir.trim() || (activeInfo ? !activeInfo.exists : false)}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors shadow-md shadow-blue-600/20"
                >
                  {loading ? 'Validating...' : 'Set Working Directory'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
