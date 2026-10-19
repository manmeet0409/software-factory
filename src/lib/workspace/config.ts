import fs from 'fs';
import path from 'path';
import { execSync, execFile } from 'child_process';

const CONFIG_PATH = path.join(process.cwd(), 'data', 'workspace.json');

const MAX_RECENT = 10;

interface WorkspaceConfig {
  targetDirectory?: string;
  configured?: boolean;
  recentDirectories?: string[];
}

function readConfig(): WorkspaceConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
      return JSON.parse(content) as WorkspaceConfig;
    }
  } catch {
    // ignore
  }
  return {};
}

function writeConfig(cfg: WorkspaceConfig): void {
  const dataDir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

export function getRecentDirectories(): string[] {
  return readConfig().recentDirectories ?? [];
}

function appendRecent(dir: string): void {
  const cfg = readConfig();
  const existing = cfg.recentDirectories ?? [];
  const updated = [dir, ...existing.filter((d) => d !== dir)].slice(0, MAX_RECENT);
  writeConfig({ ...cfg, recentDirectories: updated });
}

export interface WorkspaceInfo {
  directory: string;
  exists: boolean;
  isGit: boolean;
  branch: string | null;
  canBrowse?: boolean;
  isConfigured: boolean;
  recentDirs: string[];
}

export function getTargetDirectory(): string {
  try {
    const cfg = readConfig();
    if (cfg.targetDirectory && fs.existsSync(cfg.targetDirectory)) {
      return path.resolve(cfg.targetDirectory);
    }
  } catch {
    // fallback to process.cwd()
  }
  return path.resolve(process.cwd());
}

export function setTargetDirectory(targetDir: string): WorkspaceInfo {
  const resolved = path.resolve(targetDir.trim());

  if (!fs.existsSync(resolved)) {
    throw new Error(`Directory does not exist: "${resolved}"`);
  }

  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    throw new Error(`Path is not a directory: "${resolved}"`);
  }

  const cfg = readConfig();
  writeConfig({ ...cfg, targetDirectory: resolved, configured: true });
  appendRecent(resolved);

  return getWorkspaceInfo();
}

export function inspectDirectory(targetPath: string): WorkspaceInfo {
  const cfg = readConfig();
  const isConfigured = Boolean(cfg.targetDirectory && cfg.configured !== false);
  const recentDirs = getRecentDirectories();

  try {
    const resolved = path.resolve(targetPath.trim());
    const exists = fs.existsSync(resolved);
    let isGit = false;
    let branch: string | null = null;

    if (exists) {
      try {
        const stat = fs.statSync(resolved);
        if (stat.isDirectory()) {
          const gitDir = path.join(resolved, '.git');
          if (fs.existsSync(gitDir)) {
            isGit = true;
            try {
              const branchOut = execSync('git rev-parse --abbrev-ref HEAD', {
                cwd: resolved,
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'pipe'],
                timeout: 3000,
              });
              branch = branchOut.trim() || null;
            } catch {
              // git repo without commits
            }
          }
        }
      } catch {
        // stat error
      }
    }

    return {
      directory: resolved,
      exists,
      isGit,
      branch,
      canBrowse: process.platform === 'win32',
      isConfigured,
      recentDirs,
    };
  } catch {
    return {
      directory: targetPath,
      exists: false,
      isGit: false,
      branch: null,
      canBrowse: process.platform === 'win32',
      isConfigured,
      recentDirs,
    };
  }
}

export function getWorkspaceInfo(): WorkspaceInfo {
  const dir = getTargetDirectory();
  return inspectDirectory(dir);
}

export function browseFolder(initialPath?: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve(null);
      return;
    }

    const exePath = path.resolve(process.cwd(), 'scripts', 'browse-folder.exe');
    const psScriptPath = path.resolve(process.cwd(), 'scripts', 'browse-folder.ps1');

    const args: string[] = [];
    if (initialPath && fs.existsSync(initialPath)) {
      args.push(initialPath);
    }

    if (fs.existsSync(exePath)) {
      // Direct native executable: instant launch in <20ms
      execFile(
        exePath,
        args,
        { encoding: 'utf-8', timeout: 180000, windowsHide: true },
        (error, stdout) => {
          if (error) {
            resolve(null);
            return;
          }
          const selected = stdout.trim();
          resolve(selected && fs.existsSync(selected) ? selected : null);
        }
      );
    } else {
      // Fallback to PowerShell if exe is missing
      const psArgs = ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', psScriptPath, ...args];
      execFile(
        'powershell.exe',
        psArgs,
        { encoding: 'utf-8', timeout: 180000, windowsHide: true },
        (error, stdout) => {
          if (error) {
            resolve(null);
            return;
          }
          const selected = stdout.trim();
          resolve(selected && fs.existsSync(selected) ? selected : null);
        }
      );
    }
  });
}

/**
 * Lists immediate subdirectories and parent path for fast in-modal navigation.
 */
export function getSubdirectories(dirPath: string) {
  try {
    const resolved = path.resolve(dirPath);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      return null;
    }

    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const subdirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
      .map((e) => {
        const subPath = path.join(resolved, e.name);
        const isGit = fs.existsSync(path.join(subPath, '.git'));
        return {
          name: e.name,
          path: subPath,
          isGit,
        };
      })
      .slice(0, 40);

    const parent = path.dirname(resolved);
    return {
      current: resolved,
      parent: parent !== resolved ? parent : null,
      subdirs,
    };
  } catch {
    return null;
  }
}
