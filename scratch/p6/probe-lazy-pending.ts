/**
 * P6-B4: `routes.rs:309` emits `pending: lazy(() => import(...), m => m.Pending ?? Empty)`.
 * On the string backend the fallback is activated at `ssr.ts:937`, which is
 * OUTSIDE the try/catch at `:931-936`. A `pending` whose chunk has not loaded
 * should therefore throw `NotReadyError` from an unguarded position.
 */
import { html as ssrHtml, renderPage } from "@barqjs/server";
import { lazy } from "@barqjs/core";
import { createPageHandler, renderRoutes } from "../../packages/router/src/server.ts";
import type { AnyRouteDefinition } from "../../packages/router/src/route.ts";

const doc = ({ body, seed }: { body: string; seed: string }): string => `<body>${body}${seed}</body>`;

// Exactly the generated shape: a lazy pending over a module that takes a tick.
const Pending = lazy(
  async () => {
    await new Promise((r) => setTimeout(r, 15));
    return { default: () => ssrHtml("<i>loading…</i>") };
  },
);

const routes: AnyRouteDefinition[] = [
  {
    id: "slow",
    path: "/slow",
    loader: async () => {
      await new Promise((r) => setTimeout(r, 30));
      return "DATA";
    },
    pending: Pending as never,
    component: ((_s: unknown, p: { data: () => unknown }) =>
      ssrHtml(`<main>${String(p.data())}</main>`)) as never,
  },
] as never;

for (const stream of [false, true]) {
  const handler = createPageHandler({ routes, stream, app: (s) => renderRoutes(s), document: doc });
  try {
    const body = await (await handler(new Request("https://x.test/slow"))).text();
    console.log(`stream=${String(stream).padEnd(5)} ok  `, body.replace(/<script[\s\S]*?<\/script>/g, "").slice(0, 130));
  } catch (error) {
    console.log(`stream=${String(stream).padEnd(5)} THREW`, (error as Error).name, (error as Error).message.slice(0, 80));
  }
}
