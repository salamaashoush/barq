import { describe as group, expect, test } from "bun:test";

import { idsInStub, reachabilityFrom } from "../src/reachability.ts";

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

  test("reads an id whose stub carries a chain or a method after it", async () => {
    // A function with middleware is the one the route-action check exists for,
    // and its stub names the chain after the id. Missed, its route reached
    // nothing and the check passed having compared nothing.
    const stub =
      `export const save = /* @__PURE__ */ clientRpc("server/users.ts#save", [requireSession]);\n` +
      `export const read = /* @__PURE__ */ clientRpc("server/users.ts#read", [], { method: "GET" });\n`;
    expect(idsInStub(stub)).toEqual(["server/users.ts#save", "server/users.ts#read"]);
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
    const native = createRequire(import.meta.url)("@barqjs/compiler") as {
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
