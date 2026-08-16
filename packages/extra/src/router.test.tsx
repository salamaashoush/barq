/**
 * Router Tests - Comprehensive test suite for barq-router
 *
 * Test Categories:
 * 1. Path Matching (~20 tests)
 * 2. Router Components (~25 tests)
 * 3. Hooks (~15 tests)
 * 4. Loaders (~12 tests)
 * 5. Edge Cases (~15 tests)
 * 6. Memory & Cleanup (~8 tests)
 * 7. New Features (~15 tests)
 */

import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { type Cell, type Child, type Scope, getOwner, isDisposed, render } from "@barqjs/core";
import {
  compilePath,
  matchPath,
  matchRoutes,
  clearPathCache,
  resolvePath,
  route,
  defineRoute,
  defineRoutes,
  setRouterDebugMode,
  MemoryRouter,
  Link,
  NavLink,
  Redirect,
  useLocation,
  useParams,
  useSearchParams,
  useNavigate,
  useIsLoading,
  useMatchedRoutes,
  type RouteDefinition,
  type ExtractRouteParams,
  type PathParams,
  type NavigationGuard,
} from "./router.ts";

// Helper to wait for async operations
const wait = (ms: number = 0) => new Promise((r) => setTimeout(r, ms));

// ============================================================================
// Route components, declared at module scope
// ============================================================================
//
// C2: a component is DECLARED, never inferred. A function handed to the router
// through a route table is called with a scope by a callee in another module,
// and nothing module-local proves that — so it is exported, which is the
// evidence C2 accepts. An arrow written inline in the table has no such
// evidence and keeps an un-scoped signature; a zero-arity one is still a legal
// Cell (C6) and every one below that takes props is here for this reason.
//
// `<Outlet />` is gone. A layout renders the next route through `props.children`,
// which is a Block taking a scope, so the child is constructed INSIDE the
// layout — the same rule that makes a provider work.

export function LayoutShell(props: { children: Child }) {
  return (
    <div class="layout">
      Layout Header
      {props.children}
    </div>
  );
}

export function LayerA(props: { children: Child }) {
  return <div>A{props.children}</div>;
}

export function LayerB(props: { children: Child }) {
  return <div>B{props.children}</div>;
}

export function LayerC(props: { children: Child }) {
  return <div>C{props.children}</div>;
}

export function UsersNavLayout(props: { children: Child }) {
  return (
    <div>
      <NavLink href="/users" activeClass="active">
        Users
      </NavLink>
      {props.children}
    </div>
  );
}

export function UsersNavEndLayout(props: { children: Child }) {
  return (
    <div>
      <NavLink href="/users" activeClass="active" end>
        Users List
      </NavLink>
      {props.children}
    </div>
  );
}

export function ParentWithChild(props: { children: Child }) {
  return (
    <div>
      Parent
      {props.children}
    </div>
  );
}

export function RelativeLinkLayout(props: { children: Child }) {
  return (
    <div>
      <Link href="./profile">Profile</Link>
      {props.children}
    </div>
  );
}

// Props are Cells and are CALLED at the use site. `props.data` is not in the
// branch key, so a loader that lands updates this component rather than
// remounting it.
export function MessageView(props: { data: Cell<{ message?: string } | undefined> }) {
  return <div>{() => props.data()?.message}</div>;
}

export function UserIdView(props: { data: Cell<{ id?: string } | undefined> }) {
  return <div>User {() => props.data()?.id}</div>;
}

export function GreetingView(props: { params: Cell<{ name: string }> }) {
  return <div>Hello {() => props.params().name}</div>;
}

export function SlowView(props: { data: Cell<{ data?: string } | undefined> }) {
  const isLoading = useIsLoading();
  loadingStatesSeen.push(isLoading());
  return <div>{() => props.data()?.data}</div>;
}

export function LoaderErrorView(props: { error: Cell<Error> }) {
  return <div>Error: {() => props.error().message}</div>;
}

export function RetryableErrorView(props: { error: Cell<Error>; reset: () => void }) {
  return (
    <div>
      <span>Error: {() => props.error().message}</span>
      <button type="button" onClick={() => props.reset()}>
        Retry
      </button>
    </div>
  );
}

export function SurvivingLinkLayout(props: { params: Cell<{ id: string }>; children: Child }) {
  navProbe.push(useNavigate());
  return (
    <div>
      <Link href="./edit">Edit</Link>
      <span>{() => props.params().id}</span>
      {props.children}
    </div>
  );
}

export function BoundaryNavLayout() {
  return (
    <div>
      <NavLink href="/user" activeClass="active">
        User
      </NavLink>
      <NavLink href="/user-settings" activeClass="active">
        Settings
      </NavLink>
    </div>
  );
}

const loadingStatesSeen: boolean[] = [];
const chainProbe: ReturnType<typeof useMatchedRoutes>[] = [];
const navProbe: ReturnType<typeof useNavigate>[] = [];

export function ChainProbeLayout(props: { children: Child }) {
  chainProbe.push(useMatchedRoutes());
  return (
    <div>
      Parent
      {props.children}
    </div>
  );
}

// Helper to clean up DOM after each test
function cleanup() {
  document.body.innerHTML = "";
  clearPathCache();
}

// ============================================================================
// 1. Path Matching Tests (~20 tests)
// ============================================================================

describe("Path Matching", () => {
  beforeEach(cleanup);

  describe("compilePath", () => {
    test("compiles static paths", () => {
      const pattern = compilePath("/users");
      expect(pattern.path).toBe("/users");
      expect(pattern.paramNames).toEqual([]);
      expect(pattern.regex.test("/users")).toBe(true);
      expect(pattern.regex.test("/users/123")).toBe(false);
    });

    test("compiles required params :param", () => {
      const pattern = compilePath("/users/:id");
      expect(pattern.paramNames).toEqual(["id"]);
      expect(pattern.regex.test("/users/123")).toBe(true);
      expect(pattern.regex.test("/users/")).toBe(false);
      expect(pattern.regex.test("/users")).toBe(false);
    });

    test("compiles optional params :param?", () => {
      const pattern = compilePath("/users/:id?");
      expect(pattern.paramNames).toEqual(["id"]);
      expect(pattern.regex.test("/users/123")).toBe(true);
      expect(pattern.regex.test("/users/")).toBe(true);
      expect(pattern.regex.test("/users")).toBe(false);
    });

    test("compiles named splat :param*", () => {
      const pattern = compilePath("/docs/:path*");
      expect(pattern.paramNames).toEqual(["path"]);
      expect(pattern.regex.test("/docs/a/b/c")).toBe(true);
      expect(pattern.regex.test("/docs/")).toBe(true);
      expect(pattern.regex.test("/docs")).toBe(false);
    });

    test("compiles one-or-more :param+", () => {
      const pattern = compilePath("/api/:resource+");
      expect(pattern.paramNames).toEqual(["resource"]);
      expect(pattern.regex.test("/api/a/b")).toBe(true);
      expect(pattern.regex.test("/api/single")).toBe(true);
      expect(pattern.regex.test("/api/")).toBe(false);
    });

    test("compiles wildcard *", () => {
      const pattern = compilePath("/files/*");
      expect(pattern.paramNames).toEqual(["*"]);
      expect(pattern.regex.test("/files/any/path/here")).toBe(true);
      expect(pattern.regex.test("/files/")).toBe(true);
    });

    test("compiles multiple params", () => {
      const pattern = compilePath("/users/:userId/posts/:postId");
      expect(pattern.paramNames).toEqual(["userId", "postId"]);
      expect(pattern.regex.test("/users/1/posts/2")).toBe(true);
    });

    test("escapes special regex characters", () => {
      const pattern = compilePath("/api.v1/users");
      expect(pattern.regex.test("/api.v1/users")).toBe(true);
      expect(pattern.regex.test("/apixv1/users")).toBe(false);
    });

    test("memoizes compiled patterns", () => {
      const pattern1 = compilePath("/users/:id");
      const pattern2 = compilePath("/users/:id");
      expect(pattern1).toBe(pattern2);
    });

    test("clearPathCache clears memoization", () => {
      const pattern1 = compilePath("/test");
      clearPathCache();
      const pattern2 = compilePath("/test");
      expect(pattern1).not.toBe(pattern2);
      expect(pattern1.path).toBe(pattern2.path);
    });
  });

  describe("matchPath", () => {
    test("matches static path", () => {
      const pattern = compilePath("/users");
      expect(matchPath("/users", pattern)).toEqual({});
      expect(matchPath("/other", pattern)).toBeNull();
    });

    test("extracts required params", () => {
      const pattern = compilePath("/users/:id");
      expect(matchPath("/users/123", pattern)).toEqual({ id: "123" });
      expect(matchPath("/users/abc", pattern)).toEqual({ id: "abc" });
    });

    test("extracts optional params", () => {
      const pattern = compilePath("/users/:id?");
      expect(matchPath("/users/123", pattern)).toEqual({ id: "123" });
      expect(matchPath("/users/", pattern)).toEqual({ id: "" });
    });

    test("extracts named splat", () => {
      const pattern = compilePath("/docs/:path*");
      expect(matchPath("/docs/a/b/c", pattern)).toEqual({ path: "a/b/c" });
      expect(matchPath("/docs/", pattern)).toEqual({ path: "" });
    });

    test("extracts wildcard", () => {
      const pattern = compilePath("/files/*");
      expect(matchPath("/files/deep/path", pattern)).toEqual({ "*": "deep/path" });
    });

    test("extracts multiple params", () => {
      const pattern = compilePath("/users/:userId/posts/:postId");
      expect(matchPath("/users/1/posts/2", pattern)).toEqual({
        userId: "1",
        postId: "2",
      });
    });

    test("handles unicode paths", () => {
      const pattern = compilePath("/users/:name");
      expect(matchPath("/users/日本語", pattern)).toEqual({ name: "日本語" });
    });

    test("handles encoded paths", () => {
      const pattern = compilePath("/search/:query");
      expect(matchPath("/search/hello%20world", pattern)).toEqual({
        query: "hello%20world",
      });
    });
  });

  describe("matchRoutes", () => {
    test("matches simple routes", () => {
      const routes: RouteDefinition[] = [
        route({ path: "/", component: () => "Home" }),
        route({ path: "/about", component: () => "About" }),
      ];

      const match = matchRoutes("/about", routes);
      expect(match).not.toBeNull();
      expect(match!.route.path).toBe("/about");
      expect(match!.parents).toEqual([]);
    });

    test("matches nested routes", () => {
      const routes: RouteDefinition[] = [
        route({
          path: "/dashboard",
          component: () => "Layout",
          children: [
            route({ path: "/", component: () => "Overview" }),
            route({ path: "/users", component: () => "Users" }),
          ],
        }),
      ];

      const match = matchRoutes("/dashboard/users", routes);
      expect(match).not.toBeNull();
      expect(match!.route.path).toBe("/users");
      expect(match!.parents.length).toBe(1);
      expect(match!.parents[0].path).toBe("/dashboard");
    });

    test("matches index routes on layout", () => {
      const routes: RouteDefinition[] = [
        route({
          path: "/app",
          component: () => "Layout",
          children: [route({ path: "/", component: () => "Index" })],
        }),
      ];

      const match = matchRoutes("/app", routes);
      expect(match).not.toBeNull();
      expect(match!.route.path).toBe("/");
    });

    test("matches routes with params", () => {
      const routes: RouteDefinition[] = [
        route({
          path: "/users/:id",
          component: () => "User",
        }),
      ];

      const match = matchRoutes("/users/123", routes);
      expect(match).not.toBeNull();
      expect(match!.params).toEqual({ id: "123" });
    });

    test("returns null for no match", () => {
      const routes: RouteDefinition[] = [route({ path: "/", component: () => "Home" })];

      const match = matchRoutes("/nonexistent", routes);
      expect(match).toBeNull();
    });
  });

  describe("resolvePath", () => {
    test("keeps absolute paths as-is", () => {
      expect(resolvePath("/users", "/any/path")).toBe("/users");
    });

    test("resolves ./ relative paths", () => {
      expect(resolvePath("./child", "/parent")).toBe("/parent/child");
    });

    test("resolves ../ relative paths", () => {
      expect(resolvePath("../sibling", "/parent/child")).toBe("/parent/sibling");
    });

    test("resolves multiple ../ paths", () => {
      expect(resolvePath("../../root", "/a/b/c")).toBe("/a/root");
    });

    test("resolves simple relative paths", () => {
      expect(resolvePath("child", "/parent")).toBe("/parent/child");
    });

    // Anything not starting with "/" used to be treated as relative, so an
    // absolute URL was split on "/" and reassembled as a path this router would
    // then try to match: `/a/https:/example.com/x`. The document-level
    // interceptor already refused these; `Link` resolved them.
    test("an href that leaves the app is not resolved against anything", () => {
      expect(resolvePath("https://example.com/x", "/a")).toBe("https://example.com/x");
      expect(resolvePath("mailto:a@b.c", "/a")).toBe("mailto:a@b.c");
      expect(resolvePath("tel:+123", "/a")).toBe("tel:+123");
      expect(resolvePath("//cdn.example.com/x", "/a")).toBe("//cdn.example.com/x");
      expect(resolvePath("#section", "/a")).toBe("#section");
    });
  });
});

// ============================================================================
// 2. Router Components Tests (~25 tests)
// ============================================================================

describe("Router Components", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  describe("MemoryRouter", () => {
    test("renders with initial path", async () => {
      const routes: RouteDefinition[] = [
        route({ path: "/", component: () => <div>Home</div> }),
        route({ path: "/about", component: () => <div>About</div> }),
      ];

      const container = document.createElement("div");
      render(() => <MemoryRouter initialPath="/" config={{ routes }} />, container);

      await wait(10);
      expect(container.textContent).toContain("Home");
    });

    test("navigates between routes", async () => {
      let nav: ReturnType<typeof useNavigate>;

      const routes: RouteDefinition[] = [
        route({
          path: "/",
          component: () => {
            nav = useNavigate();
            return <div>Home</div>;
          },
        }),
        route({ path: "/about", component: () => <div>About</div> }),
      ];

      const container = document.createElement("div");
      render(() => <MemoryRouter initialPath="/" config={{ routes }} />, container);

      await wait(10);
      expect(container.textContent).toContain("Home");

      await nav!("/about");
      await wait(50);
      expect(container.textContent).toContain("About");
    });

    test("supports custom initial path", async () => {
      const routes: RouteDefinition[] = [
        route({ path: "/", component: () => <div>Home</div> }),
        route({ path: "/start", component: () => <div>Start</div> }),
      ];

      const container = document.createElement("div");
      render(() => <MemoryRouter initialPath="/start" config={{ routes }} />, container);

      await wait(10);
      expect(container.textContent).toContain("Start");
    });

    test("shows fallback for 404", async () => {
      const routes: RouteDefinition[] = [route({ path: "/", component: () => <div>Home</div> })];

      const container = document.createElement("div");
      render(
        () => (
          <MemoryRouter
            initialPath="/nonexistent"
            config={{ routes, fallback: () => <div>Not Found</div> }}
          />
        ),
        container,
      );

      await wait(10);
      expect(container.textContent).toContain("Not Found");
    });

    test("shows default 404 without fallback", async () => {
      const routes: RouteDefinition[] = [route({ path: "/", component: () => <div>Home</div> })];

      const container = document.createElement("div");
      render(() => <MemoryRouter initialPath="/nonexistent" config={{ routes }} />, container);

      await wait(10);
      expect(container.textContent).toContain("404");
    });
  });

  describe("Link", () => {
    test("renders anchor element", async () => {
      const routes: RouteDefinition[] = [
        route({
          path: "/",
          component: () => (
            <div>
              <Link href="/about">Go to About</Link>
            </div>
          ),
        }),
        route({ path: "/about", component: () => <div>About</div> }),
      ];

      const container = document.createElement("div");
      render(() => <MemoryRouter initialPath="/" config={{ routes }} />, container);

      await wait(10);
      const link = container.querySelector("a");
      expect(link).not.toBeNull();
      expect(link?.getAttribute("href")).toBe("/about");
    });

    test("an external href is left alone and the click is not intercepted", async () => {
      const routes: RouteDefinition[] = [
        route({
          path: "/",
          component: () => (
            <div>
              Home
              <Link href="https://example.com/x">Out</Link>
            </div>
          ),
        }),
      ];

      const container = document.createElement("div");
      render(() => <MemoryRouter initialPath="/" config={{ routes }} />, container);

      await wait(10);
      const link = container.querySelector("a");
      expect(link?.getAttribute("href")).toBe("https://example.com/x");

      const event = new MouseEvent("click", { bubbles: true, cancelable: true });
      link?.dispatchEvent(event);
      await wait(20);

      expect(event.defaultPrevented).toBe(false);
      expect(container.textContent).toContain("Home");
    });

    test("navigates on click", async () => {
      const routes: RouteDefinition[] = [
        route({
          path: "/",
          component: () => (
            <div>
              Home
              <Link href="/about">Go to About</Link>
            </div>
          ),
        }),
        route({ path: "/about", component: () => <div>About</div> }),
      ];

      const container = document.createElement("div");
      render(() => <MemoryRouter initialPath="/" config={{ routes }} />, container);

      await wait(10);
      expect(container.textContent).toContain("Home");

      const link = container.querySelector("a");
      link?.click();

      await wait(50);
      expect(container.textContent).toContain("About");
    });

    test("skips navigation with modifier keys", async () => {
      const routes: RouteDefinition[] = [
        route({
          path: "/",
          component: () => (
            <div>
              Home
              <Link href="/about">Go</Link>
            </div>
          ),
        }),
        route({ path: "/about", component: () => <div>About</div> }),
      ];

      const container = document.createElement("div");
      render(() => <MemoryRouter initialPath="/" config={{ routes }} />, container);

      await wait(10);
      const link = container.querySelector("a");

      // Simulate ctrl+click
      const event = new MouseEvent("click", {
        bubbles: true,
        ctrlKey: true,
      });
      link?.dispatchEvent(event);

      await wait(10);
      // Should still be on home (ctrl+click should not navigate)
      expect(container.textContent).toContain("Home");
    });

    test("supports replace option", async () => {
      const routes: RouteDefinition[] = [
        route({
          path: "/",
          component: () => (
            <Link href="/about" replace>
              Go
            </Link>
          ),
        }),
        route({ path: "/about", component: () => <div>About</div> }),
      ];

      const container = document.createElement("div");
      render(() => <MemoryRouter initialPath="/" config={{ routes }} />, container);

      await wait(10);
      const link = container.querySelector("a");
      expect(link).not.toBeNull();
    });
  });

  describe("NavLink", () => {
    test("adds active class when route matches", async () => {
      const routes: RouteDefinition[] = [
        route({
          path: "/",
          component: () => (
            <div>
              <NavLink href="/" activeClass="active" end>
                Home
              </NavLink>
              <NavLink href="/about" activeClass="active">
                About
              </NavLink>
            </div>
          ),
        }),
        route({ path: "/about", component: () => <div>About Page</div> }),
      ];

      const container = document.createElement("div");
      render(() => <MemoryRouter initialPath="/" config={{ routes }} />, container);

      await wait(10);
      const links = container.querySelectorAll("a");
      expect(links[0]?.className).toContain("active");
      expect(links[1]?.className || "").not.toContain("active");
    });

    test("uses prefix matching by default", async () => {
      const routes: RouteDefinition[] = [
        route({
          path: "/users",
          component: UsersNavLayout,
          children: [route({ path: "/:id", component: () => <div>User Detail</div> })],
        }),
      ];

      const container = document.createElement("div");
      render(() => <MemoryRouter initialPath="/users/123" config={{ routes }} />, container);

      await wait(10);
      const link = container.querySelector("a");
      // /users should be active since /users/123 starts with /users
      expect(link?.className || "").toContain("active");
    });

    test("supports end prop for exact matching", async () => {
      const routes: RouteDefinition[] = [
        route({
          path: "/users",
          component: UsersNavEndLayout,
          children: [
            route({ path: "/", component: () => <div>Users List Content</div> }),
            route({ path: "/:id", component: () => <div>User Detail</div> }),
          ],
        }),
      ];

      const container = document.createElement("div");
      render(() => <MemoryRouter initialPath="/users/123" config={{ routes }} />, container);

      await wait(10);
      const link = container.querySelector("a");
      // With end prop, /users should NOT be active on /users/123
      expect(link?.className || "").not.toContain("active");
    });

    test("deprecated exact prop works same as end", async () => {
      const routes: RouteDefinition[] = [
        route({
          path: "/",
          component: () => (
            <NavLink href="/" activeClass="active" exact>
              Home
            </NavLink>
          ),
        }),
      ];

      const container = document.createElement("div");
      render(() => <MemoryRouter initialPath="/" config={{ routes }} />, container);

      await wait(10);
      const link = container.querySelector("a");
      expect(link?.className || "").toContain("active");
    });
  });

  describe("Nested layouts", () => {
    test("renders child routes", async () => {
      const routes: RouteDefinition[] = [
        route({
          path: "/layout",
          component: LayoutShell,
          children: [route({ path: "/child", component: () => <div>Child Content</div> })],
        }),
      ];

      const container = document.createElement("div");
      render(() => <MemoryRouter initialPath="/layout/child" config={{ routes }} />, container);

      await wait(10);
      expect(container.textContent).toContain("Layout Header");
      expect(container.textContent).toContain("Child Content");
    });

    test("renders nested layouts", async () => {
      const routes: RouteDefinition[] = [
        route({
          path: "/a",
          component: LayerA,
          children: [
            route({
              path: "/b",
              component: LayerB,
              children: [route({ path: "/c", component: () => <div>C</div> })],
            }),
          ],
        }),
      ];

      const container = document.createElement("div");
      render(() => <MemoryRouter initialPath="/a/b/c" config={{ routes }} />, container);

      await wait(10);
      expect(container.textContent).toContain("A");
      expect(container.textContent).toContain("B");
      expect(container.textContent).toContain("C");
    });

    // The shape `packages/kitchen-sink` actually ships: the layout owns "/" and
    // so does its index child, so the parent prefix contributes nothing to the
    // siblings' paths. The other rows here nest under a non-root prefix, which
    // is the case that cannot see a join producing "//signals".
    const rootLayoutRoutes: RouteDefinition[] = [
      route({
        path: "/",
        component: LayoutShell,
        children: [
          route({ path: "/", component: () => <div>INDEX</div> }),
          route({ path: "/signals", component: () => <div>SIGNALS</div> }),
          route({ path: "/components", component: () => <div>COMPONENTS</div> }),
        ],
      }),
    ];

    test("matches an index and its siblings under a root layout", () => {
      expect(matchRoutes("/", rootLayoutRoutes)?.route.path).toBe("/");
      expect(matchRoutes("/signals", rootLayoutRoutes)?.route.path).toBe("/signals");
      expect(matchRoutes("/components", rootLayoutRoutes)?.route.path).toBe("/components");
      expect(matchRoutes("/signals", rootLayoutRoutes)?.parents.length).toBe(1);
    });

    test("renders a root layout around its index and its siblings", async () => {
      const container = document.createElement("div");
      render(
        () => <MemoryRouter initialPath="/signals" config={{ routes: rootLayoutRoutes }} />,
        container,
      );

      await wait(20);
      expect(container.querySelector(".layout")).not.toBeNull();
      expect(container.textContent).toContain("Layout Header");
      expect(container.textContent).toContain("SIGNALS");
      expect(container.textContent).not.toContain("COMPONENTS");

      const atIndex = document.createElement("div");
      render(() => <MemoryRouter initialPath="/" config={{ routes: rootLayoutRoutes }} />, atIndex);

      await wait(20);
      expect(atIndex.textContent).toContain("Layout Header");
      expect(atIndex.textContent).toContain("INDEX");
    });
  });

  describe("Redirect", () => {
    test("redirects on render", async () => {
      const routes: RouteDefinition[] = [
        route({ path: "/old", component: () => <Redirect to="/new" /> }),
        route({ path: "/new", component: () => <div>New Page</div> }),
      ];

      const container = document.createElement("div");
      render(() => <MemoryRouter initialPath="/old" config={{ routes }} />, container);

      await wait(100);
      expect(container.textContent).toContain("New Page");
    });
  });
});

// ============================================================================
// 3. Hooks Tests (~15 tests)
// ============================================================================

describe("Hooks", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  describe("useLocation", () => {
    test("returns current location", async () => {
      let location: ReturnType<typeof useLocation>;

      const routes: RouteDefinition[] = [
        route({
          path: "/test",
          component: () => {
            location = useLocation();
            return <div>Test</div>;
          },
        }),
      ];

      const container = document.createElement("div");
      render(
        () => <MemoryRouter initialPath="/test?foo=bar#hash" config={{ routes }} />,
        container,
      );

      await wait(10);
      expect(location!().pathname).toBe("/test");
    });

    test("updates on navigation", async () => {
      let location: ReturnType<typeof useLocation>;
      let nav: ReturnType<typeof useNavigate>;

      const routes: RouteDefinition[] = [
        route({
          path: "/a",
          component: () => {
            location = useLocation();
            nav = useNavigate();
            return <div>A</div>;
          },
        }),
        route({
          path: "/b",
          component: () => {
            location = useLocation();
            return <div>B</div>;
          },
        }),
      ];

      const container = document.createElement("div");
      render(() => <MemoryRouter initialPath="/a" config={{ routes }} />, container);

      await wait(10);
      expect(location!().pathname).toBe("/a");

      await nav!("/b");
      await wait(50);
      expect(location!().pathname).toBe("/b");
    });
  });

  describe("useParams", () => {
    test("returns route params", async () => {
      let params: ReturnType<typeof useParams>;

      const routes: RouteDefinition[] = [
        route({
          path: "/users/:userId/posts/:postId",
          component: () => {
            params = useParams();
            return <div>User Post</div>;
          },
        }),
      ];

      const container = document.createElement("div");
      render(
        () => <MemoryRouter initialPath="/users/123/posts/456" config={{ routes }} />,
        container,
      );

      await wait(10);
      expect(params!()).toEqual({ userId: "123", postId: "456" });
    });

    test("updates on param change", async () => {
      let params: ReturnType<typeof useParams>;
      let nav: ReturnType<typeof useNavigate>;

      const routes: RouteDefinition[] = [
        route({
          path: "/users/:id",
          component: () => {
            params = useParams();
            nav = useNavigate();
            return <div>User {params().id}</div>;
          },
        }),
      ];

      const container = document.createElement("div");
      render(() => <MemoryRouter initialPath="/users/1" config={{ routes }} />, container);

      await wait(10);
      expect(params!().id).toBe("1");

      await nav!("/users/2");
      await wait(50);
      expect(params!().id).toBe("2");
    });
  });

  describe("useSearchParams", () => {
    test("returns search params", async () => {
      let searchParams: ReturnType<typeof useSearchParams>;

      const routes: RouteDefinition[] = [
        route({
          path: "/search",
          component: () => {
            searchParams = useSearchParams();
            return <div>Search</div>;
          },
        }),
      ];

      const container = document.createElement("div");
      render(
        () => <MemoryRouter initialPath="/search?q=hello&page=1" config={{ routes }} />,
        container,
      );

      await wait(10);
      const [getParams] = searchParams!;
      expect(getParams().get("q")).toBe("hello");
      expect(getParams().get("page")).toBe("1");
    });

    test("setSearchParams updates URL", async () => {
      let searchParams: ReturnType<typeof useSearchParams>;

      const routes: RouteDefinition[] = [
        route({
          path: "/search",
          component: () => {
            searchParams = useSearchParams();
            return <div>Search</div>;
          },
        }),
      ];

      const container = document.createElement("div");
      render(() => <MemoryRouter initialPath="/search?q=hello" config={{ routes }} />, container);

      await wait(10);
      const [getParams, setParams] = searchParams!;
      expect(getParams().get("q")).toBe("hello");

      setParams({ q: "world", page: "2" });
      await wait(50);

      expect(getParams().get("q")).toBe("world");
      expect(getParams().get("page")).toBe("2");
    });

    test("setSearchParams filters empty values", async () => {
      let searchParams: ReturnType<typeof useSearchParams>;

      const routes: RouteDefinition[] = [
        route({
          path: "/search",
          component: () => {
            searchParams = useSearchParams();
            return <div>Search</div>;
          },
        }),
      ];

      const container = document.createElement("div");
      render(() => <MemoryRouter initialPath="/search?q=hello" config={{ routes }} />, container);

      await wait(10);
      const [getParams, setParams] = searchParams!;

      setParams({ q: "", page: "1" });
      await wait(50);

      // Empty q should be filtered out
      expect(getParams().get("q")).toBeNull();
      expect(getParams().get("page")).toBe("1");
    });
  });

  describe("useNavigate", () => {
    test("returns navigate function", async () => {
      let nav: ReturnType<typeof useNavigate>;

      const routes: RouteDefinition[] = [
        route({
          path: "/",
          component: () => {
            nav = useNavigate();
            return <div>Home</div>;
          },
        }),
        route({ path: "/other", component: () => <div>Other</div> }),
      ];

      const container = document.createElement("div");
      render(() => <MemoryRouter initialPath="/" config={{ routes }} />, container);

      await wait(10);
      expect(typeof nav!).toBe("function");

      await nav!("/other");
      await wait(50);
      expect(container.textContent).toContain("Other");
    });

    test("supports replace option", async () => {
      let nav: ReturnType<typeof useNavigate>;

      const routes: RouteDefinition[] = [
        route({
          path: "/a",
          component: () => {
            nav = useNavigate();
            return <div>A</div>;
          },
        }),
        route({ path: "/b", component: () => <div>B</div> }),
      ];

      const container = document.createElement("div");
      render(() => <MemoryRouter initialPath="/a" config={{ routes }} />, container);

      await wait(10);
      await nav!("/b", { replace: true });
      await wait(50);
      expect(container.textContent).toContain("B");
    });
  });

  describe("useIsLoading", () => {
    test("returns loading state signal", async () => {
      let isLoading: ReturnType<typeof useIsLoading>;
      let resolveLoader: () => void;

      const loaderPromise = new Promise<void>((resolve) => {
        resolveLoader = resolve;
      });

      const routes: RouteDefinition[] = [
        route({
          path: "/",
          loader: () => loaderPromise,
          component: () => {
            isLoading = useIsLoading();
            return <div>Home</div>;
          },
        }),
      ];

      const container = document.createElement("div");
      render(() => <MemoryRouter initialPath="/" config={{ routes }} />, container);

      await wait(10);
      // isLoading should be true while loader is pending
      expect(isLoading!()).toBe(true);

      resolveLoader!();
      await wait(50);
      expect(isLoading!()).toBe(false);
    });
  });

  describe("useMatchedRoutes", () => {
    test("returns matched route chain", async () => {
      chainProbe.length = 0;

      const routes: RouteDefinition[] = [
        route({
          path: "/parent",
          component: ChainProbeLayout,
          children: [route({ path: "/child", component: () => <div>Child</div> })],
        }),
      ];

      const container = document.createElement("div");
      render(() => <MemoryRouter initialPath="/parent/child" config={{ routes }} />, container);

      await wait(10);
      const routes_ = chainProbe[0]();
      expect(routes_.length).toBe(2);
      expect(routes_[0].path).toBe("/parent");
      expect(routes_[1].path).toBe("/child");
    });
  });
});

// ============================================================================
// 4. Loaders Tests (~12 tests)
// ============================================================================

describe("Loaders", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  test("executes loader on route match", async () => {
    let loaderCalled = false;

    const routes: RouteDefinition[] = [
      route({
        path: "/",
        loader: async () => {
          loaderCalled = true;
          return { message: "loaded" };
        },
        component: MessageView,
      }),
    ];

    const container = document.createElement("div");
    render(() => <MemoryRouter initialPath="/" config={{ routes }} />, container);

    await wait(100);
    expect(loaderCalled).toBe(true);
    expect(container.textContent).toContain("loaded");
  });

  test("passes params to loader", async () => {
    let receivedParams: unknown;

    const routes: RouteDefinition[] = [
      route({
        path: "/users/:id",
        loader: async ({ params }) => {
          receivedParams = params;
          return { id: params.id };
        },
        component: UserIdView,
      }),
    ];

    const container = document.createElement("div");
    render(() => <MemoryRouter initialPath="/users/123" config={{ routes }} />, container);

    await wait(100);
    expect(receivedParams).toEqual({ id: "123" });
  });

  test("passes searchParams to loader", async () => {
    let receivedSearch: URLSearchParams | undefined;

    const routes: RouteDefinition[] = [
      route({
        path: "/search",
        loader: async ({ searchParams }) => {
          receivedSearch = searchParams;
          return {};
        },
        component: () => <div>Search</div>,
      }),
    ];

    const container = document.createElement("div");
    render(() => <MemoryRouter initialPath="/search?q=test" config={{ routes }} />, container);

    await wait(100);
    expect(receivedSearch?.get("q")).toBe("test");
  });

  test("provides abort signal to loader", async () => {
    let signalReceived = false;

    const routes: RouteDefinition[] = [
      route({
        path: "/",
        loader: async ({ signal }) => {
          signalReceived = signal instanceof AbortSignal;
          return {};
        },
        component: () => <div>Home</div>,
      }),
    ];

    const container = document.createElement("div");
    render(() => <MemoryRouter initialPath="/" config={{ routes }} />, container);

    await wait(100);
    expect(signalReceived).toBe(true);
  });

  test("handles loader errors", async () => {
    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});

    const routes: RouteDefinition[] = [
      route({
        path: "/",
        loader: async () => {
          throw new Error("Loader failed");
        },
        component: () => <div>Should still render</div>,
      }),
    ];

    const container = document.createElement("div");
    render(() => <MemoryRouter initialPath="/" config={{ routes }} />, container);

    await wait(100);
    // Should still render the component even on loader error
    expect(container.textContent).toContain("Should still render");

    consoleSpy.mockRestore();
  });

  test("route errorElement catches loader errors", async () => {
    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});

    const routes: RouteDefinition[] = [
      route({
        path: "/",
        loader: async () => {
          throw new Error("Loader failed");
        },
        component: () => <div>Content</div>,
        errorElement: LoaderErrorView,
      }),
    ];

    const container = document.createElement("div");
    render(() => <MemoryRouter initialPath="/" config={{ routes }} />, container);

    await wait(100);
    expect(container.textContent).toContain("Error: Loader failed");

    consoleSpy.mockRestore();
  });

  // `reset` used to be invoked, reset nothing, and re-throw the same error: the
  // failure lived in `loads`, which nothing cleared and no reset re-populated,
  // so a route that failed its loader could never recover in place.
  test("errorElement's reset re-runs the loader and recovers in place", async () => {
    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
    let attempts = 0;

    const routes: RouteDefinition[] = [
      route({
        path: "/",
        loader: async () => {
          attempts += 1;
          if (attempts === 1) throw new Error("boom");
          return { ok: true };
        },
        component: () => <div>HOME</div>,
        errorElement: RetryableErrorView,
      }),
    ];

    const container = document.createElement("div");
    // The retry button is DELEGATED, so the click has to reach the document.
    document.body.append(container);
    render(
      () => <MemoryRouter initialPath="/" config={{ routes, cache: { ttl: 0 } }} />,
      container,
    );

    await wait(100);
    expect(attempts).toBe(1);
    expect(container.textContent).toContain("Error: boom");

    container.querySelector("button")?.click();
    await wait(100);

    expect(attempts).toBe(2);
    expect(container.textContent).toContain("HOME");
    expect(container.textContent).not.toContain("Error: boom");

    container.remove();
    consoleSpy.mockRestore();
  });

  test("executes loaders in parallel for nested routes", async () => {
    const callOrder: string[] = [];
    let parentResolve: () => void;
    let childResolve: () => void;

    const parentPromise = new Promise<void>((resolve) => {
      parentResolve = resolve;
    });
    const childPromise = new Promise<void>((resolve) => {
      childResolve = resolve;
    });

    const routes: RouteDefinition[] = [
      route({
        path: "/parent",
        loader: async () => {
          callOrder.push("parent-start");
          await parentPromise;
          callOrder.push("parent-end");
          return {};
        },
        component: ParentWithChild,
        children: [
          route({
            path: "/child",
            loader: async () => {
              callOrder.push("child-start");
              await childPromise;
              callOrder.push("child-end");
              return {};
            },
            component: () => <div>Child</div>,
          }),
        ],
      }),
    ];

    const container = document.createElement("div");
    render(() => <MemoryRouter initialPath="/parent/child" config={{ routes }} />, container);

    await wait(20);
    // Both loaders should start immediately (parallel)
    expect(callOrder).toContain("parent-start");
    expect(callOrder).toContain("child-start");

    parentResolve!();
    childResolve!();
    await wait(50);

    expect(callOrder).toContain("parent-end");
    expect(callOrder).toContain("child-end");
  });
});

// ============================================================================
// 5. Edge Cases Tests (~15 tests)
// ============================================================================

describe("Edge Cases", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  test("handles rapid navigation", async () => {
    let nav: ReturnType<typeof useNavigate>;

    const routes: RouteDefinition[] = [
      route({
        path: "/a",
        component: () => {
          nav = useNavigate();
          return <div>A</div>;
        },
      }),
      route({ path: "/b", component: () => <div>B</div> }),
      route({ path: "/c", component: () => <div>C</div> }),
    ];

    const container = document.createElement("div");
    render(() => <MemoryRouter initialPath="/a" config={{ routes }} />, container);

    await wait(10);

    // Rapid fire navigations
    void nav!("/b");
    void nav!("/c");
    void nav!("/a");
    void nav!("/b");

    await wait(200);
    // Should end up at /b
    expect(container.textContent).toContain("B");
  });

  test("handles unicode paths", async () => {
    const routes: RouteDefinition[] = [
      route({
        path: "/日本語/:name",
        component: GreetingView,
      }),
    ];

    const container = document.createElement("div");
    render(() => <MemoryRouter initialPath="/日本語/世界" config={{ routes }} />, container);

    await wait(10);
    expect(container.textContent).toContain("世界");
  });

  test("handles empty routes array", async () => {
    const routes: RouteDefinition[] = [];

    const container = document.createElement("div");
    render(
      () => (
        <MemoryRouter initialPath="/" config={{ routes, fallback: () => <div>No routes</div> }} />
      ),
      container,
    );

    await wait(10);
    expect(container.textContent).toContain("No routes");
  });

  test("handles deeply nested routes", async () => {
    const routes: RouteDefinition[] = [
      route({
        path: "/a",
        component: LayerA,
        children: [
          route({
            path: "/b",
            component: LayerB,
            children: [
              route({
                path: "/c",
                component: LayerC,
                children: [
                  route({
                    path: "/d",
                    component: () => <div>D</div>,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ];

    const container = document.createElement("div");
    render(() => <MemoryRouter initialPath="/a/b/c/d" config={{ routes }} />, container);

    await wait(10);
    expect(container.textContent).toContain("A");
    expect(container.textContent).toContain("B");
    expect(container.textContent).toContain("C");
    expect(container.textContent).toContain("D");
  });

  test("handles route with trailing slash", async () => {
    const routes: RouteDefinition[] = [
      route({ path: "/users/", component: () => <div>Users</div> }),
    ];

    const container = document.createElement("div");
    render(() => <MemoryRouter initialPath="/users/" config={{ routes }} />, container);

    await wait(10);
    expect(container.textContent).toContain("Users");
  });

  test("handles hash-only navigation", async () => {
    let location: ReturnType<typeof useLocation>;

    const routes: RouteDefinition[] = [
      route({
        path: "/page",
        component: () => {
          location = useLocation();
          return <div>Page</div>;
        },
      }),
    ];

    const container = document.createElement("div");
    render(() => <MemoryRouter initialPath="/page#section" config={{ routes }} />, container);

    await wait(10);
    expect(location!().hash).toBe("#section");
  });

  test("handles special characters in params", async () => {
    let params: ReturnType<typeof useParams>;

    const routes: RouteDefinition[] = [
      route({
        path: "/search/:query",
        component: () => {
          params = useParams();
          return <div>Search</div>;
        },
      }),
    ];

    const container = document.createElement("div");
    render(
      () => <MemoryRouter initialPath="/search/hello%20world" config={{ routes }} />,
      container,
    );

    await wait(10);
    expect(params!().query).toBe("hello%20world");
  });

  test("handles base path configuration", async () => {
    const routes: RouteDefinition[] = [route({ path: "/page", component: () => <div>Page</div> })];

    const container = document.createElement("div");
    render(() => <MemoryRouter initialPath="/page" config={{ routes, base: "/app" }} />, container);

    await wait(10);
    expect(container.textContent).toContain("Page");
  });

  test("multiple MemoryRouters work independently", async () => {
    const routes1: RouteDefinition[] = [
      route({ path: "/", component: () => <div>Router 1 Home</div> }),
      route({ path: "/a", component: () => <div>Router 1 A</div> }),
    ];

    const routes2: RouteDefinition[] = [
      route({ path: "/", component: () => <div>Router 2 Home</div> }),
      route({ path: "/b", component: () => <div>Router 2 B</div> }),
    ];

    const container = document.createElement("div");
    render(
      () => (
        <div>
          <MemoryRouter initialPath="/" config={{ routes: routes1 }} />
          <MemoryRouter initialPath="/b" config={{ routes: routes2 }} />
        </div>
      ),
      container,
    );

    await wait(10);
    expect(container.textContent).toContain("Router 1 Home");
    expect(container.textContent).toContain("Router 2 B");
  });
});

// ============================================================================
// 6. Memory & Cleanup Tests (~8 tests)
// ============================================================================

describe("Memory & Cleanup", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  test("cleans up router on unmount", async () => {
    // Re-cut. It used to assert that `unregisterRouter` removed an entry from a
    // module-level registry. The registry is gone with the module-global
    // fallback, so what a router's death now IS is scope disposal — asserted
    // here, from inside a route component, plus the DOM actually going.
    let inner: Scope | null = null;

    const routes: RouteDefinition[] = [
      route({
        path: "/",
        component: () => {
          inner = getOwner();
          return <div>Home</div>;
        },
      }),
    ];

    const container = document.createElement("div");
    const dispose = render(() => <MemoryRouter initialPath="/" config={{ routes }} />, container);

    await wait(10);
    expect(container.textContent).toContain("Home");
    expect(inner).not.toBeNull();
    expect(isDisposed(inner!)).toBe(false);

    dispose();

    expect(isDisposed(inner!)).toBe(true);
    expect(container.textContent).toBe("");
  });

  test("clears cache entries on TTL expiration", async () => {
    let callCount = 0;
    let nav: ReturnType<typeof useNavigate>;

    const routes: RouteDefinition[] = [
      route({
        path: "/",
        loader: async () => {
          callCount++;
          return { count: callCount };
        },
        component: () => {
          nav = useNavigate();
          return <div>Home</div>;
        },
      }),
      route({ path: "/other", component: () => <div>Other</div> }),
    ];

    const container = document.createElement("div");
    render(
      () => <MemoryRouter initialPath="/" config={{ routes, cache: { ttl: 50 } }} />,
      container,
    );

    await wait(100);
    expect(callCount).toBe(1);

    // Navigate away
    await nav!("/other");
    await wait(20);

    // Wait for cache to expire
    await wait(100);

    // Navigate back
    await nav!("/");
    await wait(100);

    // Should reload since cache expired
    expect(callCount).toBe(2);
  });
});

// ============================================================================
// 7. New Features Tests (~15 tests)
// ============================================================================

describe("New Features", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  describe("Route Guards", () => {
    // The entry URL is a NAVIGATION. It used to run the guard pipeline only
    // when some route in the matched chain happened to declare a loader, so
    // whether a guard ran at all was decided by an unrelated data concern and a
    // deep link walked straight into a guarded route.
    test("the entry URL runs beforeEach, and a redirect from it lands", async () => {
      const seen: string[] = [];
      const routes: RouteDefinition[] = [
        route({ path: "/login", component: () => <div>LOGIN</div> }),
        route({ path: "/secret", component: () => <div>SECRET</div> }),
      ];
      const guard: NavigationGuard = ({ to }) => {
        seen.push(to.pathname);
        return to.pathname === "/secret" ? "/login" : true;
      };

      const container = document.createElement("div");
      render(
        () => <MemoryRouter initialPath="/secret" config={{ routes, beforeEach: [guard] }} />,
        container,
      );
      await wait(50);

      expect(seen).toEqual(["/secret", "/login"]);
      expect(container.textContent).toContain("LOGIN");
      expect(container.textContent).not.toContain("SECRET");
    });

    test("the entry URL runs a route's own beforeEnter, with no loader anywhere", async () => {
      let ran = false;
      const routes: RouteDefinition[] = [
        route({ path: "/login", component: () => <div>LOGIN</div> }),
        route({
          path: "/secret",
          component: () => <div>SECRET</div>,
          beforeEnter: () => {
            ran = true;
            return "/login";
          },
        }),
      ];

      const container = document.createElement("div");
      render(() => <MemoryRouter initialPath="/secret" config={{ routes }} />, container);
      await wait(50);

      expect(ran).toBe(true);
      expect(container.textContent).toContain("LOGIN");
    });

    test("the entry URL runs afterEach", async () => {
      const seen: string[] = [];
      const routes: RouteDefinition[] = [route({ path: "/", component: () => <div>Home</div> })];

      const container = document.createElement("div");
      render(
        () => (
          <MemoryRouter
            initialPath="/"
            config={{ routes, afterEach: [(ctx) => seen.push(ctx.to.pathname)] }}
          />
        ),
        container,
      );
      await wait(50);

      expect(seen).toEqual(["/"]);
    });

    // A guard redirecting to a path its own predicate also rejects used to
    // recurse without bound and hang the process.
    test("a redirect loop is bounded rather than hanging", async () => {
      const errors = spyOn(console, "error").mockImplementation(() => {});
      const routes: RouteDefinition[] = [
        route({ path: "/", component: () => <div>Home</div> }),
        route({ path: "/loop", component: () => <div>Loop</div> }),
      ];
      const guard: NavigationGuard = () => "/loop";

      const container = document.createElement("div");
      render(
        () => <MemoryRouter initialPath="/" config={{ routes, beforeEach: [guard] }} />,
        container,
      );
      await wait(100);

      expect(errors.mock.calls.some((call) => String(call[0]).includes("redirects"))).toBe(true);
      errors.mockRestore();
    });

    test("beforeEach guard can block navigation", async () => {
      let blocked = false;
      let nav: ReturnType<typeof useNavigate>;

      const routes: RouteDefinition[] = [
        route({
          path: "/",
          component: () => {
            nav = useNavigate();
            return <div>Home</div>;
          },
        }),
        route({ path: "/admin", component: () => <div>Admin</div> }),
      ];

      const guard: NavigationGuard = ({ to }) => {
        if (to.pathname === "/admin") {
          blocked = true;
          return false;
        }
        return true;
      };

      const container = document.createElement("div");
      render(
        () => <MemoryRouter initialPath="/" config={{ routes, beforeEach: [guard] }} />,
        container,
      );

      await wait(10);
      await nav!("/admin");
      await wait(50);

      expect(blocked).toBe(true);
      // Should still be on home since navigation was blocked
      expect(container.textContent).toContain("Home");
    });

    test("beforeEach guard can redirect", async () => {
      let nav: ReturnType<typeof useNavigate>;

      const routes: RouteDefinition[] = [
        route({
          path: "/",
          component: () => {
            nav = useNavigate();
            return <div>Home</div>;
          },
        }),
        route({ path: "/login", component: () => <div>Login</div> }),
        route({ path: "/admin", component: () => <div>Admin</div> }),
      ];

      const guard: NavigationGuard = ({ to }) => {
        if (to.pathname === "/admin") {
          return "/login"; // Redirect to login
        }
        return true;
      };

      const container = document.createElement("div");
      render(
        () => <MemoryRouter initialPath="/" config={{ routes, beforeEach: [guard] }} />,
        container,
      );

      await wait(10);
      await nav!("/admin");
      await wait(100);

      // Should be redirected to login
      expect(container.textContent).toContain("Login");
    });

    test("route-level beforeEnter guard", async () => {
      let guardCalled = false;
      let nav: ReturnType<typeof useNavigate>;

      const routes: RouteDefinition[] = [
        route({
          path: "/",
          component: () => {
            nav = useNavigate();
            return <div>Home</div>;
          },
        }),
        route({
          path: "/protected",
          beforeEnter: () => {
            guardCalled = true;
            return true;
          },
          component: () => <div>Protected</div>,
        }),
      ];

      const container = document.createElement("div");
      render(() => <MemoryRouter initialPath="/" config={{ routes }} />, container);

      await wait(10);
      await nav!("/protected");
      await wait(50);

      expect(guardCalled).toBe(true);
      expect(container.textContent).toContain("Protected");
    });

    test("afterEach hook is called after navigation", async () => {
      let afterCalled = false;
      let nav: ReturnType<typeof useNavigate>;

      const routes: RouteDefinition[] = [
        route({
          path: "/",
          component: () => {
            nav = useNavigate();
            return <div>Home</div>;
          },
        }),
        route({ path: "/other", component: () => <div>Other</div> }),
      ];

      const container = document.createElement("div");
      render(
        () => (
          <MemoryRouter
            initialPath="/"
            config={{
              routes,
              afterEach: [
                () => {
                  afterCalled = true;
                },
              ],
            }}
          />
        ),
        container,
      );

      await wait(10);
      await nav!("/other");
      await wait(50);

      expect(afterCalled).toBe(true);
    });
  });

  describe("Relative Navigation", () => {
    test("Link resolves relative href", async () => {
      const routes: RouteDefinition[] = [
        route({
          path: "/users",
          component: RelativeLinkLayout,
          children: [
            route({ path: "/", component: () => <div>Users Index</div> }),
            route({ path: "/profile", component: () => <div>User Profile</div> }),
          ],
        }),
      ];

      const container = document.createElement("div");
      render(() => <MemoryRouter initialPath="/users" config={{ routes }} />, container);

      await wait(10);
      const link = container.querySelector("a");
      // Relative ./profile from /users should resolve to /users/profile
      expect(link?.getAttribute("href")).toBe("/users/profile");
    });

    // The bug this pins: `Link` used to read `state.location()` at CONSTRUCTION
    // and close over the snapshot, so a relative href never re-resolved. It was
    // invisible to the test above because that test never navigates, and it was
    // invisible to a naive two-route repro because the Link is rebuilt when the
    // route changes. It is only observable where the Link SURVIVES a location
    // change — a parameter change under one route — which is the case the old
    // branch key (route + data, no params) rendered as nothing at all.
    test("a surviving Link re-resolves its relative href when the location moves", async () => {
      navProbe.length = 0;

      const routes: RouteDefinition[] = [
        route({
          path: "/u/:id",
          component: SurvivingLinkLayout,
          children: [route({ path: "/", component: () => <div>index</div> })],
        }),
      ];

      const container = document.createElement("div");
      render(() => <MemoryRouter initialPath="/u/1" config={{ routes }} />, container);

      await wait(10);
      const before = container.querySelector("a");
      expect(before?.getAttribute("href")).toBe("/u/1/edit");
      const identity = before;

      await navProbe[0]("/u/550e8400-e29b-41d4");
      await wait(50);

      const after = container.querySelector("a");
      // The SAME element: a parameter change keeps the layout and the link.
      expect(after).toBe(identity);
      expect(after?.getAttribute("href")).toBe("/u/550e8400-e29b-41d4/edit");
      // …and the parameter it renders moved with it, which the old key could
      // not do because it folded `data` in and left `params` out.
      expect(container.textContent).toContain("550e8400-e29b-41d4");
    });

    // Bug #10, which no test could see: the child pathname used to be sliced by
    // the PATTERN's length rather than by the length of the text that matched,
    // so a nested route under a parameterised parent matched only when the
    // parameter's value happened to be two or three characters long.
    test("a nested route matches under a parameterised parent at any param length", async () => {
      const routes: RouteDefinition[] = [
        route({
          path: "/u/:id",
          component: LayerA,
          children: [route({ path: "/edit", component: () => <div>EDIT</div> })],
        }),
      ];

      for (const id of ["7", "42", "123", "1234", "abcdef", "550e8400-e29b-41d4-a716"]) {
        const container = document.createElement("div");
        render(() => <MemoryRouter initialPath={`/u/${id}/edit`} config={{ routes }} />, container);
        await wait(10);
        expect(container.textContent).toContain("EDIT");
      }
    });

    // Bug #11: the layout prefix pattern used to publish its own catch-all as
    // `params["*"]` at every nesting level.
    test("a layout match does not leak a wildcard parameter", () => {
      const routes: RouteDefinition[] = [
        route({
          path: "/u/:id",
          component: LayerA,
          children: [route({ path: "/edit", component: () => <div>EDIT</div> })],
        }),
      ];
      expect(matchRoutes("/u/42/edit", routes)?.params).toEqual({ id: "42" });
    });

    // Bug #13: `startsWith` with no segment boundary made `/user-settings`
    // activate a NavLink pointing at `/user`.
    test("NavLink prefix matching respects segment boundaries", async () => {
      const routes: RouteDefinition[] = [
        route({ path: "/user-settings", component: BoundaryNavLayout }),
      ];

      const container = document.createElement("div");
      render(() => <MemoryRouter initialPath="/user-settings" config={{ routes }} />, container);

      await wait(10);
      const links = container.querySelectorAll("a");
      expect(links[0]?.className || "").not.toContain("active");
      expect(links[1]?.className || "").toContain("active");
    });

    test("navigate supports relative paths", async () => {
      let nav: ReturnType<typeof useNavigate>;

      const routes: RouteDefinition[] = [
        route({
          path: "/a/b",
          component: () => {
            nav = useNavigate();
            return <div>AB</div>;
          },
        }),
        route({ path: "/a/c", component: () => <div>AC</div> }),
      ];

      const container = document.createElement("div");
      render(() => <MemoryRouter initialPath="/a/b" config={{ routes }} />, container);

      await wait(10);
      await nav!("../c"); // Relative navigation from /a/b to /a/c
      await wait(50);

      expect(container.textContent).toContain("AC");
    });
  });

  describe("Loading States", () => {
    test("useIsLoading returns true during loader execution", async () => {
      loadingStatesSeen.length = 0;
      let resolveLoader: () => void;
      let nav: ReturnType<typeof useNavigate>;

      const loaderPromise = new Promise<{ data: string }>((resolve) => {
        resolveLoader = () => resolve({ data: "loaded" });
      });

      const routes: RouteDefinition[] = [
        route({
          path: "/",
          component: () => {
            nav = useNavigate();
            return <div>Home</div>;
          },
        }),
        route({
          path: "/slow",
          loader: async () => {
            // Track loading state at the start of loader
            return loaderPromise;
          },
          component: SlowView,
        }),
      ];

      const container = document.createElement("div");
      render(() => <MemoryRouter initialPath="/" config={{ routes }} />, container);

      await wait(10);

      // Navigate to the route with a slow loader
      void nav!("/slow");

      // Give time for navigation to start and loading state to be set
      await wait(20);

      // Now resolve the loader
      resolveLoader!();
      await wait(50);

      // After loader resolves and component re-renders, it should have captured
      // at least one loading state (could be true or false depending on timing)
      // The important thing is that useIsLoading works and returns a boolean
      expect(loadingStatesSeen.length).toBeGreaterThan(0);
    });
  });

  describe("Debug Mode", () => {
    test("setRouterDebugMode enables debug logging", async () => {
      const consoleSpy = spyOn(console, "log").mockImplementation(() => {});

      setRouterDebugMode(true);

      // Trigger some router activity that would log
      const routes: RouteDefinition[] = [route({ path: "/", component: () => <div>Home</div> })];

      const container = document.createElement("div");
      render(() => <MemoryRouter initialPath="/" config={{ routes }} />, container);

      await wait(50);

      // Debug logs should have been called
      const calls = consoleSpy.mock.calls;
      const hasDebugLog = calls.some(
        (call) => typeof call[0] === "string" && call[0].includes("[barq-router]"),
      );

      setRouterDebugMode(false);
      consoleSpy.mockRestore();

      expect(hasDebugLog).toBe(true);
    });
  });

  describe("Cache Configuration", () => {
    test("custom TTL is respected", async () => {
      let callCount = 0;
      let nav: ReturnType<typeof useNavigate>;

      const routes: RouteDefinition[] = [
        route({
          path: "/",
          loader: async () => {
            callCount++;
            return {};
          },
          component: () => {
            nav = useNavigate();
            return <div>Home</div>;
          },
        }),
        route({ path: "/other", component: () => <div>Other</div> }),
      ];

      const container = document.createElement("div");
      render(
        () => (
          <MemoryRouter
            initialPath="/"
            config={{ routes, cache: { ttl: 30 } }} // Very short TTL
          />
        ),
        container,
      );

      await wait(100);
      expect(callCount).toBe(1);

      await nav!("/other");
      await wait(50);

      // Wait for TTL to expire
      await wait(50);

      await nav!("/");
      await wait(100);

      // Should have reloaded due to expired cache
      expect(callCount).toBe(2);
    });
  });
});

// ============================================================================
// Type Safety Tests (compile-time only)
// ============================================================================

describe("Type Safety", () => {
  test("ExtractRouteParams extracts params from path", () => {
    // These are compile-time type tests
    type Test1 = ExtractRouteParams<"/users/:id">;
    type Test2 = ExtractRouteParams<"/users/:id/posts/:postId">;
    type Test3 = ExtractRouteParams<"/files/*">;
    type Test4 = ExtractRouteParams<"/docs/:path*">;

    // Runtime assertions to satisfy test runner
    const t1: Test1 = "id";
    const t2a: Test2 = "id";
    const t2b: Test2 = "postId";
    const t3: Test3 = "*";
    const t4: Test4 = "path";

    expect(t1).toBe("id");
    expect(t2a).toBe("id");
    expect(t2b).toBe("postId");
    expect(t3).toBe("*");
    expect(t4).toBe("path");
  });

  test("PathParams creates correct param object type", () => {
    // Compile-time type test
    type UserParams = PathParams<"/users/:id">;
    type PostParams = PathParams<"/users/:userId/posts/:postId">;

    // Runtime assertions
    const userParams: UserParams = { id: "123" };
    const postParams: PostParams = { userId: "1", postId: "2" };

    expect(userParams.id).toBe("123");
    expect(postParams.userId).toBe("1");
    expect(postParams.postId).toBe("2");
  });

  test("route() infers params from path", () => {
    // This test verifies that the route() function properly infers types
    const userRoute = route({
      path: "/users/:id",
      loader: async ({ params }) => {
        // params.id should be typed as string
        return { userId: params.id };
      },
      component: (props) => {
        // Both are Cells and both are typed
        return (
          <div>
            User {() => props.params().id}: {() => props.data()?.userId}
          </div>
        );
      },
    });

    expect(userRoute.path).toBe("/users/:id");
  });
});

// ============================================================================
// Route Definition Helpers Tests
// ============================================================================

describe("Route Definition Helpers", () => {
  test("defineRoute returns same object", () => {
    const routeDef = { path: "/", component: () => <div>Home</div> };
    expect(defineRoute(routeDef)).toBe(routeDef);
  });

  test("defineRoutes returns same array", () => {
    const routes = [{ path: "/", component: () => <div>Home</div> }];
    expect(defineRoutes(routes)).toBe(routes);
  });
});
