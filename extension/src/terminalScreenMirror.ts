import * as vscode from 'vscode';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { IpcClient } from './ipcClient';
import { getTerminalId } from './terminalIdentity';
import { boundedMirrorScreen, validMirrorSession, ownedTmuxInputCommands } from './terminalScreenMirrorUtils';

const TMUX_SOCKET = 'vibridge';
const STORAGE_KEY = 'devbridge.ownedTmuxSessions';
const CAPTURE_INTERVAL_MS = 850;
const RESEND_INTERVAL_MS = 8000;
const SESSION_LIMIT = 30;

interface OwnedSession {
  session: string;
  name: string;
  cwd?: string;
}

function tmux(args: string[], timeout = 1200): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('tmux', ['-L', TMUX_SOCKET, ...args], {
      encoding: 'utf8',
      maxBuffer: 128 * 1024,
      timeout,
      windowsHide: true,
    }, (err, stdout) => err ? reject(err) : resolve(stdout));
  });
}

/**
 * Explicit, opt-in full-screen observation for terminals created by ViBridge.
 * Normal VS Code terminals remain read-only via Shell Integration events.
 *
 * tmux itself owns the PTY so we can snapshot the screen even after a TUI
 * rewrites it. Neither raw screen contents nor tmux history are written to
 * local files or to the relay event history.
 */
export class TerminalScreenMirror implements vscode.Disposable {
  private readonly sessions = new Map<vscode.Terminal, OwnedSession>();
  private readonly polls = new Map<vscode.Terminal, ReturnType<typeof setInterval>>();
  private readonly pendingInputs = new Map<string, Promise<void>>();
  private readonly lastScreen = new Map<vscode.Terminal, { text: string; at: number }>();
  private readonly disposables: vscode.Disposable[] = [];
  private readonly onConnected = () => {
    for (const terminal of this.sessions.keys()) void this.capture(terminal);
  };

  constructor(private readonly ipc: IpcClient, private readonly context: vscode.ExtensionContext) {
    this.ipc.on('connected', this.onConnected);
    this.disposables.push(vscode.window.onDidCloseTerminal(terminal => this.detach(terminal)));
  }

  sessionFor(terminal: vscode.Terminal): string | undefined {
    return this.sessions.get(terminal)?.session;
  }

  /**
   * Stronger input dispatch for explicitly owned tmux sessions. The promise
   * resolves only after tmux accepted BOTH literal text and Enter. It does
   * not prove that Codex accepted the submitted prompt or completed a turn.
   * Inputs to the same pane are serialized to prevent interleaving.
   */
  async sendInput(terminal: vscode.Terminal, text: string, enter: boolean): Promise<void> {
    const session = this.sessionFor(terminal);
    if (!session) throw new Error('not_owned_tmux_terminal');
    const commands = ownedTmuxInputCommands(session, text, enter);
    const previous = this.pendingInputs.get(session) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(async () => {
      await tmux(['has-session', '-t', session]);
      for (const args of commands) await tmux(args, 3000);
    });
    this.pendingInputs.set(session, current);
    try {
      await current;
    } finally {
      if (this.pendingInputs.get(session) === current) this.pendingInputs.delete(session);
    }
  }

  async create(name: string, cwd?: string): Promise<vscode.Terminal> {
    try {
      await tmux(['-V']);
    } catch {
      throw new Error('tmux_not_installed');
    }
    const session = `vibridge_${randomUUID().replace(/-/g, '')}`;
    const record: OwnedSession = { session, name, cwd };
    // Persist only a safe session identifier, never the shell contents.
    const saved = this.readSaved().filter(item => item.session !== session);
    await this.context.workspaceState.update(STORAGE_KEY, [...saved.slice(-(SESSION_LIMIT - 1)), record]);
    const terminal = this.open(record);
    return terminal;
  }

  async reopen(session: string): Promise<vscode.Terminal> {
    if (!validMirrorSession(session)) throw new Error('invalid_mirror_session');
    const record = this.readSaved().find(item => item.session === session);
    if (!record) throw new Error('mirror_session_not_owned');
    const existing = [...this.sessions.entries()].find(([, item]) => item.session === session)?.[0];
    if (existing) { existing.show(true); return existing; }
    try {
      await tmux(['has-session', '-t', session]);
    } catch {
      throw new Error('mirror_session_expired');
    }
    return this.open(record);
  }

  private readSaved(): OwnedSession[] {
    const data = this.context.workspaceState.get<unknown>(STORAGE_KEY);
    if (!Array.isArray(data)) return [];
    return data.filter((item): item is OwnedSession =>
      typeof item === 'object' && item !== null
      && validMirrorSession((item as OwnedSession).session)
      && typeof (item as OwnedSession).name === 'string'
      && (item as OwnedSession).name.length <= 80
      && ((item as OwnedSession).cwd === undefined || typeof (item as OwnedSession).cwd === 'string'),
    ).slice(-SESSION_LIMIT);
  }

  private open(record: OwnedSession): vscode.Terminal {
    const terminal = vscode.window.createTerminal({
      name: record.name,
      cwd: record.cwd,
      shellPath: 'tmux',
      shellArgs: ['-L', TMUX_SOCKET, 'new-session', '-A', '-s', record.session],
    });
    this.sessions.set(terminal, record);
    terminal.show(true);
    this.polls.set(terminal, setInterval(() => void this.capture(terminal), CAPTURE_INTERVAL_MS));
    void this.capture(terminal);
    return terminal;
  }

  private async capture(terminal: vscode.Terminal): Promise<void> {
    if (!this.ipc.isConnected()) return;
    const record = this.sessions.get(terminal);
    if (!record) return;
    try {
      const screen = boundedMirrorScreen(await tmux([
        'capture-pane', '-p', '-J', '-S', '-100', '-t', record.session,
      ]));
      if (!this.sessions.has(terminal)) return;
      const previous = this.lastScreen.get(terminal);
      const now = Date.now();
      if (previous?.text === screen && now - previous.at < RESEND_INTERVAL_MS) return;
      this.lastScreen.set(terminal, { text: screen, at: now });
      this.ipc.send({
        type: 'terminal_screen',
        terminalId: getTerminalId(terminal),
        session: record.session,
        text: screen,
        ts: now,
      });
    } catch {
      // Session may still be starting or has been closed. No fake success.
    }
  }

  private detach(terminal: vscode.Terminal): void {
    const timer = this.polls.get(terminal);
    if (timer) clearInterval(timer);
    this.polls.delete(terminal);
    this.sessions.delete(terminal);
    this.lastScreen.delete(terminal);
    // Keep the tmux session running for an explicit reattach from the phone.
  }

  dispose(): void {
    this.ipc.off('connected', this.onConnected);
    for (const timer of this.polls.values()) clearInterval(timer);
    this.polls.clear();
    this.sessions.clear();
    this.lastScreen.clear();
    this.pendingInputs.clear();
    for (const item of this.disposables) item.dispose();
  }
}
