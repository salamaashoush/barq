import { esc, html as ssrHtml } from "@barqjs/server";
import { expect, test } from "bun:test";

import type { AnyRouteDefinition } from "./route.ts";
import { createPageHandler, renderRoutes } from "./server.ts";

const routes = [
  {
    id: "__root__",
    path: "/",
    shellComponent: (props: { children: unknown }) =>
      ssrHtml(`<html><head></head><body>${esc(props.children)}</body></html>`),
    component: (props: { children: unknown }) => ssrHtml(esc(props.children)),
    children: [{ id: "/orders", path: "orders", component: () => ssrHtml("<main>orders</main>") }],
  },
] as never as AnyRouteDefinition[];

const assets = {
  clientAssets: { scripts: ["/assets/entry.js"], css: ["/assets/app.css"] },
  routeAssets: { "/orders": ["/assets/orders.js"] },
  routeCss: { "/orders": ["/assets/orders.css"] },
};

const EXPECTED = [
  "</assets/entry.js>; rel=modulepreload",
  "</assets/orders.js>; rel=modulepreload",
  "</assets/app.css>; rel=preload; as=style",
  "</assets/orders.css>; rel=preload; as=style",
];

test("the page's early hints reach the host before the render, and ride the Link header", async () => {
  const calls: (readonly string[])[] = [];
  const handler = createPageHandler({
    routeTree: routes,
    app: (state) => renderRoutes(state),
    ...assets,
    onEarlyHints: (links) => calls.push(links),
  });
  const response = await handler(new Request("https://example.com/orders"));

  expect(calls).toEqual([EXPECTED]);
  expect(response.headers.get("link")).toBe(EXPECTED.join(", "));
  expect(await response.text()).toContain("<main>orders</main>");
});

test("a Node response is sent a 103 when the host gave no hook", async () => {
  const sent: { link: string[] }[] = [];
  const handler = createPageHandler({
    routeTree: routes,
    app: (state) => renderRoutes(state),
    ...assets,
  });
  const request = Object.assign(new Request("https://example.com/orders"), {
    runtime: {
      node: { res: { writeEarlyHints: (hints: { link: string[] }) => sent.push(hints) } },
    },
  });
  await (await handler(request)).text();

  expect(sent).toEqual([{ link: EXPECTED }]);
});
