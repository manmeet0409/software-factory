'use client';

import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  FileText,
  Eye,
  Edit3,
  Save,
  Copy,
  Check,
  Clock,
  HardDrive,
  FolderPlus,
  AlertCircle,
  FileCode,
} from 'lucide-react';
import { MermaidBlock } from './MermaidBlock';

export interface DocFileInfo {
  name: string;
  relativePath: string;
  content: string;
  size: number;
  modifiedAt: number;
  extension: string;
}

interface DocViewerProps {
  file: DocFileInfo | null;
  loading: boolean;
  onSave: (relativePath: string, content: string) => Promise<boolean>;
  hasDocsDir: boolean;
  rootDir: string;
  onInitDocs: () => void;
  isInitializing: boolean;
}

export function DocViewer({
  file,
  loading,
  onSave,
  hasDocsDir,
  rootDir,
  onInitDocs,
  isInitializing,
}: DocViewerProps) {
  const [mode, setMode] = useState<'preview' | 'edit'>('preview');
  const [editedContent, setEditedContent] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Undo / Redo History Stack
  interface HistoryItem {
    content: string;
    cursorPos?: number;
  }
  const historyRef = useRef<HistoryItem[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const isUndoRedoActionRef = useRef<boolean>(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const pushHistory = (content: string, cursorPos?: number) => {
    const currentStack = historyRef.current.slice(0, historyIndexRef.current + 1);
    if (currentStack.length > 0 && currentStack[currentStack.length - 1].content === content) {
      return;
    }
    const updated = [...currentStack, { content, cursorPos }];
    if (updated.length > 100) {
      updated.shift();
    }
    historyRef.current = updated;
    historyIndexRef.current = updated.length - 1;
  };

  // Sync editedContent when file changes
  useEffect(() => {
    if (file) {
      setEditedContent(file.content);
      historyRef.current = [{ content: file.content, cursorPos: 0 }];
      historyIndexRef.current = 0;
      setSaveSuccess(false);
    } else {
      setEditedContent('');
      historyRef.current = [];
      historyIndexRef.current = -1;
    }
  }, [file]);

  const isDirty = file ? editedContent !== file.content : false;

  // Handle Ctrl+S / Cmd+S save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (file && isDirty && !isSaving) {
          handleSave();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [file, isDirty, isSaving, editedContent]);

  const handleSave = async () => {
    if (!file || isSaving) return;
    setIsSaving(true);
    const success = await onSave(file.relativePath, editedContent);
    setIsSaving(false);
    if (success) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    }
  };

  const handleCopy = () => {
    const contentToCopy = mode === 'edit' ? editedContent : (file?.content ?? '');
    if (!contentToCopy) return;
    navigator.clipboard.writeText(contentToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Handle Textarea Change with Debounced History Recording
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    const cursorPos = e.target.selectionStart;
    setEditedContent(newContent);

    if (isUndoRedoActionRef.current) {
      isUndoRedoActionRef.current = false;
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      pushHistory(newContent, cursorPos);
    }, 350);
  };

  // Keyboard shortcut handler inside textarea (Ctrl+Z, Ctrl+Y, Tab)
  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isCtrl = e.ctrlKey || e.metaKey;

    // 1. Undo: Ctrl+Z (without Shift)
    if (isCtrl && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault();
      if (historyIndexRef.current > 0) {
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
        historyIndexRef.current -= 1;
        const target = historyRef.current[historyIndexRef.current];
        isUndoRedoActionRef.current = true;
        setEditedContent(target.content);

        setTimeout(() => {
          if (textareaRef.current && typeof target.cursorPos === 'number') {
            textareaRef.current.selectionStart = target.cursorPos;
            textareaRef.current.selectionEnd = target.cursorPos;
          }
        }, 0);
      }
      return;
    }

    // 2. Redo: Ctrl+Y or Ctrl+Shift+Z
    if (
      (isCtrl && e.key.toLowerCase() === 'y') ||
      (isCtrl && e.shiftKey && e.key.toLowerCase() === 'z')
    ) {
      e.preventDefault();
      if (historyIndexRef.current < historyRef.current.length - 1) {
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
        historyIndexRef.current += 1;
        const target = historyRef.current[historyIndexRef.current];
        isUndoRedoActionRef.current = true;
        setEditedContent(target.content);

        setTimeout(() => {
          if (textareaRef.current && typeof target.cursorPos === 'number') {
            textareaRef.current.selectionStart = target.cursorPos;
            textareaRef.current.selectionEnd = target.cursorPos;
          }
        }, 0);
      }
      return;
    }

    // 3. Tab Indentation
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      const newContent =
        editedContent.substring(0, start) + '  ' + editedContent.substring(end);
      setEditedContent(newContent);
      pushHistory(newContent, start + 2);

      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }, 0);
      return;
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes && bytes !== 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 1. Missing docs folder empty state
  if (!hasDocsDir) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-xl border border-white/[0.08] bg-neutral-900/40 p-8 text-center backdrop-blur-sm">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-inner">
          <FolderPlus className="h-7 w-7" />
        </div>
        <h3 className="text-base font-semibold text-neutral-100">
          No docs folder found, create one?
        </h3>
        <p className="mt-2 max-w-md text-xs text-neutral-400 leading-relaxed">
          The selected workspace root (
          <code className="rounded bg-neutral-800/80 px-1.5 py-0.5 text-neutral-300 font-mono text-[11px]">
            {rootDir}
          </code>
          ) does not contain a <code className="text-amber-400">/docs</code> directory.
        </p>
        <button
          onClick={onInitDocs}
          disabled={isInitializing}
          className="mt-6 flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white shadow-md hover:bg-blue-500 transition-all disabled:opacity-50"
        >
          {isInitializing ? (
            <>
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              <span>Initializing /docs...</span>
            </>
          ) : (
            <>
              <FolderPlus className="h-4 w-4" />
              <span>Create docs folder</span>
            </>
          )}
        </button>
      </div>
    );
  }

  // 2. Loading file state
  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-xl border border-white/[0.08] bg-neutral-900/40 p-8 text-neutral-400 backdrop-blur-sm">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent mb-3" />
        <span className="text-xs">Loading document...</span>
      </div>
    );
  }

  // 3. No document selected state
  if (!file) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-xl border border-white/[0.08] bg-neutral-900/40 p-8 text-center backdrop-blur-sm">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-800/80 text-neutral-400 border border-white/[0.06]">
          <FileText className="h-6 w-6" />
        </div>
        <h3 className="text-sm font-medium text-neutral-200">No Document Selected</h3>
        <p className="mt-1.5 max-w-sm text-xs text-neutral-400 leading-relaxed">
          Select a markdown specification or blueprint from the file tree on the right to view or edit.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col rounded-xl border border-white/[0.08] bg-neutral-900/40 backdrop-blur-sm overflow-hidden">
      {/* Top Document Header / Action Bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-white/[0.08] px-4 bg-neutral-900/70 gap-3">
        {/* Breadcrumb & Metadata */}
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-4 w-4 shrink-0 text-blue-400" />
          <div className="flex items-baseline gap-2 truncate">
            <span className="text-xs font-semibold text-neutral-100 truncate">
              {file.name}
            </span>
            <span className="hidden sm:inline font-mono text-[11px] text-neutral-500 truncate">
              docs/{file.relativePath}
            </span>
          </div>
          {isDirty && (
            <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400 border border-amber-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
              Unsaved
            </span>
          )}
          {saveSuccess && (
            <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-500/20">
              <Check className="h-3 w-3" />
              Saved
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* File stats */}
          <div className="hidden md:flex items-center gap-3 text-[11px] text-neutral-400 border-r border-white/[0.08] pr-3 mr-1">
            <span className="flex items-center gap-1">
              <HardDrive className="h-3 w-3 text-neutral-500" />
              {formatFileSize(file.size)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-neutral-500" />
              {formatDate(file.modifiedAt)}
            </span>
          </div>

          {/* View / Edit Mode Switcher */}
          <div className="flex items-center rounded-lg bg-neutral-800/80 p-0.5 border border-white/[0.06] text-xs">
            <button
              onClick={() => setMode('preview')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                mode === 'preview'
                  ? 'bg-neutral-700 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
              title="Rendered Markdown Preview"
            >
              <Eye className="h-3.5 w-3.5 text-blue-400" />
              <span className="hidden sm:inline">Preview</span>
            </button>
            <button
              onClick={() => setMode('edit')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                mode === 'edit'
                  ? 'bg-neutral-700 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
              title="Edit Markdown Source"
            >
              <Edit3 className="h-3.5 w-3.5 text-amber-400" />
              <span className="hidden sm:inline">Edit / Raw MD</span>
            </button>
          </div>

          {/* Copy Button */}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 rounded-md border border-white/[0.08] bg-neutral-800/60 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800 transition-colors"
            title="Copy content"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span className="hidden sm:inline text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Copy</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Document Body */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {mode === 'edit' ? (
          <div className="flex flex-col h-full">
            <div className="relative flex-1 flex flex-col">
              <textarea
                ref={textareaRef}
                value={editedContent}
                onChange={handleTextareaChange}
                onKeyDown={handleTextareaKeyDown}
                placeholder="Write your markdown document here..."
                className="w-full flex-1 resize-none rounded-lg border border-white/[0.08] bg-neutral-950/70 p-4 pr-14 font-mono text-xs text-neutral-200 placeholder-neutral-600 focus:border-blue-500/60 focus:outline-none focus:ring-1 focus:ring-blue-500/40 leading-relaxed"
                spellCheck={false}
              />

              {/* Floating Tick / Check Save Button (Top Right of Edit Area) */}
              <button
                onClick={handleSave}
                disabled={!isDirty || isSaving}
                className={`absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-200 shadow-md ${
                  isDirty
                    ? 'bg-emerald-500 text-neutral-950 hover:bg-emerald-400 hover:scale-105 active:scale-95 shadow-emerald-500/20 ring-2 ring-emerald-400/50 cursor-pointer'
                    : saveSuccess
                    ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/40'
                    : 'bg-neutral-800/80 text-neutral-500 border border-white/[0.06] cursor-not-allowed opacity-50'
                }`}
                title={isDirty ? 'Save changes (Ctrl+S)' : saveSuccess ? 'Saved!' : 'No unsaved changes'}
              >
                {isSaving ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-950 border-t-transparent" />
                ) : (
                  <Check
                    className={`h-4 w-4 stroke-[2.5] ${
                      isDirty ? 'text-neutral-950' : saveSuccess ? 'text-emerald-400' : 'text-neutral-500'
                    }`}
                  />
                )}
              </button>
            </div>

            <div className="flex items-center justify-between mt-2 text-[11px] text-neutral-500 px-1">
              <span>Supports Markdown &amp; Mermaid code blocks (\`\`\`mermaid)</span>
              <span>
                <kbd className="rounded bg-neutral-800 px-1 font-mono text-[10px]">Ctrl+S</kbd> save •{' '}
                <kbd className="rounded bg-neutral-800 px-1 font-mono text-[10px]">Ctrl+Z</kbd> undo •{' '}
                <kbd className="rounded bg-neutral-800 px-1 font-mono text-[10px]">Ctrl+Y</kbd> redo
              </span>
            </div>
          </div>
        ) : (
          <article className="prose prose-invert prose-xs sm:prose-sm max-w-none text-neutral-200">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => (
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white pb-2 border-b border-white/[0.08] mb-4">
                    {children}
                  </h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-base sm:text-lg font-semibold text-neutral-100 pt-4 pb-1 border-b border-white/[0.06] mb-3">
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-sm sm:text-base font-semibold text-neutral-200 pt-3 mb-2">
                    {children}
                  </h3>
                ),
                p: ({ children }) => (
                  <div className="text-xs sm:text-sm text-neutral-300 leading-relaxed mb-3">
                    {children}
                  </div>
                ),
                ul: ({ children }) => (
                  <ul className="list-disc list-inside space-y-1 my-2 text-xs sm:text-sm text-neutral-300">
                    {children}
                  </ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal list-inside space-y-1 my-2 text-xs sm:text-sm text-neutral-300">
                    {children}
                  </ol>
                ),
                li: ({ children }) => (
                  <li className="text-neutral-300 text-xs sm:text-sm leading-relaxed">
                    {children}
                  </li>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="border-l-2 border-blue-500/60 bg-blue-500/[0.04] px-4 py-2 my-3 rounded-r text-xs sm:text-sm text-neutral-300 italic">
                    {children}
                  </blockquote>
                ),
                table: ({ children }) => (
                  <div className="my-4 overflow-x-auto rounded-lg border border-white/[0.08]">
                    <table className="w-full text-left text-xs border-collapse">
                      {children}
                    </table>
                  </div>
                ),
                thead: ({ children }) => (
                  <thead className="bg-neutral-800/70 text-neutral-200 font-semibold border-b border-white/[0.08]">
                    {children}
                  </thead>
                ),
                th: ({ children }) => (
                  <th className="px-3 py-2 text-xs font-medium text-neutral-300 border-r border-white/[0.04] last:border-r-0">
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="px-3 py-2 text-xs text-neutral-300 border-b border-white/[0.04] border-r border-white/[0.04] last:border-r-0">
                    {children}
                  </td>
                ),
                pre: ({ children }) => <>{children}</>,
                code({ className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || '');
                  const rawString = String(children).replace(/\n$/, '');
                  const trimmed = rawString.trim();

                  // Robust Mermaid Diagram Detection:
                  // 1. Language tag is mermaid: ```mermaid ... ```
                  // 2. Or content starts with mermaid keyword or valid diagram type
                  const isMermaid =
                    (match && match[1] === 'mermaid') ||
                    trimmed.startsWith('graph ') ||
                    trimmed.startsWith('graph\n') ||
                    trimmed.startsWith('flowchart ') ||
                    trimmed.startsWith('flowchart\n') ||
                    trimmed.startsWith('sequenceDiagram') ||
                    trimmed.startsWith('stateDiagram') ||
                    trimmed.startsWith('classDiagram') ||
                    trimmed.startsWith('erDiagram') ||
                    trimmed.startsWith('mermaid ') ||
                    trimmed.startsWith('mermaid\n');

                  if (isMermaid) {
                    return <MermaidBlock chart={trimmed} />;
                  }

                  // Inline code
                  if (!match && !rawString.includes('\n')) {
                    return (
                      <code
                        className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-[11px] text-blue-300"
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  }

                  // Multi-line code block
                  return (
                    <div className="my-3 overflow-hidden rounded-lg border border-white/[0.08] bg-black/60 shadow-sm">
                      {match && (
                        <div className="flex items-center justify-between border-b border-white/[0.06] bg-neutral-900/60 px-3 py-1 text-[10px] font-mono text-neutral-400">
                          <span>{match[1]}</span>
                        </div>
                      )}
                      <pre className="overflow-x-auto p-3 text-xs font-mono text-neutral-200 leading-relaxed">
                        <code>{children}</code>
                      </pre>
                    </div>
                  );
                },
                a: ({ href, children }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors"
                  >
                    {children}
                  </a>
                ),
              }}
            >
              {editedContent}
            </ReactMarkdown>
          </article>
        )}
      </div>
    </div>
  );
}
