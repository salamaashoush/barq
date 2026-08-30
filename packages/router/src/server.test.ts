/**
 * The page handler, driven with real `Request`s.
 *
 * Nothing in this repo had ever called the SSR page path — `serveBarq`,
 * `createFetchHandler` and `renderToStream` had zero non-test call sites — so
 * this file is the first consumer of it as well as its test.
 */

import { esc, html as ssrHtml, ssrLoading } from "@barqjs/server";
import {
  type Middleware,
  createServerFn,
  getRequest,
  setCookie,
  setResponseHeader,
  setResponseStatus,
} from "@barqjs/start";
import { mount, unmountAll } from "@barqjs/start/server";
import { computed, flush, hole, hydrate, insert, template } from "@barqjs/core";
import { describe, expect, test } from "bun:test";

import { RouterProvider, linkAttrHref } from "./components.ts";

import { memoryHistory } from "./history.ts";
import { createRouter } from "./router.ts";
import { HeadContent, Scripts } from "./components.ts";
import {
  chainVerifier,
  createPageHandler,
  notFound,
  preloadTags,
  redirect,
  renderRoutes,
} from "./server.ts";
import type { AnyRouteDefinition } from "./route.ts";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const document = ({ body, seed }: { body: string; seed: string }): string =>
  `<!doctype html><html><head><title>t</title></head><body>${body}${seed}</body></html>`;

const baseTable: AnyRouteDefinition[] = [
  { path: "/", component: (() => null) as never },
  { path: "/users/$id", component: (() => null) as never },
] as never;

function get(path: string, init?: RequestInit): Request {
  return new Request(`https://example.com${path}`, init);
}

/**
 * `pages: false` — the mode an SPA deploys in.
 *
 * The document moves to the browser and everything else stays. It was
 * unreachable in a build: the generated server entry made an ordinary page
 * handler, which asked the table for a `shellComponent` an SPA has no reason to
 * declare, and answered 500 to every page request.
 */
describe("a handler that renders no pages", () => {
  const table: AnyRouteDefinition[] = [
    { path: "/", component: (() => null) as never },
    {
      path: "/api/health",
      server: { handlers: { GET: () => Response.json({ ok: true }) } },
    },
  ] as never;

  const handler = createPageHandler({
    routeTree: table,
    pages: false,
    // Would throw if it were ever reached: nothing here declares a document,
    // which is the whole point of the mode.
    app: () => ssrHtml("<main>unreachable</main>"),
  });

  test("answers a matched page 404, for the SPA fallback to pick up", async () => {
    const response = await handler(get("/"));
    expect(response.status).toBe(404);
  });

  test("still answers the route handlers", async () => {
    const response = await handler(get("/api/health"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});

describe("status is decided before the shell", () => {
  test("a match is 200 and a miss is 404", async () => {
    // `renderToStream` emits the shell synchronously, so a status discovered
    // mid-render would land after the headers. The match runs first.
    const handler = createPageHandler({
      routeTree: baseTable,
      app: () => ssrHtml("<main>ok</main>"),
      document,
    });

    expect((await handler(get("/"))).status).toBe(200);
    expect((await handler(get("/nowhere"))).status).toBe(404);
  });

  test("a 404 still renders a document rather than a bare status", async () => {
    const handler = createPageHandler({
      routeTree: baseTable,
      app: () => ssrHtml("<main>not found</main>"),
      document,
    });
    const response = await handler(get("/nowhere"));
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("<!doctype html>");
  });
});

describe("guards", () => {
  test("a redirect answers 302 with a Location and never renders", async () => {
    let rendered = false;
    const handler = createPageHandler({
      routeTree: baseTable,
      app: () => {
        rendered = true;
        return ssrHtml("<main>secret</main>");
      },
      document,
      beforeEach: [({ to }) => (to.pathname === "/" ? "/login" : true)],
    });

    const response = await handler(get("/"));
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/login");
    expect(rendered).toBe(false);
  });

  test("a refusal is 403", async () => {
    const handler = createPageHandler({
      routeTree: baseTable,
      app: () => ssrHtml("<main>x</main>"),
      document,
      beforeEach: [() => false],
    });
    expect((await handler(get("/"))).status).toBe(403);
  });
});

describe("the request is ambient for the whole render", () => {
  test("a route loader's server function can read it", async () => {
    // `withRequest` has exactly one other call site — `handleServerFn` — so
    // without the page handler entering it, `getRequest()` throws INSIDE the
    // render and the page dies on a header read.
    //
    // `authorization` rather than `cookie` because `cookie` is a forbidden
    // header name and the `Request` constructor drops it, which reads exactly
    // like the ambient context not working.
    const seen: (string | null)[] = [];
    const whoami = createServerFn()
      .validator("unchecked")
      .handler(async () => {
        seen.push(getRequest().headers.get("authorization"));
        return "ok";
      });

    const handler = createPageHandler({
      routeTree: [
        {
          path: "/",
          loader: () => whoami(),
          component: (_s: unknown, props: { data: () => unknown }) =>
            ssrHtml(`<b>${esc(String(props.data()))}</b>`),
        },
      ] as never,
      app: (state) => ssrHtml(`<main>${esc(renderRoutes(state))}</main>`),
      document,
      stream: false,
    });

    const response = await handler(get("/", { headers: { authorization: "Bearer abc" } }));
    expect(await response.text()).toContain("<b>ok</b>");
    expect(seen).toEqual(["Bearer abc"]);
  });

  test("a middleware that refuses becomes the page's own response", async () => {
    // A loader that throws does NOT unwind out of the render: the value is an
    // async `computed`, `settle` awaits it with `allSettled`, and the rejection
    // lands on a boundary. So the refusal was rendered as an error and answered
    // 200. `onLoaderError` is how the answer reaches the handler, and it is a
    // per-request callback rather than an ambient slot, because a module-level
    // one hands one request's answer to another.
    const guard = async (next: () => Promise<unknown>): Promise<unknown> => {
      if (!(getRequest().headers.get("authorization") ?? "").startsWith("Bearer ")) {
        throw new Response("unauthorized", { status: 401 });
      }
      return next();
    };
    const load = createServerFn()
      .middleware([guard])
      .validator("unchecked")
      .handler(async () => "private");

    const routesWithGuard = [
      {
        path: "/",
        loader: () => load(),
        component: (_s: unknown, props: { data: () => unknown }) =>
          ssrHtml(`<b>${esc(String(props.data()))}</b>`),
      },
    ] as never;

    const handler = createPageHandler({
      routeTree: routesWithGuard,
      app: (state) => ssrHtml(`<main>${esc(renderRoutes(state))}</main>`),
      document,
      stream: false,
    });

    expect((await handler(get("/"))).status).toBe(401);
    // …and the same page answers normally once the header is there.
    const ok = await handler(get("/", { headers: { authorization: "Bearer abc" } }));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toContain("<b>private</b>");
  });
});

describe("redirect() from a loader", () => {
  test("becomes a 302 rather than a 500", async () => {
    const handler = createPageHandler({
      routeTree: baseTable,
      app: () => {
        redirect("/login");
      },
      document,
      stream: false,
    });
    const response = await handler(get("/"));
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/login");
  });
});

describe("the document", () => {
  test("wraps the app, and the head is flushed before the body settles", async () => {
    const late = computed(
      async () => {
        await tick();
        return "Ada";
      },
      { key: "r:/users/$id|id=7" },
    );

    const handler = createPageHandler({
      routeTree: baseTable,
      app: () =>
        ssrHtml(
          `<main>${esc(
            ssrLoading(null, {
              fallback: () => ssrHtml("<i>loading</i>"),
              children: () => ssrHtml(`<b>${esc(late())}</b>`),
            }),
          )}</main>`,
        ),
      document,
    });

    const response = await handler(get("/users/7"));
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    const chunks: string[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(decoder.decode(value));
    }

    // The head is its own chunk and carries the title before any loader has
    // settled — which is the whole reason to stream.
    expect(chunks[0]).toContain("<title>t</title>");
    expect(chunks[0]).not.toContain("Ada");

    const whole = chunks.join("");
    expect(whole).toContain("<!doctype html>");
    expect(whole).toContain("Ada");
    expect(whole.endsWith("</body></html>")).toBe(true);
  });

  test("a document that drops its body argument is an error, not silent loss", async () => {
    const handler = createPageHandler({
      routeTree: baseTable,
      app: () => ssrHtml("<main>x</main>"),
      document: () => "<html><body>oops</body></html>",
    });
    expect(handler(get("/"))).rejects.toThrow(/must place its `body` argument/);
  });
});

/**
 * Five defects found by probe, each on a shipped path and each with nothing in
 * this suite that would have caught it. They are written here before the fixes,
 * so the commits that follow have something to turn green.
 */
describe("P6 defects", () => {
  /** Distinct ids per test: a dropped loader keeps running after its response. */
  let seq = 0;
  const fresh = (): string => `p6-${seq++}`;

  test("B2 — a non-streamed page renders EVERY depth's loader, not just the first", async () => {
    // `renderPage` renders the page twice in string mode. Pass 1 the layout
    // parks, so `props.children()` is never called and the leaf's cell is never
    // created; pass 2 is the leaf's FIRST read, which throws, and there is no
    // pass 3. Depth N needs N passes and there are two.
    //
    // Measured before the fix: `<body><header>LAYOUT</header></body>` — no
    // leaf markup and no leaf seed — while both loaders had run.
    const id = fresh();
    const table = [
      {
        id: `${id}-layout`,
        path: "/app",
        loader: async () => {
          await tick();
          return "LAYOUT";
        },
        component: (_s: unknown, props: { data: () => unknown; children: unknown }) =>
          ssrHtml(
            // `esc` passes an `SsrHtml` through unescaped; `String()`-ing it
            // first turns the child's markup into text.
            `<header>${esc(String(props.data()))}</header>${esc(
              (props.children as () => unknown)(),
            )}`,
          ),
        children: [
          {
            id: `${id}-leaf`,
            path: "$id",
            loader: async () => {
              await tick();
              return "LEAF";
            },
            component: (_s: unknown, props: { data: () => unknown }) =>
              ssrHtml(`<main>${esc(String(props.data()))}</main>`),
          },
        ],
      },
    ] as never;

    const handler = createPageHandler({
      routeTree: table,
      stream: false,
      app: (state) => renderRoutes(state),
      document,
    });
    const body = await (await handler(get("/app/7"))).text();

    expect(body).toContain("<header>LAYOUT</header>");
    expect(body).toContain("<main>LEAF</main>");
    // …and both values reach the client, or hydration refetches what the
    // server already paid for.
    expect(body).toContain(`r:${id}-layout|`);
    expect(body).toContain(`r:${id}-leaf|`);
  });

  test("B3 — a loader's redirect answers 302 on the STREAMED path too", async () => {
    // The existing `redirect() from a loader` test passes `stream: false`,
    // which is why this survived. On the default path `onLoaderError` records
    // into `answer` and `answer` is read only on the non-streamed branch, so
    // the throw escapes the stream's round loop — which swallows only
    // `NotReadyError` — and reaches `controller.error`.
    //
    // Measured before the fix: status 200, no Location, and reading the body
    // threw `Redirect: redirect to /login`.
    const id = fresh();
    const table = [
      {
        id,
        path: "/secret",
        loader: async () => {
          await tick();
          redirect("/login");
        },
        component: (_s: unknown, props: { data: () => unknown }) =>
          ssrHtml(`<main>${esc(String(props.data()))}</main>`),
      },
    ] as never;

    const handler = createPageHandler({
      routeTree: table,
      app: (state) => renderRoutes(state),
      document,
    });
    const response = await handler(get("/secret"));
    const body = await response.text();

    // Either a real 302, or — once the shell is already on the wire — a
    // client-side redirect carrying the same destination. What must NOT happen
    // is a 200 whose body tears on read.
    if (response.status === 302) {
      expect(response.headers.get("location")).toBe("/login");
    } else {
      // The shell was already on the wire, so the redirect rides the stream.
      expect(body).toContain('location.replace("/login")');
      expect(body).toContain('<meta http-equiv="refresh" content="0;url=/login">');
    }
    // What must never happen is the body tearing on read, which is what
    // `controller.error` did before there was a boundary to catch the throw.
    expect(body).toContain("</html>");
  });

  test("B5 — the router state outlives the stream that is still using it", async () => {
    // `createPageHandler` runs `finally { state.dispose() }` inside the
    // `withRequest` callback, and for a streamed response that callback returns
    // as soon as `renderToStream` hands back the ReadableStream — before one
    // byte of the body exists. So the loader cache is cleared and history is
    // unsubscribed WHILE the boundaries are still resuming, and every entry is
    // re-minted on resume.
    //
    // Today the damage is masked: a re-minted cell for an already-settled key
    // answers from the session bucket rather than refetching, so the loader
    // count looks right. It stops being masked the moment the chain is primed
    // — measured, one extra fetch and 40 ms — so the ordering is what this
    // asserts, not the symptom.
    const id = fresh();
    const order: string[] = [];
    const table = [
      {
        id,
        path: "/app",
        loader: async () => {
          await tick();
          await tick();
          order.push("loader settled");
          return "LATE";
        },
        component: (_s: unknown, props: { data: () => unknown }) =>
          ssrHtml(`<main>${esc(String(props.data()))}</main>`),
      },
    ] as never;

    const handler = createPageHandler({
      routeTree: table,
      app: (state) => {
        const dispose = state.dispose.bind(state);
        (state as unknown as { dispose: () => void }).dispose = () => {
          order.push("dispose");
          dispose();
        };
        return renderRoutes(state);
      },
      document,
    });

    const response = await handler(get("/app"));
    order.push("response returned");
    const body = await response.text();
    order.push("body read");

    expect(body).toContain("<main>LATE</main>");
    // The state must not be torn down while the boundaries it owns are still
    // resuming against it, so disposal comes after the last loader settles —
    // not when the `Response` object was handed back.
    expect(order.indexOf("dispose")).toBeGreaterThan(order.indexOf("loader settled"));
  });
});

/**
 * An error boundary per route depth, on the STRING backend.
 *
 * The B3 fix stopped a rejected loader tearing the response, and traded a torn
 * body for a silently truncated one: status 200, content missing, nothing in the
 * markup to say so. `errorComponent` is what makes the failure visible, and
 * `notFoundComponent` is what makes "the row is missing" a different answer from
 * "the page is broken".
 */
describe("errorComponent and notFoundComponent", () => {
  let seq = 0;
  const table = (
    id: string,
    thrown: () => never,
    extra: Record<string, unknown>,
  ): AnyRouteDefinition[] =>
    [
      {
        id,
        path: "/thing/$id",
        loader: async () => {
          await tick();
          thrown();
        },
        component: (_s: unknown, props: { data: () => unknown }) =>
          ssrHtml(`<main>${esc(String(props.data()))}</main>`),
        ...extra,
      },
    ] as never;

  const render = async (routes: AnyRouteDefinition[], stream: boolean): Promise<string> => {
    const handler = createPageHandler({
      routeTree: routes,
      stream,
      app: (s) => renderRoutes(s),
      document,
    });
    return (await handler(get("/thing/7"))).text();
  };

  test("a rejected loader renders the route's errorComponent, in both modes", async () => {
    for (const stream of [false, true]) {
      const id = `e${seq++}`;
      const body = await render(
        table(
          id,
          () => {
            throw new Error("the database is on fire");
          },
          {
            errorComponent: (_s: unknown, props: { error: () => Error }) =>
              ssrHtml(`<p class="boom">${esc(props.error().message)}</p>`),
          },
        ),
        stream,
      );
      expect(body).toContain('<p class="boom">the database is on fire</p>');
    }
  });

  test("notFound() reaches notFoundComponent and not errorComponent", async () => {
    const id = `n${seq++}`;
    const body = await render(
      table(id, () => notFound("no such thing"), {
        errorComponent: () => ssrHtml("<p>generic failure</p>"),
        notFoundComponent: (_s: unknown, props: { error: () => Error }) =>
          ssrHtml(`<p class="missing">${esc(props.error().message)}</p>`),
      }),
      false,
    );
    expect(body).toContain('<p class="missing">no such thing</p>');
    expect(body).not.toContain("generic failure");
  });

  test("notFound() falls through to errorComponent when there is no notFoundComponent", async () => {
    const id = `f${seq++}`;
    const body = await render(
      table(id, () => notFound(), {
        errorComponent: () => ssrHtml("<p>generic failure</p>"),
      }),
      false,
    );
    expect(body).toContain("<p>generic failure</p>");
  });

  test("notFound() answers 404 when the status is still open", async () => {
    const id = `s${seq++}`;
    const routes = table(id, () => notFound("gone"), {
      notFoundComponent: (_s: unknown, props: { error: () => Error }) =>
        ssrHtml(`<p>${esc(props.error().message)}</p>`),
    });
    const handler = createPageHandler({
      routeTree: routes,
      stream: false,
      app: (s) => renderRoutes(s),
      document,
    });
    const response = await handler(get("/thing/7"));
    expect(response.status).toBe(404);
    // …and the page it rendered is still the body, not a bare status.
    expect(await response.text()).toContain("<p>gone</p>");
  });

  test("a layout's errorComponent covers a child that declares none", async () => {
    const id = `l${seq++}`;
    const routes = [
      {
        id: `${id}-layout`,
        path: "/app",
        errorComponent: (_s: unknown, props: { error: () => Error }) =>
          ssrHtml(`<p class="layout-caught">${esc(props.error().message)}</p>`),
        component: (_s: unknown, props: { children: unknown }) =>
          ssrHtml(`<div>${esc((props.children as () => unknown)())}</div>`),
        children: [
          {
            id: `${id}-leaf`,
            path: "$id",
            loader: async () => {
              await tick();
              throw new Error("leaf failed");
            },
            component: (_s: unknown, props: { data: () => unknown }) =>
              ssrHtml(`<main>${esc(String(props.data()))}</main>`),
          },
        ],
      },
    ] as never;
    const handler = createPageHandler({
      routeTree: routes,
      stream: false,
      app: (s) => renderRoutes(s),
      document,
    });
    const body = await (await handler(get("/app/7"))).text();
    expect(body).toContain('<p class="layout-caught">leaf failed</p>');
    // The layout itself still rendered — one depth failing does not take the
    // chain above it.
    expect(body).toContain("<div>");
  });
});

/**
 * `<link rel="modulepreload">` for the matched chain.
 *
 * The channel that stops a code-split route flashing its `pending` fallback on
 * first hydration. `lazy()` cannot report its own module URL — the specifier
 * lives inside its closure and the returned function carries only `preload` —
 * so the map comes from the build, keyed by the `src` the compiler now emits.
 */
describe("modulepreload for the matched chain", () => {
  const assets = {
    layout: ["/assets/layout-a1.js", "/assets/shared-b2.js"],
    leaf: ["/assets/leaf-c3.js", "/assets/shared-b2.js"],
  };
  const nested = [
    {
      id: "layout",
      path: "/app",
      component: (_s: unknown, props: { children: unknown }) =>
        ssrHtml(`<div>${esc((props.children as () => unknown)())}</div>`),
      children: [{ id: "leaf", path: "$id", component: () => ssrHtml("<main>x</main>") }],
    },
  ] as never;

  test("outermost first, deduplicated, and escaped", () => {
    const chain = [
      { id: "layout", fullPath: "/app", definition: {} },
      { id: "leaf", fullPath: "/app/$id", definition: {} },
    ] as never;
    expect(preloadTags(chain, assets)).toBe(
      '<link rel="modulepreload" href="/assets/layout-a1.js">' +
        '<link rel="modulepreload" href="/assets/shared-b2.js">' +
        '<link rel="modulepreload" href="/assets/leaf-c3.js">',
    );
    // A shared chunk appears in two routes' lists by construction and is
    // emitted once.
    expect(preloadTags(chain, assets).match(/shared-b2/g)).toHaveLength(1);
  });

  test("no map means no tags, rather than a broken href", () => {
    expect(preloadTags([{ id: "layout" }] as never, undefined)).toBe("");
  });

  test("an attribute cannot be escaped out of", () => {
    expect(preloadTags([{ id: "x" }] as never, { x: ['" onload="alert(1)'] })).toBe(
      '<link rel="modulepreload" href="&quot; onload=&quot;alert(1)">',
    );
  });

  test("the tags reach the document BEFORE the body, in both modes", async () => {
    for (const stream of [false, true]) {
      const handler = createPageHandler({
        routeTree: nested,
        stream,
        routeAssets: assets,
        app: (state) => renderRoutes(state),
        document: ({ body, seed, preload }) =>
          `<!doctype html><html><head>${preload}</head><body>${body}${seed}</body></html>`,
      });
      const text = await (await handler(get("/app/7"))).text();
      expect(text).toContain('<link rel="modulepreload" href="/assets/leaf-c3.js">');
      // Ahead of the markup that needs them, which is the only moment a
      // preload is worth anything.
      expect(text.indexOf("modulepreload")).toBeLessThan(text.indexOf("<main>"));
    }
  });
});

/**
 * Selective SSR.
 *
 * The inheritance is TanStack's and it is ASYMMETRIC, which is the part worth
 * testing rather than assuming.
 */
describe("ssr: boolean | 'data-only'", () => {
  let seq = 0;
  const build = (
    layoutSsr: boolean | "data-only" | undefined,
    leafSsr: boolean | "data-only" | undefined,
    ran: string[],
  ): AnyRouteDefinition[] => {
    const id = `s${seq++}`;
    return [
      {
        id: `${id}-layout`,
        path: "/app",
        ssr: layoutSsr,
        loader: async () => {
          ran.push("layout");
          await tick();
          return "LAYOUT";
        },
        pendingComponent: () => ssrHtml("<i>layout-skeleton</i>"),
        component: (_s: unknown, props: { data: () => unknown; children: unknown }) =>
          ssrHtml(
            `<header>${esc(String(props.data()))}</header>${esc((props.children as () => unknown)())}`,
          ),
        children: [
          {
            id: `${id}-leaf`,
            path: "$id",
            ssr: leafSsr,
            loader: async () => {
              ran.push("leaf");
              await tick();
              return "LEAF";
            },
            pendingComponent: () => ssrHtml("<i>leaf-skeleton</i>"),
            component: (_s: unknown, props: { data: () => unknown }) =>
              ssrHtml(`<main>${esc(String(props.data()))}</main>`),
          },
        ],
      },
    ] as never;
  };

  const render = async (
    layoutSsr: boolean | "data-only" | undefined,
    leafSsr: boolean | "data-only" | undefined,
  ): Promise<{ body: string; ran: string[] }> => {
    const ran: string[] = [];
    const handler = createPageHandler({
      routeTree: build(layoutSsr, leafSsr, ran),
      stream: false,
      app: (state) => renderRoutes(state),
      document,
    });
    const body = await (await handler(get("/app/7"))).text();
    return { body, ran };
  };

  test("the default renders everything", async () => {
    const { body, ran } = await render(undefined, undefined);
    expect(body).toContain("<header>LAYOUT</header>");
    expect(body).toContain("<main>LEAF</main>");
    expect(ran.toSorted()).toEqual(["layout", "leaf"]);
  });

  test("'data-only' runs the loader and SEEDS it, but renders the fallback", async () => {
    const { body, ran } = await render(undefined, "data-only");
    expect(ran.toSorted()).toEqual(["layout", "leaf"]);
    expect(body).toContain("<header>LAYOUT</header>");
    // The component did not render…
    expect(body).not.toContain("<main>LEAF</main>");
    expect(body).toContain("<i>leaf-skeleton</i>");
    // …but its value is on the wire, so the client's first read consumes it
    // rather than refetching what the server already paid for.
    expect(body).toContain('"LEAF"');
  });

  test("`false` runs NOTHING and seeds nothing", async () => {
    const { body, ran } = await render(undefined, false);
    expect(ran).toEqual(["layout"]);
    expect(body).toContain("<header>LAYOUT</header>");
    expect(body).toContain("<i>leaf-skeleton</i>");
    expect(body).not.toContain('"LEAF"');
  });

  test("a parent's `false` is absorbing: the child cannot opt back in", async () => {
    const { body, ran } = await render(false, true);
    expect(ran).toEqual([]);
    expect(body).not.toContain("<header>");
    expect(body).toContain("<i>layout-skeleton</i>");
  });

  test("a parent's 'data-only' CLAMPS a child's `true` down to 'data-only'", async () => {
    const { body, ran } = await render("data-only", true);
    // Both loaders still run — that is what data-only means…
    expect(ran.toSorted()).toEqual(["layout", "leaf"]);
    // …and neither component renders, because the child was clamped.
    expect(body).not.toContain("<header>");
    expect(body).not.toContain("<main>");
    expect(body).toContain('"LAYOUT"');
  });

  test("…but a child may still declare `false` under a 'data-only' parent", async () => {
    const { ran } = await render("data-only", false);
    expect(ran).toEqual(["layout"]);
  });
});

/**
 * A loader returning a value with a promise still inside it.
 *
 * seroval can represent a pending promise in the seed, so barq does not have to
 * DROP the value and refetch the way SvelteKit does. What it could not do until
 * now was survive a non-streamed render, where there is no later chunk to
 * resolve into.
 */
describe("deferred loader data", () => {
  const routes = [
    {
      id: "deferred",
      path: "/report",
      loader: async () => ({
        summary: "ready now",
        // Deliberately not awaited.
        rows: new Promise((resolve) => setTimeout(() => resolve("the slow part"), 10)),
      }),
      component: (_s: unknown, props: { data: () => { summary: string } }) =>
        ssrHtml(`<main>${esc(props.data().summary)}</main>`),
    },
  ] as never;

  const render = async (stream: boolean): Promise<string> => {
    const handler = createPageHandler({
      routeTree: routes,
      stream,
      app: (s) => renderRoutes(s),
      document,
    });
    return (await handler(get("/report"))).text();
  };

  test("streamed: the page renders without waiting, and the slow part follows", async () => {
    const body = await render(true);
    expect(body).toContain("<main>ready now</main>");
    expect(body).toContain("the slow part");
    expect(body.indexOf("the slow part")).toBeGreaterThan(body.indexOf("ready now"));
  });

  test("non-streamed: it is awaited rather than crashing the request", async () => {
    // `serialize` throws `SerovalUnsupportedNodeError` on a promise
    // constructor, so this used to die with a seroval stack and no mention of
    // the route. `stream: false` means the whole thing at once, so awaiting is
    // the only answer available — and the right one.
    const body = await render(false);
    expect(body).toContain("<main>ready now</main>");
    expect(body).toContain("the slow part");
  });
});

/**
 * The hydration handoff for the route context.
 *
 * `beforeLoad` used to run TWICE on a first page load — once on the server, once
 * again when the client router mounted — because loader results are seeded and
 * context was not. TanStack carries the `beforeLoad` return over the wire as
 * `__beforeLoadContext` under the key `b`; this is barq's.
 */
describe("beforeLoad does not run twice on hydration", () => {
  let seq = 0;
  const table = (ran: string[]): AnyRouteDefinition[] => {
    const id = `h${seq++}`;
    return [
      {
        id: `${id}-layout`,
        path: "/app",
        context: () => {
          ran.push("context");
          return { sync: true };
        },
        beforeLoad: async () => {
          ran.push("beforeLoad");
          await tick();
          return { token: "abc" };
        },
        component: (_s: unknown, props: { context: () => Record<string, unknown> }) =>
          ssrHtml(`<main>${esc(JSON.stringify(props.context()))}</main>`),
      },
    ] as never;
  };

  const render = async (
    ran: string[],
    stream: boolean,
  ): Promise<{ body: string; context: string }> => {
    let context = "";
    const handler = createPageHandler({
      routeTree: table(ran),
      stream,
      app: (s) => renderRoutes(s),
      document: (parts) => {
        context = parts.context;
        return `<!doctype html><html><head>${parts.context}</head><body>${parts.body}${parts.seed}</body></html>`;
      },
    });
    const body = await (await handler(get("/app"))).text();
    return { body, context };
  };

  test("the server's beforeLoad result reaches the document, in both modes", async () => {
    for (const stream of [false, true]) {
      const ran: string[] = [];
      const { body, context } = await render(ran, stream);
      expect(ran).toEqual(["context", "beforeLoad"]);
      expect(context).toContain("__BARQ_ROUTE_CONTEXT__");
      expect(context).toContain("abc");
      // The href is carried so a client that already navigated does not adopt
      // a context built for somewhere else.
      expect(context).toContain("/app");
      expect(body).toContain("abc");
    }
  });

  test("only the beforeLoad RETURN travels, not the merged context", async () => {
    // `context()` is synchronous, deterministic and free to re-run, so it is
    // recomputed on the client rather than serialized — TanStack's split.
    const ran: string[] = [];
    const { context } = await render(ran, false);
    expect(context).toContain("token");
    expect(context).not.toContain("sync");
  });

  test("a page with no beforeLoad pays nothing", async () => {
    let context = "unset";
    const handler = createPageHandler({
      routeTree: [
        { id: `n${seq++}`, path: "/plain", component: () => ssrHtml("<main>x</main>") },
      ] as never,
      stream: false,
      app: (s) => renderRoutes(s),
      document: (parts) => {
        context = parts.context;
        return `<html><head>${parts.context}</head><body>${parts.body}${parts.seed}</body></html>`;
      },
    });
    await (await handler(get("/plain"))).text();
    expect(context).toBe("");
  });
});

/**
 * The round trip, end to end.
 *
 * The two halves above are tested apart, which proves each and not the pair:
 * this takes the script the server actually emitted, evaluates it the way a
 * browser would, and mounts a client router on the other side.
 */
describe("the context handoff, server to client", () => {
  test("the client adopts it and beforeLoad runs exactly once", async () => {
    const ran: string[] = [];
    const routes = [
      {
        id: "e2e",
        path: "/app/$id",
        context: () => ({ tenant: "acme" }),
        beforeLoad: async () => {
          ran.push("server");
          await tick();
          // A Date, to prove the codec carries what the hydration seed carries
          // rather than what `JSON.stringify` would.
          return { token: "abc", at: new Date(0) };
        },
        component: (_s: unknown, props: { context: () => Record<string, unknown> }) =>
          ssrHtml(`<main>${esc((props.context() as { token: string }).token)}</main>`),
      },
    ] as never;

    let script = "";
    const handler = createPageHandler({
      routeTree: routes,
      stream: false,
      app: (s) => renderRoutes(s),
      document: (parts) => {
        script = parts.context;
        return `<html><head>${parts.context}</head><body>${parts.body}${parts.seed}</body></html>`;
      },
    });
    expect(await (await handler(get("/app/7"))).text()).toContain("<main>abc</main>");
    expect(ran).toEqual(["server"]);

    // What a browser does with that script tag.
    const holder = globalThis as Record<string, unknown>;
    const source = script.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "");
    try {
      // oxlint-disable-next-line no-eval
      (0, eval)(source.replace(/^window\./, "globalThis."));
      expect(holder.__BARQ_ROUTE_CONTEXT__).toBeDefined();

      const state = createRouter({
        routeTree: routes,
        history: memoryHistory({ initial: ["/app/7"] }),
      });
      await state.start();
      // The server's value, carried — and `beforeLoad` did not run again.
      const leaf = state.contexts()[state.contexts().length - 1] as {
        tenant: string;
        token: string;
        at: Date;
      };
      expect(ran).toEqual(["server"]);
      expect(leaf.tenant).toBe("acme");
      expect(leaf.token).toBe("abc");
      expect(leaf.at).toBeInstanceOf(Date);
      state.dispose();
    } finally {
      delete holder.__BARQ_ROUTE_CONTEXT__;
    }
  });
});

/**
 * The seam the front door sits on: SSR through the page handler, then hydrate
 * the markup it produced with a client router over the same table.
 *
 * Nothing in this repo did this before — `hydrate()` and `createRouter` had no
 * common call site — and the first thing that did found the two walks
 * disagreeing. `renderRoutes` wrote its per-depth boundaries with no flags, so
 * the string backend emitted no range while `renderDepth` claimed three per
 * depth; and `loadingBoundary` released whatever claim it was handed and
 * rebuilt into a detached fragment. Measured against a real dev server before
 * the fix: `claimed: 0`, `recovered: true`, the seed unconsumed, the loader
 * refetched, and on a prerendered file a PERMANENT `pending` fallback.
 *
 * The components are hand-written in the shape the compiler emits for
 * `<div>shell:{props.children}</div>` and `<b>{() => props.data()?.name}</b>`,
 * verified against a real `transform()` of both backends — this package's test
 * plugin compiles `.tsx` for ONE backend, and a hydration test needs both.
 *
 * The assertions are on `hydrate.report` and on NODE IDENTITY, because a cold
 * rebuild produces the same text. That is L5's own rule.
 */
describe("hydration", () => {
  const shellTemplate = template("<div>shell:</div>");
  const boldTemplate = template("<b></b>");

  interface Kids {
    children: unknown;
  }
  interface Data {
    data: () => { name: string } | undefined;
  }

  const table = (ssr: boolean, ran: { calls: number }): AnyRouteDefinition[] => {
    const Root = (scope: never, props: Kids): unknown =>
      ssr
        ? ssrHtml(`<div>shell:<!--[-->${esc(props.children)}<!--]--></div>`)
        : ((): unknown => {
            const node = shellTemplate();
            insert(scope, node, props.children as never);
            return node;
          })();

    const Leaf = (scope: never, props: Data): unknown =>
      ssr
        ? ssrHtml(`<b>${esc(() => props.data()?.name)}</b>`)
        : ((): unknown => {
            const node = boldTemplate();
            insert(
              scope,
              node,
              hole(node, null, () => () => props.data()?.name, 16),
              null,
              16,
            );
            return node;
          })();

    return [
      {
        path: "/",
        component: Root as never,
        children: [
          {
            path: "users/$id",
            component: Leaf as never,
            loader: async ({ params }: { params: { id: string } }) => {
              ran.calls++;
              await tick();
              return { name: `Ada ${params.id}` };
            },
          },
        ],
      },
    ] as never;
  };

  test("a page the handler rendered is CLAIMED by the client router", async () => {
    const ran = { calls: 0 };
    let seed = "";
    const handler = createPageHandler({
      routeTree: table(true, ran),
      stream: false,
      app: (state) => renderRoutes(state),
      // Sentinels rather than a wrapper element, so the extraction below cannot
      // cut on a `</div>` the app itself wrote.
      document: (parts) => {
        seed = parts.seed;
        return `<!doctype html><html><head></head><body>[APP[${parts.body}]APP]${parts.seed}</body></html>`;
      },
    });

    const html = await (await handler(get("/users/7"))).text();
    expect(html).toContain("<b>Ada 7</b>");
    expect(ran.calls).toBe(1);

    // What a browser does with the seed script the handler emitted.
    const payload = seed.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "");
    // oxlint-disable-next-line no-eval
    (0, eval)(payload.replaceAll("window.", "globalThis."));

    const container = globalThis.document.createElement("div");
    globalThis.document.body.appendChild(container);
    container.innerHTML = html.slice(html.indexOf("[APP[") + 5, html.indexOf("]APP]"));
    const served = container.querySelector("b");
    expect(served?.textContent).toBe("Ada 7");

    const state = createRouter({
      routeTree: table(false, ran),
      history: memoryHistory({ initial: ["/users/7"] }),
    });
    // `(scope, props)`, which is the real calling convention behind the
    // props-first type — the same cast `router.test.ts`'s `mountState` uses.
    const provider = RouterProvider as never as (s: unknown, p: unknown) => unknown;
    hydrate(((s: unknown) => provider(s, { state: () => state })) as never, container);
    flush();

    expect(hydrate.report.recovered).toBe(false);
    expect(hydrate.report.mismatches).toEqual([]);
    expect(hydrate.report.claimed).toBeGreaterThan(0);
    // The server's own <b>, still in the document — which is what claiming buys
    // over a rebuild that produces identical markup.
    expect(container.querySelector("b")).toBe(served);
    expect(container.textContent).toBe("shell:Ada 7");
    // Seeded, so the client did not run the loader a second time.
    await tick();
    flush();
    expect(ran.calls).toBe(1);
    state.dispose();
    container.remove();
  });
});

/**
 * `chainVerifier`, which is what a server entry exports for the build to call.
 *
 * The verifier's own logic is `manifest.test.ts`; what this adds is the seam —
 * that it reaches the REAL registry through `mountedFn`, so an id the build
 * found in the client graph resolves to the function that was actually mounted.
 */
describe("chainVerifier", () => {
  const gate: Middleware = async (next) => next();

  const table = [
    {
      path: "/admin",
      middleware: [gate],
      component: (() => ssrHtml("")) as never,
      children: [{ path: "", component: (() => ssrHtml("")) as never }],
    },
  ] as never as AnyRouteDefinition[];

  test("an action that carries the route's chain passes", async () => {
    unmountAll();
    mount(
      "guarded",
      createServerFn()
        .middleware([gate])
        .handler(async () => "ok") as never,
    );
    expect(await chainVerifier(table)(new Map([["/admin", new Set(["guarded"])]]))).toBe("");
  });

  test("one that does not is reported, naming both", async () => {
    unmountAll();
    mount("bare", createServerFn().handler(async () => "ok") as never);
    const report = await chainVerifier(table)(new Map([["/admin", new Set(["bare"])]]));
    expect(report).toContain("bare is reachable from /admin");
    expect(report).toContain("separate HTTP endpoint");
  });

  test("an id nothing mounted is not a violation — it is not an endpoint", async () => {
    unmountAll();
    expect(await chainVerifier(table)(new Map([["/admin", new Set(["ghost"])]]))).toBe("");
  });
});

/**
 * The JSX shell — TanStack's `shellComponent`, with `<HeadContent />` and
 * `<Scripts />` placing themselves.
 *
 * This is what replaces the six-part `document()` template. The trap it removes
 * is not hypothetical: a template that shipped its own `<title>` ahead of the
 * route's made every route's title inert, because `document.title` is the first
 * title in tree order.
 */
describe("shellComponent", () => {
  const table = (head?: unknown, scripts?: unknown): AnyRouteDefinition[] =>
    [
      {
        id: "__root__",
        path: "/",
        shellComponent: (_s: unknown, props: { children: unknown }) =>
          ssrHtml(
            `<html lang="en"><head>${esc(HeadContent(_s as never))}</head>` +
              `<body><div id="app">${esc(props.children)}</div>${esc(Scripts())}</body></html>`,
          ),
        component: (_s: unknown, props: { children: unknown }) => ssrHtml(esc(props.children)),
        head: { meta: [{ title: "Site" }, { name: "description", content: "site" }] },
        children: [
          {
            id: "/page",
            path: "page",
            component: () => ssrHtml("<main>page</main>"),
            head,
            scripts,
          },
        ],
      },
    ] as never;

  const render = async (routes: AnyRouteDefinition[], extra = {}): Promise<string> => {
    const handler = createPageHandler({
      routeTree: routes,
      app: (s) => renderRoutes(s),
      clientAssets: { scripts: ["/entry.js"], css: ["/app.css"] },
      ...extra,
    });
    return (await handler(get("/page"))).text();
  };

  test("the document is the shell, doctype and all — no `document` needed", async () => {
    const body = await render(table());
    expect(body.startsWith('<!doctype html><html lang="en">')).toBe(true);
    expect(body).toContain("<main>page</main>");
    expect(body).toContain('<div id="app">');
  });

  test("`<HeadContent />` renders the merged chain, deepest wins", async () => {
    const body = await render(
      table({ meta: [{ title: "Page" }, { name: "description", content: "page" }] }),
    );
    expect(body).toContain("<title");
    expect(body).toContain("Page");
    expect(body).not.toContain("Site");
    expect(body).toContain('content="page"');
    expect(body).not.toContain('content="site"');
  });

  test("a route with no head still inherits the layout's", async () => {
    const body = await render(table());
    expect(body).toContain("Site");
    expect(body).toContain('content="site"');
  });

  test("`<Scripts />` places the client entry and the route's body scripts", async () => {
    const body = await render(table(undefined, () => [{ src: "/route.js" }]));
    expect(body).toContain('src="/route.js"');
    expect(body).toContain('src="/entry.js"');
    // The entry is in the BODY, after the mount element — not in the head.
    expect(body.indexOf('<div id="app">')).toBeLessThan(body.indexOf('src="/entry.js"'));
  });

  test("the client CSS goes in the head, where it cannot flash", async () => {
    const body = await render(table());
    expect(body.indexOf('href="/app.css"')).toBeLessThan(body.indexOf("</head>"));
  });

  test("the hydration seed lands INSIDE the body, before `</body>`", async () => {
    // The one splice left in the framework, and the reason it cannot be a
    // component: `renderPage` produces the seed BY rendering, so nothing
    // rendered during that render can emit it.
    //
    // Both arms now. The streamed one used to be the exception, because
    // `shellStream` piped the shell straight through and every later chunk
    // landed after `</html>`; it holds the tail from `</body>` since.
    const body = await render(table(), { stream: false });
    const seed = body.indexOf("__BARQ_EVTS__");
    expect(seed).toBeGreaterThan(-1);
    expect(seed).toBeLessThan(body.indexOf("</body>"));
    expect(body.endsWith("</html>")).toBe(true);
  });

  test("the streamed arm keeps every late script INSIDE the body too", async () => {
    // INVERTED, and the row it replaces is worth naming: it asserted that late
    // scripts land after `</html>` and called that "the stated limit". It was a
    // defect pinned as a contract — `wrapStream` had always held the tail for the
    // `document()` path, and TanStack holds it for the same reason
    // (`transformStreamWithRouter.ts`: "router HTML would put scripts after
    // `</body>` or drop them silently"). The JSX shell simply never did.
    const body = await render(table());
    const closeBody = body.indexOf("</body>");
    expect(closeBody).toBeGreaterThan(-1);
    for (const marker of ["__BARQ_EVTS__", "__BARQ_SWAP__"]) {
      const at = body.indexOf(marker);
      if (at === -1) continue;
      expect(at, `${marker} must land before </body>`).toBeLessThan(closeBody);
    }
    // …and the document still ends where a document ends.
    expect(body.trimEnd().endsWith("</html>")).toBe(true);
  });

  test("a table with neither a shell nor a `document` says so", async () => {
    const handler = createPageHandler({
      routeTree: [{ id: "/x", path: "/x", component: () => ssrHtml("x") }] as never,
      app: (s) => renderRoutes(s),
    });
    expect(handler(get("/x"))).rejects.toThrow(/shellComponent/);
  });
});

describe("crawlers are answered with the whole page", () => {
  const routes = [
    {
      id: "__root__",
      path: "/",
      shellComponent: (_s: unknown, props: { children: unknown }) =>
        ssrHtml(
          `<html><head>${esc(HeadContent(_s as never))}</head><body>${esc(props.children)}</body></html>`,
        ),
      component: (_s: unknown, props: { children: unknown }) => ssrHtml(esc(props.children)),
      children: [{ id: "/p", path: "p", component: () => ssrHtml("<main>p</main>") }],
    },
  ] as never as AnyRouteDefinition[];

  const fetchAs = async (agent: string, extra = {}): Promise<Response> => {
    const handler = createPageHandler({ routeTree: routes, app: (s) => renderRoutes(s), ...extra });
    return handler(new Request("http://x/p", { headers: { "user-agent": agent } }));
  };

  test("a bot takes the BUFFERED arm, so nothing is a placeholder", async () => {
    // TanStack's whole answer to "late head does not reach a crawler" is this
    // user-agent check — `renderRouterToStream` does
    // `if (isbot(...)) await waitForReadyOrAbort(...)`. barq needs no transform
    // for it: `stream: false` is already a renderer that settles first.
    const body = await (await fetchAs("Googlebot/2.1")).text();
    expect(body).toContain("<main>p</main>");
    expect(body).not.toContain("__BARQ_SWAP__");
  });

  test("a browser still streams", async () => {
    const body = await (await fetchAs("Mozilla/5.0 (X11; Linux x86_64) Chrome/120")).text();
    expect(body).toContain("<main>p</main>");
  });

  test("`bufferForCrawlers: false` turns it off", async () => {
    const response = await fetchAs("Googlebot/2.1", { bufferForCrawlers: false });
    expect(await response.text()).toContain("<main>p</main>");
  });
});

/**
 * The SHELL and hydration — the question a JSX document raises and a string
 * template never did.
 *
 * The server renders `shellComponent` around the chain; the client hydrates
 * `#app` and renders the chain ALONE. So the shell must contribute NOTHING
 * inside `#app` — if it added a range there, the walk would claim a shape the
 * client never builds and the server's markup would be evicted.
 */
describe("shell and hydration", () => {
  const leaf = (): unknown => ssrHtml("<b>leaf</b>");
  const layout = (_s: unknown, props: { children: unknown }): unknown =>
    ssrHtml(esc(props.children));

  const inside = (document_: string): string =>
    document_.slice(
      document_.indexOf('<div id="app">') + '<div id="app">'.length,
      document_.lastIndexOf("</div>"),
    );

  const render = async (routes: AnyRouteDefinition[], extra = {}): Promise<string> => {
    const handler = createPageHandler({
      routeTree: routes,
      stream: false,
      app: (s) => renderRoutes(s),
      ...extra,
    });
    return (await handler(get("/page"))).text();
  };

  test("the markup inside #app is byte-identical with and without a shell", async () => {
    const children = [{ id: "/page", path: "page", component: leaf as never }];
    const withShell = await render([
      {
        id: "__root__",
        path: "/",
        shellComponent: (_s: unknown, props: { children: unknown }) =>
          ssrHtml(
            `<html><head></head><body><div id="app">${esc(props.children)}</div></body></html>`,
          ),
        component: layout as never,
        children,
      },
    ] as never);
    const withTemplate = await render(
      [{ id: "__root__", path: "/", component: layout as never, children }] as never,
      { document: (parts: { body: string }) => `<div id="app">${parts.body}</div>` },
    );

    // The claim walk sees the same bytes either way, so a shell cannot be what
    // makes a page fail to hydrate.
    expect(inside(withShell)).toBe(inside(withTemplate));
    expect(inside(withShell)).toContain("<b>leaf</b>");
  });
});

/**
 * The head LANE, and where it stops.
 *
 * `projectLane` runs the match's own `head` and then breaks:
 * `if (match.ssr === false || …) break` (`router-core/src/load-server.ts:651`).
 * barq mapped the whole chain instead, so a document that contains nothing
 * below an `ssr: false` route still described every route below it — tags for
 * markup the server never rendered, built from a context those routes never
 * contributed to.
 */
describe("the head lane stops where the render does", () => {
  const table = (layoutSsr: boolean | undefined): AnyRouteDefinition[] =>
    [
      {
        id: "__root__",
        path: "/",
        shellComponent: (_s: unknown, props: { children: unknown }) =>
          ssrHtml(
            `<html><head>${esc(HeadContent(_s as never))}</head>` +
              `<body>${esc(props.children)}</body></html>`,
          ),
        component: (_s: unknown, props: { children: unknown }) => ssrHtml(esc(props.children)),
        head: { meta: [{ name: "root", content: "yes" }] },
        children: [
          {
            id: "/app",
            path: "app",
            ssr: layoutSsr,
            head: { meta: [{ name: "layout", content: "yes" }] },
            component: (_s: unknown, props: { children: unknown }) => ssrHtml(esc(props.children)),
            children: [
              {
                id: "/app/",
                path: "",
                head: { meta: [{ name: "leaf", content: "yes" }] },
                component: () => ssrHtml("<main>leaf</main>"),
              },
            ],
          },
        ],
      },
    ] as never;

  const headOf = async (layoutSsr: boolean | undefined): Promise<string> => {
    const handler = createPageHandler({
      routeTree: table(layoutSsr),
      stream: false,
      app: (state) => renderRoutes(state),
    });
    return (await handler(get("/app"))).text();
  };

  test("every route contributes when the whole chain is server-rendered", async () => {
    const body = await headOf(undefined);
    expect(body).toContain('name="root"');
    expect(body).toContain('name="layout"');
    expect(body).toContain('name="leaf"');
  });

  test("`ssr: false` contributes its OWN tags and nothing below it does", async () => {
    const body = await headOf(false);
    // Everything above it, as ever.
    expect(body).toContain('name="root"');
    // Its own, which is theirs: the break is AFTER the match's `head` runs.
    expect(body).toContain('name="layout"');
    // …and nothing below, because the server rendered none of it. This is the
    // assertion that was false before the lane broke, and it is the whole test.
    expect(body).not.toContain('name="leaf"');
    // The proof that the markup really is absent too, so the head is describing
    // the document rather than disagreeing with it.
    expect(body).not.toContain("<main>leaf</main>");
  });
});

/**
 * What happens when something between `beforeLoad` and the render throws.
 *
 * `dispose()` is now declared beside `createRouter` and the `try` starts at
 * `setContexts`, so the chunk imports, the head projection and the asset tags
 * are all inside the guard. They were not: `dispose` was declared just above the
 * render, and a throw in that region escaped `withRequest` with the state still
 * live — its history subscription, its loader cache, every in-flight cell.
 *
 * WHAT THIS DESCRIBE DOES NOT GATE, said plainly rather than implied. Disposal
 * has no observable effect from outside the handler, and the two tests below
 * pass with the guard in EITHER position — measured, by moving it back. So the
 * hoist is reviewed by placement and is not pinned here; putting a seam into
 * `createPageHandler` to watch a `dispose` would be inventing public API for a
 * test. What these DO gate is the behaviour either side of it, which is what
 * broke when the region was first written: a route whose chunk is missing must
 * not blank the document, and a handler that has thrown once must still answer
 * the next request.
 */
describe("a failure before the render, and what the handler does with it", () => {
  const handlerFor = (preload: () => unknown) =>
    createPageHandler({
      routeTree: [
        {
          id: "__root__",
          path: "/",
          component: (_s: unknown, props: { children: unknown }) => ssrHtml(esc(props.children)),
          children: [
            {
              id: "/boom",
              path: "boom",
              component: Object.assign(() => ssrHtml("<main>ok</main>"), { preload }),
            },
          ],
        },
      ] as never,
      stream: false,
      app: (state) => renderRoutes(state),
      document,
    });

  test("a chunk that REJECTS is the route's own problem, and the page still answers", async () => {
    // `preloadMatched` uses `allSettled` deliberately: refusing to hydrate the
    // whole page over one failed chunk turns one broken route into a blank
    // document.
    const handler = handlerFor(() => Promise.reject(new Error("chunk gone")));
    const response = await handler(get("/boom"));
    expect(response.status).toBeLessThan(500);
  });

  test("a chunk that throws SYNCHRONOUSLY propagates, and the next request is unaffected", async () => {
    // `preloadMatched` calls `preload()` before collecting it
    // (`route.ts:519-527`), so a synchronous throw bypasses its own `allSettled`
    // and leaves through the handler. It must not poison the handler.
    let fail = true;
    const handler = handlerFor(() => {
      if (fail) throw new Error("resolver exploded");
      return Promise.resolve();
    });
    expect(handler(get("/boom"))).rejects.toThrow(/resolver exploded/);

    fail = false;
    const after = await handler(get("/boom"));
    expect(after.status).toBe(200);
    expect(await after.text()).toContain("<main>ok</main>");
  });

  test("a `head` that throws costs that route its tags and nothing else", async () => {
    const handler = createPageHandler({
      routeTree: [
        {
          id: "__root__",
          path: "/",
          shellComponent: (_s: unknown, props: { children: unknown }) =>
            ssrHtml(
              `<html><head>${esc(HeadContent(_s as never))}</head>` +
                `<body>${esc(props.children)}</body></html>`,
            ),
          component: (_s: unknown, props: { children: unknown }) => ssrHtml(esc(props.children)),
          head: { meta: [{ name: "root", content: "yes" }] },
          children: [
            {
              id: "/x",
              path: "x",
              head: () => {
                throw new Error("head is broken");
              },
              component: () => ssrHtml("<main>x</main>"),
            },
          ],
        },
      ] as never,
      stream: false,
      app: (state) => renderRoutes(state),
    });

    const body = await (await handler(get("/x"))).text();
    // The document renders, the layout's tags survive, the broken route's are
    // simply absent — `projectHead`'s per-route swallow, which is what
    // `projectLane` does with the same failure.
    expect(body).toContain("<main>x</main>");
    expect(body).toContain('name="root"');
  });
});

/**
 * A loader and a `beforeLoad` can write to the response.
 *
 * This is where the ambient draft earns its keep beyond server functions: a
 * `beforeLoad` that authenticates seats the session and redirects in one step,
 * and a loader that knows the page is cacheable says so where it knows it —
 * neither of which can be expressed by a return value, since one returns a
 * verdict and the other returns data.
 */
describe("the response a page render drafts", () => {
  const page = (definition: Partial<AnyRouteDefinition>) =>
    createPageHandler({
      routeTree: [
        {
          id: "__root__",
          path: "/",
          component: (_s: unknown, props: { children: unknown }) => ssrHtml(esc(props.children)),
          children: [
            {
              id: "/x",
              path: "x",
              // READS `data`, because a loader runs on read — a component that
              // ignores it never triggers one, and the test would be asserting
              // against a loader that had not run.
              component: (_s: unknown, props: { data: () => unknown }) =>
                ssrHtml(`<main>${esc(String(props.data() ?? "x"))}</main>`),
              ...definition,
            },
          ],
        },
      ] as never,
      stream: false,
      app: (state) => renderRoutes(state),
      document,
    });

  test("a loader's `setCookie` and `setResponseHeader` reach the document", async () => {
    const handler = page({
      loader: () => {
        setCookie("seen", "1", { path: "/" });
        setResponseHeader("cache-control", "private, max-age=60");
        return "data";
      },
    });
    const response = await handler(get("/x"));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBe("seen=1; Path=/");
    expect(response.headers.get("cache-control")).toBe("private, max-age=60");
    // …and the page still rendered, which is the point: the header is a side
    // note, not the answer.
    expect(await response.text()).toContain("<main>data</main>");
    // The content type the framework sets is not clobbered by the merge.
    expect(response.headers.get("content-type")).toContain("text/html");
  });

  test("a `beforeLoad` that seats a session and THEN redirects keeps the cookie", async () => {
    // The whole shape of a login. Dropping the cookie would redirect a user who
    // is somehow still signed out — and the redirect makes it look like it
    // worked.
    const handler = page({
      beforeLoad: () => {
        setCookie("sid", "abc", { httpOnly: true, path: "/" });
        throw redirect("/dashboard");
      },
    });
    const response = await handler(get("/x"));
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/dashboard");
    expect(response.headers.get("set-cookie")).toBe("sid=abc; Path=/; HttpOnly");
  });

  test("`setResponseStatus` decides the page's status", async () => {
    const handler = page({
      beforeLoad: () => {
        setResponseStatus(403);
      },
    });
    const response = await handler(get("/x"));
    expect(response.status).toBe(403);
    // A rendered 403 — the page is the point, the status is the correction.
    expect(await response.text()).toContain("<main>x</main>");
  });

  /**
   * The REQUEST reaches a loader, which is the other half of the draft.
   *
   * It reads `authorization` and not `cookie`, for the reason this file already
   * records one describe up: `Cookie` is a FORBIDDEN request header name, so the
   * `Request` constructor drops it — in happy-dom, which this suite registers,
   * and in the spec. A server receives one off the wire and never constructs
   * one, so `getCookie` reading a real request is covered in
   * `packages/start`'s suite, which registers no DOM.
   */
  test("the ambient request reaches a loader", async () => {
    let saw: string | null | undefined;
    const handler = page({
      loader: () => {
        saw = getRequest().headers.get("authorization");
        return null;
      },
    });
    await handler(new Request("http://localhost/x", { headers: { authorization: "Bearer t" } }));
    expect(saw).toBe("Bearer t");
  });
});

/**
 * API routes — `server: { handlers }` on an ordinary route.
 *
 * Not a second route system, which is TanStack's arrangement: one tree, one
 * file convention, one generator, and a route may answer BOTH a page and an
 * endpoint.
 */
describe("a route's own HTTP handlers", () => {
  const api = (server: unknown, extra: Partial<AnyRouteDefinition> = {}) =>
    createPageHandler({
      routeTree: [
        {
          id: "__root__",
          path: "/",
          component: (_s: unknown, props: { children: unknown }) => ssrHtml(esc(props.children)),
          children: [
            {
              id: "/api/users/$id",
              path: "api/users/$id",
              server,
              component: () => ssrHtml("<main>page</main>"),
              ...extra,
            },
          ],
        },
      ] as never,
      stream: false,
      app: (state) => renderRoutes(state),
      document,
    });

  const send = (
    handler: (r: Request) => Promise<Response>,
    method: string,
    path = "/api/users/7",
  ) => handler(new Request(`http://localhost${path}`, { method }));

  test("the method picks the handler, and params are the route's", async () => {
    const handler = api({
      handlers: {
        GET: ({ params }: { params: Record<string, string> }) => Response.json({ id: params.id }),
        POST: () => new Response("made", { status: 201 }),
      },
    });
    const read = await send(handler, "GET");
    expect(read.status).toBe(200);
    expect(await read.json()).toEqual({ id: "7" });

    // A POST, which a page handler answers 405 to — the whole reason the
    // dispatch runs BEFORE the method gate.
    const written = await send(handler, "POST");
    expect(written.status).toBe(201);
    expect(await written.text()).toBe("made");
  });

  test("`ANY` catches the methods no handler named", async () => {
    const handler = api({
      handlers: {
        GET: () => Response.json("get"),
        ANY: ({ request }: { request: Request }) => new Response(request.method),
      },
    });
    expect(await (await send(handler, "GET")).json()).toBe("get");
    expect(await (await send(handler, "DELETE")).text()).toBe("DELETE");
  });

  /**
   * RFC 9110 §9.3.2: HEAD answers with the same header fields as GET and no
   * body. Theirs resolves it in the same order (`createStartHandler.ts:932-937`).
   */
  test("HEAD falls back to GET, with the headers and no body", async () => {
    const handler = api({
      handlers: {
        GET: () => new Response("a body", { headers: { "x-from": "get" } }),
      },
    });
    const response = await send(handler, "HEAD");
    expect(response.status).toBe(200);
    expect(response.headers.get("x-from")).toBe("get");
    expect(await response.text()).toBe("");
  });

  test("an explicit HEAD wins over the GET fallback", async () => {
    const handler = api({
      handlers: {
        GET: () => new Response("a body"),
        HEAD: () => new Response(null, { headers: { "x-from": "head" } }),
      },
    });
    expect((await send(handler, "HEAD")).headers.get("x-from")).toBe("head");
  });

  /**
   * DECLINING is what lets one route be both. A handler that looks at the
   * request and returns `undefined` hands the request back to the page render —
   * TanStack spells the same thing `next()` (`serverRoute.ts:461`).
   */
  test("a handler that returns nothing falls through to the page", async () => {
    const handler = api({
      handlers: {
        GET: ({ request }: { request: Request }) =>
          request.headers.get("accept") === "application/json"
            ? Response.json({ json: true })
            : undefined,
      },
    });
    const asJson = await handler(
      new Request("http://localhost/api/users/7", { headers: { accept: "application/json" } }),
    );
    expect(await asJson.json()).toEqual({ json: true });

    const asPage = await send(handler, "GET");
    expect(asPage.headers.get("content-type")).toContain("text/html");
    expect(await asPage.text()).toContain("<main>page</main>");
  });

  test("a route with no handler for the method still 405s, and says what it takes", async () => {
    const handler = api({ handlers: { POST: () => new Response("ok") } });
    const response = await send(handler, "DELETE");
    expect(response.status).toBe(405);
    // The `Allow` header names what this ROUTE accepts, not the generic pair.
    expect(response.headers.get("allow")).toContain("POST");
  });

  test("middleware is inherited, runs outermost first, and can refuse", async () => {
    const order: string[] = [];
    const outer: Middleware = async (next) => {
      order.push("outer");
      return next({ context: { who: "ada" } });
    };
    const inner: Middleware = async (next) => {
      order.push("inner");
      return next();
    };
    const handler = createPageHandler({
      routeTree: [
        {
          id: "__root__",
          path: "/",
          server: { middleware: [outer] },
          component: (_s: unknown, props: { children: unknown }) => ssrHtml(esc(props.children)),
          children: [
            {
              id: "/api",
              path: "api",
              server: {
                middleware: [inner],
                handlers: {
                  GET: ({ context }: { context: Record<string, unknown> }) =>
                    Response.json(context),
                },
              },
            },
          ],
        },
      ] as never,
      stream: false,
      app: (state) => renderRoutes(state),
      document,
    });

    const response = await handler(new Request("http://localhost/api"));
    expect(order).toEqual(["outer", "inner"]);
    // `next({ context })` reaches the handler, which is the same shape a server
    // function's middleware uses — one convention, one closure for both.
    expect(await response.json()).toEqual({ who: "ada" });
  });

  test("a middleware refuses by throwing a Response, as a server function's does", async () => {
    const guard: Middleware = async () => {
      throw new Response("nope", { status: 401 });
    };
    const handler = api({
      middleware: [guard],
      handlers: { GET: () => Response.json("unreachable") },
    });
    const response = await send(handler, "GET");
    expect(response.status).toBe(401);
    expect(await response.text()).toBe("nope");
  });

  test("a handler can set cookies through the ambient response", async () => {
    const handler = api({
      handlers: {
        POST: () => {
          setCookie("sid", "abc", { path: "/" });
          return Response.json({ ok: true });
        },
      },
    });
    const response = await send(handler, "POST");
    expect(response.headers.get("set-cookie")).toBe("sid=abc; Path=/");
  });

  /**
   * MEASURED BEFORE THIS EXISTED, against the built reference application:
   *
   *   POST /api/health, Origin: https://evil.example,
   *                     Sec-Fetch-Site: cross-site      ->  201
   *
   * Every state-changing API route was a CSRF target, carrying the visitor's
   * cookies, and nothing said so.
   */
  describe("cross-origin state change", () => {
    /**
     * The headers are INJECTED after construction, and they have to be.
     * `Origin` and every `Sec-` name are FORBIDDEN request headers, so the
     * `Request` constructor drops them — per the fetch spec, and happy-dom,
     * which this suite registers, enforces it. A server receives them off the
     * wire and never constructs them.
     *
     * The predicate itself is tested against REAL headers in
     * `packages/start`, which registers no DOM. What these gate is the WIRING:
     * that the check is called, that it is called before the handler, and that
     * the route's own options steer it.
     */
    const post = (headers: Record<string, string>) => {
      const request = new Request("http://localhost/api/users/7", { method: "POST" });
      Object.defineProperty(request, "headers", { value: new Headers(headers) });
      return request;
    };
    const handler = () => api({ handlers: { POST: () => Response.json({ done: true }) } });

    test("a browser POSTing from another origin is refused, and reaches nothing", async () => {
      let ran = false;
      const guarded = api({
        handlers: {
          POST: () => {
            ran = true;
            return Response.json({ done: true });
          },
        },
      });
      const response = await guarded(post({ origin: "https://evil.example" }));
      expect(response.status).toBe(403);
      // Refusing AFTER a handler has touched a database is a refusal that still
      // did the attacker's work.
      expect(ran).toBe(false);
    });

    test("`Sec-Fetch-Site` alone is enough to refuse", async () => {
      expect((await handler()(post({ "sec-fetch-site": "cross-site" }))).status).toBe(403);
      expect((await handler()(post({ "sec-fetch-site": "same-site" }))).status).toBe(403);
    });

    test("a `null` origin is refused rather than read as absent — CVE-2026-27978", async () => {
      // A sandboxed iframe sends the literal string.
      expect((await handler()(post({ origin: "null" }))).status).toBe(403);
    });

    test("the application's OWN origin passes, however it says so", async () => {
      expect((await handler()(post({ origin: "http://localhost" }))).status).toBe(200);
      expect((await handler()(post({ "sec-fetch-site": "same-origin" }))).status).toBe(200);
      expect((await handler()(post({ "sec-fetch-site": "none" }))).status).toBe(200);
    });

    /**
     * THE CASE THAT MAKES THE RULE NARROW. An API route exists so something
     * other than a browser can call it, and a Stripe webhook or a cron sends
     * neither header. Refusing on the ABSENCE of a signal would refuse the main
     * reason API routes exist — and a request with no signal is not a browser,
     * so it cannot be a forgery.
     */
    test("a webhook with no origin signal at all is allowed", async () => {
      expect((await handler()(post({}))).status).toBe(200);
    });

    test("a GET is never refused, because it changes nothing", async () => {
      const read = api({ handlers: { GET: () => Response.json({ ok: true }) } });
      const response = await read(
        new Request("http://localhost/api/users/7", {
          headers: { origin: "https://evil.example" },
        }),
      );
      expect(response.status).toBe(200);
    });

    test("`allowedOrigins` widens it, and `csrf: false` turns it off", async () => {
      const widened = api({
        allowedOrigins: ["https://partner.example"],
        handlers: { POST: () => Response.json({ ok: true }) },
      });
      expect((await widened(post({ origin: "https://partner.example" }))).status).toBe(200);
      expect((await widened(post({ origin: "https://evil.example" }))).status).toBe(403);

      const off = api({ csrf: false, handlers: { POST: () => Response.json({ ok: true }) } });
      expect((await off(post({ origin: "https://evil.example" }))).status).toBe(200);
    });
  });

  test("a handler inherits the PRERENDER refusal", async () => {
    // A build mints the `Request`, so `getRequest()` inside a handler would
    // answer with the build machine's headers and a cookie jar empty for
    // everyone — the same trap the page render already refuses, and a handler is
    // likelier to read a header than a component is.
    let thrown: string | null | undefined;
    const handler = createPageHandler({
      routeTree: [
        {
          id: "__root__",
          path: "/",
          component: (_s: unknown, props: { children: unknown }) => ssrHtml(esc(props.children)),
          children: [
            {
              id: "/api",
              path: "api",
              server: {
                handlers: {
                  GET: () => {
                    try {
                      getRequest();
                    } catch (error) {
                      thrown = (error as Error).message;
                    }
                    return Response.json({ ok: true });
                  },
                },
              },
            },
          ],
        },
      ] as never,
      stream: false,
      app: (state) => renderRoutes(state),
      document,
      refuseRequest: "no request during a prerender",
    });
    await handler(new Request("http://localhost/api"));
    expect(thrown).toBe("no request during a prerender");
  });

  test("a route with no `server` is untouched", async () => {
    const handler = api(undefined);
    const page = await send(handler, "GET");
    expect(await page.text()).toContain("<main>page</main>");
    expect((await send(handler, "POST")).status).toBe(405);
  });
});

/**
 * A redirect target barq will not send a browser to.
 *
 * MEASURED IN CHROME, because the answer is not obvious: a 302 whose `Location`
 * is `javascript:…` is INERT — no browser follows it — but a streamed redirect
 * cannot be a 302, and `location.replace("javascript:…")` EXECUTES. So the
 * ordinary `redirect(searchParams.get("next"))` is an open redirect before the
 * shell flushes and cross-site scripting after it. The escalation is barq's, so
 * the refusal is barq's.
 */
describe("a redirect target has to be navigable", () => {
  const table = (to: string, from: "beforeLoad" | "loader") =>
    [
      {
        id: "__root__",
        path: "/",
        component: (_s: unknown, props: { children: unknown }) => ssrHtml(esc(props.children)),
        children: [
          {
            id: "/x",
            path: "x",
            ...(from === "beforeLoad"
              ? {
                  beforeLoad: () => {
                    throw redirect(to);
                  },
                }
              : {
                  loader: () => {
                    throw redirect(to);
                  },
                }),
            component: (_s: unknown, props: { data: () => unknown }) =>
              ssrHtml(`<main>${esc(String(props.data() ?? "x"))}</main>`),
          },
        ],
      },
    ] as never;

  const render = async (to: string, from: "beforeLoad" | "loader") => {
    const handler = createPageHandler({
      routeTree: table(to, from),
      stream: false,
      app: (state) => renderRoutes(state),
      document,
    });
    return handler(get("/x"));
  };

  test("an ordinary path and an http(s) URL still redirect", async () => {
    for (const to of ["/dashboard", "//cdn.example/x", "https://auth.example/oauth"]) {
      const response = await render(to, "beforeLoad");
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(to);
    }
  });

  test("a `javascript:` target is refused before the shell, not sent", async () => {
    const response = await render("javascript:alert(1)", "beforeLoad");
    expect(response.status).toBe(500);
    expect(response.headers.get("location")).toBeNull();
  });

  test("…and never reaches the script a streamed redirect replays", async () => {
    // This is the arm that would EXECUTE it.
    const body = await (await render("javascript:alert(1)", "loader")).text();
    expect(body).not.toContain("javascript:alert(1)");
    expect(body).not.toContain("location.replace");
  });

  test("`data:` and `vbscript:` go the same way", async () => {
    for (const to of ["data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)"]) {
      expect((await render(to, "beforeLoad")).status).toBe(500);
    }
  });
});

/**
 * `head: ({ loaderData })` — and the wait it costs, which is the point.
 *
 * A `head` written as an OBJECT cannot read data, so it must never cost a wait.
 * A `head` written as a FUNCTION is asking for the match, so its route's loader
 * settles before the head is serialized — and only its route's.
 *
 * Theirs waits for the whole matched chain on every page, so a static title
 * pays there and does not here.
 */
describe("loaderData in head", () => {
  const LOADER_MS = 60;
  const table = (head: unknown) =>
    [
      {
        id: "__root__",
        path: "/",
        shellComponent: (scope: unknown, props: { children: unknown }) =>
          ssrHtml(
            `<html><head>${esc(HeadContent(scope as never))}</head>` +
              `<body>${esc(props.children)}</body></html>`,
          ),
        component: (_s: unknown, props: { children: unknown }) => ssrHtml(esc(props.children)),
        children: [
          {
            id: "/post",
            path: "post",
            loader: async () => {
              await new Promise((resolve) => setTimeout(resolve, LOADER_MS));
              return { title: "FROM THE LOADER" };
            },
            head,
            component: (_s: unknown, props: { data: () => unknown }) =>
              ssrHtml(`<main>${esc((props.data() as { title: string })?.title)}</main>`),
          },
        ],
      },
    ] as never;

  const render = async (head: unknown, stream: boolean) => {
    const handler = createPageHandler({
      routeTree: table(head),
      stream,
      app: (state) => renderRoutes(state),
    });
    const started = Date.now();
    const response = await handler(get("/post"));
    const headersAt = Date.now() - started;
    const body = await response.text();
    return { body, headersAt, title: /<title[^>]*>([^<]*)<\/title>/.exec(body)?.[1] ?? "NONE" };
  };

  const fnHead = ({ loaderData }: { loaderData: { title?: string } | undefined }) => ({
    meta: [{ title: loaderData?.title ?? "MISSING" }],
  });

  for (const stream of [false, true]) {
    test(`a function head reads the loader (stream=${stream})`, async () => {
      const { title, body } = await render(fnHead, stream);
      expect(title).toBe("FROM THE LOADER");
      // …and the page still renders, and still SEEDS, which is the thing that
      // breaks if the loader is read under a different async session.
      expect(body).toContain("<main>FROM THE LOADER</main>");
      expect(body).toContain("__BARQ_DATA__");
    });

    test(`an object head costs no wait (stream=${stream})`, async () => {
      const { title } = await render({ meta: [{ title: "STATIC" }] }, stream);
      expect(title).toBe("STATIC");
    });
  }

  /**
   * The whole reason the signal is the SHAPE of `head` rather than a flag: a
   * static title must keep the fast path. Measured rather than asserted, because
   * this is the property the design exists for.
   */
  test("a static head streams its first byte before the loader settles", async () => {
    const handler = createPageHandler({
      routeTree: table({ meta: [{ title: "STATIC" }] }),
      stream: true,
      app: (state) => renderRoutes(state),
    });
    const started = Date.now();
    const response = await handler(get("/post"));
    const reader = response.body!.getReader();
    await reader.read();
    const firstByteAt = Date.now() - started;
    // DRAINED, not cancelled: cancelling delegates to the inner stream, which
    // this reader has locked, and `Cannot cancel a locked ReadableStream` reads
    // like a bug in the handler rather than in the test.
    while (!(await reader.read()).done) {
      /* drain */
    }
    // Comfortably inside the loader's own time, so this cannot pass by accident.
    expect(firstByteAt).toBeLessThan(LOADER_MS / 2);
  });

  /**
   * `ssr: false` means NOTHING of the route runs on the server. Its head still
   * runs — theirs does too, and the lane breaks after it — but awaiting its
   * loader would be the single fetch `ssr: false` exists to prevent, and would
   * seed a value the client is supposed to fetch itself.
   *
   * Found by falsifying the fast-path gate above: forcing every head to wait
   * turned three `ssr` tests red at the same time, which is what pointed at it.
   */
  test("an `ssr: false` route does NOT have its loader awaited for its head", async () => {
    let ran = false;
    const handler = createPageHandler({
      routeTree: [
        {
          id: "__root__",
          path: "/",
          shellComponent: (scope: unknown, props: { children: unknown }) =>
            ssrHtml(
              `<html><head>${esc(HeadContent(scope as never))}</head>` +
                `<body>${esc(props.children)}</body></html>`,
            ),
          component: (_s: unknown, props: { children: unknown }) => ssrHtml(esc(props.children)),
          children: [
            {
              id: "/x",
              path: "x",
              ssr: false,
              loader: async () => {
                ran = true;
                return { title: "LEAKED" };
              },
              head: ({ loaderData }: { loaderData: { title?: string } | undefined }) => ({
                meta: [{ title: loaderData?.title ?? "none" }],
              }),
              component: () => ssrHtml("<main>x</main>"),
            },
          ],
        },
      ] as never,
      stream: false,
      app: (state) => renderRoutes(state),
    });
    const body = await (await handler(get("/x"))).text();
    expect(ran).toBe(false);
    // The head still runs, with nothing in it — which is theirs.
    expect(/<title[^>]*>([^<]*)<\/title>/.exec(body)?.[1]).toBe("none");
  });

  test("a function head waits, and that is the trade", async () => {
    const handler = createPageHandler({
      routeTree: table(fnHead),
      stream: true,
      app: (state) => renderRoutes(state),
    });
    const started = Date.now();
    const response = await handler(get("/post"));
    const reader = response.body!.getReader();
    await reader.read();
    const firstByteAt = Date.now() - started;
    while (!(await reader.read()).done) {
      /* drain */
    }
    expect(firstByteAt).toBeGreaterThanOrEqual(LOADER_MS - 10);
  });
});

/**
 * `basepath` — the deployment mounted somewhere other than the origin root.
 *
 * `history.ts` has had `stripBase` and `addBase` since it was written and
 * nothing reached them: `createRouter` took no base, so an application under
 * one had to build its own history, and `<Link>` still wrote an href without
 * it. That last part is the reason this went unnoticed — on the click path the
 * router intercepts and the missing base is invisible, so it only shows on
 * "open in new tab", a reload, or a crawler.
 */
describe("basepath", () => {
  const handler = createPageHandler({
    routeTree: baseTable,
    basepath: "/app",
    app: () => ssrHtml("<main>ok</main>"),
    document,
  });

  test("a path under the base matches the pattern written without it", async () => {
    expect((await handler(get("/app/"))).status).toBe(200);
    expect((await handler(get("/app/users/7"))).status).toBe(200);
  });

  /** The same path WITHOUT the base is not this application's. */
  test("a path outside the base is not served", async () => {
    expect((await handler(get("/users/7"))).status).toBe(404);
    expect((await handler(get("/other/users/7"))).status).toBe(404);
  });

  /** A prefix that is not a whole segment must not count as inside. */
  test("the base is matched by segment, not by prefix", async () => {
    expect((await handler(get("/application/users/7"))).status).toBe(404);
  });

  test("a miss under the base is still a miss", async () => {
    expect((await handler(get("/app/nope"))).status).toBe(404);
  });
});

/**
 * The href a browser sees carries the base; everything inside the router does
 * not. Two spellings, because they answer different questions — see
 * `linkAttrHref`.
 */
describe("a link under a basepath", () => {
  test("the attribute carries the base and the router's own view does not", () => {
    const state = createRouter({ routeTree: baseTable, basepath: "/app" });
    expect(state.base).toBe("/app");
    expect(linkAttrHref(state, "/users/7")).toBe("/app/users/7");
    // An off-site target is left exactly as written.
    expect(linkAttrHref(state, "https://x.test/y")).toBe("https://x.test/y");
  });

  test("no basepath is not a transformation", () => {
    const state = createRouter({ routeTree: baseTable });
    expect(state.base).toBe("");
    expect(linkAttrHref(state, "/users/7")).toBe("/users/7");
  });
});
