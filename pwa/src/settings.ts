/* DevBridge PWA — Settings persistence */
import type { Settings } from './types';

const KEY = 'devbridge:settings';

declare const __AGENT_PORT__: string;
const DEFAULT_PORT = parseInt(__AGENT_PORT__ ?? '3333', 10);

export const defaultSettings: Settings = {
  agentHost: window.location.hostname || 'localhost',
  agentPort: DEFAULT_PORT,
  useTunnel: false,
  tunnelUrl: '',
  pairingToken: null,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...defaultSettings };
    return { ...defaultSettings, ...JSON.parse(raw) } as Settings;
  } catch {
    return { ...defaultSettings };
  }
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function agentBaseUrl(s: Settings): string {
  if (s.useTunnel && s.tunnelUrl) return s.tunnelUrl.replace(/\/$/, '');
  return `http://${s.agentHost}:${s.agentPort}`;
}

export function agentWsUrl(s: Settings): string {
  const base = agentBaseUrl(s)
    .replace(/^https/, 'wss')
    .replace(/^http/, 'ws');
  return `${base}/ws`;
}
