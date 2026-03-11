import { readonly, ref } from 'vue';

const status = ref("disconnected");
const mode = ref("local");
const agentStatus = ref(null);
const token = ref(null);
const authError = ref(null);
const relaySessionId = ref("");
const relayUrl = ref("");
const activeUrl = ref("");
const latencyMs = ref(null);
const listeners = /* @__PURE__ */ new Set();
let ws = null;
let _baseUrl = "";
function normalizeBaseUrl(value) {
  const trimmed = value.trim();
  return trimmed.replace(/\/+$/, "");
}
function inferRelayUrl() {
  return "";
}
function storageSet(nextMode, nextBaseUrl, nextToken, nextSessionId = "") {
  localStorage.setItem("vb:bridgeMode", nextMode);
  localStorage.setItem("vb:token", nextToken);
  if (nextMode === "relay") {
    localStorage.setItem("vb:relayUrl", nextBaseUrl);
    localStorage.setItem("vb:relaySessionId", nextSessionId);
  } else {
    localStorage.setItem("vb:agentUrl", nextBaseUrl);
  }
}
function clearStoredSession() {
  return;
}
function normalizeIncoming(msg) {
  if (msg.source && msg.sessionId && typeof msg.type === "string") {
    const payload = typeof msg.payload === "object" && msg.payload ? msg.payload : {};
    return {
      ...payload,
      ...msg,
      type: String(msg.type),
      text: typeof msg.text === "string" ? msg.text : typeof payload.text === "string" ? payload.text : void 0,
      tool: typeof msg.tool === "string" ? msg.tool : typeof payload.tool === "string" ? payload.tool : void 0,
      target: typeof msg.target === "string" ? msg.target : typeof payload.target === "string" ? payload.target : void 0
    };
  }
  return msg;
}
function applyStatusSnapshot(snapshot) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m;
  agentStatus.value = {
    ok: true,
    adapters: Array.isArray(snapshot.adapters) ? snapshot.adapters : (_b = (_a = agentStatus.value) == null ? void 0 : _a.adapters) != null ? _b : [],
    activeAdapter: typeof snapshot.activeAdapter === "string" || snapshot.activeAdapter === null ? snapshot.activeAdapter : (_d = (_c = agentStatus.value) == null ? void 0 : _c.activeAdapter) != null ? _d : null,
    ideState: (_g = (_f = snapshot.ideState) != null ? _f : (_e = agentStatus.value) == null ? void 0 : _e.ideState) != null ? _g : null,
    previewUrl: (_j = (_i = snapshot.previewUrl) != null ? _i : (_h = agentStatus.value) == null ? void 0 : _h.previewUrl) != null ? _j : null,
    relay: (_m = (_l = snapshot.relay) != null ? _l : (_k = agentStatus.value) == null ? void 0 : _k.relay) != null ? _m : null,
    timestamp: typeof snapshot.timestamp === "number" ? snapshot.timestamp : Date.now()
  };
}
function emit(msg) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
  const normalized = normalizeIncoming(msg);
  if (normalized.type === "status_snapshot") {
    const payload = typeof normalized.payload === "object" && normalized.payload ? normalized.payload : normalized;
    applyStatusSnapshot(payload);
  }
  if (normalized.type === "peer_status") {
    agentStatus.value = {
      ok: true,
      adapters: (_b = (_a = agentStatus.value) == null ? void 0 : _a.adapters) != null ? _b : [],
      activeAdapter: (_d = (_c = agentStatus.value) == null ? void 0 : _c.activeAdapter) != null ? _d : null,
      ideState: (_f = (_e = agentStatus.value) == null ? void 0 : _e.ideState) != null ? _f : null,
      previewUrl: (_h = (_g = agentStatus.value) == null ? void 0 : _g.previewUrl) != null ? _h : null,
      relay: {
        ...(_j = (_i = agentStatus.value) == null ? void 0 : _i.relay) != null ? _j : {
          enabled: true,
          relayUrl: relayUrl.value,
          sessionId: relaySessionId.value,
          pairingCode: "",
          qrUrl: "",
          agentToken: "",
          expiresAt: 0,
          status: "waiting",
          connected: true,
          lastError: null
        },
        agentConnected: Boolean(normalized.agentConnected),
        mobileConnected: Boolean(normalized.mobileConnected)
      },
      timestamp: Date.now()
    };
  }
  if (normalized.type === "relay_session") {
    const payload = typeof normalized.payload === "object" && normalized.payload ? normalized.payload : null;
    if (payload) {
      applyStatusSnapshot({ relay: payload, timestamp: Date.now() });
    }
  }
  listeners.forEach((fn) => fn(normalized));
}
async function connect() {
  return;
}
function disconnect() {
  ws == null ? void 0 : ws.close();
  ws = null;
  status.value = "disconnected";
}
function send(data) {
  if ((ws == null ? void 0 : ws.readyState) === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}
async function fetchRelayStatus() {
  var _a, _b, _c, _d;
  if (!relaySessionId.value || !token.value) return;
  try {
    const res = await fetch(`${inferRelayUrl()}/api/relay/sessions/${relaySessionId.value}`, {
      headers: { Authorization: `Bearer ${token.value}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    applyStatusSnapshot({
      ok: true,
      ideState: (_b = (_a = agentStatus.value) == null ? void 0 : _a.ideState) != null ? _b : {
        workspaceFolders: data.workspaceFolders
      },
      relay: {
        ...(_d = (_c = agentStatus.value) == null ? void 0 : _c.relay) != null ? _d : {
          enabled: true,
          relayUrl: inferRelayUrl(),
          sessionId: data.id,
          pairingCode: "",
          qrUrl: "",
          agentToken: "",
          expiresAt: data.expiresAt,
          connected: status.value === "connected",
          lastError: null
        },
        status: data.status,
        agentConnected: data.agentConnected,
        mobileConnected: data.mobileConnected
      },
      timestamp: Date.now()
    });
    for (const entry of data.history) emit(entry);
  } catch {
  }
}
async function fetchLocalStatus() {
  try {
    const res = await fetch(`${_baseUrl}/status`, {
      headers: { Authorization: `Bearer ${token.value}` }
    });
    if (!res.ok) return;
    agentStatus.value = await res.json();
  } catch {
  }
}
async function fetchAgentStatus() {
  if (mode.value === "relay") {
    await fetchRelayStatus();
    return;
  }
  await fetchLocalStatus();
}
async function pairAt(baseUrl, code) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  try {
    const res = await fetch(`${normalizedBaseUrl}/pair`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code })
    });
    if (!res.ok) return false;
    const { token: t } = await res.json();
    mode.value = "local";
    storageSet("local", normalizedBaseUrl, t);
    token.value = t;
    relaySessionId.value = "";
    _baseUrl = normalizedBaseUrl;
    void connect();
    return true;
  } catch {
    return false;
  }
}
async function pair(host, port, code) {
  return pairAt(`http://${host}:${port}`, code);
}
async function pairRelay(baseUrl, sessionId, pairingCode) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  try {
    const res = await fetch(`${normalizedBaseUrl}/api/relay/pair`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, pairingCode })
    });
    if (!res.ok) return false;
    const { mobileToken } = await res.json();
    mode.value = "relay";
    relayUrl.value = normalizedBaseUrl;
    relaySessionId.value = sessionId;
    storageSet("relay", normalizedBaseUrl, mobileToken, sessionId);
    token.value = mobileToken;
    _baseUrl = normalizedBaseUrl;
    void connect();
    return true;
  } catch {
    return false;
  }
}
function connectWithToken(agentBaseUrl, preIssuedToken) {
  const normalizedBaseUrl = normalizeBaseUrl(agentBaseUrl);
  mode.value = "local";
  storageSet("local", normalizedBaseUrl, preIssuedToken);
  token.value = preIssuedToken;
  relaySessionId.value = "";
  _baseUrl = normalizedBaseUrl;
  void connect();
}
function useDevBridge() {
  return {
    status: readonly(status),
    mode: readonly(mode),
    agentStatus: readonly(agentStatus),
    token: readonly(token),
    relaySessionId: readonly(relaySessionId),
    relayUrl: readonly(relayUrl),
    activeUrl: readonly(activeUrl),
    latencyMs: readonly(latencyMs),
    authError: readonly(authError),
    connect,
    disconnect,
    send,
    pair,
    pairAt,
    pairRelay,
    connectWithToken,
    clearStoredSession,
    fetchAgentStatus,
    onMessage(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }
  };
}

export { useDevBridge as u };
//# sourceMappingURL=useDevBridge-zfu9xC6m.mjs.map
