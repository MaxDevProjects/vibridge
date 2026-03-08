import { _ as _sfc_main$2, a as _sfc_main$1, b as _sfc_main$3 } from './TypingIndicator-BH2-hPJm.mjs';
import { defineComponent, ref, mergeProps, unref, nextTick, useSSRContext } from 'vue';
import { ssrRenderAttrs, ssrRenderComponent, ssrRenderList, ssrRenderAttr, ssrInterpolate, ssrRenderClass, ssrIncludeBooleanAttr } from 'vue/server-renderer';
import { u as useDevBridge } from './useDevBridge-C1lGm85E.mjs';
import { d as useHead } from './server.mjs';
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
      var _a, _b;
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
      }
    });
    useHead({ title: "Chat \u2014 VibeBridge" });
    return (_ctx, _push, _parent, _attrs) => {
      var _a;
      const _component_StatusDot = _sfc_main$2;
      const _component_ChatBubble = _sfc_main$1;
      const _component_TypingIndicator = _sfc_main$3;
      _push(`<div${ssrRenderAttrs(mergeProps({ class: "flex flex-col h-[calc(100dvh-3.5rem)] lg:h-[calc(100dvh-3rem)]" }, _attrs))}><div class="flex items-center justify-between border-b border-border px-4 py-2 shrink-0"><p class="text-xs uppercase tracking-widest text-muted">CHAT IA</p><div class="flex items-center gap-3">`);
      _push(ssrRenderComponent(_component_StatusDot, {
        state: unref(bridge).status.value
      }, null, _parent));
      _push(`<button class="text-xs text-muted hover:text-text transition-colors uppercase tracking-widest"> EFFACER </button></div></div><div class="flex-1 overflow-y-auto p-4 space-y-3">`);
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
      _push(`</div><div class="shrink-0 border-t border-border p-3"><div class="flex gap-2 items-end"><textarea${ssrRenderAttr("rows", 1)} placeholder="MESSAGE\u2026" class="flex-1 bg-surface border border-border text-text text-sm px-3 py-2 font-mono resize-none focus:outline-none focus:border-text max-h-40 overflow-auto">${ssrInterpolate(unref(draft))}</textarea><button class="${ssrRenderClass([unref(recording) ? "border-dot-amber text-dot-amber" : "border-border text-muted hover:text-text", "border px-3 py-2 text-sm transition-colors"])}"> \u25CE </button><button${ssrIncludeBooleanAttr(!unref(draft).trim() || unref(bridge).status.value !== "connected") ? " disabled" : ""} class="border border-text text-text text-xs uppercase tracking-widest px-4 py-2 hover:bg-surface2 disabled:opacity-30 transition-colors"> \u25B6 </button></div>`);
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
//# sourceMappingURL=chat-CnAER_KY.mjs.map
