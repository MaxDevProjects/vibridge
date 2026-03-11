import { _ as _sfc_main$1 } from './FileTree-Civ6YQ1j.mjs';
import { defineComponent, ref, watch, mergeProps, unref, useSSRContext } from 'vue';
import { ssrRenderAttrs, ssrRenderComponent, ssrInterpolate } from 'vue/server-renderer';
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
  __name: "code",
  __ssrInlineRender: true,
  setup(__props) {
    const bridge = useDevBridge();
    const tree = ref([]);
    const activePath = ref(null);
    const fileContent = ref(null);
    const loading = ref(false);
    const showMobileTree = ref(false);
    function baseUrl() {
      return "";
    }
    async function refreshTree() {
      var _a, _b;
      if (bridge.mode.value === "relay") {
        tree.value = (_b = (_a = bridge.agentStatus.value) == null ? void 0 : _a.fileTree) != null ? _b : [];
        return;
      }
      try {
        const res = await fetch(`${baseUrl()}/files`, {
          headers: { Authorization: `Bearer ${bridge.token.value}` }
        });
        if (res.ok) tree.value = await res.json();
      } catch {
      }
    }
    async function openFile(path) {
      activePath.value = path;
      fileContent.value = null;
      loading.value = true;
      if (bridge.mode.value === "relay") {
        fileContent.value = "[LECTURE DE FICHIER DIRECTE NON ENCORE RELAYEE]";
        loading.value = false;
        return;
      }
      try {
        const res = await fetch(`${baseUrl()}/files/${encodeURIComponent(path)}`, {
          headers: { Authorization: `Bearer ${bridge.token.value}` }
        });
        if (res.ok) fileContent.value = await res.text();
        else fileContent.value = `[ERREUR ${res.status}]`;
      } catch {
        fileContent.value = "[IMPOSSIBLE DE CHARGER]";
      } finally {
        loading.value = false;
      }
    }
    function openFileMobile(path) {
      openFile(path);
      showMobileTree.value = false;
    }
    bridge.onMessage((msg) => {
      if (msg.type === "file_changed" && msg.path === activePath.value) {
        openFile(activePath.value);
      }
    });
    watch(() => bridge.status.value, (s) => {
      if (s === "connected") refreshTree();
    });
    useHead({ title: "Code \u2014 VibeBridge" });
    return (_ctx, _push, _parent, _attrs) => {
      var _a, _b, _c;
      const _component_FileTree = _sfc_main$1;
      _push(`<div${ssrRenderAttrs(mergeProps({ class: "flex h-[calc(100dvh-3.5rem)] lg:h-[calc(100dvh-3rem)]" }, _attrs))}><aside class="w-64 shrink-0 border-r border-border flex flex-col hidden lg:flex"><div class="flex items-center justify-between px-4 py-3 border-b border-border"><p class="text-xs uppercase tracking-widest text-muted">FICHIERS</p><button class="text-xs text-muted hover:text-text">\u21BA</button></div><div class="flex-1 overflow-y-auto p-2">`);
      if (unref(tree).length) {
        _push(ssrRenderComponent(_component_FileTree, {
          nodes: unref(tree),
          active: (_a = unref(activePath)) != null ? _a : void 0,
          onSelect: openFile
        }, null, _parent));
      } else {
        _push(`<p class="text-dimmed text-xs px-2 py-4">\u2014 VIDE \u2014</p>`);
      }
      _push(`</div></aside><div class="flex-1 flex flex-col min-w-0"><div class="flex items-center justify-between border-b border-border px-4 py-2 shrink-0"><p class="text-xs text-muted font-mono truncate max-w-xs lg:max-w-none">${ssrInterpolate((_b = unref(activePath)) != null ? _b : "AUCUN FICHIER")}</p><button class="lg:hidden text-xs text-muted hover:text-text uppercase tracking-widest"> \u25E7 FICHIERS </button></div>`);
      if (unref(showMobileTree)) {
        _push(`<div class="lg:hidden border-b border-border p-2 max-h-48 overflow-y-auto bg-surface">`);
        if (unref(tree).length) {
          _push(ssrRenderComponent(_component_FileTree, {
            nodes: unref(tree),
            active: (_c = unref(activePath)) != null ? _c : void 0,
            onSelect: openFileMobile
          }, null, _parent));
        } else {
          _push(`<!---->`);
        }
        _push(`</div>`);
      } else {
        _push(`<!---->`);
      }
      _push(`<div class="flex-1 overflow-auto p-4">`);
      if (unref(loading)) {
        _push(`<p class="text-dimmed text-xs uppercase tracking-widest">CHARGEMENT\u2026</p>`);
      } else if (unref(fileContent) !== null) {
        _push(`<pre class="text-text text-xs leading-relaxed whitespace-pre-wrap break-words font-mono">${ssrInterpolate(unref(fileContent))}</pre>`);
      } else {
        _push(`<p class="text-dimmed text-xs text-center mt-16 uppercase tracking-widest"> \u2014 S\xC9LECTIONNEZ UN FICHIER \u2014 </p>`);
      }
      _push(`</div></div></div>`);
    };
  }
});
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("pages/code.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};

export { _sfc_main as default };
//# sourceMappingURL=code-BuDyx5La.mjs.map
