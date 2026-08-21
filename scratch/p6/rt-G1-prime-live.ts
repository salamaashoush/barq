/** RED-G1: renderRoutes now calls state.prime() itself. Is it actually running? */
import { html as ssrHtml } from "@barqjs/server";
import { createPageHandler, renderRoutes } from "../../packages/router/src/server.ts";
import type { AnyRouteDefinition } from "../../packages/router/src/route.ts";
import type { RouterState } from "../../packages/router/src/router.ts";

const doc = ({ body, seed }: { body: string; seed: string }): string => `<body>${body}${seed}</body>`;
const names: string[] = [];
const mk = (id: string, path: string, children?: AnyRouteDefinition[]): AnyRouteDefinition =>
  ({
    id, path, children,
    loader: async () => { names.push(id); await new Promise((r) => setTimeout(r, 40)); return id.toUpperCase(); },
    component: ((_s: unknown, p: { data: () => unknown; children: unknown }) =>
      ssrHtml(`<${id}>${String(p.data())}${children === undefined ? "" : String((p.children as () => unknown)())}</${id}>`)) as never,
  }) as never;

for (const stream of [false, true]) {
  names.length = 0;
  const t0 = Date.now();
  const handler = createPageHandler({
    routes: [mk("a", "/app", [mk("b", "b", [mk("c", "$id")])])],
    stream,
    app: (state: RouterState) => {
      console.log("  chain:", state.chain().map((r) => r.id).join(","), "params:", JSON.stringify(state.params()));
      console.log("  typeof state.prime:", typeof (state as unknown as { prime?: unknown }).prime);
      return renderRoutes(state);
    },
    document: doc,
  });
  const body = await (await handler(new Request("https://x.test/app/b/7"))).text();
  const markup = body.replace(/<script[\s\S]*?<\/script>/g, "");
  const seeds = [...new Set([...body.matchAll(/"(r:[^"]+)"/g)].map((m) => m[1]))];
  console.log(`stream=${stream}`, `wall=${Date.now() - t0}ms`, `calls=${JSON.stringify(names)}`, `depths=${["<a>", "<b>", "<c>"].filter((t) => markup.includes(t)).length}`, `seeds=${seeds.length}`);
  console.log("  markup:", JSON.stringify(markup.slice(0, 160)));
}
