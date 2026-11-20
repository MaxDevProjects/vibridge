import { getTerminalId, findTerminal } from './terminalIdentity';
import { captureLocalPreview } from './localPreview';
/**
 * DevBridge VS Code Extension — Main activation
 */
import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { IpcClient } from './ipcClient';
import { ChatParticipant } from './chatParticipant';
import { FileWatcher } from './fileWatcher';
import { IdeReporter } from './ideReporter';
import { TerminalScreenMirror } from './terminalScreenMirror';
import { findCliSessions, isValidCliSessionId } from './cliSessionIndex';
import { runLocalInterpreter } from './localInterpreter';
import { boundedResources } from './aiResourceGovernor';
import { diagnoseLocalAi } from './localAiDiagnostics';
import { MirrorView } from './mirrorView';
import { buildPairingDisplayUrl } from './pairingDisplay';

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
// Stable during IPC reconnects; distinct when two windows open the same project.
const windowId = randomUUID();

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

  ipc = new IpcClient(target, windowId);
  ipc.connect();
  // Local-only preflight: verifies the configured binary, GGUF, budget and
  // WSL dependencies without starting inference or exposing a terminal log.
  const aiDiagnosticsChannel = vscode.window.createOutputChannel('ViBridge: IA locale');
  context.subscriptions.push(aiDiagnosticsChannel);
  context.subscriptions.push(vscode.commands.registerCommand('devbridge.diagnoseLocalAi', async () => {
    const settings = vscode.workspace.getConfiguration('devbridge');
    const inspected = <T>(name:string, fallback:T):T =>
      settings.inspect<T>(name)?.globalValue ?? fallback;
    const limits = boundedResources({
      memoryMb: inspected('interpreterMemoryMb', 1024),
      threads: inspected('interpreterThreads', 2),
      reserveMb: inspected('interpreterReserveMb', 512),
    });
    aiDiagnosticsChannel.clear();
    try {
      const lines = await diagnoseLocalAi({
        enabled: inspected('interpreterEnabled', false),
        binary: inspected('interpreterBinary', 'llama-cli'),
        modelPath: inspected('interpreterModelPath', ''),
        memoryMb: limits.memoryMb,
        reserveMb: limits.reserveMb,
        threads: limits.threads,
      });
      for (const line of lines) aiDiagnosticsChannel.appendLine(line);
    } catch {
      aiDiagnosticsChannel.appendLine('Diagnostic indisponible : impossible de lire les paramètres du poste.');
    }
    aiDiagnosticsChannel.show(true);
  }));
  const terminalMirror = new TerminalScreenMirror(ipc, context);
  context.subscriptions.push(terminalMirror);
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

  // A session browser reads only local CLI metadata for THIS workspace.
  // No file-system paths or transcript contents are sent to the phone.
  ipc.on('cli_sessions_request', (msg: Record<string, unknown>) => {
    if(msg.windowId!==windowId)return;
    const requestId=typeof msg.request_id==='string'?msg.request_id:'';
    if(!requestId)return;
    const cwd=resolveWorkspaceCwd();
    void (cwd ? findCliSessions(cwd) : Promise.resolve([])).then(
      sessions=>ipc?.send({type:'cli_sessions_result',request_id:requestId,sessions}),
      ()=>ipc?.send({type:'cli_sessions_result',request_id:requestId,sessions:[],error:'local_session_scan_failed'}),
    );
  });

  // Resumption is a HOST-validated operation, not arbitrary remote shell text.
  // The allowed session ID must appear in the host-side project index.
  // Always start a new tracked terminal so we never send shell syntax into
  // an already running interactive Codex/Claude conversation.
  ipc.on('cli_resume', (msg: Record<string, unknown>) => {
    if(msg.windowId!==windowId)return;
    const sessionId=msg.sessionId;
    const cliId=msg.cliId;
    if(!isValidCliSessionId(sessionId) || (cliId!=='codex' && cliId!=='claude-code')){
      reportCommand(msg,'cli_resume','rejected','invalid_session');
      return;
    }
    const cwd=resolveWorkspaceCwd();
    if(!cwd){reportCommand(msg,'cli_resume','rejected','workspace_missing');return;}
    void findCliSessions(cwd).then(async sessions=>{
      const owned=sessions.some(item=>item.id===sessionId&&item.cliId===cliId);
      if(!owned){reportCommand(msg,'cli_resume','rejected','session_not_owned_by_workspace');return;}
      const command=cliId==='codex' ? 'codex resume '+sessionId : 'claude --resume '+sessionId;
      const terminal=await terminalMirror.create(cliId==='codex'?'Codex · Reprise':'Claude · Reprise',cwd);
      terminal.sendText(command,true);
      ipc?.send({type:'terminal_created',terminalName:terminal.name,terminalId:getTerminalId(terminal),
        mirrorSession:terminalMirror.sessionFor(terminal)});
      reportCommand(msg,'cli_resume','dispatched',undefined,terminal);
      ideReporter.refresh();
    }).catch(()=>reportCommand(msg,'cli_resume','rejected','session_resume_failed'));
  });

  // Explicit, opt-in CPU model pass over an already observed terminal excerpt.
  // The input and generated data are ephemeral and never stored on the host.
  // Read ONLY machine user settings; workspace files cannot enable a model.
  let interpreterBusy=false;
  ipc.on('terminal_interpret',(msg:Record<string,unknown>)=>{
    if(msg.windowId!==windowId)return;
    const requestId=typeof msg.request_id==='string'?msg.request_id:'';
    const terminalId=typeof msg.terminalId==='string'?msg.terminalId:'';
    const excerpt=typeof msg.excerpt==='string'?msg.excerpt:'';
    if(!requestId||!terminalId)return;
    const respond=(result:Record<string,unknown>)=>ipc?.send({
      type:'terminal_interpret_result',request_id:requestId,terminalId,...result,
    });
    const found=findTerminal(terminalId);
    if(found.ambiguous||!found.terminal||excerpt.length<40||excerpt.length>6000){
      respond({ok:false,error:'terminal_or_excerpt_invalid'});return;
    }
    const settings=vscode.workspace.getConfiguration('devbridge');
    const enabled=settings.inspect<boolean>('interpreterEnabled')?.globalValue===true;
    const binary=settings.inspect<string>('interpreterBinary')?.globalValue||'llama-cli';
    const modelPath=settings.inspect<string>('interpreterModelPath')?.globalValue||'';
    if(!enabled){respond({ok:false,error:'interpreter_not_enabled'});return;}
    if(interpreterBusy){respond({ok:false,error:'interpreter_busy'});return;}
    const requested = msg.resourceLimits && typeof msg.resourceLimits==='object'
      ? msg.resourceLimits as Record<string,unknown> : {};
    // The agent sets an upper budget. Machine-scoped user preferences can
    // only tighten those limits, never relax agent admission controls.
    const agentLimits=boundedResources({
      memoryMb:Number(requested.memoryMb),
      threads:Number(requested.threads),
      reserveMb:Number(requested.reserveMb),
      timeoutMs:Number(requested.timeoutMs),
    });
    const userMemory=settings.inspect<number>('interpreterMemoryMb')?.globalValue;
    const userThreads=settings.inspect<number>('interpreterThreads')?.globalValue;
    const userReserve=settings.inspect<number>('interpreterReserveMb')?.globalValue;
    const limits=boundedResources({
      memoryMb:Math.min(agentLimits.memoryMb,userMemory??1024),
      threads:Math.min(agentLimits.threads,userThreads??2),
      reserveMb:Math.max(agentLimits.reserveMb,userReserve??512),
      timeoutMs:Math.min(agentLimits.timeoutMs,45000),
    });
    interpreterBusy=true;
    void runLocalInterpreter(excerpt,{enabled,binary,modelPath},limits)
      .then(result=>respond({ok:true,readout:result}))
      .catch(error=>respond({ok:false,error:error instanceof Error?error.message.slice(0,90):'interpretation_failed'}))
      .finally(()=>{interpreterBusy=false});
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
    const terminalName = String(msg.terminalName ?? 'DevBridge 1').slice(0, 80);
    const cwd = resolveWorkspaceCwd();
    const publish = (terminal: vscode.Terminal) => {
      ipc!.send({ type: 'terminal_created', terminalName, terminalId: getTerminalId(terminal),
        mirrorSession: terminalMirror.sessionFor(terminal) });
      reportCommand(msg, 'create_terminal', 'dispatched', undefined, terminal);
      ideReporter.refresh();
    };
    if (msg.mirror === true) {
      void terminalMirror.create(terminalName, cwd).then(publish, error =>
        reportCommand(msg, 'create_terminal', 'rejected',
          error instanceof Error ? error.message : 'mirror_failed'));
      return;
    }
    const matches = vscode.window.terminals.filter(t => t.name === terminalName);
    if (matches.length > 1) { reportCommand(msg, 'create_terminal', 'rejected', 'ambiguous_terminal'); return; }
    const terminal = matches[0] ?? vscode.window.createTerminal({ name: terminalName, cwd });
    terminal.show(true);
    publish(terminal);
  });

  ipc.on('reopen_terminal', (msg: Record<string, unknown>) => {
    if (typeof msg.session !== 'string') {
      reportCommand(msg, 'reopen_terminal', 'rejected', 'missing_session');
      return;
    }
    void terminalMirror.reopen(msg.session).then(terminal => {
      ipc!.send({ type: 'terminal_created', terminalName: terminal.name,
        terminalId: getTerminalId(terminal), mirrorSession: terminalMirror.sessionFor(terminal) });
      reportCommand(msg, 'reopen_terminal', 'dispatched', undefined, terminal);
      ideReporter.refresh();
    }, error => reportCommand(msg, 'reopen_terminal', 'rejected',
      error instanceof Error ? error.message : 'mirror_reopen_failed'));
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

  // A capture request only accepts the exact owner window and a user-approved
  // localhost port. Playwright runs locally, never on the public relay.
  let previewBusy = false;
  ipc.on('preview_capture', (msg: Record<string, unknown>) => {
    const requestId = typeof msg.request_id === 'string' ? msg.request_id : '';
    if (!requestId) return;
    const respond = (success: boolean, image?: string, error?: string) =>
      ipc?.send({ type: 'preview_capture_result', request_id: requestId, success,
        mime: 'image/png', image, error });
    if (msg.windowId !== windowId) { respond(false, undefined, 'window_mismatch'); return; }
    if (previewBusy) { respond(false, undefined, 'preview_busy'); return; }
    const port = Number(msg.port);
    const device = msg.device === 'desktop' ? 'desktop' : 'mobile';
    previewBusy = true;
    void captureLocalPreview(port, device).then(
      image => respond(true, image),
      error => respond(false, undefined, error instanceof Error ? error.message : 'preview_failed'),
    ).finally(() => { previewBusy = false; });
  });

  // Closing a VS Code window is distinct from killing a terminal.
  // Host policy must opt in; desktop may still prompt for unsaved files.
  ipc.on('close_window', (msg: Record<string, unknown>) => {
    if (typeof msg.windowId !== 'string' || msg.windowId !== windowId) {
      reportCommand(msg, 'close_window', 'rejected', 'window_mismatch');
      return;
    }
    reportCommand(msg, 'close_window', 'dispatched');
    void vscode.commands.executeCommand('workbench.action.closeWindow').then(
      () => { /* Closing may still require desktop confirmation. */ },
      () => reportCommand(msg, 'close_window', 'rejected', 'window_close_failed'),
    );
  });

  // Notify agent whenever a terminal is closed (manual or programmatic)
  context.subscriptions.push(
    vscode.window.onDidCloseTerminal((terminal) => {
      ipc?.send({ type: 'terminal_closed', terminalName: terminal.name, terminalId: getTerminalId(terminal) });
    })
  );

  // Chat participant — @devbridge
  const participant = new ChatParticipant(ipc, terminalMirror);
  context.subscriptions.push(participant.register());

  // File watcher
  const watcher = new FileWatcher(ipc);
  context.subscriptions.push(watcher.start());

  // IDE state + terminal activity reporter
  const ideReporter = new IdeReporter(ipc, terminal => terminalMirror.sessionFor(terminal));
  context.subscriptions.push(ideReporter.start());

  // Several VS Code windows may share one local agent. The last connected
  // extension is not necessarily the window the developer is currently using.
  // Re-register on desktop focus and immediately publish that window's project
  // and terminal snapshot. No remote command is run as a result.
  context.subscriptions.push(vscode.window.onDidChangeWindowState((state) => {
    if (!state.focused || !ipc?.isConnected()) return;
    ipc.send({ type: 'register', tool: 'vscode', label: 'VS Code Extension', windowId });
    ipc.send({ type: 'projects_report', ...(getProjectsList() ?? { projects: [], parentDir: '' }) });
    ideReporter.refresh();
  }));

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
      // The agent refreshes the relay invitation when asked. Prefer it
      // whenever available: the local invitation only works on the LAN.
      const invitationUrl = result.qrUrl || result.localQrUrl;
      if (!invitationUrl) {
        void vscode.window.showWarningMessage('ViBridge: aucune invitation valide fournie par l’agent. Vérifie sa connexion et sa version.');
        return;
      }

      const displayUrl = buildPairingDisplayUrl(invitationUrl);
      if (!displayUrl) {
        void vscode.window.showErrorMessage('ViBridge: l’URL d’appairage fournie par l’agent est invalide.');
        return;
      }

      // Open a dedicated, non-consuming QR display in the system browser.
      // This avoids VS Code webview CSP limitations and QR services receiving secrets.
      try {
        const opened = await vscode.env.openExternal(vscode.Uri.parse(displayUrl));
        if (!opened) {
          await vscode.env.clipboard.writeText(invitationUrl);
          void vscode.window.showWarningMessage('ViBridge: navigateur indisponible. Invitation copiée, à ouvrir uniquement sur le téléphone.');
        }
      } catch {
        await vscode.env.clipboard.writeText(invitationUrl);
        void vscode.window.showWarningMessage('ViBridge: ouverture du navigateur impossible. Invitation copiée pour le téléphone.');
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
