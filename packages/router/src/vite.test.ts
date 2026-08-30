import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import { DEFAULT_ROUTE_TREE, barqRouter, routeTree } from "./vite.ts";

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
  configResolved(config: {
    root: string;
    command?: string;
    logger?: { warn(message: string): void };
  }): void;
  resolveId(id: string): string | null;
  load(id: string): string | null;
};

const hooks = (plugin: ReturnType<typeof barqRouter>): Hooks => plugin as unknown as Hooks;

/**
 * `configResolved`, with what the plugin actually reads off it.
 *
 * `command` decides whether the generator may rewrite a route's id literal in
 * the source file, so a test that omits it is testing the BUILD path.
 */
const resolve = (plugin: Hooks, root: string, command = "build"): { warnings: string[] } => {
  const warnings: string[] = [];
  plugin.configResolved({ root, command, logger: { warn: (m) => warnings.push(m) } });
  return { warnings };
};

/**
 * `@barqjs/core` and `@barqjs/router`, stubbed.
 *
 * The generated table imports `Outlet` from the router for any route that
 * declares no component of its own, and a temp project outside the workspace
 * cannot resolve it. Stubbing keeps the test hermetic and about the GRAPH,
 * which is what it measures — the real implementations would change nothing.
 */
const STUBS: Record<string, string> = {
  // `lazy` is what the SPLIT rewrite reaches for, so the stub has to offer it —
  // the shape, not the behaviour, is what these graph tests measure.
  "@barqjs/core":
    "export const lazy = (load, pick) => Object.assign(() => null, { preload: load, pick });",
  "@barqjs/router":
    "export const Outlet = () => null;\nexport const createFileRoute = (id) => (options) => ({ id, options });",
};

const stubCore = (): {
  name: string;
  resolveId(id: string): string | null;
  load(id: string): string | null;
} => ({
  name: "stub-core",
  resolveId: (id) => (id in STUBS ? `\0stub${id}` : null),
  load: (id) => (id.startsWith("\0stub") ? (STUBS[id.slice("\0stub".length)] ?? null) : null),
});

/**
 * The scan and both emits are `compiler-rs`'s, and `routes.rs` holds their unit
 * tests. What is left to check here is that this plugin ASKS correctly and
 * invalidates correctly — the two things that could not move into Rust.
 */
describe("routeTree, across the napi boundary", () => {
  test("finds routes in nested directories, skipping tests", () => {
    const root = project({
      "src/routes/index.tsx":
        'export const Route = createFileRoute("/")({ component: () => null });',
      "src/routes/about.tsx":
        'export const Route = createFileRoute("/about")({ component: () => null });',
      "src/routes/users/$id.tsx":
        'export const Route = createFileRoute("/users/$id")({ component: () => null });',
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
    expect(tree.source).toContain("export const routeTree");
  });
});

describe("the plugin", () => {
  test("writes the tree where it was told, and reports the patterns from the SAME scan", () => {
    // BARQ013's route set has to come from the scan the table was built from,
    // or the check runs against a different project than the one that ships.
    const root = project({
      "src/routes/index.tsx":
        'export const Route = createFileRoute("/")({ component: () => null });',
      "src/routes/users.tsx":
        'export const Route = createFileRoute("/users")({ component: () => null });',
      "src/routes/users.$id.tsx":
        'export const Route = createFileRoute("/users/$id")({ component: () => null });',
    });
    let reported: readonly string[] = [];
    const plugin = hooks(barqRouter({ onRoutes: (p) => (reported = p) }));
    resolve(plugin, root);

    expect(reported.toSorted()).toEqual(["/", "/users/$id"]);

    const written = readFileSync(join(root, DEFAULT_ROUTE_TREE), "utf8");
    // A REAL file the application imports by path, holding the table AND the
    // types — not a virtual module and not a `.d.ts` beside one.
    expect(written).toContain("export const routeTree");
    expect(written).toContain('import { Route as UsersIdRoute } from "./routes/users.$id";');
    // The whole option set rides through the spread, which is the point of the
    // static import: `validateSearch`, `beforeLoad` and `errorComponent` are all
    // read synchronously by the router and a `lazy()` cannot answer for them.
    expect(written).toContain("...UsersIdRoute.options");
    expect(written).not.toContain("lazy(");
    // And the types REGISTER themselves, which is what makes `<Link to>` typed.
    expect(written).toContain('declare module "@barqjs/router"');
    expect(written).toContain("routeTree: FileRouteTypes;");
  });

  test("`routeTree: false` writes nothing at all", () => {
    const root = project({
      "src/routes/index.tsx":
        'export const Route = createFileRoute("/")({ component: () => null });',
    });
    const plugin = hooks(barqRouter({ routeTree: false }));
    resolve(plugin, root);
    expect(() => readFileSync(join(root, DEFAULT_ROUTE_TREE), "utf8")).toThrow();
  });

  /**
   * The file this writes lives inside the directory the dev server watches, so
   * rewriting identical bytes on every scan is a LOOP — not a wasted write.
   */
  test("an unchanged tree is not rewritten", () => {
    const root = project({
      "src/routes/index.tsx":
        'export const Route = createFileRoute("/")({ component: () => null });',
    });
    const plugin = hooks(barqRouter({}));
    resolve(plugin, root);

    const target = join(root, DEFAULT_ROUTE_TREE);
    const first = statSync(target).mtimeMs;
    // A marker that survives only if nothing writes over it.
    const contents = readFileSync(target, "utf8");
    writeFileSync(target, contents);
    const stamped = statSync(target).mtimeMs;

    resolve(plugin, root);
    expect(statSync(target).mtimeMs).toBe(stamped);
    expect(first).toBeLessThanOrEqual(stamped);
    expect(readFileSync(target, "utf8")).toBe(contents);
  });

  test("the import specifiers follow where it is written", () => {
    // A root-absolute specifier is the FILESYSTEM root to TypeScript, so it
    // resolved to `any` and every generated type became permissive — caught
    // because the `@ts-expect-error` directives in the check file went UNUSED
    // rather than because anything failed.
    const root = project({
      "src/routes/index.tsx":
        'export const Route = createFileRoute("/")({ component: () => null });',
    });
    const plugin = hooks(barqRouter({ routeTree: "src/generated/tree.gen.ts" }));
    resolve(plugin, root);
    const written = readFileSync(join(root, "src/generated/tree.gen.ts"), "utf8");
    expect(written).toContain('from "../routes/index"');
  });

  test("load returns null for anything but the route assets", () => {
    const root = project({
      "src/routes/index.tsx":
        'export const Route = createFileRoute("/")({ component: () => null });',
    });
    const plugin = hooks(barqRouter({ routeTree: false }));
    resolve(plugin, root);
    expect(plugin.resolveId("something-else")).toBeNull();
    expect(plugin.load("some-other-id")).toBeNull();
  });
});

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
export const Route = { options: { loader: async () => deleteUser(), component: () => "admin" } };
`,
      "src/routes/index.tsx": `export const Route = { options: { component: () => "home" } };
`,
      "src/entry.ts": `import { routeTree } from "./routeTree.gen.ts";
console.log(routeTree.length);
`,
    });

    let seen: Map<string, ReadonlySet<string>> | null = null;
    const { build } = await import("vite");
    await build({
      root,
      logLevel: "silent",
      build: { write: false },
      plugins: [
        stubCore(),
        barqRouter({
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
export const Route = { options: { loader: async () => wipe(), component: () => "admin" } };
`,
      "src/entry.ts": `import { routeTree } from "./routeTree.gen.ts";
console.log(routeTree.length);
`,
    });

    const { build } = await import("vite");
    const run = (onViolation: "error" | "warn"): Promise<unknown> =>
      build({
        root,
        logLevel: "silent",
        build: { write: false },
        plugins: [
          stubCore(),
          barqRouter({
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
    const plugin = barqRouter({ routeTree: false });
    expect((plugin as unknown as { buildEnd?: unknown }).buildEnd).toBeDefined();
    await (plugin as unknown as { buildEnd: (this: unknown) => Promise<void> }).buildEnd.call({
      getModuleIds: () => {
        throw new Error("must not be consulted when `verify` is absent");
      },
    });
  });
});

/**
 * A route declares its own render mode, and the table carries it.
 *
 * `RouteDefinition.ssr` has existed since the router landed and the generator
 * never emitted it — and could not ask for it, because the route module is
 * `lazy()` and both `ssr` and `prerender` are wanted before it loads. So a
 * file-based route could not say either one, which is the gap gap-5's
 * "per-route render mode" fell into.
 *
 * Both are properties of the route's OPTIONS now. A top-level `export const ssr`
 * is no longer a second way to say it — it is reported, so a half-migrated file
 * is loud rather than silently server-rendered.
 */
describe("a route's own declarations", () => {
  test("a literal `ssr` and `prerender` reach the emitted table", () => {
    const root = project({
      "src/routes/index.tsx": 'export const Route = createFileRoute("/")({ component: Home });',
      "src/routes/about.tsx":
        'export const Route = createFileRoute("/about")({ ssr: "data-only", prerender: true });',
    });
    const tree = routeTree(root, "src/routes");
    const about = tree.source.split("\n").find((line) => line.includes('"/about"')) ?? "";
    expect(about).toContain('ssr: "data-only"');
    expect(about).toContain("prerender: true");
    // A route that declares nothing emits nothing, so the runtime default stays
    // the runtime's to decide rather than the generator's.
    const home = tree.source.split("\n").find((line) => line.includes('"/"')) ?? "";
    expect(home).not.toContain("ssr:");
    expect(home).not.toContain("prerender:");
    expect(tree.warnings).toEqual([]);
  });

  test("a declaration that is not a literal is REPORTED, not guessed at", () => {
    const root = project({
      "src/routes/feed.tsx":
        'export const Route = createFileRoute("/feed")({ prerender: shouldPrerender() });',
    });
    const tree = routeTree(root, "src/routes");
    const feed = tree.source.split("\n").find((line) => line.includes('"/feed"')) ?? "";
    expect(feed).not.toContain("prerender:");
    expect(tree.warnings).toHaveLength(1);
    expect(tree.warnings[0]).toContain("feed.tsx");
    expect(tree.warnings[0]).toContain("not a literal");
  });

  /**
   * The OLD spelling is reported rather than honoured.
   *
   * A file that kept `export const ssr = false` through the migration would
   * otherwise lose it silently and be server-rendered — the exact failure this
   * channel exists to prevent.
   */
  test("a top-level `export const ssr` is reported, not read", () => {
    const root = project({
      "src/routes/admin.tsx":
        "export const ssr = false;\n" +
        'export const Route = createFileRoute("/admin")({ component: Admin });',
    });
    const tree = routeTree(root, "src/routes");
    const admin = tree.source.split("\n").find((line) => line.includes('"/admin"')) ?? "";
    expect(admin).not.toContain("ssr:");
    expect(tree.warnings).toHaveLength(1);
    expect(tree.warnings[0]).toContain("`export const ssr` is no longer read");
  });

  /**
   * The id literal is GENERATOR-OWNED: it is derived from the filename, so a
   * rename makes it wrong. Serving rewrites it in place; building refuses.
   */
  test("an id that disagrees with the filename is rewritten when serving", () => {
    const root = project({
      "src/routes/posts.$id.tsx":
        'export const Route = createFileRoute("/posts/$postId")({ component: Post });',
    });

    const stale = routeTree(root, "src/routes");
    expect(stale.rewritten).toEqual([]);
    expect(stale.mismatches).toEqual([
      { file: "src/routes/posts.$id.tsx", declared: "/posts/$postId", expected: "/posts/$id" },
    ]);

    const rewritten = routeTree(root, "src/routes", DEFAULT_ROUTE_TREE, true);
    expect(rewritten.rewritten).toEqual(["src/routes/posts.$id.tsx"]);
    expect(rewritten.mismatches).toEqual([]);
    // A byte splice on the parsed span: the literal changes and nothing else.
    expect(readFileSync(join(root, "src/routes/posts.$id.tsx"), "utf8")).toBe(
      'export const Route = createFileRoute("/posts/$id")({ component: Post });',
    );
  });

  test("a build refuses an id it will not rewrite", () => {
    const root = project({
      "src/routes/posts.$id.tsx":
        'export const Route = createFileRoute("/posts/$postId")({ component: Post });',
    });
    const plugin = hooks(barqRouter({ routeTree: false }));
    expect(() => resolve(plugin, root, "build")).toThrow(/disagree with the id their filename/);
  });
});

/**
 * Automatic code splitting, through a REAL build.
 *
 * The split is what pays back the static route table: the tree imports every
 * route module eagerly so a file route can declare `validateSearch`,
 * `beforeLoad` and the cache options — all of which the router reads
 * synchronously — and the component would otherwise be eager with it. Measured
 * on `packages/kitchen-sink`: 266 kB in one chunk unsplit, 174 kB across six
 * split.
 */
describe("automatic code splitting", () => {
  test("a component leaves the reference module, and the loader's imports stay", async () => {
    const root = project({
      "index.html": `<!doctype html><html><body><script type="module" src="/src/entry.ts"></script></body></html>`,
      // Markers a minifier cannot rewrite away: a string literal survives, and
      // `["a"]` did not — rolldown reprints it with backticks and the first
      // version of this test failed on its own marker rather than on the split.
      "src/data.ts": `export const fetchPosts = () => "LOADER_MARKER_9f1";\n`,
      "src/heavy.ts": `export const Heavy = () => "COMPONENT_MARKER_4c2";\n`,
      "src/routes/posts.tsx": `import { createFileRoute } from "@barqjs/router";
import { fetchPosts } from "../data.ts";
import { Heavy } from "../heavy.ts";
function Posts() { return Heavy(); }
export const Route = createFileRoute("/posts")({
  loader: () => fetchPosts(),
  component: Posts,
});
`,
      "src/entry.ts": `import { routeTree } from "./routeTree.gen.ts";\nconsole.log(routeTree.length);\n`,
    });

    const chunks: Record<string, string> = {};
    const { build } = await import("vite");
    await build({
      root,
      logLevel: "silent",
      build: { write: false },
      plugins: [
        stubCore(),
        barqRouter({}),
        {
          name: "capture",
          generateBundle(
            _options: unknown,
            bundle: Record<string, { type: string; code?: string }>,
          ) {
            for (const [name, chunk] of Object.entries(bundle)) {
              if (chunk.type === "chunk" && chunk.code !== undefined) chunks[name] = chunk.code;
            }
          },
        },
      ],
    });

    const all = Object.values(chunks);
    // The component and the loader are in DIFFERENT chunks, which is the whole
    // claim. Asserted as a partition rather than by chunk name, since a bundler
    // names them however it likes.
    const withComponent = all.filter((code) => code.includes("COMPONENT_MARKER_4c2"));
    const withLoader = all.filter((code) => code.includes("LOADER_MARKER_9f1"));
    expect(withComponent).not.toHaveLength(0);
    expect(withLoader).not.toHaveLength(0);
    expect(withComponent.some((code) => withLoader.includes(code))).toBe(false);
    // …and the reference half reaches the other one through a DYNAMIC import,
    // which is what makes them separate chunks at all.
    expect(withLoader.some((code) => code.includes("import("))).toBe(true);
  }, 60_000);

  test("`codeSplitting: false` leaves the module whole", async () => {
    const root = project({
      "index.html": `<!doctype html><html><body><script type="module" src="/src/entry.ts"></script></body></html>`,
      "src/heavy.ts": `export const Heavy = () => "heavy";\n`,
      "src/routes/posts.tsx": `import { createFileRoute } from "@barqjs/router";
import { Heavy } from "../heavy.ts";
function Posts() { return Heavy(); }
export const Route = createFileRoute("/posts")({ component: Posts });
`,
      "src/entry.ts": `import { routeTree } from "./routeTree.gen.ts";\nconsole.log(routeTree.length);\n`,
    });

    const chunks: string[] = [];
    const { build } = await import("vite");
    await build({
      root,
      logLevel: "silent",
      build: { write: false },
      plugins: [
        stubCore(),
        barqRouter({ codeSplitting: false }),
        {
          name: "capture",
          generateBundle(
            _options: unknown,
            bundle: Record<string, { type: string; code?: string }>,
          ) {
            for (const chunk of Object.values(bundle)) {
              if (chunk.type === "chunk" && chunk.code !== undefined) chunks.push(chunk.code);
            }
          },
        },
      ],
    });
    expect(chunks.some((code) => code.includes("$$barqSplit"))).toBe(false);
  }, 60_000);

  /**
   * THE GATE THAT MATTERS MOST HERE, and it is a security-adjacent one.
   *
   * Once a component moves into a chunk of its own, the edge to it is a DYNAMIC
   * import — which Rollup reports on `dynamicallyImportedIds` and not on
   * `importedIds`. A route-action walk reading only the static edges would stop
   * finding a server function that only a component calls, and this check
   * under-reporting is the one failure mode it must not have.
   */
  test("a server function only the COMPONENT calls is still reachable from the route", async () => {
    const root = project({
      "index.html": `<!doctype html><html><body><script type="module" src="/src/entry.ts"></script></body></html>`,
      "src/actions.ts": `export const clientRpc = (id) => () => id;
export const wipe = clientRpc("actions.ts#wipe");
`,
      "src/routes/admin.tsx": `import { createFileRoute } from "@barqjs/router";
import { wipe } from "../actions.ts";
function Admin() { return wipe(); }
export const Route = createFileRoute("/admin")({ component: Admin });
`,
      "src/entry.ts": `import { routeTree } from "./routeTree.gen.ts";\nconsole.log(routeTree.length);\n`,
    });

    let seen: Map<string, ReadonlySet<string>> | null = null;
    const { build } = await import("vite");
    await build({
      root,
      logLevel: "silent",
      build: { write: false },
      plugins: [
        stubCore(),
        barqRouter({
          verify: {
            check(reachability) {
              seen = reachability as Map<string, ReadonlySet<string>>;
              return "";
            },
          },
        }),
      ],
    });

    const reachability = seen as unknown as Map<string, ReadonlySet<string>>;
    expect([...(reachability.get("/admin") ?? [])]).toEqual(["actions.ts#wipe"]);
  }, 60_000);
});

/**
 * A route's `server` handlers must not reach the browser.
 *
 * The strip is NOT a size optimisation, which is why it runs even with code
 * splitting off: a handler's body is the route's database query, its secret and
 * its `node:` imports, and the static route tree pulls the module into the
 * client graph by construction. Theirs deletes the same node.
 */
describe("the server half of a route", () => {
  const project_ = () =>
    project({
      "index.html": `<!doctype html><html><body><script type="module" src="/src/entry.ts"></script></body></html>`,
      "src/db.ts": `export const db = { all: () => "DB_MARKER_7a3" };\n`,
      "src/routes/api.users.ts": `import { createFileRoute } from "@barqjs/router";
import { db } from "../db.ts";
const SECRET_MARKER_b12 = "shhh";
export const Route = createFileRoute("/api/users")({
  server: {
    handlers: {
      GET: async () => Response.json({ rows: db.all(), token: SECRET_MARKER_b12 }),
    },
  },
});
`,
      "src/routes/index.tsx": `import { createFileRoute } from "@barqjs/router";
export const Route = createFileRoute("/")({ component: () => "home" });
`,
      "src/entry.ts": `import { routeTree } from "./routeTree.gen.ts";\nconsole.log(routeTree.length);\n`,
    });

  const bundleFor = async (
    environmentName: "client" | "ssr",
    options: Parameters<typeof barqRouter>[0] = {},
  ): Promise<string> => {
    const root = project_();
    const chunks: string[] = [];
    const { build } = await import("vite");
    await build({
      root,
      logLevel: "silent",
      build: { write: false },
      ...(environmentName === "ssr" ? { build: { write: false, ssr: "src/entry.ts" } } : {}),
      plugins: [
        stubCore(),
        barqRouter(options),
        {
          name: "capture",
          generateBundle(_o: unknown, bundle: Record<string, { type: string; code?: string }>) {
            for (const chunk of Object.values(bundle)) {
              if (chunk.type === "chunk" && chunk.code !== undefined) chunks.push(chunk.code);
            }
          },
        },
      ],
    });
    return chunks.join("\n");
  };

  test("the handler, its imports and its secrets are absent from the CLIENT bundle", async () => {
    const client = await bundleFor("client");
    expect(client).not.toContain("SECRET_MARKER_b12");
    expect(client).not.toContain("DB_MARKER_7a3");
    expect(client).not.toContain("handlers");
    // …and the table still built, so the route is still routable in the browser.
    expect(client).toContain("/api/users");
  }, 60_000);

  test("the strip runs even with `codeSplitting: false`", async () => {
    // It is not a size optimisation. Turning splitting off must not put a
    // database query back in the browser.
    const client = await bundleFor("client", { codeSplitting: false });
    expect(client).not.toContain("SECRET_MARKER_b12");
    expect(client).not.toContain("DB_MARKER_7a3");
  }, 60_000);

  test("the SERVER bundle keeps them, because they are the whole point", async () => {
    const server = await bundleFor("ssr");
    expect(server).toContain("DB_MARKER_7a3");
    expect(server).toContain("SECRET_MARKER_b12");
  }, 60_000);
});
