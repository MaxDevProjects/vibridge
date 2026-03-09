/**
 * DevBridge Agent — CLI Registry
 * Tracks which AI CLI tools are available on the host machine.
 * Detection is performed by the VS Code extension (which runs on the host)
 * and reported via IPC. The agent also tries detectAll() itself (works if
 * the agent runs directly on the host rather than in Docker).
 */
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

export interface CliDefinition {
  id: string;
  name: string;
  command: string;
  args: string[];
  checkCommand: string;
  detected: boolean;
  isDefault: boolean;
  isCustom: boolean;
}

interface PersistedConfig {
  defaultCliId: string | null;
  customClis: CliDefinition[];
}

const BUILTIN_SPECS: Omit<CliDefinition, 'detected' | 'isDefault' | 'isCustom'>[] = [
  { id: 'codex',       name: 'Codex CLI',          command: 'codex',      args: [],  checkCommand: 'codex --version'      },
  { id: 'claude-code', name: 'Claude Code',         command: 'claude',     args: [],  checkCommand: 'claude --version'     },
  { id: 'aider',       name: 'Aider',               command: 'aider',      args: [],  checkCommand: 'aider --version'      },
  { id: 'copilot',     name: 'GitHub Copilot CLI',  command: 'gh copilot', args: [],  checkCommand: 'gh copilot --version' },
];

export class CliRegistry {
  private clis = new Map<string, CliDefinition>();
  private configPath: string;
  /** Fired when the list changes, so callers can broadcast updates */
  onChange?: () => void;

  constructor(dataDir: string) {
    this.configPath = path.join(dataDir, 'agent.config.json');
    for (const spec of BUILTIN_SPECS) {
      this.clis.set(spec.id, { ...spec, detected: false, isDefault: false, isCustom: false });
    }
  }

  load(): void {
    try {
      if (!fs.existsSync(this.configPath)) return;
      const raw = fs.readFileSync(this.configPath, 'utf8');
      const config = JSON.parse(raw) as Partial<PersistedConfig>;

      if (config.defaultCliId) {
        const def = this.clis.get(config.defaultCliId);
        if (def) def.isDefault = true;
      }
      for (const custom of config.customClis ?? []) {
        if (!this.clis.has(custom.id)) {
          this.clis.set(custom.id, { ...custom, isCustom: true });
        }
      }
    } catch {
      // silent — missing / corrupt config is fine
    }
  }

  persist(): void {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const config: PersistedConfig = {
        defaultCliId: [...this.clis.values()].find(c => c.isDefault)?.id ?? null,
        customClis: [...this.clis.values()].filter(c => c.isCustom),
      };
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf8');
    } catch (e) {
      console.warn('[CliRegistry] persist failed:', e);
    }
  }

  /** Try to detect locally (only works when agent runs on the host, not in Docker) */
  async detectAll(): Promise<void> {
    await Promise.all([...this.clis.values()].map(async (cli) => {
      try {
        await execAsync(cli.checkCommand, { timeout: 5_000 });
        cli.detected = true;
      } catch {
        cli.detected = false;
      }
    }));
    this.onChange?.();
  }

  /**
   * Called when the VS Code extension reports which CLIs are available on the host.
   * This is more reliable than detectAll() in Docker setups.
   */
  applyExtensionReport(detectedIds: string[]): void {
    const detectedSet = new Set(detectedIds);
    for (const cli of this.clis.values()) {
      cli.detected = detectedSet.has(cli.id);
    }
    // If no default is set, pick the first detected one
    if (![...this.clis.values()].some(c => c.isDefault)) {
      const first = [...this.clis.values()].find(c => c.detected);
      if (first) first.isDefault = true;
    }
    this.onChange?.();
  }

  getAll(): CliDefinition[] {
    return [...this.clis.values()];
  }

  getDetected(): CliDefinition[] {
    return [...this.clis.values()].filter(c => c.detected);
  }

  getDefault(): CliDefinition | null {
    return (
      [...this.clis.values()].find(c => c.isDefault && c.detected) ??
      [...this.clis.values()].find(c => c.detected) ??
      null
    );
  }

  getById(id: string): CliDefinition | undefined {
    return this.clis.get(id);
  }

  setDefault(id: string): boolean {
    if (!this.clis.has(id)) return false;
    for (const cli of this.clis.values()) cli.isDefault = false;
    this.clis.get(id)!.isDefault = true;
    this.persist();
    return true;
  }

  addCustom(def: { name: string; command: string; args?: string[] }): CliDefinition {
    const id = `custom-${def.name.toLowerCase().replace(/\W+/g, '-')}-${Date.now()}`;
    const cli: CliDefinition = {
      id,
      name: def.name,
      command: def.command,
      args: def.args ?? [],
      checkCommand: def.command.split(' ')[0] ?? def.command,
      detected: false,
      isDefault: false,
      isCustom: true,
    };
    this.clis.set(id, cli);
    this.persist();
    return cli;
  }

  removeCustom(id: string): boolean {
    const cli = this.clis.get(id);
    if (!cli?.isCustom) return false;
    this.clis.delete(id);
    this.persist();
    return true;
  }
}
