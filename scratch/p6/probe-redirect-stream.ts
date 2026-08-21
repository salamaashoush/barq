/**
 * P6-Q9: `throw redirect("/login")` from a loader, in each mode.
 *
 * `onLoaderError` records into `answer` (server.ts:188-190) and `answer` is
 * read only on the non-streamed branch (:210-213). Streaming is the DEFAULT.
 */
import { html as ssrHtml } from "@barqjs/server";
import { createPageHandler, redirect, renderRoutes } from "../../packages/router/src/server.ts";
import type { AnyRouteDefinition } from "../../packages/router/src/route.ts";

const doc = ({ body, seed }: { body: string; seed: string }): string => `<body>${body}${seed}</body>`;

const routes: AnyRouteDefinition[] = [
  {
    id: "secret",
    path: "/secret",
    loader: async () => { await new Promise((r) => setTimeout(r, 5)); redirect("/login"); },
    component: ((_s: unknown, props: { data: () => unknown }) =>
      ssrHtml(`<main>${String(props.data())}</main>`)) as never,
  },
] as never;

for (const stream of [false, true, undefined]) {
  const handler = createPageHandler({
    routes,
    ...(stream === undefined ? {} : { stream }),
    app: (state) => renderRoutes(state),
    document: doc,
  });
  try {
    const response = await handler(new Request("https://x.test/secret"));
    let text = "";
    try { text = await response.text(); } catch (e) { text = `<body read threw ${(e as Error).name}: ${(e as Error).message}>`; }
    console.log(
      `stream=${String(stream)}`.padEnd(16),
      "status", response.status,
      " location", JSON.stringify(response.headers.get("location")),
      " body", JSON.stringify(text.replace(/<script[\s\S]*?<\/script>/g, "").slice(0, 110)),
    );
  } catch (error) {
    console.log(`stream=${String(stream)}`.padEnd(16), "handler THREW", (error as Error).name, JSON.stringify((error as Error).message));
  }
}
