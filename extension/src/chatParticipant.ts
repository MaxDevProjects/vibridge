/**
 * DevBridge VS Code Extension — Chat Participant (@devbridge)
 * Intercepts AI chat messages and forwards them to the Agent.
 * Also injects phone responses back into the active chat.
 */
import * as vscode from 'vscode';
import type { IpcClient } from './ipcClient';
import { QuestionDetector } from './questionDetector';

export class ChatParticipant {
  private detector = new QuestionDetector();
  private inbox = vscode.window.createOutputChannel('DevBridge Chat');

  constructor(private ipc: IpcClient) {
    // Forward injected messages from phone → VS Code chat
    ipc.on('inject_message', (msg: Record<string, unknown>) => {
      const text = String(msg.text ?? '').trim();
      const target = String(msg.target ?? '').trim();
      if (!text) return;

      if (target.startsWith('terminal:')) {
        const terminalName = target.slice('terminal:'.length);
        const terminal = vscode.window.terminals.find((item) => item.name === terminalName);
        if (terminal) {
          terminal.show(true);
          this.sendToTerminal(terminal, text);
          this.ipc.send({
            type: 'ide_event',
            kind: 'mobile_message_routed_terminal',
            target,
            terminal: terminalName,
            textPreview: text.slice(0, 160),
            ts: Date.now(),
          });
        } else {
          // Terminal is closed — recreate it
          const newTerminal = vscode.window.createTerminal({ name: terminalName });
          newTerminal.show(true);
          // If it's the Codex terminal, launch codex automatically
          if (terminalName === 'DevBridge Codex') {
            newTerminal.sendText('codex --no-alt-screen', true);
          }
          // Wait for the shell / process to be ready before injecting
          setTimeout(() => {
            newTerminal.show(true);
            this.sendToTerminal(newTerminal, text);
          }, 1200);
          this.ipc.send({
            type: 'ide_event',
            kind: 'mobile_message_routed_terminal_created',
            target,
            terminal: terminalName,
            textPreview: text.slice(0, 160),
            ts: Date.now(),
          });
        }
        return;
      }

      this.inbox.appendLine(`[${new Date().toLocaleTimeString()}] MOBILE > ${text}`);
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

  private sendToTerminal(terminal: vscode.Terminal, text: string): void {
    const config = vscode.workspace.getConfiguration('devbridge');
    const mode = String(config.get('terminalSendMode') ?? 'split');
    if (mode === 'paste') {
      terminal.sendText(text, true);
      return;
    }

    // "split" is the reliable mode for TUIs like Codex: paste the content,
    // then send a distinct Enter keypress.
    terminal.sendText(text, false);
    setTimeout(() => terminal.sendText('', true), 30);
  }
}
