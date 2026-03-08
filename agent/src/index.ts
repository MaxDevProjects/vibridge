/**
 * DevBridge Agent — entry point
 */
import { createServer } from './server';
import { IpcServer } from './ipc';
import { AdapterManager } from './adapters/manager';
import { MdnsAdvertiser } from './transport/mdns';
import { PushService } from './push';
import { FileService } from './files';
import { MessageQueue } from './queue';
import { AuthService } from './auth';
import { RelayClient } from './relay-client';

const PORT = parseInt(process.env.AGENT_PORT ?? '3333', 10);
const IPC_SOCK = process.env.IPC_SOCK_PATH ?? '/tmp/devbridge/ipc.sock';
const IPC_TCP  = process.env.IPC_TCP_PORT ? parseInt(process.env.IPC_TCP_PORT, 10) : undefined;
const RELAY_INTERNAL_URL = (process.env.RELAY_INTERNAL_URL ?? '').trim();
const RELAY_PUBLIC_URL = (process.env.RELAY_PUBLIC_URL ?? '').trim();
const PROJECT_ROOT = process.env.PROJECT_ROOT ?? '/workspace';

async function main() {
  console.log(`[DevBridge Agent] Starting on port ${PORT}…`);

  const queue = new MessageQueue();
  const auth = new AuthService();
  const push = new PushService();
  const files = new FileService(PROJECT_ROOT);
  const adapters = new AdapterManager(queue);
  const ipc = new IpcServer(IPC_SOCK, adapters, queue, push, auth);
  const relay = RELAY_INTERNAL_URL && RELAY_PUBLIC_URL
    ? new RelayClient({
        internalUrl: RELAY_INTERNAL_URL,
        publicUrl: RELAY_PUBLIC_URL,
        sessionLabel: `DevBridge on ${process.env.HOSTNAME ?? 'local-agent'}`,
        workspaceFolders: [PROJECT_ROOT],
        adapters,
        files,
        ipc,
        queue,
      })
    : null;

  const { httpServer } = createServer({ PORT, queue, push, files, adapters, ipc, auth, relay });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[DevBridge Agent] HTTP + WS listening on :${PORT}`);
  });

  // Advertise via mDNS so the PWA can auto-discover
  const mdns = new MdnsAdvertiser('devbridge', PORT);
  mdns.start();

  // Start IPC Unix socket (+ optional TCP)
  await ipc.listen(IPC_TCP);
  if (IPC_TCP) console.log(`[DevBridge Agent] IPC TCP port: ${IPC_TCP}`);
  if (relay) {
    ipc.forward = (type, payload) => relay.send(type, payload);
    await relay.start();
    console.log(`[DevBridge Agent] Relay enabled via ${RELAY_PUBLIC_URL}`);
  }

  const shutdown = (sig: string) => {
    console.log(`[DevBridge Agent] ${sig} — shutting down`);
    mdns.stop();
    ipc.close();
    relay?.stop();
    httpServer.close(() => process.exit(0));
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[DevBridge Agent] Fatal:', err);
  process.exit(1);
});
