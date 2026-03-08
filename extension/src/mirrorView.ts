import * as vscode from 'vscode';
import type { IpcClient } from './ipcClient';

function stripAnsi(value: string): string {
  return value
    .replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g, '')
    .replace(/\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
    .replace(/[\u0000-\u0008\u000B-\u001A\u001C-\u001F\u007F]/g, '');
}

function shortPath(value: string): string {
  return value.split(/[\\/]/).filter(Boolean).slice(-2).join('/') || value;
}

export class MirrorView {
  private channel = vscode.window.createOutputChannel('DevBridge Mirror');
  private disposables: vscode.Disposable[] = [];
  private currentWorkspace = '—';
  private currentWorkspaceFull = '—';
  private currentFile = '—';
  private currentFileFull = '—';
  private currentAdapter = '—';
  private currentAgentCwd = '/workspace';

  constructor(private ipc: IpcClient) {}

  start(): vscode.Disposable {
    this.disposables.push(
      this.onIpc('connected', () => {
        this.writeSystem('Bridge connected');
        this.renderContext();
      }),
      this.onIpc('disconnected', () => {
        this.writeSystem('Bridge disconnected');
      }),
      this.onIpc('ide_snapshot', (msg: Record<string, unknown>) => {
        const workspaceFolders = Array.isArray(msg.workspaceFolders) ? msg.workspaceFolders.map(String) : [];
        const activeFile = typeof msg.activeFile === 'string' ? msg.activeFile : '';
        this.currentWorkspaceFull = workspaceFolders[0] || '—';
        this.currentWorkspace = workspaceFolders[0] ? shortPath(workspaceFolders[0]) : '—';
        this.currentFileFull = activeFile || '—';
        this.currentFile = activeFile ? shortPath(activeFile) : '—';
        this.renderContext();
      }),
      this.onIpc('output', (msg: Record<string, unknown>) => {
        const payload = (msg.payload as Record<string, unknown> | undefined) ?? msg;
        const text = stripAnsi(String(payload.text ?? '')).trimEnd();
        const tool = String(payload.tool ?? 'agent');
        if (!text) return;
        this.channel.appendLine(`[${tool}] ${text}`);
      }),
      this.onIpc('event', (msg: Record<string, unknown>) => {
        const event = String(msg.event ?? '');
        if (!event) return;
        if (event.startsWith('active_adapter:')) {
          this.currentAdapter = event.slice('active_adapter:'.length) || '—';
          this.renderContext();
        }
        this.writeSystem(event);
      }),
      this.onIpc('pairing_code', (msg: Record<string, unknown>) => {
        const code = String(msg.code ?? '');
        if (code) this.writeSystem(`Pairing code ${code}`);
      }),
    );

    this.writeSystem('Mirror ready');
    return { dispose: () => this.dispose() };
  }

  show(): void {
    this.channel.show(true);
  }

  dispose(): void {
    for (const disposable of this.disposables) disposable.dispose();
    this.disposables = [];
    this.channel.dispose();
  }

  private renderContext(): void {
    this.channel.appendLine(`[context] workspace=${this.currentWorkspace} file=${this.currentFile} adapter=${this.currentAdapter}`);
    this.channel.appendLine(`[paths] host_workspace=${this.currentWorkspaceFull} host_file=${this.currentFileFull} agent_cwd=${this.currentAgentCwd}`);
  }

  private writeSystem(text: string): void {
    this.channel.appendLine(`[system] ${text}`);
  }

  private onIpc(event: string, listener: (msg: Record<string, unknown>) => void): vscode.Disposable {
    const wrapped = (msg: unknown) => {
      if (msg && typeof msg === 'object') {
        listener(msg as Record<string, unknown>);
      }
    };
    this.ipc.on(event, wrapped);
    return {
      dispose: () => {
        this.ipc.off(event, wrapped);
      },
    };
  }
}
