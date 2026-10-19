'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DocViewer, DocFileInfo } from './DocViewer';
import { DocFileTree } from './DocFileTree';
import { DocNode } from '@/app/api/docs/route';

export function DocSpace() {
  const [tree, setTree] = useState<DocNode[]>([]);
  const [totalFiles, setTotalFiles] = useState(0);
  const [hasDocsDir, setHasDocsDir] = useState(true);
  const [rootDir, setRootDir] = useState('');
  const [loadingTree, setLoadingTree] = useState(true);

  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [activeDoc, setActiveDoc] = useState<DocFileInfo | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);

  // Helper: Find first markdown file in tree recursively
  const findFirstFile = (nodes: DocNode[]): string | null => {
    for (const node of nodes) {
      if (node.type === 'file') {
        return node.relativePath;
      }
      if (node.type === 'directory' && node.children) {
        const found = findFirstFile(node.children);
        if (found) return found;
      }
    }
    return null;
  };

  // 1. Fetch Docs Tree
  const fetchTree = useCallback(async (autoSelect: boolean = false) => {
    try {
      setLoadingTree(true);
      const res = await fetch('/api/docs');
      if (res.ok) {
        const data = await res.json();
        setHasDocsDir(Boolean(data.exists));
        setRootDir(data.rootDir || '');
        setTotalFiles(data.totalFiles || 0);
        setTree(data.tree || []);

        if (data.exists && autoSelect && (data.tree || []).length > 0) {
          const first = findFirstFile(data.tree);
          if (first) {
            setSelectedFilePath(first);
          }
        }
      }
    } catch {
      // ignore
    } finally {
      setLoadingTree(false);
    }
  }, []);

  // 2. Fetch specific doc content
  const fetchDoc = useCallback(async (relPath: string) => {
    try {
      setLoadingDoc(true);
      const res = await fetch(`/api/docs?file=${encodeURIComponent(relPath)}`);
      if (res.ok) {
        const data = await res.json();
        setActiveDoc(data.file);
      } else {
        setActiveDoc(null);
      }
    } catch {
      setActiveDoc(null);
    } finally {
      setLoadingDoc(false);
    }
  }, []);

  // On mount: load tree and auto-select first document
  useEffect(() => {
    fetchTree(true);

    // Listen to real-time events for workspace change
    const eventSource = new EventSource('/api/events');
    const handleWorkspaceChanged = () => {
      setSelectedFilePath(null);
      setActiveDoc(null);
      fetchTree(true);
    };

    eventSource.addEventListener('workspace:changed', handleWorkspaceChanged);
    eventSource.onerror = () => {};

    // Refocus listener
    const handleFocus = () => fetchTree(false);
    window.addEventListener('focus', handleFocus);

    return () => {
      eventSource.close();
      window.removeEventListener('focus', handleFocus);
    };
  }, [fetchTree]);

  // When selectedFilePath changes, load its content
  useEffect(() => {
    if (selectedFilePath) {
      fetchDoc(selectedFilePath);
    } else {
      setActiveDoc(null);
    }
  }, [selectedFilePath, fetchDoc]);

  // Save handler
  const handleSaveDoc = async (relativePath: string, content: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          relativePath,
          content,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setActiveDoc((prev) =>
          prev ? { ...prev, content, size: data.file.size, modifiedAt: data.file.modifiedAt } : null
        );
        fetchTree(false);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  // Initialize missing docs folder
  const handleInitDocs = async () => {
    try {
      setIsInitializing(true);
      const res = await fetch('/api/docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'init' }),
      });

      if (res.ok) {
        const data = await res.json();
        setHasDocsDir(true);
        setRootDir(data.rootDir || '');
        setTotalFiles(data.totalFiles || 0);
        setTree(data.tree || []);

        if (data.initialFile) {
          setSelectedFilePath(data.initialFile);
        }
      }
    } catch {
      // ignore
    } finally {
      setIsInitializing(false);
    }
  };

  // Create new doc file
  const handleCreateDoc = async (relativePath: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          relativePath,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setTree(data.tree || []);
        setTotalFiles(data.totalFiles || 0);
        setSelectedFilePath(data.relativePath);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  return (
    <div className="flex h-full w-full gap-3 sm:gap-4 overflow-hidden">
      {/* Center Pane: Document Viewer (Editor / Preview) */}
      <section className="flex-1 min-w-0 h-full overflow-hidden" aria-label="Document Viewer">
        <DocViewer
          file={activeDoc}
          loading={loadingDoc}
          onSave={handleSaveDoc}
          hasDocsDir={hasDocsDir}
          rootDir={rootDir}
          onInitDocs={handleInitDocs}
          isInitializing={isInitializing}
        />
      </section>

      {/* Right Pane: Docs File Tree */}
      <aside className="w-64 sm:w-72 lg:w-80 shrink-0 h-full overflow-hidden" aria-label="Docs File Tree">
        <DocFileTree
          tree={tree}
          selectedFilePath={selectedFilePath}
          onSelectFile={setSelectedFilePath}
          onRefresh={() => fetchTree(false)}
          onCreateDoc={handleCreateDoc}
          totalFiles={totalFiles}
          rootDir={rootDir}
          hasDocsDir={hasDocsDir}
          loading={loadingTree}
        />
      </aside>
    </div>
  );
}
