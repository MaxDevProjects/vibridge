/**
 * Per-agent admission control for local CPU interpretation.
 *
 * The agent runs in Docker, but the model process runs on the WSL host.
 * All windows connected to this agent share ONE slot and a bounded queue.
 * The host also obtains an OS-level flock so separate agent instances cannot
 * accidentally run two models on the same workstation.
 *
 * No terminal content is persisted or logged by this supervisor.
 */
export interface LocalAiJob {
  requestId: string;
  windowId: string;
  terminalId: string;
  excerpt: string;
}
export type LocalAiReport = {
  type: 'terminal_interpret_progress' | 'terminal_interpret_result';
  windowId: string;
  terminalId: string;
  request_id: string;
  state?: 'queued' | 'running';
  position?: number;
  ok?: false;
  error?: string;
};
interface PendingJob extends LocalAiJob {
  enqueuedAt: number;
}
export interface LocalAiSupervisorSettings {
  maxQueued: number;
  maxQueueWaitMs: number;
  maxRuntimeMs: number;
  memoryLimitMb: number;
  cpuThreads: number;
  reserveFreeMb: number;
}

const DEFAULTS: LocalAiSupervisorSettings = {
  maxQueued: 2,
  maxQueueWaitMs: 30_000,
  maxRuntimeMs: 65_000,
  memoryLimitMb: 1024,
  cpuThreads: 2,
  reserveFreeMb: 512,
};
function within(value: number, lower: number, upper: number): number {
  return Number.isFinite(value) ? Math.max(lower, Math.min(upper, Math.trunc(value))) : lower;
}
export function localAiSettings(env: NodeJS.ProcessEnv = process.env): LocalAiSupervisorSettings {
  const requested = (name: string, fallback: number) => {
    const raw = env[name];
    return raw === undefined || raw.trim() === '' ? fallback : Number(raw);
  };
  return {
    maxQueued: within(requested('VIBRIDGE_AI_MAX_QUEUE', DEFAULTS.maxQueued), 0, 5),
    maxQueueWaitMs: within(requested('VIBRIDGE_AI_QUEUE_WAIT_MS', DEFAULTS.maxQueueWaitMs), 1000, 120_000),
    maxRuntimeMs: within(requested('VIBRIDGE_AI_JOB_TIMEOUT_MS', DEFAULTS.maxRuntimeMs), 15_000, 120_000),
    memoryLimitMb: within(requested('VIBRIDGE_AI_MEMORY_MB', DEFAULTS.memoryLimitMb), 384, 2048),
    cpuThreads: within(requested('VIBRIDGE_AI_THREADS', DEFAULTS.cpuThreads), 1, 3),
    reserveFreeMb: within(requested('VIBRIDGE_AI_RESERVE_MB', DEFAULTS.reserveFreeMb), 256, 4096),
  };
}
const REQUEST_ID = /^[a-zA-Z0-9_-]{8,128}$/;
const ENTITY_ID = /^[a-zA-Z0-9._:-]{1,128}$/;

export class LocalAiSupervisor {
  private active: PendingJob | null = null;
  private queued: PendingJob[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  readonly settings: LocalAiSupervisorSettings;

  constructor(
    private readonly dispatch: (message: LocalAiJob & {
      type: 'terminal_interpret';
      request_id: string;
      resourceLimits: { memoryMb: number; threads: number; reserveMb: number; timeoutMs: number };
    }) => boolean,
    private readonly emit: (report: LocalAiReport | Record<string, unknown>) => void,
    settings: Partial<LocalAiSupervisorSettings> = {},
  ) {
    this.settings = { ...DEFAULTS, ...settings };
  }

  enqueue(job: LocalAiJob): boolean {
    if (this.stopped || !REQUEST_ID.test(job.requestId)
      || !ENTITY_ID.test(job.windowId) || !ENTITY_ID.test(job.terminalId)
      || job.excerpt.length < 40 || job.excerpt.length > 6000) return false;
    if (this.active?.requestId === job.requestId || this.queued.some(item => item.requestId === job.requestId)) return false;
    if (this.active && this.queued.length >= this.settings.maxQueued) {
      this.fail(job, 'ai_queue_full');
      return false;
    }

    const pending: PendingJob = { ...job, enqueuedAt: Date.now() };
    this.queued.push(pending);
    if (this.active) {
      this.emit({ type: 'terminal_interpret_progress', windowId: job.windowId,
        terminalId: job.terminalId, request_id: job.requestId,
        state: 'queued', position: this.queued.length });
    }
    this.startNext();
    return true;
  }

  complete(windowId: string | undefined, result: Record<string, unknown>): boolean {
    const current = this.active;
    if (!current || current.windowId !== windowId
      || current.requestId !== result.request_id
      || current.terminalId !== result.terminalId) return false;
    this.clearTimer();
    this.active = null;
    // Always use the agent-owned routing identity, not fields supplied by a
    // terminal or a different VS Code extension.
    this.emit({ type: 'terminal_interpret_result',
      windowId: current.windowId, terminalId: current.terminalId,
      request_id: current.requestId, ok: result.ok === true,
      readout: result.ok === true ? result.readout : undefined,
      error: result.ok === true ? undefined : String(result.error ?? 'interpreter_failed').slice(0, 100) });
    this.startNext();
    return true;
  }

  disconnectWindow(windowId: string): void {
    if (this.stopped) return;
    const removed = this.queued.filter(job => job.windowId === windowId);
    this.queued = this.queued.filter(job => job.windowId !== windowId);
    for (const job of removed) this.fail(job, 'host_window_disconnected');
    if (this.active?.windowId === windowId) {
      const current = this.active;
      this.clearTimer();
      this.active = null;
      this.fail(current, 'host_window_disconnected');
      this.startNext();
    }
  }

  shutdown(): void {
    this.stopped = true;
    this.clearTimer();
    this.active = null;
    this.queued = [];
  }

  private startNext(): void {
    if (this.stopped || this.active) return;
    while (this.queued.length) {
      const job = this.queued.shift()!;
      if (Date.now() - job.enqueuedAt > this.settings.maxQueueWaitMs) {
        this.fail(job, 'ai_queue_expired');
        continue;
      }
      this.active = job;
      const sent = this.dispatch({
        type: 'terminal_interpret', request_id: job.requestId,
        windowId: job.windowId, terminalId: job.terminalId, excerpt: job.excerpt,
        resourceLimits: {
          memoryMb: this.settings.memoryLimitMb,
          threads: this.settings.cpuThreads,
          reserveMb: this.settings.reserveFreeMb,
          // Host execution should terminate before the coordinator deadline.
          timeoutMs: Math.max(5_000, this.settings.maxRuntimeMs - 12_000),
        },
        requestId: job.requestId,
      });
      if (!sent) {
        this.active = null;
        this.fail(job, 'ai_host_unavailable');
        continue;
      }
      this.emit({ type: 'terminal_interpret_progress',
        windowId: job.windowId, terminalId: job.terminalId,
        request_id: job.requestId, state: 'running' });
      this.timer = setTimeout(() => {
        if (this.active?.requestId !== job.requestId) return;
        this.active = null;
        this.clearTimer();
        this.fail(job, 'ai_worker_timeout');
        this.startNext();
      }, this.settings.maxRuntimeMs);
      this.timer.unref?.();
      return;
    }
  }

  private fail(job: LocalAiJob, error: string): void {
    this.emit({ type: 'terminal_interpret_result',
      windowId: job.windowId, terminalId: job.terminalId,
      request_id: job.requestId, ok: false, error });
  }
  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
