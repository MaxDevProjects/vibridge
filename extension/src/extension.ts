import { getTerminalId, findTerminal } from './terminalIdentity';
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
const PENDING_SETUP_TOKEN_KEY = 'devbridge.pendingSetupToken';

function resolveWorkspaceCwd(): string | undefined {
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor) {
    const folder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
    if (folder) return folder.uri.fsPath;
  }
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function resolveWorkspaceName(): string {
  return vscode.workspace.workspaceFolders?.[0]?.name?.trim()
    || path.basename(resolveWorkspaceCwd() ?? '')
    || 'workspace';
}

export function activate(context: vscode.ExtensionContext): void {
  console.log('[DevBridge] Extension activating');

  const config = vscode.workspace.getConfiguration('devbridge');
  const mode: string = config.get('connectionMode') ?? 'unix';

  let target: import('./ipcClient').IpcTarget;
  if (mode === 'tcp') {
    const host: string = config.get('agentHost') ?? '127.0.0.1';
    const port: number = config.get('agentPort') ?? 3334;
    const token = process.env.IPC_SHARED_SECRET ?? '';
    if (token.length < 32) {
      void vscode.window.showErrorMessage('DevBridge TCP requires IPC_SHARED_SECRET in the VS Code extension host environment.');
      return;
    }
    target = { kind: 'tcp', host, port, token };
    console.log(`[DevBridge] TCP mode → ${host}:${port}`);
  } else {
    const path: string = config.get('agentSocketPath') ?? '/tmp/devbridge/ipc.sock';
    target = { kind: 'unix', path };
    console.log(`[DevBridge] Unix socket → ${path}`);
  }

  ipc = new IpcClient(target);
  ipc.connect();
  const reportCommand = (msg: Record<string, unknown>, action: string,
    phase: 'dispatched' | 'rejected', reason?: string, terminal?: vscode.Terminal) => {
    if (typeof msg.request_id !== 'string') return;
    ipc?.send({ type: 'command_execution', request_id: msg.request_id, action, phase,
      reason, terminalName: terminal?.name, terminalId: terminal ? getTerminalId(terminal) : undefined });
  };

  let pendingSetupInFlight: string | undefined;
  const flushPendingSetupToken = () => {
    const setupToken = context.globalState.get<string>(PENDING_SETUP_TOKEN_KEY);
    if (!setupToken || !ipc?.isConnected() || pendingSetupInFlight) return;
    pendingSetupInFlight = setupToken;
    ipc.send({ type: 'relay_setup_link', setupToken });
  };
  ipc.on('disconnected', () => { pendingSetupInFlight = undefined; });
  ipc.on('relay_setup_ack', (message: { ok?: boolean }) => {
    const completed = pendingSetupInFlight;
    pendingSetupInFlight = undefined;
    if (!completed) return;
    if (context.globalState.get(PENDING_SETUP_TOKEN_KEY) === completed) {
      void context.globalState.update(PENDING_SETUP_TOKEN_KEY, undefined);
    } else {
      flushPendingSetupToken();
    }
    if (message.ok) void vscode.window.showInformationMessage('ViBridge a associé cet espace de travail à la session.');
    else void vscode.window.showWarningMessage('ViBridge n’a pas pu associer cet espace de travail. Relance la configuration depuis le navigateur.');
  });

  const reportHostTools = async () => {
    // User scope only. A cloned repository's .vscode/settings.json is not trusted
    // to declare programs that the mobile device may launch.
    const raw = vscode.workspace.getConfiguration('devbridge').inspect<unknown[]>('hostTools')?.globalValue;
    const allowed = Array.isArray(raw) ? raw.slice(0, 20) : [];
    const definitions = await Promise.all(allowed.map(async value => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
      const tool = value as { id?: unknown; name?: unknown; command?: unknown; args?: unknown };
      if (typeof tool.id !== 'string' || !/^[a-z][a-z0-9-]{1,63}$/.test(tool.id)
        || typeof tool.name !== 'string' || typeof tool.command !== 'string'
        || !/^[a-zA-Z0-9_.:\/\\-]{1,200}$/.test(tool.command)
        || (tool.args !== undefined && (!Array.isArray(tool.args) || !tool.args.every(arg => typeof arg === 'string')))) return null;
      let detected = false;
      try {
        const check = process.platform === 'win32' ? `where ${tool.command}` : `command -v ${tool.command}`;
        await execAsync(check, { timeout: 3000 });
        detected = true;
      } catch { /* Host tool may not yet be installed. */ }
      return { id: tool.id, name: tool.name, command: tool.command, args: tool.args ?? [], detected };
    }));
    if (ipc?.isConnected()) ipc.send({ type: 'host_clis', definitions: definitions.filter(Boolean) });
  };
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
    if (event.affectsConfiguration('devbridge.hostTools')) void reportHostTools();
  }));

  // Detect installed CLIs and report projects on each connection
  ipc.on('connected', () => {
    void reportHostTools();
    detectInstalledClis().then((detected) => {
      ipc!.send({ type: 'cli_report', detected });
    }).catch((err: unknown) => {
      console.error('[DevBridge] Failed to detect CLIs:', err);
    });
    const info = getProjectsList();
    if (info) ipc!.send({ type: 'projects_report', ...info });
    flushPendingSetupToken();
  });

  // Re-send projects when workspace changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      const info = getProjectsList();
      if (info && ipc?.isConnected()) ipc!.send({ type: 'projects_report', ...info });
    })
  );

  // Handle open_project from agent: open folder picker, replace current window,
  // or force a parallel VS Code window depending on the payload.
  ipc.on('open_project', (msg: Record<string, unknown>) => {
    const projectPath = String(msg.projectPath ?? '');
    const newWindow = msg.newWindow === true;
    if (!projectPath) {
      void vscode.commands.executeCommand('vscode.openFolder');
      return;
    }
    void vscode.commands.executeCommand(
      'vscode.openFolder',
      vscode.Uri.file(projectPath),
      { forceNewWindow: newWindow },
    ).then(
      () => reportCommand(msg, 'open_project', 'dispatched'),
      () => reportCommand(msg, 'open_project', 'rejected', 'open_project_failed'),
    );
  });

  // Handle start_cli from agent: open (or focus) the terminal and run the command
  ipc.on('start_cli', (msg: Record<string, unknown>) => {
    const terminalName = String(msg.terminalName ?? 'DevBridge CLI');
    const command = String(msg.command ?? '');
    const args = Array.isArray(msg.args) ? (msg.args as string[]) : [];
    const cliId = String(msg.cliId ?? '');
    if (!command) { reportCommand(msg, 'start_cli', 'rejected', 'missing_command'); return; }

    const cwd = resolveWorkspaceCwd();
    const fullCmd = args.length ? `${command} ${args.join(' ')}` : command;

    const matches = vscode.window.terminals.filter(t => t.name === terminalName);
    if (matches.length > 1) { reportCommand(msg, 'start_cli', 'rejected', 'ambiguous_terminal'); return; }
    const existing = matches[0];
    if (existing) {
      existing.show(true);
      ipc!.send({ type: 'cli_started', cliId, terminalName, terminalId: getTerminalId(existing) });
      reportCommand(msg, 'start_cli', 'dispatched', undefined, existing);
    } else {
      const terminal = vscode.window.createTerminal({ name: terminalName, cwd });
      terminal.show(true);
      terminal.sendText(fullCmd, true);
      ipc!.send({ type: 'cli_started', cliId, terminalName, terminalId: getTerminalId(terminal) });
      reportCommand(msg, 'start_cli', 'dispatched', undefined, terminal);
    }
  });

  // Handle create_terminal from agent: open (or focus) a plain terminal without running a command
  ipc.on('create_terminal', (msg: Record<string, unknown>) => {
    const terminalName = String(msg.terminalName ?? 'DevBridge 1');
    const cwd = resolveWorkspaceCwd();
    const matches = vscode.window.terminals.filter(t => t.name === terminalName);
    if (matches.length > 1) { reportCommand(msg, 'create_terminal', 'rejected', 'ambiguous_terminal'); return; }
    const terminal = matches[0] ?? vscode.window.createTerminal({ name: terminalName, cwd });
    terminal.show(true);
    ipc!.send({ type: 'terminal_created', terminalName, terminalId: getTerminalId(terminal) });
    reportCommand(msg, 'create_terminal', 'dispatched', undefined, terminal);
  });

  // Handle focus_terminal from agent: focus an existing terminal by name
  ipc.on('focus_terminal', (msg: Record<string, unknown>) => {
    const terminalName = String(msg.terminalName ?? '');
    const found = findTerminal(String(msg.terminalId ?? terminalName));
    if (found.terminal && !found.ambiguous) {
      found.terminal.show(true);
      reportCommand(msg, 'focus_terminal', 'dispatched', undefined, found.terminal);
    } else reportCommand(msg, 'focus_terminal', 'rejected', found.ambiguous ? 'ambiguous_terminal' : 'terminal_unavailable');
  });

  // Handle kill_cli from agent: close the named terminal
  ipc.on('kill_cli', (msg: Record<string, unknown>) => {
    const terminalName = String(msg.terminalName ?? '');
    const found = findTerminal(String(msg.terminalId ?? terminalName));
    if (found.terminal && !found.ambiguous) {
      reportCommand(msg, 'kill_cli', 'dispatched', undefined, found.terminal);
      found.terminal.dispose();
    } else reportCommand(msg, 'kill_cli', 'rejected', found.ambiguous ? 'ambiguous_terminal' : 'terminal_unavailable');
  });

  // Notify agent whenever a terminal is closed (manual or programmatic)
  context.subscriptions.push(
    vscode.window.onDidCloseTerminal((terminal) => {
      ipc?.send({ type: 'terminal_closed', terminalName: terminal.name, terminalId: getTerminalId(terminal) });
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
    vscode.window.registerUriHandler({
      handleUri: async (uri: vscode.Uri) => {
        const params = new URLSearchParams(uri.query);
        const setupToken = params.get('setupToken')?.trim() ?? '';
        if (!setupToken) {
          void vscode.window.showWarningMessage('DevBridge: setup token missing in onboarding link.');
          return;
        }
        const confirm = 'Associer ViBridge';
        const response = await vscode.window.showWarningMessage(
          'Associer cet espace de travail à la session ouverte dans le navigateur ? Une fois associé, le téléphone appairé pourra piloter VS Code.',
          { modal: true },
          confirm,
        );
        if (response !== confirm) return;
        await context.globalState.update(PENDING_SETUP_TOKEN_KEY, setupToken);
        flushPendingSetupToken();
        if (!ipc?.isConnected()) {
          void vscode.window.showInformationMessage('DevBridge onboarding link saved. It will be applied when the agent reconnects.');
        }
      },
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('devbridge.showPairingCode', async () => {
      const result = await ipc!.requestPairingCode();
      if (!result) {
        void vscode.window.showWarningMessage('DevBridge: agent not connected or no pairing code available.');
        return;
      }
      const { code, qrUrl: relayQrUrl, localQrUrl } = result;
      const config = vscode.workspace.getConfiguration('devbridge');
      const publicPwaUrl: string = (config.get<string>('pwaUrl') ?? '').trim().replace(/\/$/, '');
      const workspaceName = resolveWorkspaceName();

      // Priority: relay session QR in public mode → local WiFi QR → legacy fallback
      let pwaUrl: string;
      if (publicPwaUrl && relayQrUrl) {
        pwaUrl = relayQrUrl;
      } else if (localQrUrl) {
        pwaUrl = localQrUrl;
      } else if (relayQrUrl) {
        pwaUrl = relayQrUrl;
      } else if (publicPwaUrl) {
        pwaUrl = `${publicPwaUrl}/?token=${encodeURIComponent(code)}&workspace=${encodeURIComponent(workspaceName)}`;
      } else {
        // Legacy fallback — agent too old to send localQrUrl
        pwaUrl = `http://devbridge.local:8080/?token=${encodeURIComponent(code)}&workspace=${encodeURIComponent(workspaceName)}`;
      }

      // Keep pairing secrets on the user's own devices. Never send the URL to a QR CDN.
      const panel = vscode.window.createWebviewPanel(
        'devbridgeQR', 'DevBridge - Secure Pairing', vscode.ViewColumn.One, { enableScripts: false }
      );
      const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      panel.webview.html = `<!DOCTYPE html><html><body style="background:#0a0a0a;color:#e5e5e5;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;padding:40px;gap:22px">
        <h2 style="margin:0">VibeBridge - Secure pairing</h2>
        <p>Le QR externe est désactivé pour protéger les secrets d'appairage. Ouvre ce lien sur ton téléphone.</p>
        <code style="overflow-wrap:anywhere;max-width:500px;user-select:all">${escapeHtml(pwaUrl)}</code>
        <p>Code : <strong>${escapeHtml(code)}</strong></p>
      </body></html>`;
      await vscode.env.clipboard.writeText(pwaUrl);
      void vscode.window.showInformationMessage('Lien d’appairage copié. Colle-le sur ton téléphone pour te connecter.');
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
