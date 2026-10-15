/**
 * The middleware a request passes on its way to a page or a route handler:
 * the application's global request middleware, then the matched route's, then
 * the one method's own.
 */

import { esc, html as ssrHtml } from "@barqjs/server";
import {
  clearStart,
  createMiddleware,
  createStart,
  getGlobalStartContext,
  setCookie,
  setResponseHeader,
} from "@barqjs/start";
import { afterEach, expect, test } from "bun:test";

import { createFileRoute } from "./file-route.ts";
import type { RouteDefinition } from "./route.ts";
import { createPageHandler, renderRoutes } from "./server.ts";

afterEach(clearStart);

const document = ({ body, seed }: { body: string; seed: string }): string =>
  `<!doctype html><html><body><div id="app">${body}</div>${seed}</body></html>`;

function request(path: string, init?: RequestInit): Request {
  return new Request(`https://example.com${path}`, init);
}

const named = (order: string[], name: string, context?: Record<string, unknown>) =>
  createMiddleware({ type: "request" }).server(({ next }) => {
    order.push(name);
    return next(context === undefined ? undefined : { context });
  });

function handlerFor(routeTree: readonly RouteDefinition[], stream = false) {
  return createPageHandler({ routeTree, stream, app: renderRoutes, document });
}

test("a server route runs global, then inherited, then its own, then the handler's", async () => {
  const order: string[] = [];
  let handed: Record<string, unknown> = {};
  createStart(() => ({ requestMiddleware: [named(order, "global", { tenant: "example" })] }));
  const handler = handlerFor([
    {
      path: "/api",
      server: { middleware: [named(order, "layout", { area: "api" })] },
      children: [
        {
          path: "users",
          server: {
            middleware: [named(order, "route")],
            handlers: ({ createHandlers }) =>
              createHandlers({
                GET: {
                  middleware: [named(order, "method", { verb: "get" })],
                  handler: ({ context }) => {
                    order.push("handler");
                    handed = context;
                    return Response.json({ ok: true });
                  },
                },
                POST: () => Response.json({ created: true }, { status: 201 }),
              }),
          },
        },
      ],
    },
  ]);

  const got = await handler(request("/api/users"));
  expect(got.status).toBe(200);
  expect(order).toEqual(["global", "layout", "route", "method", "handler"]);
  expect(handed).toEqual({ tenant: "example", area: "api", verb: "get" });

  order.length = 0;
  const posted = await handler(request("/api/users", { method: "POST" }));
  expect(posted.status).toBe(201);
  // The other method's middleware is not this one's.
  expect(order).toEqual(["global", "layout", "route"]);
});

test("a page runs the global request middleware once, and a loader reads what it contributed", async () => {
  const order: string[] = [];
  createStart(() => ({ requestMiddleware: [named(order, "global", { visitor: "salama" })] }));
  for (const stream of [false, true]) {
    order.length = 0;
    const handler = handlerFor(
      [
        {
          path: "/",
          loader: async () => String(getGlobalStartContext().visitor),
          component: (props: { data: () => unknown }) =>
            ssrHtml(`<main>${esc(props.data())}</main>`),
        },
      ],
      stream,
    );
    const html = await (await handler(request("/"))).text();
    expect(html).toContain("<main>salama</main>");
    expect(order).toEqual(["global"]);
  }
});

test("a handler that declines leaves the page to answer, inside the same single pass", async () => {
  const order: string[] = [];
  createStart(() => ({ requestMiddleware: [named(order, "global")] }));
  const handler = handlerFor([
    {
      path: "/posts",
      server: {
        middleware: [named(order, "route")],
        handlers: {
          GET: ({ request: asked }) =>
            asked.headers.get("accept") === "application/json"
              ? Response.json({ posts: [] })
              : undefined,
        },
      },
      component: () => ssrHtml("<main>posts</main>"),
    },
  ]);

  const page = await handler(request("/posts"));
  expect(await page.text()).toContain("<main>posts</main>");
  expect(order).toEqual(["global", "route"]);
});

test("a cross-origin request to a handler is refused before any middleware runs", async () => {
  const order: string[] = [];
  createStart(() => ({ requestMiddleware: [named(order, "global")] }));
  const handler = handlerFor([
    {
      path: "/api/save",
      server: {
        middleware: [named(order, "route")],
        handlers: { POST: () => new Response("saved") },
      },
    },
  ]);

  // Injected after construction: `Origin` is a forbidden request header, which
  // the DOM this suite registers drops from a `Request` built with one.
  const forged = request("/api/save", { method: "POST" });
  Object.defineProperty(forged, "headers", {
    value: new Headers({ origin: "https://evil.example.com" }),
  });
  expect((await handler(forged)).status).toBe(403);
  expect(order).toEqual([]);
});

test("what a request middleware drafts leaves on the page's response, streamed or not", async () => {
  createStart(() => ({
    requestMiddleware: [
      createMiddleware({ type: "request" }).server(async ({ next }) => {
        setCookie("seen", "1");
        const response = await next();
        setResponseHeader("x-after", "yes");
        return response;
      }),
    ],
  }));
  for (const stream of [false, true]) {
    const handler = handlerFor(
      [{ path: "/", component: () => ssrHtml("<main>home</main>") }],
      stream,
    );
    const response = await handler(request("/"));
    expect(response.headers.getSetCookie()).toEqual(["seen=1; Path=/"]);
    expect(response.headers.get("x-after")).toBe("yes");
    expect(await response.text()).toContain("<main>home</main>");
  }
});

test("a request middleware that throws a Response answers for the page", async () => {
  createStart(() => ({
    requestMiddleware: [
      createMiddleware({ type: "request" }).server(({ next, pathname }) => {
        if (pathname.startsWith("/admin")) throw new Response("sign in first", { status: 401 });
        return next();
      }),
    ],
  }));
  const handler = handlerFor([
    { path: "/", component: () => ssrHtml("<main>home</main>") },
    { path: "/admin", component: () => ssrHtml("<main>admin</main>") },
  ]);
  expect((await handler(request("/admin"))).status).toBe(401);
  expect((await handler(request("/"))).status).toBe(200);
});

test("a route's handlers are handed what its own middleware passed, typed as it passed it", async () => {
  const signedIn = createMiddleware({ type: "request" }).server(({ next }) =>
    next({ context: { user: { name: "salama", admin: false } } }),
  );
  const me = createFileRoute("/me")({
    server: {
      middleware: [signedIn],
      handlers: {
        // `context.user` is read with no annotation and no narrowing: the
        // route's chain is what typed it.
        GET: ({ context }) => Response.json({ name: context.user.name, admin: context.user.admin }),
      },
    },
  });
  const handler = createPageHandler({
    routeTree: [{ ...me.options, path: "/me" }],
    stream: false,
    app: renderRoutes,
    document,
  });

  const got = await handler(request("/me"));
  expect(await got.json()).toEqual({ name: "salama", admin: false });
});
