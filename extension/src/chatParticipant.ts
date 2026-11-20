/**
 * DevBridge VS Code Extension — Chat Participant (@devbridge)
 * Intercepts AI chat messages and forwards them to the Agent.
 * Also injects phone responses back into the active chat.
 */
import * as vscode from 'vscode';
import type { IpcClient } from './ipcClient';
import { QuestionDetector } from './questionDetector';
import { findTerminal, getTerminalId } from './terminalIdentity';
import type { TerminalScreenMirror } from './terminalScreenMirror';

export class ChatParticipant {
  private detector = new QuestionDetector();
  private inbox = vscode.window.createOutputChannel('DevBridge Chat');

  constructor(private ipc: IpcClient, private mirror?: TerminalScreenMirror) {
    // Forward injected messages from phone → VS Code chat
    ipc.on('inject_message', (msg: Record<string, unknown>) => {
      const text = String(msg.text ?? '').trim();
      const target = String(msg.target ?? '').trim();
      const terminalName = String(msg.terminalName ?? '').trim();
      const command = String(msg.command ?? '').trim();
      const args = Array.isArray(msg.args) ? (msg.args as string[]) : [];
      if (!text) return;
      const requestId = typeof msg.request_id === 'string' ? msg.request_id : '';
      const reportExecution = (
        phase: 'dispatched' | 'input_sent' | 'rejected',
        reason?: string,
        terminal?: vscode.Terminal,
      ) => {
        if (!requestId) return;
        this.ipc.send({ type: 'command_execution', request_id: requestId, phase, reason,
          action: 'message', terminalName: terminal?.name ?? terminalName,
          terminalId: terminal ? getTerminalId(terminal) : undefined });
      };

      const resolved = this.resolveTerminalTarget(target, terminalName);
      if (resolved) {
        if (resolved.ambiguous) { reportExecution('rejected', 'ambiguous_terminal'); return; }
        if (target.startsWith('terminal:') && !resolved.existed) {
          this.ipc.send({ type: 'terminal_unavailable', terminalName: resolved.terminalName });
          reportExecution('rejected', 'terminal_unavailable');
          return;
        }
        const fullCommand = command ? (args.length ? `${command} ${args.join(' ')}` : command) : '';
        const terminal = resolved.terminal ?? this.ensureTerminal(resolved.terminalName, fullCommand);
        terminal.show(true);
        const injectDelay = (resolved.needsBootDelay || (fullCommand && !resolved.existed)) ? 1200 : 0;
        // Await BOTH text injection and the Enter key before reporting input
        // dispatch. Previously the delayed Enter was not awaited at all.
        void (async () => {
          if (injectDelay) await new Promise<void>(resolve => setTimeout(resolve, injectDelay));
          try {
            terminal.show(true);
            const phase = await this.sendToTerminal(terminal, text, msg.sendEnter !== false);
            // Even tmux acknowledging Enter does NOT prove a Codex turn began.
            reportExecution(phase, undefined, terminal);
          } catch (error) {
            const reason = error instanceof Error && error.message === 'unsupported_tmux_input'
              ? 'multiline_input_requires_review' : 'terminal_input_unconfirmed';
            // No retry: text may already be present inside the terminal TUI.
            reportExecution('rejected', reason, terminal);
          }
        })();
        this.ipc.send({
          type: 'ide_event',
          kind: resolved.existed ? 'mobile_message_routed_terminal' : 'mobile_message_routed_terminal_created',
          target: resolved.reportTarget,
          terminal: resolved.terminalName,
          textPreview: text.slice(0, 160),
          ts: Date.now(),
        });
        return;
      }

      this.inbox.appendLine(`[${new Date().toLocaleTimeString()}] MOBILE > ${text}`);
      reportExecution('dispatched');
      this.inbox.show(true);
      this.ipc.send({
        type: 'ide_event',
        kind: 'mobile_message_routed_devbridge_chat',
        target: target || 'chat:devbridge',
        textPreview: text.slice(0, 160),
        ts: Date.now(),
      });
      void vscode.window.setStatusBarMessage('DevBridge: message routed to DevBridge Chat.', 4000);
    });
  }

  register(): vscode.Disposable {
    const handler: vscode.ChatRequestHandler = async (
      request,
      _context,
      stream,
      _token
    ) => {
      // Relay phone → AI: the user typed in the PWA chat
      const text = request.prompt;
      this.ipc.send({ type: 'chat_message', text, direction: 'user_to_ai', tool: 'chat:devbridge', target: 'chat:devbridge' });
      this.inbox.appendLine(`[${new Date().toLocaleTimeString()}] IDE > ${text}`);
      stream.markdown(`*DevBridge relayed your message to the active AI tool.*`);
    };

    const participant = vscode.chat.createChatParticipant(
      'devbridge.assistant',
      handler
    );
    participant.iconPath = new vscode.ThemeIcon('radio-tower');

    // Intercept all chat response events to detect AI questions
    const disposable = this.interceptChatOutput();

    return {
      dispose: () => {
        participant.dispose();
        disposable.dispose();
        this.inbox.dispose();
      },
    };
  }

  /**
   * Listen to VS Code chat response stream events.
   * VS Code 1.87+ exposes onDidReceiveMessage on the chat view.
   */
  private interceptChatOutput(): vscode.Disposable {
    // Poll strategy: watch for new terminal / output activity.
    // True chat API interception is done via the IPC channel when the
    // user routes Copilot/Claude messages through @devbridge.
    //
    // Deep hook strategy using proposed API (comment preserved for future):
    // vscode.chat.onDidReceiveMessage?.((e) => { ... })
    //
    // For now we expose an IPC relay so the Agent can push messages in.
    const interval = setInterval(() => {
      // Heartbeat — keep IPC alive and let the Agent know the extension is up
      if (this.ipc.isConnected()) {
        this.ipc.send({ type: 'heartbeat' });
      }
    }, 15_000);

    return { dispose: () => clearInterval(interval) };
  }

  /**
   * Called externally (e.g., from a proposed API hook) when an AI response
   * chunk arrives. Forwards to the Agent and triggers push if it's a question.
   */
  handleAiOutput(text: string): void {
    this.inbox.appendLine(`[${new Date().toLocaleTimeString()}] AI > ${text}`);
    this.ipc.send({ type: 'chat_message', text, direction: 'ai_to_user', tool: 'chat:devbridge', target: 'chat:devbridge' });

    if (this.detector.isQuestion(text)) {
      this.ipc.send({ type: 'chat_message', text, direction: 'ai_question', tool: 'chat:devbridge', target: 'chat:devbridge' });
    }
  }

  showInbox(): void {
    this.inbox.show(true);
  }

  private async sendToTerminal(
    terminal: vscode.Terminal, text: string, sendEnter: boolean,
  ): Promise<'dispatched' | 'input_sent'> {
    if (this.mirror?.sessionFor(terminal)) {
      // Reject multiline text rather than risk treating embedded newlines
      // as separate commands. These need an explicit bracketed-paste path.
      await this.mirror.sendInput(terminal, text, sendEnter);
      return sendEnter ? 'input_sent' : 'dispatched';
    }
    if (!sendEnter) {
      terminal.sendText(text, false);
      return 'dispatched';
    }
    const config = vscode.workspace.getConfiguration('devbridge');
    const mode = String(config.get('terminalSendMode') ?? 'split');
    if (mode === 'paste') {
      terminal.sendText(text, true);
      return 'dispatched';
    }

    // Non-owned VS Code terminals have no PTY-level acknowledgement. Only
    // report 'dispatched' AFTER the second API call was made.
    terminal.sendText(text, false);
    await new Promise<void>(resolve => setTimeout(resolve, 150));
    terminal.sendText('', true);
    return 'dispatched';
  }

  private resolveTerminalTarget(
    target: string,
    requestedTerminalName: string,
  ): { terminalName: string; reportTarget: string; existed: boolean; needsBootDelay: boolean;
       terminal: vscode.Terminal | null; ambiguous: boolean } | null {
    if (target === 'bash' || target.startsWith('terminal:') || requestedTerminalName) {
      const lookupKey = target === 'bash' ? 'bash'
        : target.startsWith('terminal:') ? target : requestedTerminalName;
      const match = findTerminal(lookupKey);
      const fallbackName = target.startsWith('terminal:') ? target.slice('terminal:'.length)
        : target === 'bash' ? 'bash' : requestedTerminalName;
      return {
        terminalName: match.terminal?.name ?? (requestedTerminalName || fallbackName),
        reportTarget: target || 'terminal:' + fallbackName,
        existed: Boolean(match.terminal),
        needsBootDelay: !match.terminal,
        terminal: match.terminal,
        ambiguous: match.ambiguous,
      };
    }
    return null;
  }

  private ensureTerminal(terminalName: string, launchCommand: string): vscode.Terminal {
    const existing = vscode.window.terminals.find((item) => item.name === terminalName);
    if (existing) return existing;
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const terminal = vscode.window.createTerminal({ name: terminalName, cwd });
    if (launchCommand) terminal.sendText(launchCommand, true);
    return terminal;
  }
}
