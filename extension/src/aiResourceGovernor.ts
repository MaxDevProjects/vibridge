/**
 * WSL host-side resource guard for a one-shot llama.cpp process.
 *
 * The agent owns admission/queueing. The extension owns the actual process,
 * because Docker does not have access to host binaries/models by default.
 * flock prevents duplicate loads even across independent agent containers.
 *
 * Memory monitoring uses Linux /proc VmRSS (best effort, not an atomic hard
 * limit). If strict cgroup limits are needed, a systemd/cgroup-backed worker
 * must be configured separately. Never describe RSS polling as a hard cap.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export interface AiResourceLimits {
  memoryMb: number;
  threads: number;
  reserveMb: number;
  timeoutMs: number;
}
export interface AiRunMetrics {
  peakMb: number;
  durationMs: number;
}
export interface AiRunResult extends AiRunMetrics { stdout: string }
const MB = 1024 * 1024;

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.trunc(value))) : min;
}
export function boundedResources(value: Partial<AiResourceLimits> = {}): AiResourceLimits {
  return {
    memoryMb: clamp(value.memoryMb ?? 1024, 384, 2048),
    threads: clamp(value.threads ?? 2, 1, 3),
    reserveMb: clamp(value.reserveMb ?? 512, 256, 4096),
    timeoutMs: clamp(value.timeoutMs ?? 45000, 5000, 60000),
  };
}
export function parseLinuxMemoryAvailable(text: string): number | null {
  const match = text.match(/^MemAvailable:\s+(\d+)\s+kB\s*$/m);
  if (!match) return null;
  const kb = Number(match[1]);
  return Number.isFinite(kb) ? Math.floor(kb / 1024) : null;
}
export function parseLinuxRssMb(text: string): number | null {
  const match = text.match(/^VmRSS:\s+(\d+)\s+kB\s*$/m);
  if (!match) return null;
  const kb = Number(match[1]);
  return Number.isFinite(kb) ? Math.ceil(kb / 1024) : null;
}
export function modelFitsBudget(modelBytes: number, memoryMb: number): boolean {
  // Leave room for the KV cache, compute buffers, executable and libraries.
  return modelBytes > 0 && modelBytes < (memoryMb - 180) * MB;
}
/**
 * Sum resident memory over the timeout wrapper and its descendants.
 * The timeout wrapper independently terminates llama.cpp even if VS Code
 * itself exits and our JavaScript watchdog is no longer running.
 */
async function processTreeRssMb(pid: number, visited = new Set<number>(), depth = 0): Promise<number> {
  if (!Number.isInteger(pid) || pid <= 0 || depth > 5 || visited.has(pid)) return 0;
  visited.add(pid);
  const root = '/proc/' + pid;
  const status = await fs.readFile(root + '/status', 'utf8').catch(() => '');
  const own = parseLinuxRssMb(status) ?? 0;
  const children = await fs.readFile(root + '/task/' + pid + '/children', 'utf8').catch(() => '');
  const ids = children.trim().split(/\s+/).filter(Boolean).slice(0,16);
  let total = own;
  for (const id of ids) {
    const child = Number(id);
    if (Number.isInteger(child)) total += await processTreeRssMb(child,visited,depth+1);
  }
  return total;
}

/**
 * Map common llama.cpp/OS failures into safe machine-readable codes.
 * Never send stderr or the generated prompt to the mobile or the relay.
 */
export function categorizeLocalAiProcessFailure(code: number | null, stderr: string): string {
  const diagnostic = stderr.toLowerCase().slice(-2000)
  if (code === 126 || code === 127) return 'ai_binary_unavailable'
  if (/unknown (?:argument|option)|unrecognized (?:argument|option)|invalid (?:argument|option)|unknown flag/.test(diagnostic)) {
    return 'ai_cli_option_unsupported'
  }
  if (/failed to (?:open|load) model|error loading model|invalid model|failed to read model/.test(diagnostic)) {
    return 'ai_model_load_failed'
  }
  if (/out of memory|cannot allocate memory|bad_alloc|allocation failed/.test(diagnostic)) {
    return 'ai_model_memory_error'
  }
  return 'local_inference_failed'
}

/**
 * Linux load average includes runnable tasks AND uninterruptible I/O waits.
 * It can stay high while CPUs are available, especially in WSL. Use actual
 * /proc/stat CPU time deltas instead of comparing load average with core count.
 */
export interface LinuxCpuTimes { total: number; idle: number }
export function parseLinuxCpuTimes(text: string): LinuxCpuTimes | null {
  const aggregate = text.split('\n').find(line => /^cpu\s/.test(line));
  if (!aggregate) return null;
  const columns = aggregate.trim().split(/\s+/).slice(1, 9).map(Number);
  if (columns.length !== 8 || columns.some(value => !Number.isFinite(value) || value < 0)) return null;
  // iowait is not CPU execution, so count it as idle for this admission guard.
  // Ignore the guest fields (included already in user/nice on Linux).
  return { total: columns.reduce((sum, value) => sum + value, 0), idle: columns[3]! + columns[4]! };
}
export function cpuUtilization(before: LinuxCpuTimes, after: LinuxCpuTimes): number | null {
  const elapsed = after.total - before.total;
  const idle = after.idle - before.idle;
  if (elapsed <= 0 || idle < 0 || idle > elapsed) return null;
  return (elapsed - idle) / elapsed;
}
async function readLinuxCpuTimes(): Promise<LinuxCpuTimes | null> {
  return parseLinuxCpuTimes(await fs.readFile('/proc/stat', 'utf8').catch(() => ''));
}
export async function sampleLinuxCpuUtilization(intervalMs = 250): Promise<number | null> {
  const before = await readLinuxCpuTimes();
  if (!before) return null;
  await new Promise<void>(resolve => setTimeout(resolve, intervalMs));
  const after = await readLinuxCpuTimes();
  return after ? cpuUtilization(before, after) : null;
}

export async function checkHostBudget(modelBytes: number, limits: AiResourceLimits): Promise<void> {
  if (process.platform !== 'linux') throw new Error('linux_host_required');
  if (!modelFitsBudget(modelBytes, limits.memoryMb)) throw new Error('model_exceeds_memory_budget');
  const contents = await fs.readFile('/proc/meminfo', 'utf8').catch(() => '');
  const available = parseLinuxMemoryAvailable(contents);
  if (available === null) throw new Error('host_memory_unknown');
  if (available < limits.memoryMb + limits.reserveMb) throw new Error('host_memory_busy');
  // Reject only sustained *measured CPU execution*, not elevated load
  // average from blocked I/O or tasks that ran earlier. Two short samples
  // avoid refusing an analysis because of a single brief build spike.
  // Priority nice +15 and the small thread budget still protect VS Code.
  const first = await sampleLinuxCpuUtilization(220);
  const second = await sampleLinuxCpuUtilization(220);
  if (first === null || second === null) throw new Error('host_cpu_unknown');
  if (first >= 0.92 && second >= 0.92) throw new Error('host_cpu_busy');
}

/**
 * Launch one CPU-low-priority process with a cross-window/cross-agent flock.
 * Deliberately no GPU flags beyond llama.cpp's "-ngl 0", supplied by caller.
 */
export async function runHostAiProcess(
  binary: string,
  args: string[],
  modelBytes: number,
  requested: Partial<AiResourceLimits> = {},
): Promise<AiRunResult> {
  const limits = boundedResources(requested);
  await checkHostBudget(modelBytes, limits);
  const lockDir = path.join(os.homedir(), '.cache', 'vibridge', 'ai');
  await fs.mkdir(lockDir, { recursive: true, mode: 0o700 });
  await fs.chmod(lockDir, 0o700);
  const lockFile = path.join(lockDir, 'inference.lock');
  const start = Date.now();
  return new Promise((resolve, reject) => {
    // 'timeout' is an independent Linux watchdog. It remains alive if the
    // extension host crashes, preventing indefinitely orphaned model loads.
    // flock -F does not fork: only the timeout wrapper and llama-cli remain.
    const child = spawn('timeout', [
      '-s','TERM','-k','2s',Math.ceil(limits.timeoutMs / 1000) + 's',
      'flock','-n','-E','75','-F',lockFile,
      'nice','-n','15',binary,...args,
    ], { stdio: ['ignore', 'pipe', 'pipe'], detached: true, windowsHide: true });
    let finished = false;
    let failure: string | null = null;
    let peakMb = 0;
    let output = '';
    let errorOutput = '';
    const killProcess = () => {
      if (!child.pid || finished) return;
      try { process.kill(-child.pid, 'SIGKILL'); }
      catch { child.kill('SIGKILL'); }
    };
    const timeout = setTimeout(() => {
      failure = 'interpreter_timeout';
      killProcess();
    }, limits.timeoutMs);
    const sample = setInterval(async () => {
      if (!child.pid || finished) return;
      try {
        const rss = await processTreeRssMb(child.pid);
        if (rss !== null) peakMb = Math.max(peakMb, rss);
        if (rss !== null && rss > limits.memoryMb) {
          failure = 'ai_memory_budget_exceeded';
          killProcess();
        }
      } catch { /* A process can exit between polling and the /proc read. */ }
    }, 180);
    const cleanup = () => {
      finished = true;
      clearTimeout(timeout);
      clearInterval(sample);
    };
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8');
      if (output.length > 240_000) {
        failure = 'ai_output_limit';
        killProcess();
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      // No stderr text is logged or transferred. It may contain prompts.
      errorOutput = (errorOutput + chunk.toString('utf8')).slice(-500);
    });
    child.once('error', () => {
      cleanup();
      reject(new Error('ai_host_tools_missing'));
    });
    child.once('close', code => {
      if (finished) return;
      cleanup();
      if (failure) { reject(new Error(failure)); return; }
      if (code === 75) { reject(new Error('interpreter_busy_other_agent')); return; }
      if (code === 124 || code === 137) { reject(new Error('interpreter_timeout')); return; }
      if (code !== 0) { reject(new Error(categorizeLocalAiProcessFailure(code, errorOutput))); return; }
      resolve({ stdout: output, peakMb, durationMs: Date.now() - start });
    });
  });
}
