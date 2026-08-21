import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import { ROUTES_ID, barqRouter, routeTree } from "./vite.ts";

const made: string[] = [];

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "barq-router-"));
  made.push(root);
  for (const [path, contents] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, contents);
  }
  return root;
}

afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

type Hooks = {
  configResolved(config: { root: string }): void;
  resolveId(id: string): string | null;
  load(this: { addWatchFile(f: string): void }, id: string): string | null;
};

const hooks = (plugin: ReturnType<typeof barqRouter>): Hooks => plugin as unknown as Hooks;

/**
 * `@barqjs/core`, stubbed.
 *
 * The generated table imports `lazy` from it, and a temp project outside the
 * workspace cannot resolve it. Stubbing keeps the test hermetic and about the
 * GRAPH, which is what it measures — the real `lazy` would change nothing here.
 */
const stubCore = (): {
  name: string;
  resolveId(id: string): string | null;
  load(id: string): string | null;
} => ({
  name: "stub-core",
  resolveId: (id) => (id === "@barqjs/core" ? "\0stub-core" : null),
  load: (id) => (id === "\0stub-core" ? "export const lazy = (load) => load;" : null),
});

/**
 * The scan and both emits are `compiler-rs`'s, and `routes.rs` holds their unit
 * tests. What is left to check here is that this plugin ASKS correctly and
 * invalidates correctly — the two things that could not move into Rust.
 */
describe("routeTree, across the napi boundary", () => {
  test("finds routes in nested directories, skipping tests", () => {
    const root = project({
      "src/routes/index.tsx": "",
      "src/routes/about.tsx": "",
      "src/routes/users/$id.tsx": "",
      "src/routes/about.test.tsx": "",
      "src/routes/notes.md": "",
    });

    const tree = routeTree(root, "src/routes");
    expect(tree.files.toSorted()).toEqual([
      "src/routes/about.tsx",
      "src/routes/index.tsx",
      "src/routes/users/$id.tsx",
    ]);
    expect(tree.patterns.toSorted()).toEqual(["/", "/about", "/users/$id"]);
  });

  test("a project with no routes directory is not an error", () => {
    const root = project({ "src/main.tsx": "" });
    const tree = routeTree(root, "src/routes");
    expect(tree.files).toEqual([]);
    expect(tree.module).toContain("export const routes");
  });
});

describe("the plugin", () => {
  test("resolves the virtual id and serves the compiler's module", () => {
    const root = project({
      "src/routes/index.tsx": "export default () => null;",
      "src/routes/users.route.tsx": "export default () => null;",
      "src/routes/users.$id.tsx": "export default () => null;",
    });
    const plugin = hooks(barqRouter({ types: false }));
    plugin.configResolved({ root });

    expect(plugin.resolveId(ROUTES_ID)).toBe(`\0${ROUTES_ID}`);
    expect(plugin.resolveId("something-else")).toBeNull();

    const watched: string[] = [];
    const code = plugin.load.call({ addWatchFile: (f) => watched.push(f) }, `\0${ROUTES_ID}`);

    expect(code).toContain("export const routes");
    expect(code).toContain('lazy(() => import("/src/routes/users.$id.tsx"))');
    // Every route file is watched, so adding or removing one invalidates the
    // table — which is a different module from the file that changed.
    expect(watched).toHaveLength(3);
  });

  test("writes the types and reports the patterns from the SAME scan", () => {
    // BARQ013's route set has to come from the scan the table was built from,
    // or the check runs against a different project than the one that ships.
    const root = project({ "src/routes/users.$id.tsx": "export default () => null;" });
    let reported: readonly string[] = [];
    const plugin = hooks(
      barqRouter({ types: "src/routes.gen.d.ts", onRoutes: (p) => (reported = p) }),
    );
    plugin.configResolved({ root });

    expect(reported).toEqual(["/users/$id"]);
    const written = readFileSync(join(root, "src/routes.gen.d.ts"), "utf8");
    expect(written).toContain('declare module "virtual:barq-routes"');
    expect(written).toContain('"/users/$id"');
  });

  test("load returns null for anything else", () => {
    const root = project({ "src/routes/index.tsx": "" });
    const plugin = hooks(barqRouter({ types: false }));
    plugin.configResolved({ root });
    expect(plugin.load.call({ addWatchFile: () => {} }, "some-other-id")).toBeNull();
  });
});

/**
 * §3.9 — the route-action manifest, computed from a REAL Rollup graph.
 *
 * `reachabilityFrom` and `verifyRouteChains` have existed and been tested since
 * `83c81d4`, and nothing called them from a build. This is the call, and it is
 * driven through `vite build` rather than a mocked plugin context — the walk was
 * verified against a real Vite 8 / rolldown graph before it was written, and a
 * mock that agrees with the implementation proves only that they agree.
 */
describe("the build-time route-action check", () => {
  test("a route's reachable server functions are found through the real module graph", async () => {
    const root = project({
      "index.html": `<!doctype html><html><body><script type="module" src="/src/entry.ts"></script></body></html>`,
      // The synthesized client half of a server-function module: what the
      // compiler emits, `clientRpc("<id>")` and nothing else.
      "src/actions.ts": `export const clientRpc = (id) => () => id;
export const deleteUser = clientRpc("actions.ts#deleteUser");
export const listUsers = clientRpc("actions.ts#listUsers");
`,
      "src/routes/admin.$id.tsx": `import { deleteUser } from "../actions.ts";
export const loader = async () => deleteUser();
export const Component = () => "admin";
`,
      "src/routes/index.tsx": `export const Component = () => "home";
`,
      "src/entry.ts": `import { routes } from "virtual:barq-routes";
console.log(routes.length);
`,
    });

    let seen: Map<string, ReadonlySet<string>> | null = null;
    const { build } = (await import("vite")) as typeof import("vite");
    await build({
      root,
      logLevel: "silent",
      build: { write: false },
      plugins: [
        stubCore(),
        barqRouter({
          types: false,
          verify: {
            check(reachability) {
              seen = reachability as Map<string, ReadonlySet<string>>;
              return "";
            },
          },
        }),
      ],
    });

    expect(seen).not.toBeNull();
    const reachability = seen as unknown as Map<string, ReadonlySet<string>>;
    // The route that imports the actions module reaches BOTH its ids — the
    // stub declares every export regardless of what the importer used, which
    // `manifest.ts` states as a deliberate over-restriction rather than an
    // oversight.
    expect([...(reachability.get("/admin/$id") ?? [])].toSorted()).toEqual([
      "actions.ts#deleteUser",
      "actions.ts#listUsers",
    ]);
    // …and a route that imports nothing reaches nothing.
    expect([...(reachability.get("/") ?? [])]).toEqual([]);
  }, 60_000);

  test("a violation fails the build, and `warn` does not", async () => {
    const root = project({
      "index.html": `<!doctype html><html><body><script type="module" src="/src/entry.ts"></script></body></html>`,
      "src/actions.ts": `export const clientRpc = (id) => () => id;
export const wipe = clientRpc("actions.ts#wipe");
`,
      "src/routes/admin.tsx": `import { wipe } from "../actions.ts";
export const loader = async () => wipe();
export const Component = () => "admin";
`,
      "src/entry.ts": `import { routes } from "virtual:barq-routes";
console.log(routes.length);
`,
    });

    const { build } = (await import("vite")) as typeof import("vite");
    const run = (onViolation: "error" | "warn"): Promise<unknown> =>
      build({
        root,
        logLevel: "silent",
        build: { write: false },
        plugins: [
          stubCore(),
          barqRouter({
            types: false,
            verify: { onViolation, check: () => "wipe does not carry /admin's middleware" },
          }),
        ],
      });

    expect(run("error")).rejects.toThrow(/does not carry/);
    // A warning leaves the build standing, which is what a project adopting the
    // check incrementally needs.
    await run("warn");
  }, 60_000);

  test("no `verify` means the hook does nothing at all", async () => {
    // A check that silently verifies nothing is worse than one that says it is
    // not running, so this is opt-in and its absence is a no-op rather than an
    // empty pass.
    const plugin = barqRouter({ types: false });
    expect((plugin as unknown as { buildEnd?: unknown }).buildEnd).toBeDefined();
    await (plugin as unknown as { buildEnd: (this: unknown) => Promise<void> }).buildEnd.call({
      getModuleIds: () => {
        throw new Error("must not be consulted when `verify` is absent");
      },
    });
  });
});
