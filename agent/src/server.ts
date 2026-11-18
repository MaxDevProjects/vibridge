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
import { routeTerminalMessage } from './terminal-routing';
import { listProjects } from './projects';
import { ControlPolicy } from './control-policy';

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
  controlPolicy?: ControlPolicy;
}

export function createServer(deps: ServerDeps) {
  const { queue, push, files, adapters, auth, relay } = deps;
  const cliRegistry = deps.cliRegistry;
  const controlPolicy = deps.controlPolicy ?? new ControlPolicy();
  const controlOnly = (action: string) => (req: Request, res: Response, next: NextFunction) => {
    const decision = controlPolicy.authorize(action, req.body ?? {});
    if (!decision.allowed) { res.status(403).json({ error: decision.reason }); return; }
    next();
  };

  const app = express();
  app.use(cors({ origin: '*' }));
  app.use(express.json());
  app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // ── Auth middleware ─────────────────────────────────────────
  const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    const token = /^Bearer (\S+)$/i.exec(req.headers.authorization ?? '')?.[1] ?? '';
    if (!auth.verify(token)) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    next();
  };

  // ── Public endpoints ───────────────────────────────────────
  /** Lightweight health probe — no auth required */
  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  /** Pairing — exchange code verifier for JWT */
  app.post('/pair', (req: Request, res: Response) => {
    const { code, qrToken } = req.body as { code?: unknown; qrToken?: unknown };
    const valid = typeof qrToken === 'string' ? auth.consumeQrToken(qrToken)
      : typeof code === 'string' && auth.verifyPairCode(code);
    if (!valid) {
      res.status(403).json({ error: 'invalid pairing code' });
      return;
    }
    const token = auth.issueToken();
    res.json({ token });
  });

  /** Read current pairing code for the local pairing screen / QR generation */
  app.get('/pairing-code', requireAuth, (_req, res) => {
    res.json({ code: auth.getPairCode(), relay: relay?.getState() ?? null });
  });

  app.get('/workspace', requireAuth, (_req, res) => {
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
  app.get('/pairing-url', requireAuth, (req: Request, res: Response) => {
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
      control: controlPolicy.describe(),
      ideState: deps.ipc.getIdeState(),
      windows: deps.ipc.getWindows(),
      focusedWindowId: deps.ipc.getFocusedWindowId(),
      previewUrl: adapters.getPreviewUrl() ?? deps.ipc.getPreviewUrl(),
      relay: relay?.getState() ?? null,
      timestamp: Date.now(),
    });
  });

  app.get('/files', requireAuth, (_req, res) => {
    const ideState = deps.ipc.getIdeState();
    const workspaceFolders = Array.isArray(ideState?.workspaceFolders) ? ideState.workspaceFolders as string[] : [];
    const firstFolder = workspaceFolders.length ? String(workspaceFolders[0] ?? '') : '';
    res.json(firstFolder ? files.treeFrom(firstFolder) : files.tree());
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

  app.post('/message', requireAuth, controlOnly('message'), (req, res) => {
    const { text, tool, target, windowId } = req.body as { text: string; tool?: string; target?: string; windowId?: string };
    const windows = deps.ipc.getWindows().filter(window => window.connected)
    if (!windows.length || (windowId
      ? !windows.some(window => window.id === windowId) : windows.length !== 1)) {
      res.status(409).json({ error: 'window unavailable or ambiguous' }); return;
    }
    const routed = routeTerminalMessage(deps.ipc, cliRegistry, text, target, true, undefined, windowId);
    if (routed) {
      res.status(routed.queued ? 200 : 503).json({ queued: routed.queued, target: routed.target });
      return;
    }
    const queued = adapters.send({ text, tool, target });
    res.status(queued ? 200 : 503).json({ queued });
  });

  app.post('/terminal/send', requireAuth, controlOnly('message'), (req, res) => {
    const { message, target, sendEnter, windowId } = req.body as { message?: string; target?: string; sendEnter?: boolean; windowId?: string };
    const text = String(message ?? '').trim();
    if (!text) {
      res.status(400).json({ error: 'message required' });
      return;
    }
    const windows = deps.ipc.getWindows().filter(window => window.connected)
    if (!windows.length || (windowId
      ? !windows.some(window => window.id === windowId) : windows.length !== 1)) {
      res.status(409).json({ error: 'window unavailable or ambiguous' }); return;
    }
    const routed = routeTerminalMessage(deps.ipc, cliRegistry, text, target, sendEnter !== false, undefined, windowId);
    if (!routed) {
      res.status(400).json({ error: 'unknown target' });
      return;
    }
    res.status(routed.queued ? 200 : 503).json({ ok: routed.queued, target: routed.target });
  });

  app.post('/action', requireAuth, controlOnly('action'), async (req, res) => {
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

  app.post('/clis/default', requireAuth, controlOnly('configure_cli'), (req, res) => {
    const { id } = req.body as { id: string };
    if (!cliRegistry) { res.status(503).json({ error: 'no registry' }); return; }
    const ok = cliRegistry.setDefault(id);
    res.json({ ok, clis: cliRegistry.getAll() });
  });

  app.post('/clis/custom', requireAuth, controlOnly('configure_cli'), (req, res) => {
    const { name, command, args } = req.body as { name: string; command: string; args?: string[] };
    if (!cliRegistry) { res.status(503).json({ error: 'no registry' }); return; }
    if (!name || !command) { res.status(400).json({ error: 'name and command required' }); return; }
    const cli = cliRegistry.addCustom({ name, command, args });
    res.json({ ok: true, cli, clis: cliRegistry.getAll() });
  });

  app.delete('/clis/:id', requireAuth, controlOnly('configure_cli'), (req, res) => {
    const { id } = req.params as { id: string };
    if (!cliRegistry) { res.status(503).json({ error: 'no registry' }); return; }
    const ok = cliRegistry.removeCustom(id);
    res.json({ ok });
  });

  // ── Projects endpoints ─────────────────────────────────
  app.get('/projects', requireAuth, (_req, res) => {
    res.json(listProjects(deps.workspace.path));
  });

  app.post('/projects/open', requireAuth, controlOnly('open_project'), (req, res) => {
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
    const windowId = typeof req.body?.windowId === 'string' ? req.body.windowId : undefined;
    const queued = deps.ipc.sendToExtension({ type: 'open_project', projectPath, newWindow, windowId });
    res.status(queued ? 200 : 409).json({ ok: queued, error: queued ? undefined : 'window unavailable or ambiguous' });
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
  const wss = new WebSocketServer({ server: httpServer, path: '/ws', maxPayload: 4 * 1024 * 1024 });
  const authenticatedSockets = new Map<WebSocket, string>();

  wss.on('connection', (ws: WebSocket, req) => {
    const clientIp = req.socket.remoteAddress ?? 'unknown';
    const ts = () => new Date().toTimeString().slice(0, 8);
    // First message must be { type: 'auth', token }
    let credential: string | null = null;
    const deadline = setTimeout(() => ws.close(4401, 'authentication timeout'), 5_000);
    ws.on('error', () => ws.terminate());

    ws.on('message', (raw: RawData) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString()) as Record<string, unknown>;
      } catch {
        ws.close(1008, 'bad json');
        return;
      }

      if (!msg || typeof msg !== 'object' || Array.isArray(msg) || typeof msg.type !== 'string') {
        ws.close(1008, 'invalid message');
        return;
      }

      if (!credential) {
        if (msg.type === 'auth') {
          if (typeof msg.token === 'string' && auth.verify(msg.token)) {
            clearTimeout(deadline);
            credential = msg.token;
            authenticatedSockets.set(ws, credential);
            ws.send(JSON.stringify({ type: 'auth_ok' }));
            console.log(`[${ts()}] [INFO] [WS] Mobile connected — ${clientIp}`);
          } else {
            console.log(`[${ts()}] [WARN] [WS] Auth rejected — ${clientIp}`);
            ws.send(JSON.stringify({ type: 'auth_fail', reason: 'invalid_token' }));
            ws.close(4401, 'invalid token');
          }
        }
        return;
      }

      if (!auth.verify(credential)) {
        ws.close(4401, 'token expired');
        return;
      }

      const decision = controlPolicy.authorize(msg.type, msg);
      if (!decision.allowed) {
        ws.send(JSON.stringify({ type: 'action_rejected', action: msg.type, reason: decision.reason }));
        if (typeof msg.request_id === 'string') ws.send(JSON.stringify({ type: 'message_ack', request_id: msg.request_id, status: 'rejected', reason: decision.reason }));
        return;
      }

      const windowId = typeof msg.windowId === 'string' ? msg.windowId : undefined;
      const windows = deps.ipc.getWindows().filter(window => window.connected)
      const scoped = ['message', 'chat', 'notif_response', 'open_project',
        'start_cli', 'create_terminal', 'focus_terminal', 'kill_cli']
      if (scoped.includes(String(msg.type))
        && (!windows.length || (windowId
          ? !windows.some(window => window.id === windowId)
          : windows.length !== 1))) {
        ws.send(JSON.stringify({ type: 'action_rejected', action: msg.type, reason: 'window_unavailable_or_ambiguous' }))
        if (typeof msg.request_id === 'string') ws.send(JSON.stringify({
          type: 'message_ack', request_id: msg.request_id, status: 'rejected', reason: 'window_unavailable_or_ambiguous',
        }))
        return
      }

      // Route message to active adapter (or directly to VS Code for terminal targets)
      if (msg.type === 'message' || msg.type === 'chat') {
        const target = typeof msg.target === 'string' ? msg.target : undefined;
        const sendEnter = msg.sendEnter !== false;
        const text = typeof msg.text === 'string' ? msg.text : '';
        const tool = typeof msg.tool === 'string' ? msg.tool : undefined;
        const routed = routeTerminalMessage(deps.ipc, cliRegistry, text, target, sendEnter,
          typeof msg.request_id === 'string' ? msg.request_id : undefined, windowId);
        const queued = routed?.queued ?? adapters.send({ text, tool, target });
        if (typeof msg.request_id === 'string') {
          ws.send(JSON.stringify({
            type: 'message_ack',
            request_id: msg.request_id,
            status: queued ? 'received' : 'rejected',
            reason: queued ? undefined : 'agent_rejected',
          }));
        }
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
          windowId,
        });
        return;
      }

      if (msg.type === 'list_projects') {
        const projects = deps.ipc.getProjects(windowId);
        const listing = projects.length
          ? { projects, parentDir: deps.ipc.getProjectsParentDir(windowId) }
          : listProjects(deps.workspace.path);
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
          windowId,
        });
        return;
      }

      // PWA requests to create a plain terminal in VS Code
      if (msg.type === 'create_terminal') {
        const terminalName = String(msg.terminalName ?? '').trim() || 'DevBridge 1';
        deps.ipc.sendToExtension({
          type: 'create_terminal',
          terminalName,
          windowId,
        });
        return;
      }

      // PWA requests to focus an existing terminal in VS Code
      if (msg.type === 'focus_terminal') {
        deps.ipc.sendToExtension({
          type: 'focus_terminal',
          terminalName: String(msg.terminalName ?? ''),
          terminalId: msg.terminalId,
          windowId,
        });
        return;
      }

      // PWA requests to kill a CLI terminal
      if (msg.type === 'kill_cli') {
        deps.ipc.sendToExtension({
          type: 'kill_cli',
          terminalName: String(msg.terminalName ?? ''),
          terminalId: msg.terminalId,
          windowId,
        });
        return;
      }
    });

    // Forward adapter output to this WS client
    const off = queue.onOutput((payload) => {
      if (credential && auth.verify(credential) && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
      }
    });

    // Heartbeat — ping every 30s to keep NAT sessions alive
    let alive = true;
    ws.on('pong', () => { alive = true; });
    const pingInterval = setInterval(() => {
      if (!alive) {
        ws.terminate();
        return;
      }
      if (credential && !auth.verify(credential)) {
        ws.close(4401, 'token expired');
        return;
      }
      if (ws.readyState === WebSocket.OPEN) {
        alive = false;
        ws.ping();
      }
    }, 20_000);

    ws.on('close', off);
    ws.on('error', off);
    ws.on('close', () => {
      clearInterval(pingInterval);
      clearTimeout(deadline);
      authenticatedSockets.delete(ws);
      if (credential) {
        const t = () => new Date().toTimeString().slice(0, 8);
        console.log(`[${t()}] [INFO] [WS] Mobile disconnected — ${clientIp}`);
      }
    });
  });

  // Broadcast helper used by IPC
  (deps.ipc as unknown as { broadcast?: (d: unknown) => void }).broadcast = (data: unknown) => {
    const msg = JSON.stringify(data);
    authenticatedSockets.forEach((token, client) => {
      if (client.readyState === WebSocket.OPEN && auth.verify(token)) client.send(msg);
    });
  };

  return { app, httpServer, wss, auth };
}
