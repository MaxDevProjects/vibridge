import { defineComponent, computed, mergeProps, unref, useSSRContext } from 'vue';
import { ssrRenderAttrs, ssrRenderClass, ssrRenderStyle, ssrInterpolate } from 'vue/server-renderer';

const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "StatusDot",
  __ssrInlineRender: true,
  props: {
    state: {},
    pulse: { type: Boolean },
    mode: {},
    latency: {}
  },
  setup(__props) {
    const props = __props;
    const colorClass = computed(() => ({
      connected: "bg-dot-green",
      connecting: "bg-dot-amber",
      disconnected: "bg-dot-red"
    })[props.state]);
    const pulse = computed(() => props.state === "connecting");
    const labelText = computed(() => {
      if (!props.mode && props.latency == null) return "";
      if (props.state === "connecting") return "Connexion\u2026";
      if (props.state === "disconnected") return "Hors ligne";
      const modeLabel = props.mode === "relay" ? "Relay" : props.mode === "local" ? "Local" : "";
      const latLabel = props.latency != null ? `\xB7 ${props.latency}ms` : "";
      return [modeLabel, latLabel].filter(Boolean).join(" ");
    });
    const labelStyle = computed(() => {
      const c = { connected: "var(--dot-green)", connecting: "var(--dot-amber)", disconnected: "var(--dot-red)" }[props.state];
      return `color:${c}`;
    });
    return (_ctx, _push, _parent, _attrs) => {
      _push(`<span${ssrRenderAttrs(mergeProps({ class: "inline-flex items-center gap-1.5" }, _attrs))}><span class="${ssrRenderClass([[unref(colorClass), unref(pulse) ? "vb-pulse" : ""], "inline-block w-2 h-2 rounded-full shrink-0"])}"></span>`);
      if (unref(labelText)) {
        _push(`<span class="text-[10px] tracking-[0.08em] uppercase" style="${ssrRenderStyle(unref(labelStyle))}">${ssrInterpolate(unref(labelText))}</span>`);
      } else {
        _push(`<!---->`);
      }
      _push(`</span>`);
    };
  }
});
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("components/StatusDot.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};

export { _sfc_main as _ };
//# sourceMappingURL=StatusDot-DAsg-S3-.mjs.map
