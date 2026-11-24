import { esc, html as ssrHtml } from "@barqjs/server";
import { expect, test } from "bun:test";

import type { AnyRouteDefinition } from "./route.ts";
import { createPageHandler, renderRoutes } from "./server.ts";

interface ChildrenProps {
  children: unknown;
}

const routes = [
  {
    id: "__root__",
    path: "/",
    shellComponent: (props: ChildrenProps) =>
      ssrHtml(`<html><head></head><body>${esc(props.children)}</body></html>`),
    component: (props: ChildrenProps) => ssrHtml(esc(props.children)),
    children: [{ id: "/orders", path: "orders", component: () => ssrHtml("<main>orders</main>") }],
  },
] as never as AnyRouteDefinition[];

const assets = {
  clientAssets: { scripts: ["/assets/entry.js"], css: ["/assets/app.css"] },
  routeAssets: { "/orders": ["/assets/orders.js"] },
  routeCss: { "/orders": ["/assets/orders.css"] },
};

const EXPECTED = [
  "</assets/entry.js>; rel=modulepreload; as=script",
  "</assets/orders.js>; rel=modulepreload; as=script",
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

interface SentHints {
  version: number;
  hints: EarlyHintsHeaders;
}

interface EarlyHintsHeaders {
  link: string[];
}

test("a Node response over HTTP/2 is sent a 103 when the host gave no hook, and HTTP/1.1 is not", async () => {
  const handler = createPageHandler({
    routeTree: routes,
    app: (state) => renderRoutes(state),
    ...assets,
  });
  const sent: SentHints[] = [];
  for (const version of [2, 1]) {
    const request = Object.assign(new Request("https://example.com/orders"), {
      runtime: {
        node: {
          req: { httpVersionMajor: version },
          res: {
            writeEarlyHints: (hints: EarlyHintsHeaders) => sent.push({ version, hints }),
          },
        },
      },
    });
    await (await handler(request)).text();
  }

  expect(sent).toEqual([{ version: 2, hints: { link: EXPECTED } }]);
});

const withHead = [
  {
    ...(routes[0] as object),
    children: [
      {
        id: "/orders",
        path: "orders",
        head: {
          links: [
            { rel: "preconnect", href: "https://api.example.com", crossorigin: "anonymous" },
            { rel: "preload", href: "/fonts/inter.woff2", as: "font", type: "font/woff2" },
            { rel: "icon", href: "/favicon.ico" },
            { rel: "stylesheet", href: "/assets/orders.css" },
          ],
        },
        component: () => ssrHtml("<main>orders</main>"),
      },
    ],
  },
] as never as AnyRouteDefinition[];

interface CollectedPhase {
  phase: string;
  links: readonly string[];
}

test("what the routes' head declared follows as the dynamic phase, each link once", async () => {
  const phases: CollectedPhase[] = [];
  const handler = createPageHandler({
    routeTree: withHead,
    app: (state) => renderRoutes(state),
    ...assets,
    onEarlyHints: (links, _request, event) => phases.push({ phase: event.phase, links }),
  });
  const response = await handler(new Request("https://example.com/orders"));

  const dynamic = [
    "<https://api.example.com>; rel=preconnect; crossorigin=anonymous",
    '</fonts/inter.woff2>; rel=preload; as=font; type="font/woff2"',
  ];
  expect(phases).toEqual([
    { phase: "static", links: EXPECTED },
    { phase: "dynamic", links: dynamic },
  ]);
  expect(response.headers.get("link")).toBe([...EXPECTED, ...dynamic].join(", "));
});

test("the Link header can be filtered, or turned off, without touching the 103", async () => {
  const sent: (readonly string[])[] = [];
  const filtered = createPageHandler({
    routeTree: withHead,
    app: (state) => renderRoutes(state),
    ...assets,
    onEarlyHints: (links) => sent.push(links),
    responseLinkHeader: { filter: (entry) => entry.phase === "static" },
  });
  expect((await filtered(new Request("https://example.com/orders"))).headers.get("link")).toBe(
    EXPECTED.join(", "),
  );
  const off = createPageHandler({
    routeTree: withHead,
    app: (state) => renderRoutes(state),
    ...assets,
    onEarlyHints: (links) => sent.push(links),
    responseLinkHeader: false,
  });
  expect((await off(new Request("https://example.com/orders"))).headers.get("link")).toBeNull();
  expect(sent).toHaveLength(4);
});
