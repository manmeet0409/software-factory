import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { WorktreeInfo } from './types';

export class WorktreeManager {
  private projectRoot: string;
  private worktreeBaseDir: string;

  constructor(
    projectRoot: string,
    worktreeBaseDir?: string
  ) {
    this.projectRoot = path.resolve(projectRoot);
    this.worktreeBaseDir = path.resolve(
      worktreeBaseDir || path.resolve(this.projectRoot, '../software-factory-worktrees')
    );
  }

  // Normalize path for git commands (forward slashes for Windows compatibility)
  private normalizePath(targetPath: string): string {
    return targetPath.replace(/\\/g, '/');
  }

  // Execute git command synchronously within project root
  private execGit(command: string, cwd?: string): string {
    return execSync(command, {
      cwd: cwd || this.projectRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  }

  // Detect the main branch name (e.g. main or master)
  private getMainBranch(): string {
    try {
      const branches = this.execGit('git branch --list main master');
      if (branches.includes('main')) return 'main';
      if (branches.includes('master')) return 'master';
    } catch {
      // fallback
    }
    return 'main';
  }

  // Get worktree directory for a ticket
  getWorktreeDir(ticketId: string): string {
    return path.resolve(this.worktreeBaseDir, ticketId);
  }

  // Create a new worktree for a ticket
  async create(ticketId: string, baseBranch?: string): Promise<string> {
    const worktreeDir = this.getWorktreeDir(ticketId);
    const normalizedDir = this.normalizePath(worktreeDir);
    const branchName = `ticket/${ticketId}`;
    const base = baseBranch || this.getMainBranch();

    if (!fs.existsSync(this.worktreeBaseDir)) {
      fs.mkdirSync(this.worktreeBaseDir, { recursive: true });
    }

    // Check if worktree already exists in git worktree list
    const existingWorktrees = await this.list();
    const existing = existingWorktrees.find(
      (wt) => path.resolve(wt.path).toLowerCase() === path.resolve(worktreeDir).toLowerCase()
    );

    if (!existing) {
      // Check if branch already exists
      let branchExists = false;
      try {
        const out = this.execGit(`git rev-parse --verify refs/heads/${branchName}`);
        if (out.trim()) {
          branchExists = true;
        }
      } catch {
        branchExists = false;
      }

      if (branchExists) {
        this.execGit(`git worktree add "${normalizedDir}" ${branchName}`);
      } else {
        this.execGit(`git worktree add -b ${branchName} "${normalizedDir}" ${base}`);
      }
    }

    // Copy opencode.json (agent configs) into each new worktree if it exists
    const srcOpencodeJson = path.join(this.projectRoot, 'opencode.json');
    const destOpencodeJson = path.join(worktreeDir, 'opencode.json');
    if (fs.existsSync(srcOpencodeJson)) {
      fs.copyFileSync(srcOpencodeJson, destOpencodeJson);
    }

    // Also copy agent-configs directory if it exists
    const srcAgentConfigs = path.join(this.projectRoot, 'agent-configs');
    const destAgentConfigs = path.join(worktreeDir, 'agent-configs');
    if (fs.existsSync(srcAgentConfigs)) {
      fs.cpSync(srcAgentConfigs, destAgentConfigs, { recursive: true });
    }

    return worktreeDir;
  }

  // Remove a worktree
  async remove(ticketId: string): Promise<void> {
    const worktreeDir = this.getWorktreeDir(ticketId);
    const normalizedDir = this.normalizePath(worktreeDir);

    try {
      this.execGit(`git worktree remove --force "${normalizedDir}"`);
    } catch {
      // If git worktree remove fails or directory is dirty/untracked, clean up manually
      if (fs.existsSync(worktreeDir)) {
        fs.rmSync(worktreeDir, { recursive: true, force: true });
      }
    }

    try {
      this.execGit('git worktree prune');
    } catch {
      // ignore prune errors
    }
  }

  // List existing worktrees
  async list(): Promise<WorktreeInfo[]> {
    const output = this.execGit('git worktree list --porcelain');
    const entries: WorktreeInfo[] = [];
    const blocks = output.split(/(?:\r?\n){2,}/);

    const normalizedBase = path.resolve(this.worktreeBaseDir).toLowerCase();
    const normalizedRoot = path.resolve(this.projectRoot).toLowerCase();

    for (const block of blocks) {
      if (!block.trim()) continue;

      const lines = block.split(/\r?\n/);
      let wtPath = '';
      let head = '';
      let branch = '';
      let locked = false;
      let prunable = false;

      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          wtPath = line.substring(9).trim();
        } else if (line.startsWith('HEAD ')) {
          head = line.substring(5).trim();
        } else if (line.startsWith('branch ')) {
          branch = line.substring(7).trim().replace(/^refs\/heads\//, '');
        } else if (line.startsWith('locked')) {
          locked = true;
        } else if (line.startsWith('prunable')) {
          prunable = true;
        }
      }

      if (!wtPath) continue;

      const normalizedWtPath = path.resolve(wtPath).toLowerCase();
      const isMain = normalizedWtPath === normalizedRoot;

      let ticketId: string | undefined;
      if (branch.startsWith('ticket/')) {
        ticketId = branch.substring('ticket/'.length);
      } else if (normalizedWtPath.startsWith(normalizedBase)) {
        ticketId = path.basename(path.resolve(wtPath));
      }

      entries.push({
        ticketId,
        path: wtPath,
        branch: branch || undefined,
        commit: head || undefined,
        head: head || undefined,
        isMain,
        locked,
        prunable,
      });
    }

    return entries;
  }

  // Merge worktree branch into main and cleanup
  async mergeAndCleanup(ticketId: string): Promise<void> {
    const branchName = `ticket/${ticketId}`;
    const mainBranch = this.getMainBranch();

    // 1. Checkout main
    this.execGit(`git checkout ${mainBranch}`);

    // 2. Merge worktree branch into main
    this.execGit(`git merge "${branchName}"`);

    // 3. Delete worktree
    await this.remove(ticketId);

    // 4. Delete branch
    try {
      this.execGit(`git branch -d "${branchName}"`);
    } catch {
      // Force delete branch if already merged
      this.execGit(`git branch -D "${branchName}"`);
    }

    // 5. Final prune
    try {
      this.execGit('git worktree prune');
    } catch {
      // ignore
    }
  }
}
