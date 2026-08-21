/**
 * P6-§3.7: does a loader that returns a PENDING promise already stream?
 *
 * `DESIGN-START.md` §2.5: seroval can represent a pending promise in the seed,
 * and `seedLater` makes a client read WAIT rather than refetch. The claim is
 * that a route's loader returning one needs wiring, not machinery.
 */
import { html as ssrHtml } from "@barqjs/server";
import { createPageHandler, renderRoutes } from "../../packages/router/src/server.ts";
import type { AnyRouteDefinition } from "../../packages/router/src/route.ts";

const doc = ({ body, seed }: { body: string; seed: string }): string => `<body>${body}${seed}</body>`;

const routes: AnyRouteDefinition[] = [
  {
    id: "p",
    path: "/p",
    loader: async () => ({
      fast: "here now",
      // Deliberately NOT awaited: the whole question is whether a pending
      // promise survives to the client.
      slow: new Promise((resolve) => setTimeout(() => resolve("here later"), 25)),
    }),
    component: ((_s: unknown, props: { data: () => { fast: string } }) =>
      ssrHtml(`<main>${String(props.data().fast)}</main>`)) as never,
  },
] as never;

for (const stream of [true, false]) {
  const handler = createPageHandler({ routes, stream, app: (s) => renderRoutes(s), document: doc });
  let body: string;
  try { body = await (await handler(new Request("https://x.test/p"))).text(); } catch (e) { console.log(`stream=${String(stream)} THREW`, (e as Error).name, (e as Error).message.slice(0,60)); continue; }
  const markup = body.replace(/<script[\s\S]*?<\/script>/g, "<S/>");
  console.log(`stream=${String(stream).padEnd(5)}`, markup.slice(0, 120));
  console.log("   later value present:", body.includes("here later"));
  console.log("   promise in seed    :", /Promise|\$R\[|resolver/.test(body));
}
