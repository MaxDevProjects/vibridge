import { defineComponent, computed, ref, mergeProps, unref, useSSRContext } from 'vue';
import { ssrRenderAttrs, ssrRenderList, ssrRenderStyle, ssrInterpolate, ssrRenderComponent, ssrRenderClass } from 'vue/server-renderer';

const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "FileTree",
  __ssrInlineRender: true,
  props: {
    nodes: {},
    depth: {},
    active: {}
  },
  emits: ["select"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const depth = computed(() => {
      var _a;
      return (_a = props.depth) != null ? _a : 0;
    });
    const open = ref(/* @__PURE__ */ new Set());
    return (_ctx, _push, _parent, _attrs) => {
      const _component_FileTree = _sfc_main;
      _push(`<ul${ssrRenderAttrs(mergeProps({ class: "font-mono text-xs select-none" }, _attrs))}><!--[-->`);
      ssrRenderList(__props.nodes, (node) => {
        _push(`<li>`);
        if (node.type === "dir") {
          _push(`<!--[--><button class="w-full flex items-center gap-1.5 py-1 px-2 hover:bg-surface2 text-left transition-colors" style="${ssrRenderStyle({ paddingLeft: `${unref(depth) * 12 + 8}px` })}"><span class="text-muted shrink-0">${ssrInterpolate(unref(open).has(node.path) ? "\u25BE" : "\u25B8")}</span><span class="text-muted shrink-0">\u25EB</span><span class="text-text truncate">${ssrInterpolate(node.name)}</span></button>`);
          if (unref(open).has(node.path) && node.children) {
            _push(ssrRenderComponent(_component_FileTree, {
              nodes: node.children,
              depth: unref(depth) + 1,
              active: __props.active,
              onSelect: ($event) => emit("select", $event)
            }, null, _parent));
          } else {
            _push(`<!---->`);
          }
          _push(`<!--]-->`);
        } else {
          _push(`<button class="${ssrRenderClass([__props.active === node.path ? "bg-surface2 text-text" : "text-muted", "w-full flex items-center gap-1.5 py-1 px-2 hover:bg-surface2 text-left transition-colors"])}" style="${ssrRenderStyle({ paddingLeft: `${unref(depth) * 12 + 8}px` })}"><span class="text-dimmed shrink-0">\u25E6</span><span class="truncate">${ssrInterpolate(node.name)}</span></button>`);
        }
        _push(`</li>`);
      });
      _push(`<!--]--></ul>`);
    };
  }
});
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("components/FileTree.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};

export { _sfc_main as _ };
//# sourceMappingURL=FileTree-Civ6YQ1j.mjs.map
