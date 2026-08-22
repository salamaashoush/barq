import { createServerFn, type Middleware } from "@barqjs/start";
import { describe as group, expect, test } from "bun:test";

import {
  chainOf,
  describe as report,
  idsInStub,
  reachabilityFrom,
  verifyRouteChains,
} from "./manifest.ts";
import { type AnyRouteDefinition, flattenRoutes } from "./route.ts";

const requireUser: Middleware = async (next) => next();
const requireAdmin: Middleware = async (next) => next();

const guarded = createServerFn()
  .middleware([requireUser])
  .validator("unchecked")
  .handler(async () => "ok");
const bare = createServerFn()
  .validator("unchecked")
  .handler(async () => "ok");
const both = createServerFn()
  .middleware([requireUser, requireAdmin])
  .validator("unchecked")
  .handler(async () => "ok");

const lookup = (id: string) =>
  ({ "fn#guarded": guarded, "fn#bare": bare, "fn#both": both })[id] as never;

group("verifyRouteChains", () => {
  const routes: AnyRouteDefinition[] = [
    {
      path: "/admin",
      middleware: [requireUser],
      component: (() => null) as never,
      children: [
        { path: "", component: (() => null) as never },
        { path: "users", middleware: [requireAdmin], component: (() => null) as never },
      ],
    },
    { path: "/public", component: (() => null) as never },
  ] as never;

  test("an action carrying the route's chain is accepted", async () => {
    const violations = await verifyRouteChains({
      routes,
      reachability: new Map([["/admin", new Set(["fn#guarded"])]]),
      lookup,
    });
    expect(violations).toEqual([]);
  });

  test("an action missing it is a violation naming both", async () => {
    const violations = await verifyRouteChains({
      routes,
      reachability: new Map([["/admin", new Set(["fn#bare"])]]),
      lookup,
    });
    expect(violations).toEqual([{ routeId: "/admin", serverFnId: "fn#bare", missing: 1 }]);
  });

  test("a child INHERITS its layout's chain", async () => {
    // Declaring middleware on a layout has to cover everything under it, or
    // declaring it there means nothing.
    const violations = await verifyRouteChains({
      routes,
      reachability: new Map([["/admin/users", new Set(["fn#guarded"])]]),
      lookup,
    });
    // `guarded` has requireUser but the child also declares requireAdmin.
    expect(violations).toEqual([{ routeId: "/admin/users", serverFnId: "fn#guarded", missing: 1 }]);

    expect(
      await verifyRouteChains({
        routes,
        reachability: new Map([["/admin/users", new Set(["fn#both"])]]),
        lookup,
      }),
    ).toEqual([]);
  });

  test("a route with no chain demands nothing", async () => {
    expect(
      await verifyRouteChains({
        routes,
        reachability: new Map([["/public", new Set(["fn#bare"])]]),
        lookup,
      }),
    ).toEqual([]);
  });

  test("reachable from two routes means BOTH chains, the union", async () => {
    // Over-restricting on purpose: picking one route's policy for a call that
    // could have arrived through either is exactly the unsound thing.
    const violations = await verifyRouteChains({
      routes,
      reachability: new Map([
        ["/admin", new Set(["fn#guarded"])],
        ["/admin/users", new Set(["fn#guarded"])],
      ]),
      lookup,
    });
    expect(violations).toEqual([{ routeId: "/admin/users", serverFnId: "fn#guarded", missing: 1 }]);
  });

  test("an id nothing mounted is skipped rather than guessed at", async () => {
    expect(
      await verifyRouteChains({
        routes,
        reachability: new Map([["/admin", new Set(["fn#unknown"])]]),
        lookup,
      }),
    ).toEqual([]);
  });

  test("the comparison is by REFERENCE, not by shape", async () => {
    // Two middlewares with identical bodies are different policies. A build
    // cannot read a chain out of source — `.middleware([...c])` and
    // `.middleware(c.filter(Boolean))` are runtime expressions over anonymous
    // closures — so `===` against the declared closure is the only sound test.
    const lookalike: Middleware = async (next) => next();
    const withLookalike = createServerFn()
      .middleware([lookalike])
      .validator("unchecked")
      .handler(async () => "ok");

    const violations = await verifyRouteChains({
      routes,
      reachability: new Map([["/admin", new Set(["x"])]]),
      lookup: (id) => (id === "x" ? withLookalike : undefined),
    });
    expect(violations).toEqual([{ routeId: "/admin", serverFnId: "x", missing: 1 }]);
  });

  test("a chain built by spread or filter still matches", async () => {
    const chain = [requireUser];
    const spread = createServerFn()
      .middleware([...chain])
      .validator("unchecked")
      .handler(async () => "ok");
    const filtered = createServerFn()
      .middleware(chain.filter(Boolean))
      .validator("unchecked")
      .handler(async () => "ok");

    for (const fn of [spread, filtered]) {
      expect(
        await verifyRouteChains({
          routes,
          reachability: new Map([["/admin", new Set(["x"])]]),
          lookup: (id) => (id === "x" ? (fn as never) : undefined),
        }),
      ).toEqual([]);
    }
  });
});

group("chainOf", () => {
  test("is outermost first and deduplicated", async () => {
    const table = [
      {
        path: "/a",
        middleware: [requireUser],
        component: (() => null) as never,
        children: [
          { path: "b", middleware: [requireUser, requireAdmin], component: (() => null) as never },
        ],
      },
    ] as never;
    const leaf = flattenRoutes(table)[0];
    expect(await chainOf(leaf?.chain ?? [])).toEqual([requireUser, requireAdmin]);
  });
});

group("a file-based table's middleware", () => {
  test("a THUNK is awaited, which is how a generated route declares it", async () => {
    // `middleware` cannot be lifted out of a route file as a literal — it is an
    // anonymous closure compared by `===` — so the generator emits a thunk over
    // the route module's own dynamic import. The check has to resolve it.
    const table = [
      {
        path: "/admin",
        middleware: async () => [requireUser],
        component: (() => null) as never,
        children: [{ path: "", component: (() => null) as never }],
      },
    ] as never;
    expect(
      await verifyRouteChains({
        routes: table,
        reachability: new Map([["/admin", new Set(["fn#bare"])]]),
        lookup,
      }),
    ).toHaveLength(1);
    expect(
      await verifyRouteChains({
        routes: table,
        reachability: new Map([["/admin", new Set(["fn#guarded"])]]),
        lookup,
      }),
    ).toEqual([]);
  });

  test("a thunk that resolves to nothing is a route with no claim", async () => {
    const table = [
      { path: "/x", middleware: async () => undefined, component: (() => null) as never },
    ] as never;
    expect(
      await verifyRouteChains({
        routes: table,
        reachability: new Map([["/x", new Set(["fn#bare"])]]),
        lookup,
      }),
    ).toEqual([]);
  });
});

group("the report", () => {
  test("names the route, the action and the fix", async () => {
    const text = report([{ routeId: "/admin", serverFnId: "fn#bare", missing: 1 }]);
    expect(text).toContain("fn#bare is reachable from /admin");
    expect(text).toContain("separate HTTP endpoint");
    expect(text).toContain(".middleware([...])");
  });
});

group("reachabilityFrom", () => {
  test("walks transitively and stops at a cycle", async () => {
    const imports: Record<string, string[]> = {
      "/routes/admin.tsx": ["/actions.ts", "/shared.ts"],
      "/shared.ts": ["/actions.ts", "/routes/admin.tsx"],
      "/actions.ts": [],
    };
    const ids: Record<string, string[]> = { "/actions.ts": ["actions.ts#ban"] };

    const found = reachabilityFrom(
      new Map([["/admin", "/routes/admin.tsx"]]),
      (id) => imports[id] ?? [],
      (id) => ids[id] ?? [],
    );
    expect([...(found.get("/admin") ?? [])]).toEqual(["actions.ts#ban"]);
  });

  test("a route that reaches nothing gets an empty set, not a missing entry", async () => {
    const found = reachabilityFrom(
      new Map([["/public", "/routes/public.tsx"]]),
      () => [],
      () => [],
    );
    expect(found.get("/public")?.size).toBe(0);
  });
});

group("idsInStub", () => {
  test("reads the ids out of a synthesized client half", async () => {
    // Read rather than re-derived: the id must be the same string the server
    // mounted, and deriving it twice is how the two halves drift.
    const stub =
      `import { clientRpc } from "@barqjs/start";\n` +
      `export const getUser = /* @__PURE__ */ clientRpc("server/users.ts#getUser");\n` +
      `export default /* @__PURE__ */ clientRpc("server/users.ts#default");\n`;
    expect(idsInStub(stub)).toEqual(["server/users.ts#getUser", "server/users.ts#default"]);
  });

  test("a module with no stubs yields nothing", async () => {
    expect(idsInStub(`export const x = 1;\n`)).toEqual([]);
  });
});

group("the premise the walk rests on", () => {
  test("a client-compiled route KEEPS its import edge to the action module", async () => {
    // Everything above assumes the edge survives the client compile. It does,
    // and for a specific reason: the compiler replaces the server-function
    // module's CONTENTS with stubs, it does not remove the importer's edge. If
    // that ever changed, every reachability answer would silently become empty
    // — so it is asserted against the real compiler rather than assumed.
    const { createRequire } = await import("node:module");
    const native = createRequire(import.meta.url)("@barqjs/compiler-rs") as {
      transform(code: string, options?: Record<string, unknown>): { code: string };
    };

    const route = native.transform(
      `import { banUser } from "./actions.ts";\nexport default function Page() { return <div>{banUser}</div>; }\n`,
      { filename: "/app/routes/admin.tsx", root: "/app", env: "client" },
    ).code;
    expect(route).toContain('from "./actions.ts"');

    const actions = native.transform(
      `import { createServerFn } from "@barqjs/start";\nimport { db } from "./db.ts";\n` +
        `export const banUser = createServerFn().validator("unchecked").handler(async () => db.ban());\n`,
      { filename: "/app/actions.ts", root: "/app", env: "client" },
    ).code;

    // The action module became stubs — no handler body, no `./db` — and its ids
    // are literals the walk can read.
    expect(actions).not.toContain("./db.ts");
    expect(idsInStub(actions)).toEqual(["actions.ts#banUser"]);
  });
});
