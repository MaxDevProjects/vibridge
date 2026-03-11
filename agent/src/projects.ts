import fs from 'fs';
import path from 'path';

export interface ProjectEntry {
  name: string;
  path: string;
  isActive: boolean;
}

export interface ProjectListing {
  parentDir: string;
  projects: ProjectEntry[];
}

function isProjectDir(projectPath: string): boolean {
  return fs.existsSync(path.join(projectPath, 'package.json'))
    || fs.existsSync(path.join(projectPath, '.git'));
}

export function listProjects(workspacePath: string): ProjectListing {
  const activeWorkspacePath = path.resolve(workspacePath);
  const parentDir = path.dirname(activeWorkspacePath);

  try {
    const projects = fs.readdirSync(parentDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => ({
        name: entry.name,
        path: path.join(parentDir, entry.name),
      }))
      .filter((entry) => isProjectDir(entry.path))
      .map((entry) => ({
        ...entry,
        isActive: path.resolve(entry.path) === activeWorkspacePath,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { parentDir, projects };
  } catch {
    return { parentDir, projects: [] };
  }
}
