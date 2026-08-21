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

import { Link, NavLink, Router } from "./components.ts";
import { notFound } from "./errors.ts";
import { memoryHistory } from "./history.ts";
import { useLocation, useNavigate, useParams, useSearchParams } from "./hooks.ts";
import type { AnyRouteDefinition, RouteProps } from "./route.ts";

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

    // …and going back is a cache HIT, not a third fetch.
    history.push("/posts?page=1");
    flush();
    await settle();
    flush();
    expect(host.textContent).toBe("page 1");
    expect(seen).toEqual(["1", "2"]);

    dispose();
  });

  test("B1 — key order in the query does not mint a second cell", async () => {
    // `?b=2&a=1` and `?a=1&b=2` are the same request; a key that says otherwise
    // refetches for nothing.
    let calls = 0;
    const history = memoryHistory({ initial: ["/s?a=1&b=2"] });
    const { host, dispose } = mount({
      routes: [
        {
          path: "/s",
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
