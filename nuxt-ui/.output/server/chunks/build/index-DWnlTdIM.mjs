import { defineComponent, ref, computed, nextTick, watch, unref, withCtx, createVNode, createTextVNode, mergeProps, useModel, mergeModels, shallowRef, getCurrentInstance, provide, cloneVNode, h, createElementBlock, useSSRContext } from 'vue';
import { ssrRenderStyle, ssrInterpolate, ssrRenderList, ssrRenderComponent, ssrIncludeBooleanAttr, ssrRenderAttr, ssrRenderAttrs, ssrRenderClass, ssrRenderSlot } from 'vue/server-renderer';
import { _ as _sfc_main$5 } from './StatusDot-DAsg-S3-.mjs';
import { _ as __nuxt_component_0 } from './nuxt-link-3Itqqbs-.mjs';
import { _ as _sfc_main$1$1, a as _sfc_main$6 } from './TypingIndicator-YjROmgLM.mjs';
import { _ as _sfc_main$7 } from './FileTree-Civ6YQ1j.mjs';
import { renderSVG } from 'uqr';
import { u as useDevBridge } from './useDevBridge-zfu9xC6m.mjs';
import { u as useViewMode } from './useViewMode-hlPgSG_f.mjs';
import { a as useRoute, b as useRouter, u as useHead, c as useRuntimeConfig } from './server.mjs';
import { _ as _export_sfc } from './_plugin-vue_export-helper-1tPrXgE0.mjs';
import '../nitro/nitro.mjs';
import 'node:http';
import 'node:https';
import 'node:events';
import 'node:buffer';
import 'node:fs';
import 'node:path';
import 'node:crypto';
import 'node:url';
import '../routes/renderer.mjs';
import 'vue-bundle-renderer/runtime';
import 'unhead/server';
import 'devalue';
import 'unhead/utils';
import 'unhead/plugins';
import 'vue-router';

const _sfc_main$4 = /* @__PURE__ */ defineComponent({
  __name: "PanelHead",
  __ssrInlineRender: true,
  props: {
    title: {},
    action: {}
  },
  emits: ["action"],
  setup(__props) {
    return (_ctx, _push, _parent, _attrs) => {
      _push(`<div${ssrRenderAttrs(mergeProps({
        class: "flex items-center justify-between px-7 py-4 shrink-0",
        style: { "border-bottom": "1px solid var(--border)" }
      }, _attrs))}><span class="text-[9px] tracking-[0.25em] uppercase" style="${ssrRenderStyle({ "color": "var(--muted)" })}">${ssrInterpolate(__props.title)}</span>`);
      if (__props.action) {
        _push(`<button class="text-[9px] tracking-[0.15em] uppercase transition-opacity hover:opacity-100" style="${ssrRenderStyle({ "background": "none", "border": "none", "color": "var(--muted)", "cursor": "pointer", "opacity": "0.7", "padding": "0" })}">${ssrInterpolate(__props.action)}</button>`);
      } else {
        _push(`<!---->`);
      }
      _push(`</div>`);
    };
  }
});
const _sfc_setup$4 = _sfc_main$4.setup;
_sfc_main$4.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("components/PanelHead.vue");
  return _sfc_setup$4 ? _sfc_setup$4(props, ctx) : void 0;
};
const _sfc_main$3 = /* @__PURE__ */ defineComponent({
  __name: "ToolRow",
  __ssrInlineRender: true,
  props: /* @__PURE__ */ mergeModels({
    name: {},
    type: {},
    available: { type: Boolean },
    reason: {}
  }, {
    "modelValue": { type: Boolean, ...{ default: false } },
    "modelModifiers": {}
  }),
  emits: ["update:modelValue"],
  setup(__props) {
    const model = useModel(__props, "modelValue");
    return (_ctx, _push, _parent, _attrs) => {
      const _component_StatusDot = _sfc_main$5;
      _push(`<div${ssrRenderAttrs(mergeProps({ class: "flex items-center justify-between py-2.5 border-b border-border last:border-0" }, _attrs))}><div class="flex items-center gap-3 min-w-0">`);
      _push(ssrRenderComponent(_component_StatusDot, {
        state: __props.available ? model.value ? "connected" : "connecting" : "disconnected"
      }, null, _parent));
      _push(`<div class="min-w-0"><p class="text-xs truncate text-text">${ssrInterpolate(__props.name)}</p><p class="text-[10px] text-muted uppercase tracking-wider">${ssrInterpolate(__props.available ? __props.type : __props.reason || `${__props.type} indisponible`)}</p></div></div><button class="${ssrRenderClass([model.value ? "text-text border-text" : "text-muted hover:text-text hover:border-text", "text-[10px] tracking-widest uppercase px-3 py-1 border border-border transition-colors shrink-0"])}"${ssrIncludeBooleanAttr(!__props.available) ? " disabled" : ""}>${ssrInterpolate(!__props.available ? "INDISPONIBLE" : model.value ? "PAR D\xC9FAUT" : "CHOISIR")}</button></div>`);
    };
  }
});
const _sfc_setup$3 = _sfc_main$3.setup;
_sfc_main$3.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("components/ToolRow.vue");
  return _sfc_setup$3 ? _sfc_setup$3(props, ctx) : void 0;
};
const _sfc_main$2 = /* @__PURE__ */ defineComponent({
  __name: "NetRow",
  __ssrInlineRender: true,
  props: {
    label: {},
    value: {},
    mono: { type: Boolean }
  },
  setup(__props) {
    return (_ctx, _push, _parent, _attrs) => {
      _push(`<div${ssrRenderAttrs(mergeProps({
        class: "flex items-center justify-between py-2.5",
        style: { "border-bottom": "1px solid var(--border)" }
      }, _attrs))}><span class="text-[9px] tracking-[0.15em] uppercase" style="${ssrRenderStyle({ "color": "var(--muted)" })}">${ssrInterpolate(__props.label)}</span>`);
      ssrRenderSlot(_ctx.$slots, "value", {}, () => {
        _push(`<span class="text-[11px]" style="${ssrRenderStyle(__props.mono ? "font-family:var(--font-mono, monospace);color:var(--text)" : "color:var(--text)")}">${ssrInterpolate(__props.value)}</span>`);
      }, _push, _parent);
      _push(`</div>`);
    };
  }
});
const _sfc_setup$2 = _sfc_main$2.setup;
_sfc_main$2.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("components/NetRow.vue");
  return _sfc_setup$2 ? _sfc_setup$2(props, ctx) : void 0;
};
defineComponent({
  name: "ServerPlaceholder",
  render() {
    return createElementBlock("div");
  }
});
const clientOnlySymbol = /* @__PURE__ */ Symbol.for("nuxt:client-only");
const __nuxt_component_4 = defineComponent({
  name: "ClientOnly",
  inheritAttrs: false,
  props: ["fallback", "placeholder", "placeholderTag", "fallbackTag"],
  ...false,
  setup(props, { slots, attrs }) {
    const mounted = shallowRef(false);
    const vm = getCurrentInstance();
    if (vm) {
      vm._nuxtClientOnly = true;
    }
    provide(clientOnlySymbol, true);
    return () => {
      var _a;
      if (mounted.value) {
        const vnodes = (_a = slots.default) == null ? void 0 : _a.call(slots);
        if (vnodes && vnodes.length === 1) {
          return [cloneVNode(vnodes[0], attrs)];
        }
        return vnodes;
      }
      const slot = slots.fallback || slots.placeholder;
      if (slot) {
        return h(slot);
      }
      const fallbackStr = props.fallback || props.placeholder || "";
      const fallbackTag = props.fallbackTag || props.placeholderTag || "span";
      return createElementBlock(fallbackTag, attrs, fallbackStr);
    };
  }
});
const _sfc_main$1 = /* @__PURE__ */ defineComponent({
  __name: "NotifCard",
  __ssrInlineRender: true,
  props: {
    text: {},
    tool: {},
    ts: {}
  },
  emits: ["validate", "refuse", "ignore"],
  setup(__props, { emit: __emit }) {
    const fmtTime = (ts) => {
      const d = new Date(ts);
      return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
    };
    return (_ctx, _push, _parent, _attrs) => {
      const _component_StatusDot = _sfc_main$5;
      _push(`<div${ssrRenderAttrs(mergeProps({ class: "border border-border bg-surface p-4 flex flex-col gap-3" }, _attrs))}><div class="flex items-center gap-2">`);
      _push(ssrRenderComponent(_component_StatusDot, { state: "connecting" }, null, _parent));
      _push(`<span class="text-[10px] uppercase tracking-widest text-muted">AI \xB7 question</span><span class="ml-auto text-[10px] text-dimmed tabular-nums">${ssrInterpolate(fmtTime(__props.ts))}</span></div><p class="text-sm leading-relaxed text-text">${ssrInterpolate(__props.text)}</p><p class="text-[10px] uppercase tracking-widest text-muted">via ${ssrInterpolate(__props.tool)}</p><div class="flex gap-2 pt-1"><button class="flex-1 py-1.5 text-[10px] uppercase tracking-widest border border-border hover:border-text hover:text-text transition-colors"> \u2713 Valider </button><button class="flex-1 py-1.5 text-[10px] uppercase tracking-widest border border-border text-dot-red border-dot-red hover:border-dot-red transition-colors opacity-70 hover:opacity-100"> \u2715 Refuser </button><button class="px-4 py-1.5 text-[10px] uppercase tracking-widest border border-border text-muted hover:text-text transition-colors"> \u2014 </button></div></div>`);
    };
  }
});
const _sfc_setup$1 = _sfc_main$1.setup;
_sfc_main$1.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("components/NotifCard.vue");
  return _sfc_setup$1 ? _sfc_setup$1(props, ctx) : void 0;
};
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "index",
  __ssrInlineRender: true,
  setup(__props) {
    const bridge = useDevBridge();
    const view = useViewMode();
    const config = useRuntimeConfig();
    useRoute();
    const router = useRouter();
    const clientReady = ref(false);
    const resolvedAgentHost = ref(String(config.public.agentHost));
    const publicUiHost = ref(String(config.public.agentHost));
    const agentHost = computed(() => {
      if (pairAgentUrl.value) return pairAgentUrl.value;
      return resolvedAgentHost.value;
    });
    const agentPort = config.public.agentPort;
    const uiTunnelUrl = computed(() => {
      var _a;
      return normalizeBaseUrl(String((_a = config.public.uiUrl) != null ? _a : ""));
    });
    const configuredRelayUrl = computed(() => {
      var _a;
      return normalizeBaseUrl(String((_a = config.public.relayUrl) != null ? _a : ""));
    });
    const relayState = computed(() => {
      var _a, _b;
      return (_b = (_a = bridge.agentStatus.value) == null ? void 0 : _a.relay) != null ? _b : null;
    });
    const statusColor = computed(() => ({ connected: "green", connecting: "amber", disconnected: "red" })[bridge.status.value]);
    const clock = ref("");
    function fmtTs(ts) {
      const d = new Date(ts);
      return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
    }
    function shortText(value, max = 90) {
      const clean = value.replace(/\s+/g, " ").trim();
      return clean.length > max ? `${clean.slice(0, max - 1)}\u2026` : clean;
    }
    function lastPathSegment(value) {
      var _a;
      return (_a = value.split(/[\\/]/).filter(Boolean).pop()) != null ? _a : value;
    }
    function stripAnsi(value) {
      return value.replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g, "").replace(/\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "").replace(/[\u0000-\u0008\u000B-\u001A\u001C-\u001F\u007F]/g, "");
    }
    const stats = computed(() => [
      { label: "Statut", value: `<span style="display:inline-flex;align-items:center;gap:6px"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--dot-${statusColor.value})"></span>${bridge.status.value}</span>`, meta: transportLabel.value },
      { label: "Projet actif", value: `<span style="font-size:16px">${activeProjectLabel.value}</span>`, meta: projectRootLabel.value },
      { label: "Adapters", value: `${tools.value.length}<span style="font-size:14px;font-weight:200"> online</span>`, meta: activeToolLabel.value }
    ]);
    const tools = computed(() => {
      var _a, _b;
      return ((_b = (_a = bridge.agentStatus.value) == null ? void 0 : _a.adapters) != null ? _b : []).map((adapter) => ({
        id: adapter.id,
        label: adapter.label,
        type: adapter.id.includes("cli") ? "Terminal" : "VS Code",
        active: adapter.active,
        available: adapter.available !== false,
        reason: typeof adapter.reason === "string" ? adapter.reason : null
      }));
    });
    const ideState = computed(() => {
      var _a, _b;
      return (_b = (_a = bridge.agentStatus.value) == null ? void 0 : _a.ideState) != null ? _b : null;
    });
    const activeTool = computed(() => {
      var _a;
      return (_a = tools.value.find((t) => t.active)) != null ? _a : null;
    });
    const activeToolLabel = computed(() => {
      var _a, _b;
      return (_b = (_a = activeTool.value) == null ? void 0 : _a.label) != null ? _b : "\u2014";
    });
    const activeProjectLabel = computed(() => {
      var _a, _b;
      const workspace = Array.isArray((_a = ideState.value) == null ? void 0 : _a.workspaceFolders) ? (_b = ideState.value) == null ? void 0 : _b.workspaceFolders[0] : "";
      if (workspace) return shortText(lastPathSegment(String(workspace)), 26);
      if (previewUrl.value) return shortText(new URL(previewUrl.value).hostname, 26);
      return "Bridge idle";
    });
    const projectRootLabel = computed(() => {
      var _a;
      const activeFile = (_a = ideState.value) == null ? void 0 : _a.activeFile;
      if (typeof activeFile === "string" && activeFile) return shortText(activeFile, 42);
      return fileTree.value.length ? "/workspace" : "No files loaded";
    });
    const transportLabel = computed(() => {
      if (bridge.mode.value === "relay") return "Relay";
      return currentAgentBaseUrl().startsWith("https://") ? "Tunnel" : "WiFi";
    });
    const tunnelModeLabel = computed(() => {
      if (bridge.mode.value === "relay") return "Relay cloud";
      return currentAgentBaseUrl().startsWith("https://") ? "HTTPS tunnel" : "WiFi local";
    });
    const latencyLabel = computed(() => bridge.agentStatus.value ? `${Math.max(1, Math.round((Date.now() - bridge.agentStatus.value.timestamp) / 1e3))}s` : "\u2014");
    function toggleTool(id, val) {
      const tool = tools.value.find((item) => item.id === id);
      if (val && (tool == null ? void 0 : tool.available)) {
        bridge.send({ type: "adapter_toggle", id, active: true });
        void bridge.fetchAgentStatus();
      }
    }
    const cliList = ref([]);
    const cliLaunching = ref({});
    function cliButtonName(cli) {
      var _a, _b;
      if (cli.id === "claude-code") return "CLAUDE";
      if (cli.id === "copilot") return "COPILOT";
      if (cli.id === "codex") return "CODEX";
      if (cli.id === "aider") return "AIDER";
      const firstToken = (_b = String((_a = cli.command) != null ? _a : "").trim().split(/\s+/)[0]) != null ? _b : "";
      return (firstToken || cli.name).replace(/[^a-z0-9]+/gi, "").toUpperCase();
    }
    function targetButtonLabel(target) {
      if (target.state === "starting") return `\u25B6 ${target.label}`;
      if (target.state === "active") return `${target.label} \u25CF`;
      return target.label;
    }
    function targetButtonStyle(target) {
      if (target.state === "active") {
        return "border:1px solid var(--text);color:var(--text);background:var(--surface)";
      }
      if (target.state === "starting") {
        return "border:1px solid var(--border);color:var(--muted);background:none;opacity:0.45";
      }
      return "border:1px solid var(--border);color:var(--muted);background:none";
    }
    function isChatTargetId(value) {
      const id = String(value != null ? value : "").trim();
      return id === "bash" || cliList.value.some((cli) => cli.id === id);
    }
    const activity = ref([]);
    function pushActivity(tag, text) {
      activity.value.unshift({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ts: Date.now(), tag, text });
      activity.value = activity.value.slice(0, 120);
    }
    const fileTree = ref([]);
    const selectedFile = ref(null);
    const previewUrl = ref("");
    const projectsList = ref([]);
    const projectOpening = ref({});
    async function loadProjects() {
      var _a, _b, _c;
      try {
        const token = (_a = bridge.token.value) != null ? _a : "";
        const base = (_b = bridge.activeUrl.value) != null ? _b : currentAgentBaseUrl();
        const res = await fetch(`${base}/projects`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          projectsList.value = (_c = data.projects) != null ? _c : [];
        }
      } catch {
      }
    }
    ref(null);
    const previewUrlLabel = computed(() => previewUrl.value ? shortText(previewUrl.value, 42) : "No preview URL");
    const actionBusy = ref({});
    const pairHost = ref(String(config.public.agentHost));
    const pairPort = ref(String(config.public.agentPort));
    const pairAgentUrl = ref("");
    const relaySessionId = ref("");
    ref("");
    const pairCode = ref("");
    const pairing = ref(false);
    const pairError = ref("");
    const currentPairingCode = ref("");
    const showQrModal = ref(false);
    const pairingUrl = computed(() => {
      const relaySession = relayState.value;
      const effectiveCode = (relaySession == null ? void 0 : relaySession.pairingCode) || currentPairingCode.value;
      if (!clientReady.value || !effectiveCode && !preIssuedToken.value) return "";
      const agentBaseUrl = pairAgentUrl.value || currentAgentBaseUrl();
      const base = uiTunnelUrl.value || (void 0).location.href;
      const url = new URL(base);
      if (!uiTunnelUrl.value) {
        url.hostname = publicUiHost.value;
        url.port = (void 0).location.port;
        url.pathname = (void 0).location.pathname;
      }
      url.search = "";
      url.hash = "";
      url.searchParams.set("view", "mobile");
      if ((relaySession == null ? void 0 : relaySession.sessionId) && configuredRelayUrl.value) {
        url.searchParams.set("relay", "1");
        url.searchParams.set("relayUrl", configuredRelayUrl.value);
        url.searchParams.set("sessionId", relaySession.sessionId);
        url.searchParams.set("code", relaySession.pairingCode);
      } else if (preIssuedToken.value) {
        url.searchParams.set("agentUrl", agentBaseUrl);
        url.searchParams.set("token", preIssuedToken.value);
      } else {
        url.searchParams.set("host", pairHost.value);
        url.searchParams.set("port", pairPort.value);
        url.searchParams.set("code", effectiveCode);
        if (agentBaseUrl) {
          url.searchParams.set("agentUrl", agentBaseUrl);
        }
      }
      return url.toString();
    });
    const pairingQrSvg = computed(() => {
      if (!pairingUrl.value) return "";
      return renderSVG(pairingUrl.value, {
        border: 1,
        ecc: "M",
        pixelSize: 7,
        whiteColor: "#ffffff",
        blackColor: "#111111"
      });
    });
    computed(() => {
      if (!pairingQrSvg.value) return "";
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pairingQrSvg.value)}`;
    });
    computed(() => {
      if (!clientReady.value || !localIpInfo.value || !preIssuedToken.value) return "";
      const uiPort = "8080";
      const fallbackUrl = `http://${localIpInfo.value.ip}:${uiPort}/?view=mobile&agentUrl=${encodeURIComponent(localIpInfo.value.agentUrl)}&token=${encodeURIComponent(preIssuedToken.value)}`;
      const svg = renderSVG(fallbackUrl, { border: 1, ecc: "M", pixelSize: 5, whiteColor: "#ffffff", blackColor: "#111111" });
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    });
    const pairingQrSvgLarge = computed(() => {
      if (!pairingUrl.value) return "";
      return renderSVG(pairingUrl.value, {
        border: 1,
        ecc: "M",
        pixelSize: 12,
        whiteColor: "#ffffff",
        blackColor: "#111111"
      });
    });
    computed(() => {
      if (!pairingQrSvgLarge.value) return "";
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pairingQrSvgLarge.value)}`;
    });
    function normalizeBaseUrl(value) {
      const trimmed = value.trim();
      if (!trimmed) return "";
      if (/^https?:\/\//i.test(trimmed)) {
        return trimmed.replace(/\/+$/, "");
      }
      return `http://${trimmed}`.replace(/\/+$/, "");
    }
    function currentAgentBaseUrl() {
      return "";
    }
    const preIssuedToken = ref("");
    const localIpInfo = ref(null);
    async function loadFileTree() {
      var _a, _b;
      if (bridge.mode.value === "relay") {
        const snapshotTree = (_a = bridge.agentStatus.value) == null ? void 0 : _a.fileTree;
        if (Array.isArray(snapshotTree)) fileTree.value = snapshotTree;
        return;
      }
      const t = bridge.token.value;
      if (!t) return;
      try {
        const res = await fetch(`${currentAgentBaseUrl()}/files`, {
          headers: { Authorization: `Bearer ${t}` }
        });
        if (res.ok) {
          const root = await res.json();
          fileTree.value = (_b = root.children) != null ? _b : [];
        }
      } catch {
      }
    }
    async function loadPreviewUrl() {
      var _a, _b, _c;
      if (bridge.mode.value === "relay") {
        previewUrl.value = String((_b = (_a = bridge.agentStatus.value) == null ? void 0 : _a.previewUrl) != null ? _b : "");
        return;
      }
      const t = bridge.token.value;
      if (!t) return;
      try {
        const res = await fetch(`${currentAgentBaseUrl()}/preview-url`, {
          headers: { Authorization: `Bearer ${t}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        previewUrl.value = (_c = data.url) != null ? _c : "";
      } catch {
      }
    }
    async function runAgentAction(action, args = []) {
      const t = bridge.token.value;
      if (!t) return false;
      if (bridge.mode.value === "relay") {
        bridge.send({ type: "action", action, args });
        pushActivity("sys", `Action relay envoy\xE9e \u2014 ${action} ${args.join(" ")}`.trim());
        return true;
      }
      actionBusy.value = { ...actionBusy.value, [action]: true };
      try {
        const res = await fetch(`${currentAgentBaseUrl()}/action`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${t}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ action, args })
        });
        if (!res.ok) {
          pushActivity("err", `Action \xE9chou\xE9e \u2014 ${action} ${args.join(" ")}`.trim());
          return false;
        }
        pushActivity("sys", `Action envoy\xE9e \u2014 ${action} ${args.join(" ")}`.trim());
        return true;
      } catch {
        pushActivity("err", `Action inaccessible \u2014 ${action} ${args.join(" ")}`.trim());
        return false;
      } finally {
        actionBusy.value = { ...actionBusy.value, [action]: false };
      }
    }
    const activeTab = ref("home");
    const mobileTabs = [
      { id: "home", label: "Home", icon: "\u2299" },
      { id: "chat", label: "Chat", icon: "\u2328" },
      { id: "code", label: "Code", icon: "\u27E8\u27E9" },
      { id: "preview", label: "Preview", icon: "\u25A3" }
    ];
    const pendingNotifs = ref([]);
    function removeNotif(id) {
      pendingNotifs.value = pendingNotifs.value.filter((n) => n.id !== id);
    }
    function handleNotif(id, action) {
      var _a;
      const n = pendingNotifs.value.find((x) => x.id === id);
      bridge.send({ type: "notif_response", id, action });
      removeNotif(id);
      activity.value.unshift({ id: Date.now().toString(), ts: Date.now(), tag: action === "validate" ? "user" : "sys", text: `${action === "validate" ? "Valid\xE9" : "Refus\xE9"} \u2014 ${(_a = n == null ? void 0 : n.text.slice(0, 60)) != null ? _a : ""}` });
    }
    const quickActions = computed(() => [
      { icon: "\u2328", label: "Nouvelle instruction", action: () => {
        activeTab.value = "chat";
      } },
      { icon: "\u25A3", label: "Preview app", action: previewUrl.value ? () => {
        activeTab.value = "preview";
      } : void 0 },
      { icon: "\u2934", label: actionBusy.value.git ? "Git push\u2026" : "Git push", action: () => {
        void runAgentAction("git", ["push"]);
      } },
      { icon: "\u25CE", label: actionBusy.value.npm ? "Tests\u2026" : "Run tests", action: () => {
        void runAgentAction("npm", ["test"]);
      } },
      { icon: "\u2699", label: "Param\xE8tres", action: () => {
        void router.push("/settings");
      } }
    ]);
    const chatMessages = ref([]);
    const chatDraft = ref("");
    const aiTyping = ref(false);
    const chatScroll = ref(null);
    const outputBuffer = /* @__PURE__ */ new Map();
    const outputTimers = /* @__PURE__ */ new Map();
    const replyTarget = ref(
      "bash"
    );
    const replyTargetPinned = ref(false);
    const replyTargetLabel = computed(() => {
      var _a;
      const target = chatTargets.value.find((item) => item.id === replyTarget.value);
      return (_a = target == null ? void 0 : target.label) != null ? _a : "BASH";
    });
    const chatTargets = computed(() => {
      var _a, _b;
      const terminals = Array.isArray((_a = ideState.value) == null ? void 0 : _a.terminals) ? (_b = ideState.value) == null ? void 0 : _b.terminals : [];
      const targets = [
        { id: "bash", label: "BASH", terminalName: "bash", state: replyTarget.value === "bash" ? "active" : "idle" }
      ];
      for (const cli of cliList.value) {
        const terminalName = `DevBridge ${cli.name}`;
        const isLaunched = terminals.some((terminal) => {
          var _a2;
          return String((_a2 = terminal == null ? void 0 : terminal.name) != null ? _a2 : "").trim() === terminalName;
        });
        const isStarting = Boolean(cliLaunching.value[cli.id]);
        targets.push({
          id: cli.id,
          label: cliButtonName(cli),
          terminalName,
          state: isStarting ? "starting" : replyTarget.value === cli.id && isLaunched ? "active" : "idle"
        });
      }
      return targets;
    });
    const selectedChatTargetReady = computed(() => {
      var _a, _b;
      if (replyTarget.value === "bash") return true;
      const terminals = Array.isArray((_a = ideState.value) == null ? void 0 : _a.terminals) ? (_b = ideState.value) == null ? void 0 : _b.terminals : [];
      const target = chatTargets.value.find((item) => item.id === replyTarget.value);
      return Boolean(target && target.state !== "starting" && target.terminalName && terminals.some(
        (terminal) => {
          var _a2;
          return String((_a2 = terminal == null ? void 0 : terminal.name) != null ? _a2 : "").trim() === target.terminalName;
        }
      ));
    });
    function appendAiMessage(text, tool, merge = false) {
      const clean = stripAnsi(text).trim();
      if (!clean) return;
      const last = chatMessages.value.at(-1);
      if (merge && last && last.direction === "ai" && last.tool === tool && Date.now() - last.ts < 1500) {
        last.text = `${last.text}${last.text.endsWith("\n") ? "" : "\n"}${clean}`;
        last.ts = Date.now();
        return;
      }
      chatMessages.value.push({ id: Date.now().toString(), direction: "ai", text: clean, tool, ts: Date.now() });
    }
    function setReplyTarget(nextTarget, pinned = false) {
      if (!nextTarget) return;
      replyTarget.value = nextTarget;
      if (pinned) replyTargetPinned.value = true;
    }
    function flushBufferedOutput(tool = "agent") {
      var _a;
      const pending = stripAnsi((_a = outputBuffer.get(tool)) != null ? _a : "").trim();
      const timer = outputTimers.get(tool);
      if (timer) {
        clearTimeout(timer);
        outputTimers.delete(tool);
      }
      if (!pending) return;
      outputBuffer.delete(tool);
      appendAiMessage(pending, tool, true);
      pushActivity("info", `${tool} \u2014 ${shortText(pending, 70)}`);
      void loadPreviewUrl();
      nextTick(() => {
        if (chatScroll.value) chatScroll.value.scrollTop = chatScroll.value.scrollHeight;
      });
    }
    function queueOutputChunk(text, tool) {
      var _a;
      const key = tool != null ? tool : "agent";
      const previous = (_a = outputBuffer.get(key)) != null ? _a : "";
      outputBuffer.set(key, `${previous}${text}`);
      const oldTimer = outputTimers.get(key);
      if (oldTimer) clearTimeout(oldTimer);
      outputTimers.set(key, setTimeout(() => flushBufferedOutput(key), 350));
    }
    bridge.onMessage((msg) => {
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _A, _B;
      if (msg.type === "notification") {
        pendingNotifs.value.push({ id: Date.now().toString(), text: (_a = msg.text) != null ? _a : "", tool: (_b = msg.tool) != null ? _b : "", ts: Date.now() });
        pushActivity("ai", `Validation requise \u2014 ${shortText((_c = msg.text) != null ? _c : "", 70)}`);
      } else if (msg.type === "chat_response" || msg.type === "ai_message") {
        flushBufferedOutput((_d = msg.tool) != null ? _d : "agent");
        aiTyping.value = false;
        if (!replyTargetPinned.value && isChatTargetId(msg.target)) {
          setReplyTarget(String(msg.target));
        }
        appendAiMessage((_e = msg.text) != null ? _e : "", msg.tool);
        pushActivity("ai", shortText((_f = msg.text) != null ? _f : "", 70));
        nextTick(() => {
          if (chatScroll.value) chatScroll.value.scrollTop = chatScroll.value.scrollHeight;
        });
      } else if (msg.type === "output" && msg.text) {
        aiTyping.value = false;
        queueOutputChunk(msg.text, msg.tool);
      } else if (msg.type === "adapter_exit") {
        flushBufferedOutput((_g = msg.tool) != null ? _g : "agent");
        pushActivity("err", `${String((_h = msg.tool) != null ? _h : "adapter")} exited`);
        void bridge.fetchAgentStatus();
      } else if (msg.type === "ai_typing") {
        aiTyping.value = true;
      } else if (msg.type === "event") {
        pushActivity("sys", (_i = msg.event) != null ? _i : msg.type);
        if (String((_j = msg.event) != null ? _j : "").startsWith("active_adapter:")) {
          void bridge.fetchAgentStatus();
        }
      } else if (msg.type === "ide_snapshot") {
        const state = (_k = msg.state) != null ? _k : {};
        const activeFile = String((_l = state.activeFile) != null ? _l : "");
        const activeTerminal = String((_m = state.activeTerminal) != null ? _m : "");
        pushActivity("sys", `IDE synchronis\xE9 \u2014 ${shortText(activeFile || activeTerminal || "snapshot re\xE7u", 70)}`);
        void bridge.fetchAgentStatus();
      } else if (msg.type === "status_snapshot") {
        const payload = typeof msg.payload === "object" && msg.payload ? msg.payload : msg;
        previewUrl.value = String((_o = (_n = payload.previewUrl) != null ? _n : previewUrl.value) != null ? _o : "");
        const snapshotTree = payload.fileTree;
        if (Array.isArray(snapshotTree)) fileTree.value = snapshotTree;
        pushActivity("sys", "Session relay synchronis\xE9e");
      } else if (msg.type === "ide_event") {
        const kind = String((_p = msg.kind) != null ? _p : "ide_event");
        const terminal = String((_q = msg.terminal) != null ? _q : "");
        const commandLine = String((_r = msg.commandLine) != null ? _r : "");
        const activeFile = String((_s = msg.activeFile) != null ? _s : "");
        String((_t = msg.target) != null ? _t : "");
        const textPreview = String((_u = msg.textPreview) != null ? _u : "");
        const workspaceFolders = Array.isArray(msg.workspaceFolders) ? String((_v = msg.workspaceFolders[0]) != null ? _v : "") : "";
        const label = textPreview || commandLine || activeFile || terminal || workspaceFolders || kind;
        pushActivity("sys", `VS Code \u2014 ${shortText(label, 80)}`);
      } else if (msg.type === "pairing_code" && msg.code) {
        currentPairingCode.value = String(msg.code);
        showQrModal.value = false;
        pushActivity("sys", `Code d'appairage disponible \u2014 ${currentPairingCode.value}`);
      } else if (msg.type === "relay_session") {
        const payload = typeof msg.payload === "object" && msg.payload ? msg.payload : {};
        if (payload.pairingCode) currentPairingCode.value = String(payload.pairingCode);
        if (payload.sessionId) relaySessionId.value = String(payload.sessionId);
      } else if (msg.type === "dev_server_url") {
        previewUrl.value = String((_w = msg.url) != null ? _w : "");
        if (previewUrl.value) pushActivity("sys", `Preview d\xE9tect\xE9e \u2014 ${shortText(previewUrl.value, 70)}`);
      } else if (msg.type === "file_changed") {
        pushActivity("sys", `Fichier chang\xE9 \u2014 ${String((_x = msg.path) != null ? _x : "")}`);
        void loadFileTree();
      } else if (msg.type === "clis_update" && Array.isArray(msg.clis)) {
        cliList.value = msg.clis;
      } else if (msg.type === "projects_update" && Array.isArray(msg.projects)) {
        projectsList.value = msg.projects;
      } else if (msg.type === "cli_started") {
        const cliId = String((_y = msg.cliId) != null ? _y : "");
        cliLaunching.value[cliId] = false;
        pushActivity("sys", `\u2713 ${String((_z = msg.terminalName) != null ? _z : cliId)} pr\xEAt`);
        if (cliId) setReplyTarget(cliId, true);
        if (activeTab.value !== "chat") activeTab.value = "chat";
      } else if (msg.type === "terminal_closed") {
        pushActivity("sys", `Terminal ferm\xE9 : ${String((_A = msg.terminalName) != null ? _A : "")}`);
        const terminalName = String((_B = msg.terminalName) != null ? _B : "");
        const closedCli = cliList.value.find((cli) => `DevBridge ${cli.name}` === terminalName);
        if (closedCli && replyTarget.value === closedCli.id) {
          replyTargetPinned.value = false;
          setReplyTarget("bash");
        }
      }
    });
    watch(() => bridge.status.value, (next) => {
      var _a, _b;
      if (next === "connected") {
        void loadFileTree();
        void bridge.fetchAgentStatus();
        void loadPreviewUrl();
        bridge.send({ type: "get_preview_url" });
        if (bridge.mode.value === "local") bridge.send({ type: "get_pairing_code" });
        const token = (_a = bridge.token.value) != null ? _a : "";
        const base = (_b = bridge.activeUrl.value) != null ? _b : currentAgentBaseUrl();
        if (base) {
          fetch(`${base}/clis`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()).then((d) => {
            if (d.clis) cliList.value = d.clis;
          }).catch(() => {
          });
          void loadProjects();
        }
      }
    }, { immediate: true });
    watch(chatTargets, (targets) => {
      if (!targets.some((target) => target.id === replyTarget.value)) {
        replyTargetPinned.value = false;
        replyTarget.value = "bash";
      }
      if (!replyTarget.value && targets.length) {
        setReplyTarget("bash");
      }
    }, { immediate: true });
    useHead({ title: "DevBridge \u2014 Dashboard" });
    return (_ctx, _push, _parent, _attrs) => {
      const _component_PanelHead = _sfc_main$4;
      const _component_ToolRow = _sfc_main$3;
      const _component_NetRow = _sfc_main$2;
      const _component_StatusDot = _sfc_main$5;
      const _component_ClientOnly = __nuxt_component_4;
      const _component_NuxtLink = __nuxt_component_0;
      const _component_NotifCard = _sfc_main$1;
      const _component_ChatBubble = _sfc_main$1$1;
      const _component_TypingIndicator = _sfc_main$6;
      const _component_FileTree = _sfc_main$7;
      _push(`<!--[--><div class="flex overflow-hidden" style="${ssrRenderStyle({ "height": "calc(100dvh - 3rem)" })}" data-v-6493df0b><div class="flex-1 min-w-0 flex flex-col overflow-hidden" style="${ssrRenderStyle([
        { "border-right": "1px solid var(--border)" },
        unref(view) !== "mobile" ? null : { display: "none" }
      ])}" data-v-6493df0b><div class="px-10 py-8 shrink-0" style="${ssrRenderStyle({ "border-bottom": "1px solid var(--border)" })}" data-v-6493df0b><h1 class="font-display font-light text-3xl tracking-tight" data-v-6493df0b>Dashboard</h1><p class="text-[11px] mt-1 tracking-widest" style="${ssrRenderStyle({ "color": "var(--muted)" })}" data-v-6493df0b>${ssrInterpolate(unref(agentHost))} \xB7 port ${ssrInterpolate(unref(agentPort))} \xB7 ${ssrInterpolate(unref(transportLabel))}</p></div><div class="grid grid-cols-3 shrink-0" style="${ssrRenderStyle({ "border-bottom": "1px solid var(--border)" })}" data-v-6493df0b><!--[-->`);
      ssrRenderList(unref(stats), (stat, i) => {
        var _a;
        _push(`<div class="px-8 py-6 transition-colors hover:bg-surface" style="${ssrRenderStyle(i < 2 ? "border-right:1px solid var(--border)" : "")}" data-v-6493df0b><p class="text-[9px] tracking-[0.2em] uppercase mb-2.5" style="${ssrRenderStyle({ "color": "var(--muted)" })}" data-v-6493df0b>${ssrInterpolate(stat.label)}</p><p class="font-display font-light text-[22px] tracking-tight" data-v-6493df0b>${(_a = stat.value) != null ? _a : ""}</p><p class="text-[10px] mt-1" style="${ssrRenderStyle({ "color": "var(--muted)" })}" data-v-6493df0b>${ssrInterpolate(stat.meta)}</p></div>`);
      });
      _push(`<!--]--></div><div class="flex-1 overflow-y-auto grid grid-cols-2" style="${ssrRenderStyle({ "align-content": "start" })}" data-v-6493df0b><div style="${ssrRenderStyle({ "border-right": "1px solid var(--border)", "border-bottom": "1px solid var(--border)" })}" data-v-6493df0b>`);
      _push(ssrRenderComponent(_component_PanelHead, { title: "Outils CLI" }, null, _parent));
      _push(`<div class="overflow-y-auto" style="${ssrRenderStyle({ "max-height": "280px" })}" data-v-6493df0b><!--[-->`);
      ssrRenderList(unref(cliList), (cli, i) => {
        _push(`<div class="flex items-center gap-3 px-5 py-2.5 text-[11px]" style="${ssrRenderStyle(i < unref(cliList).length - 1 ? "border-bottom:1px solid var(--border)" : "")}" data-v-6493df0b><span class="w-1.5 h-1.5 rounded-full shrink-0" style="${ssrRenderStyle(`background:var(--dot-${cli.detected ? "green" : "red"})`)}" data-v-6493df0b></span><span class="flex-1 truncate" data-v-6493df0b>${ssrInterpolate(cli.name)}</span><span class="text-[9px] uppercase tracking-[0.1em] shrink-0" style="${ssrRenderStyle({ "color": "var(--muted)" })}" data-v-6493df0b>Terminal</span>`);
        if (cli.detected) {
          _push(`<button${ssrIncludeBooleanAttr(!!unref(cliLaunching)[cli.id]) ? " disabled" : ""} class="text-[9px] uppercase tracking-widest px-2 py-1 shrink-0 transition-colors disabled:opacity-40" style="${ssrRenderStyle({ "border": "1px solid var(--border)", "color": "var(--text)", "background": "none" })}" data-v-6493df0b>${ssrInterpolate(unref(cliLaunching)[cli.id] ? "\u2026" : "Lancer")}</button>`);
        } else {
          _push(`<span class="text-[9px] shrink-0" style="${ssrRenderStyle({ "color": "var(--dot-red)" })}" data-v-6493df0b>non d\xE9tect\xE9</span>`);
        }
        _push(`</div>`);
      });
      _push(`<!--]-->`);
      if (!unref(cliList).length) {
        _push(`<p class="text-[11px] px-7 py-4" style="${ssrRenderStyle({ "color": "var(--muted)" })}" data-v-6493df0b>\u2014 Non connect\xE9 \u2014</p>`);
      } else {
        _push(`<!---->`);
      }
      _push(`</div>`);
      if (unref(tools).length) {
        _push(`<div style="${ssrRenderStyle({ "border-top": "1px solid var(--border)" })}" data-v-6493df0b><!--[-->`);
        ssrRenderList(unref(tools), (t) => {
          _push(ssrRenderComponent(_component_ToolRow, {
            key: t.id,
            name: t.label,
            type: t.type,
            available: t.available,
            reason: t.reason,
            "model-value": t.active,
            "onUpdate:modelValue": ($event) => toggleTool(t.id, $event)
          }, null, _parent));
        });
        _push(`<!--]--></div>`);
      } else {
        _push(`<!---->`);
      }
      _push(`</div><div style="${ssrRenderStyle({ "border-bottom": "1px solid var(--border)" })}" data-v-6493df0b>`);
      _push(ssrRenderComponent(_component_PanelHead, {
        title: "Activit\xE9 r\xE9cente",
        action: "Effacer",
        onAction: ($event) => activity.value = []
      }, null, _parent));
      _push(`<div class="overflow-y-auto" style="${ssrRenderStyle({ "max-height": "280px" })}" data-v-6493df0b><!--[-->`);
      ssrRenderList(unref(activity), (e) => {
        _push(`<div class="grid gap-3 px-7 py-3 transition-colors hover:bg-surface" style="${ssrRenderStyle({ "grid-template-columns": "auto 1fr auto", "align-items": "start", "border-bottom": "1px solid var(--border)" })}" data-v-6493df0b><span class="text-[9px] pt-0.5 whitespace-nowrap" style="${ssrRenderStyle({ "color": "var(--muted)" })}" data-v-6493df0b>${ssrInterpolate(fmtTs(e.ts))}</span><span class="text-[11px]" style="${ssrRenderStyle({ "line-height": "1.5" })}" data-v-6493df0b>${ssrInterpolate(e.text)}</span><span class="text-[8px] tracking-[0.15em] uppercase px-1.5 py-0.5 self-start whitespace-nowrap" style="${ssrRenderStyle({ "border": "1px solid var(--border)", "color": "var(--muted)" })}" data-v-6493df0b>${ssrInterpolate(e.tag)}</span></div>`);
      });
      _push(`<!--]-->`);
      if (!unref(activity).length) {
        _push(`<p class="text-[11px] px-7 py-4" style="${ssrRenderStyle({ "color": "var(--muted)" })}" data-v-6493df0b>\u2014 Aucune activit\xE9 \u2014</p>`);
      } else {
        _push(`<!---->`);
      }
      _push(`</div></div><div style="${ssrRenderStyle({ "border-right": "1px solid var(--border)" })}" data-v-6493df0b>`);
      _push(ssrRenderComponent(_component_PanelHead, { title: "Projets disponibles" }, null, _parent));
      _push(`<div class="overflow-y-auto" style="${ssrRenderStyle({ "max-height": "280px" })}" data-v-6493df0b><!--[-->`);
      ssrRenderList(unref(projectsList), (proj, i) => {
        _push(`<div class="flex items-center justify-between px-5 py-2.5 text-[11px]" style="${ssrRenderStyle(i < unref(projectsList).length - 1 ? "border-bottom:1px solid var(--border)" : "")}" data-v-6493df0b><span class="flex items-center gap-2 truncate" data-v-6493df0b>`);
        if (proj.isActive) {
          _push(`<span class="shrink-0" style="${ssrRenderStyle({ "color": "var(--dot-amber)" })}" data-v-6493df0b>\u2605</span>`);
        } else {
          _push(`<!---->`);
        }
        _push(`<span class="truncate" data-v-6493df0b>${ssrInterpolate(proj.name)}</span></span>`);
        if (proj.isActive) {
          _push(`<span class="text-[9px] uppercase tracking-[0.1em] shrink-0 ml-2" style="${ssrRenderStyle({ "color": "var(--muted)" })}" data-v-6493df0b>actif</span>`);
        } else {
          _push(`<button${ssrIncludeBooleanAttr(unref(projectOpening)[proj.path] === "opening") ? " disabled" : ""} class="text-[9px] uppercase tracking-widest px-2 py-1 shrink-0 ml-2 transition-colors disabled:opacity-40" style="${ssrRenderStyle(unref(projectOpening)[proj.path] === "done" ? "border:1px solid var(--dot-green);color:var(--dot-green);background:none" : "border:1px solid var(--border);color:var(--text);background:none")}" data-v-6493df0b>${ssrInterpolate(unref(projectOpening)[proj.path] === "opening" ? "Ouverture\u2026" : unref(projectOpening)[proj.path] === "done" ? "Ouvert \u2713" : "Ouvrir \u2192")}</button>`);
        }
        _push(`</div>`);
      });
      _push(`<!--]-->`);
      if (!unref(projectsList).length) {
        _push(`<p class="text-[11px] px-7 py-4" style="${ssrRenderStyle({ "color": "var(--muted)" })}" data-v-6493df0b>\u2014 Non connect\xE9 \u2014</p>`);
      } else {
        _push(`<!---->`);
      }
      _push(`</div></div><div data-v-6493df0b>`);
      _push(ssrRenderComponent(_component_PanelHead, { title: "R\xE9seau & Pairing" }, null, _parent));
      _push(`<div class="px-7" data-v-6493df0b>`);
      _push(ssrRenderComponent(_component_NetRow, {
        label: "Adresse",
        value: String(unref(agentHost)),
        mono: ""
      }, null, _parent));
      _push(ssrRenderComponent(_component_NetRow, {
        label: "Port",
        value: String(unref(agentPort)),
        mono: ""
      }, null, _parent));
      _push(ssrRenderComponent(_component_NetRow, {
        label: "Mode",
        value: unref(tunnelModeLabel)
      }, null, _parent));
      _push(ssrRenderComponent(_component_NetRow, { label: "Statut" }, {
        value: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(ssrRenderComponent(_component_StatusDot, {
              state: unref(bridge).status.value,
              mode: unref(bridge).mode.value,
              latency: unref(bridge).latencyMs.value
            }, null, _parent2, _scopeId));
          } else {
            return [
              createVNode(_component_StatusDot, {
                state: unref(bridge).status.value,
                mode: unref(bridge).mode.value,
                latency: unref(bridge).latencyMs.value
              }, null, 8, ["state", "mode", "latency"])
            ];
          }
        }),
        _: 1
      }, _parent));
      _push(`</div><div class="px-7 mt-4 grid grid-cols-3 gap-2" data-v-6493df0b><button class="text-[10px] uppercase tracking-widest py-2 transition-colors" style="${ssrRenderStyle({ "border": "1px solid var(--border)", "color": "var(--text)", "background": "none" })}" data-v-6493df0b> Ouvrir </button><button class="text-[10px] uppercase tracking-widest py-2 transition-colors" style="${ssrRenderStyle({ "border": "1px solid var(--border)", "color": "var(--text)", "background": "none" })}" data-v-6493df0b> Copier </button>`);
      _push(ssrRenderComponent(_component_ClientOnly, null, {}, _parent));
      _push(`</div>`);
      if (unref(bridge).status.value === "disconnected" && !unref(bridge).token.value) {
        _push(`<div class="px-7 pb-6 mt-4 space-y-2" data-v-6493df0b><input${ssrRenderAttr("value", unref(pairCode))} placeholder="CODE D&#39;APPAIRAGE" class="w-full text-[11px] px-3 py-2 text-text outline-none uppercase tracking-widest" style="${ssrRenderStyle({ "background": "var(--surface)", "border": "1px solid var(--border)" })}" data-v-6493df0b><button${ssrIncludeBooleanAttr(unref(pairing)) ? " disabled" : ""} class="w-full text-[10px] uppercase tracking-widest py-2 transition-colors disabled:opacity-40" style="${ssrRenderStyle({ "border": "1px solid var(--text)", "color": "var(--text)", "background": "none" })}" data-v-6493df0b>${ssrInterpolate(unref(pairing) ? "Connexion\u2026" : "Appairer")}</button>`);
        if (unref(pairError)) {
          _push(`<p class="text-[10px]" style="${ssrRenderStyle({ "color": "var(--dot-red)" })}" data-v-6493df0b>${ssrInterpolate(unref(pairError))}</p>`);
        } else {
          _push(`<!---->`);
        }
        _push(`</div>`);
      } else {
        _push(`<!---->`);
      }
      _push(`</div></div></div><div class="shrink-0 flex flex-col overflow-hidden" style="${ssrRenderStyle([
        unref(view) === "mobile" ? "flex:1;width:100%" : "width:375px",
        { "background": "var(--bg)" },
        unref(view) !== "pc" ? null : { display: "none" }
      ])}" data-v-6493df0b><div class="flex items-center justify-between px-5 shrink-0" style="${ssrRenderStyle({ "height": "44px", "border-bottom": "1px solid var(--border)" })}" data-v-6493df0b><span class="font-display font-normal text-[13px] tracking-[0.05em]" data-v-6493df0b>${ssrInterpolate(unref(clock))}</span><div class="flex items-center gap-1.5 text-[11px]" style="${ssrRenderStyle({ "color": "var(--muted)" })}" data-v-6493df0b><span class="w-1.5 h-1.5 rounded-full inline-block" style="${ssrRenderStyle(`background:var(--dot-${unref(statusColor)})`)}" data-v-6493df0b></span><span data-v-6493df0b>WiFi</span><span data-v-6493df0b>\u25CF\u25CF\u25CF</span>`);
      _push(ssrRenderComponent(_component_NuxtLink, {
        to: "/settings",
        class: "ml-1 leading-none",
        style: { "color": "var(--muted)" },
        title: "Param\xE8tres"
      }, {
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(`\u2699`);
          } else {
            return [
              createTextVNode("\u2699")
            ];
          }
        }),
        _: 1
      }, _parent));
      _push(`</div></div><div class="flex shrink-0" style="${ssrRenderStyle({ "border-bottom": "1px solid var(--border)" })}" data-v-6493df0b><!--[-->`);
      ssrRenderList(mobileTabs, (tab, i) => {
        _push(`<button class="flex-1 flex flex-col items-center py-3 gap-1 transition-colors" style="${ssrRenderStyle([
          unref(activeTab) === tab.id ? "border-bottom:2px solid var(--text)" : "border-bottom:2px solid transparent",
          i < mobileTabs.length - 1 ? "border-right:1px solid var(--border)" : ""
        ].join(";"))}" data-v-6493df0b><span class="text-base leading-none" data-v-6493df0b>${ssrInterpolate(tab.icon)}</span><span class="text-[7px] tracking-[0.15em] uppercase" style="${ssrRenderStyle(unref(activeTab) === tab.id ? "color:var(--text)" : "color:var(--muted)")}" data-v-6493df0b>${ssrInterpolate(tab.label)}</span></button>`);
      });
      _push(`<!--]--></div><div class="flex-1 overflow-hidden relative" data-v-6493df0b><div class="absolute inset-0 overflow-y-auto flex flex-col" style="${ssrRenderStyle(unref(activeTab) === "home" ? null : { display: "none" })}" data-v-6493df0b>`);
      if (unref(bridge).authError.value) {
        _push(`<div class="mx-4 mt-4 px-4 py-3 flex items-center justify-between" style="${ssrRenderStyle({ "border": "1px solid var(--dot-red)", "background": "rgba(239,68,68,0.08)" })}" data-v-6493df0b><div class="flex items-center gap-2.5" data-v-6493df0b><span class="w-1.5 h-1.5 rounded-full" style="${ssrRenderStyle({ "background": "var(--dot-red)" })}" data-v-6493df0b></span><p class="text-[10px] uppercase tracking-[0.1em]" style="${ssrRenderStyle({ "color": "var(--dot-red)" })}" data-v-6493df0b>QR expir\xE9 \u2014 scannez \xE0 nouveau</p></div><button class="text-[9px] uppercase tracking-[0.1em]" style="${ssrRenderStyle({ "color": "var(--dot-red)" })}" data-v-6493df0b>Effacer</button></div>`);
      } else {
        _push(`<!---->`);
      }
      _push(`<div class="flex items-center justify-between mx-4 my-4 px-4 py-3" style="${ssrRenderStyle({ "border": "1px solid var(--border)" })}" data-v-6493df0b><div class="flex items-center gap-2.5" data-v-6493df0b><span class="w-1.5 h-1.5 rounded-full" style="${ssrRenderStyle(`background:var(--dot-${unref(statusColor)})`)}" data-v-6493df0b></span><div data-v-6493df0b><p class="text-[10px] uppercase tracking-[0.1em]" style="${ssrRenderStyle({ "color": "var(--muted)" })}" data-v-6493df0b>${ssrInterpolate(unref(bridge).status.value)}</p><p class="text-[11px] mt-0.5" data-v-6493df0b>${ssrInterpolate(unref(activeProjectLabel))} \xB7 ${ssrInterpolate(unref(activeToolLabel))}</p></div></div><div class="text-right text-[9px]" style="${ssrRenderStyle({ "color": "var(--muted)" })}" data-v-6493df0b>${ssrInterpolate(unref(latencyLabel))}<br data-v-6493df0b><span class="text-[8px]" data-v-6493df0b>${ssrInterpolate(unref(transportLabel))}</span></div></div><div${ssrRenderAttrs({
        name: "notif",
        class: "px-4 space-y-3 mb-1"
      })} data-v-6493df0b>`);
      ssrRenderList(unref(pendingNotifs), (n) => {
        _push(ssrRenderComponent(_component_NotifCard, {
          key: n.id,
          text: n.text,
          tool: n.tool,
          ts: n.ts,
          onValidate: ($event) => handleNotif(n.id, "validate"),
          onRefuse: ($event) => handleNotif(n.id, "refuse"),
          onIgnore: ($event) => removeNotif(n.id)
        }, null, _parent));
      });
      _push(`</div><div class="px-4 mt-3" data-v-6493df0b><p class="text-[8px] tracking-[0.25em] uppercase mb-2.5" style="${ssrRenderStyle({ "color": "var(--muted)" })}" data-v-6493df0b>Actions rapides</p><div class="grid grid-cols-2 gap-2" data-v-6493df0b><!--[-->`);
      ssrRenderList(unref(quickActions), (qa) => {
        _push(`<button class="flex flex-col gap-1.5 text-left px-3 py-3.5 text-[10px] uppercase tracking-[0.1em] transition-colors hover:bg-surface" style="${ssrRenderStyle({ "border": "1px solid var(--border)", "background": "none", "color": "var(--text)" })}" data-v-6493df0b><span class="text-lg leading-none" data-v-6493df0b>${ssrInterpolate(qa.icon)}</span>${ssrInterpolate(qa.label)}</button>`);
      });
      _push(`<!--]--></div></div><div class="px-4 mt-4 mb-6" data-v-6493df0b><p class="text-[8px] tracking-[0.25em] uppercase mb-2.5" style="${ssrRenderStyle({ "color": "var(--muted)" })}" data-v-6493df0b>Outils actifs</p><div style="${ssrRenderStyle({ "border": "1px solid var(--border)" })}" data-v-6493df0b><!--[-->`);
      ssrRenderList(unref(cliList).filter((c) => c.detected), (cli, i) => {
        _push(`<div class="flex items-center justify-between px-3.5 py-2.5 text-[11px]" style="${ssrRenderStyle(i < unref(cliList).filter((c) => c.detected).length - 1 || unref(tools).length ? "border-bottom:1px solid var(--border)" : "")}" data-v-6493df0b><span class="flex items-center gap-2" data-v-6493df0b><span class="w-1.5 h-1.5 rounded-full inline-block" style="${ssrRenderStyle({ "background": "var(--dot-green)" })}" data-v-6493df0b></span> ${ssrInterpolate(cli.name)}</span><div class="flex items-center gap-2" data-v-6493df0b><span class="text-[9px] uppercase tracking-[0.1em]" style="${ssrRenderStyle({ "color": "var(--muted)" })}" data-v-6493df0b>Terminal</span><button${ssrIncludeBooleanAttr(!!unref(cliLaunching)[cli.id]) ? " disabled" : ""} class="text-[9px] uppercase tracking-widest px-2 py-1 transition-colors disabled:opacity-40" style="${ssrRenderStyle({ "border": "1px solid var(--border)", "color": "var(--text)", "background": "none" })}" data-v-6493df0b>${ssrInterpolate(unref(cliLaunching)[cli.id] ? "\u2026" : "Lancer")}</button></div></div>`);
      });
      _push(`<!--]--><!--[-->`);
      ssrRenderList(unref(tools), (t, i) => {
        _push(`<div class="flex items-center justify-between px-3.5 py-2.5 text-[11px]" style="${ssrRenderStyle(i < unref(tools).length - 1 ? "border-bottom:1px solid var(--border)" : "")}" data-v-6493df0b><span class="flex items-center gap-2" data-v-6493df0b><span class="w-1.5 h-1.5 rounded-full inline-block" style="${ssrRenderStyle(`background:var(--dot-${t.available ? t.active ? "green" : "amber" : "red"})`)}" data-v-6493df0b></span> ${ssrInterpolate(t.label)}</span><span class="text-[9px] uppercase tracking-[0.1em]" style="${ssrRenderStyle({ "color": "var(--muted)" })}" data-v-6493df0b>${ssrInterpolate(t.available ? t.type : "missing")}</span></div>`);
      });
      _push(`<!--]-->`);
      if (!unref(cliList).filter((c) => c.detected).length && !unref(tools).length) {
        _push(`<p class="px-3.5 py-2.5 text-[10px]" style="${ssrRenderStyle({ "color": "var(--muted)" })}" data-v-6493df0b>\u2014 Aucun outil \u2014</p>`);
      } else {
        _push(`<!---->`);
      }
      _push(`</div></div><div class="px-4 mb-6" data-v-6493df0b><p class="text-[8px] tracking-[0.25em] uppercase mb-2.5" style="${ssrRenderStyle({ "color": "var(--muted)" })}" data-v-6493df0b>Agent</p><div class="grid grid-cols-3 gap-px" style="${ssrRenderStyle({ "border": "1px solid var(--border)", "background": "var(--border)" })}" data-v-6493df0b><button class="text-[10px] uppercase tracking-[0.1em] py-2.5" style="${ssrRenderStyle({ "background": "var(--bg)", "color": "var(--text)" })}" data-v-6493df0b> Ouvrir </button><button class="text-[10px] uppercase tracking-[0.1em] py-2.5" style="${ssrRenderStyle({ "background": "var(--bg)", "color": "var(--text)" })}" data-v-6493df0b> Copier </button>`);
      _push(ssrRenderComponent(_component_ClientOnly, null, {}, _parent));
      _push(`</div></div></div><div class="absolute inset-0 flex flex-col" style="${ssrRenderStyle(unref(activeTab) === "chat" ? null : { display: "none" })}" data-v-6493df0b><div class="flex-1 overflow-y-auto p-4 flex flex-col gap-3" data-v-6493df0b><!--[-->`);
      ssrRenderList(unref(chatMessages), (m) => {
        _push(ssrRenderComponent(_component_ChatBubble, {
          key: m.id,
          text: m.text,
          direction: m.direction,
          tool: m.tool,
          ts: m.ts
        }, null, _parent));
      });
      _push(`<!--]-->`);
      if (unref(aiTyping)) {
        _push(ssrRenderComponent(_component_TypingIndicator, null, null, _parent));
      } else {
        _push(`<!---->`);
      }
      _push(`</div><div class="shrink-0 p-3" style="${ssrRenderStyle({ "border-top": "1px solid var(--border)", "background": "var(--bg)" })}" data-v-6493df0b><div class="text-[9px] uppercase tracking-[0.12em] mb-2" style="${ssrRenderStyle({ "color": "var(--muted)" })}" data-v-6493df0b> R\xE9ponse vers ${ssrInterpolate(unref(replyTargetLabel))}</div><div class="flex gap-2 overflow-x-auto pb-2 mb-2" data-v-6493df0b><!--[-->`);
      ssrRenderList(unref(chatTargets), (target) => {
        _push(`<button${ssrIncludeBooleanAttr(target.state === "starting") ? " disabled" : ""} class="shrink-0 text-[10px] uppercase tracking-[0.14em] px-3 py-1.5 font-mono disabled:pointer-events-none" style="${ssrRenderStyle(targetButtonStyle(target))}" data-v-6493df0b>${ssrInterpolate(targetButtonLabel(target))}</button>`);
      });
      _push(`<!--]--></div><div class="flex gap-2 items-end" data-v-6493df0b><button class="w-10 h-10 flex items-center justify-center text-base shrink-0" style="${ssrRenderStyle({ "border": "1px solid var(--border)", "color": "var(--muted)" })}" data-v-6493df0b>\u{1F3A4}</button><button class="w-10 h-10 flex items-center justify-center text-base shrink-0" style="${ssrRenderStyle({ "border": "1px solid var(--border)", "color": "var(--muted)" })}" data-v-6493df0b>\u{1F4CE}</button><textarea${ssrRenderAttr("rows", 1)} placeholder="Nouvelle instruction\u2026" class="flex-1 text-[12px] px-3.5 py-2.5 text-text outline-none resize-none" style="${ssrRenderStyle({ "background": "var(--surface)", "border": "1px solid var(--border)", "max-height": "120px", "font-family": "inherit" })}" data-v-6493df0b>${ssrInterpolate(unref(chatDraft))}</textarea><button${ssrIncludeBooleanAttr(!unref(selectedChatTargetReady)) ? " disabled" : ""} class="w-10 h-10 flex items-center justify-center text-sm shrink-0 disabled:opacity-30" style="${ssrRenderStyle({ "background": "var(--text)", "color": "var(--bg)", "border": "1px solid var(--text)" })}" data-v-6493df0b>\u2191</button></div></div></div><div class="absolute inset-0 flex flex-col" style="${ssrRenderStyle(unref(activeTab) === "code" ? null : { display: "none" })}" data-v-6493df0b><div class="shrink-0" style="${ssrRenderStyle({ "border-bottom": "1px solid var(--border)" })}" data-v-6493df0b><div class="px-4 py-2 flex items-center justify-between" style="${ssrRenderStyle({ "border-bottom": "1px solid var(--border)" })}" data-v-6493df0b><p class="text-[9px] uppercase tracking-[0.2em]" style="${ssrRenderStyle({ "color": "var(--muted)" })}" data-v-6493df0b>Projets disponibles</p></div><div class="overflow-y-auto" style="${ssrRenderStyle({ "max-height": "160px" })}" data-v-6493df0b><!--[-->`);
      ssrRenderList(unref(projectsList), (proj, i) => {
        _push(`<div class="flex items-center justify-between px-4 py-2 text-[11px]" style="${ssrRenderStyle(i < unref(projectsList).length - 1 ? "border-bottom:1px solid var(--border)" : "")}" data-v-6493df0b><span class="flex items-center gap-1.5 truncate" data-v-6493df0b>`);
        if (proj.isActive) {
          _push(`<span style="${ssrRenderStyle({ "color": "var(--dot-amber)" })}" data-v-6493df0b>\u2605</span>`);
        } else {
          _push(`<!---->`);
        }
        _push(`<span class="truncate" data-v-6493df0b>${ssrInterpolate(proj.name)}</span></span>`);
        if (proj.isActive) {
          _push(`<span class="text-[9px] shrink-0 ml-2" style="${ssrRenderStyle({ "color": "var(--muted)" })}" data-v-6493df0b>actif</span>`);
        } else {
          _push(`<button${ssrIncludeBooleanAttr(unref(projectOpening)[proj.path] === "opening") ? " disabled" : ""} class="text-[9px] uppercase tracking-widest px-2 py-1 shrink-0 ml-2 transition-colors disabled:opacity-40" style="${ssrRenderStyle(unref(projectOpening)[proj.path] === "done" ? "border:1px solid var(--dot-green);color:var(--dot-green);background:none" : "border:1px solid var(--border);color:var(--text);background:none")}" data-v-6493df0b>${ssrInterpolate(unref(projectOpening)[proj.path] === "opening" ? "\u2026" : unref(projectOpening)[proj.path] === "done" ? "\u2713" : "\u2192")}</button>`);
        }
        _push(`</div>`);
      });
      _push(`<!--]-->`);
      if (!unref(projectsList).length) {
        _push(`<p class="px-4 py-3 text-[10px]" style="${ssrRenderStyle({ "color": "var(--muted)" })}" data-v-6493df0b>\u2014 Non connect\xE9 \u2014</p>`);
      } else {
        _push(`<!---->`);
      }
      _push(`</div></div><div class="flex shrink-0 mx-4 my-4" style="${ssrRenderStyle({ "border": "1px solid var(--border)" })}" data-v-6493df0b><input type="text" placeholder="Rechercher un fichier\u2026" class="flex-1 text-[11px] px-3.5 py-2.5 outline-none text-text" style="${ssrRenderStyle({ "background": "none", "border": "none", "font-family": "inherit" })}" data-v-6493df0b><button class="w-10 flex items-center justify-center text-sm" style="${ssrRenderStyle({ "border-left": "1px solid var(--border)", "color": "var(--muted)" })}" data-v-6493df0b>\u2315</button></div><div class="flex-1 overflow-y-auto text-[11px]" data-v-6493df0b>`);
      if (unref(fileTree).length) {
        _push(ssrRenderComponent(_component_FileTree, {
          nodes: unref(fileTree),
          onSelect: ($event) => selectedFile.value = $event
        }, null, _parent));
      } else {
        _push(`<p class="px-5 py-4" style="${ssrRenderStyle({ "color": "var(--muted)" })}" data-v-6493df0b>\u2014 Non connect\xE9 \u2014</p>`);
      }
      _push(`</div></div><div class="absolute inset-0 flex flex-col" style="${ssrRenderStyle(unref(activeTab) === "preview" ? null : { display: "none" })}" data-v-6493df0b><div class="flex items-center justify-between px-4 py-3 shrink-0" style="${ssrRenderStyle({ "border-bottom": "1px solid var(--border)" })}" data-v-6493df0b><span class="text-[10px]" style="${ssrRenderStyle({ "color": "var(--muted)", "font-family": "inherit" })}" data-v-6493df0b>${ssrInterpolate(unref(previewUrlLabel))}</span><div class="flex gap-1.5" data-v-6493df0b><button class="text-[9px] px-2.5 py-1.5 uppercase tracking-[0.1em]" style="${ssrRenderStyle({ "border": "1px solid var(--border)", "background": "none", "color": "var(--muted)" })}" data-v-6493df0b>\u21BA Refresh</button>`);
      if (unref(previewUrl)) {
        _push(`<a${ssrRenderAttr("href", unref(previewUrl))} target="_blank" rel="noreferrer" class="text-[9px] px-2.5 py-1.5 uppercase tracking-[0.1em]" style="${ssrRenderStyle({ "border": "1px solid var(--border)", "background": "none", "color": "var(--muted)" })}" data-v-6493df0b>\u229E Open</a>`);
      } else {
        _push(`<!---->`);
      }
      _push(`</div></div><div class="flex-1 p-4 flex flex-col" style="${ssrRenderStyle({ "background": "var(--surface)" })}" data-v-6493df0b><div class="flex-1 flex flex-col" data-v-6493df0b><div class="flex items-center gap-1.5 px-3 py-2 shrink-0" style="${ssrRenderStyle({ "background": "var(--surface2)", "border": "1px solid var(--border)" })}" data-v-6493df0b><!--[-->`);
      ssrRenderList(3, (c) => {
        _push(`<div class="w-2 h-2 rounded-full" style="${ssrRenderStyle({ "background": "var(--border-bright)" })}" data-v-6493df0b></div>`);
      });
      _push(`<!--]--><span class="text-[10px] ml-2" style="${ssrRenderStyle({ "color": "var(--muted)" })}" data-v-6493df0b>${ssrInterpolate(unref(activeProjectLabel))}</span></div>`);
      if (unref(previewUrl)) {
        _push(`<div class="flex-1" style="${ssrRenderStyle({ "border": "1px solid var(--border)", "border-top": "none" })}" data-v-6493df0b><iframe${ssrRenderAttr("src", unref(previewUrl))} class="w-full h-full border-0 bg-white" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" data-v-6493df0b></iframe></div>`);
      } else {
        _push(`<div class="flex-1 flex items-center justify-center text-[10px] uppercase tracking-[0.15em]" style="${ssrRenderStyle({ "border": "1px solid var(--border)", "border-top": "none", "color": "var(--muted)" })}" data-v-6493df0b> \u2014 Aucune preview d\xE9tect\xE9e \u2014 </div>`);
      }
      _push(`</div></div></div></div></div></div>`);
      _push(ssrRenderComponent(_component_ClientOnly, null, {}, _parent));
      _push(`<!--]-->`);
    };
  }
});
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("pages/index.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-6493df0b"]]);

export { index as default };
//# sourceMappingURL=index-DWnlTdIM.mjs.map
