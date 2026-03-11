import { f as useState } from './server.mjs';

function useViewMode() {
  return useState("viewMode", () => "both");
}

export { useViewMode as u };
//# sourceMappingURL=useViewMode-hlPgSG_f.mjs.map
