/**
 * `transformAssets`: the build's asset URLs rewritten at run time, for a CDN.
 * What the page handler places itself is rewritten, the entry, the chain's
 * preloads and stylesheets and the early hints for them; a route's own `head`
 * link is not.
 */

import { esc, html as ssrHtml } from "@barqjs/server";
import { expect, test } from "bun:test";

import { HeadContent, Scripts } from "./components.ts";
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
      ssrHtml(
        `<html><head>${esc(HeadContent())}</head>` +
          `<body>${esc(props.children)}${esc(Scripts())}</body></html>`,
      ),
    component: (props: ChildrenProps) => ssrHtml(esc(props.children)),
    children: [
      {
        id: "/orders",
        path: "orders",
        head: { links: [{ rel: "preload", href: "/fonts/inter.woff2", as: "font" }] },
        component: () => ssrHtml("<main>orders</main>"),
      },
    ],
  },
] as never as AnyRouteDefinition[];

const assets = {
  clientAssets: { scripts: ["/assets/entry.js"], css: ["/assets/app.css"] },
  routeAssets: { "/orders": ["/assets/orders.js"] },
  routeCss: { "/orders": ["/assets/orders.css"] },
};

async function page(
  transformAssets: Parameters<typeof createPageHandler>[0]["transformAssets"],
  request = new Request("https://example.com/orders"),
) {
  const handler = createPageHandler({
    routeTree: routes,
    app: (state) => renderRoutes(state),
    ...assets,
    stream: false,
    onEarlyHints: () => {},
    transformAssets,
  });
  const response = await handler(request);
  return { html: await response.text(), link: response.headers.get("link") ?? "" };
}

test("a prefix moves every asset the build emitted, and leaves a route's own link alone", async () => {
  const { html, link } = await page("https://cdn.example.com");

  expect(html).toContain('src="https://cdn.example.com/assets/entry.js"');
  expect(html).toContain('href="https://cdn.example.com/assets/orders.js"');
  expect(html).toContain('href="https://cdn.example.com/assets/app.css"');
  expect(html).toContain('href="https://cdn.example.com/assets/orders.css"');
  expect(html).toContain('href="/fonts/inter.woff2"');
  expect(html).not.toContain('"/assets/');
  expect(link).toContain("<https://cdn.example.com/assets/entry.js>");
  expect(link).toContain("</fonts/inter.woff2>");
});

test("crossOrigin is carried by the tags and the hints, per kind", async () => {
  const { html, link } = await page({
    prefix: "https://cdn.example.com",
    crossOrigin: { script: "anonymous", stylesheet: "use-credentials" },
  });

  expect(html).toMatch(/<script[^>]*crossorigin="anonymous"[^>]*entry\.js/);
  expect(html).toMatch(/<link[^>]*modulepreload[^>]*orders\.js[^>]*crossorigin="anonymous"/);
  expect(html).toMatch(/<link[^>]*stylesheet[^>]*app\.css[^>]*crossorigin="use-credentials"/);
  expect(link).toContain(
    "<https://cdn.example.com/assets/orders.js>; rel=modulepreload; as=script; crossorigin=anonymous",
  );
});

test("a cached transform runs once; cache: false runs per request with the request", async () => {
  const seen: (string | undefined)[] = [];
  const cached = createPageHandler({
    routeTree: routes,
    app: (state) => renderRoutes(state),
    ...assets,
    stream: false,
    onEarlyHints: () => {},
    transformAssets: {
      createTransform: (context) => {
        seen.push(context.warmup ? "warmup" : (context.request.headers.get("x-region") ?? ""));
        return ({ url }) => `https://cdn.example.com${url}`;
      },
    },
  });
  for (const region of ["eu", "us"]) {
    await (
      await cached(new Request("https://example.com/orders", { headers: { "x-region": region } }))
    ).text();
  }
  expect(seen).toEqual(["eu"]);

  const regions: string[] = [];
  const perRequest = createPageHandler({
    routeTree: routes,
    app: (state) => renderRoutes(state),
    ...assets,
    stream: false,
    onEarlyHints: () => {},
    transformAssets: {
      cache: false,
      createTransform: (context) => {
        const region = context.warmup ? "us" : (context.request.headers.get("x-region") ?? "us");
        regions.push(region);
        return ({ url }) => `https://cdn-${region}.example.com${url}`;
      },
    },
  });
  const eu = await (
    await perRequest(new Request("https://example.com/orders", { headers: { "x-region": "eu" } }))
  ).text();
  expect(eu).toContain("https://cdn-eu.example.com/assets/entry.js");
  expect(regions).toEqual(["eu"]);
});
