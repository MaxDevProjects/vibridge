/**
 * DevBridge PWA — Dashboard screen
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../App';
import type { AgentStatus } from '../types';
import { agentBaseUrl } from '../settings';

export default function Dashboard() {
  const { settings, wsState } = useApp();
  const { status, onMessage } = wsState;
  const navigate = useNavigate();
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [lastMessage, setLastMessage] = useState<string>('');

  // Fetch REST status
  useEffect(() => {
    if (status !== 'connected') return;
    const base = agentBaseUrl(settings);
    fetch(`${base}/status`, {
      headers: { Authorization: `Bearer ${settings.pairingToken ?? ''}` },
    })
      .then((r) => r.json() as Promise<AgentStatus>)
      .then(setAgentStatus)
      .catch(() => setAgentStatus(null));
  }, [status, settings]);

  // Track last AI message
  useEffect(() => {
    return onMessage((msg) => {
      if ((msg.type === 'output' || msg.type === 'ai_message') && msg.text) {
        setLastMessage(msg.text as string);
      }
    });
  }, [onMessage]);

  const statusColor: Record<typeof status, string> = {
    connected: 'text-success',
    connecting: 'text-yellow-400',
    disconnected: 'text-danger',
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">DevBridge</h1>

      {/* Connection status */}
      <div className="bg-surface-2 rounded-xl p-4 space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-slate-400 text-sm">Connection</span>
          <span className={`text-sm font-semibold ${statusColor[status]}`}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </span>
        </div>
        {agentStatus && (
          <>
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-sm">Active tool</span>
              <span className="text-sm">{agentStatus.activeAdapter ?? 'none'}</span>
            </div>
            <div className="flex gap-1 flex-wrap">
              {agentStatus.adapters.map((a) => (
                <span
                  key={a.id}
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    a.active ? 'bg-accent text-white' : 'bg-slate-700 text-slate-300'
                  }`}
                >
                  {a.label}
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Last message */}
      {lastMessage && (
        <div className="bg-surface-2 rounded-xl p-4">
          <p className="text-slate-400 text-xs mb-1">Last AI message</p>
          <p className="text-sm line-clamp-3">{lastMessage}</p>
          <button
            className="mt-2 text-accent text-xs"
            onClick={() => navigate('/chat')}
          >
            Open chat →
          </button>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Open Chat', path: '/chat', icon: '💬' },
          { label: 'Browse Files', path: '/codebase', icon: '📁' },
          { label: 'Preview App', path: '/preview', icon: '📱' },
          { label: 'Settings', path: '/settings', icon: '⚙' },
        ].map(({ label, path, icon }) => (
          <button
            key={path}
            onClick={() => navigate(path)}
            className="bg-surface-2 rounded-xl p-4 flex flex-col items-center gap-2 active:bg-slate-700 transition-colors"
          >
            <span className="text-2xl">{icon}</span>
            <span className="text-sm">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
