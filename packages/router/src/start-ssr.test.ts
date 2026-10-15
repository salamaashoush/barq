/**
 * `createStart({ defaultSsr })`: what every route that says nothing about
 * `ssr` does, and it wins over the router's own `defaultSsr`, as TanStack's
 * does.
 */

import { esc, html as ssrHtml } from "@barqjs/server";
import { clearStart, createStart } from "@barqjs/start";
import { afterEach, expect, test } from "bun:test";

import type { AnyRouteDefinition } from "./route.ts";
import { createPageHandler, renderRoutes } from "./server.ts";

afterEach(clearStart);

const document = ({ body, seed }: { body: string; seed: string }): string =>
  `<!doctype html><html><body><div id="app">${body}</div>${seed}</body></html>`;

const served = async (
  defaultSsr?: boolean | "data-only",
  routeSsr?: boolean | "data-only",
): Promise<{ html: string; ran: string[] }> => {
  const ran: string[] = [];
  const routeTree = [
    {
      path: "/notes",
      ...(routeSsr === undefined ? {} : { ssr: routeSsr }),
      loader: async () => {
        ran.push("loader");
        return "salama";
      },
      pendingComponent: () => ssrHtml("<i>pending</i>"),
      component: (props: { data: () => unknown }) => ssrHtml(`<main>${esc(props.data())}</main>`),
    },
  ] as AnyRouteDefinition[];
  const handler = createPageHandler({
    routeTree,
    stream: false,
    app: renderRoutes,
    document,
    ...(defaultSsr === undefined ? {} : { defaultSsr }),
  });
  const html = await (await handler(new Request("https://example.com/notes"))).text();
  return { html, ran };
};

test("with nothing declared, every route renders on the server", async () => {
  const { html, ran } = await served();
  expect(html).toContain("<main>salama</main>");
  expect(ran).toEqual(["loader"]);
});

test("`defaultSsr: false` leaves every route that says nothing to the browser", async () => {
  createStart(() => ({ defaultSsr: false }));
  const { html, ran } = await served();
  expect(html).not.toContain("<main>");
  expect(ran).toEqual([]);
});

test('`defaultSsr: "data-only"` runs the loader and leaves the component', async () => {
  createStart(() => ({ defaultSsr: "data-only" }));
  const { html, ran } = await served();
  expect(html).not.toContain("<main>");
  expect(ran).toEqual(["loader"]);
});

test("it wins over the router's own, and a route's own `ssr` wins over both", async () => {
  createStart(() => ({ defaultSsr: false }));
  expect((await served(true)).ran).toEqual([]);
  const own = await served(false, true);
  expect(own.html).toContain("<main>salama</main>");
});
