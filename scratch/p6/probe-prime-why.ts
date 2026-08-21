/** P6-Q10b: why does the MIDDLE layout's loader run twice under prime+stream? */
import { html as ssrHtml } from "@barqjs/server";
import { createPageHandler, renderRoutes } from "../../packages/router/src/server.ts";
import type { AnyRouteDefinition } from "../../packages/router/src/route.ts";
import type { RouterState } from "../../packages/router/src/router.ts";

const doc = ({ body, seed }: { body: string; seed: string }): string => `<body>${body}${seed}</body>`;
const log: string[] = [];
const cellsSeen = new Map<string, Set<unknown>>();

const mk = (id: string, path: string, children?: AnyRouteDefinition[]): AnyRouteDefinition =>
  ({
    id, path, children,
    loader: async () => { log.push(`fetch ${id}`); await new Promise((r) => setTimeout(r, 40)); return id.toUpperCase(); },
    component: ((_s: unknown, props: { data: () => unknown; children: unknown }) =>
      ssrHtml(`<${id}>${String(props.data())}${children === undefined ? "" : String((props.children as () => unknown)())}</${id}>`)) as never,
  }) as never;

const routes = [mk("a", "/app", [mk("b", "b", [mk("c", "$id")])])];

const handler = createPageHandler({
  routes,
  stream: true,
  app: (state: RouterState) => {
    const original = state.dataFor;
    // Wrap once, to see which cell identity each depth gets and when.
    if (!(state as unknown as { _wrapped?: boolean })._wrapped) {
      (state as unknown as { _wrapped?: boolean })._wrapped = true;
      (state as unknown as { dataFor: RouterState["dataFor"] }).dataFor = (route, params) => {
        const cell = original(route, params);
        const set = cellsSeen.get(route.id) ?? new Set();
        set.add(cell);
        cellsSeen.set(route.id, set);
        log.push(`dataFor ${route.id} key=${JSON.stringify(params)} -> cell#${set.size}`);
        return cell;
      };
    }
    (state as unknown as { dispose: () => void }).dispose = () => { log.push("dispose() called"); };
    for (const route of state.chain()) {
      try { state.dataFor(route, state.params())(); } catch { /* starting the fetch is the point */ }
    }
    return renderRoutes(state);
  },
  document: doc,
});

await (await handler(new Request("https://x.test/app/b/7"))).text();
console.log(log.join("\n"));
console.log("\ndistinct cells per route:", [...cellsSeen].map(([k, v]) => `${k}=${v.size}`).join(" "));
