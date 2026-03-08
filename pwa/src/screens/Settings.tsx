/**
 * DevBridge PWA — Settings screen
 * Handles: agent IP/port, tunnel URL, pairing code, push subscription.
 */
import { useState } from 'react';
import { useApp } from '../App';
import { usePush } from '../hooks/usePush';
import { agentBaseUrl } from '../settings';
import type { Settings } from '../types';

declare const __AGENT_PORT__: string;

export default function SettingsScreen() {
  const { settings, updateSettings } = useApp();
  const [draft, setDraft] = useState<Settings>({ ...settings });
  const [pairing, setPairing] = useState(false);
  const [pairCode, setPairCode] = useState('');
  const [pairStatus, setPairStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [vapidKey, setVapidKey] = useState('');
  const { state: pushState, subscribe } = usePush(draft);

  const save = () => {
    updateSettings(draft);
    alert('Settings saved.');
  };

  const pair = async () => {
    setPairing(true);
    setPairStatus('idle');
    try {
      const base = agentBaseUrl(draft);
      const res = await fetch(`${base}/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: pairCode }),
      });
      if (!res.ok) throw new Error('rejected');
      const { token } = (await res.json()) as { token: string };
      updateSettings({ ...draft, pairingToken: token });
      setDraft((d) => ({ ...d, pairingToken: token }));
      setPairStatus('ok');
    } catch {
      setPairStatus('error');
    } finally {
      setPairing(false);
    }
  };

  return (
    <div className="p-4 space-y-5">
      <h2 className="text-lg font-bold">Settings</h2>

      {/* Connection */}
      <section className="bg-surface-2 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-slate-300">Connection</h3>

        <label className="block">
          <span className="text-xs text-slate-400">PC IP address</span>
          <input
            className="mt-1 w-full bg-surface rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-accent"
            value={draft.agentHost}
            onChange={(e) => setDraft((d) => ({ ...d, agentHost: e.target.value }))}
            placeholder="192.168.1.100"
          />
        </label>

        <label className="block">
          <span className="text-xs text-slate-400">
            Agent port (default: {__AGENT_PORT__})
          </span>
          <input
            className="mt-1 w-full bg-surface rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-accent"
            type="number"
            value={draft.agentPort}
            onChange={(e) =>
              setDraft((d) => ({ ...d, agentPort: parseInt(e.target.value) || 3333 }))
            }
          />
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="accent-accent"
            checked={draft.useTunnel}
            onChange={(e) => setDraft((d) => ({ ...d, useTunnel: e.target.checked }))}
          />
          <span className="text-sm">Use Cloudflare Tunnel (remote access)</span>
        </label>

        {draft.useTunnel && (
          <label className="block">
            <span className="text-xs text-slate-400">Tunnel URL</span>
            <input
              className="mt-1 w-full bg-surface rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-accent font-mono"
              value={draft.tunnelUrl}
              onChange={(e) => setDraft((d) => ({ ...d, tunnelUrl: e.target.value }))}
              placeholder="https://xyz.trycloudflare.com"
            />
          </label>
        )}
      </section>

      {/* Pairing */}
      <section className="bg-surface-2 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-slate-300">Pairing</h3>
        <p className="text-xs text-slate-400">
          Enter the 6-digit code displayed in VS Code (run{' '}
          <span className="font-mono text-slate-300">DevBridge: Show Pairing Code</span>).
        </p>
        {settings.pairingToken && (
          <p className="text-xs text-success">✓ Already paired</p>
        )}
        <div className="flex gap-2">
          <input
            className="flex-1 bg-surface rounded-lg px-3 py-2 text-sm font-mono tracking-widest outline-none focus:ring-1 focus:ring-accent"
            maxLength={6}
            value={pairCode}
            onChange={(e) => setPairCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
          />
          <button
            className="bg-accent text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50"
            disabled={pairCode.length !== 6 || pairing}
            onClick={pair}
          >
            {pairing ? '…' : 'Pair'}
          </button>
        </div>
        {pairStatus === 'ok' && <p className="text-xs text-success">✓ Paired successfully!</p>}
        {pairStatus === 'error' && <p className="text-xs text-danger">✗ Invalid code. Try again.</p>}
      </section>

      {/* Push Notifications */}
      <section className="bg-surface-2 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-slate-300">Push Notifications</h3>
        {pushState === 'unsupported' ? (
          <p className="text-xs text-slate-400">Not supported in this browser.</p>
        ) : pushState === 'subscribed' ? (
          <p className="text-xs text-success">✓ Notifications enabled</p>
        ) : (
          <>
            <label className="block">
              <span className="text-xs text-slate-400">VAPID Public Key (from agent .env)</span>
              <input
                className="mt-1 w-full bg-surface rounded-lg px-3 py-2 text-xs font-mono outline-none focus:ring-1 focus:ring-accent"
                value={vapidKey}
                onChange={(e) => setVapidKey(e.target.value)}
                placeholder="BXXXXXXX…"
              />
            </label>
            <button
              className="bg-accent text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50 w-full"
              disabled={!vapidKey || pushState === 'denied'}
              onClick={() => subscribe(vapidKey)}
            >
              {pushState === 'denied' ? 'Notifications blocked — check browser settings' : 'Enable Notifications'}
            </button>
          </>
        )}
      </section>

      {/* Save */}
      <button
        className="w-full bg-accent active:bg-accent-hover text-white rounded-xl py-3 font-semibold"
        onClick={save}
      >
        Save Settings
      </button>
    </div>
  );
}
