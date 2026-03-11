import { _ as __nuxt_component_0 } from './nuxt-link-3Itqqbs-.mjs';
import { defineComponent, mergeProps, unref, withCtx, createTextVNode, useSSRContext } from 'vue';
import { ssrRenderAttrs, ssrRenderStyle, ssrRenderList, ssrRenderClass, ssrInterpolate, ssrRenderComponent, ssrRenderSlot } from 'vue/server-renderer';
import { f as useState } from './server.mjs';
import { u as useViewMode } from './useViewMode-hlPgSG_f.mjs';
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

const useColorMode = () => {
  return useState("color-mode").value;
};
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "default",
  __ssrInlineRender: true,
  setup(__props) {
    const colorMode = useColorMode();
    const activeView = useViewMode();
    const views = [
      { id: "both", label: "Both" },
      { id: "pc", label: "PC" },
      { id: "mobile", label: "Mobile" }
    ];
    return (_ctx, _push, _parent, _attrs) => {
      const _component_NuxtLink = __nuxt_component_0;
      _push(`<div${ssrRenderAttrs(mergeProps({
        class: ["min-h-screen bg-bg text-text flex flex-col", unref(colorMode).value]
      }, _attrs))}><header class="fixed top-0 left-0 right-0 h-12 z-50 flex items-center justify-between px-6" style="${ssrRenderStyle({ "background": "var(--bg)", "border-bottom": "1px solid var(--border)" })}"><span class="font-display text-xs tracking-[0.3em] uppercase text-text">DevBridge</span><div class="flex items-center gap-4"><div class="hidden lg:flex" style="${ssrRenderStyle({ "border": "1px solid var(--border)" })}"><!--[-->`);
      ssrRenderList(views, (v) => {
        _push(`<button style="${ssrRenderStyle(unref(activeView) === v.id ? "background:var(--text);color:var(--bg)" : "background:none;color:var(--muted);border-right:1px solid var(--border)")}" class="${ssrRenderClass([v.id === "mobile" ? "!border-r-0" : "", "text-[10px] tracking-[0.15em] uppercase px-3.5 py-1.5 transition-colors"])}">${ssrInterpolate(v.label)}</button>`);
      });
      _push(`<!--]--></div><button class="text-[10px] tracking-[0.1em] uppercase px-3 py-1.5 transition-colors" style="${ssrRenderStyle({ "border": "1px solid var(--border)", "background": "none", "color": "var(--muted)" })}">${ssrInterpolate(unref(colorMode).value === "dark" ? "Light" : "Dark")}</button>`);
      _push(ssrRenderComponent(_component_NuxtLink, {
        to: "/settings",
        class: "text-[10px] tracking-[0.1em] uppercase px-3 py-1.5 transition-colors",
        style: { "border": "1px solid var(--border)", "background": "none", "color": "var(--muted)" },
        title: "Param\xE8tres r\xE9seau"
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
      _push(`</div></header><main class="flex-1 pt-12 overflow-hidden">`);
      ssrRenderSlot(_ctx.$slots, "default", { activeView: unref(activeView) }, null, _push, _parent);
      _push(`</main></div>`);
    };
  }
});
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("layouts/default.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};

export { _sfc_main as default };
//# sourceMappingURL=default-DKvnKqWW.mjs.map
