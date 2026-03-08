/**
 * DevBridge VS Code Extension — File Watcher
 * Reports file changes to the Agent so the PWA codebase view stays fresh.
 */
import * as vscode from 'vscode';
import type { IpcClient } from './ipcClient';

export class FileWatcher {
  private watcher: vscode.FileSystemWatcher | null = null;

  constructor(private ipc: IpcClient) {}

  start(): vscode.Disposable {
    // Watch all files, respecting .gitignore via VS Code's built-in ignore
    this.watcher = vscode.workspace.createFileSystemWatcher('**/*', false, false, false);

    const notify = (event: string) => (uri: vscode.Uri) => {
      // Skip node_modules, .git, build dirs
      if (/node_modules|\.git|\/dist\/|\/build\//.test(uri.fsPath)) return;
      this.ipc.send({ type: 'file_changed', path: uri.fsPath, event });
    };

    this.watcher.onDidCreate(notify('created'));
    this.watcher.onDidChange(notify('changed'));
    this.watcher.onDidDelete(notify('deleted'));

    return { dispose: () => this.dispose() };
  }

  dispose(): void {
    this.watcher?.dispose();
    this.watcher = null;
  }
}
