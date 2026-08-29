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
 * THE TABLE IS A FILE, not a virtual module. `src/routeTree.gen.ts` is written
 * into the project and imported by path, which is TanStack's arrangement
 * (`examples/react/start-basic/src/router.tsx:2`) and buys three things a
 * virtual specifier cannot: the route modules are imported STATICALLY, so a
 * route's whole option set reaches the router; the types live in the same file
 * as the values, so they are inferred rather than reconstructed; and a person
 * can open it. The only virtual module left here is `routeAssets`, which is a
 * plain object literal the BUNDLE produces and no source file can know.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative } from "node:path";

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

/** Where the generated tree is written when nothing says otherwise. */
export const DEFAULT_ROUTE_TREE = "src/routeTree.gen.ts";

/**
 * The query that marks a route's SPLIT half.
 *
 * The static tree is what lets a file route declare `validateSearch`,
 * `beforeLoad`, `errorComponent` and the cache options — every one of them is
 * read synchronously off `route.definition` and a `lazy()` cannot answer
 * synchronously. The price is an eager component, and this is where it is paid
 * back: `compiler-rs`'s `route_split` rewrites the module into the half the
 * tree imports and the half it `import()`s, which is where TanStack splits too
 * (`router-plugin/src/core/constants.ts:4-16`).
 *
 * A QUERY rather than a second path, so the bundler resolves it against the
 * same file and a sourcemap still points at the source the author wrote.
 */
export const SPLIT_QUERY = "barq-split";

/** What the scan considers a route file, and what the split hook matches. */
const ROUTE_EXTENSIONS = [".tsx", ".jsx", ".ts", ".js"];

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
  /** The contents of `routeTree.gen.ts` — the table AND its types. */
  readonly source: string;
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
  /**
   * Route files whose `createFileRoute` id literal disagrees with the id their
   * FILENAME derives, and that were not rewritten.
   *
   * The literal is generator-owned, so a rename makes it wrong. Dev rewrites it
   * in place; a build refuses, because CI must not pass on a file the build
   * silently edited.
   */
  readonly mismatches: { file: string; declared: string; expected: string }[];
  /** Route files whose id literal was rewritten on disk. */
  readonly rewritten: string[];
}

/** Both halves of a code-split route module. */
export interface RouteSplit {
  /** What the generated tree imports. */
  readonly reference: string;
  /** What `<file>?barq-split` serves. */
  readonly split: string;
  /**
   * Why the route was not split. Both halves are the original source then, so a
   * refusal costs bytes and never correctness.
   */
  readonly refused?: string;
}

interface Native {
  routeTree(root: string, dir: string, outFile?: string, writeIds?: boolean): RouteTree;
  routeSplit(
    source: string,
    filename: string,
    specifier: string,
    forClient?: boolean,
    splitComponents?: boolean,
  ): RouteSplit;
}

const native = createRequire(import.meta.url)("@barqjs/compiler-rs") as Native;

/**
 * Scan and generate. Exported so a build script can do it without a dev server.
 *
 * `outFile` is where the generated file will be written, project-relative, and
 * it is not cosmetic: every import specifier the generator emits is relative to
 * that file. A root-absolute `import("/src/...")` is the FILESYSTEM root to
 * TypeScript and silently resolves to `any`.
 *
 * `writeIds` lets the generator OWN the `createFileRoute` path literal and
 * rewrite it in the source file when a rename makes it wrong — which is what
 * their plugin does (`router-generator/src/transform/transform.ts:133-140`).
 * Off by default, so nothing writes to a project unless a dev server asked.
 */
export function routeTree(
  root: string,
  dir: string,
  outFile = DEFAULT_ROUTE_TREE,
  writeIds = false,
): RouteTree {
  return native.routeTree(root, dir, outFile, writeIds);
}

/**
 * How a route's server-function reachability is verified against its declared
 * middleware, and where the answer comes from.
 *
 * The walk and the verifier have existed and been tested since `83c81d4`;
 * nothing called them from a build.
 *
 * THE FIRST DESIGN OF THIS WAS UNIMPLEMENTABLE and the comment it replaces said
 * so confidently: it claimed the check could run app code through
 * `environment.runner.import`, "which `packages/start/src/vite.ts` already
 * does". It does — in `configureServer`. `runner` belongs to a
 * `DevEnvironment`; a `vite build` has `BuildEnvironment`s and there is no
 * runner to import through. And the client `buildEnd`, where the module-graph
 * fact IS available, runs before the ssr bundle exists at all.
 *
 * So the halves are split at the only seam that works. This plugin REPORTS the
 * graph fact and nothing else; `@barqjs/start` runs the check in `buildApp`,
 * after the ssr build, against the bundle it imports there anyway — which is
 * where `chainVerifier` on the server entry is called from.
 */
export interface VerifyOptions {
  /**
   * Given route -> reachable server-fn ids, answer with a report or `""`.
   *
   * Called in the CLIENT `buildEnd`, so a caller that needs the server bundle
   * cannot answer here. Prefer `onReachability` plus `barqStart({ verify })`.
   */
  readonly check: (reachability: Reachability) => string | Promise<string>;
  /** What to do when a route reaches an action that does not carry its chain. */
  readonly onViolation?: "error" | "warn";
}

export interface BarqRouterOptions {
  /** Where route files live, relative to the Vite root. */
  readonly routesDir?: string;
  /**
   * Move each route's `component` and `pendingComponent` into a chunk of their
   * own. On by default.
   *
   * Off leaves every route module eager, which is smaller to reason about and
   * larger to download — the whole application's components land in the entry
   * chunk. Measured on `packages/kitchen-sink`: 5 chunks / ~154 kB on the first
   * page with the split, 1 chunk / 266 kB without it.
   */
  readonly codeSplitting?: boolean;
  /**
   * Where to write the generated route tree. `false` writes none.
   *
   * Default `src/routeTree.gen.ts`, which is theirs (`generatedRouteTree`,
   * `router-generator/src/config.ts:50`). The application imports it BY PATH,
   * so this is a real file in the project rather than a virtual specifier only
   * the bundler can resolve.
   */
  readonly routeTree?: string | false;
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
  /**
   * Told which server-function ids each route can reach, after the CLIENT build.
   *
   * The same shape as `onRoutes`, and for the same reason: this plugin holds a
   * fact only the client module graph has, and the consumer of that fact —
   * `barqStart`, which alone can import the built server — is a different
   * plugin. Never called in dev: the dev module graph is one level deep until
   * each module is itself requested, so a whole-graph walk there finds nothing.
   */
  readonly onReachability?: (reachability: Reachability) => void;
}

export function barqRouter(options: BarqRouterOptions = {}): Plugin {
  const routesDir = options.routesDir ?? "src/routes";
  const codeSplitting = options.codeSplitting ?? true;
  let root = process.cwd();
  let base = "/";
  let routeAssets: Record<string, string[]> = {};
  let tree: RouteTree = {
    source: "",
    files: [],
    patterns: [],
    entries: [],
    warnings: [],
    mismatches: [],
    rewritten: [],
  };

  const treeFile = options.routeTree === false ? null : (options.routeTree ?? DEFAULT_ROUTE_TREE);

  /**
   * Serving rewrites the id literal; building refuses to.
   *
   * A build that edits checked-out source surprises CI and can dirty a release
   * commit, so the disagreement is an error there instead — the fix is to run
   * the dev server once, or to correct the literal by hand.
   */
  let writeIds = false;

  /** `<file>?barq-split` — the half the reference module `import()`s. */
  const isSplitId = (id: string): boolean => id.endsWith(`?${SPLIT_QUERY}`);
  const fileOfSplitId = (id: string): string => id.slice(0, -(SPLIT_QUERY.length + 1));

  /**
   * Whether a module is one of THIS project's route files.
   *
   * By path rather than by content: a module outside the routes directory that
   * happens to call `createFileRoute` is not in the table, so splitting it would
   * produce a chunk nothing imports.
   */
  const isRouteFile = (file: string): boolean => {
    if (!ROUTE_EXTENSIONS.some((extension) => file.endsWith(extension))) return false;
    const inside = relative(join(root, routesDir), file);
    return inside !== "" && !inside.startsWith("..") && !isAbsolute(inside);
  };

  const rescan = (warn?: (message: string) => void): void => {
    tree = routeTree(root, routesDir, treeFile ?? DEFAULT_ROUTE_TREE, writeIds);
    for (const warning of tree.warnings ?? []) warn?.(`[barq-router] ${warning}`);
    for (const file of tree.rewritten ?? []) {
      warn?.(`[barq-router] ${file}: rewrote its route id to match the filename`);
    }
    // A BUILD refuses rather than warns. The id is what the route table, the
    // loader cache and the route-action manifest all key by, so shipping a
    // literal that disagrees with the tree is shipping two names for one route.
    if ((tree.mismatches ?? []).length > 0) {
      throw new Error(
        `[barq-router] a route id literal is generated and these disagree with the id their ` +
          `filename derives:\n` +
          tree.mismatches
            .map(({ file, declared, expected }) => `  ${file}: "${declared}" -> "${expected}"`)
            .join("\n") +
          `\nRun the dev server once to rewrite them, or correct them by hand.`,
      );
    }
    options.onRoutes?.(tree.patterns);
    if (treeFile === null) return;
    const target = join(root, treeFile);
    try {
      // WRITE ONLY ON CHANGE, and this is not an optimisation. The tree is
      // regenerated on every route-file event and the watcher watches the
      // directory this writes into — so rewriting identical bytes is a loop.
      // It also keeps `vite build` from dirtying a checked-out file, which is
      // the same reason `writeIds` is off outside `serve`.
      if (readFileSync(target, "utf8") === tree.source) return;
    } catch {
      // Not there yet, which is the first run. Fall through and write it.
    }
    try {
      // The directory first: `routeTree` may name a path that does not exist
      // yet, and the catch below would have swallowed the `ENOENT` — so the
      // file silently was not written and the project typechecked against
      // nothing.
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, tree.source);
    } catch {
      // A read-only checkout still builds off whatever is committed.
    }
  };

  return {
    name: "barq-router",
    /**
     * SHARED, like every plugin `barqStart()` returns, and for a reason that was
     * measured rather than assumed.
     *
     * With `sharedConfigBuild` false — the default — Vite re-resolves the whole
     * config per environment, and re-resolving means RE-IMPORTING `vite.config.ts`
     * with a cache-busting query. So an application that routes a fact from the
     * client build to the ssr build through a module-scope variable in its own
     * config is writing to one module instance and reading from another.
     * Measured on exactly that: `onReachability` fired with 14 routes and
     * `verify.reachability()` answered `undefined`.
     *
     * Sharing this one is what puts the root instance in every environment, so
     * `onRoutes` and `onReachability` reach the same closure `buildApp` reads
     * from. DESIGN-FRONTDOOR §3.3 records the other half of the same lesson:
     * sharing SOME is worse than sharing none.
     */
    sharedDuringBuild: true,

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
      if (verify === undefined && options.onReachability === undefined) return;
      const context = this as {
        getModuleIds: () => Iterable<string>;
        getModuleInfo: (id: string) => {
          importedIds: readonly string[];
          dynamicallyImportedIds?: readonly string[];
          code?: string | null;
        } | null;
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
        (id) => {
          const info = context.getModuleInfo(id);
          if (info === null) return [];
          // DYNAMIC edges count, and leaving them out was a silent hole the
          // moment routes started code-splitting: the reference half reaches its
          // component through `import("<file>?barq-split")`, which Rollup reports
          // here and not in `importedIds`. A server function only a component
          // calls would have gone unseen — and this gate under-reporting is the
          // one failure mode it must not have.
          return [...info.importedIds, ...(info.dynamicallyImportedIds ?? [])];
        },
        (id) => {
          // `null` as well as `undefined`: Rollup answers `code: null` for a
          // module it has not loaded the source of, and only `undefined` was
          // guarded — so the walk threw once route modules gained a second id.
          const code = context.getModuleInfo(id)?.code;
          return code === undefined || code === null ? [] : idsInStub(code);
        },
      );

      options.onReachability?.(reachability);
      if (verify === undefined) return;
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
      writeIds = config.command === "serve";
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

    /**
     * BEFORE the compiler, and it has to be: this rewrites a route module's
     * SOURCE, and `@barqjs/compiler` lowers the JSX in whatever source it is
     * handed. Reversed, the split would be trying to move code that no longer
     * looks like the code the author wrote.
     */
    enforce: "pre",

    resolveId(id) {
      if (id === ROUTE_ASSETS_ID) return RESOLVED_ROUTE_ASSETS_ID;
      // Already absolute, and nothing else can resolve it: the query makes the
      // id ours, and the file it names is the one on disk.
      return isSplitId(id) ? id : null;
    },

    load(id) {
      if (id === RESOLVED_ROUTE_ASSETS_ID) {
        return `export const routeAssets = ${JSON.stringify(routeAssets)};\nexport default routeAssets;\n`;
      }
      if (!isSplitId(id)) return null;
      // The ORIGINAL source. `transform` below is what turns it into the split
      // half, so both halves go through one implementation and cannot drift.
      const file = fileOfSplitId(id);
      return existsSync(file) ? readFileSync(file, "utf8") : null;
    },

    /**
     * A route module becomes two, and which one depends on the query — and on
     * the CLIENT it also loses its `server` handlers entirely.
     *
     * The refusal is a WARNING and never an error. A route that cannot be split
     * still works — both halves come back as the original source — so the build
     * carries on and the message names the one binding to move.
     */
    transform(this: { warn(message: string): void; environment?: { name?: string } }, code, id) {
      const wantsSplit = isSplitId(id);
      const file = wantsSplit ? fileOfSplitId(id) : (id.split("?", 1)[0] ?? id);
      if (!isRouteFile(file)) return null;

      // The CLIENT build also DELETES `server`, which holds the route's HTTP
      // handlers, and that happens whether or not code splitting is on: it is
      // not a size optimisation, it is what keeps a handler's body — and the
      // database import it needed — out of the browser bundle.
      const forClient = (this.environment?.name ?? "client") === "client";
      if (!codeSplitting && !forClient) return null;

      const relativeFile = relative(root, file).replaceAll("\\", "/");
      const answer = native.routeSplit(
        code,
        relativeFile,
        `${file}?${SPLIT_QUERY}`,
        forClient,
        codeSplitting,
      );
      if (answer.refused !== undefined && answer.refused !== null && !wantsSplit) {
        // Once, not twice: both halves ask the same question and would report
        // the same answer.
        this.warn(`[barq-router] ${answer.refused}`);
      }
      const out = wantsSplit ? answer.split : answer.reference;
      return out === code ? null : { code: out, map: null };
    },

    configureServer(server) {
      const changed = (path: string): void => {
        if (relative(join(root, routesDir), path).startsWith("..")) return;
        rescan((message) => server.config.logger.warn(message));
        // The table is a REAL FILE now, so Vite's own watcher picks the rewrite
        // up and invalidates every importer for us — there is no virtual module
        // left to invalidate by hand. `rescan` writes only on change, which is
        // what keeps this from being a loop: the file this writes is inside the
        // directory this watches.
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
