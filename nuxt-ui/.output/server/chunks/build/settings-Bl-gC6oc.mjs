import { _ as __nuxt_component_0 } from './nuxt-link-3Itqqbs-.mjs';
import { _ as _sfc_main$1 } from './StatusDot-DAsg-S3-.mjs';
import { defineComponent, ref, computed, reactive, mergeProps, withCtx, createTextVNode, unref, useSSRContext } from 'vue';
import { ssrRenderAttrs, ssrRenderStyle, ssrRenderComponent, ssrInterpolate, ssrRenderList, ssrRenderAttr, ssrIncludeBooleanAttr, ssrLooseEqual } from 'vue/server-renderer';
import { u as useDevBridge } from './useDevBridge-zfu9xC6m.mjs';
import { d as useNetworkConfig, e as useNuxtApp, u as useHead } from './server.mjs';
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
  __name: "settings",
  __ssrInlineRender: true,
  setup(__props) {
    const bridge = useDevBridge();
    const { config: netConfig } = useNetworkConfig();
    const httpsContext = false;
    const modeOptions = [
      { value: "auto", label: "Auto", desc: "Tente mDNS \u2192 IP manuelle \u2192 Relay dans l'ordre" },
      { value: "local", label: "Local forc\xE9", desc: "N'utilise que le r\xE9seau local (mDNS ou IP manuelle)" },
      { value: "relay", label: "Relay forc\xE9", desc: "Passe syst\xE9matiquement par le serveur relay" }
    ];
    const testResults = ref([]);
    const testing = ref(false);
    const bestResult = computed(
      () => {
        var _a;
        return (_a = testResults.value.find((r) => r.status === "ok")) != null ? _a : null;
      }
    );
    const cliList = ref([]);
    const detecting = ref(false);
    const showAddCli = ref(false);
    const addingCli = ref(false);
    const newCli = reactive({ name: "", command: "", args: "" });
    useNuxtApp().$router;
    useHead({ title: "Param\xE8tres \u2014 VibeBridge" });
    return (_ctx, _push, _parent, _attrs) => {
      const _component_NuxtLink = __nuxt_component_0;
      const _component_StatusDot = _sfc_main$1;
      _push(`<div${ssrRenderAttrs(mergeProps({ class: "flex flex-col min-h-[calc(100dvh-3rem)] overflow-y-auto" }, _attrs))}><div class="px-6 py-6 shrink-0" style="${ssrRenderStyle({ "border-bottom": "1px solid var(--border)" })}"><div class="flex items-center justify-between"><div><h1 class="font-display font-light text-2xl tracking-tight">Param\xE8tres</h1><p class="text-[11px] mt-1 tracking-widest" style="${ssrRenderStyle({ "color": "var(--muted)" })}">R\xE9seau \xB7 Connexion</p></div>`);
      _push(ssrRenderComponent(_component_NuxtLink, {
        to: "/",
        class: "text-[10px] uppercase tracking-widest px-3 py-1.5 transition-colors",
        style: { "border": "1px solid var(--border)", "color": "var(--muted)" }
      }, {
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(` \u2190 Retour `);
          } else {
            return [
              createTextVNode(" \u2190 Retour ")
            ];
          }
        }),
        _: 1
      }, _parent));
      _push(`</div></div><div class="flex-1 px-6 py-6 max-w-xl space-y-6">`);
      if (unref(httpsContext)) {
        _push(`<section style="${ssrRenderStyle({ "border": "1px solid var(--dot-amber)" })}"><div class="px-5 py-3" style="${ssrRenderStyle({ "border-bottom": "1px solid var(--dot-amber)" })}"><p class="text-[9px] uppercase tracking-[0.2em]" style="${ssrRenderStyle({ "color": "var(--dot-amber)" })}">Mode Cloud Actif</p></div><div class="px-5 py-4 space-y-2 text-[11px]" style="${ssrRenderStyle({ "color": "var(--muted)", "line-height": "1.7" })}"><p>La PWA est charg\xE9e depuis <strong style="${ssrRenderStyle({ "color": "var(--text)" })}">HTTPS</strong>. La connexion passe obligatoirement par le relay s\xE9curis\xE9.</p>`);
        if (unref(netConfig).relayUrl) {
          _push(`<p class="font-mono text-[10px]" style="${ssrRenderStyle({ "color": "var(--text)" })}">${ssrInterpolate(unref(netConfig).relayUrl)}</p>`);
        } else {
          _push(`<p class="text-[10px]" style="${ssrRenderStyle({ "color": "var(--dot-red)" })}">Aucun relay configur\xE9 \u2014 d\xE9finissez NUXT_PUBLIC_RELAY_URL.</p>`);
        }
        _push(`<p class="text-[10px]">\u2192 Les options IP locale et mDNS ne sont pas disponibles depuis HTTPS.</p></div></section>`);
      } else {
        _push(`<!---->`);
      }
      if (!unref(httpsContext)) {
        _push(`<section style="${ssrRenderStyle({ "border": "1px solid var(--border)" })}"><div class="px-5 py-3" style="${ssrRenderStyle({ "border-bottom": "1px solid var(--border)" })}"><p class="text-[9px] uppercase tracking-[0.2em]" style="${ssrRenderStyle({ "color": "var(--muted)" })}">Mode de connexion</p></div><div class="px-5 py-4 space-y-3"><!--[-->`);
        ssrRenderList(modeOptions, (opt) => {
          _push(`<label class="flex items-start gap-3 cursor-pointer group"><input type="radio"${ssrRenderAttr("value", opt.value)}${ssrIncludeBooleanAttr(ssrLooseEqual(unref(netConfig).mode, opt.value)) ? " checked" : ""} class="mt-0.5 accent-current"><div><p class="text-[11px] uppercase tracking-[0.1em]">${ssrInterpolate(opt.label)}</p><p class="text-[10px] mt-0.5" style="${ssrRenderStyle({ "color": "var(--muted)" })}">${ssrInterpolate(opt.desc)}</p></div></label>`);
        });
        _push(`<!--]--></div></section>`);
      } else {
        _push(`<!---->`);
      }
      if (!unref(httpsContext)) {
        _push(`<section style="${ssrRenderStyle({ "border": "1px solid var(--border)" })}"><div class="px-5 py-3" style="${ssrRenderStyle({ "border-bottom": "1px solid var(--border)" })}"><p class="text-[9px] uppercase tracking-[0.2em]" style="${ssrRenderStyle({ "color": "var(--muted)" })}">IP manuelle (optionnel)</p></div><div class="px-5 py-4 space-y-3"><div><p class="text-[9px] uppercase tracking-[0.12em] mb-1.5" style="${ssrRenderStyle({ "color": "var(--muted)" })}">Adresse IP du PC</p><input${ssrRenderAttr("value", unref(netConfig).manualIp)} placeholder="192.168.1.42" class="w-full text-[12px] font-mono px-3 py-2 outline-none" style="${ssrRenderStyle({ "background": "var(--surface)", "border": "1px solid var(--border)", "color": "var(--text)" })}"></div><div><p class="text-[9px] uppercase tracking-[0.12em] mb-1.5" style="${ssrRenderStyle({ "color": "var(--muted)" })}">Port Agent</p><input${ssrRenderAttr("value", unref(netConfig).manualPort)} type="number" placeholder="3333" class="w-28 text-[12px] font-mono px-3 py-2 outline-none" style="${ssrRenderStyle({ "background": "var(--surface)", "border": "1px solid var(--border)", "color": "var(--text)" })}"></div></div></section>`);
      } else {
        _push(`<!---->`);
      }
      _push(`<section style="${ssrRenderStyle({ "border": "1px solid var(--border)" })}"><div class="px-5 py-3" style="${ssrRenderStyle({ "border-bottom": "1px solid var(--border)" })}"><p class="text-[9px] uppercase tracking-[0.2em]" style="${ssrRenderStyle({ "color": "var(--muted)" })}">Relay (fallback cloud)</p></div><div class="px-5 py-4"><p class="text-[9px] uppercase tracking-[0.12em] mb-1.5" style="${ssrRenderStyle({ "color": "var(--muted)" })}">URL du serveur relay</p><input${ssrRenderAttr("value", unref(netConfig).relayUrl)} placeholder="https://relay.example.com" class="w-full text-[12px] font-mono px-3 py-2 outline-none" style="${ssrRenderStyle({ "background": "var(--surface)", "border": "1px solid var(--border)", "color": "var(--text)" })}"></div></section><section style="${ssrRenderStyle({ "border": "1px solid var(--border)" })}"><div class="px-5 py-3" style="${ssrRenderStyle({ "border-bottom": "1px solid var(--border)" })}"><p class="text-[9px] uppercase tracking-[0.2em]" style="${ssrRenderStyle({ "color": "var(--muted)" })}">Tester la connexion</p></div><div class="px-5 py-4 space-y-4"><button${ssrIncludeBooleanAttr(unref(testing)) ? " disabled" : ""} class="text-[10px] uppercase tracking-widest px-4 py-2 transition-colors disabled:opacity-40" style="${ssrRenderStyle({ "border": "1px solid var(--text)", "color": "var(--text)", "background": "none" })}">${ssrInterpolate(unref(testing) ? "Test en cours\u2026" : "Tester la connexion")}</button>`);
      if (unref(testResults).length) {
        _push(`<div class="space-y-2"><!--[-->`);
        ssrRenderList(unref(testResults), (r) => {
          _push(`<div class="flex items-center justify-between px-3.5 py-2.5 text-[11px]" style="${ssrRenderStyle({ "border": "1px solid var(--border)" })}"><div class="flex items-center gap-2">`);
          if (r.status === "pending") {
            _push(`<span class="w-1.5 h-1.5 rounded-full vb-pulse" style="${ssrRenderStyle({ "background": "var(--dot-amber)" })}"></span>`);
          } else if (r.status === "ok") {
            _push(`<span class="w-1.5 h-1.5 rounded-full" style="${ssrRenderStyle({ "background": "var(--dot-green)" })}"></span>`);
          } else {
            _push(`<span class="w-1.5 h-1.5 rounded-full" style="${ssrRenderStyle({ "background": "var(--dot-red)" })}"></span>`);
          }
          _push(`<span class="font-mono text-[10px] break-all">${ssrInterpolate(r.url)}</span></div><span class="text-[10px] shrink-0 ml-3" style="${ssrRenderStyle(r.status === "ok" ? "color:var(--dot-green)" : "color:var(--muted)")}">${ssrInterpolate(r.status === "pending" ? "\u2026" : r.status === "ok" ? `${r.ms}ms` : "injoignable")}</span></div>`);
        });
        _push(`<!--]--></div>`);
      } else {
        _push(`<!---->`);
      }
      if (unref(bestResult)) {
        _push(`<p class="text-[10px]" style="${ssrRenderStyle({ "color": "var(--dot-green)" })}"> \u2713 Meilleure URL : <span class="font-mono">${ssrInterpolate(unref(bestResult).url)}</span></p>`);
      } else if (unref(testResults).length && !unref(testing)) {
        _push(`<p class="text-[10px]" style="${ssrRenderStyle({ "color": "var(--dot-red)" })}"> \u2717 Aucune URL joignable \u2014 v\xE9rifiez votre r\xE9seau </p>`);
      } else {
        _push(`<!---->`);
      }
      _push(`</div></section><section style="${ssrRenderStyle({ "border": "1px solid var(--border)" })}"><div class="px-5 py-3" style="${ssrRenderStyle({ "border-bottom": "1px solid var(--border)" })}"><p class="text-[9px] uppercase tracking-[0.2em]" style="${ssrRenderStyle({ "color": "var(--muted)" })}">\xC9tat actuel</p></div><div class="px-5 py-4 space-y-2"><div class="flex items-center justify-between"><span class="text-[10px] uppercase tracking-[0.12em]" style="${ssrRenderStyle({ "color": "var(--muted)" })}">Statut</span>`);
      _push(ssrRenderComponent(_component_StatusDot, {
        state: unref(bridge).status.value,
        mode: unref(bridge).mode.value,
        latency: unref(bridge).latencyMs.value
      }, null, _parent));
      _push(`</div>`);
      if (unref(bridge).activeUrl.value) {
        _push(`<div class="flex items-center justify-between"><span class="text-[10px] uppercase tracking-[0.12em]" style="${ssrRenderStyle({ "color": "var(--muted)" })}">URL active</span><span class="text-[10px] font-mono" style="${ssrRenderStyle({ "color": "var(--text)" })}">${ssrInterpolate(unref(bridge).activeUrl.value)}</span></div>`);
      } else {
        _push(`<!---->`);
      }
      if (unref(bridge).status.value !== "connected") {
        _push(`<div class="pt-2"><button class="text-[10px] uppercase tracking-widest px-4 py-2 transition-colors" style="${ssrRenderStyle({ "border": "1px solid var(--border)", "color": "var(--text)", "background": "none" })}"> Reconnecter </button></div>`);
      } else {
        _push(`<!---->`);
      }
      _push(`</div></section><section style="${ssrRenderStyle({ "border": "1px solid var(--border)" })}"><div class="px-5 py-3 flex items-center justify-between" style="${ssrRenderStyle({ "border-bottom": "1px solid var(--border)" })}"><p class="text-[9px] uppercase tracking-[0.2em]" style="${ssrRenderStyle({ "color": "var(--muted)" })}">Outils CLI</p><button${ssrIncludeBooleanAttr(unref(detecting)) ? " disabled" : ""} class="text-[9px] uppercase tracking-widest px-3 py-1 transition-colors disabled:opacity-40" style="${ssrRenderStyle({ "border": "1px solid var(--border)", "color": "var(--muted)", "background": "none" })}">${ssrInterpolate(unref(detecting) ? "D\xE9tection\u2026" : "Relancer la d\xE9tection")}</button></div><div><!--[-->`);
      ssrRenderList(unref(cliList), (cli, i) => {
        _push(`<div class="flex items-center gap-3 px-5 py-3 cursor-pointer transition-colors hover:bg-surface" style="${ssrRenderStyle(i < unref(cliList).length - 1 ? "border-bottom:1px solid var(--border)" : "")}"><span class="shrink-0 w-2 h-2 rounded-full" style="${ssrRenderStyle(`background:var(--dot-${cli.detected ? "green" : "red"})`)}"></span><div class="flex-1 min-w-0"><p class="text-[11px] uppercase tracking-[0.08em]">${ssrInterpolate(cli.name)} `);
        if (cli.isDefault) {
          _push(`<span class="ml-2 text-[9px] tracking-widest" style="${ssrRenderStyle({ "color": "var(--dot-amber)" })}">\u2605 D\xE9faut</span>`);
        } else {
          _push(`<!---->`);
        }
        if (cli.isCustom) {
          _push(`<span class="ml-2 text-[9px] tracking-widest" style="${ssrRenderStyle({ "color": "var(--muted)" })}">[custom]</span>`);
        } else {
          _push(`<!---->`);
        }
        _push(`</p><p class="text-[10px] font-mono mt-0.5" style="${ssrRenderStyle({ "color": "var(--muted)" })}">${ssrInterpolate(cli.command)}${ssrInterpolate(cli.args.length ? " " + cli.args.join(" ") : "")}</p></div><div class="flex items-center gap-2 shrink-0">`);
        if (!cli.isDefault) {
          _push(`<button class="text-[9px] uppercase tracking-widest px-2 py-1" style="${ssrRenderStyle({ "border": "1px solid var(--border)", "color": "var(--muted)", "background": "none" })}"> D\xE9faut </button>`);
        } else {
          _push(`<!---->`);
        }
        if (cli.isCustom) {
          _push(`<button class="text-[9px] uppercase tracking-widest px-2 py-1" style="${ssrRenderStyle({ "border": "1px solid var(--dot-red)", "color": "var(--dot-red)", "background": "none" })}"> \u2715 </button>`);
        } else {
          _push(`<!---->`);
        }
        _push(`</div></div>`);
      });
      _push(`<!--]-->`);
      if (!unref(cliList).length) {
        _push(`<p class="px-5 py-4 text-[10px]" style="${ssrRenderStyle({ "color": "var(--muted)" })}">Chargement\u2026</p>`);
      } else {
        _push(`<!---->`);
      }
      _push(`</div><div class="px-5 py-4" style="${ssrRenderStyle({ "border-top": "1px solid var(--border)" })}"><button class="text-[10px] uppercase tracking-widest px-4 py-2 transition-colors w-full" style="${ssrRenderStyle({ "border": "1px solid var(--border)", "color": "var(--text)", "background": "none" })}">${ssrInterpolate(unref(showAddCli) ? "\u2715 Annuler" : "+ Ajouter un CLI personnalis\xE9")}</button>`);
      if (unref(showAddCli)) {
        _push(`<div class="mt-3 space-y-2"><input${ssrRenderAttr("value", unref(newCli).name)} placeholder="Nom (ex\\u00a0: Mon agent perso)" class="w-full text-[11px] px-3 py-2 outline-none" style="${ssrRenderStyle({ "background": "var(--surface)", "border": "1px solid var(--border)", "color": "var(--text)" })}"><input${ssrRenderAttr("value", unref(newCli).command)} placeholder="Commande (ex\\u00a0: python my-agent.py)" class="w-full text-[11px] font-mono px-3 py-2 outline-none" style="${ssrRenderStyle({ "background": "var(--surface)", "border": "1px solid var(--border)", "color": "var(--text)" })}"><input${ssrRenderAttr("value", unref(newCli).args)} placeholder="Args (ex\\u00a0: --model gpt-4)" class="w-full text-[11px] font-mono px-3 py-2 outline-none" style="${ssrRenderStyle({ "background": "var(--surface)", "border": "1px solid var(--border)", "color": "var(--text)" })}"><div class="flex gap-2"><button${ssrIncludeBooleanAttr(!unref(newCli).name || !unref(newCli).command || unref(addingCli)) ? " disabled" : ""} class="flex-1 text-[10px] uppercase tracking-widest py-2 transition-colors disabled:opacity-40" style="${ssrRenderStyle({ "border": "1px solid var(--text)", "color": "var(--text)", "background": "none" })}">${ssrInterpolate(unref(addingCli) ? "Ajout\u2026" : "Ajouter")}</button></div></div>`);
      } else {
        _push(`<!---->`);
      }
      _push(`</div></section><section style="${ssrRenderStyle({ "border": "1px solid var(--border)" })}"><div class="px-5 py-3" style="${ssrRenderStyle({ "border-bottom": "1px solid var(--border)" })}"><p class="text-[9px] uppercase tracking-[0.2em]" style="${ssrRenderStyle({ "color": "var(--dot-red)" })}">Session</p></div><div class="px-5 py-4"><button class="text-[10px] uppercase tracking-widest px-4 py-2 transition-colors" style="${ssrRenderStyle({ "border": "1px solid var(--dot-red)", "color": "var(--dot-red)", "background": "none" })}"> Effacer la session (d\xE9connexion) </button></div></section></div></div>`);
    };
  }
});
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("pages/settings.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};

export { _sfc_main as default };
//# sourceMappingURL=settings-Bl-gC6oc.mjs.map
