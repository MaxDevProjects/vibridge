import { g as useState } from './server.mjs';

function useViewMode() {
  return useState("viewMode", () => "both");
}

export { useViewMode as u };
//# sourceMappingURL=useViewMode-DhkU4tbo.mjs.map
