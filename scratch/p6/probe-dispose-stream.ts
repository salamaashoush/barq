/**
 * P6-Q11: `createPageHandler`'s `finally { state.dispose() }` runs when the
 * async function RETURNS THE RESPONSE — which for a streamed page is before a
 * single byte of the body has been produced.
 *
 * Two consequences, both testable: the loader cache is cleared mid-render, and
 * `withRequest` has already exited, so `getRequest()` inside a resumed
 * boundary's loader throws. `server.ts`'s own rule 2 says the opposite:
 * "the whole render, including every loader and every server function a loader
 * calls, runs with this request ambient".
 */
import { html as ssrHtml } from "@barqjs/server";
import { getRequest } from "@barqjs/start";
import { createPageHandler, renderRoutes } from "../../packages/router/src/server.ts";
import type { AnyRouteDefinition } from "../../packages/router/src/route.ts";

const doc = ({ body, seed }: { body: string; seed: string }): string => `<body>${body}${seed}</body>`;
const notes: string[] = [];

const leaf: AnyRouteDefinition = {
  id: "leaf",
  path: "$id",
  loader: async () => {
    await new Promise((r) => setTimeout(r, 10));
    try {
      const request = getRequest();
      notes.push(`leaf saw request ${new URL(request.url).pathname}`);
      return "LEAF";
    } catch (error) {
      notes.push(`leaf getRequest() THREW ${(error as Error).message}`);
      return "LEAF(no request)";
    }
  },
  component: ((_s: unknown, p: { data: () => unknown }) => ssrHtml(`<main>${String(p.data())}</main>`)) as never,
} as never;

const routes: AnyRouteDefinition[] = [
  {
    id: "layout",
    path: "/app",
    loader: async () => { await new Promise((r) => setTimeout(r, 30)); return "LAYOUT"; },
    component: ((_s: unknown, p: { data: () => unknown; children: unknown }) =>
      ssrHtml(`<header>${String(p.data())}</header>${String((p.children as () => unknown)())}`)) as never,
    children: [leaf],
  },
] as never;

for (const neutered of [false, true])
for (const stream of [false, true]) {
  notes.length = 0;
  const handler = createPageHandler({
    routes,
    stream,
    app: (s) => {
      const seen = new Map<string, Set<unknown>>();
      const original = s.dataFor;
      (s as unknown as { dataFor: typeof s.dataFor }).dataFor = (route, params) => {
        const c = original(route, params);
        const set = seen.get(route.id) ?? new Set();
        set.add(c);
        seen.set(route.id, set);
        notes.push(`dataFor ${route.id} cell#${set.size}`);
        return c;
      };
      if (neutered) {
        // Neuter dispose to isolate the cause: if the double fetch disappears,
        // the cache clear in `finally` is what caused it.
        (s as unknown as { dispose: () => void }).dispose = () => {};
      }
      return renderRoutes(s);
    },
    document: doc,
  });
  const body = await (await handler(new Request("https://x.test/app/7"))).text();
  console.log(`neuteredDispose=${String(neutered).padEnd(5)} stream=${String(stream).padEnd(5)}`, JSON.stringify(notes), "|", body.replace(/<script[\s\S]*?<\/script>/g, "").slice(0, 150));
}
