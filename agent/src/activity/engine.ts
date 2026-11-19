/**
 * ViBridge Activity Engine V1.
 *
 * Turns VERIFIED terminal lifecycle events into small, safe presentation
 * metadata. No model, no raw command lines, file paths, prompts or terminal
 * output are retained or transmitted by this engine.
 *
 * "confirmed" means only the corresponding SHELL COMMAND exited with code 0;
 * it never means that a user's overall project objective is complete.
 */
export type ActivityKind = 'build' | 'test' | 'dependency' | 'git' | 'command' | 'output' | 'attention';
export type ActivityStatus = 'running' | 'confirmed' | 'failed' | 'observed' | 'attention';
export type ActivityEvidence =
  | 'shell_started' | 'shell_exit_0' | 'shell_exit_nonzero'
  | 'shell_finished_unverified' | 'output_observed'
  | 'screen_observed' | 'possible_question' | 'terminal_closed';

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  label: string;
  status: ActivityStatus;
  evidence: ActivityEvidence;
  updatedAt: number;
  exitCode?: number;
}

export interface ActivitySnapshot {
  windowId: string;
  terminalId: string;
  items: ActivityItem[];
  updatedAt: number;
}

interface Input {
  windowId?: unknown;
  terminalId?: unknown;
  commandLine?: unknown;
  executionId?: unknown;
  exitCode?: unknown;
}

interface InternalSnapshot extends ActivitySnapshot {
  activeExecutions: Map<string, string>;
  lastOutputAt: number;
}

const MAX_TERMINALS = 60;
const MAX_ITEMS = 8;
const MAX_ID = 80;

function safeIdentity(value: unknown): string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID
    ? value : '';
}

function describeCommand(commandLine: unknown): { kind: ActivityKind; label: string } {
  // Inspect only a bounded prefix to identify generic commands; never retain
  // literal arguments (which may contain credentials or private paths).
  const text = typeof commandLine === 'string'
    ? commandLine.trim().toLowerCase().slice(0, 200) : '';
  if (/^(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?build\b|(?:npx\s+)?(?:vite|next)\s+build\b|(?:npx\s+)?tsc(?:\s|$))/.test(text))
    return { kind: 'build', label: 'Build' };
  if (/^(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|test:[\w-]+)\b|(?:npx\s+)?(?:vitest|jest|playwright)\s+(?:run|test)\b|pytest\b|go\s+test\b)/.test(text))
    return { kind: 'test', label: 'Tests' };
  if (/^(?:(?:npm|pnpm|yarn|bun)\s+(?:install|add|ci)\b|pip\s+install\b)/.test(text))
    return { kind: 'dependency', label: 'Dépendances' };
  if (/^git\s+(?:status|add|commit|push|pull|fetch|merge|rebase|diff)\b/.test(text))
    return { kind: 'git', label: 'Git' };
  return { kind: 'command', label: 'Commande shell' };
}

function withState(label: string, status: ActivityStatus): string {
  switch (status) {
    case 'running': return label + ' en cours';
    case 'confirmed': return label + ' réussi';
    case 'failed': return label + ' en échec';
    case 'observed': return label + ' terminé, résultat à vérifier';
    case 'attention': return label + ' à vérifier';
  }
}

export class ActivityEngine {
  private readonly states = new Map<string, InternalSnapshot>();
  private counter = 0;
  constructor(private readonly onUpdate: (update: ActivitySnapshot) => void,
    private readonly now: () => number = Date.now) {}

  private key(windowId: string, terminalId: string): string {
    return JSON.stringify([windowId, terminalId]);
  }

  private existing(input: Input): InternalSnapshot | null {
    const windowId = safeIdentity(input.windowId), terminalId = safeIdentity(input.terminalId);
    return windowId && terminalId ? this.states.get(this.key(windowId, terminalId)) ?? null : null;
  }

  private get(input: Input): InternalSnapshot | null {
    const windowId = safeIdentity(input.windowId), terminalId = safeIdentity(input.terminalId);
    if (!windowId || !terminalId) return null;
    const key = this.key(windowId, terminalId);
    let state = this.states.get(key);
    if (!state) {
      if (this.states.size >= MAX_TERMINALS) {
        const oldest = [...this.states.entries()].sort((a,b) => a[1].updatedAt - b[1].updatedAt)[0];
        if (oldest) this.states.delete(oldest[0]);
      }
      state = { windowId, terminalId, items: [], updatedAt: this.now(),
        activeExecutions: new Map(), lastOutputAt: 0 };
      this.states.set(key, state);
    }
    return state;
  }

  private publish(state: InternalSnapshot): void {
    state.items = state.items.slice(-MAX_ITEMS);
    const current = new Set(state.items.map(item => item.id));
    for (const id of state.activeExecutions.keys()) if (!current.has(id)) state.activeExecutions.delete(id);
    state.updatedAt = this.now();
    this.onUpdate({ windowId: state.windowId, terminalId: state.terminalId,
      items: state.items.map(item => ({ ...item })), updatedAt: state.updatedAt });
  }

  started(input: Input): void {
    const state = this.get(input);
    if (!state) return;
    const desc = describeCommand(input.commandLine);
    const id = safeIdentity(input.executionId) || 'execution-' + ++this.counter;
    // Two starts for the same execution must not create duplicate milestones.
    if (state.items.some(item => item.id === id)) return;
    const now = this.now();
    state.items.push({ id, kind: desc.kind, label: withState(desc.label, 'running'),
      status: 'running', evidence: 'shell_started', updatedAt: now });
    state.activeExecutions.set(id, id);
    this.publish(state);
  }

  finished(input: Input): void {
    const state = this.existing(input);
    if (!state) return;
    const id = safeIdentity(input.executionId);
    // Do not confirm an unrelated command if we lack a reliable execution ID.
    const running = state.items.filter(item =>
      item.status === 'running' && state.activeExecutions.has(item.id));
    const item = id
      ? running.find(entry => entry.id === id)
      : running.length === 1 ? running[0] : undefined;
    if (!item) return;
    const exit = typeof input.exitCode === 'number' && Number.isInteger(input.exitCode)
      && input.exitCode >= 0 && input.exitCode <= 255 ? input.exitCode : undefined;
    item.status = exit === 0 ? 'confirmed' : exit === undefined ? 'observed' : 'failed';
    item.evidence = exit === 0 ? 'shell_exit_0' : exit === undefined
      ? 'shell_finished_unverified' : 'shell_exit_nonzero';
    const base = item.kind === 'build' ? 'Build'
      : item.kind === 'test' ? 'Tests'
      : item.kind === 'dependency' ? 'Dépendances'
      : item.kind === 'git' ? 'Git' : 'Commande shell';
    item.label = withState(base, item.status);
    item.updatedAt = this.now();
    if (exit !== undefined) item.exitCode = exit;
    state.activeExecutions.delete(item.id);
    this.publish(state);
  }

  output(input: Input, source: 'output' | 'screen' = 'output'): void {
    const state = this.get(input);
    if (!state) return;
    const now = this.now();
    const id = source === 'screen' ? 'screen-observed' : 'output-observed';
    const existing = state.items.find(item => item.id === id);
    if (existing) {
      // Don't generate one timeline event per terminal chunk or redraw.
      if (now - state.lastOutputAt < 30_000) return;
      existing.updatedAt = now;
    } else {
      state.items.push({
        id, kind:'output', label:source === 'screen'
          ? 'Écran du terminal observé' : 'Sortie du terminal observée',
        status:'observed', evidence:source === 'screen'
          ? 'screen_observed' : 'output_observed', updatedAt:now,
      });
    }
    state.lastOutputAt = now;
    this.publish(state);
  }

  possibleQuestion(input: Input): void {
    const state = this.get(input);
    if (!state) return;
    const now = this.now();
    const recent = state.items.find(item => item.id === 'possible-question');
    if (recent && now - recent.updatedAt < 60_000) return;
    if (recent) {
      recent.updatedAt = now;
    } else {
      state.items.push({ id:'possible-question', kind:'attention',
        label:'Intervention peut-être nécessaire', status:'attention',
        evidence:'possible_question', updatedAt:now });
    }
    this.publish(state);
  }

  closed(input: Input): void {
    const state = this.existing(input);
    if (!state) return;
    for (const item of state.items) {
      if (item.status !== 'running') continue;
      item.status = 'observed';
      item.evidence = 'terminal_closed';
      item.label = 'Terminal fermé, résultat non confirmé';
      item.updatedAt = this.now();
    }
    state.activeExecutions.clear();
    this.publish(state);
  }

  snapshot(): ActivitySnapshot[] {
    return [...this.states.values()].sort((a,b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_TERMINALS)
      .map(state => ({ windowId:state.windowId, terminalId:state.terminalId,
        updatedAt:state.updatedAt, items:state.items.map(item => ({...item})) }));
  }
}
