import { loadUser } from "./data.ts";

// Calling it is what puts the module in the CLIENT graph, which is what the
// manifest is built from.
(globalThis as unknown as Record<string, unknown>).call = () => loadUser(7);
