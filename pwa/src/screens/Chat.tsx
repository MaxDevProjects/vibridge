/**
 * DevBridge PWA — Chat screen
 * Full duplex chat: AI messages stream in, user types or speaks replies.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { useApp } from '../App';
import { useSpeech } from '../hooks/useSpeech';
import type { ChatMessage } from '../types';
import { nanoid } from '../utils';

const TARGET_STORAGE_KEY = 'devbridge:chatTarget';
const DEFAULT_TARGET = 'terminal:DevBridge Codex';

interface TerminalInfo { name: string; cwd?: string | null }

/** Dot indicator mirroring WS status */
function StatusDot({ status }: { status: string }) {
  const color =
    status === 'connected' ? '#22c55e' :    // green
    status === 'connecting' ? '#f59e0b' :   // amber
    '#ef4444';                              // red
  const pulse = status === 'connecting';
  return (
    <span
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: color,
        animation: pulse ? 'pulse 1s infinite' : 'none',
      }}
    />
  );
}

export default function Chat() {
  const { wsState } = useApp();
  const { status, send, onMessage } = wsState;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [target, setTargetState] = useState<string>(
    () => localStorage.getItem(TARGET_STORAGE_KEY) ?? DEFAULT_TARGET
  );
  const [terminals, setTerminals] = useState<TerminalInfo[]>([]);
  const [showTargetPicker, setShowTargetPicker] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const setTarget = useCallback((t: string) => {
    setTargetState(t);
    localStorage.setItem(TARGET_STORAGE_KEY, t);
    setShowTargetPicker(false);
  }, []);

  // Receive AI messages + ide_snapshot via WebSocket
  useEffect(() => {
    return onMessage((msg) => {
      if (
        (msg.type === 'output' || msg.type === 'ai_message') &&
        typeof msg.text === 'string'
      ) {
        setMessages((prev) => [
          ...prev,
          {
            id: nanoid(),
            direction: 'ai',
            text: msg.text as string,
            isQuestion: msg.isQuestion as boolean | undefined,
            ts: Date.now(),
          },
        ]);
      }

      // Keep terminal list in sync from IDE snapshots
      if (msg.type === 'ide_snapshot') {
        const state = (msg.state ?? msg) as Record<string, unknown>;
        const list = Array.isArray(state.terminals) ? state.terminals as TerminalInfo[] : [];
        setTerminals(list);
      }
    });
  }, [onMessage]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const submitMessage = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setMessages((prev) => [
      ...prev,
      { id: nanoid(), direction: 'user', text: trimmed, ts: Date.now() },
    ]);
    const isTerminal = target.startsWith('terminal:');
    send({
      type: 'message',
      text: trimmed,
      target,
      sendEnter: isTerminal,
    });
    setInput('');
  };

  const { state: speechState, start: startSpeech, stop: stopSpeech } = useSpeech(
    (text) => submitMessage(text)
  );

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1] ?? '';
      send({ type: 'message', text: `[Image: ${file.name}]`, imageBase64: base64, target });
      setMessages((prev) => [
        ...prev,
        { id: nanoid(), direction: 'user', text: `📎 ${file.name}`, ts: Date.now() },
      ]);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  /** Human-readable label for the active target */
  const targetLabel = (t: string) => {
    if (t === 'terminal:DevBridge Codex') return '⟨⟩ DevBridge Codex';
    if (t.startsWith('terminal:')) return `⬛ ${t.slice('terminal:'.length)}`;
    if (t === 'chat:devbridge') return '◈ DevBridge Chat';
    return t;
  };

  /** All possible targets: known terminals + static options */
  const allTargets = [
    DEFAULT_TARGET,
    ...(terminals
      .map((t) => `terminal:${t.name}`)
      .filter((id) => id !== DEFAULT_TARGET)),
    'chat:devbridge',
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between bg-surface-2">
        <h2 className="font-semibold">Chat</h2>
        <div className="flex items-center gap-2">
          <StatusDot status={status} />
          <span className="text-xs text-slate-400">{status}</span>
        </div>
      </div>

      {/* Target selector bar */}
      <div className="px-3 py-2 border-b border-slate-700 bg-surface-2 relative">
        <button
          className="w-full flex items-center justify-between text-xs text-slate-300 bg-surface rounded-lg px-3 py-1.5 active:bg-slate-700"
          onClick={() => setShowTargetPicker((v) => !v)}
        >
          <span className="font-mono">{targetLabel(target)}</span>
          <span className="text-slate-500">▼ change</span>
        </button>

        {showTargetPicker && (
          <div className="absolute left-3 right-3 top-full mt-1 z-50 bg-slate-800 border border-slate-600 rounded-xl shadow-xl overflow-hidden">
            {allTargets.map((t) => (
              <button
                key={t}
                className={`w-full text-left px-4 py-2.5 text-xs font-mono ${
                  t === target ? 'bg-accent text-white' : 'text-slate-300 active:bg-slate-700'
                }`}
                onClick={() => setTarget(t)}
              >
                {targetLabel(t)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-center text-slate-500 text-sm mt-10">
            No messages yet — the AI conversation will appear here.
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.direction === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                m.direction === 'user'
                  ? 'bg-accent text-white'
                  : m.isQuestion
                  ? 'bg-yellow-800/60 border border-yellow-600'
                  : 'bg-surface-2'
              }`}
            >
              {m.isQuestion && (
                <p className="text-yellow-400 text-xs mb-1 font-medium">⚡ Needs your input</p>
              )}
              {m.text}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="px-3 pb-3 pt-2 border-t border-slate-700 bg-surface-2">
        <div className="flex items-end gap-2">
          {/* Attach */}
          <button
            className="text-slate-400 active:text-slate-200 p-2"
            onClick={() => fileInputRef.current?.click()}
          >
            📎
          </button>
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            className="hidden"
            onChange={handleImageUpload}
          />

          {/* Text input */}
          <textarea
            className="flex-1 bg-surface rounded-xl px-3 py-2 text-sm resize-none outline-none focus:ring-1 focus:ring-accent min-h-[40px] max-h-32"
            placeholder="Type a message…"
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitMessage(input);
              }
            }}
          />

          {/* Mic */}
          <button
            className={`p-2 text-lg ${
              speechState === 'listening' ? 'text-danger animate-pulse' : 'text-slate-400'
            } ${speechState === 'unsupported' ? 'opacity-30' : ''}`}
            disabled={speechState === 'unsupported'}
            onClick={() =>
              speechState === 'listening' ? stopSpeech() : startSpeech()
            }
          >
            🎤
          </button>

          {/* Send */}
          <button
            className="bg-accent active:bg-accent-hover text-white rounded-xl px-4 py-2 text-sm font-medium"
            onClick={() => submitMessage(input)}
          >
            Send
          </button>
        </div>

        {/* Quick responses */}
        <div className="flex gap-2 mt-2 overflow-x-auto pb-0.5">
          {['Yes', 'No', 'Continue', 'Stop', 'Explain'].map((q) => (
            <button
              key={q}
              className="text-xs bg-slate-700 rounded-full px-3 py-1 whitespace-nowrap active:bg-slate-600 flex-shrink-0"
              onClick={() => submitMessage(q)}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Pulse keyframe injected inline for the status dot */}
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }`}</style>
    </div>
  );
}

