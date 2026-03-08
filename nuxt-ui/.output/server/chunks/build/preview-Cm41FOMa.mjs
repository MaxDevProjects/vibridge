import { defineComponent, ref, computed, mergeProps, unref, useSSRContext } from 'vue';
import { ssrRenderAttrs, ssrRenderAttr, ssrRenderList, ssrRenderClass, ssrInterpolate, ssrRenderStyle } from 'vue/server-renderer';
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
  __name: "preview",
  __ssrInlineRender: true,
  setup(__props) {
    const bridge = useDevBridge();
    const devices = [
      { label: "FULL", width: 0, height: 0 },
      { label: "LG", width: 1024, height: 768 },
      { label: "MD", width: 768, height: 1024 },
      { label: "SM", width: 390, height: 844 }
    ];
    const urlInput = ref("http://localhost:5173");
    const activeUrl = ref("");
    const activeDevice = ref("FULL");
    const frameLoading = ref(false);
    ref(null);
    const currentDevice = computed(() => {
      var _a;
      return (_a = devices.find((d) => d.label === activeDevice.value)) != null ? _a : devices[0];
    });
    const frameStyle = computed(() => {
      const d = currentDevice.value;
      if (!d || d.width === 0) return { width: "100%", height: "70vh" };
      return { width: `${d.width}px`, height: `${d.height}px` };
    });
    bridge.onMessage((msg) => {
      if (msg.type === "dev_server_url" && msg.url) {
        urlInput.value = msg.url;
      }
    });
    useHead({ title: "Aper\xE7u \u2014 VibeBridge" });
    return (_ctx, _push, _parent, _attrs) => {
      _push(`<div${ssrRenderAttrs(mergeProps({ class: "flex flex-col h-[calc(100dvh-3.5rem)] lg:h-[calc(100dvh-3rem)]" }, _attrs))}><div class="flex items-center gap-3 border-b border-border px-4 py-2 shrink-0 flex-wrap"><p class="text-xs uppercase tracking-widest text-muted mr-2">APER\xC7U</p><input${ssrRenderAttr("value", unref(urlInput))} placeholder="http://localhost:5173" class="flex-1 min-w-48 bg-surface border border-border text-text text-xs px-3 py-1.5 font-mono focus:outline-none focus:border-text"><button class="border border-text text-text text-xs uppercase tracking-widest px-3 py-1.5 hover:bg-surface2 transition-colors"> GO </button><button class="border border-border text-muted text-xs uppercase tracking-widest px-3 py-1.5 hover:border-text hover:text-text transition-colors"> \u21BA </button><div class="flex gap-1 ml-auto"><!--[-->`);
      ssrRenderList(devices, (d) => {
        _push(`<button class="${ssrRenderClass([unref(activeDevice) === d.label ? "border-text text-text" : "border-border text-muted hover:border-text hover:text-text", "border text-xs px-2 py-1.5 transition-colors uppercase"])}">${ssrInterpolate(d.label)}</button>`);
      });
      _push(`<!--]--></div></div><div class="flex-1 overflow-auto flex justify-center items-start bg-surface2 p-4">`);
      if (unref(activeUrl)) {
        _push(`<div style="${ssrRenderStyle(unref(frameStyle))}" class="bg-bg border border-border overflow-hidden relative">`);
        if (unref(frameLoading)) {
          _push(`<div class="absolute inset-0 bg-bg flex items-center justify-center text-xs text-muted uppercase tracking-widest"> CHARGEMENT\u2026 </div>`);
        } else {
          _push(`<!---->`);
        }
        _push(`<iframe${ssrRenderAttr("src", unref(activeUrl))} class="w-full h-full border-none" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe></div>`);
      } else {
        _push(`<div class="text-dimmed text-xs uppercase tracking-widest mt-24"> \u2014 ENTREZ UNE URL POUR PR\xC9VISUALISER \u2014 </div>`);
      }
      _push(`</div></div>`);
    };
  }
});
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("pages/preview.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};

export { _sfc_main as default };
//# sourceMappingURL=preview-Cm41FOMa.mjs.map
