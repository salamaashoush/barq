/**
 * The TanStack-shaped half of the router instance: its context, the object form
 * of `navigate`, `buildLocation`, and the state and cache methods beside them.
 *
 * Driven without a document wherever the behaviour does not need one, so a
 * failure here is about the router and not about a render.
 */

import { flush, insert, render } from "@barqjs/core";
import { afterEach, describe, expect, test } from "bun:test";

import { RouterProvider } from "./components.ts";
import { isNotFound, isRedirect, notFound, redirect } from "./errors.ts";
import { memoryHistory } from "./history.ts";
import type { AnyRouteDefinition, RouteProps } from "./route.ts";
import { type RouteMatch, type RouterState, createRouteMask, createRouter } from "./router.ts";
import { retainSearchParams } from "./search.ts";

const tick = (ms = 0) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const page =
  (label: string) =>
  (_props: RouteProps): Node =>
    document.createTextNode(label);

afterEach(() => {
  document.body.innerHTML = "";
});

function mountState(state: RouterState): { host: HTMLElement; dispose: () => void } {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const dispose = render(
    (() =>
      (RouterProvider as never as (p: unknown) => unknown)({
        state: () => state,
      })) as never,
    host,
  );
  flush();
  return { host, dispose };
}

const routes = (table: unknown[]): AnyRouteDefinition[] => table as never;

describe("router context", () => {
  test("`createRouter({ context })` is what every beforeLoad and loader starts from", async () => {
    const seen: Record<string, unknown>[] = [];
    const state = createRouter({
      context: { user: "salama" },
      routeTree: routes([
        {
          id: "layout",
          path: "/app",
          beforeLoad: ({ context }: { context: Record<string, unknown> }) => {
            seen.push(context);
            return { tenant: "acme" };
          },
          children: [
            {
              id: "leaf",
              path: "$id",
              component: page("leaf"),
              loader: ({ context }: { context: Record<string, unknown> }) => {
                seen.push(context);
                return "data";
              },
            },
          ],
        },
      ]),
      history: memoryHistory({ initial: ["/app/7"] }),
    });
    await state.load();
    expect(seen[0]).toEqual({ user: "salama" });
    // The route's own contribution is laid over the router's, child winning.
    expect(seen[1]).toEqual({ user: "salama", tenant: "acme" });
    expect(state.contexts().at(-1)).toEqual({ user: "salama", tenant: "acme" });
    state.dispose();
  });

  test("a loader is handed the location, navigate, the abort controller, and its parent's match", async () => {
    let given: Record<string, unknown> = {};
    const state = createRouter({
      routeTree: routes([
        {
          id: "layout",
          path: "/app",
          loader: async () => {
            await tick(5);
            return "parent-data";
          },
          children: [
            {
              id: "leaf",
              path: "$id",
              component: page("leaf"),
              loader: async (context: Record<string, unknown>) => {
                given = context;
                const parent = (await context.parentMatchPromise) as RouteMatch;
                return `child of ${String(parent.loaderData)}`;
              },
            },
          ],
        },
      ]),
      history: memoryHistory({ initial: ["/app/7?tab=a"] }),
    });
    await state.load();
    expect((given.location as { pathname: string }).pathname).toBe("/app/7");
    expect(typeof given.navigate).toBe("function");
    expect(given.abortController).toBeInstanceOf(AbortController);
    expect((given.abortController as AbortController).signal).toBe(given.signal as AbortSignal);
    expect(given.preload).toBe(false);
    expect(given.cause).toBe("enter");
    expect((given.route as { id: string }).id).toBe("leaf");
    expect(given.params).toEqual({ id: "7" });
    expect(state.matches().at(-1)?.loaderData).toBe("child of parent-data");
    state.dispose();
  });

  test("beforeLoad is told whether it is a preload, and is handed navigate and buildLocation", async () => {
    const seen: { preload: boolean; cause: string; routeId: string }[] = [];
    let built = "";
    const state = createRouter({
      routeTree: routes([
        { path: "/", component: page("home") },
        {
          path: "/posts/$id",
          component: page("post"),
          beforeLoad: (context: {
            preload: boolean;
            cause: string;
            routeId: string;
            abortController: AbortController;
            buildLocation: RouterState["buildLocation"];
          }) => {
            seen.push({ preload: context.preload, cause: context.cause, routeId: context.routeId });
            built = context.buildLocation({ to: "/posts/$id", params: { id: "9" } }).href;
            expect(context.abortController).toBeInstanceOf(AbortController);
          },
        },
      ]),
      history: memoryHistory({ initial: ["/"] }),
    });
    await state.preloadRoute({ to: "/posts/$id", params: { id: "7" } });
    await state.navigate({ to: "/posts/$id", params: { id: "7" } });
    expect(seen).toEqual([
      { preload: true, cause: "preload", routeId: "/posts/$id" },
      { preload: false, cause: "enter", routeId: "/posts/$id" },
    ]);
    expect(built).toBe("/posts/9");
    state.dispose();
  });
});

describe("buildLocation", () => {
  const table = routes([
    { path: "/", component: page("home") },
    { path: "/posts", component: page("posts") },
    { path: "/posts/$id", component: page("post") },
    { path: "/posts/$id/edit", component: page("edit") },
    {
      path: "/shop",
      component: page("shop"),
      validateSearch: (input: Record<string, unknown>) => ({ page: Number(input.page ?? 1) }),
      search: { middlewares: [retainSearchParams(["ref"])] },
    },
  ]);
  const at = (initial: string, extra: Record<string, unknown> = {}): RouterState =>
    createRouter({ routeTree: table, history: memoryHistory({ initial: [initial] }), ...extra });

  test("a route id with params is interpolated, and the query and hash are written", () => {
    const state = at("/");
    const built = state.buildLocation({
      to: "/posts/$id",
      params: { id: "a b" },
      search: { tab: "info", empty: undefined },
      hash: "top",
      state: { from: "test" },
    });
    expect(built.pathname).toBe("/posts/a%20b");
    expect(built.search).toBe("?tab=info");
    expect(built.hash).toBe("#top");
    expect(built.href).toBe("/posts/a%20b?tab=info#top");
    expect(built.state).toEqual({ from: "test" });
    expect(built.external).toBe(false);
  });

  test("`true` keeps the current params, search and hash", () => {
    const state = at("/posts/7?tab=a#x");
    expect(state.buildLocation({ to: "/posts/$id/edit", params: true }).pathname).toBe(
      "/posts/7/edit",
    );
    expect(state.buildLocation({ to: ".", search: true, hash: true }).href).toBe(
      "/posts/7?tab=a#x",
    );
  });

  test("an updater is handed the current params and the current search", () => {
    const state = at("/posts/7?tab=a");
    const built = state.buildLocation({
      to: "/posts/$id",
      params: (current) => ({ id: String(Number(current.id) + 1) }),
      search: (current) => ({ ...current, page: 2 }),
      hash: (current) => `${current}next`,
    });
    expect(built.href).toBe("/posts/8?tab=a&page=2#next");
  });

  test("params are laid over the current ones, so a route keeps what it was not told to change", () => {
    const state = at("/posts/7");
    expect(state.buildLocation({ to: "/posts/$id/edit" }).pathname).toBe("/posts/7/edit");
  });

  test("a relative `to` resolves against `from`, which may be a route id", () => {
    const state = at("/posts/7/edit");
    expect(state.buildLocation({ to: ".." }).pathname).toBe("/posts/7");
    expect(state.buildLocation({ to: "..", from: "/posts/$id" }).pathname).toBe("/posts");
    expect(state.buildLocation({ to: "./edit", from: "/posts/$id" }).pathname).toBe(
      "/posts/7/edit",
    );
  });

  test("the search an updater sees is the VALIDATED one, and middlewares run once", () => {
    const state = at("/shop?page=3&ref=mail");
    const built = state.buildLocation({
      to: "/shop",
      search: (current) => ({ page: (current.page as number) + 1 }),
    });
    // `page` arrived as a number, which only the validator could have made it,
    // and `ref` was carried by the route's own middleware.
    expect(built.search).toBe("?page=4&ref=mail");
  });

  test("an `href` or an absolute url is external, and is left as written", () => {
    const state = at("/");
    const built = state.buildLocation({ href: "https://example.com/away?x=1" });
    expect(built.external).toBe(true);
    expect(built.href).toBe("https://example.com/away?x=1");
    expect(state.buildLocation({ to: "https://example.com/" }).external).toBe(true);
  });

  test("a mask is built the way a destination is", () => {
    const state = at("/");
    const built = state.buildLocation({
      to: "/posts/$id",
      params: { id: "5" },
      mask: { to: "/posts", search: { open: "5" }, unmaskOnReload: true },
    });
    expect(built.maskedLocation).toEqual({ href: "/posts?open=5", unmaskOnReload: true });
  });

  test("custom parseSearch and stringifySearch replace the query format on both sides", () => {
    const state = at("/shop?q=%7B%22page%22%3A3%7D", {
      routeTree: routes([{ path: "/shop", component: page("shop") }]),
      parseSearch: (search: string) => {
        const raw = new URLSearchParams(search).get("q");
        return raw === null ? {} : (JSON.parse(raw) as Record<string, unknown>);
      },
      stringifySearch: (search: Record<string, unknown>) =>
        Object.keys(search).length === 0 ? "" : `?q=${encodeURIComponent(JSON.stringify(search))}`,
    });
    expect(state.validSearch()).toEqual({ page: 3 });
    const built = state.buildLocation({
      to: "/shop",
      search: (current) => ({ page: (current.page as number) + 1, tags: ["a", "b"] }),
    });
    expect(decodeURIComponent(built.search)).toBe('?q={"page":4,"tags":["a","b"]}');
    state.dispose();
  });
});

describe("navigate, object form", () => {
  const table = routes([
    { path: "/", component: page("home") },
    { path: "/posts", component: page("posts") },
    { path: "/posts/$id", component: page("post") },
  ]);

  test("to, params, search, hash, state and replace all reach the history", async () => {
    const history = memoryHistory({ initial: ["/"] });
    const state = createRouter({ routeTree: table, history });
    const { host, dispose } = mountState(state);
    await state.navigate({
      to: "/posts/$id",
      params: { id: "7" },
      search: { tab: "a" },
      hash: "top",
      state: { opened: true },
    });
    flush();
    expect(host.textContent).toBe("post");
    expect(state.location().pathname).toBe("/posts/7");
    expect(state.location().search).toBe("?tab=a");
    expect(state.location().hash).toBe("#top");
    expect(state.location().state).toEqual({ opened: true });
    expect(history.depth?.()).toBe(1);

    await state.navigate({ to: "/posts", replace: true });
    flush();
    expect(state.location().pathname).toBe("/posts");
    expect(history.depth?.()).toBe(1);
    dispose();
  });

  test("the string form still works, and takes the same options beside it", async () => {
    const state = createRouter({ routeTree: table, history: memoryHistory({ initial: ["/"] }) });
    await state.navigate("/posts/7?tab=a#x", { state: 1 });
    expect(state.location().pathname + state.location().search + state.location().hash).toBe(
      "/posts/7?tab=a#x",
    );
    expect(state.location().state).toBe(1);
    await state.navigate("/posts/$id", { params: { id: "8" } });
    expect(state.location().pathname).toBe("/posts/8");
    state.dispose();
  });

  test("a mask object shows one url and renders another", async () => {
    const history = memoryHistory({ initial: ["/"] });
    const state = createRouter({ routeTree: table, history });
    const { host, dispose } = mountState(state);
    await state.navigate({ to: "/posts/$id", params: { id: "5" }, mask: { to: "/posts" } });
    flush();
    expect(history.current().pathname).toBe("/posts");
    expect(host.textContent).toBe("post");
    dispose();
  });

  test("`createRouteMask` is a mask the router's own table takes", async () => {
    const history = memoryHistory({ initial: ["/"] });
    const mask = createRouteMask({
      routeTree: table,
      from: "/posts/$id",
      to: "/posts",
      search: { open: "1" },
    });
    expect(mask).toEqual({ from: "/posts/$id", to: "/posts", search: { open: "1" } });
    const state = createRouter({ routeTree: table, history, routeMasks: [mask] });
    await state.navigate({ to: "/posts/$id", params: { id: "5" } });
    expect(history.current().pathname + history.current().search).toBe("/posts?open=1");
    state.dispose();
  });

  test("`reloadDocument` hands the target to the browser, base included, and commits nothing", async () => {
    const assigned: string[] = [];
    const original = window.location.assign;
    window.location.assign = (to: string) => assigned.push(to);
    try {
      const history = memoryHistory({ initial: ["/"] });
      const state = createRouter({ routeTree: table, history, basepath: "/app" });
      await state.navigate({ to: "/posts/$id", params: { id: "7" }, reloadDocument: true });
      expect(assigned).toEqual(["/app/posts/7"]);
      expect(state.location().pathname).toBe("/");
      state.dispose();
    } finally {
      window.location.assign = original;
    }
  });

  test("`hashScrollIntoView: false` leaves the hash target where it is", async () => {
    const target = document.createElement("div");
    target.id = "section";
    let scrolled = 0;
    target.scrollIntoView = () => {
      scrolled++;
    };
    document.body.appendChild(target);
    const state = createRouter({ routeTree: table, history: memoryHistory({ initial: ["/"] }) });
    await state.navigate({ to: "/posts", hash: "section" });
    await tick(30);
    expect(scrolled).toBe(1);
    await state.navigate({ to: "/", hash: "section", hashScrollIntoView: false });
    await tick(30);
    expect(scrolled).toBe(1);
    // A location not seen before: one that was left has a saved position, and a
    // saved position wins over the hash.
    await state.navigate({
      to: "/posts/$id",
      params: { id: "7" },
      hash: "section",
      hashScrollIntoView: { block: "end" },
    });
    await tick(30);
    expect(scrolled).toBe(2);
    state.dispose();
  });
});

describe("redirect and notFound, options form", () => {
  test("`redirect({...})` returns the redirect, and throws only when asked", () => {
    const made = redirect({ to: "/posts/$id", params: { id: "7" }, search: { tab: "a" } });
    expect(isRedirect(made)).toBe(true);
    expect(made.to).toBe("/posts/7?tab=a");
    // TanStack's default for the options form; the positional form keeps 302.
    expect(made.statusCode).toBe(307);
    expect(made.status).toBe(307);
    expect(redirect({ to: "/x", statusCode: 301, headers: { "x-why": "moved" } }).headers).toEqual({
      "x-why": "moved",
    });
    expect(redirect({ href: "https://example.com/login" }).to).toBe("https://example.com/login");
    expect(() => redirect({ to: "/x", throw: true })).toThrow();
    let thrown: unknown;
    try {
      redirect("/login");
    } catch (error) {
      thrown = error;
    }
    expect(isRedirect(thrown)).toBe(true);
    expect((thrown as { status: number }).status).toBe(302);
  });

  test("`notFound({...})` returns the error with its data, route and headers", () => {
    const made = notFound({ data: { slug: "x" }, routeId: "/posts", headers: { "x-miss": "1" } });
    expect(isNotFound(made)).toBe(true);
    expect(made.data).toEqual({ slug: "x" });
    expect(made.routeId).toBe("/posts");
    expect(made.headers).toEqual({ "x-miss": "1" });
    expect(notFound({ global: true }).routeId).toBe("__root__");
    expect(() => notFound({ throw: true })).toThrow();
    expect(() => notFound()).toThrow();
    expect(() => notFound("gone")).toThrow("gone");
  });

  test("a redirect or a notFound that is RETURNED is the same answer as one thrown", async () => {
    const state = createRouter({
      routeTree: routes([
        { path: "/", component: page("home") },
        { path: "/gate", component: page("gate"), beforeLoad: () => redirect({ to: "/posts/1" }) },
        {
          path: "/posts/$id",
          component: page("post"),
          loader: ({ params }: { params: { id: string } }) =>
            params.id === "404" ? notFound({ data: "no such post" }) : `post ${params.id}`,
        },
      ]),
      history: memoryHistory({ initial: ["/"] }),
    });
    await state.navigate("/gate");
    expect(state.location().pathname).toBe("/posts/1");
    await state.load();
    expect(state.matches()[0]?.loaderData).toBe("post 1");

    await state.navigate("/posts/404");
    await state.load();
    const [match] = state.matches();
    expect(match?.status).toBe("notFound");
    expect(isNotFound(match?.error)).toBe(true);
    expect(match?.loaderData).toBeUndefined();
    state.dispose();
  });

  test("a beforeLoad that throws an options redirect lands where it describes, replacing", async () => {
    const history = memoryHistory({ initial: ["/"] });
    const state = createRouter({
      routeTree: routes([
        { path: "/", component: page("home") },
        {
          path: "/old/$id",
          component: page("old"),
          beforeLoad: ({ params }: { params: { id: string } }) => {
            throw redirect({
              to: "/posts/$id",
              params: { id: params.id },
              search: { moved: "1" },
            });
          },
        },
        { path: "/posts/$id", component: page("post") },
      ]),
      history,
    });
    await state.navigate({ to: "/old/$id", params: { id: "7" } });
    expect(state.location().pathname + state.location().search).toBe("/posts/7?moved=1");
    // Replaced rather than pushed: a refused location is not left behind.
    expect(history.depth?.()).toBe(0);
    state.dispose();
  });

  test("`notFound({ routeId, data })` is answered by the named route's notFoundComponent", async () => {
    const seen: unknown[] = [];
    const state = createRouter({
      routeTree: routes([
        {
          id: "layout",
          path: "/app",
          component: (props: RouteProps) => {
            const node = document.createElement("div");
            insert(node, () => props.children);
            return node;
          },
          notFoundComponent: (props: { data: () => unknown }) => {
            seen.push(props.data());
            return document.createTextNode("layout says missing");
          },
          children: [
            {
              id: "leaf",
              path: "$id",
              component: (props: RouteProps) => document.createTextNode(String(props.data())),
              notFoundComponent: () => document.createTextNode("leaf says missing"),
              loader: () => {
                throw notFound({ routeId: "layout", data: { id: 7 } });
              },
            },
          ],
        },
      ]),
      history: memoryHistory({ initial: ["/app/7"] }),
    });
    const { host, dispose } = mountState(state);
    await tick(20);
    flush();
    expect(host.textContent).toContain("layout says missing");
    expect(seen).toEqual([{ id: 7 }]);
    dispose();
  });
});

describe("router defaults, TanStack's names", () => {
  test("the `default*` options land on `defaults`, which is what a route falls back to", () => {
    const pending = (): null => null;
    const state = createRouter({
      routeTree: routes([{ path: "/", component: page("home") }]),
      history: memoryHistory({ initial: ["/"] }),
      defaults: { staleTime: 5, pendingMs: 1 },
      defaultPendingMs: 200,
      defaultPendingMinMs: 300,
      defaultPreload: "intent",
      defaultPreloadDelay: 80,
      defaultGcTime: 1000,
      defaultPendingComponent: pending,
    });
    expect(state.config.defaults).toEqual({
      staleTime: 5,
      pendingMs: 200,
      pendingMinMs: 300,
      preload: "intent",
      preloadDelay: 80,
      gcTime: 1000,
      pendingComponent: pending,
    } as never);
    state.dispose();
  });

  test("defaultErrorComponent and defaultOnCatch answer when no route in the chain does", async () => {
    const caught: string[] = [];
    const state = createRouter({
      routeTree: routes([
        {
          path: "/",
          component: (props: RouteProps) => document.createTextNode(String(props.data())),
          loader: () => {
            throw new Error("boom");
          },
        },
      ]),
      history: memoryHistory({ initial: ["/"] }),
      defaultErrorComponent: ((props: { error: () => Error }) =>
        document.createTextNode(`default: ${props.error().message}`)) as never,
      defaultOnCatch: (error) => caught.push(error.message),
    });
    const { host, dispose } = mountState(state);
    await tick(20);
    flush();
    expect(host.textContent).toBe("default: boom");
    expect(caught).toEqual(["boom"]);
    dispose();
  });

  test("defaultNotFoundComponent renders a location nothing matched", () => {
    const state = createRouter({
      routeTree: routes([
        {
          id: "__root__",
          path: "/",
          component: (props: RouteProps) => {
            const node = document.createElement("main");
            insert(node, () => props.children);
            return node;
          },
          children: [{ path: "", component: page("home") }],
        },
      ]),
      history: memoryHistory({ initial: ["/nope"] }),
      defaultNotFoundComponent: (() => document.createTextNode("default 404")) as never,
    });
    const { host, dispose } = mountState(state);
    expect(host.textContent).toBe("default 404");
    dispose();
  });

  test("defaultPendingComponent shows while a route with none of its own loads", async () => {
    const state = createRouter({
      routeTree: routes([
        {
          path: "/",
          component: (props: RouteProps) => document.createTextNode(String(props.data())),
          loader: async () => {
            await tick(20);
            return "loaded";
          },
        },
      ]),
      history: memoryHistory({ initial: ["/"] }),
      defaultPendingComponent: () => document.createTextNode("default pending"),
    });
    const { host, dispose } = mountState(state);
    expect(host.textContent).toBe("default pending");
    await tick(40);
    flush();
    expect(host.textContent).toBe("loaded");
    dispose();
  });

  test("a route's own `caseSensitive` governs its segments and not its siblings'", () => {
    const state = createRouter({
      routeTree: routes([
        { path: "/Exact", component: page("exact"), caseSensitive: true },
        { path: "/loose", component: page("loose"), caseSensitive: false },
      ]),
      history: memoryHistory({ initial: ["/"] }),
    });
    expect(state.matcher.match("/Exact")?.route.id).toBe("/Exact");
    expect(state.matcher.match("/exact")).toBeNull();
    expect(state.matcher.match("/LOOSE")?.route.id).toBe("/loose");
    state.dispose();

    const insensitive = createRouter({
      routeTree: routes([
        { path: "/Exact", component: page("exact"), caseSensitive: true },
        { path: "/loose", component: page("loose") },
      ]),
      history: memoryHistory({ initial: ["/"] }),
      caseSensitive: false,
    });
    expect(insensitive.matcher.match("/exact")).toBeNull();
    expect(insensitive.matcher.match("/Loose")?.route.id).toBe("/loose");
    insensitive.dispose();
  });

  test("a route with `preload: false` is not warmed, and its siblings in the chain are", async () => {
    const ran: string[] = [];
    const state = createRouter({
      routeTree: routes([
        { path: "/", component: page("home") },
        {
          id: "layout",
          path: "/app",
          loader: () => ran.push("layout"),
          children: [
            {
              id: "leaf",
              path: "$id",
              component: page("leaf"),
              preload: false,
              loader: () => ran.push("leaf"),
            },
          ],
        },
      ]),
      history: memoryHistory({ initial: ["/"] }),
    });
    await state.preload("/app/7");
    await tick(5);
    expect(ran).toEqual(["layout"]);
    state.dispose();
  });

  test("`onError` is told about a loader failure, and not about a redirect or a notFound", async () => {
    const told: string[] = [];
    const failing = (id: string, thrown: () => unknown): Record<string, unknown> => ({
      path: `/${id}`,
      component: page(id),
      onError: (error: unknown) => told.push(`${id}: ${(error as Error).message}`),
      loader: () => {
        throw thrown();
      },
    });
    const state = createRouter({
      routeTree: routes([
        { path: "/", component: page("home") },
        failing("broken", () => new Error("boom")),
        failing("missing", () => notFound({})),
        failing("moved", () => redirect({ to: "/" })),
      ]),
      history: memoryHistory({ initial: ["/"] }),
    });
    for (const to of ["/broken", "/missing", "/moved"]) {
      await state.navigate(to);
      await tick(5);
    }
    expect(told).toEqual(["broken: boom"]);
    state.dispose();
  });

  test("a loader's redirect navigates there, replacing, and no errorComponent shows it", async () => {
    const shown: string[] = [];
    const state = createRouter({
      routeTree: routes([
        { path: "/", component: page("home") },
        { path: "/login", component: page("login") },
        {
          path: "/moved",
          component: (props: RouteProps) => document.createTextNode(String(props.data())),
          errorComponent: (props: { error: () => Error }) => {
            shown.push(props.error().message);
            return document.createTextNode("failed");
          },
          loader: async () => {
            await tick(1);
            throw redirect({ to: "/login" });
          },
        },
      ]),
      history: memoryHistory({ initial: ["/"] }),
    });
    const { host, dispose } = mountState(state);
    await state.navigate("/moved");
    await tick(10);
    flush();
    expect(state.location().pathname).toBe("/login");
    expect(host.textContent).toBe("login");
    expect(shown).toEqual([]);
    state.history.go(-1);
    await tick(5);
    flush();
    expect(state.location().pathname).toBe("/");
    dispose();
    state.dispose();
  });

  test("`onError` is told about a Response thrown by `beforeLoad` and by a loader alike", async () => {
    const told: string[] = [];
    const refusing = (id: string, phase: "beforeLoad" | "loader"): Record<string, unknown> => ({
      path: `/${id}`,
      component: page(id),
      onError: (error: unknown) => told.push(`${id}: ${(error as Response).status}`),
      [phase]: () => {
        throw new Response("sign in first", { status: 401 });
      },
    });
    const state = createRouter({
      routeTree: routes([
        { path: "/", component: page("home") },
        refusing("guarded", "beforeLoad"),
        refusing("loaded", "loader"),
      ]),
      history: memoryHistory({ initial: ["/"] }),
    });
    // A `beforeLoad` refusal rejects the navigation it stopped.
    expect(await state.navigate("/guarded").catch((error: unknown) => error)).toBeInstanceOf(
      Response,
    );
    await state.navigate("/loaded");
    await tick(5);
    expect(told).toEqual(["guarded: 401", "loaded: 401"]);
    state.dispose();
  });
});

describe("the router instance", () => {
  const slow = (ran: string[]): AnyRouteDefinition[] =>
    routes([
      { path: "/", component: page("home") },
      {
        path: "/posts/$id",
        component: page("post"),
        loader: async ({ params }: { params: { id: string } }) => {
          ran.push(params.id);
          await tick(10);
          return `post ${params.id}`;
        },
      },
    ]);

  test("`load` resolves once the chain's loaders have, and `matches` say what they loaded", async () => {
    const ran: string[] = [];
    const state = createRouter({
      routeTree: slow(ran),
      history: memoryHistory({ initial: ["/posts/7?tab=a"] }),
    });
    expect(state.status()).toBe("pending");
    expect(state.resolvedLocation()).toBeUndefined();
    await state.load();
    const [match] = state.matches();
    expect(match).toMatchObject({
      routeId: "/posts/$id",
      fullPath: "/posts/$id",
      pathname: "/posts/7",
      params: { id: "7" },
      search: { tab: "a" },
      loaderData: "post 7",
      status: "success",
      isFetching: false,
      cause: "enter",
    });
    expect(typeof match?.id).toBe("string");
    expect(state.status()).toBe("idle");
    expect(state.isLoading()).toBe(false);
    expect(state.resolvedLocation()?.pathname).toBe("/posts/7");
    expect(state.state.location.pathname).toBe("/posts/7");
    expect(state.state.matches).toHaveLength(1);
    state.dispose();
  });

  test("status is pending across a navigation, and resolvedLocation trails the location", async () => {
    const ran: string[] = [];
    const state = createRouter({
      routeTree: slow(ran),
      history: memoryHistory({ initial: ["/"] }),
    });
    await state.load();
    expect(state.status()).toBe("idle");
    expect(state.resolvedLocation()?.pathname).toBe("/");

    const going = state.navigate("/posts/7");
    // A write is staged until the flush, here as everywhere.
    flush();
    expect(state.status()).toBe("pending");
    expect(state.isLoading()).toBe(true);
    await going;
    // Committed, with its loader still out: the location has moved and the
    // resolved one has not.
    expect(state.location().pathname).toBe("/posts/7");
    expect(state.status()).toBe("pending");
    expect(state.resolvedLocation()?.pathname).toBe("/");
    expect(state.matches()[0]?.status).toBe("pending");
    await state.load();
    expect(state.status()).toBe("idle");
    expect(state.resolvedLocation()?.pathname).toBe("/posts/7");
    state.dispose();
  });

  test("`invalidate({ filter, sync })` reloads the entries it picks and waits for them", async () => {
    const ran: string[] = [];
    const state = createRouter({
      routeTree: slow(ran),
      history: memoryHistory({ initial: ["/posts/7"] }),
    });
    await state.load();
    await state.invalidate({ filter: (match) => match.params.id === "8", sync: true });
    expect(ran).toEqual(["7"]);
    await state.invalidate({ filter: (match) => match.routeId === "/posts/$id", sync: true });
    expect(ran).toEqual(["7", "7"]);
    expect(state.matches()[0]?.isFetching).toBe(false);
    state.dispose();
  });

  test("`clearCache` drops what is not on screen, and only what the filter picks", async () => {
    const ran: string[] = [];
    const state = createRouter({
      routeTree: slow(ran),
      history: memoryHistory({ initial: ["/posts/7"] }),
      defaults: { preloadStaleTime: 60_000 },
    });
    await state.load();
    await state.preloadRoute({ to: "/posts/$id", params: { id: "8" } });
    await state.preloadRoute({ to: "/posts/$id", params: { id: "9" } });
    await tick(20);
    expect(ran).toEqual(["7", "8", "9"]);

    state.clearCache({ filter: (match) => match.params.id === "8" });
    await state.preloadRoute({ to: "/posts/$id", params: { id: "8" } });
    await state.preloadRoute({ to: "/posts/$id", params: { id: "9" } });
    await tick(20);
    // 8 was dropped and fetched again; 9 was kept and was not.
    expect(ran).toEqual(["7", "8", "9", "8"]);

    state.clearCache();
    await state.preloadRoute({ to: "/posts/$id", params: { id: "9" } });
    await tick(20);
    expect(ran).toEqual(["7", "8", "9", "8", "9"]);
    // The entry on screen is never cleared.
    expect(state.matches()[0]?.loaderData).toBe("post 7");
    state.dispose();
  });

  test("`preloadRoute` answers with the matches it warmed", async () => {
    const ran: string[] = [];
    const state = createRouter({
      routeTree: slow(ran),
      history: memoryHistory({ initial: ["/"] }),
    });
    const warmed = await state.preloadRoute({ to: "/posts/$id", params: { id: "7" } });
    expect(warmed?.map((match) => [match.routeId, match.params])).toEqual([
      ["/posts/$id", { id: "7" }],
    ]);
    expect(ran).toEqual(["7"]);
    expect(await state.preloadRoute({ to: "/nowhere" })).toBeUndefined();
    // Still where it was: a preload commits nothing.
    expect(state.location().pathname).toBe("/");
    state.dispose();
  });

  test("`matchRoute` takes TanStack's second argument", async () => {
    const state = createRouter({
      routeTree: slow([]),
      history: memoryHistory({ initial: ["/posts/7"] }),
    });
    expect(state.matchRoute({ to: "/posts" })).toBe(false);
    expect(state.matchRoute({ to: "/posts" }, { fuzzy: true })).toEqual({ id: "7" });
    state.dispose();
  });
});

describe("what a loader's cache does over time", () => {
  test("an entry older than `gcTime` is collected on the next navigation, and a younger one is kept", async () => {
    const ran: string[] = [];
    const table = routes([
      { path: "/", component: page("home") },
      { path: "/other", component: page("other") },
      {
        path: "/short",
        component: page("short"),
        gcTime: 10,
        staleTime: 60_000,
        loader: () => ran.push("short"),
      },
      {
        path: "/long",
        component: page("long"),
        gcTime: 60_000,
        staleTime: 60_000,
        loader: () => ran.push("long"),
      },
    ]);
    const state = createRouter({ routeTree: table, history: memoryHistory({ initial: ["/"] }) });
    const { dispose } = mountState(state);
    const go = async (to: string): Promise<void> => {
      await state.navigate(to);
      flush();
      await tick(5);
    };
    await go("/short");
    await go("/long");
    await go("/");
    await tick(30);
    // The sweep runs on a commit, so this navigation is what collects.
    await go("/other");
    await go("/short");
    await go("/long");
    expect(ran).toEqual(["short", "long", "short"]);
    dispose();
  });

  test("a loader's signal aborts when a newer run supersedes it, and when its entry is collected", async () => {
    const signals: AbortSignal[] = [];
    const finish: (() => void)[] = [];
    let started = Promise.withResolvers<void>();
    const nextRun = async (): Promise<void> => {
      await started.promise;
      started = Promise.withResolvers<void>();
    };
    const state = createRouter({
      routeTree: routes([
        { path: "/", component: page("home") },
        {
          path: "/slow",
          component: page("slow"),
          gcTime: 0,
          loader: async ({ signal }: { signal: AbortSignal }) => {
            signals.push(signal);
            const answer = Promise.withResolvers<void>();
            finish.push(answer.resolve);
            started.resolve();
            await answer.promise;
            return "done";
          },
        },
      ]),
      history: memoryHistory({ initial: ["/slow"] }),
    });
    const loading = state.load();
    await nextRun();
    finish[0]?.();
    await loading;
    expect(signals[0]?.aborted).toBe(false);

    // Two reloads in a row: the first is superseded before it can settle.
    void state.invalidate();
    await nextRun();
    void state.invalidate();
    await nextRun();
    expect(signals).toHaveLength(3);
    expect(signals[1]?.aborted).toBe(true);
    expect(signals[2]?.aborted).toBe(false);
    finish[1]?.();
    finish[2]?.();
    await state.load({ sync: true });

    // Collected with a run in flight: disposing the entry aborts it.
    void state.invalidate();
    await nextRun();
    state.dispose();
    expect(signals[3]?.aborted).toBe(true);
    finish[3]?.();
  });
});
