import { _ as _sfc_main$1 } from './StatusDot-DAsg-S3-.mjs';
import { _ as _sfc_main$1$1, a as _sfc_main$2 } from './TypingIndicator-YjROmgLM.mjs';
import { defineComponent, ref, computed, watch, mergeProps, unref, nextTick, useSSRContext } from 'vue';
import { ssrRenderAttrs, ssrRenderComponent, ssrRenderStyle, ssrRenderList, ssrIncludeBooleanAttr, ssrInterpolate, ssrRenderAttr, ssrRenderClass } from 'vue/server-renderer';
import { u as useDevBridge } from './useDevBridge-zfu9xC6m.mjs';
import { u as useHead } from './server.mjs';
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

const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "chat",
  __ssrInlineRender: true,
  setup(__props) {
    const bridge = useDevBridge();
    const cliList = ref([]);
    const cliLaunching = ref({});
    const replyTarget = ref(
      "bash"
    );
    const ideState = computed(() => {
      var _a, _b;
      return (_b = (_a = bridge.agentStatus.value) == null ? void 0 : _a.ideState) != null ? _b : null;
    });
    const terminals = computed(
      () => {
        var _a;
        return Array.isArray((_a = ideState.value) == null ? void 0 : _a.terminals) ? ideState.value.terminals : [];
      }
    );
    const chatTargets = computed(() => {
      const list = [
        { id: "bash", label: "BASH", terminalName: "bash", state: replyTarget.value === "bash" ? "active" : "idle" }
      ];
      for (const cli of cliList.value) {
        const terminalName = `DevBridge ${cli.name}`;
        const isLaunched = terminals.value.some((t) => {
          var _a;
          return String((_a = t.name) != null ? _a : "") === terminalName;
        });
        const isStarting = Boolean(cliLaunching.value[cli.id]);
        list.push({
          id: cli.id,
          label: cliButtonName(cli),
          terminalName,
          state: isStarting ? "starting" : replyTarget.value === cli.id && isLaunched ? "active" : "idle"
        });
      }
      return list;
    });
    function setTarget(id) {
      replyTarget.value = id;
    }
    const messages = ref([]);
    const draft = ref("");
    const aiTyping = ref(false);
    const currentTool = ref(null);
    const recording = ref(false);
    const scrollEl = ref(null);
    ref(null);
    function nowTs() {
      return Date.now();
    }
    function scrollToBottom() {
      nextTick(() => {
        if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight;
      });
    }
    bridge.onMessage((msg) => {
      var _a, _b, _c, _d, _e;
      if (msg.type === "chat_response" || msg.type === "ai_message") {
        aiTyping.value = false;
        currentTool.value = null;
        messages.value.push({
          id: Date.now().toString(),
          text: (_a = msg.text) != null ? _a : "",
          direction: "ai",
          tool: msg.tool,
          ts: nowTs()
        });
        scrollToBottom();
      } else if (msg.type === "ai_typing") {
        aiTyping.value = true;
        currentTool.value = (_b = msg.tool) != null ? _b : null;
      } else if (msg.type === "clis_update" && Array.isArray(msg.clis)) {
        cliList.value = msg.clis;
      } else if (msg.type === "cli_started") {
        String((_c = msg.terminalName) != null ? _c : "");
        cliLaunching.value[String((_d = msg.cliId) != null ? _d : "")] = false;
        if (msg.cliId) setTarget(String(msg.cliId));
        void bridge.fetchAgentStatus();
      } else if (msg.type === "terminal_closed") {
        const terminalName = String((_e = msg.terminalName) != null ? _e : "");
        const closedCli = cliList.value.find((cli) => `DevBridge ${cli.name}` === terminalName);
        if (closedCli && replyTarget.value === closedCli.id) setTarget("bash");
        if (terminalName === "bash" && replyTarget.value === "bash") setTarget("bash");
      }
    });
    watch(() => bridge.status.value, (status) => {
      var _a, _b;
      if (status === "connected") {
        const token = (_a = bridge.token.value) != null ? _a : "";
        const base = (_b = bridge.activeUrl.value) != null ? _b : "";
        if (base) {
          fetch(`${base}/clis`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()).then((d) => {
            if (d.clis) cliList.value = d.clis;
          }).catch(() => {
          });
        }
      }
    }, { immediate: true });
    useHead({ title: "Chat \u2014 VibeBridge" });
    const selectedTargetReady = computed(() => {
      if (replyTarget.value === "bash") return true;
      const selected = chatTargets.value.find((target) => target.id === replyTarget.value);
      return Boolean(selected && selected.state !== "starting" && selected.terminalName && terminals.value.some(
        (t) => {
          var _a;
          return String((_a = t.name) != null ? _a : "") === selected.terminalName;
        }
      ));
    });
    watch(chatTargets, (targets) => {
      if (!targets.some((target) => target.id === replyTarget.value)) {
        setTarget("bash");
      }
    }, { immediate: true });
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
    return (_ctx, _push, _parent, _attrs) => {
      var _a;
      const _component_StatusDot = _sfc_main$1;
      const _component_ChatBubble = _sfc_main$1$1;
      const _component_TypingIndicator = _sfc_main$2;
      _push(`<div${ssrRenderAttrs(mergeProps({ class: "flex flex-col h-[calc(100dvh-3.5rem)] lg:h-[calc(100dvh-3rem)]" }, _attrs))}><div class="flex items-center justify-between border-b border-border px-4 py-2 shrink-0"><p class="text-xs uppercase tracking-widest text-muted">CHAT IA</p><div class="flex items-center gap-3">`);
      _push(ssrRenderComponent(_component_StatusDot, {
        state: unref(bridge).status.value
      }, null, _parent));
      _push(`<button class="text-xs text-muted hover:text-text transition-colors uppercase tracking-widest"> EFFACER </button></div></div>`);
      if (unref(bridge).authError.value) {
        _push(`<div class="shrink-0 flex items-center justify-between px-4 py-2 text-xs uppercase tracking-widest" style="${ssrRenderStyle({ "background": "rgba(239,68,68,0.12)", "border-bottom": "1px solid var(--dot-red)", "color": "var(--dot-red)" })}"><span>QR expir\xE9 \u2014 scannez \xE0 nouveau</span><button class="ml-4 underline">Effacer</button></div>`);
      } else {
        _push(`<!---->`);
      }
      _push(`<div class="shrink-0 border-b border-border px-3 py-2"><div class="flex gap-1.5 overflow-x-auto"><!--[-->`);
      ssrRenderList(unref(chatTargets), (target) => {
        _push(`<button${ssrIncludeBooleanAttr(target.state === "starting") ? " disabled" : ""} class="shrink-0 text-[10px] uppercase tracking-[0.14em] px-3 py-1.5 font-mono transition-colors disabled:pointer-events-none" style="${ssrRenderStyle(targetButtonStyle(target))}">${ssrInterpolate(targetButtonLabel(target))}</button>`);
      });
      _push(`<!--]--></div></div><div class="flex-1 overflow-y-auto p-4 space-y-3">`);
      if (unref(messages).length) {
        _push(`<!--[-->`);
        ssrRenderList(unref(messages), (m) => {
          _push(ssrRenderComponent(_component_ChatBubble, {
            key: m.id,
            text: m.text,
            direction: m.direction,
            tool: m.tool,
            ts: m.ts
          }, null, _parent));
        });
        _push(`<!--]-->`);
      } else {
        _push(`<p class="text-dimmed text-xs text-center mt-8 uppercase tracking-widest"> \u2014 AUCUN MESSAGE \u2014 </p>`);
      }
      if (unref(aiTyping)) {
        _push(ssrRenderComponent(_component_TypingIndicator, {
          tool: (_a = unref(currentTool)) != null ? _a : void 0
        }, null, _parent));
      } else {
        _push(`<!---->`);
      }
      _push(`</div><div class="shrink-0 border-t border-border p-3"><div class="flex gap-2 items-end"><textarea${ssrRenderAttr("rows", 1)} placeholder="MESSAGE\u2026" class="flex-1 bg-surface border border-border text-text text-sm px-3 py-2 font-mono resize-none focus:outline-none focus:border-text max-h-40 overflow-auto">${ssrInterpolate(unref(draft))}</textarea><button class="${ssrRenderClass([unref(recording) ? "border-dot-amber text-dot-amber" : "border-border text-muted hover:text-text", "border px-3 py-2 text-sm transition-colors"])}"> \u25CE </button><button${ssrIncludeBooleanAttr(!unref(draft).trim() || unref(bridge).status.value !== "connected" || !unref(selectedTargetReady)) ? " disabled" : ""} class="border border-text text-text text-xs uppercase tracking-widest px-4 py-2 hover:bg-surface2 disabled:opacity-30 transition-colors"> \u25B6 </button></div>`);
      if (unref(recording)) {
        _push(`<p class="text-dot-amber text-xs mt-1 uppercase tracking-widest"> \u25CF \xC9COUTE EN COURS\u2026 </p>`);
      } else {
        _push(`<!---->`);
      }
      _push(`</div></div>`);
    };
  }
});
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("pages/chat.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};

export { _sfc_main as default };
//# sourceMappingURL=chat-D4sfzvaL.mjs.map
