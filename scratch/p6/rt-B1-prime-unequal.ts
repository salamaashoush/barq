/**
 * RED-B1: probe-prime.ts used EQUAL 40ms loaders. Re-run with UNEQUAL delays
 * and with an ERRORING loader in the middle. Does the win survive, and does
 * priming start work for a route whose ancestor is about to fail?
 */
import { html as ssrHtml } from "@barqjs/server";
import { createPageHandler, renderRoutes } from "../../packages/router/src/server.ts";
import type { AnyRouteDefinition } from "../../packages/router/src/route.ts";
import type { RouterState } from "../../packages/router/src/router.ts";

const doc = ({ body, seed }: { body: string; seed: string }): string => `<body>${body}${seed}</body>`;

function table(delays: Record<string, number>, boom: string | null, names: string[], started: number[]): AnyRouteDefinition[] {
  const mk = (id: string, path: string, children?: AnyRouteDefinition[]): AnyRouteDefinition =>
    ({
      id, path, children,
      loader: async () => {
        started.push(Date.now()); names.push(id);
        await new Promise((r) => setTimeout(r, delays[id] ?? 10));
        if (id === boom) throw new Error(`${id} exploded`);
        return id.toUpperCase();
      },
      component: ((_s: unknown, props: { data: () => unknown; children: unknown }) =>
        ssrHtml(`<${id}>${String(props.data())}${children === undefined ? "" : String((props.children as () => unknown)())}</${id}>`)) as never,
    }) as never;
  return [mk("a", "/app", [mk("b", "b", [mk("c", "$id")])])];
}

function prime(state: RouterState): void {
  for (const route of state.chain()) {
    try { state.dataFor(route, state.params())(); } catch { /* the point */ }
  }
}

const CASES: { label: string; delays: Record<string, number>; boom: string | null }[] = [
  { label: "equal 40/40/40", delays: { a: 40, b: 40, c: 40 }, boom: null },
  { label: "10/100/10     ", delays: { a: 10, b: 100, c: 10 }, boom: null },
  { label: "100/10/10     ", delays: { a: 100, b: 10, c: 10 }, boom: null },
  { label: "10/10/100     ", delays: { a: 10, b: 10, c: 100 }, boom: null },
  { label: "boom in middle", delays: { a: 10, b: 20, c: 10 }, boom: "b" },
  { label: "boom at root  ", delays: { a: 10, b: 20, c: 10 }, boom: "a" },
];

for (const c of CASES)
  for (const primed of [false, true])
    for (const stream of [false, true]) {
      const names: string[] = [];
      const started: number[] = [];
      const t0 = Date.now();
      let firstByte = -1;
      const handler = createPageHandler({
        routes: table(c.delays, c.boom, names, started),
        stream,
        app: (state) => { if (primed) prime(state); return renderRoutes(state); },
        document: doc,
      });
      let body = "";
      let status = 0;
      try {
        const res = await handler(new Request("https://x.test/app/b/7"));
        status = res.status;
        // measure time to first byte for the streamed case
        if (res.body !== null) {
          const reader = res.body.getReader();
          const dec = new TextDecoder();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (firstByte === -1) firstByte = Date.now() - t0;
            body += dec.decode(value);
          }
        }
      } catch (e) { body = `<THREW ${(e as Error).name}: ${(e as Error).message}>`; }
      const wall = Date.now() - t0;
      const markup = body.replace(/<script[\s\S]*?<\/script>/g, "");
      const seedKeys = [...new Set([...body.matchAll(/"(r:[^"]+)"/g)].map((m) => m[1]))];
      console.log(
        `${c.label} primed=${String(primed).padEnd(5)} stream=${String(stream).padEnd(5)}`,
        `status=${status}`,
        `ttfb=${String(firstByte).padStart(4)}`,
        `wall=${String(wall).padStart(4)}`,
        `calls=${JSON.stringify(names).padEnd(24)}`,
        `seeds=${seedKeys.length}`,
        `depths=${["<a>", "<b>", "<c>"].filter((t) => markup.includes(t)).length}`,
        body.includes("THREW") ? "TORN" : "",
      );
    }
