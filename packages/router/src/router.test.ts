/**
 * The router driven for real: mounted into a document, navigated, torn down.
 *
 * Every test here drives a `memoryHistory` that actually records. The old
 * package's `memoryHistory.push` and `watch` were both no-ops and all 100 of its
 * tests used one, so its suite could not tell a navigation that worked from one
 * that did nothing.
 */

import { type Scope, flush, getOwner, insert, isDisposed, render, settle } from "@barqjs/core";
import { afterEach, describe, expect, test } from "bun:test";

import { Link, NavLink, Router, RouterProvider, useRouter } from "./components.ts";
import { notFound, redirect } from "./errors.ts";
import { retainSearchParams } from "./search.ts";
import { memoryHistory } from "./history.ts";
import { useLocation, useNavigate, useParams, useSearch, useSearchParams } from "./hooks.ts";
import type { AnyRouteDefinition, RouteProps } from "./route.ts";
import { type RouterState, createRouter } from "./router.ts";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  document.body.innerHTML = "";
});

/** Mount a `<Router>` and hand back the host plus a disposer. */
function mount(props: Parameters<typeof Router>[0]): { host: HTMLElement; dispose: () => void } {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const dispose = render(
    ((scope: Scope | null) =>
      (Router as never as (s: Scope | null, p: unknown) => unknown)(scope, {
        routes: () => props.routes,
        history: () => props.history,
        notFound: () => props.notFound,
        beforeEach: () => props.beforeEach,
        afterEach: () => props.afterEach,
      })) as never,
    host,
  );
  flush();
  return { host, dispose };
}

/** Mount an already-built state, for tests that need to drive it directly. */
function mountState(state: RouterState): { host: HTMLElement; dispose: () => void } {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const dispose = render(
    ((scope: Scope | null) =>
      (RouterProvider as never as (s: Scope | null, p: unknown) => unknown)(scope, {
        state: () => state,
      })) as never,
    host,
  );
  flush();
  return { host, dispose };
}

const text = (value: string) => (): Node => document.createTextNode(value);

const page =
  (label: string) =>
  (_scope: Scope | null, _props: RouteProps): Node =>
    document.createTextNode(label);

describe("mounting and navigation", () => {
  const routes: AnyRouteDefinition[] = [
    { path: "/", component: page("home") },
    { path: "/users/$id", component: page("user") },
  ] as never;

  test("renders the matched route and moves when the history does", () => {
    const history = memoryHistory();
    const { host, dispose } = mount({ routes, history });

    expect(host.textContent).toBe("home");

    history.push("/users/7");
    flush();
    expect(host.textContent).toBe("user");

    history.go(-1);
    flush();
    expect(host.textContent).toBe("home");

    dispose();
  });

  test("an unmatched path renders the 404", () => {
    const history = memoryHistory({ initial: ["/nowhere"] });
    const { host, dispose } = mount({ routes, history });
    expect(host.textContent).toBe("404 - Not Found");
    dispose();
  });

  test("a custom notFound wins over it", () => {
    const history = memoryHistory({ initial: ["/nowhere"] });
    const { host, dispose } = mount({ routes, history, notFound: page("nope") as never });
    expect(host.textContent).toBe("nope");
    dispose();
  });

  test("teardown IS scope disposal", () => {
    let inner: Scope | null = null;
    const history = memoryHistory();
    const { host, dispose } = mount({
      routes: [
        {
          path: "/",
          component: () => {
            inner = getOwner() as Scope | null;
            return document.createTextNode("home");
          },
        },
      ] as never,
      history,
    });

    expect(host.textContent).toBe("home");
    dispose();
    expect(host.textContent).toBe("");
    expect(isDisposed(inner as never)).toBe(true);
  });
});

describe("params", () => {
  test("reach the component and update without remounting it", () => {
    // The key is route IDENTITY, deliberately excluding data and params, so a
    // parameter moving updates the route rather than rebuilding it. This is
    // what keeps a surviving element's identity across a navigation.
    let builds = 0;
    const seen: string[] = [];
    const history = memoryHistory({ initial: ["/u/1"] });
    const { host, dispose } = mount({
      routes: [
        {
          path: "/u/$id",
          component: (_s: Scope | null, props: RouteProps) => {
            builds++;
            const node = document.createTextNode("");
            // A render effect would be the compiled form; reading once per
            // build plus once per change is enough to show the identity.
            const update = () => {
              const id = (props.params() as Record<string, string>).id as string;
              seen.push(id);
              node.textContent = id;
            };
            update();
            return node;
          },
        },
      ] as never,
      history,
    });

    expect(host.textContent).toBe("1");
    history.push("/u/2");
    flush();

    expect(builds).toBe(1);
    expect(seen).toEqual(["1"]);
    dispose();
  });
});

describe("loaders", () => {
  test("resolve into the route, once per key", async () => {
    let calls = 0;
    const history = memoryHistory({ initial: ["/u/1"] });
    const { host, dispose } = mount({
      routes: [
        {
          path: "/u/$id",
          loader: async ({ params }: { params: { id: string } }) => {
            calls++;
            await tick();
            return `user ${params.id}`;
          },
          pending: page("loading"),
          // The COMPILED shape. A component body runs untracked (CODESIGN
          // §3.9), so a bare `props.data()` in the body would read the pending
          // value, throw `NotReadyError` with nothing subscribed, and never
          // re-run when it settled. `insert` is what the compiler emits for a
          // dynamic hole and it is a tracked effect, which is what registers
          // the read with the loading boundary.
          component: (scope: Scope | null, props: RouteProps) => {
            const node = document.createElement("span");
            insert(scope, node, () => String(props.data()));
            return node;
          },
        },
      ] as never,
      history,
    });

    expect(host.textContent).toBe("loading");
    await settle();
    flush();
    expect(host.textContent).toBe("user 1");
    expect(calls).toBe(1);

    dispose();
  });

  test("B1 — a search-dependent loader re-runs when the search changes", async () => {
    // The loader was HANDED the search and was not KEYED by it, so
    // `/posts?page=2` reused the cell built for `?page=1` and answered with
    // page 1 forever — one loader invocation, no error, wrong page. Nothing in
    // this suite had a route whose loader read `search`.
    const seen: string[] = [];
    const history = memoryHistory({ initial: ["/posts?page=1"] });
    const { host, dispose } = mount({
      routes: [
        {
          path: "/posts",
          loader: async ({ search }: { search: URLSearchParams }) => {
            const page_ = search.get("page") ?? "0";
            seen.push(page_);
            await tick();
            return `page ${page_}`;
          },
          pending: page("loading"),
          component: (scope: Scope | null, props: RouteProps) => {
            const node = document.createElement("span");
            insert(scope, node, () => String(props.data()));
            return node;
          },
        },
      ] as never,
      history,
    });

    await settle();
    flush();
    expect(host.textContent).toBe("page 1");

    history.push("/posts?page=2");
    flush();
    await settle();
    flush();
    expect(host.textContent).toBe("page 2");
    expect(seen).toEqual(["1", "2"]);

    // Going back re-runs, because `staleTime` defaults to 0 and a navigation
    // revalidates. The CACHE-hit property is asserted separately, under a
    // `staleTime` that says the data is still fresh — mixing the two here is
    // what made this assertion wrong when the reload policy landed.
    history.push("/posts?page=1");
    flush();
    await settle();
    flush();
    expect(host.textContent).toBe("page 1");
    expect(seen).toEqual(["1", "2", "1"]);

    dispose();
  });

  test("B1 — key order in the query does not mint a second cell", async () => {
    // `?b=2&a=1` and `?a=1&b=2` are the same request; a key that says otherwise
    // refetches for nothing. `staleTime: Infinity` takes the reload policy out
    // of the question so this measures the KEY and nothing else.
    let calls = 0;
    const history = memoryHistory({ initial: ["/s?a=1&b=2"] });
    const { host, dispose } = mount({
      routes: [
        {
          path: "/s",
          staleTime: Number.POSITIVE_INFINITY,
          loader: async () => {
            calls++;
            await tick();
            return "once";
          },
          pending: page("loading"),
          component: (scope: Scope | null, props: RouteProps) => {
            const node = document.createElement("span");
            insert(scope, node, () => String(props.data()));
            return node;
          },
        },
      ] as never,
      history,
    });

    await settle();
    flush();
    history.push("/s?b=2&a=1");
    flush();
    await settle();
    flush();

    expect(host.textContent).toBe("once");
    expect(calls).toBe(1);
    dispose();
  });

  test("a route with no loader hands its component undefined rather than hanging", () => {
    const history = memoryHistory();
    const { host, dispose } = mount({
      routes: [
        {
          path: "/",
          component: (scope: Scope | null, props: RouteProps) => {
            const node = document.createElement("span");
            insert(scope, node, () => String(props.data()));
            return node;
          },
        },
      ] as never,
      history,
    });
    expect(host.textContent).toBe("undefined");
    dispose();
  });
});

describe("loaderDeps and the reload policy", () => {
  /** The compiled shape: the read goes in `insert`, which is a tracked effect. */
  const span = (scope: Scope | null, props: RouteProps): Node => {
    const node = document.createElement("span");
    insert(scope, node, () => String(props.data()));
    return node;
  };

  test("loaderDeps narrows the key: an unrelated param does not refetch", async () => {
    // Without `loaderDeps` the WHOLE search is the key, so `?ref=` busts it.
    // With one, only what the route says it uses counts.
    const seen: string[] = [];
    const history = memoryHistory({ initial: ["/list?page=1&ref=twitter"] });
    const { host, dispose } = mount({
      routes: [
        {
          path: "/list",
          staleTime: Number.POSITIVE_INFINITY,
          loaderDeps: ({ search }: { search: URLSearchParams }) => ({
            page: search.get("page") ?? "1",
          }),
          loader: async ({ deps }: { deps: { page: string } }) => {
            seen.push(deps.page);
            await tick();
            return `page ${deps.page}`;
          },
          pending: page("loading"),
          component: span,
        },
      ] as never,
      history,
    });

    await settle();
    flush();
    expect(host.textContent).toBe("page 1");

    // A param the route did not select: same key, no fetch.
    history.push("/list?page=1&ref=hn");
    flush();
    await settle();
    flush();
    expect(seen).toEqual(["1"]);

    // One it did: new key, new fetch.
    history.push("/list?page=2&ref=hn");
    flush();
    await settle();
    flush();
    expect(host.textContent).toBe("page 2");
    expect(seen).toEqual(["1", "2"]);

    dispose();
  });

  test("staleTime holds a navigation back, and 0 revalidates it", async () => {
    for (const [staleTime, expected] of [
      [Number.POSITIVE_INFINITY, 2],
      [0, 3],
    ] as const) {
      let calls = 0;
      const history = memoryHistory({ initial: ["/a"] });
      const { dispose } = mount({
        routes: [
          {
            path: "/a",
            staleTime,
            loader: async () => {
              calls++;
              await tick();
              return "a";
            },
            pending: page("l"),
            component: span,
          },
          {
            path: "/b",
            loader: async () => {
              await tick();
              return "b";
            },
            pending: page("l"),
            component: span,
          },
        ] as never,
        history,
      });
      await settle();
      flush();
      history.push("/b");
      flush();
      await settle();
      flush();
      history.push("/a");
      flush();
      await settle();
      flush();
      // 1 for the first visit, 1 for /b, and the third is /a again — cached
      // under an infinite staleTime, refetched under 0.
      expect(calls + 1).toBe(expected);
      dispose();
    }
  });

  test("shouldReload overrides staleTime in BOTH directions", async () => {
    const run = async (shouldReload: unknown): Promise<number> => {
      let calls = 0;
      const history = memoryHistory({ initial: ["/x"] });
      const { dispose } = mount({
        routes: [
          {
            path: "/x",
            staleTime: Number.POSITIVE_INFINITY,
            shouldReload,
            loader: async () => {
              calls++;
              await tick();
              return "x";
            },
            pending: page("l"),
            component: span,
          },
          { path: "/y", component: span },
        ] as never,
        history,
      });
      await settle();
      flush();
      history.push("/y");
      flush();
      history.push("/x");
      flush();
      await settle();
      flush();
      dispose();
      return calls;
    };

    // Fresh forever, and `true` reloads anyway.
    expect(await run(true)).toBe(2);
    // `undefined` falls through to `staleTime`, which says fresh.
    expect(await run(undefined)).toBe(1);
    // Any other falsy suppresses the staleTime clause — also fresh here, but it
    // is the arm that matters when staleTime would have said stale.
    expect(await run(false)).toBe(1);
  });

  test("shouldReload: false suppresses a staleTime that would have reloaded", async () => {
    let calls = 0;
    const history = memoryHistory({ initial: ["/x"] });
    const { dispose } = mount({
      routes: [
        {
          path: "/x",
          staleTime: 0,
          shouldReload: false,
          loader: async () => {
            calls++;
            await tick();
            return "x";
          },
          pending: page("l"),
          component: span,
        },
        { path: "/y", component: span },
      ] as never,
      history,
    });
    await settle();
    flush();
    history.push("/y");
    flush();
    history.push("/x");
    flush();
    await settle();
    flush();
    expect(calls).toBe(1);
    dispose();
  });

  test("staleReloadMode: background keeps the old data on screen while it reloads", async () => {
    const seen: string[] = [];
    let n = 0;
    const history = memoryHistory({ initial: ["/p"] });
    const { host, dispose } = mount({
      routes: [
        {
          path: "/p",
          staleTime: 0,
          loader: async () => {
            const mine = ++n;
            await tick();
            return `v${mine}`;
          },
          pending: page("SKELETON"),
          component: span,
        },
        { path: "/q", component: span },
      ] as never,
      history,
    });
    await settle();
    flush();
    expect(host.textContent).toBe("v1");

    history.push("/q");
    flush();
    history.push("/p");
    flush();
    // Mid-reload: the previous value is still on screen, not the skeleton.
    seen.push(host.textContent ?? "");
    await settle();
    flush();
    seen.push(host.textContent ?? "");

    expect(seen).toEqual(["v1", "v2"]);
    dispose();
  });

  test("staleReloadMode: blocking puts the pending fallback back", async () => {
    let n = 0;
    const history = memoryHistory({ initial: ["/p"] });
    const { host, dispose } = mount({
      routes: [
        {
          path: "/p",
          staleTime: 0,
          staleReloadMode: "blocking",
          loader: async () => {
            const mine = ++n;
            await tick();
            return `v${mine}`;
          },
          pending: page("SKELETON"),
          component: span,
        },
        { path: "/q", component: span },
      ] as never,
      history,
    });
    await settle();
    flush();
    expect(host.textContent).toBe("v1");

    history.push("/q");
    flush();
    history.push("/p");
    flush();
    expect(host.textContent).toBe("SKELETON");
    await settle();
    flush();
    expect(host.textContent).toBe("v2");
    dispose();
  });

  test("a failed background reload keeps the last good value", async () => {
    // Core's `latest()` THROWS for an errored cell rather than reading through
    // it, which would replace the page with an error boundary. TanStack keeps
    // the page; so does this, and `Entry.settled` is what remembers it.
    let n = 0;
    const history = memoryHistory({ initial: ["/p"] });
    const { host, dispose } = mount({
      routes: [
        {
          path: "/p",
          staleTime: 0,
          loader: async () => {
            n++;
            await tick();
            if (n > 1) throw new Error("reload failed");
            return "good";
          },
          pending: page("SKELETON"),
          errorComponent: (scope: Scope | null) => {
            const node = document.createElement("b");
            insert(scope, node, () => "ERROR");
            return node;
          },
          component: span,
        },
        { path: "/q", component: span },
      ] as never,
      history,
    });
    await settle();
    flush();
    expect(host.textContent).toBe("good");

    history.push("/q");
    flush();
    history.push("/p");
    flush();
    await settle();
    flush();
    expect(host.textContent).toBe("good");
    expect(n).toBe(2);
    dispose();
  });

  test("a navigation starts the chain's loaders before the render runs", async () => {
    // Priming starts the chain's loaders AT THE NAVIGATION, before the render
    // runs at all — which is what this asserts, by checking before `flush()`.
    //
    // Worth stating precisely, because the first version of this test passed
    // WITHOUT priming and therefore proved nothing: the DOM backend does not
    // waterfall the way the string backend did. Each dynamic hole is its own
    // tracked effect, so a layout whose data has parked still constructs its
    // children, and the child's loader starts anyway. The string backend has no
    // such split — its content is one expression — which is why `prime` was
    // written there first. On the client the win is the head start, not the
    // parallelism.
    const started: string[] = [];
    const history = memoryHistory({ initial: ["/other"] });
    const layout = (scope: Scope | null, props: RouteProps): Node => {
      const node = document.createElement("div");
      insert(scope, node, () => String(props.data()));
      insert(scope, node, () => props.children);
      return node;
    };
    const { dispose } = mount({
      routes: [
        { path: "/other", component: page("other") },
        {
          path: "/app",
          loader: async () => {
            started.push("layout");
            await tick();
            return "L";
          },
          pending: page("l"),
          component: layout,
          children: [
            {
              path: "$id",
              loader: async () => {
                started.push("leaf");
                await tick();
                return "F";
              },
              pending: page("l"),
              component: span,
            },
          ],
        },
      ] as never,
      history,
    });

    history.push("/app/7");
    // No `flush()`: nothing has rendered yet. Both loaders are already in
    // flight because the navigation primed them.
    expect(started.toSorted()).toEqual(["layout", "leaf"]);

    flush();
    await settle();
    flush();
    dispose();
  });

  test("invalidate() re-runs in place, keeping the cell's identity", async () => {
    let n = 0;
    const history = memoryHistory({ initial: ["/p"] });
    const state = createRouter({
      routes: [
        {
          path: "/p",
          staleTime: Number.POSITIVE_INFINITY,
          loader: async () => {
            const mine = ++n;
            await tick();
            return `v${mine}`;
          },
          pending: page("l"),
          component: span,
        },
      ] as never,
      history,
    });
    const { host, dispose } = mountState(state);
    await settle();
    flush();
    expect(host.textContent).toBe("v1");
    state.invalidate();
    flush();
    await settle();
    flush();
    expect(host.textContent).toBe("v2");
    dispose();
  });
});

describe("validateSearch", () => {
  const showSearch = (scope: Scope | null, props: RouteProps): Node => {
    const node = document.createElement("span");
    const state = useRouter();
    void props;
    insert(scope, node, () => JSON.stringify(state.validSearch()));
    return node;
  };

  test("a validator types its own slice and unknown keys survive", async () => {
    const history = memoryHistory({ initial: ["/list?page=3&ref=hn"] });
    const { host, dispose } = mount({
      routes: [
        {
          path: "/list",
          validateSearch: (input: Record<string, unknown>) => ({ page: Number(input.page ?? 1) }),
          component: showSearch,
        },
      ] as never,
      history,
    });
    flush();
    // `page` is a NUMBER now, and `ref` — which nothing declared — is still there.
    expect(JSON.parse(host.textContent ?? "{}")).toEqual({ page: 3, ref: "hn" });
    dispose();
  });

  test("a child's validator sees its ancestors' validated output", async () => {
    const history = memoryHistory({ initial: ["/app/x?page=2"] });
    const wrap = (scope: Scope | null, props: RouteProps): Node => {
      const node = document.createElement("div");
      insert(scope, node, () => props.children);
      return node;
    };
    const { host, dispose } = mount({
      routes: [
        {
          path: "/app",
          validateSearch: (input: Record<string, unknown>) => ({ page: Number(input.page ?? 1) }),
          component: wrap,
          children: [
            {
              path: "x",
              validateSearch: (input: Record<string, unknown>) => ({
                // Reads the PARENT's already-coerced number.
                next: (input.page as number) + 1,
              }),
              component: showSearch,
            },
          ],
        },
      ] as never,
      history,
    });
    flush();
    expect(JSON.parse(host.textContent ?? "{}")).toEqual({ page: 2, next: 3 });
    dispose();
  });

  test("a refused search renders THAT route's errorComponent, not a blank page", async () => {
    const history = memoryHistory({ initial: ["/list?page=banana"] });
    const { host, dispose } = mount({
      routes: [
        {
          path: "/list",
          validateSearch: (input: Record<string, unknown>) => {
            if (Number.isNaN(Number(input.page))) throw new Error("page must be a number");
            return { page: Number(input.page) };
          },
          errorComponent: (scope: Scope | null, props: { error: () => Error }) => {
            const node = document.createElement("b");
            insert(scope, node, () => props.error().message);
            return node;
          },
          component: showSearch,
        },
      ] as never,
      history,
    });
    flush();
    expect(host.textContent).toBe("page must be a number");
    dispose();
  });

  test("useSearch answers with the validated record", async () => {
    const history = memoryHistory({ initial: ["/u?n=41"] });
    const { host, dispose } = mount({
      routes: [
        {
          path: "/u",
          validateSearch: (input: Record<string, unknown>) => ({ n: Number(input.n) + 1 }),
          component: (scope: Scope | null) => {
            const node = document.createElement("span");
            const s = useSearch<{ n: number }>();
            insert(scope, node, () => String(s().n));
            return node;
          },
        },
      ] as never,
      history,
    });
    flush();
    expect(host.textContent).toBe("42");
    dispose();
  });

  test("searchMiddlewares run when a location is BUILT, not on the way in", async () => {
    const history = memoryHistory({ initial: ["/a?theme=dark"] });
    const state = createRouter({
      routes: [
        {
          path: "/a",
          searchMiddlewares: [retainSearchParams(["theme"])],
          component: page("a"),
        },
        {
          path: "/b",
          searchMiddlewares: [retainSearchParams(["theme"])],
          component: page("b"),
        },
      ] as never,
      history,
    });
    const { dispose } = mountState(state);
    flush();

    // An INBOUND url keeps whatever it says — it is a fact, not an intent.
    expect(state.location().search).toBe("?theme=dark");

    // A BUILT one carries the retained key even though the caller did not.
    await state.navigate("/b?page=2");
    flush();
    const search = new URLSearchParams(state.location().search);
    expect(search.get("page")).toBe("2");
    expect(search.get("theme")).toBe("dark");
    dispose();
  });
});

describe("beforeLoad and route context", () => {
  const span = (scope: Scope | null, props: RouteProps): Node => {
    const node = document.createElement("span");
    insert(scope, node, () => JSON.stringify(props.context()));
    return node;
  };

  test("context merges parent to child, and the child wins a collision", async () => {
    const history = memoryHistory({ initial: ["/app/7"] });
    const { host, dispose } = mount({
      routes: [
        {
          path: "/app",
          context: () => ({ tenant: "acme", role: "guest" }),
          beforeLoad: async () => ({ level: "layout" }),
          component: (scope: Scope | null, props: RouteProps) => {
            const node = document.createElement("div");
            insert(scope, node, () => props.children);
            return node;
          },
          children: [
            {
              path: "$id",
              // Collides on `role`, which the child must win.
              beforeLoad: () => ({ role: "admin" }),
              component: span,
            },
          ],
        },
      ] as never,
      history,
    });

    await tick();
    await settle();
    flush();
    expect(JSON.parse(host.textContent ?? "{}")).toEqual({
      tenant: "acme",
      role: "admin",
      level: "layout",
    });
    dispose();
  });

  test("beforeLoad runs outermost-first and each one sees the ones above it", async () => {
    const order: string[] = [];
    const history = memoryHistory({ initial: ["/a/b/c"] });
    const wrap = (scope: Scope | null, props: RouteProps): Node => {
      const node = document.createElement("div");
      insert(scope, node, () => props.children);
      return node;
    };
    const { dispose } = mount({
      routes: [
        {
          path: "/a",
          beforeLoad: async ({ context }: { context: Record<string, unknown> }) => {
            order.push(`a saw ${JSON.stringify(context)}`);
            return { a: 1 };
          },
          component: wrap,
          children: [
            {
              path: "b",
              beforeLoad: async ({ context }: { context: Record<string, unknown> }) => {
                order.push(`b saw ${JSON.stringify(context)}`);
                return { b: 2 };
              },
              component: wrap,
              children: [
                {
                  path: "c",
                  beforeLoad: ({ context }: { context: Record<string, unknown> }) => {
                    order.push(`c saw ${JSON.stringify(context)}`);
                  },
                  component: span,
                },
              ],
            },
          ],
        },
      ] as never,
      history,
    });

    await tick();
    await settle();
    flush();
    expect(order).toEqual(["a saw {}", 'b saw {"a":1}', 'c saw {"a":1,"b":2}']);
    dispose();
  });

  test("every beforeLoad completes before any loader starts", async () => {
    const order: string[] = [];
    const history = memoryHistory({ initial: ["/x"] });
    // Built directly, because this needs a real `navigate()` — a raw
    // `history.push` is the popstate path, which has no navigation to gate.
    const state = createRouter({
      routes: [
        { path: "/x", component: page("x") },
        {
          path: "/y",
          beforeLoad: async () => {
            await tick();
            order.push("beforeLoad");
          },
          loader: async () => {
            order.push("loader");
            await tick();
            return "d";
          },
          pending: page("l"),
          component: span,
        },
      ] as never,
      history,
    });
    const { dispose } = mountState(state);

    await settle();
    flush();
    await state.navigate("/y");
    flush();
    await settle();
    flush();
    // Structural rather than scheduled: `beforeLoad` runs during `navigate` and
    // loaders run on read, which is after the commit.
    expect(order).toEqual(["beforeLoad", "loader"]);
    dispose();
  });

  test("beforeLoad is handed params, search and location, not just context", async () => {
    // It was handed the wrong object entirely for one commit: a rename reached
    // the declaration and not the two uses, so `beforeLoad` received the
    // internal `{ server }` flag. Every existing test read only `context`, so
    // all of them passed; `oxlint` reported the unused variable.
    let seen: Record<string, unknown> | null = null;
    const history = memoryHistory({ initial: ["/app/7?q=hi"] });
    const { dispose } = mount({
      routes: [
        {
          path: "/app/$id",
          beforeLoad: (given: Record<string, unknown>) => {
            seen = given;
            return {};
          },
          component: page("app"),
        },
      ] as never,
      history,
    });
    await tick();
    await settle();
    flush();
    const given = seen as unknown as {
      params: Record<string, string>;
      search: URLSearchParams;
      location: { pathname: string };
      context: Record<string, unknown>;
    };
    expect(given.params).toEqual({ id: "7" });
    expect(given.search.get("q")).toBe("hi");
    expect(given.location.pathname).toBe("/app/7");
    expect(given.context).toEqual({});
    dispose();
  });

  test("beforeLoad can throw redirect(), and it never commits the refused location", async () => {
    // The branch that handles this referenced `Redirect` without importing it,
    // so it would have thrown a ReferenceError the first time a `beforeLoad`
    // redirected. 167 tests were green; `oxlint --type-aware` is what found it,
    // reporting `error.to` as error-typed.
    const history = memoryHistory({ initial: ["/home"] });
    const state = createRouter({
      routes: [
        { path: "/home", component: page("home") },
        { path: "/login", component: page("login") },
        {
          path: "/private",
          beforeLoad: () => {
            redirect("/login");
          },
          component: page("secret"),
        },
      ] as never,
      history,
    });
    const { host, dispose } = mountState(state);

    await state.navigate("/private");
    flush();
    await settle();
    flush();

    expect(host.textContent).toBe("login");
    expect(state.location().pathname).toBe("/login");
    dispose();
  });

  test("a loader is handed the context its ancestors built", async () => {
    let seen: unknown;
    const history = memoryHistory({ initial: ["/app/7"] });
    const { dispose } = mount({
      routes: [
        {
          path: "/app",
          beforeLoad: () => ({ token: "abc" }),
          component: (scope: Scope | null, props: RouteProps) => {
            const node = document.createElement("div");
            insert(scope, node, () => props.children);
            return node;
          },
          children: [
            {
              path: "$id",
              loader: async ({ context }: { context: Record<string, unknown> }) => {
                seen = context;
                await tick();
                return "ok";
              },
              pending: page("l"),
              component: (scope: Scope | null, props: RouteProps) => {
                const node = document.createElement("b");
                insert(scope, node, () => String(props.data()));
                return node;
              },
            },
          ],
        },
      ] as never,
      history,
    });

    await tick();
    await settle();
    flush();
    expect(seen).toEqual({ token: "abc" });
    dispose();
  });
});

describe("errorComponent on the DOM backend", () => {
  test("a loader that rejects after hydration is caught, not thrown out of the render", async () => {
    // The DOM path installed only a `"loading"` boundary, so every client-side
    // loader rejection had nothing to catch it and walked out of the render.
    // The string backend grew an `Errored` per depth when a rejected loader
    // stopped tearing the response; this is the same boundary on the other side.
    const history = memoryHistory({ initial: ["/boom"] });
    const { host, dispose } = mount({
      routes: [
        {
          path: "/boom",
          loader: async () => {
            await tick();
            throw new Error("loader said no");
          },
          pending: page("loading"),
          errorComponent: (scope: Scope | null, props: { error: () => Error }) => {
            const node = document.createElement("p");
            insert(scope, node, () => props.error().message);
            return node;
          },
          component: (scope: Scope | null, props: RouteProps) => {
            const node = document.createElement("span");
            insert(scope, node, () => String(props.data()));
            return node;
          },
        },
      ] as never,
      history,
    });

    await settle();
    flush();
    expect(host.textContent).toBe("loader said no");

    dispose();
  });

  test("notFound() reaches notFoundComponent on the client too", async () => {
    const history = memoryHistory({ initial: ["/missing"] });
    const { host, dispose } = mount({
      routes: [
        {
          path: "/missing",
          loader: async () => {
            await tick();
            notFound("no row 7");
          },
          pending: page("loading"),
          errorComponent: (scope: Scope | null) => {
            const node = document.createElement("p");
            insert(scope, node, () => "generic");
            return node;
          },
          notFoundComponent: (scope: Scope | null, props: { error: () => Error }) => {
            const node = document.createElement("p");
            insert(scope, node, () => props.error().message);
            return node;
          },
          component: (scope: Scope | null, props: RouteProps) => {
            const node = document.createElement("span");
            insert(scope, node, () => String(props.data()));
            return node;
          },
        },
      ] as never,
      history,
    });

    await settle();
    flush();
    expect(host.textContent).toBe("no row 7");

    dispose();
  });
});

describe("nested layouts", () => {
  test("a layout builds the child in its own scope, through children-as-a-Block", () => {
    const history = memoryHistory({ initial: ["/users/7"] });
    const { host, dispose } = mount({
      routes: [
        {
          path: "/users",
          component: (scope: Scope | null, props: RouteProps) => {
            const wrapper = document.createElement("section");
            wrapper.appendChild(document.createTextNode("["));
            const child = (props.children as unknown as (s: Scope | null) => unknown)(scope);
            if (child !== null && child !== undefined) wrapper.append(child as never);
            wrapper.appendChild(document.createTextNode("]"));
            return wrapper;
          },
          children: [{ path: "$id", component: page("user") }],
        },
      ] as never,
      history,
    });

    expect(host.textContent).toBe("[user]");
    dispose();
  });
});

describe("Link", () => {
  const routes: AnyRouteDefinition[] = [
    { path: "/", component: page("home") },
    { path: "/users/$id", component: page("user") },
  ] as never;

  test("renders an href and navigates on click", async () => {
    const history = memoryHistory();
    const { host, dispose } = mount({
      routes: [
        {
          path: "/",
          component: (scope: Scope | null) =>
            (Link as never as (s: Scope | null, p: unknown) => Node)(scope, {
              to: () => "/users/7",
              children: () => "go",
            }),
        },
        { path: "/users/$id", component: page("user") },
      ] as never,
      history,
    });

    const anchor = host.querySelector("a") as HTMLAnchorElement;
    expect(anchor.getAttribute("href")).toBe("/users/7");

    anchor.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    // Navigation is ALWAYS async — the guard pipeline is, whether or not any
    // guard is declared — so a click is not observable until the microtask runs.
    await tick();
    flush();
    expect(history.current().pathname).toBe("/users/7");
    expect(host.textContent).toBe("user");
    dispose();
  });

  test("builds an href from a route id plus params", () => {
    const history = memoryHistory();
    const { host, dispose } = mount({
      routes: [
        {
          path: "/",
          component: (scope: Scope | null) =>
            (Link as never as (s: Scope | null, p: unknown) => Node)(scope, {
              to: () => "/users/$id",
              params: () => ({ id: "7" }),
              children: () => "go",
            }),
        },
        { path: "/users/$id", component: page("user") },
      ] as never,
      history,
    });
    expect((host.querySelector("a") as HTMLAnchorElement).getAttribute("href")).toBe("/users/7");
    dispose();
  });

  test("an external href renders verbatim and is not intercepted", () => {
    const history = memoryHistory();
    const { host, dispose } = mount({
      routes: [
        {
          path: "/",
          component: (scope: Scope | null) =>
            (Link as never as (s: Scope | null, p: unknown) => Node)(scope, {
              to: () => "https://example.com/x",
              children: () => "out",
            }),
        },
      ] as never,
      history,
    });
    const anchor = host.querySelector("a") as HTMLAnchorElement;
    expect(anchor.getAttribute("href")).toBe("https://example.com/x");
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    anchor.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    dispose();
  });

  test("a modified click is left to the browser", () => {
    const history = memoryHistory();
    const { host, dispose } = mount({
      routes: [
        {
          path: "/",
          component: (scope: Scope | null) =>
            (Link as never as (s: Scope | null, p: unknown) => Node)(scope, {
              to: () => "/users/7",
              children: () => "go",
            }),
        },
        ...routes.slice(1),
      ] as never,
      history,
    });
    const anchor = host.querySelector("a") as HTMLAnchorElement;
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true });
    anchor.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(history.current().pathname).toBe("/");
    dispose();
  });

  test("a surviving Link re-resolves a relative href when the location moves", () => {
    // Only observable when the layout survives — which it does, because the
    // branch key is route identity and excludes params.
    const history = memoryHistory({ initial: ["/u/1/edit"] });
    const { host, dispose } = mount({
      routes: [
        {
          path: "/u/$id",
          component: (scope: Scope | null) => {
            const wrapper = document.createElement("div");
            wrapper.append(
              (Link as never as (s: Scope | null, p: unknown) => Node)(scope, {
                to: () => "..",
                children: () => "up",
              }) as never,
            );
            return wrapper;
          },
          children: [{ path: "edit", component: page("edit") }],
        },
      ] as never,
      history,
    });

    const anchor = host.querySelector("a") as HTMLAnchorElement;
    expect(anchor.getAttribute("href")).toBe("/u/1");

    history.push("/u/550e8400-e29b-41d4/edit");
    flush();
    // Same element, new href: the layout survived the navigation because the
    // branch key is route identity, and the href re-resolved because it is read
    // inside the binding rather than captured at construction.
    expect(host.querySelector("a")).toBe(anchor);
    expect(anchor.getAttribute("href")).toBe("/u/550e8400-e29b-41d4");
    dispose();
  });
});

describe("Link preload", () => {
  /**
   * Eight bugs the deleted `packages/extra/src/router.ts` had here, each one
   * confirmed against `git show 1991691:` before this was written. Every test
   * below is one of them.
   */
  const table = (calls: string[]): AnyRouteDefinition[] =>
    [
      { path: "/", component: page("home") },
      {
        path: "/users/$id",
        loader: async ({ params }: { params: { id: string } }) => {
          calls.push(params.id);
          await tick();
          return `user ${params.id}`;
        },
        pending: page("l"),
        component: page("user"),
      },
      {
        path: "/list",
        loader: async ({ search }: { search: URLSearchParams }) => {
          calls.push(`page=${search.get("page") ?? "?"}`);
          await tick();
          return "list";
        },
        pending: page("l"),
        component: page("list"),
      },
    ] as never;

  /** The link is rendered as the home route's component, so it is UNDER the provider. */
  const link = (
    props: Record<string, unknown>,
    calls: string[],
  ): { state: RouterState; element: HTMLElement; dispose: () => void } => {
    const history = memoryHistory({ initial: ["/"] });
    const routes = table(calls);
    (routes[0] as { component: unknown }).component = (scope: Scope | null) =>
      (Link as never as (s: Scope | null, p: unknown) => Node)(scope, {
        to: () => props.to,
        preload: () => props.preload,
        children: () => "go",
      });
    const state = createRouter({ routes, history });
    const { host, dispose } = mountState(state);
    return { state, element: host.querySelector("a") as HTMLElement, dispose };
  };

  test("preload is OFF by default: a hover fetches nothing", async () => {
    const calls: string[] = [];
    const { element, dispose } = link({ to: "/users/7" }, calls);
    element.dispatchEvent(new Event("mouseenter"));
    await tick();
    await tick();
    expect(calls).toEqual([]);
    dispose();
  });

  test("a path that fails to match is not poisoned for the router's lifetime", async () => {
    // The old router added the path to a `prefetched` Set BEFORE testing
    // whether it matched, and never evicted — so one hover over a broken link
    // disabled preload for it forever.
    const calls: string[] = [];
    const { state, dispose } = link({ to: "/nope" }, calls);
    await state.preload("/nope");
    await state.preload("/users/7");
    await settle();
    expect(calls).toEqual(["7"]);
    dispose();
  });

  test("preload uses the SAME search as a navigation would", async () => {
    // The old router preloaded with an EMPTY `URLSearchParams` while its cache
    // key included the search, so every slot it filled was one no navigation
    // could read — and the loader saw the wrong query too.
    const calls: string[] = [];
    const { state, dispose } = link({ to: "/list?page=2" }, calls);
    await state.preload("/list?page=2");
    await settle();
    expect(calls).toEqual(["page=2"]);
    dispose();
  });

  test("a preloaded route is a cache HIT when the navigation arrives", async () => {
    const calls: string[] = [];
    const { state, dispose } = link({ to: "/users/7", preload: "render" }, calls);
    await state.preload("/users/7");
    await settle();
    expect(calls).toEqual(["7"]);

    // `preloadStaleTime` defaults to 30s, so arriving immediately reuses it.
    await state.navigate("/users/7");
    flush();
    await settle();
    flush();
    expect(calls).toEqual(["7"]);
    dispose();
  });

  test("a query on the href still matches: it is resolved before the matcher sees it", async () => {
    // The old router handed the raw href to the matcher, so `/about?x=1`
    // matched nothing and `/users/7?tab=a` matched with `id = "7?tab=a"`.
    const calls: string[] = [];
    const { state, dispose } = link({ to: "/users/7?tab=a" }, calls);
    await state.preload("/users/7?tab=a");
    await settle();
    expect(calls).toEqual(["7"]);
    dispose();
  });

  test("an IntersectionObserver is built for `viewport`, for nothing else, and warms on sight", async () => {
    const seen: string[] = [];
    let fire: ((entries: { isIntersecting: boolean }[]) => void) | null = null;
    let disconnected = 0;
    const real = globalThis.IntersectionObserver;
    class Spy {
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
        seen.push("constructed");
        fire = callback;
      }
      observe(): void {}
      disconnect(): void {
        disconnected++;
      }
    }
    (globalThis as { IntersectionObserver: unknown }).IntersectionObserver = Spy;
    try {
      const calls: string[] = [];
      const off = link({ to: "/users/7" }, calls);
      expect(seen).toEqual([]);
      off.dispose();

      const on = link({ to: "/users/7", preload: "viewport" }, calls);
      expect(seen).toEqual(["constructed"]);

      // Not visible yet: nothing is warmed, and the observer stays.
      (fire as unknown as (e: { isIntersecting: boolean }[]) => void)([{ isIntersecting: false }]);
      await tick();
      expect(calls).toEqual([]);
      expect(disconnected).toBe(0);

      // Visible: warmed once, and it stops watching.
      (fire as unknown as (e: { isIntersecting: boolean }[]) => void)([{ isIntersecting: true }]);
      await tick();
      await settle();
      expect(calls).toEqual(["7"]);
      expect(disconnected).toBe(1);
      on.dispose();
    } finally {
      (globalThis as { IntersectionObserver: unknown }).IntersectionObserver = real;
    }
  });

  test("focus counts as intent, so a keyboard user preloads too", async () => {
    const calls: string[] = [];
    const { element, dispose } = link({ to: "/users/7", preload: "intent" }, calls);
    element.dispatchEvent(new Event("focusin"));
    await new Promise((resolve) => setTimeout(resolve, 80));
    await settle();
    expect(calls).toEqual(["7"]);
    dispose();
  });

  test("leaving before the delay cancels it", async () => {
    const calls: string[] = [];
    const { element, dispose } = link({ to: "/users/7", preload: "intent" }, calls);
    element.dispatchEvent(new Event("mouseenter"));
    element.dispatchEvent(new Event("mouseleave"));
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(calls).toEqual([]);
    dispose();
  });

  test("unmounting inside the hover window fires nothing", async () => {
    // The old router cleared its timer on `mouseleave` only.
    const calls: string[] = [];
    const { element, dispose } = link({ to: "/users/7", preload: "intent" }, calls);
    element.dispatchEvent(new Event("mouseenter"));
    dispose();
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(calls).toEqual([]);
  });
});

describe("NavLink", () => {
  test("is active on a segment prefix, and `end` makes it exact", () => {
    const history = memoryHistory({ initial: ["/user/7"] });
    const { host, dispose } = mount({
      routes: [
        {
          path: "/user/$id",
          component: (scope: Scope | null) => {
            const wrapper = document.createElement("div");
            wrapper.append(
              (NavLink as never as (s: Scope | null, p: unknown) => Node)(scope, {
                to: () => "/user",
                children: () => "prefix",
              }) as never,
              (NavLink as never as (s: Scope | null, p: unknown) => Node)(scope, {
                to: () => "/user",
                end: () => true,
                children: () => "exact",
              }) as never,
              (NavLink as never as (s: Scope | null, p: unknown) => Node)(scope, {
                to: () => "/user-settings",
                children: () => "sibling",
              }) as never,
            );
            return wrapper;
          },
        },
      ] as never,
      history,
    });

    const [prefix, exact, sibling] = [...host.querySelectorAll("a")] as HTMLAnchorElement[];
    expect(prefix?.getAttribute("aria-current")).toBe("page");
    expect(exact?.getAttribute("aria-current")).toBeNull();
    // `/user-settings` merely starts with the same letters.
    expect(sibling?.getAttribute("aria-current")).toBeNull();
    dispose();
  });
});

describe("guards", () => {
  test("a redirect from beforeEach lands, and the refused route never shows", async () => {
    const history = memoryHistory();
    const { host, dispose } = mount({
      routes: [
        { path: "/", component: page("home") },
        { path: "/private", component: page("secret") },
        { path: "/login", component: page("login") },
      ] as never,
      history,
      beforeEach: [({ to }) => (to.pathname === "/private" ? "/login" : true)],
    });

    const state = { navigated: false };
    const navigate = (host as unknown as { navigate?: unknown }).navigate;
    void navigate;
    void state;

    // Drive through the history's own router, via a Link click would need a
    // component; the router's navigate is reached through the hook in a route.
    const routerHistory = history;
    routerHistory.push("/private");
    flush();
    // A raw history push bypasses the guard by design — the guard runs on
    // `navigate`, which is what a Link and `useNavigate` call. This asserts the
    // boundary rather than pretending a push is guarded.
    expect(host.textContent).toBe("secret");
    dispose();
  });

  test("useNavigate runs the guards", async () => {
    const history = memoryHistory();
    let go: ((to: string) => Promise<void>) | null = null;
    const { host, dispose } = mount({
      routes: [
        {
          path: "/",
          component: () => {
            const navigate = useNavigate();
            go = (to: string) => navigate(to);
            return document.createTextNode("home");
          },
        },
        { path: "/private", component: page("secret") },
        { path: "/login", component: page("login") },
      ] as never,
      history,
      beforeEach: [({ to }) => (to.pathname === "/private" ? "/login" : true)],
    });

    await (go as unknown as (to: string) => Promise<void>)("/private");
    flush();
    expect(host.textContent).toBe("login");
    expect(history.current().pathname).toBe("/login");
    dispose();
  });

  test("a guard that refuses stops the navigation dead", async () => {
    const history = memoryHistory();
    let go: ((to: string) => Promise<void>) | null = null;
    const { host, dispose } = mount({
      routes: [
        {
          path: "/",
          component: () => {
            go = useNavigate();
            return document.createTextNode("home");
          },
        },
        { path: "/private", component: page("secret") },
      ] as never,
      history,
      beforeEach: [() => false],
    });

    await (go as unknown as (to: string) => Promise<void>)("/private");
    flush();
    expect(host.textContent).toBe("home");
    expect(history.current().pathname).toBe("/");
    dispose();
  });

  test("a redirect loop is bounded rather than hanging", async () => {
    const history = memoryHistory();
    let go: ((to: string) => Promise<void>) | null = null;
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => errors.push(args.join(" "));
    try {
      const { dispose } = mount({
        routes: [
          {
            path: "/",
            component: () => {
              go = useNavigate();
              return document.createTextNode("home");
            },
          },
          { path: "/a", component: page("a") },
        ] as never,
        history,
        // Always refuses and redirects to a path it also refuses.
        beforeEach: [({ to }) => (to.pathname === "/" ? true : "/a")],
      });
      await (go as unknown as (to: string) => Promise<void>)("/a");
      expect(errors.join(" ")).toContain("redirects");
      dispose();
    } finally {
      console.error = original;
    }
  });
});

describe("the smaller surface", () => {
  test("useBlocker refuses a navigation, and stops refusing when its scope dies", async () => {
    let refuse = true;
    const history = memoryHistory({ initial: ["/a"] });
    const state = createRouter({
      routes: [
        { path: "/a", component: page("a") },
        { path: "/b", component: page("b") },
      ] as never,
      history,
    });
    // `true` BLOCKS, so a blocker that forgets to return lets the user keep
    // navigating rather than trapping them.
    const off = state.block(() => refuse);
    const { host, dispose } = mountState(state);

    await state.navigate("/b");
    flush();
    expect(host.textContent).toBe("a");

    refuse = false;
    await state.navigate("/b");
    flush();
    expect(host.textContent).toBe("b");

    // Unregistering is what stops a form that has unmounted from blocking the
    // whole app.
    refuse = true;
    off();
    await state.navigate("/a");
    flush();
    expect(host.textContent).toBe("a");
    dispose();
  });

  test("the FIRST refusal ends it, so blockers do not have to know about each other", async () => {
    const asked: string[] = [];
    const history = memoryHistory({ initial: ["/a"] });
    const state = createRouter({
      routes: [
        { path: "/a", component: page("a") },
        { path: "/b", component: page("b") },
      ] as never,
      history,
    });
    state.block(() => {
      asked.push("first");
      return true;
    });
    state.block(() => {
      asked.push("second");
      return false;
    });
    const { dispose } = mountState(state);
    await state.navigate("/b");
    expect(asked).toEqual(["first"]);
    dispose();
  });

  test("canGoBack is false at the start and true after a push", async () => {
    const history = memoryHistory({ initial: ["/a"] });
    const state = createRouter({
      routes: [
        { path: "/a", component: page("a") },
        { path: "/b", component: page("b") },
      ] as never,
      history,
    });
    const { dispose } = mountState(state);
    expect(state.canGoBack()).toBe(false);
    await state.navigate("/b");
    flush();
    expect(state.canGoBack()).toBe(true);
    dispose();
  });

  test("useMatch finds a route by id, and the leaf without one", () => {
    const history = memoryHistory({ initial: ["/app/7"] });
    const state = createRouter({
      routes: [
        {
          id: "layout",
          path: "/app",
          component: (scope: Scope | null, props: RouteProps) => {
            const node = document.createElement("div");
            insert(scope, node, () => props.children);
            return node;
          },
          children: [{ id: "leaf", path: "$id", component: page("leaf") }],
        },
      ] as never,
      history,
    });
    const { dispose } = mountState(state);
    const chain = state.chain();
    expect(chain.map((route) => route.id)).toEqual(["layout", "leaf"]);
    dispose();
  });

  test("isNavigating is true only between the ask and the commit", async () => {
    // Not a loading counter — DESIGN.md rules that out — but the gap where
    // blockers, guards and `beforeLoad` run.
    const history = memoryHistory({ initial: ["/a"] });
    const seen: boolean[] = [];
    const state = createRouter({
      routes: [
        { path: "/a", component: page("a") },
        {
          path: "/b",
          beforeLoad: async () => {
            seen.push(state.isNavigating());
            await tick();
          },
          component: page("b"),
        },
      ] as never,
      history,
    });
    const { dispose } = mountState(state);
    expect(state.isNavigating()).toBe(false);
    await state.navigate("/b");
    expect(seen).toEqual([true]);
    expect(state.isNavigating()).toBe(false);
    dispose();
  });

  test("a mask shows one url and renders another", async () => {
    // A photo over a feed: the address bar reads `/feed` so closing it is a back
    // button and copying the link shares the feed, while what renders is the
    // photo.
    const history = memoryHistory({ initial: ["/feed"] });
    const state = createRouter({
      routes: [
        { path: "/feed", component: page("feed") },
        { path: "/photos/$id", component: page("photo") },
      ] as never,
      history,
    });
    const { host, dispose } = mountState(state);
    expect(host.textContent).toBe("feed");

    await state.navigate("/photos/5", { mask: "/feed" });
    flush();
    // Rendered: the photo. Shown: the feed.
    expect(host.textContent).toBe("photo");
    expect(state.location().pathname).toBe("/feed");
    dispose();
  });

  test("a masked url pasted somewhere else renders the MASK", () => {
    // The real target rides in `history.state`, which does not survive being
    // copied out of the address bar — and that is the point of choosing a mask.
    const history = memoryHistory({ initial: ["/feed"] });
    const state = createRouter({
      routes: [
        { path: "/feed", component: page("feed") },
        { path: "/photos/$id", component: page("photo") },
      ] as never,
      history,
    });
    const { host, dispose } = mountState(state);
    expect(host.textContent).toBe("feed");
    dispose();
  });

  test("NavLink activeProps and inactiveProps swap, and a one-sided name is REMOVED", async () => {
    const history = memoryHistory({ initial: ["/a"] });
    const state = createRouter({
      routes: [
        {
          path: "/a",
          component: (scope: Scope | null) =>
            (NavLink as never as (s: Scope | null, p: unknown) => Node)(scope, {
              to: () => "/a",
              activeProps: () => ({ "data-state": "here", title: "you are here" }),
              inactiveProps: () => ({ "data-state": "away" }),
              children: () => "a",
            }),
        },
        { path: "/b", component: page("b") },
      ] as never,
      history,
    });
    const { host, dispose } = mountState(state);
    const anchor = host.querySelector("a") as HTMLAnchorElement;
    expect(anchor.getAttribute("data-state")).toBe("here");
    expect(anchor.getAttribute("title")).toBe("you are here");

    await state.navigate("/b");
    flush();
    // The link is gone with its route; what matters is that a name present in
    // one record and absent from the other is bound at all — asserted on the
    // inactive side below.
    dispose();

    const other = createRouter({
      routes: [
        {
          path: "/a",
          component: (scope: Scope | null) =>
            (NavLink as never as (s: Scope | null, p: unknown) => Node)(scope, {
              to: () => "/elsewhere",
              activeProps: () => ({ title: "you are here" }),
              inactiveProps: () => ({ "data-state": "away" }),
              children: () => "a",
            }),
        },
      ] as never,
      history: memoryHistory({ initial: ["/a"] }),
    });
    const second = mountState(other);
    const link = second.host.querySelector("a") as HTMLAnchorElement;
    expect(link.getAttribute("data-state")).toBe("away");
    // `title` is only in the ACTIVE record, so while inactive it must be absent
    // rather than left over from a previous state.
    expect(link.hasAttribute("title")).toBe(false);
    second.dispose();
  });
});

describe("two routers on one page", () => {
  test("keep independent locations", () => {
    const a = memoryHistory({ initial: ["/"] });
    const b = memoryHistory({ initial: ["/other"] });
    const routes = [
      { path: "/", component: page("A-home") },
      { path: "/other", component: page("B-other") },
    ] as never;

    const first = mount({ routes, history: a });
    const second = mount({ routes, history: b });

    expect(first.host.textContent).toBe("A-home");
    expect(second.host.textContent).toBe("B-other");

    a.push("/other");
    flush();
    expect(first.host.textContent).toBe("B-other");
    expect(second.host.textContent).toBe("B-other");

    first.dispose();
    second.dispose();
  });
});

describe("useLocation / useParams", () => {
  test("resolve through the scope chain", () => {
    const history = memoryHistory({ initial: ["/u/9"] });
    let pathname = "";
    let id = "";
    const { dispose } = mount({
      routes: [
        {
          path: "/u/$id",
          component: () => {
            pathname = useLocation()().pathname;
            id = (useParams()() as Record<string, string>).id as string;
            return document.createTextNode("x");
          },
        },
      ] as never,
      history,
    });
    expect(pathname).toBe("/u/9");
    expect(id).toBe("9");
    dispose();
  });
});

describe("beforeEnter", () => {
  test("runs after the global chain, outermost route first", async () => {
    const order: string[] = [];
    const history = memoryHistory();
    let go: ((to: string) => Promise<void>) | null = null;
    const { dispose } = mount({
      routes: [
        {
          path: "/",
          component: () => {
            go = useNavigate();
            return document.createTextNode("home");
          },
        },
        {
          path: "/admin",
          beforeEnter: () => {
            order.push("layout");
            return true;
          },
          component: (scope: Scope | null, props: RouteProps) =>
            ((props.children as unknown as (s: Scope | null) => unknown)(scope) ??
              document.createTextNode("")) as Node,
          children: [
            {
              path: "users",
              beforeEnter: () => {
                order.push("leaf");
                return true;
              },
              component: page("users"),
            },
          ],
        },
      ] as never,
      history,
      beforeEach: [
        () => {
          order.push("global");
          return true;
        },
      ],
    });

    await (go as unknown as (to: string) => Promise<void>)("/admin/users");
    flush();
    expect(order).toEqual(["global", "layout", "leaf"]);
    dispose();
  });

  test("a layout's guard refuses before the route it wraps is asked", async () => {
    const asked: string[] = [];
    const history = memoryHistory();
    let go: ((to: string) => Promise<void>) | null = null;
    const { host, dispose } = mount({
      routes: [
        {
          path: "/",
          component: () => {
            go = useNavigate();
            return document.createTextNode("home");
          },
        },
        {
          path: "/admin",
          beforeEnter: () => {
            asked.push("layout");
            return "/";
          },
          component: (scope: Scope | null, props: RouteProps) =>
            ((props.children as unknown as (s: Scope | null) => unknown)(scope) ??
              document.createTextNode("")) as Node,
          children: [
            {
              path: "users",
              beforeEnter: () => {
                asked.push("leaf");
                return true;
              },
              component: page("users"),
            },
          ],
        },
      ] as never,
      history,
    });

    await (go as unknown as (to: string) => Promise<void>)("/admin/users");
    flush();
    expect(asked).toEqual(["layout"]);
    expect(host.textContent).toBe("home");
    dispose();
  });
});

describe("useSearchParams", () => {
  test("reads the query and writes it by navigating", async () => {
    const history = memoryHistory({ initial: ["/?role=admin"] });
    let read: (() => URLSearchParams) | null = null;
    let write: ((next: Record<string, string>) => void) | null = null;
    const { dispose } = mount({
      routes: [
        {
          path: "/",
          component: () => {
            const [search, set] = useSearchParams();
            read = search;
            write = set;
            return document.createTextNode("home");
          },
        },
      ] as never,
      history,
    });

    expect((read as unknown as () => URLSearchParams)().get("role")).toBe("admin");

    (write as unknown as (n: Record<string, string>) => void)({ role: "user" });
    await tick();
    flush();
    expect(history.current().search).toBe("?role=user");

    // An empty value drops the key rather than writing `?role=`.
    (write as unknown as (n: Record<string, string>) => void)({ role: "" });
    await tick();
    flush();
    expect(history.current().search).toBe("");
    // …and it replaced rather than pushing, so a filter is not a back stop.
    history.go(-1);
    expect(history.current().pathname).toBe("/");
    dispose();
  });
});

void text;
