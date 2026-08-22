import { hydrate } from "@barqjs/core";
import { RouterProvider, browserHistory, createRouter, loaderKey } from "@barqjs/router";

import { routes } from "./routes.tsx";
import { loadUser } from "./data.ts";

// A server function CALLED from client code, which is what puts its module in
// the client graph and therefore in the manifest.
(globalThis as never as Record<string, unknown>).__PROBE_RPC__ = () => loadUser(7);

const boot = globalThis as never as Record<string, unknown>;
boot.__PROBE_SEED_AT_BOOT__ = JSON.stringify((globalThis as never as Record<string, unknown>).__BARQ_DATA__ ?? null);

const container = document.getElementById("app");
if (container === null) throw new Error("no #app");

boot.__PROBE_BEFORE__ = container.innerHTML;
boot.__PROBE_READY__ = document.readyState;

const state = createRouter({ routes, history: browserHistory() });

// `start()` BEFORE `hydrate()`. The chain has to exist before the walk, or
// `renderDepth` claims ranges for a chain that is still empty and the server's
// markup is evicted under it.
await state.start();
const g = globalThis as never as Record<string, unknown>;
g.__PROBE_CHAIN__ = state.chain().map((r: any) => r.id);
g.__PROBE_KEYS__ = state.chain().map((r: any) => loaderKey(r.id, state.params()));
g.__PROBE_PARAMS__ = state.params();

hydrate((s: never) => RouterProvider(s, { state: () => state } as never) as never, container);
(globalThis as never as Record<string, unknown>).__PROBE_REPORT__ = hydrate.report;
console.log("[probe] hydrated", JSON.stringify(hydrate.report));
