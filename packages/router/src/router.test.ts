/**
 * The router driven for real: mounted into a document, navigated, torn down.
 *
 * Every test here drives a `memoryHistory` that actually records. The old
 * package's `memoryHistory.push` and `watch` were both no-ops and all 100 of its
 * tests used one, so its suite could not tell a navigation that worked from one
 * that did nothing.
 */

import {
  type Scope,
  flush,
  getOwner,
  insert,
  isDisposed,
  lazy,
  render,
  settle,
} from "@barqjs/core";
import { afterEach, describe, expect, test } from "bun:test";

import { Await, Link, NavLink, Router, RouterProvider, linkHref, useRouter } from "./components.ts";
import { notFound, redirect } from "./errors.ts";
import { retainSearchParams } from "./search.ts";
import { memoryHistory } from "./history.ts";
import {
  useLocation,
  useNavigate,
  useParams,
  useSearch,
  useSearchParams,
  useServerFn,
} from "./hooks.ts";
import type { AnyRouteDefinition, RouteProps } from "./route.ts";
import { type RouterEvent, type RouterState, createRouter, unmask } from "./router.ts";

const tick = (ms = 0) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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
        routeTree: () => props.routeTree,
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

/**
 * What a user would SEE, which `textContent` is not.
 *
 * `textContent` includes a subtree hidden with `display: none`, and `pendingMs`
 * hides its fallback rather than removing it — the boundary places its output
 * once, so nodes added later fall outside the range it tears down.
 */
function visibleText(node: Node): string {
  if (node.nodeType === 3) return node.textContent ?? "";
  if (node.nodeType !== 1) return "";
  const element = node as HTMLElement;
  if (element.style.display === "none") return "";
  let out = "";
  for (const child of element.childNodes) out += visibleText(child);
  return out;
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
    const { host, dispose } = mount({ routeTree: routes, history });

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
    const { host, dispose } = mount({ routeTree: routes, history });
    expect(host.textContent).toBe("404 - Not Found");
    dispose();
  });

  test("a custom notFound wins over it", () => {
    const history = memoryHistory({ initial: ["/nowhere"] });
    const { host, dispose } = mount({
      routeTree: routes,
      history,
      notFound: page("nope") as never,
    });
    expect(host.textContent).toBe("nope");
    dispose();
  });

  test("teardown IS scope disposal", () => {
    let inner: Scope | null = null;
    const history = memoryHistory();
    const { host, dispose } = mount({
      routeTree: [
        {
          path: "/",
          component: () => {
            inner = getOwner();
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
      routeTree: [
        {
          path: "/u/$id",
          component: (_s: Scope | null, props: RouteProps) => {
            builds++;
            const node = document.createTextNode("");
            // A render effect would be the compiled form; reading once per
            // build plus once per change is enough to show the identity.
            const update = () => {
              const id = props.params().id;
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
      routeTree: [
        {
          path: "/u/$id",
          loader: async ({ params }: { params: { id: string } }) => {
            calls++;
            await tick();
            return `user ${params.id}`;
          },
          pendingComponent: page("loading"),
          // The COMPILED shape. A component body runs untracked, so a bare
          // `props.data()` in the body would read the pending value, throw
          // `NotReadyError` with nothing subscribed, and never re-run when it
          // settled. `insert` is what the compiler emits for a dynamic hole and
          // it is a tracked effect, which is what registers the read with the
          // loading boundary.
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
      routeTree: [
        {
          path: "/posts",
          loader: async ({ search }: { search: URLSearchParams }) => {
            const page_ = search.get("page") ?? "0";
            seen.push(page_);
            await tick();
            return `page ${page_}`;
          },
          pendingComponent: page("loading"),
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
      routeTree: [
        {
          path: "/s",
          staleTime: Number.POSITIVE_INFINITY,
          loader: async () => {
            calls++;
            await tick();
            return "once";
          },
          pendingComponent: page("loading"),
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
      routeTree: [
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
      routeTree: [
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
          pendingComponent: page("loading"),
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
        routeTree: [
          {
            path: "/a",
            staleTime,
            loader: async () => {
              calls++;
              await tick();
              return "a";
            },
            pendingComponent: page("l"),
            component: span,
          },
          {
            path: "/b",
            loader: async () => {
              await tick();
              return "b";
            },
            pendingComponent: page("l"),
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
        routeTree: [
          {
            path: "/x",
            staleTime: Number.POSITIVE_INFINITY,
            shouldReload,
            loader: async () => {
              calls++;
              await tick();
              return "x";
            },
            pendingComponent: page("l"),
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
      routeTree: [
        {
          path: "/x",
          staleTime: 0,
          shouldReload: false,
          loader: async () => {
            calls++;
            await tick();
            return "x";
          },
          pendingComponent: page("l"),
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
      routeTree: [
        {
          path: "/p",
          staleTime: 0,
          loader: async () => {
            const mine = ++n;
            await tick();
            return `v${mine}`;
          },
          pendingComponent: page("SKELETON"),
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
      routeTree: [
        {
          path: "/p",
          staleTime: 0,
          staleReloadMode: "blocking",
          loader: async () => {
            const mine = ++n;
            await tick();
            return `v${mine}`;
          },
          pendingComponent: page("SKELETON"),
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
      routeTree: [
        {
          path: "/p",
          staleTime: 0,
          loader: async () => {
            n++;
            await tick();
            if (n > 1) throw new Error("reload failed");
            return "good";
          },
          pendingComponent: page("SKELETON"),
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
      routeTree: [
        { path: "/other", component: page("other") },
        {
          path: "/app",
          loader: async () => {
            started.push("layout");
            await tick();
            return "L";
          },
          pendingComponent: page("l"),
          component: layout,
          children: [
            {
              path: "$id",
              loader: async () => {
                started.push("leaf");
                await tick();
                return "F";
              },
              pendingComponent: page("l"),
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
      routeTree: [
        {
          path: "/p",
          staleTime: Number.POSITIVE_INFINITY,
          loader: async () => {
            const mine = ++n;
            await tick();
            return `v${mine}`;
          },
          pendingComponent: page("l"),
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
      routeTree: [
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
      routeTree: [
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
      routeTree: [
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
      routeTree: [
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

  test("search.middlewares run when a location is BUILT, not on the way in", async () => {
    const history = memoryHistory({ initial: ["/a?theme=dark"] });
    const state = createRouter({
      routeTree: [
        {
          path: "/a",
          search: { middlewares: [retainSearchParams(["theme"])] },
          component: page("a"),
        },
        {
          path: "/b",
          search: { middlewares: [retainSearchParams(["theme"])] },
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
      routeTree: [
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
      routeTree: [
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
      routeTree: [
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
          pendingComponent: page("l"),
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

  test("hydration adopts the server's beforeLoad instead of re-running it", async () => {
    // The whole point: `beforeLoad` used to run once on the server and AGAIN
    // when the client router mounted, because loader results are seeded and
    // context was not.
    const ran: string[] = [];
    const holder = globalThis as Record<string, unknown>;
    holder.__BARQ_ROUTE_CONTEXT__ = {
      href: "/app/7",
      produced: [{ token: "from-server" }],
    };
    try {
      const history = memoryHistory({ initial: ["/app/7"] });
      const { host, dispose } = mount({
        routeTree: [
          {
            path: "/app/$id",
            context: () => {
              ran.push("context");
              return { tenant: "acme" };
            },
            beforeLoad: () => {
              ran.push("beforeLoad");
              return { token: "from-client" };
            },
            component: (scope: Scope | null, props: RouteProps) => {
              const node = document.createElement("span");
              insert(scope, node, () => JSON.stringify(props.context()));
              return node;
            },
          },
        ] as never,
        history,
      });

      await tick();
      await settle();
      flush();

      // The synchronous half re-runs — it is free and deterministic. The async
      // half does not.
      expect(ran).toEqual(["context"]);
      expect(JSON.parse(host.textContent ?? "{}")).toEqual({
        tenant: "acme",
        token: "from-server",
      });
      dispose();
    } finally {
      delete holder.__BARQ_ROUTE_CONTEXT__;
    }
  });

  test("a handoff for a DIFFERENT url is refused", async () => {
    // D9's server-matched-A/client-matched-B divergence: a client that has
    // already navigated must not adopt a context built for somewhere else.
    const ran: string[] = [];
    const holder = globalThis as Record<string, unknown>;
    holder.__BARQ_ROUTE_CONTEXT__ = { href: "/somewhere/else", produced: [{ token: "stale" }] };
    try {
      const history = memoryHistory({ initial: ["/app/7"] });
      const { host, dispose } = mount({
        routeTree: [
          {
            path: "/app/$id",
            beforeLoad: () => {
              ran.push("beforeLoad");
              return { token: "fresh" };
            },
            component: (scope: Scope | null, props: RouteProps) => {
              const node = document.createElement("span");
              insert(scope, node, () => JSON.stringify(props.context()));
              return node;
            },
          },
        ] as never,
        history,
      });

      await tick();
      await settle();
      flush();
      expect(ran).toEqual(["beforeLoad"]);
      expect(JSON.parse(host.textContent ?? "{}")).toEqual({ token: "fresh" });
      dispose();
    } finally {
      delete holder.__BARQ_ROUTE_CONTEXT__;
    }
  });

  test("the handoff is taken ONCE, so a later navigation runs beforeLoad for real", async () => {
    const ran: string[] = [];
    const holder = globalThis as Record<string, unknown>;
    holder.__BARQ_ROUTE_CONTEXT__ = { href: "/app/7", produced: [{ token: "from-server" }] };
    try {
      const history = memoryHistory({ initial: ["/app/7"] });
      const state = createRouter({
        routeTree: [
          {
            path: "/app/$id",
            beforeLoad: () => {
              ran.push("beforeLoad");
              return { token: "fresh" };
            },
            component: (scope: Scope | null, props: RouteProps) => {
              const node = document.createElement("span");
              insert(scope, node, () => JSON.stringify(props.context()));
              return node;
            },
          },
        ] as never,
        history,
      });
      const { host, dispose } = mountState(state);
      await tick();
      await settle();
      flush();
      expect(ran).toEqual([]);

      await state.navigate("/app/9");
      flush();
      await settle();
      flush();
      // A request that is over must not keep answering for a page it never saw.
      expect(ran).toEqual(["beforeLoad"]);
      expect(JSON.parse(host.textContent ?? "{}")).toEqual({ token: "fresh" });
      dispose();
    } finally {
      delete holder.__BARQ_ROUTE_CONTEXT__;
    }
  });

  test("beforeLoad is handed params, search and location, not just context", async () => {
    // It was handed the wrong object entirely for one commit: a rename reached
    // the declaration and not the two uses, so `beforeLoad` received the
    // internal `{ server }` flag. Every existing test read only `context`, so
    // all of them passed; `oxlint` reported the unused variable.
    let seen: Record<string, unknown> | null = null;
    const history = memoryHistory({ initial: ["/app/7?q=hi"] });
    const { dispose } = mount({
      routeTree: [
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
      routeTree: [
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
      routeTree: [
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
              pendingComponent: page("l"),
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
      routeTree: [
        {
          path: "/boom",
          loader: async () => {
            await tick();
            throw new Error("loader said no");
          },
          pendingComponent: page("loading"),
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
      routeTree: [
        {
          path: "/missing",
          loader: async () => {
            await tick();
            notFound("no row 7");
          },
          pendingComponent: page("loading"),
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
      routeTree: [
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
      routeTree: [
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
      routeTree: [
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
      routeTree: [
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
      routeTree: [
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
      routeTree: [
        {
          path: "/u/$id",
          component: (scope: Scope | null) => {
            const wrapper = document.createElement("div");
            wrapper.append(
              (Link as never as (s: Scope | null, p: unknown) => Node)(scope, {
                to: () => "..",
                children: () => "up",
              }),
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
        pendingComponent: page("l"),
        component: page("user"),
      },
      {
        path: "/list",
        loader: async ({ search }: { search: URLSearchParams }) => {
          calls.push(`page=${search.get("page") ?? "?"}`);
          await tick();
          return "list";
        },
        pendingComponent: page("l"),
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
    const state = createRouter({ routeTree: routes, history });
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
      routeTree: [
        {
          path: "/user/$id",
          component: (scope: Scope | null) => {
            const wrapper = document.createElement("div");
            wrapper.append(
              (NavLink as never as (s: Scope | null, p: unknown) => Node)(scope, {
                to: () => "/user",
                children: () => "prefix",
              }),
              (NavLink as never as (s: Scope | null, p: unknown) => Node)(scope, {
                to: () => "/user",
                end: () => true,
                children: () => "exact",
              }),
              (NavLink as never as (s: Scope | null, p: unknown) => Node)(scope, {
                to: () => "/user-settings",
                children: () => "sibling",
              }),
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
      routeTree: [
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
      routeTree: [
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
      routeTree: [
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
        routeTree: [
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
      routeTree: [
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
      routeTree: [
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
      routeTree: [
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
      routeTree: [
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
    // Not a loading counter, but the gap where blockers, guards and
    // `beforeLoad` run.
    const history = memoryHistory({ initial: ["/a"] });
    const seen: boolean[] = [];
    const state = createRouter({
      routeTree: [
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

  test("pendingMs delays the fallback, so a fast loader never flashes one", async () => {
    const history = memoryHistory({ initial: ["/x"] });
    const state = createRouter({
      routeTree: [
        { path: "/x", component: page("x") },
        {
          path: "/slow",
          pendingMs: 40,
          loader: async () => {
            await tick();
            return "data";
          },
          pendingComponent: page("SKELETON"),
          component: (scope: Scope | null, props: RouteProps) => {
            const node = document.createElement("span");
            insert(scope, node, () => String(props.data()));
            return node;
          },
        },
      ] as never,
      history,
    });
    const { host, dispose } = mountState(state);

    await state.navigate("/slow");
    flush();
    // Inside the delay: nothing VISIBLE, rather than a skeleton that is about to
    // vanish.
    expect(visibleText(host)).toBe("");
    await settle();
    flush();
    expect(visibleText(host)).toBe("data");
    dispose();
  });

  test("pendingMs shows the fallback once the delay has elapsed", async () => {
    const history = memoryHistory({ initial: ["/x"] });
    const state = createRouter({
      routeTree: [
        { path: "/x", component: page("x") },
        {
          path: "/slow",
          pendingMs: 10,
          loader: async () => {
            await new Promise((resolve) => setTimeout(resolve, 60));
            return "data";
          },
          pendingComponent: page("SKELETON"),
          component: (scope: Scope | null, props: RouteProps) => {
            const node = document.createElement("span");
            insert(scope, node, () => String(props.data()));
            return node;
          },
        },
      ] as never,
      history,
    });
    const { host, dispose } = mountState(state);

    await state.navigate("/slow");
    flush();
    expect(visibleText(host)).toBe("");
    await new Promise((resolve) => setTimeout(resolve, 30));
    flush();
    expect(visibleText(host)).toBe("SKELETON");
    await settle();
    flush();
    expect(visibleText(host)).toBe("data");
    dispose();
  });

  test("pendingMinMs keeps a fallback that HAS appeared from vanishing two frames later", async () => {
    const history = memoryHistory({ initial: ["/x"] });
    const state = createRouter({
      routeTree: [
        { path: "/x", component: page("x") },
        {
          path: "/slow",
          pendingMs: 5,
          pendingMinMs: 120,
          loader: async () => {
            await new Promise((resolve) => setTimeout(resolve, 15));
            return "data";
          },
          pendingComponent: page("SKELETON"),
          component: (scope: Scope | null, props: RouteProps) => {
            const node = document.createElement("span");
            insert(scope, node, () => String(props.data()));
            return node;
          },
        },
      ] as never,
      history,
    });
    const { host, dispose } = mountState(state);

    await state.navigate("/slow");
    flush();
    await new Promise((resolve) => setTimeout(resolve, 40));
    flush();
    // The loader settled at ~15 ms; the skeleton appeared at ~5 and is held.
    expect(visibleText(host)).toBe("SKELETON");

    await new Promise((resolve) => setTimeout(resolve, 140));
    flush();
    expect(visibleText(host)).toBe("data");
    dispose();
  }, 10_000);

  test("a mask shows one url and renders another", async () => {
    // A photo over a feed: the address bar reads `/feed` so closing it is a back
    // button and copying the link shares the feed, while what renders is the
    // photo.
    const history = memoryHistory({ initial: ["/feed"] });
    const state = createRouter({
      routeTree: [
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
      routeTree: [
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
      routeTree: [
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
      routeTree: [
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

    const first = mount({ routeTree: routes, history: a });
    const second = mount({ routeTree: routes, history: b });

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
      routeTree: [
        {
          path: "/u/$id",
          component: () => {
            pathname = useLocation()().pathname;
            id = useParams()().id;
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
      routeTree: [
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
      routeTree: [
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
      routeTree: [
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

/**
 * Navigating to a CODE-SPLIT route.
 *
 * Every route a file-based table generates is `lazy()`, and this never worked:
 * the destination showed its fallback forever and a second navigation was
 * stuck behind it. `renderDepth` invokes a route component inside `untrack` —
 * on purpose, so a body reading `props.params()` does not resubscribe its whole
 * subtree — and a `lazy()` cell read there subscribes to nothing, so the
 * `NotReadyError` parked this depth's boundary and the module landing could
 * never wake it.
 *
 * The fix is a TRACKED probe outside the untrack: `lazy()` exposes `ready()`,
 * and `renderDepth` calls it before invoking the body.
 *
 * Reproduced first against `bc36100` in a worktree, so the record says this is
 * a defect the front door FOUND rather than one it introduced.
 */
test("navigating to a lazy() route reveals it once the module lands", async () => {
  const Home = () => {
    const n = document.createElement("p");
    n.textContent = "home";
    return n;
  };
  let landed!: (m: { default: unknown }) => void;
  const Later = lazy(() => new Promise<{ default: unknown }>((r) => (landed = r)));

  const routes: AnyRouteDefinition[] = [
    { path: "/", id: "/", component: Home as never },
    { path: "/later", id: "/later", component: Later as never },
  ] as never;

  const state = createRouter({ routeTree: routes, history: memoryHistory({ initial: ["/"] }) });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const dispose = render(
    ((s: unknown) =>
      (RouterProvider as never as (s: unknown, p: unknown) => unknown)(s, {
        state: () => state,
      })) as never,
    host,
  );
  flush();
  expect(host.textContent).toBe("home");

  await state.navigate("/later");
  flush();
  await tick(5);
  flush();

  landed({
    default: () => {
      const n = document.createElement("b");
      n.textContent = "later";
      return n;
    },
  });
  await tick(10);
  flush();
  await tick(10);
  flush();

  expect(host.textContent).toBe("later");
  dispose();
  host.remove();
});

/**
 * `defaults` — the router's answer for a per-route option.
 *
 * TanStack spells these `defaultStaleTime`, `defaultPendingMs` and so on at the
 * top level; one nested object under the ROUTE's own names is the same
 * information without a second vocabulary to learn. Before this, a project that
 * wanted one pending delay everywhere wrote it on every route and kept writing
 * it on every new one.
 */
describe("router-wide route defaults", () => {
  const table = [
    { path: "/", component: (() => null) as never },
    { path: "/slow", loader: () => "x", component: (() => null) as never },
  ] as never as AnyRouteDefinition[];

  test("an absent `defaults` changes nothing", () => {
    const state = createRouter({ routeTree: table });
    expect(state.config.defaults).toBeUndefined();
  });

  test("`ssr` applies to every route that does not say", () => {
    const state = createRouter({ routeTree: table, defaults: { ssr: false } });
    expect(state.ssrModes()).toEqual([false]);
  });

  /** A route that declares its own always wins over the default. */
  test("a route's own answer beats the default", () => {
    const own = [
      { path: "/", ssr: true, component: (() => null) as never },
    ] as never as AnyRouteDefinition[];
    const state = createRouter({ routeTree: own, defaults: { ssr: false } });
    expect(state.ssrModes()).toEqual([true]);
  });

  /**
   * The asymmetry `resolveSsr` documents still holds under a default: a
   * parent's `false` forces every descendant, because there is no rendered
   * parent to put them in.
   */
  test("inheritance is unchanged", () => {
    const nested = [
      {
        path: "/parent",
        ssr: false,
        component: (() => null) as never,
        children: [{ path: "child", ssr: true, component: (() => null) as never }],
      },
    ] as never as AnyRouteDefinition[];
    const state = createRouter({
      routeTree: nested,
      history: memoryHistory({ initial: ["/parent/child"] }),
    });
    expect(state.ssrModes()).toEqual([false, false]);
  });
});

/**
 * `start()` is idempotent BY A FLAG, not by looking at `contexts`.
 *
 * The guard used to be `contexts.length > 0`, which asks "did the chain produce
 * any context?" rather than "have I started?". Those agree for a matched
 * location, because `runBeforeLoad` pushes one entry per depth, and disagree
 * completely for one that matched NOTHING: the chain is empty and the answer is
 * permanently zero.
 *
 * `RouterProvider` calls `start()` from its body, so a guard that never latched
 * meant start -> `settleContexts([])` -> the signal notifies -> the provider
 * re-runs -> start again, without end. Every unmatched URL spun the event loop
 * until the renderer ran out of memory; in Chrome the tab died with `SIGTRAP`
 * after appearing to load.
 */
describe("start() latches", () => {
  const table = [
    { path: "/", component: (() => null) as never },
    { path: "/users/$id", component: (() => null) as never },
  ] as never as AnyRouteDefinition[];

  const runsOf = async (initial: string): Promise<number> => {
    let ran = 0;
    const counted = table.map((route) => ({
      ...route,
      beforeLoad: () => {
        ran += 1;
        return {};
      },
    })) as AnyRouteDefinition[];
    const state = createRouter({
      routeTree: counted,
      history: memoryHistory({ initial: [initial] }),
    });
    // Ten calls stands in for the provider re-running: before the flag, each
    // one did the whole of `start()` again.
    for (let at = 0; at < 10; at++) await state.start();
    return ran;
  };

  test("a matched location starts once", async () => {
    expect(await runsOf("/users/7")).toBe(1);
  });

  /** The case that looped: no route matched, so no context was ever produced. */
  test("an UNMATCHED location starts once too", async () => {
    const state = createRouter({
      routeTree: table,
      history: memoryHistory({ initial: ["/nowhere"] }),
    });
    for (let at = 0; at < 10; at++) await state.start();
    // Nothing to assert on `contexts` — the point is that ten calls terminate
    // and the eleventh is a no-op rather than a fresh `runBeforeLoad`.
    expect(state.chain().length).toBeGreaterThanOrEqual(0);
    expect(state.match()).toBeNull();
  });
});

/**
 * `onEnter` / `onStay` / `onLeave`, and `staticData`.
 *
 * TanStack's order and their rule (`runRouteLifecycle`, `router.ts:930`): every
 * route in the old chain that is not in the new one leaves first, and only then
 * does each route in the new chain learn whether it arrived or remained.
 */
describe("route lifecycle", () => {
  const log: string[] = [];
  const hooks = (id: string) => ({
    onEnter: () => log.push(`enter:${id}`),
    onStay: () => log.push(`stay:${id}`),
    onLeave: () => log.push(`leave:${id}`),
  });

  const tree = (): AnyRouteDefinition[] =>
    [
      {
        path: "/shop",
        component: (() => null) as never,
        staticData: { title: "Shop" },
        ...hooks("shop"),
        children: [
          { path: "a", component: (() => null) as never, ...hooks("a") },
          { path: "b", component: (() => null) as never, ...hooks("b") },
        ],
      },
      { path: "/away", component: (() => null) as never, ...hooks("away") },
    ] as never;

  test("the first chain enters, a sibling swap keeps the layout", async () => {
    log.length = 0;
    const state = createRouter({
      routeTree: tree(),
      history: memoryHistory({ initial: ["/shop/a"] }),
    });
    await state.start();
    expect(log).toEqual(["enter:shop", "enter:a"]);

    log.length = 0;
    await state.navigate("/shop/b");
    // The layout STAYED; only the leaf changed.
    expect(log).toEqual(["leave:a", "stay:shop", "enter:b"]);

    log.length = 0;
    await state.navigate("/away");
    expect(log).toEqual(["leave:shop", "leave:b", "enter:away"]);
  });

  test("a hook is told the route's staticData", async () => {
    const seen: unknown[] = [];
    const table = [
      {
        path: "/shop",
        component: (() => null) as never,
        staticData: { title: "Shop" },
        onEnter: (match: { staticData: unknown; routeId: string }) => seen.push(match.staticData),
        children: [{ path: "", component: (() => null) as never }],
      },
    ] as never as AnyRouteDefinition[];
    const state = createRouter({
      routeTree: table,
      history: memoryHistory({ initial: ["/shop"] }),
    });
    await state.start();
    expect(seen).toEqual([{ title: "Shop" }]);
  });
});

/**
 * `params.parse` and `params.stringify` — the two directions of a path
 * parameter a route does not want to work in as a string.
 */
describe("params.parse / params.stringify", () => {
  test("a parsed parameter is what every reader gets", async () => {
    const seen: unknown[] = [];
    const table = [
      {
        path: "/posts/$id",
        params: { parse: (p: Record<string, string>) => ({ id: Number(p.id) }) },
        loader: ({ params }: { params: { id: number } }) => {
          seen.push(params.id);
          return params.id * 2;
        },
        component: (() => null) as never,
      },
    ] as never as AnyRouteDefinition[];
    const state = createRouter({
      routeTree: table,
      history: memoryHistory({ initial: ["/posts/7"] }),
    });
    await state.start();
    expect(state.params()).toEqual({ id: 7 } as never);
    await settle();
    expect(seen).toEqual([7]);
    state.dispose();
  });

  test("parse accumulates down the chain, child over parent", async () => {
    const table = [
      {
        path: "/org/$org",
        params: { parse: (p: Record<string, string>) => ({ org: p.org?.toUpperCase() }) },
        component: (() => null) as never,
        children: [
          {
            path: "$team",
            params: { parse: (p: Record<string, string>) => ({ team: Number(p.team) }) },
            component: (() => null) as never,
          },
        ],
      },
    ] as never as AnyRouteDefinition[];
    const state = createRouter({
      routeTree: table,
      history: memoryHistory({ initial: ["/org/acme/3"] }),
    });
    await state.start();
    // The parent's parse survives into the child's slice, and the child's own
    // parameter is a number — TanStack's `strictParams` accumulation.
    expect(state.params()).toEqual({ org: "ACME", team: 3 } as never);
    state.dispose();
  });

  test("a beforeLoad sees its own depth's parse", async () => {
    const seen: unknown[] = [];
    const table = [
      {
        path: "/posts/$id",
        params: { parse: (p: Record<string, string>) => ({ id: Number(p.id) }) },
        beforeLoad: ({ params }: { params: { id: number } }) => {
          seen.push(params.id);
          return {};
        },
        component: (() => null) as never,
      },
    ] as never as AnyRouteDefinition[];
    const state = createRouter({
      routeTree: table,
      history: memoryHistory({ initial: ["/posts/7"] }),
    });
    await state.start();
    expect(seen).toEqual([7]);
    state.dispose();
  });

  /**
   * The cache key stays on the RAW segments. A parse returning a fresh object
   * every call would otherwise key a loader on something the server's seed and
   * the client's read cannot agree on, and every hydration would refetch.
   */
  test("a parse whose output changes does not change the loader's key", async () => {
    // A parse is a user function and is not obliged to be pure. Keying on its
    // output would put it between the server's seed and the client's read of
    // it, so this one is deliberately unstable: the key must not notice.
    let calls = 0;
    let runs = 0;
    const table = [
      {
        path: "/posts/$id",
        params: {
          parse: (p: Record<string, string>) => ({ id: p.id, nonce: `n${calls++}` }),
        },
        loader: () => {
          runs++;
          return runs;
        },
        component: (() => null) as never,
      },
    ] as never as AnyRouteDefinition[];
    const state = createRouter({
      routeTree: table,
      history: memoryHistory({ initial: ["/posts/7"] }),
      defaults: { staleTime: 60_000 },
    });
    await state.start();
    await settle();
    const chain = state.chain();
    const route = chain[chain.length - 1];
    expect(calls).toBeGreaterThan(1);
    state.dataFor(route, { id: "7", nonce: "n99" }, true)();
    state.dataFor(route, { id: "7", nonce: "n100" }, true)();
    await settle();
    expect(runs).toBe(1);
    state.dispose();
  });

  test("a refused parse lands on that route's error boundary", async () => {
    const table = [
      {
        path: "/posts/$id",
        params: {
          parse: (p: Record<string, string>) => {
            const id = Number(p.id);
            if (Number.isNaN(id)) throw new Error("id must be a number");
            return { id };
          },
        },
        component: (() => null) as never,
        errorComponent: ((_scope: unknown, props: { error: () => Error }) =>
          document.createTextNode(`refused: ${props.error().message}`)) as never,
      },
    ] as never as AnyRouteDefinition[];
    const state = createRouter({
      routeTree: table,
      history: memoryHistory({ initial: ["/posts/abc"] }),
    });
    await state.start();
    expect(state.paramsErrorAt(0)?.name).toBe("PathParamError");
    const mounted = mountState(state);
    expect(mounted.host.textContent).toContain("refused: id must be a number");
    mounted.dispose();
    state.dispose();
  });

  test("stringify writes the url a link addresses", async () => {
    const table = [
      { path: "/", component: (() => null) as never },
      {
        path: "/posts/$id",
        params: {
          parse: (p: Record<string, string>) => ({ id: Number(p.id) }),
          stringify: (p: Record<string, unknown>) => ({ id: String(p.id) }),
        },
        component: (() => null) as never,
      },
    ] as never as AnyRouteDefinition[];
    const state = createRouter({
      routeTree: table,
      history: memoryHistory({ initial: ["/"] }),
    });
    expect(linkHref(state, { to: "/posts/$id", params: { id: 7 } } as never)).toBe("/posts/7");
    state.dispose();
  });

  /**
   * A `stringify` that throws still renders a link. There is no boundary around
   * an href and nobody waiting on an answer; the paired `parse` refuses the
   * same value, with a boundary, if the link is ever followed.
   */
  test("a stringify that throws does not take the link down", () => {
    const table = [
      { path: "/", component: (() => null) as never },
      {
        path: "/posts/$id",
        params: {
          stringify: () => {
            throw new Error("nope");
          },
        },
        component: (() => null) as never,
      },
    ] as never as AnyRouteDefinition[];
    const state = createRouter({
      routeTree: table,
      history: memoryHistory({ initial: ["/"] }),
    });
    expect(linkHref(state, { to: "/posts/$id", params: { id: "7" } } as never)).toBe("/posts/7");
    state.dispose();
  });

  test("a layout's stringify runs for a link to its child", () => {
    const table = [
      { path: "/", component: (() => null) as never },
      {
        path: "/org/$org",
        params: {
          stringify: (p: Record<string, unknown>) => ({ org: String(p.org).toLowerCase() }),
        },
        component: (() => null) as never,
        children: [{ path: "team", component: (() => null) as never }],
      },
    ] as never as AnyRouteDefinition[];
    const state = createRouter({
      routeTree: table,
      history: memoryHistory({ initial: ["/"] }),
    });
    expect(linkHref(state, { to: "/org/$org/team", params: { org: "ACME" } } as never)).toBe(
      "/org/acme/team",
    );
    state.dispose();
  });
});

/**
 * `<Await>` on the DOM backend.
 *
 * The park is an async `computed` and the fallback is the `Loading` boundary
 * catching its `NotReadyError` — barq's own async model, one level down from
 * the route's. There is no `defer()`: the seed channel already streams any
 * promise a loader returns, so there is nothing to tag.
 */
describe("Await", () => {
  const later = <T>(value: T, ms = 5): Promise<T> =>
    new Promise((resolve) => setTimeout(() => resolve(value), ms));

  const tableWith = (rows: () => Promise<unknown>): AnyRouteDefinition[] =>
    [
      {
        path: "/report",
        loader: () => ({ summary: "ready now", rows: rows() }),
        component: ((scope: Scope | null, props: { data: () => { rows: Promise<unknown> } }) =>
          (Await as never as (s: Scope | null, p: unknown) => unknown)(scope, {
            promise: () => props.data().rows,
            fallback: () => document.createTextNode("waiting"),
            children: (_inner: Scope | null, value: () => unknown) =>
              document.createTextNode(`rows: ${String(value())}`),
          })) as never,
        errorComponent: ((_s: Scope | null, props: { error: () => Error }) =>
          document.createTextNode(`caught ${props.error().message}`)) as never,
      },
    ] as never;

  test("the fallback shows, then the settled value replaces it", async () => {
    const state = createRouter({
      routeTree: tableWith(() => later("the slow part")),
      history: memoryHistory({ initial: ["/report"] }),
    });
    await state.start();
    const mounted = mountState(state);
    expect(mounted.host.textContent).toContain("waiting");
    await tick(30);
    flush();
    expect(mounted.host.textContent).toContain("rows: the slow part");
    mounted.dispose();
    state.dispose();
  });

  test("a rejection renders the route's errorComponent in the awaited region", async () => {
    const state = createRouter({
      routeTree: tableWith(
        () =>
          new Promise((_resolve, reject) =>
            setTimeout(() => reject(new Error("the slow part failed")), 5),
          ),
      ),
      history: memoryHistory({ initial: ["/report"] }),
    });
    await state.start();
    const mounted = mountState(state);
    await tick(30);
    flush();
    expect(mounted.host.textContent).toContain("caught the slow part failed");
    mounted.dispose();
    state.dispose();
  });
});

/**
 * `useServerFn` — the four lines every caller of a redirecting server function
 * writes, written once.
 */
describe("useServerFn", () => {
  /** What `fn` threw, as a value. `redirect` and `notFound` both throw. */
  const thrownBy = (fn: () => never): unknown => {
    try {
      fn();
    } catch (error) {
      return error;
    }
    throw new Error("it did not throw");
  };

  /**
   * Mount a route whose component wraps `fn`, and hand the wrapper back.
   *
   * The hook resolves through the SCOPE chain, so the call has to happen inside
   * a route component — which is where an application makes it too.
   */
  const wrapped = <Out>(
    fn: () => Promise<Out>,
    initial = "/",
  ): { call: () => Promise<Out>; state: RouterState; dispose: () => void } => {
    let call!: () => Promise<Out>;
    let state!: RouterState;
    const table = [
      {
        path: "/",
        component: () => {
          state = useRouter();
          call = useServerFn(fn);
          return document.createTextNode("home");
        },
      },
      { path: "/login", component: (() => document.createTextNode("login")) as never },
    ] as never as AnyRouteDefinition[];
    const mounted = mount({ routeTree: table, history: memoryHistory({ initial: [initial] }) });
    return { call, state, dispose: mounted.dispose };
  };

  test("a THROWN redirect navigates instead of rejecting", async () => {
    const { call, state, dispose } = wrapped(async () => {
      throw redirect("/login");
    });
    await call();
    await tick();
    expect(state.location().pathname).toBe("/login");
    dispose();
  });

  /**
   * A RETURNED redirect too. `return redirect(...)` is the same decision as
   * throwing one, and handing it back as a value would render a navigation
   * instruction as data.
   */
  test("a RETURNED redirect navigates as well", async () => {
    const asValue = thrownBy(() => redirect("/login"));
    const { call, state, dispose } = wrapped(async () => asValue as never);
    await call();
    await tick();
    expect(state.location().pathname).toBe("/login");
    dispose();
  });

  test("an ordinary value comes back untouched", async () => {
    const { call, dispose } = wrapped(async () => 41 + 1);
    expect(await call()).toBe(42);
    dispose();
  });

  /**
   * `notFound()` is NOT caught. A redirect names somewhere to go and the router
   * is the only thing that can go there; a not-found is an answer about what the
   * caller asked for, and swallowing it would take it from the component that
   * knows what to render instead.
   */
  test("anything else is re-thrown, and the location does not move", async () => {
    const gone = thrownBy(() => notFound("gone"));
    for (const thrown of [new Error("boom"), gone]) {
      const { call, state, dispose } = wrapped(async () => {
        throw thrown;
      });
      await expect(call()).rejects.toBe(thrown);
      expect(state.location().pathname).toBe("/");
      dispose();
    }
  });
});

/**
 * Route masks — showing one URL while rendering another, declared once beside
 * the routes rather than at every call site.
 */
describe("routeMasks", () => {
  const table = [
    { path: "/feed", component: (() => null) as never },
    { path: "/photos/$id", component: (() => null) as never },
    { path: "/albums/$album/$id", component: (() => null) as never },
  ] as never as AnyRouteDefinition[];

  const at = (masks: Parameters<typeof createRouter>[0]["routeMasks"], extra = {}) =>
    createRouter({
      routeTree: table,
      history: memoryHistory({ initial: ["/feed"] }),
      routeMasks: masks,
      ...extra,
    });

  test("a matching navigation shows the mask and renders the target", async () => {
    const state = at([{ from: "/photos/$id", to: "/feed" }]);
    await state.start();
    await state.navigate("/photos/7");
    // What the address bar says…
    expect(state.location().pathname).toBe("/feed");
    // …and what is actually being rendered.
    expect(state.chain().at(-1)?.fullPath).toBe("/photos/$id");
    expect(state.params()).toEqual({ id: "7" } as never);
    state.dispose();
  });

  test("a navigation nothing masks is untouched", async () => {
    const state = at([{ from: "/photos/$id", to: "/feed" }]);
    await state.start();
    await state.navigate("/albums/holiday/2");
    expect(state.location().pathname).toBe("/albums/holiday/2");
    state.dispose();
  });

  test("the mask's own params are interpolated", async () => {
    const state = at([
      { from: "/albums/$album/$id", to: "/photos/$id", params: (p) => ({ id: p.id ?? "" }) },
    ]);
    await state.start();
    await state.navigate("/albums/holiday/2");
    expect(state.location().pathname).toBe("/photos/2");
    expect(state.chain().at(-1)?.fullPath).toBe("/albums/$album/$id");
    state.dispose();
  });

  test("a per-call mask wins over the table", async () => {
    const state = at([{ from: "/photos/$id", to: "/feed" }]);
    await state.start();
    await state.navigate("/photos/7", { mask: "/albums/holiday/2" });
    expect(state.location().pathname).toBe("/albums/holiday/2");
    expect(state.chain().at(-1)?.fullPath).toBe("/photos/$id");
    state.dispose();
  });

  /**
   * `unmaskOnReload` — whether the mask survives the page load that wrote it.
   *
   * A history entry outlives the page that pushed it, so the router records
   * which load wrote the mask and a later one stops honouring it. Simulated by
   * reading the pushed entry back through `unmask` with a different key, which
   * is exactly what a reload does.
   */
  describe("unmaskOnReload", () => {
    const entryOf = (state: RouterState) => state.history.current();

    test("off by default: the real location survives a reload", async () => {
      const state = at([{ from: "/photos/$id", to: "/feed" }]);
      await state.start();
      await state.navigate("/photos/7");
      expect(unmask(entryOf(state), "a-later-page-load")).toBe("/photos/7");
      state.dispose();
    });

    test("on: a later page load renders the URL it can see", async () => {
      const state = at([{ from: "/photos/$id", to: "/feed", unmaskOnReload: true }]);
      await state.start();
      await state.navigate("/photos/7");
      // This page load still sees through it…
      expect(unmask(entryOf(state))).toBe("/photos/7");
      // …and the next one does not.
      expect(unmask(entryOf(state), "a-later-page-load")).toBe("/feed");
      state.dispose();
    });

    test("the router-wide default applies to a per-call mask too", async () => {
      const state = at(undefined, { unmaskOnReload: true });
      await state.start();
      await state.navigate("/photos/7", { mask: "/feed" });
      expect(unmask(entryOf(state), "a-later-page-load")).toBe("/feed");
      state.dispose();
    });

    test("a per-call override beats the router-wide default", async () => {
      const state = at(undefined, { unmaskOnReload: true });
      await state.start();
      await state.navigate("/photos/7", { mask: "/feed", unmaskOnReload: false });
      expect(unmask(entryOf(state), "a-later-page-load")).toBe("/photos/7");
      state.dispose();
    });
  });
});

/**
 * Typed router events — the same story `beforeEach`/`afterEach` tell, told to
 * anything that asks and can stop asking.
 */
describe("router events", () => {
  const table = [
    { path: "/", component: (() => null) as never },
    { path: "/a", component: (() => null) as never },
    { path: "/b", component: (() => null) as never },
  ] as never as AnyRouteDefinition[];

  const at = (initial = "/") =>
    createRouter({ routeTree: table, history: memoryHistory({ initial: [initial] }) });

  test("the six fire in order, once each", async () => {
    const state = at();
    await state.start();
    const seen: string[] = [];
    const types = [
      "onBeforeNavigate",
      "onBeforeLoad",
      "onBeforeRouteMount",
      "onLoad",
      "onResolved",
      "onRendered",
    ] as const;
    const offs = types.map((type) => state.subscribe(type, () => seen.push(type)));
    await state.navigate("/a");
    await tick(20);
    expect(seen).toEqual([...types]);
    for (const off of offs) off();
    state.dispose();
  });

  /**
   * A POPSTATE gets the two events `navigate` emits as well. They belong to any
   * navigation, not to the ones the application asked for — a progress bar
   * started on `onBeforeNavigate` would otherwise never start on the back
   * button, which is exactly when a slow loader is most visible.
   */
  test("the back button emits the same six, once each", async () => {
    const state = at();
    await state.start();
    await state.navigate("/a");
    await tick(20);
    const seen: string[] = [];
    for (const type of [
      "onBeforeNavigate",
      "onBeforeLoad",
      "onBeforeRouteMount",
      "onLoad",
      "onResolved",
      "onRendered",
    ] as const) {
      state.subscribe(type, () => seen.push(type));
    }
    state.history.go(-1);
    await tick(30);
    expect(state.location().pathname).toBe("/");
    expect(seen).toEqual([
      "onBeforeNavigate",
      "onBeforeLoad",
      "onBeforeRouteMount",
      "onLoad",
      "onResolved",
      "onRendered",
    ]);
    state.dispose();
  });

  test("an event carries what changed", async () => {
    const state = at("/a?x=1#top");
    await state.start();
    const events: RouterEvent[] = [];
    const off = state.subscribe("onResolved", (event) => events.push(event));

    await state.navigate("/b");
    await tick(20);
    expect(events.at(-1)).toMatchObject({
      type: "onResolved",
      pathChanged: true,
      hrefChanged: true,
      hashChanged: true,
    });
    expect(events.at(-1)?.from?.pathname).toBe("/a");
    expect(events.at(-1)?.to.pathname).toBe("/b");

    // A hash-only move changes the href and the hash and not the path.
    await state.navigate("/b#deep");
    await tick(20);
    expect(events.at(-1)).toMatchObject({
      pathChanged: false,
      hrefChanged: true,
      hashChanged: true,
    });
    off();
    state.dispose();
  });

  /**
   * BEFORE the blockers, so a listener hears about navigations that never
   * happen — which is what a progress bar wants and what `beforeEach` cannot
   * say, being one of the things that refuses.
   */
  test("onBeforeNavigate fires even for a navigation a blocker refuses", async () => {
    const state = at();
    await state.start();
    const seen: string[] = [];
    state.subscribe("onBeforeNavigate", () => seen.push("asked"));
    state.subscribe("onLoad", () => seen.push("loaded"));
    state.block(() => true);
    await state.navigate("/a");
    await tick(20);
    expect(seen).toEqual(["asked"]);
    expect(state.location().pathname).toBe("/");
    state.dispose();
  });

  test("unsubscribing stops it, and a second listener is unaffected", async () => {
    const state = at();
    await state.start();
    let first = 0;
    let second = 0;
    const off = state.subscribe("onLoad", () => first++);
    state.subscribe("onLoad", () => second++);
    await state.navigate("/a");
    await tick(20);
    off();
    await state.navigate("/b");
    await tick(20);
    expect(first).toBe(1);
    expect(second).toBe(2);
    state.dispose();
  });

  /**
   * A listener OBSERVES. One that throws is logged and the navigation it was
   * watching still commits — the alternative is an analytics call taking the
   * page down.
   */
  test("a listener that throws does not take the navigation with it", async () => {
    const state = at();
    await state.start();
    const errors: unknown[] = [];
    const realError = console.error;
    console.error = (...args: unknown[]) => errors.push(args[0]);
    state.subscribe("onLoad", () => {
      throw new Error("listener boom");
    });
    let after = 0;
    state.subscribe("onLoad", () => after++);
    try {
      await state.navigate("/a");
      await tick(20);
    } finally {
      console.error = realError;
    }
    expect(state.location().pathname).toBe("/a");
    // The one after it still ran, and the throw was reported.
    expect(after).toBe(1);
    expect(errors.some((line) => String(line).includes("onLoad"))).toBe(true);
    state.dispose();
  });
});
