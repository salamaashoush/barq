/** RED-B2: what exactly does the primed non-streamed handler throw when a loader rejects? */
import { html as ssrHtml } from "@barqjs/server";
import { createPageHandler, renderRoutes } from "../../packages/router/src/server.ts";
import type { AnyRouteDefinition } from "../../packages/router/src/route.ts";
import type { RouterState } from "../../packages/router/src/router.ts";

const doc = ({ body, seed }: { body: string; seed: string }): string => `<body>${body}${seed}</body>`;
const mk = (id: string, path: string, boom: boolean, children?: AnyRouteDefinition[]): AnyRouteDefinition =>
  ({
    id, path, children,
    loader: async () => { await new Promise((r) => setTimeout(r, 10)); if (boom) throw new Error(`${id} exploded`); return id.toUpperCase(); },
    component: ((_s: unknown, p: { data: () => unknown; children: unknown }) =>
      ssrHtml(`<${id}>${String(p.data())}${children === undefined ? "" : String((p.children as () => unknown)())}</${id}>`)) as never,
  }) as never;

for (const primed of [false, true])
  for (const stream of [false, true]) {
    const routes = [mk("a", "/app", false, [mk("b", "b", true, [mk("c", "$id", false)])])];
    const handler = createPageHandler({
      routes, stream,
      app: (state: RouterState) => {
        if (primed) for (const r of state.chain()) { try { state.dataFor(r, state.params())(); } catch { /* */ } }
        return renderRoutes(state);
      },
      document: doc,
    });
    try {
      const res = await handler(new Request("https://x.test/app/b/7"));
      let text = "";
      try { text = await res.text(); } catch (e) { text = `<BODY READ THREW ${(e as Error).name}: ${(e as Error).message}>`; }
      console.log(`primed=${String(primed).padEnd(5)} stream=${String(stream).padEnd(5)} status=${res.status}`, JSON.stringify(text.replace(/<script[\s\S]*?<\/script>/g, "").slice(0, 140)));
    } catch (e) {
      console.log(`primed=${String(primed).padEnd(5)} stream=${String(stream).padEnd(5)} HANDLER THREW ${(e as Error).name}: ${(e as Error).message}`);
    }
  }
