import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import { ROUTES_ID, barqRouter, discover } from "./vite.ts";

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

/** The plugin's hooks, as the loose shapes these tests need. */
type Hooks = {
  configResolved(config: { root: string }): void;
  resolveId(id: string): string | null;
  load(this: { addWatchFile(f: string): void }, id: string): string | null;
};

const hooks = (plugin: ReturnType<typeof barqRouter>): Hooks => plugin as unknown as Hooks;

describe("discover", () => {
  test("finds routes in nested directories, skipping tests", () => {
    const root = project({
      "src/routes/index.tsx": "",
      "src/routes/about.tsx": "",
      "src/routes/users/$id.tsx": "",
      "src/routes/about.test.tsx": "",
      "src/routes/notes.md": "",
    });

    expect(
      discover(root, "src/routes")
        .map((f) => f.name)
        .toSorted(),
    ).toEqual(["about", "index", "users.$id"]);
  });

  test("a directory separator and a dot name the same route", () => {
    const root = project({ "src/routes/users/$id.tsx": "" });
    expect(discover(root, "src/routes")[0]?.name).toBe("users.$id");
  });

  test("a project with no routes directory is not an error", () => {
    const root = project({ "src/main.tsx": "" });
    expect(discover(root, "src/routes")).toEqual([]);
  });
});

describe("the plugin", () => {
  test("resolves the virtual id and loads a table", () => {
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
    // Every route file is watched, so adding or removing one can invalidate the
    // table — the table is a different module from the file that changed.
    expect(watched).toHaveLength(3);
  });

  test("writes the types beside the routes", () => {
    const root = project({ "src/routes/users.$id.tsx": "export default () => null;" });
    const plugin = hooks(barqRouter({ types: "src/routes.gen.d.ts" }));
    plugin.configResolved({ root });

    const written = Bun.file(join(root, "src/routes.gen.d.ts"));
    expect(written.size).toBeGreaterThan(0);
  });

  test("load returns null for anything else", () => {
    const root = project({ "src/routes/index.tsx": "" });
    const plugin = hooks(barqRouter({ types: false }));
    plugin.configResolved({ root });
    expect(plugin.load.call({ addWatchFile: () => {} }, "some-other-id")).toBeNull();
  });
});
