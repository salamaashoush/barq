/**
 * The router integration, end to end: a loader that calls `ensureQueryData` on
 * the client in the router context, rendered by the router's own page handler
 * in a server process, and hydrated here.
 */

import { afterEach, expect, test } from "bun:test";
import { flush, hydrate, resetChildIds } from "@barqjs/core";
import {
  RouterProvider,
  type RouterState,
  createRootRoute,
  createRootRouteWithContext,
  createRouter,
  hydrateRouter,
  memoryHistory,
  redirect,
  withRouterOverrides,
} from "@barqjs/router";

import { QueryClient, QueryObserver } from "./index.ts";
import {
  type QueryRouterContext,
  queryClientContext,
  setupRouterSsrQueryIntegration,
} from "./router.ts";
import {
  ENTRY,
  assemble,
  compile,
  mount,
  runScripts,
  seeds,
  serve,
  unseeded,
} from "./ssr-harness.ts";

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

const ROUTES = `
import { Loading } from "@barqjs/core"
import { QueryClient, queryOptions, useQuery } from ${JSON.stringify(ENTRY.index)}
import { RouterQueryClientProvider, queryClientContext } from ${JSON.stringify(ENTRY.router)}

export const counts = { fetches: 0 }
export const clients = []

const user = (id) => queryOptions({
  queryKey: ["user", id],
  queryFn: () => {
    counts.fetches++
    return new Promise((done) => setTimeout(() => done({ id, name: "salama-" + id }), 3))
  },
})

function Root(props) {
  return (
    <RouterQueryClientProvider>
      <main>shell:{props.children}</main>
    </RouterQueryClientProvider>
  )
}

function User(props) {
  const query = useQuery(() => user(props.params().id))
  return <b class="user">{query.data?.name}|{props.data()?.name}</b>
}

export const routes = [
  {
    path: "/",
    component: Root,
    context: queryClientContext(() => {
      const client = new QueryClient()
      clients.push(client)
      return client
    }),
    children: [
      {
        path: "users/$id",
        component: User,
        loader: ({ context, params }) => context.queryClient.ensureQueryData(user(params.id)),
      },
    ],
  },
]
`;

interface Routes {
  counts: { fetches: number };
  clients: QueryClient[];
  routes: readonly unknown[];
}

interface Handled {
  pages: { status: number; html: string }[];
  clients: string[][];
}

const body = (html: string): string => html.slice(html.indexOf("[APP[") + 5, html.indexOf("]APP]"));

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  unseeded();
  (globalThis as Record<string, unknown>).__BARQ_ROUTER__ = undefined;
  document.body.innerHTML = "";
});

test("a loader's ensureQueryData crosses to the page, and each request has its own client", async () => {
  unseeded();
  const compiled = compile(ROUTES, "router");
  const served = serve(compiled.ssr, "handler", "/users/7,/users/8") as {
    result: Handled;
    fetches: number;
  };

  const [seven, eight] = served.result.pages;
  expect(seven?.status).toBe(200);
  // One fetch for each request: the loader and the component share it.
  expect(served.fetches).toBe(2);
  expect(served.result.clients).toEqual([['["user","7"]'], ['["user","8"]']]);

  const container = mount();
  container.innerHTML = body(seven?.html ?? "");
  expect(container.textContent).toBe("shell:salama-7|salama-7");
  expect(body(eight?.html ?? "")).toContain("salama-8");
  expect(body(eight?.html ?? "")).not.toContain("salama-7");
  runScripts(seven?.html ?? "");
  expect(seeds().length).toBeGreaterThan(0);

  const module = (await import(compiled.dom)) as Routes;
  const state = createRouter({
    routeTree: module.routes as never,
    history: memoryHistory({ initial: ["/users/7"] }),
  });
  await state.start();
  resetChildIds();
  const provider = RouterProvider as never as (props: unknown) => unknown;
  const dispose = hydrate((() => provider({ state: () => state })) as never, container);
  cleanup = () => {
    dispose();
    state.dispose();
  };
  flush();

  expect(container.textContent).toBe("shell:salama-7|salama-7");
  expect(hydrate.report.recovered).toBe(false);
  await tick(30);
  flush();
  expect(module.counts.fetches).toBe(0);
  expect(module.clients).toHaveLength(1);
  const crossed: unknown = module.clients[0]?.getQueryData(["user", "7"]);
  expect(crossed).toEqual({ id: "7", name: "salama-7" });
  expect(container.textContent).toBe("shell:salama-7|salama-7");
});

test("the browser keeps one client across navigations; a server makes one for each request", () => {
  let made = 0;
  const context = queryClientContext(() => {
    made++;
    return new QueryClient();
  });
  const first = context().queryClient;
  expect(context().queryClient).toBe(first);
  expect(made).toBe(1);
});

test("the context is what a root route's `context` and `createRootRouteWithContext` take", () => {
  const root = createRootRoute({ context: queryClientContext(() => new QueryClient()) });
  const typed = createRootRouteWithContext<QueryRouterContext>()({
    beforeLoad: ({ context }) => {
      const client: QueryClient = context.queryClient;
      return { client };
    },
  });
  expect(root.options.context?.({} as never).queryClient).toBeInstanceOf(QueryClient);
  expect(typed.id).toBe(root.id);
});

test("a redirect a query fails with is followed", async () => {
  const went: unknown[] = [];
  const router = {
    options: {},
    navigate: async (to: unknown) => {
      went.push(to);
    },
  } as unknown as RouterState;
  const failures: unknown[] = [];
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.getQueryCache().config.onError = (error) => failures.push(error);

  const redirected = (to: string): Error => {
    try {
      return redirect(to);
    } catch (thrown) {
      return thrown as Error;
    }
  };

  const stop = setupRouterSsrQueryIntegration({ router, queryClient });
  const observe = (key: string, error: Error) => {
    const observer = new QueryObserver(queryClient, {
      queryKey: [key],
      queryFn: async () => {
        throw error;
      },
    });
    return observer.subscribe(() => {});
  };

  const offRedirect = observe("guarded", redirected("/login"));
  const offFailure = observe("broken", new Error("plain"));
  await tick(10);
  expect(went).toEqual(["/login"]);
  expect(failures.map((error) => (error as Error).message)).toEqual(["plain"]);

  stop();
  const offLater = observe("guarded-later", redirected("/elsewhere"));
  await tick(10);
  expect(went).toEqual(["/login"]);
  offRedirect();
  offFailure();
  offLater();
  queryClient.clear();
});

const INTEGRATED = `
import { Loading } from "@barqjs/core"
import { createRouter } from "@barqjs/router"
import { QueryClient, queryOptions, useSuspenseQuery } from ${JSON.stringify(ENTRY.index)}
import { setupRouterSsrQueryIntegration } from ${JSON.stringify(ENTRY.router)}

export const counts = { fetches: 0 }
export const clients = []
const after = (ms, value) => new Promise((done) => setTimeout(() => done(value), ms))
const fetched = (key, ms, value) => queryOptions({
  queryKey: key,
  queryFn: () => { counts.fetches++; return after(ms, value) },
})

const user = (id) => fetched(["user", id], 3, { id, name: "salama-" + id })
const unread = (id) => fetched(["unread", id], 2, "unread-" + id)
const late = (id) => fetched(["late", id], 15, "late-" + id)
const slow = (id) => fetched(["slow", id], 40, "slow-" + id)

function Root(props) {
  return <main>shell:{props.children}</main>
}

function Slow(props) {
  const query = useSuspenseQuery(() => slow(props.id()))
  return <i class="slow">{query.data}</i>
}

function User(props) {
  const query = useSuspenseQuery(() => user(props.params().id))
  return (
    <b class="user">
      {query.data.name}
      <Loading fallback={<u>waiting</u>}><Slow id={props.params().id} /></Loading>
    </b>
  )
}

export const routes = [
  {
    path: "/",
    component: Root,
    children: [
      {
        path: "users/$id",
        component: User,
        loader: async ({ context, params }) => {
          void context.queryClient.prefetchQuery(late(params.id))
          await context.queryClient.ensureQueryData(unread(params.id))
          return context.queryClient.ensureQueryData(user(params.id))
        },
      },
    ],
  },
]

export function getRouter() {
  const queryClient = new QueryClient()
  clients.push(queryClient)
  const router = createRouter({ routeTree: routes, context: { queryClient } })
  setupRouterSsrQueryIntegration({ router, queryClient })
  return router
}
`;

interface Integrated extends Routes {
  getRouter: () => RouterState;
}

interface Streamed {
  pages: { status: number; html: string; chunks: string[] }[];
  clients: string[][];
}

for (const mode of ["handler", "handler-streamed"] as const) {
  test(`the integration carries a request's queries to the page, read or not (${mode})`, async () => {
    unseeded();
    const compiled = compile(INTEGRATED, "integrated");
    const served = serve(compiled.ssr, mode, "/users/7,/users/8") as {
      result: Streamed;
      fetches: number;
    };

    const [seven, eight] = served.result.pages;
    expect(seven?.status).toBe(200);
    // Four queries for each of two requests, fetched once each.
    expect(served.fetches).toBe(8);
    // Each request had a client of its own.
    expect(served.result.clients).toHaveLength(2);
    expect(seven?.html).toContain("unread-7");
    expect(seven?.html).not.toContain("unread-8");
    expect(eight?.html).toContain("unread-8");
    expect(eight?.html).not.toContain("unread-7");

    const carrying = (seven?.chunks ?? []).filter((chunk) => chunk.includes("__BARQ_ROUTER__"));
    if (mode === "handler-streamed") {
      // The query that settled after the loaders follows them in a chunk of its own.
      expect(carrying.length).toBeGreaterThan(1);
      expect(carrying[0]).not.toContain("late-7");
    }

    const container = mount();
    const chunks = (seven?.chunks ?? []).map((chunk, index, all) => {
      let text = chunk;
      if (index === 0) text = text.slice(text.indexOf("[APP[") + 5);
      if (index === all.length - 1) text = text.replace("]APP]", "");
      return text;
    });
    assemble(chunks, container);
    expect(container.textContent).toBe("shell:salama-7slow-7");

    const module = (await import(compiled.dom)) as Integrated;
    const state = withRouterOverrides(
      { history: memoryHistory({ initial: ["/users/7"] }) },
      module.getRouter,
    );
    await hydrateRouter(state);
    const cached = (key: readonly unknown[]): unknown => module.clients[0]?.getQueryData(key);
    // In the cache before anything has rendered, and no component reads it.
    expect(cached(["unread", "7"])).toBe("unread-7");

    await state.start();
    resetChildIds();
    const provider = RouterProvider as never as (props: unknown) => unknown;
    const dispose = hydrate((() => provider({ state: () => state })) as never, container);
    cleanup = () => {
      dispose();
      state.dispose();
    };
    flush();

    expect(container.textContent).toBe("shell:salama-7slow-7");
    expect(hydrate.report.recovered).toBe(false);
    await tick(60);
    flush();
    expect(module.counts.fetches).toBe(0);
    expect(module.clients).toHaveLength(1);
    expect(cached(["late", "7"])).toBe("late-7");
    expect(cached(["user", "7"])).toEqual({ id: "7", name: "salama-7" });
    expect(container.textContent).toBe("shell:salama-7slow-7");
  });
}

test("wrapQueryClient: false leaves the provider to the application", () => {
  const queryClient = new QueryClient();
  const router = createRouter({ routeTree: [], history: memoryHistory() });
  const stop = setupRouterSsrQueryIntegration({ router, queryClient, wrapQueryClient: false });
  expect(router.options.Wrap).toBeUndefined();
  stop();
  const wrapping = setupRouterSsrQueryIntegration({ router, queryClient });
  expect(router.options.Wrap).toBeDefined();
  wrapping();
  router.dispose();
});
