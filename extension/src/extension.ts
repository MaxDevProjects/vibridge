/**
 * DevBridge VS Code Extension — Main activation
 */
import * as vscode from 'vscode';
import { IpcClient } from './ipcClient';
import { ChatParticipant } from './chatParticipant';
import { FileWatcher } from './fileWatcher';
import { IdeReporter } from './ideReporter';
import { MirrorView } from './mirrorView';

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
      const code = await ipc!.requestPairingCode();
      if (code) {
        void vscode.window.showInformationMessage(
          `DevBridge Pairing Code: ${code}`,
          'Copy'
        ).then((action) => {
          if (action === 'Copy') {
            void vscode.env.clipboard.writeText(code);
          }
        });
      }
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
    vscode.commands.registerCommand('devbridge.startCodexTerminal', () => {
      const cwd = resolveWorkspaceCwd();
      const terminalName = 'DevBridge Codex';
      const existing = vscode.window.terminals.find((terminal) => terminal.name === terminalName);
      const terminal = existing ?? vscode.window.createTerminal({
        name: terminalName,
        cwd,
      });
      terminal.show(true);
      terminal.sendText('codex --no-alt-screen', true);
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
