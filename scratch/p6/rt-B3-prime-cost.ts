/**
 * RED-B3: against the LIVE tree, where `renderRoutes` primes by itself.
 * Neuter `state.prime` to get the unprimed comparand. Unequal delays, and an
 * erroring loader.
 */
import { html as ssrHtml } from "@barqjs/server";
import { createPageHandler, renderRoutes } from "../../packages/router/src/server.ts";
import type { AnyRouteDefinition } from "../../packages/router/src/route.ts";
import type { RouterState } from "../../packages/router/src/router.ts";

const doc = ({ body, seed }: { body: string; seed: string }): string => `<body>${body}${seed}</body>`;

function table(delays: Record<string, number>, boom: string | null, names: string[]): AnyRouteDefinition[] {
  const mk = (id: string, path: string, children?: AnyRouteDefinition[]): AnyRouteDefinition =>
    ({
      id, path, children,
      loader: async () => {
        names.push(id);
        await new Promise((r) => setTimeout(r, delays[id] ?? 10));
        if (id === boom) throw new Error(`${id} exploded`);
        return id.toUpperCase();
      },
      component: ((_s: unknown, p: { data: () => unknown; children: unknown }) =>
        ssrHtml(`<${id}>${String(p.data())}${children === undefined ? "" : String((p.children as () => unknown)())}</${id}>`)) as never,
    }) as never;
  return [mk("a", "/app", [mk("b", "b", [mk("c", "$id")])])];
}

const CASES = [
  { label: "40/40/40      ", d: { a: 40, b: 40, c: 40 }, boom: null },
  { label: "10/100/10     ", d: { a: 10, b: 100, c: 10 }, boom: null },
  { label: "100/10/10     ", d: { a: 100, b: 10, c: 10 }, boom: null },
  { label: "10/10/100     ", d: { a: 10, b: 10, c: 100 }, boom: null },
  { label: "boom middle   ", d: { a: 10, b: 20, c: 10 }, boom: "b" },
] as { label: string; d: Record<string, number>; boom: string | null }[];

for (const c of CASES)
  for (const primed of [false, true])
    for (const stream of [false, true]) {
      const names: string[] = [];
      const t0 = Date.now();
      let ttfb = -1;
      const handler = createPageHandler({
        routes: table(c.d, c.boom, names),
        stream,
        app: (state: RouterState) => {
          if (!primed) (state as unknown as { prime: () => void }).prime = () => {};
          return renderRoutes(state);
        },
        document: doc,
      });
      let body = ""; let status = 0; let torn = "";
      try {
        const res = await handler(new Request("https://x.test/app/b/7"));
        status = res.status;
        if (res.body !== null) {
          const reader = res.body.getReader(); const dec = new TextDecoder();
          for (;;) { const { done, value } = await reader.read(); if (done) break; if (ttfb === -1) ttfb = Date.now() - t0; body += dec.decode(value); }
        }
      } catch (e) { torn = `HANDLER THREW ${(e as Error).name}`; }
      const wall = Date.now() - t0;
      const markup = body.replace(/<script[\s\S]*?<\/script>/g, "");
      const seeds = [...new Set([...body.matchAll(/"(r:[^"]+)"/g)].map((m) => m[1]))];
      console.log(
        `${c.label} primed=${String(primed).padEnd(5)} stream=${String(stream).padEnd(5)}`,
        `status=${status}`, `ttfb=${String(ttfb).padStart(4)}`, `wall=${String(wall).padStart(4)}`,
        `calls=${JSON.stringify(names).padEnd(22)}`, `seeds=${seeds.length}`,
        `depths=${["<a>", "<b>", "<c>"].filter((t) => markup.includes(t)).length}`, torn,
      );
    }
