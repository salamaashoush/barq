/**
 * What crosses a server render besides the loaders: a context made for one
 * request, the payload `dehydrate` returns, and the wrappers around the routes.
 */

import { runInThisContext } from "node:vm";

import { esc, html as ssrHtml } from "@barqjs/server";
import { type Child, flush, render } from "@barqjs/core";
import { afterEach, describe, expect, test } from "bun:test";

import { RouterProvider } from "./components.ts";
import { memoryHistory } from "./history.ts";
import type { AnyRouteDefinition, SsrDecider } from "./route.ts";
import { type RouterConfig, type RouterState, createRouter } from "./router.ts";
import { createPageHandler, renderRoutes } from "./server.ts";
import {
  ROUTER_DEHYDRATED_GLOBAL,
  type WrapProps,
  hydrateRouter,
  takeDehydrated,
  withRouterOverrides,
} from "./ssr.ts";

const tick = (ms = 0) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function get(path: string): Request {
  return new Request(`https://example.com${path}`);
}

const document = ({ body, seed }: { body: string; seed: string }): string =>
  `<!doctype html><html><body><div id="app">${body}</div>${seed}</body></html>`;

/** A page that prints what its loader read out of the router context. */
const whoTable = (wait = 0): AnyRouteDefinition[] =>
  [
    {
      path: "/who",
      loader: async ({ context }: { context: Record<string, unknown> }) => {
        await tick(wait);
        return `${String(context.site)}:${String(context.visitor)}`;
      },
      component: (props: { data: () => unknown; context: () => Record<string, unknown> }) =>
        ssrHtml(`<main>${esc(props.data())}|${esc(props.context().visitor)}</main>`),
    },
  ] as never;

/**
 * Run the scripts a page carries the router's payload in, in document order.
 *
 * Only those: this process is also the "server", so a loader seed left on the
 * global by one page would answer the next page's loader before it ran.
 */
function runScripts(markup: string): void {
  for (const [, source = ""] of markup.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
    if (!source.includes(ROUTER_DEHYDRATED_GLOBAL)) continue;
    runInThisContext(source.replaceAll("window.", "globalThis."));
  }
}

afterEach(() => {
  (globalThis as Record<string, unknown>)[ROUTER_DEHYDRATED_GLOBAL] = undefined;
  (globalThis as Record<string, unknown>).$R = undefined;
});

describe("the router context on the server", () => {
  test("a static context reaches the loader and the component", async () => {
    const handler = createPageHandler({
      routeTree: whoTable(),
      context: { site: "example.com", visitor: "salama" },
      stream: false,
      app: renderRoutes,
      document,
    });
    const html = await (await handler(get("/who"))).text();
    expect(html).toContain("<main>example.com:salama|salama</main>");
  });

  test("a context built from the request is that request's alone", async () => {
    const seen: string[] = [];
    const handler = createPageHandler({
      routeTree: whoTable(5),
      context: (request) => {
        const visitor = new URL(request.url).searchParams.get("as") ?? "nobody";
        seen.push(visitor);
        return { site: "example.com", visitor };
      },
      stream: false,
      app: renderRoutes,
      document,
    });
    const [mine, theirs] = await Promise.all([
      handler(get("/who?as=salama")).then((response) => response.text()),
      handler(get("/who?as=guest")).then((response) => response.text()),
    ]);
    expect(seen.toSorted()).toEqual(["guest", "salama"]);
    expect(mine).toContain("<main>example.com:salama|salama</main>");
    expect(mine).not.toContain("guest");
    expect(theirs).toContain("<main>example.com:guest|guest</main>");
    expect(theirs).not.toContain("salama");
  });

  test("an asynchronous context is awaited", async () => {
    const handler = createPageHandler({
      routeTree: whoTable(),
      context: async () => {
        await tick(2);
        return { site: "example.com", visitor: "salama" };
      },
      stream: false,
      app: renderRoutes,
      document,
    });
    expect(await (await handler(get("/who"))).text()).toContain("example.com:salama");
  });
});

describe("getRouter", () => {
  test("builds one router for each request, at that request's location", async () => {
    const built: RouterState[] = [];
    const routeTree = whoTable(3);
    const handler = createPageHandler({
      routeTree,
      context: (request) => ({ visitor: new URL(request.url).searchParams.get("as") }),
      getRouter: () => {
        const router = createRouter({ routeTree, context: { site: "example.com" } });
        built.push(router);
        return router;
      },
      stream: false,
      app: renderRoutes,
      document,
    });
    const [mine, theirs] = await Promise.all([
      handler(get("/who?as=salama")).then((response) => response.text()),
      handler(get("/who?as=guest")).then((response) => response.text()),
    ]);
    expect(built).toHaveLength(2);
    expect(built[0]).not.toBe(built[1]);
    expect(mine).toContain("<main>example.com:salama|salama</main>");
    expect(theirs).toContain("<main>example.com:guest|guest</main>");
  });

  test("a getRouter that awaits before createRouter is refused by name", async () => {
    const routeTree = whoTable();
    const handler = createPageHandler({
      routeTree,
      getRouter: async () => {
        await tick();
        return createRouter({ routeTree });
      },
      stream: false,
      app: renderRoutes,
      document,
    });
    expect(handler(get("/who"))).rejects.toThrow("did not call `createRouter`");
  });

  test("overrides reach exactly one createRouter and are gone afterwards", () => {
    const routeTree = whoTable();
    const history = memoryHistory({ initial: ["/who"] });
    const first = withRouterOverrides({ history }, () => createRouter({ routeTree }));
    const second = createRouter({ routeTree, history: memoryHistory({ initial: ["/"] }) });
    expect(first.location().pathname).toBe("/who");
    expect(second.location().pathname).toBe("/");
    first.dispose();
    second.dispose();
  });
});

describe("dehydrate and hydrate", () => {
  const table = (): AnyRouteDefinition[] =>
    [
      {
        path: "/",
        loader: async () => {
          await tick(3);
          return "loaded";
        },
        component: (props: { data: () => unknown }) => ssrHtml(`<main>${esc(props.data())}</main>`),
      },
    ] as never;

  const config = (seen: unknown[]): Pick<RouterConfig, "dehydrate" | "hydrate"> => ({
    dehydrate: () => ({ at: new Date(86_400_000), tags: new Set(["a", "b"]) }),
    hydrate: (dehydrated: unknown) => {
      seen.push(dehydrated);
    },
  });

  for (const stream of [false, true]) {
    test(`the payload crosses to hydrate with its types intact (stream=${stream})`, async () => {
      const seen: unknown[] = [];
      const routeTree = table();
      const handler = createPageHandler({
        routeTree,
        ...config(seen),
        stream,
        app: renderRoutes,
        document,
      });
      const html = await (await handler(get("/"))).text();
      expect(html).toContain("<main>loaded</main>");
      // Inside the body, where the boot can find it.
      expect(html.indexOf(ROUTER_DEHYDRATED_GLOBAL)).toBeLessThan(html.indexOf("</body>"));
      expect(html.indexOf(ROUTER_DEHYDRATED_GLOBAL)).toBeGreaterThan(
        html.indexOf('<div id="app">'),
      );

      runScripts(html);
      const state = createRouter({
        routeTree,
        ...config(seen),
        history: memoryHistory({ initial: ["/"] }),
      });
      await hydrateRouter(state);
      state.dispose();

      expect(seen).toHaveLength(1);
      const payload = seen[0] as { at: Date; tags: Set<string> };
      expect(payload.at).toBeInstanceOf(Date);
      expect(payload.at.getTime()).toBe(86_400_000);
      expect([...payload.tags]).toEqual(["a", "b"]);
      // Taken once: a second router on the page does not hydrate it again.
      expect(takeDehydrated()).toBeNull();
    });
  }

  test("hydrate is handed the type dehydrate returns", async () => {
    const seen: string[][] = [];
    const state = createRouter({
      routeTree: table(),
      dehydrate: async () => ({ flags: ["salama"] }),
      hydrate: (dehydrated) => {
        seen.push(dehydrated.flags);
      },
      history: memoryHistory({ initial: ["/"] }),
    });
    await state.options.hydrate?.(await state.options.dehydrate?.());
    state.dispose();
    expect(seen).toEqual([["salama"]]);
  });

  test("dehydrate runs after the loaders have settled", async () => {
    let loaded = "";
    const routeTree: AnyRouteDefinition[] = [
      {
        path: "/",
        loader: async () => {
          await tick(5);
          loaded = "yes";
          return "loaded";
        },
        component: (props: { data: () => unknown }) => ssrHtml(`<main>${esc(props.data())}</main>`),
      },
    ] as never;
    for (const stream of [false, true]) {
      loaded = "";
      const handler = createPageHandler({
        routeTree,
        dehydrate: () => ({ loaded }),
        stream,
        app: renderRoutes,
        document,
      });
      runScripts(await (await handler(get("/"))).text());
      expect(takeDehydrated()?.value).toEqual({ loaded: "yes" });
      (globalThis as Record<string, unknown>)[ROUTER_DEHYDRATED_GLOBAL] = undefined;
    }
  });

  test("a value that settles after the shell is streamed behind it", async () => {
    let finished = false;
    const routeTree = table();
    const handler = createPageHandler({
      routeTree,
      getRouter: () => {
        const router = createRouter({ routeTree });
        router.options.dehydrate = () => {
          let close!: () => void;
          const closed = new Promise<void>((resolve) => {
            close = resolve;
          });
          router.serverSsr?.onRenderFinished(() => {
            finished = true;
            close();
          });
          return {
            first: ["now"],
            later: (async function* () {
              await tick(4);
              yield ["soon"];
              await closed;
              yield ["last"];
            })(),
          };
        };
        return router;
      },
      stream: true,
      app: renderRoutes,
      document,
    });
    const response = await handler(get("/"));
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    const chunks: string[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(new TextDecoder().decode(value));
    }
    expect(finished).toBe(true);
    const carrying = chunks.filter((chunk) => chunk.includes(ROUTER_DEHYDRATED_GLOBAL));
    expect(carrying.length).toBeGreaterThan(1);

    runScripts(chunks.join(""));
    const payload = takeDehydrated()?.value as { first: string[]; later: AsyncIterable<string[]> };
    expect(payload.first).toEqual(["now"]);
    const later: string[][] = [];
    for await (const batch of payload.later) later.push(batch);
    expect(later).toEqual([["soon"], ["last"]]);
  });

  test("a script a loader injects follows the shell and never precedes it", async () => {
    let serving: RouterState | undefined;
    const routeTree: AnyRouteDefinition[] = [
      {
        path: "/",
        loader: async () => {
          serving?.serverSsr?.injectScript("window.injected=1");
          await tick(3);
          return "loaded";
        },
        component: (props: { data: () => unknown }) => ssrHtml(`<main>${esc(props.data())}</main>`),
      },
    ] as never;
    const handler = createPageHandler({
      routeTree,
      getRouter: () => {
        serving = createRouter({ routeTree });
        return serving;
      },
      stream: true,
      nonce: "n0nce",
      app: renderRoutes,
      document,
    });
    const html = await (await handler(get("/"))).text();
    const at = html.indexOf('<script nonce="n0nce">window.injected=1</script>');
    expect(at).toBeGreaterThan(html.indexOf('<div id="app">') + '<div id="app">'.length);
    expect(at).toBeLessThan(html.indexOf("</body>"));
  });

  test("a page with no dehydrate carries nothing extra", async () => {
    const handler = createPageHandler({
      routeTree: table(),
      stream: false,
      app: renderRoutes,
      document,
    });
    expect(await (await handler(get("/"))).text()).not.toContain(ROUTER_DEHYDRATED_GLOBAL);
  });
});

describe("Wrap and InnerWrap", () => {
  const order: string[] = [];
  const wrapper =
    (name: string) =>
    (props: WrapProps): unknown => {
      order.push(name);
      return props.children();
    };

  test("the string backend builds the routes inside both, outermost first", async () => {
    order.length = 0;
    const routeTree: AnyRouteDefinition[] = [
      {
        path: "/",
        component: () => {
          order.push("route");
          return ssrHtml("<main>home</main>");
        },
      },
    ] as never;
    const handler = createPageHandler({
      routeTree,
      Wrap: (props) => ssrHtml(`<section>${esc(wrapper("Wrap")(props))}</section>`),
      InnerWrap: wrapper("InnerWrap"),
      stream: false,
      app: renderRoutes,
      document,
    });
    const html = await (await handler(get("/"))).text();
    expect(order).toEqual(["Wrap", "InnerWrap", "route"]);
    expect(html).toMatch(/<section>.*<main>home<\/main>.*<\/section>/s);
  });

  test("the DOM backend nests them the same way", async () => {
    order.length = 0;
    const state = createRouter({
      routeTree: [
        {
          path: "/",
          component: (() => {
            order.push("route");
            return globalThis.document.createTextNode("home");
          }) as never,
        },
      ],
      Wrap: wrapper("Wrap"),
      InnerWrap: wrapper("InnerWrap"),
      history: memoryHistory({ initial: ["/"] }),
    });
    const container = globalThis.document.createElement("div");
    const provider = RouterProvider as never as (props: unknown) => unknown;
    const dispose = render((() => provider({ state: () => state })) as never, container);
    flush();
    await tick();
    expect(order).toEqual(["Wrap", "InnerWrap", "route"]);
    expect(container.textContent).toBe("home");
    dispose();
    state.dispose();
  });

  test("children is a Child, whether a wrapper calls it or places it", async () => {
    const state = createRouter({
      routeTree: [
        {
          path: "/",
          component: (() => globalThis.document.createTextNode("home")) as never,
        },
      ],
      Wrap: (props) => {
        const built: Child = props.children();
        return built;
      },
      InnerWrap: (props): Child => props.children,
      history: memoryHistory({ initial: ["/"] }),
    });
    const container = globalThis.document.createElement("div");
    const provider = RouterProvider as never as (props: unknown) => unknown;
    const dispose = render((() => provider({ state: () => state })) as never, container);
    flush();
    await tick();
    expect(container.textContent).toBe("home");
    dispose();
    state.dispose();
  });

  test("a wrapper installed after createRouter is the one that renders", async () => {
    order.length = 0;
    const routeTree: AnyRouteDefinition[] = [
      { path: "/", component: () => ssrHtml("<main>home</main>") },
    ] as never;
    const handler = createPageHandler({
      routeTree,
      getRouter: () => {
        const router = createRouter({ routeTree, Wrap: wrapper("configured") });
        const configured = router.options.Wrap;
        router.options.Wrap = (props) => {
          order.push("installed");
          return configured === undefined ? props.children() : configured(props);
        };
        return router;
      },
      stream: false,
      app: renderRoutes,
      document,
    });
    await (await handler(get("/"))).text();
    expect(order).toEqual(["installed", "configured"]);
  });
});

describe("a functional ssr", () => {
  const table = (ran: string[]): AnyRouteDefinition[] =>
    [
      {
        path: "/docs/$kind",
        ssr: async ({ params, search }: Parameters<SsrDecider>[0]) => {
          await tick();
          if (params.status === "success" && params.value.kind === "sheet") return false;
          if (search.status === "success" && search.value.details === "1") return "data-only";
          return undefined;
        },
        beforeLoad: () => {
          ran.push("beforeLoad");
        },
        loader: async () => {
          ran.push("loader");
          return "loaded";
        },
        pendingComponent: () => ssrHtml("<i>pending</i>"),
        component: (props: { data: () => unknown }) => ssrHtml(`<main>${esc(props.data())}</main>`),
      },
    ] as never;

  const served = async (path: string): Promise<{ html: string; ran: string[] }> => {
    const ran: string[] = [];
    const handler = createPageHandler({
      routeTree: table(ran),
      stream: false,
      app: renderRoutes,
      document,
    });
    return { html: await (await handler(get(path))).text(), ran };
  };

  test("answering nothing leaves the route rendered on the server", async () => {
    const { html, ran } = await served("/docs/page");
    expect(html).toContain("<main>loaded</main>");
    expect(ran).toEqual(["beforeLoad", "loader"]);
  });

  test("false runs nothing of the route for this request", async () => {
    const { html, ran } = await served("/docs/sheet");
    expect(html).toContain("<i>pending</i>");
    expect(html).not.toContain("<main>");
    expect(ran).toEqual([]);
  });

  test("data-only runs the loader and leaves the component to the browser", async () => {
    const { html, ran } = await served("/docs/page?details=1");
    expect(html).toContain("<i>pending</i>");
    expect(html).not.toContain("<main>");
    expect(ran).toEqual(["beforeLoad", "loader"]);
    expect(html).toContain("loaded");
  });
});

test("a shell is the root route with nothing under it run", async () => {
  const ran: string[] = [];
  const handler = createPageHandler({
    routeTree: [
      {
        id: "__root__",
        path: "/",
        component: (props: { children: unknown }) =>
          ssrHtml(`<nav>site</nav>${esc(props.children)}`),
        children: [
          {
            path: "",
            loader: async () => {
              ran.push("loader");
              return "home";
            },
            pendingComponent: () => ssrHtml("<i>starting</i>"),
            component: (props: { data: () => unknown }) =>
              ssrHtml(`<main>${esc(props.data())}</main>`),
          },
        ],
      },
    ] as never,
    shell: true,
    stream: false,
    app: renderRoutes,
    document,
  });
  const html = await (await handler(get("/"))).text();
  expect(html).toContain("<nav>site</nav>");
  expect(html).toContain("<i>starting</i>");
  expect(html).not.toContain("<main>");
  expect(ran).toEqual([]);
});
