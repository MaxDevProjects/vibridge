/**
 * DevBridge Agent — mDNS advertiser (pure JS via multicast-dns)
 * Advertises _devbridge._tcp so the PWA can auto-discover the agent
 * on the local network without knowing the PC's IP address.
 */
import os from 'os';

interface MdnsInstance {
  on(event: string, fn: (query: unknown) => void): void;
  respond(response: unknown): void;
  destroy(): void;
}

let mdns: MdnsInstance | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  mdns = (require('multicast-dns') as () => MdnsInstance)();
} catch {
  console.warn('[mDNS] multicast-dns unavailable — auto-discovery disabled');
}

function getLocalIp(): string {
  const configured = process.env.AGENT_HOST?.trim();
  if (configured) return configured;

  const ifaces = os.networkInterfaces();
  for (const iface of Object.values(ifaces)) {
    for (const addr of iface ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address;
    }
  }
  return '127.0.0.1';
}

export class MdnsAdvertiser {
  private localIp = getLocalIp();

  constructor(
    private name: string,
    private port: number
  ) {}

  start(): void {
    if (!mdns) {
      console.warn(`[mDNS] Disabled — fallback IP: ${this.localIp}:${this.port}`);
      return;
    }

    mdns.on('query', (query: unknown) => {
      const q = query as { questions?: Array<{ name?: string; type?: string }> };
      const asks = q.questions?.some(
        (qu) =>
          qu.name === `${this.name}.local` ||
          qu.name?.includes('_devbridge') ||
          qu.name?.includes(`${this.name}.local`)
      );
      if (!asks) return;

      mdns!.respond({
        answers: [
          {
            name: `${this.name}.local`,
            type: 'A',
            ttl: 300,
            data: this.localIp,
          },
          {
            name: `${this.name}._devbridge._tcp.local`,
            type: 'SRV',
            data: { port: this.port, target: `${this.name}.local`, weight: 0, priority: 10 },
          },
          {
            name: `_devbridge._tcp.local`,
            type: 'PTR',
            data: `${this.name}._devbridge._tcp.local`,
          },
        ],
      });
    });

    const ts = () => new Date().toTimeString().slice(0, 8);
    console.log(`[${ts()}] [INFO] [mDNS] Advertising ${this.name}.local (${this.localIp}) → :${this.port}`);
    console.log(`[${ts()}] [INFO] [mDNS] Fallback URL: http://${this.localIp}:${this.port}`);
  }

  stop(): void {
    try {
      mdns?.destroy();
    } catch {
      // ignore
    }
  }
}
