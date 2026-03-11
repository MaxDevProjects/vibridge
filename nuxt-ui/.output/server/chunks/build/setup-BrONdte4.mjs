import { defineComponent, ref, computed, mergeProps, unref, useSSRContext } from 'vue';
import { ssrRenderAttrs, ssrRenderStyle, ssrRenderList, ssrRenderAttr, ssrIncludeBooleanAttr, ssrInterpolate } from 'vue/server-renderer';
import { a as useRoute, d as useNetworkConfig, u as useHead } from './server.mjs';
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
  __name: "setup",
  __ssrInlineRender: true,
  setup(__props) {
    useRoute();
    const { config: netConfig } = useNetworkConfig();
    const step = ref(1);
    const manualIp = ref(netConfig.value.manualIp);
    const manualPort = ref(netConfig.value.manualPort);
    const testResults = ref([]);
    const testing = ref(false);
    const noCandidate = ref(false);
    const mixedContentBlocked = computed(() => {
      return false;
    });
    const bestUrl = computed(() => {
      var _a, _b;
      return (_b = (_a = testResults.value.find((r) => r.status === "ok")) == null ? void 0 : _a.url) != null ? _b : "";
    });
    const canProceed = computed(() => testResults.value.some((r) => r.status === "ok"));
    useHead({ title: "Configuration \u2014 VibeBridge" });
    return (_ctx, _push, _parent, _attrs) => {
      _push(`<div${ssrRenderAttrs(mergeProps({ class: "flex flex-col items-center justify-center min-h-[calc(100dvh-3rem)] px-6 py-10" }, _attrs))}><div class="w-full max-w-sm space-y-6"><div class="text-center"><h1 class="font-display font-light text-3xl tracking-tight">VibeBridge</h1><p class="text-[11px] mt-2 tracking-widest" style="${ssrRenderStyle({ "color": "var(--muted)" })}">Configuration initiale</p></div><div class="flex gap-1.5 justify-center"><!--[-->`);
      ssrRenderList(4, (i) => {
        _push(`<span class="h-0.5 flex-1 max-w-12 transition-colors duration-300" style="${ssrRenderStyle(i <= unref(step) ? "background:var(--text)" : "background:var(--border)")}"></span>`);
      });
      _push(`<!--]--></div>`);
      if (unref(step) === 1) {
        _push(`<div class="space-y-5"><div style="${ssrRenderStyle({ "border": "1px solid var(--border)" })}"><div class="px-5 py-4" style="${ssrRenderStyle({ "border-bottom": "1px solid var(--border)" })}"><p class="text-[9px] uppercase tracking-[0.2em]" style="${ssrRenderStyle({ "color": "var(--muted)" })}">\xC9tape 1 / 4</p><p class="text-base mt-1 font-display font-light">Installer l&#39;extension VS Code</p></div><div class="px-5 py-4 space-y-4 text-[12px]" style="${ssrRenderStyle({ "color": "var(--muted)", "line-height": "1.7" })}"><p>L&#39;extension DevBridge connecte VS Code \xE0 cette application. Elle transmet le contexte de votre projet en temps r\xE9el.</p><a href="vscode:extension/devbridge.vibebridge" class="flex items-center justify-between px-4 py-3 text-[11px] uppercase tracking-widest transition-colors" style="${ssrRenderStyle({ "border": "1px solid var(--text)", "color": "var(--text)", "background": "none", "display": "flex" })}"> Ouvrir dans VS Code <span style="${ssrRenderStyle({ "color": "var(--muted)" })}">\u2197</span></a><p class="text-[10px]">Ou cherchez <span class="font-mono" style="${ssrRenderStyle({ "color": "var(--text)" })}">VibeBridge</span> dans le marketplace VS Code.</p></div></div><button class="w-full text-[11px] uppercase tracking-widest py-3 transition-colors" style="${ssrRenderStyle({ "border": "1px solid var(--text)", "color": "var(--text)", "background": "none" })}"> Continuer \u2192 </button></div>`);
      } else {
        _push(`<!---->`);
      }
      if (unref(step) === 2) {
        _push(`<div class="space-y-5"><div style="${ssrRenderStyle({ "border": "1px solid var(--border)" })}"><div class="px-5 py-4" style="${ssrRenderStyle({ "border-bottom": "1px solid var(--border)" })}"><p class="text-[9px] uppercase tracking-[0.2em]" style="${ssrRenderStyle({ "color": "var(--muted)" })}">\xC9tape 2 / 4</p><p class="text-base mt-1 font-display font-light">Scanner le QR code</p></div><div class="px-5 py-4 space-y-4 text-[12px]" style="${ssrRenderStyle({ "color": "var(--muted)", "line-height": "1.7" })}"><p>Dans VS Code, ouvrez la palette de commandes et tapez <span class="font-mono" style="${ssrRenderStyle({ "color": "var(--text)" })}">DevBridge: Show QR</span>.</p><p>Scannez le QR code affich\xE9. L&#39;URL pr\xE9sent\xE9e contient automatiquement l&#39;adresse IP et le token d&#39;authentification.</p><div class="pt-2 space-y-2"><p class="text-[10px] uppercase tracking-[0.12em]" style="${ssrRenderStyle({ "color": "var(--muted)" })}">Ou saisir l&#39;adresse manuellement :</p><div class="flex gap-2"><input${ssrRenderAttr("value", unref(manualIp))} placeholder="192.168.1.42" class="flex-1 text-[11px] font-mono px-3 py-2 outline-none" style="${ssrRenderStyle({ "background": "var(--surface)", "border": "1px solid var(--border)", "color": "var(--text)" })}"><input${ssrRenderAttr("value", unref(manualPort))} type="number" placeholder="3333" class="w-20 text-[11px] font-mono px-3 py-2 outline-none" style="${ssrRenderStyle({ "background": "var(--surface)", "border": "1px solid var(--border)", "color": "var(--text)" })}"></div>`);
        if (unref(manualIp)) {
          _push(`<button class="w-full text-[10px] uppercase tracking-widest py-2 transition-colors" style="${ssrRenderStyle({ "border": "1px solid var(--border)", "color": "var(--text)", "background": "none" })}"> Utiliser cette IP </button>`);
        } else {
          _push(`<!---->`);
        }
        _push(`</div></div></div><div class="flex gap-2"><button class="flex-1 text-[11px] uppercase tracking-widest py-3 transition-colors" style="${ssrRenderStyle({ "border": "1px solid var(--border)", "color": "var(--muted)", "background": "none" })}">\u2190 Retour</button><button class="flex-1 text-[11px] uppercase tracking-widest py-3 transition-colors" style="${ssrRenderStyle({ "border": "1px solid var(--text)", "color": "var(--text)", "background": "none" })}">Continuer \u2192</button></div></div>`);
      } else {
        _push(`<!---->`);
      }
      if (unref(step) === 3) {
        _push(`<div class="space-y-5"><div style="${ssrRenderStyle({ "border": "1px solid var(--border)" })}"><div class="px-5 py-4" style="${ssrRenderStyle({ "border-bottom": "1px solid var(--border)" })}"><p class="text-[9px] uppercase tracking-[0.2em]" style="${ssrRenderStyle({ "color": "var(--muted)" })}">\xC9tape 3 / 4</p><p class="text-base mt-1 font-display font-light">Tester la connexion</p></div><div class="px-5 py-4 space-y-3"><p class="text-[11px]" style="${ssrRenderStyle({ "color": "var(--muted)" })}">Assurez-vous que PC et t\xE9l\xE9phone sont sur le m\xEAme WiFi.</p><button${ssrIncludeBooleanAttr(unref(testing)) ? " disabled" : ""} class="w-full text-[11px] uppercase tracking-widest py-2.5 transition-colors disabled:opacity-40" style="${ssrRenderStyle({ "border": "1px solid var(--text)", "color": "var(--text)", "background": "none" })}">${ssrInterpolate(unref(testing) ? "Test en cours\u2026" : "Lancer le test")}</button>`);
        if (unref(testResults).length) {
          _push(`<div class="space-y-1.5 pt-1"><!--[-->`);
          ssrRenderList(unref(testResults), (r) => {
            _push(`<div class="flex items-center justify-between px-3 py-2 text-[10px]" style="${ssrRenderStyle({ "border": "1px solid var(--border)" })}"><div class="flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full shrink-0" style="${ssrRenderStyle(r.status === "ok" ? "background:var(--dot-green)" : r.status === "pending" ? "background:var(--dot-amber)" : "background:var(--dot-red)")}"></span><span class="font-mono break-all">${ssrInterpolate(r.url)}</span></div><span class="shrink-0 ml-2" style="${ssrRenderStyle(r.status === "ok" ? "color:var(--dot-green)" : "color:var(--muted)")}">${ssrInterpolate(r.status === "pending" ? "\u2026" : r.status === "ok" ? `${r.ms}ms` : "\u2717")}</span></div>`);
          });
          _push(`<!--]--></div>`);
        } else {
          _push(`<!---->`);
        }
        if (unref(mixedContentBlocked)) {
          _push(`<div class="space-y-1.5 pt-1 px-3 py-2.5 text-[10px]" style="${ssrRenderStyle({ "border": "1px solid var(--dot-amber)", "color": "var(--dot-amber)", "line-height": "1.6" })}"><p class="font-semibold uppercase tracking-[0.12em]">\u26A0 Mixed Content \u2014 test impossible</p><p style="${ssrRenderStyle({ "color": "var(--muted)" })}"> Cette page est en <strong style="${ssrRenderStyle({ "color": "var(--text)" })}">HTTPS</strong> mais l&#39;agent tourne en <strong style="${ssrRenderStyle({ "color": "var(--text)" })}">HTTP</strong>. Les navigateurs bloquent ces requ\xEAtes \u2014 les tests \xE9choueront m\xEAme si l&#39;agent r\xE9pond correctement. </p><p style="${ssrRenderStyle({ "color": "var(--muted)" })}">Deux alternatives :</p><ul class="space-y-1 pl-2" style="${ssrRenderStyle({ "color": "var(--muted)" })}"><li>\u2192 Acc\xE9dez \xE0 l&#39;UI via l&#39;URL locale : <span class="font-mono" style="${ssrRenderStyle({ "color": "var(--text)" })}">http://devbridge.local:8080</span></li><li>\u2192 Ou activez le mode Relay (connexion chiffr\xE9e via le serveur)</li></ul></div>`);
        } else {
          _push(`<!---->`);
        }
        if (unref(noCandidate)) {
          _push(`<p class="text-[10px]" style="${ssrRenderStyle({ "color": "var(--dot-red)" })}"> Aucun candidat \u2014 configurez une IP manuelle \xE0 l&#39;\xE9tape 2. </p>`);
        } else {
          _push(`<!---->`);
        }
        _push(`</div></div><div class="flex gap-2"><button class="flex-1 text-[11px] uppercase tracking-widest py-3 transition-colors" style="${ssrRenderStyle({ "border": "1px solid var(--border)", "color": "var(--muted)", "background": "none" })}">\u2190 Retour</button><button${ssrIncludeBooleanAttr(!unref(canProceed) && !unref(mixedContentBlocked)) ? " disabled" : ""} class="flex-1 text-[11px] uppercase tracking-widest py-3 transition-colors disabled:opacity-40" style="${ssrRenderStyle({ "border": "1px solid var(--text)", "color": "var(--text)", "background": "none" })}"> Continuer \u2192 </button></div></div>`);
      } else {
        _push(`<!---->`);
      }
      if (unref(step) === 4) {
        _push(`<div class="space-y-5 text-center"><div style="${ssrRenderStyle({ "border": "1px solid var(--dot-green)" })}"><div class="px-5 py-8 space-y-3"><p class="text-3xl">\u2713</p><p class="font-display font-light text-xl" style="${ssrRenderStyle({ "color": "var(--dot-green)" })}">C&#39;est pr\xEAt !</p><p class="text-[11px]" style="${ssrRenderStyle({ "color": "var(--muted)" })}"> Connexion \xE9tablie via <span class="font-mono" style="${ssrRenderStyle({ "color": "var(--text)" })}">${ssrInterpolate(unref(bestUrl))}</span></p></div></div><button class="w-full text-[11px] uppercase tracking-widest py-3 transition-colors" style="${ssrRenderStyle({ "border": "1px solid var(--text)", "color": "var(--text)", "background": "none" })}"> Ouvrir DevBridge \u2192 </button></div>`);
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
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("pages/setup.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};

export { _sfc_main as default };
//# sourceMappingURL=setup-BrONdte4.mjs.map
