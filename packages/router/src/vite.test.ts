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
