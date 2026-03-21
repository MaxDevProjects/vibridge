/**
 * DevBridge Agent — Filesystem reader (read-only)
 */
import fs from 'fs';
import path from 'path';

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'dir';
  children?: FileNode[];
}

const IGNORED = new Set([
  'node_modules', '.git', 'dist', '.next', 'build', 'coverage',
  '.turbo', '.cache', '__pycache__', '.venv',
]);

const MAX_FILE_SIZE = 1024 * 1024; // 1 MB cap for inline reads

export class FileService {
  constructor(private root: string) {
    console.log(`[Files] Workspace root: ${root}`);
  }

  tree(dir = this.root, depth = 0, relRoot?: string): FileNode {
    const effectiveRoot = relRoot ?? dir;
    const name = path.basename(dir);
    const relPath = dir === effectiveRoot ? '' : dir.startsWith(effectiveRoot) ? dir.slice(effectiveRoot.length).replace(/^\//, '') : this.relativize(dir);
    const node: FileNode = { name, path: relPath, type: 'dir', children: [] };

    if (depth > 8) return node;

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return node;
    }

    for (const entry of entries) {
      if (IGNORED.has(entry.name) || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        node.children!.push(this.tree(full, depth + 1, effectiveRoot));
      } else if (entry.isFile()) {
        const fileRelPath = full.startsWith(effectiveRoot) ? full.slice(effectiveRoot.length).replace(/^\//, '') : this.relativize(full);
        node.children!.push({
          name: entry.name,
          path: fileRelPath,
          type: 'file',
        });
      }
    }

    return node;
  }

  /** Build a tree from an arbitrary directory, with paths relative to that directory */
  treeFrom(dir: string): FileNode {
    return this.tree(dir, 0, dir);
  }

  read(relPath: string, fromRoot?: string): string | null {
    const abs = this.safeResolve(relPath, fromRoot);
    if (!abs) return null;
    try {
      const stat = fs.statSync(abs);
      if (stat.size > MAX_FILE_SIZE) {
        return `[File too large: ${stat.size} bytes — max ${MAX_FILE_SIZE}]`;
      }
      return fs.readFileSync(abs, 'utf8');
    } catch {
      return null;
    }
  }

  private safeResolve(relPath: string, fromRoot?: string): string | null {
    const root = fromRoot ?? this.root;
    const abs = path.resolve(root, relPath.replace(/^\//, ''));
    // Prevent path traversal
    if (!abs.startsWith(root)) return null;
    return abs;
  }

  private relativize(abs: string): string {
    return abs.startsWith(this.root)
      ? abs.slice(this.root.length).replace(/^\//, '')
      : abs;
  }
}
