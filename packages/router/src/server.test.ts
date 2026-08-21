/**
 * The page handler, driven with real `Request`s.
 *
 * Nothing in this repo had ever called the SSR page path — `serveBarq`,
 * `createFetchHandler` and `renderToStream` had zero non-test call sites — so
 * this file is the first consumer of it as well as its test.
 */

import { esc, html as ssrHtml, ssrLoading } from "@barqjs/server";
import { createServerFn, getRequest } from "@barqjs/start";
import { computed } from "@barqjs/core";
import { describe, expect, test } from "bun:test";

import { createPageHandler, notFound, preloadTags, redirect, renderRoutes } from "./server.ts";
import type { AnyRouteDefinition } from "./route.ts";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const document = ({ body, seed }: { body: string; seed: string }): string =>
  `<!doctype html><html><head><title>t</title></head><body>${body}${seed}</body></html>`;

const routes: AnyRouteDefinition[] = [
  { path: "/", component: (() => null) as never },
  { path: "/users/$id", component: (() => null) as never },
] as never;

function get(path: string, init?: RequestInit): Request {
  return new Request(`https://example.com${path}`, init);
}

describe("status is decided before the shell", () => {
  test("a match is 200 and a miss is 404", async () => {
    // `renderToStream` emits the shell synchronously, so a status discovered
    // mid-render would land after the headers. The match runs first.
    const handler = createPageHandler({
      routes,
      app: () => ssrHtml("<main>ok</main>"),
      document,
    });

    expect((await handler(get("/"))).status).toBe(200);
    expect((await handler(get("/nowhere"))).status).toBe(404);
  });

  test("a 404 still renders a document rather than a bare status", async () => {
    const handler = createPageHandler({
      routes,
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
      routes,
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
      routes,
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
      routes: [
        {
          path: "/",
          loader: () => whoami(undefined),
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
    // per-request callback rather than an ambient slot for the reason
    // GHSA-hgv7-v322-mmgr gives.
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
        loader: () => load(undefined),
        component: (_s: unknown, props: { data: () => unknown }) =>
          ssrHtml(`<b>${esc(String(props.data()))}</b>`),
      },
    ] as never;

    const handler = createPageHandler({
      routes: routesWithGuard,
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
      routes,
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
      routes,
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
      routes,
      app: () => ssrHtml("<main>x</main>"),
      document: () => "<html><body>oops</body></html>",
    });
    expect(handler(get("/"))).rejects.toThrow(/must place its `body` argument/);
  });
});

/**
 * Five defects found by probe at the start of P6, each on a shipped path and
 * each with nothing in this suite that would have caught it. They are written
 * here before the fixes so the commits that follow have something to turn
 * green — `packages/router/DESIGN.md`'s P-A/P-B/P-C are the model.
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
      routes: table,
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
      routes: table,
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
      routes: table,
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
 * §3.4 — an error boundary per route depth, on the STRING backend.
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
    const handler = createPageHandler({ routes, stream, app: (s) => renderRoutes(s), document });
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
      routes,
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
      routes,
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
 * §3.5 — `<link rel="modulepreload">` for the matched chain.
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
        routes: nested,
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
