'use client';

import React, { useState, useMemo } from 'react';
import {
  Folder,
  FolderOpen,
  FileText,
  FileCode,
  File,
  Search,
  RefreshCw,
  Plus,
  ChevronRight,
  ChevronDown,
  X,
  FilePlus,
  Sparkles,
} from 'lucide-react';
import { DocNode } from '@/app/api/docs/route';

interface DocFileTreeProps {
  tree: DocNode[];
  selectedFilePath: string | null;
  onSelectFile: (path: string) => void;
  onRefresh: () => void;
  onCreateDoc: (relativePath: string) => Promise<boolean>;
  totalFiles: number;
  rootDir: string;
  hasDocsDir: boolean;
  loading: boolean;
}

export function DocFileTree({
  tree,
  selectedFilePath,
  onSelectFile,
  onRefresh,
  onCreateDoc,
  totalFiles,
  rootDir,
  hasDocsDir,
  loading,
}: DocFileTreeProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [showNewDocModal, setShowNewDocModal] = useState(false);
  const [newDocName, setNewDocName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Toggle folder expansion
  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => ({
      ...prev,
      [folderId]: prev[folderId] === false ? true : false,
    }));
  };

  const isFolderExpanded = (folderId: string) => {
    // Default to true (expanded) unless explicitly closed
    return expandedFolders[folderId] !== false;
  };

  // Filter tree recursively based on search query
  const filteredTree = useMemo(() => {
    if (!searchQuery.trim()) return tree;

    const query = searchQuery.toLowerCase().trim();

    function filterNodes(nodes: DocNode[]): DocNode[] {
      const result: DocNode[] = [];

      for (const node of nodes) {
        if (node.type === 'directory') {
          const matchingChildren = filterNodes(node.children || []);
          if (matchingChildren.length > 0 || node.name.toLowerCase().includes(query)) {
            result.push({
              ...node,
              children: matchingChildren,
            });
          }
        } else if (node.name.toLowerCase().includes(query) || node.relativePath.toLowerCase().includes(query)) {
          result.push(node);
        }
      }

      return result;
    }

    return filterNodes(tree);
  }, [tree, searchQuery]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newDocName.trim();
    if (!trimmed) return;

    // Ensure .md extension if not specified
    const finalPath = trimmed.endsWith('.md') ? trimmed : `${trimmed}.md`;

    try {
      setIsCreating(true);
      setCreateError('');
      const success = await onCreateDoc(finalPath);
      if (success) {
        setNewDocName('');
        setShowNewDocModal(false);
      } else {
        setCreateError('Failed to create file. It may already exist.');
      }
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCreating(false);
    }
  };

  const renderFileIcon = (node: DocNode) => {
    const ext = node.extension?.toLowerCase();
    if (ext === '.md') {
      return <FileText className="h-3.5 w-3.5 text-blue-400 shrink-0" />;
    }
    if (ext === '.ts' || ext === '.js' || ext === '.tsx' || ext === '.jsx') {
      return <FileCode className="h-3.5 w-3.5 text-emerald-400 shrink-0" />;
    }
    if (ext === '.json') {
      return <FileCode className="h-3.5 w-3.5 text-amber-400 shrink-0" />;
    }
    return <File className="h-3.5 w-3.5 text-neutral-400 shrink-0" />;
  };

  const renderNode = (node: DocNode, depth: number = 0) => {
    const isSelected = selectedFilePath === node.relativePath;
    const paddingLeft = `${depth * 14 + 10}px`;

    if (node.type === 'directory') {
      const expanded = isFolderExpanded(node.id);
      return (
        <div key={node.id} className="select-none">
          <button
            onClick={() => toggleFolder(node.id)}
            style={{ paddingLeft }}
            className="flex w-full items-center gap-1.5 py-1 pr-2 text-xs text-neutral-300 hover:bg-neutral-800/60 rounded-md transition-colors group"
          >
            {expanded ? (
              <ChevronDown className="h-3 w-3 text-neutral-500 group-hover:text-neutral-300 shrink-0" />
            ) : (
              <ChevronRight className="h-3 w-3 text-neutral-500 group-hover:text-neutral-300 shrink-0" />
            )}
            {expanded ? (
              <FolderOpen className="h-3.5 w-3.5 text-amber-400/90 shrink-0" />
            ) : (
              <Folder className="h-3.5 w-3.5 text-amber-400/70 shrink-0" />
            )}
            <span className="truncate font-medium text-neutral-200">{node.name}</span>
            {node.children && (
              <span className="ml-auto text-[10px] text-neutral-500 font-mono">
                {node.children.length}
              </span>
            )}
          </button>
          {expanded && node.children && (
            <div className="flex flex-col">
              {node.children.map((child) => renderNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    return (
      <button
        key={node.id}
        onClick={() => onSelectFile(node.relativePath)}
        style={{ paddingLeft }}
        className={`flex w-full items-center gap-2 py-1 pr-2 text-xs rounded-md transition-colors text-left ${
          isSelected
            ? 'bg-blue-600/20 text-blue-200 font-medium border-l-2 border-blue-500'
            : 'text-neutral-300 hover:bg-neutral-800/50 hover:text-white'
        }`}
      >
        {renderFileIcon(node)}
        <span className="truncate">{node.name}</span>
      </button>
    );
  };

  return (
    <div className="flex h-full flex-col rounded-xl border border-white/[0.08] bg-neutral-900/40 backdrop-blur-sm overflow-hidden">
      {/* Sidebar Header */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-white/[0.08] px-3 bg-neutral-900/70 gap-2">
        <div className="flex items-center gap-2">
          <Folder className="h-4 w-4 text-amber-400" />
          <h2 className="text-xs font-semibold text-neutral-200">
            Docs Explorer
          </h2>
          {hasDocsDir && (
            <span className="rounded-full bg-neutral-800 px-1.5 py-0.2 font-mono text-[10px] text-neutral-400">
              {totalFiles}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {hasDocsDir && (
            <button
              onClick={() => setShowNewDocModal(true)}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.08] bg-neutral-800/80 text-neutral-300 hover:bg-neutral-700 hover:text-white transition-colors"
              title="Create New Document"
            >
              <Plus className="h-3.5 w-3.5 text-blue-400" />
            </button>
          )}

          <button
            onClick={onRefresh}
            disabled={loading}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.08] bg-neutral-800/80 text-neutral-300 hover:bg-neutral-700 hover:text-white transition-colors disabled:opacity-50"
            title="Refresh Docs Tree"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* Search Input Bar */}
      {hasDocsDir && (
        <div className="p-2 border-b border-white/[0.06]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3 w-3 text-neutral-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter docs..."
              className="w-full rounded-md border border-white/[0.08] bg-neutral-950/70 py-1.5 pl-7 pr-7 text-xs text-neutral-200 placeholder-neutral-500 focus:border-blue-500/60 focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-2 text-neutral-500 hover:text-neutral-300"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* New Document Modal / Inline Form */}
      {showNewDocModal && (
        <div className="p-2.5 border-b border-white/[0.08] bg-blue-950/20">
          <form onSubmit={handleCreateSubmit} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-blue-400">
                <FilePlus className="h-3.5 w-3.5" />
                New Document
              </span>
              <button
                type="button"
                onClick={() => {
                  setShowNewDocModal(false);
                  setCreateError('');
                }}
                className="text-neutral-500 hover:text-neutral-300"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <input
              type="text"
              autoFocus
              value={newDocName}
              onChange={(e) => setNewDocName(e.target.value)}
              placeholder="e.g. prd.md or specs/login.md"
              className="w-full rounded border border-blue-500/40 bg-neutral-900 px-2 py-1 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-blue-400 font-mono"
            />
            {createError && (
              <span className="text-[10px] text-red-400">{createError}</span>
            )}
            <div className="flex justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setShowNewDocModal(false)}
                className="rounded px-2 py-0.5 text-[11px] text-neutral-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isCreating || !newDocName.trim()}
                className="rounded bg-blue-600 px-2.5 py-0.5 text-[11px] font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {isCreating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tree Content */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {!hasDocsDir ? (
          <div className="p-4 text-center text-xs text-neutral-500">
            <span>Docs folder not initialized</span>
          </div>
        ) : filteredTree.length === 0 ? (
          <div className="p-4 text-center text-xs text-neutral-500">
            {searchQuery ? 'No documents match your filter' : 'No documents in /docs'}
          </div>
        ) : (
          filteredTree.map((node) => renderNode(node, 0))
        )}
      </div>

      {/* Footer Status */}
      <footer className="flex h-7 shrink-0 items-center justify-between border-t border-white/[0.06] px-3 bg-neutral-900/60 text-[10px] text-neutral-500 font-mono truncate">
        <span className="truncate">docs/</span>
        <span>{totalFiles} {totalFiles === 1 ? 'doc' : 'docs'}</span>
      </footer>
    </div>
  );
}
