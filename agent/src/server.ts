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
import type { WorkspaceIdentity } from './workspace';
import { listProjects } from './projects';

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
  workspace: WorkspaceIdentity;
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
    console.log('[DIAG][Agent][routeTerminalMessage]', {
      text,
      target,
      normalizedTarget,
      sendEnter,
    });
    if (!normalizedTarget) return { handled: false };

    if (normalizedTarget === 'bash') {
      console.log('[DIAG][Agent][routeTerminalMessage] -> inject bash');
      deps.ipc.sendToExtension({ type: 'inject_message', text, target: 'bash', sendEnter });
      return { handled: true, resolvedTarget: 'bash' };
    }

    if (normalizedTarget === 'chat:devbridge') {
      console.log('[DIAG][Agent][routeTerminalMessage] -> inject devbridge chat');
      deps.ipc.sendToExtension({ type: 'inject_message', text, target: 'chat:devbridge', sendEnter: false });
      return { handled: true, resolvedTarget: 'chat:devbridge' };
    }

    const cli = cliRegistry?.getById(normalizedTarget);
    if (cli) {
      console.log('[DIAG][Agent][routeTerminalMessage] -> inject cli', {
        cliId: cli.id,
        terminalName: cliRegistry?.getTerminalName(cli.id) ?? `DevBridge ${cli.name}`,
      });
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
      console.log('[DIAG][Agent][routeTerminalMessage] -> inject terminal target');
      deps.ipc.sendToExtension({ type: 'inject_message', text, target: normalizedTarget, sendEnter });
      return { handled: true, resolvedTarget: normalizedTarget };
    }

    console.log('[DIAG][Agent][routeTerminalMessage] -> not handled');
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

  app.get('/workspace', (_req, res) => {
    res.json({
      id: deps.workspace.id,
      name: deps.workspace.name,
      path: deps.workspace.path,
    });
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
   * Returns a pairing URL that contains a pre-issued persistent JWT.
   * In public/HTTPS mode the QR must not embed a local agentUrl because
   * the phone cannot reach it directly from outside the LAN.
   */
  app.get('/pairing-url', (req: Request, res: Response) => {
    const token = auth.issueShortLivedToken(600);
    const agentHost = process.env.NUXT_PUBLIC_AGENT_HOST ?? process.env.AGENT_HOST ?? 'devbridge.local';
    const agentPort = deps.PORT;
    const uiHost = String((req.query as Record<string, string>).uiHost ?? agentHost).trim();
    const uiPort = String((req.query as Record<string, string>).uiPort ?? '8080').trim();
    const publicUiUrl = (process.env.UI_PUBLIC_URL ?? process.env.NUXT_PUBLIC_UI_URL ?? '').trim().replace(/\/$/, '');
    const uiBase = publicUiUrl || `http://${uiHost}:${uiPort}`;
    const useDirectAgentUrl = !/^https:/i.test(uiBase);
    const agentUrl = `http://${agentHost}:${agentPort}`;
    const pairingUrl = new URL(`${uiBase}/`);
    pairingUrl.searchParams.set('token', token);
    pairingUrl.searchParams.set('workspace', deps.workspace.id);
    if (useDirectAgentUrl) {
      pairingUrl.searchParams.set('agentUrl', agentUrl);
    }
    res.json({
      token,
      workspace: deps.workspace.id,
      agentUrl: useDirectAgentUrl ? agentUrl : undefined,
      pairingUrl: pairingUrl.toString(),
    });
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
    res.json(listProjects(deps.workspace.path));
  });

  app.post('/projects/open', requireAuth, (req, res) => {
    const { projectPath, newWindow } = req.body as { projectPath?: string; newWindow?: boolean };
    if (!projectPath) { res.status(400).json({ error: 'projectPath required' }); return; }
    const listing = listProjects(deps.workspace.path);
    const parentDir = listing.parentDir;
    // Security: path must be within parentDir and must be a known project
    if (parentDir && !projectPath.startsWith(parentDir + '/') && projectPath !== parentDir) {
      res.status(403).json({ error: 'Chemin non autorisé' }); return;
    }
    const known = listing.projects.some(p => p.path === projectPath);
    if (!known) { res.status(403).json({ error: 'Projet inconnu' }); return; }
    deps.ipc.sendToExtension({ type: 'open_project', projectPath, newWindow });
    res.json({ ok: true });
  });

  /** Public VAPID key for browser PushManager subscription */
  app.get('/push/public-key', requireAuth, (_req, res) => {
    res.json({ publicKey: push.getPublicKey() });
  });

  /** Subscribe to Web Push — store endpoint/keys */
  app.post('/push/subscribe', requireAuth, (req, res) => {
    push.subscribe(req.body as PushSubscription);
    res.json({ ok: true });
  });

  /** Unsubscribe from Web Push */
  app.post('/push/unsubscribe', requireAuth, (req, res) => {
    const endpoint = String((req.body as { endpoint?: string })?.endpoint ?? '').trim();
    if (!endpoint) {
      res.status(400).json({ error: 'endpoint required' });
      return;
    }
    push.unsubscribe(endpoint);
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
        console.log('[DIAG][Agent][ws message]', {
          type: msg.type,
          text: String(msg.text ?? ''),
          target,
          sendEnter,
        });
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
        deps.ipc.sendToExtension({
          type: 'open_project',
          projectPath: typeof msg.path === 'string' ? msg.path : undefined,
          newWindow: msg.newWindow === true,
        });
        return;
      }

      if (msg.type === 'list_projects') {
        const listing = listProjects(deps.workspace.path);
        ws.send(JSON.stringify({ type: 'projects_list', projects: listing.projects, parentDir: listing.parentDir }));
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

      // PWA requests to create a plain terminal in VS Code
      if (msg.type === 'create_terminal') {
        const terminalName = String(msg.terminalName ?? '').trim() || 'DevBridge 1';
        deps.ipc.sendToExtension({
          type: 'create_terminal',
          terminalName,
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
