import * as vscode from 'vscode';
import type { IpcClient } from './ipcClient';
import { getTerminalId } from './terminalIdentity';

interface TerminalInfo {
  id: string;
  name: string;
  shellIntegration: boolean;
  cwd: string | null;
}

interface IdeSnapshot {
  workspaceFolders: string[];
  activeFile: string | null;
  activeLanguage: string | null;
  activeTerminal: string | null;
  activeTerminalId: string | null;
  terminals: TerminalInfo[];
  updatedAt: number;
}

export class IdeReporter {
  private disposables: vscode.Disposable[] = [];
  private terminalCwds = new Map<string, string>();

  constructor(private ipc: IpcClient) {}

  start(): vscode.Disposable {
    this.disposables.push(
      this.onIpc('connected', () => this.sendSnapshot()),
      vscode.window.onDidChangeActiveTextEditor(() => {
        this.sendEvent('editor_active_changed', {
          activeFile: vscode.window.activeTextEditor?.document.uri.fsPath ?? null,
          language: vscode.window.activeTextEditor?.document.languageId ?? null,
        });
        this.sendSnapshot();
      }),
      vscode.window.onDidOpenTerminal((terminal) => {
        this.sendEvent('terminal_opened', { name: terminal.name, target: `terminal:${terminal.name}` });
        this.sendSnapshot();
      }),
      vscode.window.onDidCloseTerminal((terminal) => {
        this.terminalCwds.delete(getTerminalId(terminal));
        this.sendEvent('terminal_closed', { name: terminal.name, target: `terminal:${terminal.name}` });
        this.sendSnapshot();
      }),
      vscode.window.onDidChangeActiveTerminal((terminal) => {
        this.sendEvent('terminal_active_changed', { name: terminal?.name ?? null, target: terminal ? `terminal:${terminal.name}` : null });
        this.sendSnapshot();
      }),
      vscode.window.onDidStartTerminalShellExecution((event) => {
        const commandLine = event.execution.commandLine.value;
        const terminalName = event.terminal.name;
        const cwd = event.execution.cwd?.fsPath ?? null;
        if (cwd) {
          this.terminalCwds.set(getTerminalId(event.terminal), cwd);
        }
        this.sendEvent('terminal_command_started', {
          terminal: terminalName,
          terminalId: getTerminalId(event.terminal),
          target: `terminal:${getTerminalId(event.terminal)}`,
          commandLine,
          cwd,
        });
        this.streamExecutionOutput(event.terminal, event.execution);
      }),
      vscode.window.onDidEndTerminalShellExecution((event) => {
        const cwd = event.execution.cwd?.fsPath ?? null;
        if (cwd) {
          this.terminalCwds.set(getTerminalId(event.terminal), cwd);
        }
        this.sendEvent('terminal_command_finished', {
          terminal: event.terminal.name,
          terminalId: getTerminalId(event.terminal),
          target: `terminal:${getTerminalId(event.terminal)}`,
          commandLine: event.execution.commandLine.value,
          cwd,
        });
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this.sendEvent('workspace_changed', {
          workspaceFolders: this.workspaceFolders(),
        });
        this.sendSnapshot();
      })
    );

    this.sendSnapshot();
    return { dispose: () => this.dispose() };
  }

  /** Send a fresh snapshot whenever this VS Code window becomes the controller. */
  refresh(): void {
    this.sendSnapshot();
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }

  private workspaceFolders(): string[] {
    return (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath);
  }

  private onIpc(event: string, listener: (...args: unknown[]) => void): vscode.Disposable {
    this.ipc.on(event, listener);
    return {
      dispose: () => {
        this.ipc.off(event, listener);
      },
    };
  }

  private snapshot(): IdeSnapshot {
    return {
      workspaceFolders: this.workspaceFolders(),
      activeFile: vscode.window.activeTextEditor?.document.uri.fsPath ?? null,
      activeLanguage: vscode.window.activeTextEditor?.document.languageId ?? null,
      activeTerminal: vscode.window.activeTerminal?.name ?? null,
      activeTerminalId: vscode.window.activeTerminal ? getTerminalId(vscode.window.activeTerminal) : null,
      terminals: vscode.window.terminals.map((terminal) => ({
        id: getTerminalId(terminal),
        name: terminal.name,
        shellIntegration: Boolean(terminal.shellIntegration),
        cwd: this.terminalCwds.get(getTerminalId(terminal)) ?? null,
      })),
      updatedAt: Date.now(),
    };
  }

  private sendSnapshot(): void {
    if (!this.ipc.isConnected()) return;
    this.ipc.send({
      type: 'ide_snapshot',
      ...this.snapshot(),
    });
  }

  private sendEvent(kind: string, payload: Record<string, unknown>): void {
    if (!this.ipc.isConnected()) return;
    this.ipc.send({
      type: 'ide_event',
      kind,
      ts: Date.now(),
      ...payload,
    });
  }

  private async streamExecutionOutput(
    terminal: vscode.Terminal,
    execution: vscode.TerminalShellExecution
  ): Promise<void> {
    try {
      for await (const chunk of execution.read()) {
        if (!chunk || !this.ipc.isConnected()) continue;
        this.ipc.send({
          type: 'terminal_output',
          tool: `terminal:${getTerminalId(terminal)}`,
          terminal: terminal.name,
          terminalId: getTerminalId(terminal),
          text: chunk,
        });
      }
    } catch {
      // Ignore transient shell integration stream failures.
    }
  }
}
