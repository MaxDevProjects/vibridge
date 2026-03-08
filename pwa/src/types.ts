/* DevBridge PWA — Global types */

export interface AgentStatus {
  ok: boolean;
  adapters: Array<{ id: string; label: string; active: boolean }>;
  activeAdapter: string | null;
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  direction: 'user' | 'ai';
  text: string;
  isQuestion?: boolean;
  ts: number;
}

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'dir';
  children?: FileNode[];
}

export interface Settings {
  agentHost: string;      // IP or hostname of the PC
  agentPort: number;
  useTunnel: boolean;
  tunnelUrl: string;
  pairingToken: string | null;
}

export interface WsMessage {
  type: string;
  text?: string;
  tool?: string;
  isQuestion?: boolean;
  path?: string;
  event?: string;
  payload?: unknown;
  [key: string]: unknown;
}
