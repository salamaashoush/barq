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

import { createPageHandler, redirect, renderRoutes } from "./server.ts";
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
