import { loadCast } from "./cast.ts";
import { loadChecked } from "./checked.ts";
import { loadNamespaced } from "./namespaced.ts";
import { loadPlain } from "./plain.ts";
import { readRows } from "./server-only.js";
import { loadShared } from "./shared.ts";

(globalThis as unknown as Record<string, unknown>).calls = {
  loadCast,
  loadChecked,
  loadNamespaced,
  loadPlain,
  loadShared,
  readRows,
};
