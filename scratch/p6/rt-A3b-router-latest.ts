/**
 * RED-A3b: the same, through the REAL createPageHandler + renderRoutes, with a
 * route whose component reads its data via `latest()` — i.e. the design's
 * `staleReloadMode: 'background'`.
 */
import { html as ssrHtml } from "@barqjs/server";
import { latest } from "@barqjs/core";
import { createPageHandler, renderRoutes } from "../../packages/router/src/server.ts";
import type { AnyRouteDefinition } from "../../packages/router/src/route.ts";

const doc = ({ body, seed }: { body: string; seed: string }): string => `<body>${body}${seed}</body>`;

const mk = (mode: "blocking" | "background"): AnyRouteDefinition[] => [
  {
    id: `u-${mode}`,
    path: "/users/$id",
    loader: async ({ params }: { params: { id: string } }) => {
      await new Promise((r) => setTimeout(r, 10));
      return `Ada-${params.id}`;
    },
    component: ((_s: unknown, p: { data: () => unknown }) =>
      ssrHtml(`<b>${String(mode === "background" ? latest(p.data) : p.data())}</b>`)) as never,
  },
] as never;

for (const mode of ["blocking", "background"] as const)
  for (const stream of [false, true]) {
    const handler = createPageHandler({
      routes: mk(mode),
      stream,
      app: (state) => renderRoutes(state),
      document: doc,
    });
    let body = "";
    try { body = await (await handler(new Request("https://x.test/users/7"))).text(); }
    catch (e) { body = `<THREW ${(e as Error).name}>`; }
    const seeds = [...body.matchAll(/"(r:[^"]+)":/g)].map((m) => m[1]);
    console.log(
      `mode=${mode.padEnd(10)} stream=${String(stream).padEnd(5)}`,
      "markup", JSON.stringify(body.replace(/<script[\s\S]*?<\/script>/g, "").slice(0, 90)),
      "seedKeys", JSON.stringify(seeds),
    );
  }
