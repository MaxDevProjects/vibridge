/**
 * DevBridge Agent — HTTP REST + WebSocket server
 */
import http from 'http';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket, RawData } from 'ws';
import { AuthService } from './auth';
import type { PushSubscription } from 'web-push';
import type { MessageQueue } from './queue';
import type { PushService } from './push';
import type { FileService } from './files';
import type { AdapterManager } from './adapters/manager';
import type { IpcServer } from './ipc';
import type { RelayClient } from './relay-client';
import type { CliRegistry } from './cliRegistry';

interface ServerDeps {
  PORT: number;
  queue: MessageQueue;
  push: PushService;
  files: FileService;
  adapters: AdapterManager;
  ipc: IpcServer;
  auth: AuthService;
  relay?: RelayClient | null;
  cliRegistry?: CliRegistry;
}

export function createServer(deps: ServerDeps) {
  const { queue, push, files, adapters, auth, relay } = deps;
  const cliRegistry = deps.cliRegistry;

  const app = express();
  app.use(cors({ origin: '*' }));
  app.use(express.json());

  // ── Auth middleware ─────────────────────────────────────────
  const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.replace('Bearer ', '') ?? '';
    if (!auth.verify(token)) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    next();
  };

  const routeTerminalMessage = (
    text: string,
    target?: string,
    sendEnter = true,
  ): { handled: boolean; resolvedTarget?: string } => {
    const normalizedTarget = String(target ?? '').trim();
    if (!normalizedTarget) return { handled: false };

    if (normalizedTarget === 'bash') {
      deps.ipc.sendToExtension({ type: 'inject_message', text, target: 'bash', sendEnter });
      return { handled: true, resolvedTarget: 'bash' };
    }

    const cli = cliRegistry?.getById(normalizedTarget);
    if (cli) {
      deps.ipc.sendToExtension({
        type: 'inject_message',
        text,
        target: cli.id,
        cliId: cli.id,
        terminalName: cliRegistry?.getTerminalName(cli.id) ?? `DevBridge ${cli.name}`,
        command: cli.command,
        args: cli.args,
        sendEnter,
      });
      return { handled: true, resolvedTarget: cli.id };
    }

    if (normalizedTarget.startsWith('terminal:')) {
      deps.ipc.sendToExtension({ type: 'inject_message', text, target: normalizedTarget, sendEnter });
      return { handled: true, resolvedTarget: normalizedTarget };
    }

    return { handled: false };
  };

  // ── Public endpoints ───────────────────────────────────────
  /** Lightweight health probe — no auth required */
  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  /** Pairing — exchange code verifier for JWT */
  app.post('/pair', (req: Request, res: Response) => {
    const { code } = req.body as { code: string };
    if (!auth.verifyPairCode(code)) {
      res.status(403).json({ error: 'invalid pairing code' });
      return;
    }
    const token = auth.issueToken();
    res.json({ token });
  });

  /** Read current pairing code for the local pairing screen / QR generation */
  app.get('/pairing-code', (_req, res) => {
    res.json({ code: auth.getPairCode(), relay: relay?.getState() ?? null });
  });

  /**
   * Returns the machine's actual LAN IP (never devbridge.local).
   * Used by the UI to build a fallback QR code when mDNS is blocked.
   */
  app.get('/local-ip', (_req, res) => {
    const agentHost = process.env.NUXT_PUBLIC_AGENT_HOST ?? process.env.AGENT_HOST ?? 'devbridge.local';
    const agentPort = deps.PORT;
    // Resolve actual LAN IP from network interfaces (same logic as mDNS)
    const os = require('os') as typeof import('os');
    let localIp = '127.0.0.1';
    for (const iface of Object.values(os.networkInterfaces())) {
      for (const addr of iface ?? []) {
        if (addr.family === 'IPv4' && !addr.internal) { localIp = addr.address; break; }
      }
      if (localIp !== '127.0.0.1') break;
    }
    res.json({
      ip: localIp,
      agentUrl: `http://${localIp}:${agentPort}`,
      mdnsName: agentHost,
    });
  });

  /**
   * Returns a pairing URL that contains a pre-issued short-lived JWT.
   * The nuxt-ui uses this URL to build a QR code so mobile users can
   * auto-connect without typing a 6-digit code.
   * The caller optionally passes ?uiHost=devbridge.local&uiPort=8080
   * to embed the nuxt-ui base URL for the redirect.
   */
  app.get('/pairing-url', (req: Request, res: Response) => {
    const token = auth.issueShortLivedToken(600); // 10-minute token
    const agentHost = process.env.NUXT_PUBLIC_AGENT_HOST ?? process.env.AGENT_HOST ?? 'devbridge.local';
    const agentPort = deps.PORT;
    const uiHost = String((req.query as Record<string, string>).uiHost ?? agentHost);
    const uiPort = String((req.query as Record<string, string>).uiPort ?? '8080');
    const agentUrl = `http://${agentHost}:${agentPort}`;
    const pairingUrl = `http://${uiHost}:${uiPort}/?view=mobile&agentUrl=${encodeURIComponent(agentUrl)}&token=${encodeURIComponent(token)}&workspace=${encodeURIComponent(deps.workspace.id)}`;
    res.json({ token, agentUrl, pairingUrl });
  });

  // ── Protected REST ─────────────────────────────────────────
  app.get('/status', requireAuth, (_req, res) => {
    res.json({
      ok: true,
      adapters: adapters.list(),
      activeAdapter: adapters.active(),
      ideState: deps.ipc.getIdeState(),
      previewUrl: adapters.getPreviewUrl() ?? deps.ipc.getPreviewUrl(),
      relay: relay?.getState() ?? null,
      timestamp: Date.now(),
    });
  });

  app.get('/files', requireAuth, (_req, res) => {
    res.json(files.tree());
  });

  app.get('/files/*', requireAuth, (req, res) => {
    const filePath = (req.params as Record<string, string>)[0] ?? '';
    const content = files.read(filePath);
    if (content === null) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    res.json({ path: filePath, content });
  });

  app.post('/message', requireAuth, (req, res) => {
    const { text, tool, target } = req.body as { text: string; tool?: string; target?: string };
    const routed = routeTerminalMessage(text, target, true);
    if (routed.handled) {
      res.json({ queued: true, target: routed.resolvedTarget });
      return;
    }
    adapters.send({ text, tool, target });
    res.json({ queued: true });
  });

  app.post('/terminal/send', requireAuth, (req, res) => {
    const { message, target, sendEnter } = req.body as { message?: string; target?: string; sendEnter?: boolean };
    const text = String(message ?? '').trim();
    if (!text) {
      res.status(400).json({ error: 'message required' });
      return;
    }
    const routed = routeTerminalMessage(text, target, sendEnter !== false);
    if (!routed.handled) {
      res.status(400).json({ error: 'unknown target' });
      return;
    }
    res.json({ ok: true, target: routed.resolvedTarget });
  });

  app.post('/action', requireAuth, async (req, res) => {
    const { action, args } = req.body as { action: string; args?: string[] };
    try {
      await adapters.runAction(action, args ?? []);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/preview-url', requireAuth, (_req, res) => {
    const url = adapters.getPreviewUrl() ?? deps.ipc.getPreviewUrl();
    res.json({ url });
  });

  // ── CLI Registry endpoints ─────────────────────────────────
  app.get('/clis', requireAuth, (_req, res) => {
    res.json({ clis: cliRegistry?.getAll() ?? [] });
  });

  app.post('/clis/detect', requireAuth, async (_req, res) => {
    if (!cliRegistry) { res.status(503).json({ error: 'no registry' }); return; }
    await cliRegistry.detectAll();
    res.json({ clis: cliRegistry.getAll() });
  });

  app.post('/clis/default', requireAuth, (req, res) => {
    const { id } = req.body as { id: string };
    if (!cliRegistry) { res.status(503).json({ error: 'no registry' }); return; }
    const ok = cliRegistry.setDefault(id);
    res.json({ ok, clis: cliRegistry.getAll() });
  });

  app.post('/clis/custom', requireAuth, (req, res) => {
    const { name, command, args } = req.body as { name: string; command: string; args?: string[] };
    if (!cliRegistry) { res.status(503).json({ error: 'no registry' }); return; }
    if (!name || !command) { res.status(400).json({ error: 'name and command required' }); return; }
    const cli = cliRegistry.addCustom({ name, command, args });
    res.json({ ok: true, cli, clis: cliRegistry.getAll() });
  });

  app.delete('/clis/:id', requireAuth, (req, res) => {
    const { id } = req.params as { id: string };
    if (!cliRegistry) { res.status(503).json({ error: 'no registry' }); return; }
    const ok = cliRegistry.removeCustom(id);
    res.json({ ok });
  });

  // ── Projects endpoints ─────────────────────────────────
  app.get('/projects', requireAuth, (_req, res) => {
    res.json({ projects: deps.ipc.getProjects(), parentDir: deps.ipc.getProjectsParentDir() });
  });

  app.post('/projects/open', requireAuth, (req, res) => {
    const { projectPath } = req.body as { projectPath?: string };
    if (!projectPath) { res.status(400).json({ error: 'projectPath required' }); return; }
    const parentDir = deps.ipc.getProjectsParentDir();
    // Security: path must be within parentDir and must be a known project
    if (parentDir && !projectPath.startsWith(parentDir + '/') && projectPath !== parentDir) {
      res.status(403).json({ error: 'Chemin non autorisé' }); return;
    }
    const known = deps.ipc.getProjects().some(p => p.path === projectPath);
    if (!known) { res.status(403).json({ error: 'Projet inconnu' }); return; }
    deps.ipc.sendToExtension({ type: 'open_project', projectPath });
    res.json({ ok: true });
  });

  /** Subscribe to Web Push — store endpoint/keys */
  app.post('/push/subscribe', requireAuth, (req, res) => {
    push.subscribe(req.body as PushSubscription);
    res.json({ ok: true });
  });

  // ── WebSocket ──────────────────────────────────────────────
  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws: WebSocket, req) => {
    const clientIp = req.socket.remoteAddress ?? 'unknown';
    const ts = () => new Date().toTimeString().slice(0, 8);
    // First message must be { type: 'auth', token }
    let authenticated = false;

    ws.on('message', (raw: RawData) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString()) as Record<string, unknown>;
      } catch {
        ws.close(1008, 'bad json');
        return;
      }

      if (!authenticated) {
        if (msg.type === 'auth') {
          if (auth.verify(msg.token as string)) {
            authenticated = true;
            ws.send(JSON.stringify({ type: 'auth_ok' }));
            console.log(`[${ts()}] [INFO] [WS] Mobile connected — ${clientIp}`);
          } else {
            console.log(`[${ts()}] [WARN] [WS] Auth rejected — ${clientIp}`);
            ws.send(JSON.stringify({ type: 'auth_fail', reason: 'invalid_token' }));
            ws.close(1008, 'invalid token');
          }
        }
        return;
      }

      // Route message to active adapter (or directly to VS Code for terminal targets)
      if (msg.type === 'message' || msg.type === 'chat') {
        const target = msg.target as string | undefined;
        const sendEnter = msg.sendEnter !== false;
        const routed = routeTerminalMessage(String(msg.text ?? ''), target, sendEnter);
        if (routed.handled) {
          return;
        }

        adapters.send({
          text: msg.text as string,
          tool: msg.tool as string | undefined,
          target,
        });
        return;
      }

      if (msg.type === 'adapter_toggle' && msg.id && msg.active) {
        try {
          adapters.setActive(msg.id as string);
          ws.send(JSON.stringify({ type: 'event', event: `active_adapter:${msg.id as string}` }));
        } catch (err) {
          ws.send(JSON.stringify({ type: 'event', event: String(err) }));
        }
        return;
      }

      if (msg.type === 'notif_response') {
        const action = msg.action === 'validate' ? 'approved' : 'rejected';
        const note = `Mobile user ${action} request ${String(msg.id ?? '')}`.trim();
        adapters.send({ text: note });
        ws.send(JSON.stringify({ type: 'event', event: note }));
        return;
      }

      if (msg.type === 'get_pairing_code') {
        ws.send(JSON.stringify({ type: 'pairing_code', code: auth.getPairCode() }));
        return;
      }

      if (msg.type === 'get_preview_url') {
        ws.send(JSON.stringify({ type: 'dev_server_url', url: adapters.getPreviewUrl() }));
      }

      if (msg.type === 'open_project') {
        deps.ipc.sendToExtension({ type: 'open_project' });
        return;
      }

      // PWA requests to launch a CLI terminal in VS Code
      if (msg.type === 'start_cli') {
        const cliId = String(msg.cliId ?? '');
        const cli = cliRegistry?.getById(cliId);
        if (!cli) {
          ws.send(JSON.stringify({ type: 'cli_error', cliId, reason: 'unknown_cli' }));
          return;
        }
        deps.ipc.sendToExtension({
          type: 'start_cli',
          cliId: cli.id,
          command: cli.command,
          args: cli.args,
          terminalName: `DevBridge ${cli.name}`,
        });
        return;
      }

      // PWA requests to kill a CLI terminal
      if (msg.type === 'kill_cli') {
        deps.ipc.sendToExtension({
          type: 'kill_cli',
          terminalName: String(msg.terminalName ?? ''),
        });
        return;
      }
    });

    // Forward adapter output to this WS client
    const off = queue.onOutput((payload) => {
      if (authenticated && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
      }
    });

    // Heartbeat — ping every 30s to keep NAT sessions alive
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.ping();
    }, 30_000);

    ws.on('close', off);
    ws.on('error', off);
    ws.on('close', () => {
      clearInterval(pingInterval);
      if (authenticated) {
        const t = () => new Date().toTimeString().slice(0, 8);
        console.log(`[${t()}] [INFO] [WS] Mobile disconnected — ${clientIp}`);
      }
    });
  });

  // Broadcast helper used by IPC
  (deps.ipc as unknown as { broadcast?: (d: unknown) => void }).broadcast = (data: unknown) => {
    const msg = JSON.stringify(data);
    wss.clients.forEach((c) => {
      if (c.readyState === WebSocket.OPEN) c.send(msg);
    });
  };

  return { app, httpServer, wss, auth };
}
