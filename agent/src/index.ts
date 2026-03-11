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
import { CliRegistry } from './cliRegistry';
import { resolveWorkspaceIdentity } from './workspace';

const PORT = parseInt(process.env.AGENT_PORT ?? '3333', 10);
const IPC_SOCK = process.env.IPC_SOCK_PATH ?? '/tmp/devbridge/ipc.sock';
const IPC_TCP  = process.env.IPC_TCP_PORT ? parseInt(process.env.IPC_TCP_PORT, 10) : undefined;
const RELAY_INTERNAL_URL = (process.env.RELAY_INTERNAL_URL ?? '').trim();
const RELAY_PUBLIC_URL = (process.env.RELAY_PUBLIC_URL ?? '').trim();
const PROJECT_ROOT = process.env.PROJECT_ROOT ?? '/workspace';
const DATA_DIR = process.env.DATA_DIR ?? require('path').dirname(IPC_SOCK);

async function main() {
  console.log(`[DevBridge Agent] Starting on port ${PORT}…`);
  const workspace = resolveWorkspaceIdentity();
  console.log(`[DevBridge Agent] Workspace: ${workspace.id} (${workspace.path})`);

  const queue = new MessageQueue();
  const auth = new AuthService();
  const push = new PushService();
  const files = new FileService(PROJECT_ROOT);
  const adapters = new AdapterManager(queue);
  const cliRegistry = new CliRegistry(DATA_DIR);
  cliRegistry.load();
  const ipc = new IpcServer(IPC_SOCK, adapters, queue, push, auth, cliRegistry);
  const relay = RELAY_INTERNAL_URL && RELAY_PUBLIC_URL
    ? new RelayClient({
        internalUrl: RELAY_INTERNAL_URL,
        publicUrl: RELAY_PUBLIC_URL,
        sessionLabel: `DevBridge on ${process.env.HOSTNAME ?? 'local-agent'}`,
        workspaceFolders: [PROJECT_ROOT],
        workspace,
        adapters,
        files,
        ipc,
        queue,
      })
    : null;

  const { httpServer } = createServer({ PORT, queue, push, files, adapters, ipc, auth, relay, cliRegistry, workspace });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[DevBridge Agent] HTTP + WS listening on :${PORT}`);
  });

  // Advertise via mDNS so the PWA can auto-discover
  const mdns = new MdnsAdvertiser('devbridge', PORT);
  mdns.start();

  // Start IPC Unix socket (+ optional TCP)
  await ipc.listen(IPC_TCP);
  if (IPC_TCP) console.log(`[DevBridge Agent] IPC TCP port: ${IPC_TCP}`);

  // Broadcast CLI list when registry changes
  cliRegistry.onChange = () => {
    const clis = cliRegistry.getAll();
    (ipc as unknown as { broadcast?: (d: unknown) => void }).broadcast?.({ type: 'clis_update', clis });
  };

  // Best-effort local detection (only meaningful when not in Docker)
  cliRegistry.detectAll().catch(() => {/* silent */});
  if (relay) {
    ipc.forward = (type, payload) => relay.send(type, payload);
    // Non-fatal: if the relay server is unreachable at startup, the agent
    // keeps running locally and the relay client will retry in background.
    relay.start().then(() => {
      ipc.setRelayQrUrl(relay.getState()?.qrUrl ?? null);
      if (relay.getState()?.sessionId) {
        console.log(`[DevBridge Agent] Relay enabled via ${RELAY_PUBLIC_URL}`);
      } else {
        console.warn(`[DevBridge Agent] Relay not yet connected — retrying in background`);
      }
    }).catch((err: unknown) => {
      console.warn(`[DevBridge Agent] Relay startup error (non-fatal):`, err);
    });
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
