/**
 * P6-Q8: a loader at TWO depths.
 *
 * `renderPage` renders the page twice in string mode. A child's boundary is
 * built inside the parent's content, so if the parent's loader throws
 * `NotReadyError` on pass 1 the child's content is never constructed and the
 * child's loader never STARTS. Pass 2 is then the child's first read — which
 * throws — and there is no pass 3.
 */
import { html as ssrHtml, ssrLoading } from "@barqjs/server";
import { createPageHandler } from "../../packages/router/src/server.ts";
import { renderRoutes } from "../../packages/router/src/server.ts";
import type { AnyRouteDefinition } from "../../packages/router/src/route.ts";

const doc = ({ body, seed }: { body: string; seed: string }): string => `<body>${body}${seed}</body>`;
const calls: string[] = [];

const routes: AnyRouteDefinition[] = [
  {
    id: "layout",
    path: "/app",
    loader: async () => { calls.push("layout"); await new Promise((r) => setTimeout(r, 10)); return "LAYOUT"; },
    component: ((_s: unknown, props: { data: () => unknown; children: unknown }) =>
      ssrHtml(`<header>${String(props.data())}</header>${String((props.children as () => unknown)())}`)) as never,
    children: [
      {
        id: "leaf",
        path: "$id",
        loader: async ({ params }: { params: { id: string } }) => {
          calls.push("leaf");
          await new Promise((r) => setTimeout(r, 10));
          return `LEAF-${params.id}`;
        },
        component: ((_s: unknown, props: { data: () => unknown }) =>
          ssrHtml(`<main>${String(props.data())}</main>`)) as never,
      },
    ],
  },
] as never;

for (const stream of [false, true]) {
  calls.length = 0;
  const handler = createPageHandler({
    routes,
    stream,
    app: (state) => renderRoutes(state),
    document: doc,
  });
  const body = await (await handler(new Request("https://x.test/app/7"))).text();
  const seeds = [...body.matchAll(/\{"r:[^;]*?\}/g)].map((m) => m[0]);
  console.log(`stream=${stream}`);
  console.log("  markup :", body.replace(/<script[\s\S]*?<\/script>/g, "").slice(0, 260));
  console.log("  seeds  :", seeds.join(" | ") || "(none)");
  console.log("  loaders:", JSON.stringify(calls));
  console.log();
}
