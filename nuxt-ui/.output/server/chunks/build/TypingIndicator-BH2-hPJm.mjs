import { defineComponent, computed, mergeProps, unref, useSSRContext } from 'vue';
import { ssrRenderAttrs, ssrInterpolate, ssrRenderClass, ssrRenderList } from 'vue/server-renderer';

const _sfc_main$2 = /* @__PURE__ */ defineComponent({
  __name: "StatusDot",
  __ssrInlineRender: true,
  props: {
    state: {},
    pulse: { type: Boolean }
  },
  setup(__props) {
    const props = __props;
    const colorClass = computed(() => ({
      connected: "bg-dot-green",
      connecting: "bg-dot-amber",
      disconnected: "bg-dot-red"
    })[props.state]);
    const pulse = computed(() => props.state === "connecting");
    return (_ctx, _push, _parent, _attrs) => {
      _push(`<span${ssrRenderAttrs(mergeProps({
        class: ["inline-block w-2 h-2 rounded-full shrink-0", [unref(colorClass), unref(pulse) ? "vb-pulse" : ""]]
      }, _attrs))}></span>`);
    };
  }
});
const _sfc_setup$2 = _sfc_main$2.setup;
_sfc_main$2.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("components/StatusDot.vue");
  return _sfc_setup$2 ? _sfc_setup$2(props, ctx) : void 0;
};
const _sfc_main$1 = /* @__PURE__ */ defineComponent({
  __name: "ChatBubble",
  __ssrInlineRender: true,
  props: {
    text: {},
    direction: {},
    tool: {},
    ts: {}
  },
  setup(__props) {
    const props = __props;
    const lines = computed(() => props.text.split("\n"));
    const fmtTime = (ts) => {
      const d = new Date(ts);
      return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
    };
    return (_ctx, _push, _parent, _attrs) => {
      _push(`<div${ssrRenderAttrs(mergeProps({
        class: ["flex flex-col gap-1", __props.direction === "user" ? "items-end" : "items-start"]
      }, _attrs))}><span class="text-[9px] uppercase tracking-widest text-muted px-1">${ssrInterpolate(__props.direction === "user" ? "YOU" : __props.tool)}</span><div class="${ssrRenderClass([__props.direction === "user" ? "bg-surface2 border-text text-text" : "bg-surface border-border text-text", "max-w-[80%] px-3 py-2 text-xs leading-relaxed border"])}"><!--[-->`);
      ssrRenderList(unref(lines), (line, i) => {
        _push(`<span>${ssrInterpolate(line)}`);
        if (i < unref(lines).length - 1) {
          _push(`<br>`);
        } else {
          _push(`<!---->`);
        }
        _push(`</span>`);
      });
      _push(`<!--]--></div><span class="text-[9px] text-dimmed tabular-nums px-1">${ssrInterpolate(fmtTime(__props.ts))}</span></div>`);
    };
  }
});
const _sfc_setup$1 = _sfc_main$1.setup;
_sfc_main$1.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("components/ChatBubble.vue");
  return _sfc_setup$1 ? _sfc_setup$1(props, ctx) : void 0;
};
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "TypingIndicator",
  __ssrInlineRender: true,
  props: {
    tool: {}
  },
  setup(__props) {
    return (_ctx, _push, _parent, _attrs) => {
      _push(`<div${ssrRenderAttrs(mergeProps({ class: "flex items-center gap-1 px-3 py-2 bg-surface border border-border w-fit" }, _attrs))}><span class="text-[9px] uppercase tracking-widest text-muted mr-2">${ssrInterpolate(__props.tool)}</span><span class="w-1.5 h-1.5 rounded-full bg-text vb-dot-1"></span><span class="w-1.5 h-1.5 rounded-full bg-text vb-dot-2"></span><span class="w-1.5 h-1.5 rounded-full bg-text vb-dot-3"></span></div>`);
    };
  }
});
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("components/TypingIndicator.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};

export { _sfc_main$2 as _, _sfc_main$1 as a, _sfc_main as b };
//# sourceMappingURL=TypingIndicator-BH2-hPJm.mjs.map
