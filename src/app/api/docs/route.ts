import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getTargetDirectory } from '@/lib/workspace/config';
import { eventBus } from '@/lib/orchestrator/events';

export interface DocNode {
  id: string;
  name: string;
  relativePath: string;
  type: 'file' | 'directory';
  extension?: string;
  size?: number;
  modifiedAt?: number;
  children?: DocNode[];
}

function getSafeDocsDir(): { rootDir: string; docsDir: string } {
  const rootDir = getTargetDirectory();
  const docsDir = path.resolve(rootDir, 'docs');
  return { rootDir, docsDir };
}

function resolveSafePath(docsDir: string, relativePath: string): string | null {
  const sanitized = relativePath.replace(/^(\.\.(\/|\\|$))+/, '');
  const resolved = path.resolve(docsDir, sanitized);
  const normalizedDocs = path.resolve(docsDir);

  if (resolved !== normalizedDocs && !resolved.startsWith(normalizedDocs + path.sep)) {
    return null;
  }
  return resolved;
}

function scanDocsTree(dirPath: string, baseDocsDir: string): { nodes: DocNode[]; totalFiles: number } {
  if (!fs.existsSync(dirPath)) {
    return { nodes: [], totalFiles: 0 };
  }

  let totalFiles = 0;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  const directories: DocNode[] = [];
  const files: DocNode[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') {
      continue;
    }

    const fullPath = path.join(dirPath, entry.name);
    const relPath = path.relative(baseDocsDir, fullPath).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      const subResult = scanDocsTree(fullPath, baseDocsDir);
      totalFiles += subResult.totalFiles;
      directories.push({
        id: relPath,
        name: entry.name,
        relativePath: relPath,
        type: 'directory',
        children: subResult.nodes,
      });
    } else if (entry.isFile()) {
      try {
        const stats = fs.statSync(fullPath);
        const ext = path.extname(entry.name).toLowerCase();
        totalFiles += 1;
        files.push({
          id: relPath,
          name: entry.name,
          relativePath: relPath,
          type: 'file',
          extension: ext,
          size: stats.size,
          modifiedAt: stats.mtimeMs,
        });
      } catch {
        // Skip unreadable files
      }
    }
  }

  // Sort directories first alphabetically, then files
  directories.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));

  return {
    nodes: [...directories, ...files],
    totalFiles,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const { rootDir, docsDir } = getSafeDocsDir();
    const filePath = searchParams.get('file');

    // 1. Single file content retrieval
    if (filePath) {
      if (!fs.existsSync(docsDir)) {
        return NextResponse.json({ error: 'Docs folder does not exist' }, { status: 404 });
      }

      const safePath = resolveSafePath(docsDir, filePath);
      if (!safePath || !fs.existsSync(safePath)) {
        return NextResponse.json({ error: 'File not found or access denied' }, { status: 404 });
      }

      const stats = fs.statSync(safePath);
      if (stats.isDirectory()) {
        return NextResponse.json({ error: 'Path is a directory' }, { status: 400 });
      }

      const content = fs.readFileSync(safePath, 'utf-8');
      const ext = path.extname(safePath).toLowerCase();

      return NextResponse.json({
        file: {
          name: path.basename(safePath),
          relativePath: filePath.replace(/\\/g, '/'),
          content,
          size: stats.size,
          modifiedAt: stats.mtimeMs,
          extension: ext,
        },
      });
    }

    // 2. Full docs tree listing
    const exists = fs.existsSync(docsDir) && fs.statSync(docsDir).isDirectory();
    if (!exists) {
      return NextResponse.json({
        exists: false,
        rootDir,
        docsDir,
        totalFiles: 0,
        tree: [],
      });
    }

    const { nodes, totalFiles } = scanDocsTree(docsDir, docsDir);

    return NextResponse.json({
      exists: true,
      rootDir,
      docsDir,
      totalFiles,
      tree: nodes,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, relativePath, content } = body;
    const { rootDir, docsDir } = getSafeDocsDir();

    // Action A: Initialize /docs directory
    if (action === 'init') {
      if (!fs.existsSync(docsDir)) {
        fs.mkdirSync(docsDir, { recursive: true });
      }

      const starterPath = path.join(docsDir, 'README.md');
      if (!fs.existsSync(starterPath)) {
        const starterContent = `# Project Documentation

Welcome to the documentation space.

## Overview
This directory stores product requirements, architecture blueprints, system contracts, and guides.

### Structure
- \`architecture/\`: System design, entity-relationship diagrams, and flowcharts.
- \`specs/\`: Feature specifications and user stories.
- \`contracts/\`: API interfaces and schemas.
`;
        fs.writeFileSync(starterPath, starterContent, 'utf-8');
      }

      eventBus.emitEvent('activity:logged', {
        action: 'docs:initialized',
        directory: docsDir,
      });

      const { nodes, totalFiles } = scanDocsTree(docsDir, docsDir);
      return NextResponse.json({
        success: true,
        message: 'Docs folder initialized successfully',
        exists: true,
        rootDir,
        docsDir,
        totalFiles,
        tree: nodes,
        initialFile: 'README.md',
      });
    }

    // Action B: Save edited file
    if (action === 'save') {
      if (!relativePath || typeof content !== 'string') {
        return NextResponse.json({ error: 'relativePath and content are required' }, { status: 400 });
      }

      if (!fs.existsSync(docsDir)) {
        fs.mkdirSync(docsDir, { recursive: true });
      }

      const safePath = resolveSafePath(docsDir, relativePath);
      if (!safePath) {
        return NextResponse.json({ error: 'Invalid file path' }, { status: 403 });
      }

      // Ensure directory exists
      const parentDir = path.dirname(safePath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      fs.writeFileSync(safePath, content, 'utf-8');
      const stats = fs.statSync(safePath);

      eventBus.emitEvent('activity:logged', {
        action: 'docs:saved',
        relativePath,
      });

      return NextResponse.json({
        success: true,
        file: {
          name: path.basename(safePath),
          relativePath: relativePath.replace(/\\/g, '/'),
          size: stats.size,
          modifiedAt: stats.mtimeMs,
        },
      });
    }

    // Action C: Create new file or subfolder
    if (action === 'create') {
      if (!relativePath || typeof relativePath !== 'string') {
        return NextResponse.json({ error: 'relativePath is required' }, { status: 400 });
      }

      if (!fs.existsSync(docsDir)) {
        fs.mkdirSync(docsDir, { recursive: true });
      }

      const safePath = resolveSafePath(docsDir, relativePath);
      if (!safePath) {
        return NextResponse.json({ error: 'Invalid file path' }, { status: 403 });
      }

      if (fs.existsSync(safePath)) {
        return NextResponse.json({ error: 'File or directory already exists' }, { status: 409 });
      }

      const isDirectory = body.isDirectory === true;
      if (isDirectory) {
        fs.mkdirSync(safePath, { recursive: true });
      } else {
        const parentDir = path.dirname(safePath);
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true });
        }

        const initialText =
          typeof content === 'string'
            ? content
            : `# ${path.basename(safePath, path.extname(safePath))}\n\nDocument specification created.\n`;
        fs.writeFileSync(safePath, initialText, 'utf-8');
      }

      const { nodes, totalFiles } = scanDocsTree(docsDir, docsDir);

      return NextResponse.json({
        success: true,
        relativePath: relativePath.replace(/\\/g, '/'),
        tree: nodes,
        totalFiles,
      });
    }

    return NextResponse.json({ error: `Unknown action: "${action}"` }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
