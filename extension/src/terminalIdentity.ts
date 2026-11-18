import * as vscode from 'vscode';
import { randomUUID } from 'crypto';

// IDs are stable during an extension-host process, unlike display names.
const ids = new WeakMap<vscode.Terminal, string>();

export function getTerminalId(terminal: vscode.Terminal): string {
  let id = ids.get(terminal);
  if (!id) {
    id = randomUUID();
    ids.set(terminal, id);
  }
  return id;
}

export function findTerminal(selector: string): { terminal: vscode.Terminal | null; ambiguous: boolean } {
  const key = selector.startsWith('terminal:') ? selector.slice('terminal:'.length) : selector;
  if (!key) return { terminal: null, ambiguous: false };
  const byId = vscode.window.terminals.find(item => getTerminalId(item) === key);
  if (byId) return { terminal: byId, ambiguous: false };
  // Compatibility with older mobile clients that only know a terminal name.
  const byName = vscode.window.terminals.filter(item => item.name === key);
  return { terminal: byName.length === 1 ? byName[0] : null, ambiguous: byName.length > 1 };
}
