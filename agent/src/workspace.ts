import fs from 'fs';
import path from 'path';

export interface WorkspaceIdentity {
  id: string;
  name: string;
  path: string;
  envPath: string;
}

interface VscodeLikeWorkspaceFolder {
  name?: string;
}

interface VscodeLikeApi {
  workspace?: {
    workspaceFolders?: VscodeLikeWorkspaceFolder[];
  };
}

const RESERVED_WORKSPACE_NAMES = new Set(['app', 'local', 'workspace']);

function parseDotEnvValue(raw: string): string {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function slugifyWorkspaceName(value: string): string {
  const normalized = value
    .trim()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized || 'project';
}

function sanitizeWorkspaceName(value: string): string {
  const normalized = slugifyWorkspaceName(value);
  return RESERVED_WORKSPACE_NAMES.has(normalized) ? '' : normalized;
}

function readWorkspaceIdFromEnvFile(envPath: string): string {
  if (!fs.existsSync(envPath)) return '';
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*WORKSPACE_ID\s*=\s*(.*)\s*$/);
    if (!match) continue;
    return sanitizeWorkspaceName(parseDotEnvValue(match[1] ?? ''));
  }
  return '';
}

function persistWorkspaceId(envPath: string, workspaceId: string): void {
  const nextLine = `WORKSPACE_ID=${workspaceId}`;
  if (!fs.existsSync(envPath)) {
    fs.writeFileSync(envPath, `${nextLine}\n`, 'utf8');
    return;
  }

  const raw = fs.readFileSync(envPath, 'utf8');
  if (/^\s*WORKSPACE_ID\s*=.*$/m.test(raw)) {
    const updated = raw.replace(/^\s*WORKSPACE_ID\s*=.*$/m, nextLine);
    if (updated !== raw) fs.writeFileSync(envPath, updated, 'utf8');
    return;
  }

  const separator = raw.endsWith('\n') || raw.length === 0 ? '' : '\n';
  fs.writeFileSync(envPath, `${raw}${separator}${nextLine}\n`, 'utf8');
}

function resolveWorkspaceFolderName(projectPath: string, cwd: string): string {
  const maybeVscode = (globalThis as typeof globalThis & { vscode?: VscodeLikeApi }).vscode;
  const vscodeWorkspaceName = sanitizeWorkspaceName(maybeVscode?.workspace?.workspaceFolders?.[0]?.name?.trim() ?? '');
  if (vscodeWorkspaceName) return vscodeWorkspaceName;

  const configuredWorkspaceName = sanitizeWorkspaceName(String(process.env.VSCODE_WORKSPACE_NAME ?? '').trim());
  if (configuredWorkspaceName) return configuredWorkspaceName;

  const projectBaseName = sanitizeWorkspaceName(path.basename(projectPath).trim());
  if (projectBaseName) return projectBaseName;

  const cwdBaseName = sanitizeWorkspaceName(path.basename(cwd).trim());
  if (cwdBaseName) return cwdBaseName;

  return 'project';
}

export function resolveWorkspaceIdentity(cwd = process.cwd()): WorkspaceIdentity {
  const envPath = path.join(cwd, '.env');
  const projectPath = String(process.env.PROJECT_ROOT ?? '').trim() || cwd;
  const derivedWorkspaceId = resolveWorkspaceFolderName(projectPath, cwd);
  const workspaceId = readWorkspaceIdFromEnvFile(envPath)
    || sanitizeWorkspaceName(String(process.env.WORKSPACE_ID ?? '').trim())
    || derivedWorkspaceId;

  process.env.WORKSPACE_ID = workspaceId;
  persistWorkspaceId(envPath, workspaceId);

  return {
    id: workspaceId,
    name: workspaceId,
    path: projectPath,
    envPath,
  };
}
