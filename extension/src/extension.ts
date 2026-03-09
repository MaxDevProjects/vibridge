/**
 * DevBridge VS Code Extension — Main activation
 */
import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { IpcClient } from './ipcClient';
import { ChatParticipant } from './chatParticipant';
import { FileWatcher } from './fileWatcher';
import { IdeReporter } from './ideReporter';
import { MirrorView } from './mirrorView';

const execAsync = promisify(exec);

const CLI_CHECK: Array<{ id: string; checkCmd: string }> = [
  { id: 'codex',       checkCmd: 'codex --version' },
  { id: 'claude-code', checkCmd: 'claude --version' },
  { id: 'aider',       checkCmd: 'aider --version' },
  { id: 'copilot',     checkCmd: 'gh copilot --version' },
];

async function detectInstalledClis(): Promise<string[]> {
  const results = await Promise.allSettled(
    CLI_CHECK.map(c => execAsync(c.checkCmd, { timeout: 5_000 }).then(() => c.id))
  );
  return results
    .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
    .map(r => r.value);
}

interface ProjectInfo {
  projects: Array<{ name: string; path: string; isActive: boolean }>;
  parentDir: string;
}

function getProjectsList(): ProjectInfo | null {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return null;
  const activeFolder = folders[0].uri.fsPath;
  const parentDir = path.dirname(activeFolder);
  try {
    const entries = fs.readdirSync(parentDir, { withFileTypes: true });
    const projects = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => ({
        name: e.name,
        path: path.join(parentDir, e.name),
        isActive: path.join(parentDir, e.name) === activeFolder,
      }));
    return { projects, parentDir };
  } catch {
    return null;
  }
}

let ipc: IpcClient | undefined;

function resolveWorkspaceCwd(): string | undefined {
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor) {
    const folder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
    if (folder) return folder.uri.fsPath;
  }
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

export function activate(context: vscode.ExtensionContext): void {
  console.log('[DevBridge] Extension activating');

  const config = vscode.workspace.getConfiguration('devbridge');
  const mode: string = config.get('connectionMode') ?? 'unix';

  let target: import('./ipcClient').IpcTarget;
  if (mode === 'tcp') {
    const host: string = config.get('agentHost') ?? '127.0.0.1';
    const port: number = config.get('agentPort') ?? 3334;
    target = { kind: 'tcp', host, port };
    console.log(`[DevBridge] TCP mode → ${host}:${port}`);
  } else {
    const path: string = config.get('agentSocketPath') ?? '/tmp/devbridge/ipc.sock';
    target = { kind: 'unix', path };
    console.log(`[DevBridge] Unix socket → ${path}`);
  }

  ipc = new IpcClient(target);
  ipc.connect();

  // Detect installed CLIs and report projects on each connection
  ipc.on('connected', () => {
    detectInstalledClis().then((detected) => {
      ipc!.send({ type: 'cli_report', detected });
    }).catch(() => {});
    const info = getProjectsList();
    if (info) ipc!.send({ type: 'projects_report', ...info });
  });

  // Re-send projects when workspace changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      const info = getProjectsList();
      if (info && ipc?.isConnected()) ipc!.send({ type: 'projects_report', ...info });
    })
  );

  // Handle open_project from agent: open folder in new VS Code window
  ipc.on('open_project', (msg: Record<string, unknown>) => {
    const projectPath = String(msg.projectPath ?? '');
    if (!projectPath) return;
    void vscode.commands.executeCommand(
      'vscode.openFolder',
      vscode.Uri.file(projectPath),
      true,
    );
  });

  // Handle start_cli from agent: open (or focus) the terminal and run the command
  ipc.on('start_cli', (msg: Record<string, unknown>) => {
    const terminalName = String(msg.terminalName ?? 'DevBridge CLI');
    const command = String(msg.command ?? '');
    const args = Array.isArray(msg.args) ? (msg.args as string[]) : [];
    const cliId = String(msg.cliId ?? '');
    if (!command) return;

    const cwd = resolveWorkspaceCwd();
    const fullCmd = args.length ? `${command} ${args.join(' ')}` : command;

    const existing = vscode.window.terminals.find(t => t.name === terminalName);
    if (existing) {
      existing.show(true);
      ipc!.send({ type: 'cli_started', cliId, terminalName });
    } else {
      const terminal = vscode.window.createTerminal({ name: terminalName, cwd });
      terminal.show(true);
      terminal.sendText(fullCmd, true);
      ipc!.send({ type: 'cli_started', cliId, terminalName });
    }
  });

  // Handle kill_cli from agent: close the named terminal
  ipc.on('kill_cli', (msg: Record<string, unknown>) => {
    const terminalName = String(msg.terminalName ?? '');
    const terminal = vscode.window.terminals.find(t => t.name === terminalName);
    if (terminal) terminal.dispose();
  });

  // Notify agent whenever a terminal is closed (manual or programmatic)
  context.subscriptions.push(
    vscode.window.onDidCloseTerminal((terminal) => {
      ipc?.send({ type: 'terminal_closed', terminalName: terminal.name });
    })
  );

  // Chat participant — @devbridge
  const participant = new ChatParticipant(ipc);
  context.subscriptions.push(participant.register());

  // File watcher
  const watcher = new FileWatcher(ipc);
  context.subscriptions.push(watcher.start());

  // IDE state + terminal activity reporter
  const ideReporter = new IdeReporter(ipc);
  context.subscriptions.push(ideReporter.start());

  // Read-only mirror of adapter output + workspace context inside VS Code
  const mirror = new MirrorView(ipc);
  context.subscriptions.push(mirror.start());

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('devbridge.showPairingCode', async () => {
      const result = await ipc!.requestPairingCode();
      if (!result) {
        void vscode.window.showWarningMessage('DevBridge: agent not connected or no pairing code available.');
        return;
      }
      const { code, qrUrl: relayQrUrl } = result;

      // Use relay QR URL if available, otherwise build local URL
      let pwaUrl: string;
      if (relayQrUrl) {
        pwaUrl = relayQrUrl;
      } else {
        const config = vscode.workspace.getConfiguration('devbridge');
        const host: string = config.get('agentHost') ?? 'devbridge.local';
        const port: number = config.get('agentPort') ?? 3333;
        pwaUrl = `http://${host}:${port}?token=${encodeURIComponent(code)}`;
      }

      // Show in a WebView panel with a QR code (via qrserver.com CDN)
      const panel = vscode.window.createWebviewPanel(
        'devbridgeQR',
        'DevBridge — QR Pairing',
        vscode.ViewColumn.One,
        { enableScripts: false }
      );
      const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(pwaUrl)}`;
      panel.webview.html = `<!DOCTYPE html><html><body style="background:#0a0a0a;color:#e5e5e5;font-family:monospace;display:flex;flex-direction:column;align-items:center;padding:40px;gap:24px">
        <h2 style="margin:0">VibeBridge — Scan to connect</h2>
        <img src="${qrSrc}" width="260" height="260" style="border-radius:8px" />
        <p style="font-size:12px;opacity:.6;word-break:break-all;max-width:400px;text-align:center">${pwaUrl}</p>
        <p style="font-size:11px;opacity:.4">Or enter the IP manually in the VibeBridge app</p>
      </body></html>`;
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('devbridge.toggleBridge', () => {
      if (ipc?.isConnected()) {
        ipc.disconnect();
        void vscode.window.showInformationMessage('DevBridge disconnected');
      } else {
        ipc!.connect();
        void vscode.window.showInformationMessage('DevBridge connecting…');
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('devbridge.openDevBridgeChat', () => {
      participant.showInbox();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('devbridge.openMirror', () => {
      mirror.show();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('devbridge.startCliTerminal', () => {
      void vscode.window.showQuickPick(
        CLI_CHECK.map(c => c.id),
        { placeHolder: 'Choisir un CLI à lancer' }
      ).then((picked) => {
        if (picked) ipc?.send({ type: 'get_cli_and_start', cliId: picked });
      });
    })
  );

  // Keep legacy command for backwards compatibility
  context.subscriptions.push(
    vscode.commands.registerCommand('devbridge.startCodexTerminal', () => {
      const cwd = resolveWorkspaceCwd();
      const terminalName = 'DevBridge Codex CLI';
      const existing = vscode.window.terminals.find((t) => t.name === terminalName);
      const terminal = existing ?? vscode.window.createTerminal({ name: terminalName, cwd });
      terminal.show(true);
      if (!existing) terminal.sendText('codex', true);
    })
  );

  context.subscriptions.push({
    dispose: () => {
      ipc?.disconnect();
      watcher.dispose();
      ideReporter.dispose();
      mirror.dispose();
    },
  });

  console.log('[DevBridge] Extension activated ✓');
}

export function deactivate(): void {
  ipc?.disconnect();
}
