import { loadUser } from "./data.ts";

// CALLED from client code, which is what puts the module in the client graph
// and therefore in the manifest.
(globalThis as unknown as Record<string, unknown>).call = () => loadUser(7);
