/**
 * The build half: ask the compiler for the route table, serve it, invalidate it.
 *
 * The scan, the naming rules, the tree and both emits all live in
 * `compiler-rs`'s `routes.rs`. This file reads no directory, derives no route
 * from a filename and builds no string — so a route table cannot mean two
 * things, and there is no second implementation to drift.
 *
 * What stays here is the WATCHER, which is the one part that cannot move: Vite
 * owns file events, so `routeTree` returns the file list and this registers it.
 *
 * `virtual:barq-routes` is resolved in EVERY environment, unlike
 * `@barqjs/start`'s server-function manifest, which is `applyToEnvironment`-
 * scoped away from the client. The difference is what each imports: the manifest
 * pulls in every server-function module, so resolving it client-side would drag
 * all of them into the browser graph, while the route table pulls in route
 * COMPONENTS, which is exactly where the browser wants them. Scoping this one
 * would leave the client with no routes at all.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";

import type { Plugin } from "vite";

import { type Reachability, idsInStub, reachabilityFrom } from "./manifest.ts";

/**
 * The route-action manifest, on the BUILD entry rather than the isomorphic one.
 *
 * `manifest.ts` reaches `@barqjs/start` and therefore `node:async_hooks`;
 * exporting it from `index.ts` put that in the client bundle. Nothing about
 * these runs at runtime.
 */
export {
  type Reachability,
  type VerifyOptions as ChainVerifyOptions,
  type Violation,
  chainOf,
  describe as describeViolations,
  idsInStub,
  reachabilityFrom,
  verifyRouteChains,
} from "./manifest.ts";

export const ROUTES_ID = "virtual:barq-routes";
const RESOLVED_ROUTES_ID = `\0${ROUTES_ID}`;

/**
 * Route id -> the client assets a page must preload to render that route.
 *
 * Resolved in every environment, like the route table and unlike the
 * server-function manifest: what it imports is nothing at all — it is a plain
 * object literal — so there is no graph to drag anywhere.
 *
 * EMPTY in dev, and that is correct rather than unfinished. There are no chunks
 * in dev; Vite serves modules, and the browser's own module graph does the work
 * a preload tag would. The map is a `vite build` artefact for the same reason
 * the route-action manifest is.
 */
export const ROUTE_ASSETS_ID = "virtual:barq-route-assets";
const RESOLVED_ROUTE_ASSETS_ID = `\0${ROUTE_ASSETS_ID}`;

/** What `compiler-rs` answers with. */
export interface RouteTree {
  /** The module `virtual:barq-routes` resolves to. */
  readonly module: string;
  /** The `.d.ts` to write beside the source. */
  readonly types: string;
  /** Every route file found, project-relative — for the watcher. */
  readonly files: string[];
  /** Every leaf pattern, which is what `BARQ013` checks a `<Link to>` against. */
  readonly patterns: string[];
  /** Route id to source file, layouts included — the build-time checks' input. */
  readonly entries: { id: string; file: string }[];
  /**
   * Declarations a route made that are not literals, for this plugin to report.
   *
   * `export const prerender = shouldPrerender()` decides whether a page exists
   * on a CDN, so a table that guessed at it would be the silent failure the
   * whole generator exists to avoid.
   */
  readonly warnings: string[];
}

interface Native {
  routeTree(root: string, dir: string, typesDir?: string): RouteTree;
}

const native = createRequire(import.meta.url)("@barqjs/compiler-rs") as Native;

/**
 * Scan and generate. Exported so a build script can do it without a dev server.
 *
 * `typesDir` is where the `.d.ts` will be written, project-relative, and it is
 * not cosmetic: the type references the generator emits are relative to that
 * file, because a root-absolute `typeof import("/src/...")` is the FILESYSTEM
 * root to TypeScript and silently resolves to `any`.
 */
export function routeTree(root: string, dir: string, typesDir = ""): RouteTree {
  return native.routeTree(root, dir, typesDir);
}

/**
 * How a route's server-function reachability is verified against its declared
 * middleware, and where the answer comes from.
 *
 * The walk and the verifier have existed and been tested since `83c81d4`;
 * nothing called them from a build. This is the call.
 */
export interface VerifyOptions {
  /**
   * Given route -> reachable server-fn ids, answer with a report or `""`.
   *
   * A CALLBACK rather than a route table, because the check needs two things
   * this plugin cannot have: the application's route definitions with their
   * `middleware` closures, and the server-side `REGISTRY` those ids resolve
   * against. Both live in the ssr environment and are reached through
   * `environment.runner.import` — `packages/start/src/vite.ts` does exactly that
   * for the server-function manifest. Handing the caller the graph fact and
   * letting it supply the rest keeps this plugin out of the business of
   * importing an application.
   */
  readonly check: (reachability: Reachability) => string | Promise<string>;
  /** What to do when a route reaches an action that does not carry its chain. */
  readonly onViolation?: "error" | "warn";
}

export interface BarqRouterOptions {
  /** Where route files live, relative to the Vite root. */
  readonly routesDir?: string;
  /** Where to write the generated `.d.ts`. `false` writes none. */
  readonly types?: string | false;
  /**
   * Told the leaf patterns after every scan.
   *
   * This is how `BARQ013` gets its route set: the compiler plugin needs it as a
   * `routes` option, and it must come from the SAME scan the table was built
   * from or the check is against a different project than the one that shipped.
   */
  readonly onRoutes?: (patterns: readonly string[]) => void;
  /**
   * Verify at BUILD time that every server function a route can reach carries
   * that route's declared middleware.
   *
   * DEV DIVERGENCE, and it is stated rather than papered over: the dev module
   * graph is one level deep until each module is itself requested, so a
   * whole-graph walk in dev finds nothing. This is a `vite build` artefact.
   * Arming a gate in dev against a manifest dev never produces would fail every
   * cold start.
   */
  readonly verify?: VerifyOptions;
}

export function barqRouter(options: BarqRouterOptions = {}): Plugin {
  const routesDir = options.routesDir ?? "src/routes";
  let root = process.cwd();
  let base = "/";
  let routeAssets: Record<string, string[]> = {};
  let tree: RouteTree = {
    module: "",
    types: "",
    files: [],
    patterns: [],
    entries: [],
    warnings: [],
  };

  const typesFile = options.types === false ? null : (options.types ?? "src/routes.gen.d.ts");

  const rescan = (warn?: (message: string) => void): void => {
    tree = routeTree(root, routesDir, typesFile === null ? "" : dirname(typesFile));
    for (const warning of tree.warnings ?? []) warn?.(`[barq-router] ${warning}`);
    options.onRoutes?.(tree.patterns);
    if (typesFile === null) return;
    try {
      // The directory first: `types` may name a path that does not exist yet,
      // and the catch below would have swallowed the `ENOENT` — so the file
      // silently was not written and the project typechecked against nothing.
      mkdirSync(dirname(join(root, typesFile)), { recursive: true });
      writeFileSync(join(root, typesFile), tree.types);
    } catch {
      // A read-only checkout still builds; the types are a convenience.
    }
  };

  return {
    name: "barq-router",

    /**
     * The route-action manifest, computed from the REAL client module graph.
     *
     * `this.getModuleIds()` plus `getModuleInfo(id).importedIds` is the static
     * import graph, which is exactly `reachabilityFrom`'s `importsOf`. Verified
     * against a real Vite 8 / rolldown build before this was written: a route
     * module's `importedIds` carries the data module it imports, and the
     * synthesized client stub's `clientRpc("<id>")` literals are readable out
     * of the transformed source.
     *
     * `buildEnd` and not `generateBundle`: the graph is complete here and the
     * answer is about MODULES, not chunks.
     */
    async buildEnd(this: unknown) {
      const verify = options.verify;
      if (verify === undefined) return;
      const context = this as {
        getModuleIds: () => Iterable<string>;
        getModuleInfo: (id: string) => { importedIds: readonly string[]; code?: string } | null;
        environment?: { name?: string };
        error: (message: string) => never;
        warn: (message: string) => void;
      };
      // The CLIENT graph only. The ssr environment holds the server halves,
      // where every function is present by construction and reachability means
      // nothing.
      if ((context.environment?.name ?? "client") !== "client") return;

      // Route id -> the module id the bundler knows it by. `tree.entries` is the
      // compiler's map, and it is matched by SUFFIX because Rollup ids are
      // absolute while the generator's paths are project-relative.
      const byId = new Map<string, string>();
      const ids = [...context.getModuleIds()];
      for (const entry of tree.entries) {
        const found = ids.find((id) => id.endsWith(entry.file));
        if (found !== undefined) byId.set(entry.id, found);
      }
      if (byId.size === 0) return;

      const reachability = reachabilityFrom(
        byId,
        (id) => context.getModuleInfo(id)?.importedIds ?? [],
        (id) => {
          const code = context.getModuleInfo(id)?.code;
          return code === undefined ? [] : idsInStub(code);
        },
      );

      const answer = await verify.check(reachability);
      if (answer === "") return;
      if (verify.onViolation === "warn") {
        context.warn(answer);
        return;
      }
      context.error(answer);
    },

    configResolved(config) {
      root = config.root;
      base = config.base ?? "/";
      rescan((message) => config.logger.warn(message));
    },

    /**
     * Route id -> chunk plus its static imports, read off the real bundle.
     *
     * `chunk.imports` is Rollup's already-flattened static import set for the
     * chunk, so the transitive closure is not this plugin's to compute. A route
     * is matched to its chunk through `facadeModuleId`/`moduleIds` and the
     * compiler's `src`, which is the whole reason that field exists.
     */
    generateBundle(_output, bundle) {
      if ((this as { environment?: { name?: string } }).environment?.name === "ssr") return;
      const byFile = new Map<string, string[]>();
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== "chunk") continue;
        const assets = [chunk.fileName, ...chunk.imports];
        for (const moduleId of Object.keys(chunk.modules)) {
          byFile.set(moduleId, assets);
        }
      }
      const next: Record<string, string[]> = {};
      for (const entry of tree.entries) {
        for (const [moduleId, assets] of byFile) {
          if (moduleId.endsWith(entry.file)) {
            next[entry.id] = assets.map((file) => `${base}${file}`);
            break;
          }
        }
      }
      routeAssets = next;
    },

    resolveId(id) {
      if (id === ROUTES_ID) return RESOLVED_ROUTES_ID;
      return id === ROUTE_ASSETS_ID ? RESOLVED_ROUTE_ASSETS_ID : null;
    },

    load(id) {
      if (id === RESOLVED_ROUTE_ASSETS_ID) {
        return `export const routeAssets = ${JSON.stringify(routeAssets)};\nexport default routeAssets;\n`;
      }
      if (id !== RESOLVED_ROUTES_ID) return null;
      // Watched here rather than in `configResolved`, so the dependency is
      // recorded against the module that actually uses it.
      for (const file of tree.files) this.addWatchFile(join(root, file));
      return tree.module;
    },

    configureServer(server) {
      const changed = (path: string): void => {
        if (relative(join(root, routesDir), path).startsWith("..")) return;
        rescan((message) => server.config.logger.warn(message));
        // A route file appearing or vanishing changes the TABLE, and the table
        // is a different module from the file that changed — without this the
        // dev server keeps serving yesterday's routes. `@barqjs/start`'s
        // manifest does the same thing for the same reason.
        for (const environment of Object.values(server.environments)) {
          const module = environment.moduleGraph.getModuleById(RESOLVED_ROUTES_ID);
          if (module !== undefined && module !== null) {
            environment.moduleGraph.invalidateModule(module);
          }
        }
        server.ws.send({ type: "full-reload" });
      };
      server.watcher.on("add", changed);
      server.watcher.on("unlink", changed);
      // CHANGE too, since `e441950`'s generator started reading a route file's
      // CONTENTS: `export const ssr = false` edited inside an existing file
      // moves the table, and with only add/unlink registered the dev server kept
      // serving the mode the file had when it appeared.
      server.watcher.on("change", changed);
    },
  };
}
