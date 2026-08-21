/**
 * P6-Q10: does PRIMING the matched chain fix F6 and make loaders parallel?
 *
 * barq's loaders are pull-based: a read starts the fetch. A child's boundary is
 * built inside the parent's content, so a parent that parks means the child's
 * loader has not STARTED — a waterfall on the client and, in `renderPage`'s
 * two-pass model, a dropped child on the server.
 *
 * The proposed fix is one line of shape: touch every entry in the matched chain
 * before rendering depth 0, inside the render session so the values are still
 * attributable to it.
 */
import { html as ssrHtml, ssrLoading } from "@barqjs/server";
import { createPageHandler, renderRoutes } from "../../packages/router/src/server.ts";
import type { AnyRouteDefinition } from "../../packages/router/src/route.ts";
import type { RouterState } from "../../packages/router/src/router.ts";

const doc = ({ body, seed }: { body: string; seed: string }): string => `<body>${body}${seed}</body>`;
const DELAY = 40;

function table(started: number[], names: string[]): AnyRouteDefinition[] {
  const mk = (id: string, path: string, children?: AnyRouteDefinition[]): AnyRouteDefinition =>
    ({
      id,
      path,
      loader: async () => {
        started.push(Date.now()); names.push(id);
        await new Promise((r) => setTimeout(r, DELAY));
        return id.toUpperCase();
      },
      component: ((_s: unknown, props: { data: () => unknown; children: unknown }) =>
        ssrHtml(
          `<${id}>${String(props.data())}${children === undefined ? "" : String((props.children as () => unknown)())}</${id}>`,
        )) as never,
      children,
    }) as never;
  return [mk("a", "/app", [mk("b", "b", [mk("c", "$id")])])];
}

/** Touch every entry in the chain so all loaders are in flight before depth 0 renders. */
function prime(state: RouterState): void {
  for (const route of state.chain()) {
    try {
      state.dataFor(route, state.params())();
    } catch {
      /* NotReadyError is the point: the fetch has started */
    }
  }
}

for (const primed of [false, true]) {
  for (const stream of [false, true]) {
    const started: number[] = [];
    const names: string[] = [];
    const t0 = Date.now();
    const handler = createPageHandler({
      routes: table(started, names),
      stream,
      app: (state) => {
        if (primed) prime(state);
        return renderRoutes(state);
      },
      document: doc,
    });
    const body = await (await handler(new Request("https://x.test/app/b/7"))).text();
    const wall = Date.now() - t0;
    const seedKeys = [...new Set([...body.matchAll(/"(r:[^"]+)"/g)].map((m) => m[1]))];
    const markup = body.replace(/<script[\s\S]*?<\/script>/g, "");
    const spread = started.length < 2 ? 0 : Math.max(...started) - Math.min(...started);
    console.log(
      `primed=${String(primed).padEnd(5)} stream=${String(stream).padEnd(5)}`,
      `wall=${String(wall).padStart(4)}ms`,
      `loaderStartSpread=${String(spread).padStart(4)}ms`,
      `calls=${JSON.stringify(names)}`,
      `seedKeys=${seedKeys.length}`,
      `depthsInMarkup=${["<a>", "<b>", "<c>"].filter((t) => markup.includes(t)).length}`,
    );
  }
}
