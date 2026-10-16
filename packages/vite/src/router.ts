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
 * into the project and imported by path, which is TanStack's arrangement and
 * buys three things a
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

import { type Reachability, idsInStub, reachabilityFrom } from "./reachability.ts";

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
/** One client chunk, reduced to what a stylesheet lookup needs. */
export interface ChunkAssets {
  readonly fileName: string;
  readonly modules: readonly string[];
  /** The chunk's DIRECT static imports. */
  readonly imports: readonly string[];
  /** `viteMetadata.importedCss` — this chunk's own stylesheets. */
  readonly css: readonly string[];
}

/**
 * Route id -> every stylesheet the route can render, as hrefs.
 *
 * Two things separate this from the modulepreload list beside it, and both were
 * measured as a partly unstyled first paint on the reference application:
 *
 * 1. **Both halves count.** `routeSplit` puts a route's component in
 *    `<file>?barq-split`, which is what gets its own chunk; the reference half
 *    stays with the router entry. A lookup that takes the first module ending
 *    in the route's file finds the half WITHOUT the component, so the sheet
 *    holding the classes that component renders is named nowhere.
 * 2. **The walk is transitive.** `chunk.imports` is a chunk's DIRECT static
 *    imports, so a component chunk importing a shared one that imports another
 *    loses the last sheet.
 *
 * Both are safe to be generous about here and would not be in the preload list:
 * a `modulepreload` that arrives late costs a round trip, and a stylesheet that
 * arrives late costs a visible flash.
 */
export function routeStylesheets(
  entries: readonly { readonly id: string; readonly file: string }[],
  chunks: readonly ChunkAssets[],
  base: string,
): Record<string, string[]> {
  const cssOf = new Map<string, readonly string[]>();
  const importsOf = new Map<string, readonly string[]>();
  const byFile = new Map<string, string[]>();
  for (const chunk of chunks) {
    cssOf.set(chunk.fileName, chunk.css);
    importsOf.set(chunk.fileName, chunk.imports);
    for (const moduleId of chunk.modules) {
      byFile.set(moduleId, [chunk.fileName, ...chunk.imports]);
    }
  }

  const out: Record<string, string[]> = {};
  for (const entry of entries) {
    const seen = new Set<string>();
    const walked = new Set<string>();
    const queue: string[] = [];
    for (const [moduleId, assets] of byFile) {
      const file = moduleId.endsWith(`?${SPLIT_QUERY}`)
        ? moduleId.slice(0, -(SPLIT_QUERY.length + 1))
        : moduleId;
      if (file.endsWith(entry.file)) queue.push(...assets);
    }
    while (queue.length > 0) {
      const file = queue.pop() as string;
      if (walked.has(file)) continue;
      walked.add(file);
      for (const css of cssOf.get(file) ?? []) seen.add(`${base}${css}`);
      queue.push(...(importsOf.get(file) ?? []));
    }
    out[entry.id] = [...seen];
  }
  return out;
}

/**
 * `lazy(() => import("./x"))`, given the URL of the module it loads, so the
 * server can put that module's chunks and stylesheets in the page when it
 * renders. Only the literal forms are rewritten: one whose module the bundler
 * could not name either is left as it was.
 */
const LAZY_IMPORT =
  /\blazy\(\s*\(\)\s*=>\s*import\(\s*(["'])([^"'\n]+)\1\s*\)\s*(,\s*\{\s*export\s*:\s*(["'])[\w$]+\4\s*\}\s*)?\)/g;

export async function withModuleUrls(
  code: string,
  id: string,
  root: string,
  resolve: (spec: string) => Promise<{ id: string } | null>,
): Promise<string> {
  if (id.includes("/node_modules/") || !code.includes("lazy(")) return code;
  const found = [...code.matchAll(LAZY_IMPORT)];
  if (found.length === 0) return code;
  let out = "";
  let at = 0;
  for (const match of found) {
    const spec = match[2] ?? "";
    const resolved = await resolve(spec);
    if (resolved === null || resolved.id.startsWith("\0")) continue;
    const url = moduleUrlOf(resolved.id, root);
    const options = match[3] === undefined ? "undefined" : match[3].replace(/^,\s*/, "").trim();
    out +=
      code.slice(at, match.index) +
      `lazy(() => import(${JSON.stringify(spec)}), ${options}, ${JSON.stringify(url)})`;
    at = match.index + match[0].length;
  }
  return out + code.slice(at);
}

/** The key a module has in `moduleAssets`: its path from the project root. */
function moduleUrlOf(id: string, root: string): string {
  const file = id.split("?", 1)[0] ?? id;
  const path = relative(root, file).split("\\").join("/");
  return path.startsWith("..") ? file : `/${path}`;
}

/** Module URL -> the chunks a `lazy()` of it loads and the stylesheets they import. */
export function lazyModuleAssets(
  entries: readonly { module: string; fileName: string; imports: readonly string[] }[],
  chunks: readonly { fileName: string; css: readonly string[] }[],
  root: string,
  base: string,
): Record<string, { js: string[]; css: string[] }> {
  const cssOf = new Map(chunks.map((chunk) => [chunk.fileName, chunk.css]));
  const out: Record<string, { js: string[]; css: string[] }> = {};
  for (const entry of entries) {
    const files = [entry.fileName, ...entry.imports];
    const css = new Set<string>();
    for (const file of files) for (const sheet of cssOf.get(file) ?? []) css.add(`${base}${sheet}`);
    out[moduleUrlOf(entry.module, root)] = {
      js: files.map((file) => `${base}${file}`),
      css: [...css],
    };
  }
  return out;
}

/**
 * Route id -> the chunks its modules are in and the chunks those import.
 *
 * Both halves of a split route: the reference the table imports and the
 * component the `?split` module holds. The second is what the route renders,
 * and a page that did not preload it fetched it only once the router had
 * started, one round trip into hydration.
 */
export function routeChunks(
  entries: readonly { readonly id: string; readonly file: string }[],
  chunks: readonly { fileName: string; modules: readonly string[]; imports: readonly string[] }[],
  base: string,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const entry of entries) {
    const files = new Set<string>();
    for (const chunk of chunks) {
      for (const moduleId of chunk.modules) {
        const file = moduleId.endsWith(`?${SPLIT_QUERY}`)
          ? moduleId.slice(0, -(SPLIT_QUERY.length + 1))
          : moduleId;
        if (!file.endsWith(entry.file)) continue;
        files.add(chunk.fileName);
        for (const imported of chunk.imports) files.add(imported);
      }
    }
    if (files.size > 0) out[entry.id] = [...files].map((file) => `${base}${file}`);
  }
  return out;
}

const ROUTE_ASSETS_ID = "virtual:barq-route-assets";
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
 * rewrite it in the source file when a rename makes it wrong, which is what
 * their plugin does.
 * Off by default, so nothing writes to a project unless a dev server asked.
 */
export function routeTree(
  root: string,
  dir: string,
  outFile: string = DEFAULT_ROUTE_TREE,
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
   * Default `src/routeTree.gen.ts`, which is theirs. The application imports it
   * BY PATH,
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
  /**
   * Swap an edited route component in place on the development server. On by
   * default while serving.
   */
  readonly hmr?: boolean;
}

/**
 * The environment a hook runs in, by consumer.
 *
 * By consumer rather than by name, so a second browser environment (a worker,
 * a provider's client) is compiled as a browser one. The name is the fallback
 * for a context that carries no config, which is how the tests drive a hook.
 */
function forClient(environment: { name?: string; config?: { consumer?: string } } | undefined) {
  const consumer = environment?.config?.consumer;
  if (consumer !== undefined) return consumer === "client";
  return (environment?.name ?? "client") === "client";
}

/**
 * A reference half with the blanked component regions taken out.
 *
 * The split keeps every position the source map knows about, so the code it
 * moved out is replaced by whitespace of the same shape. An edit inside a
 * component therefore changes the reference only in whitespace-only lines and
 * in trailing whitespace, and comparing on this tells that edit apart from one
 * to the options the reference holds.
 */
function referenceShape(code: string): string {
  return code
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line !== "")
    .join("\n");
}

/**
 * Hot replacement for the split half.
 *
 * Inserted between `$$barqOptions` and the `const` exports read off it, since
 * those cannot be rebound afterwards. Each function option is handed out
 * through `hot`, so it keeps its identity across evaluations and the router's
 * `lazy` goes on calling the current implementation; one whose value did not
 * change keeps its instances on screen. When an option is not the same object
 * after an evaluation, the accept invalidates, and the update goes up to the
 * importers and ends in a reload.
 */
const SPLIT_EXPORTS = /^export const \w+ = \$\$barqOptions\.\w+;$/m;

function withSplitHot(code: string): string {
  const at = code.search(SPLIT_EXPORTS);
  if (at === -1) return code;
  const hot = [
    `if (import.meta.hot) {`,
    `  const $$barqSeen = (import.meta.hot.data["barq:route-options"] ??= {});`,
    `  for (const $$barqKey of Object.keys($$barqOptions)) {`,
    `    const $$barqValue = $$barqOptions[$$barqKey];`,
    `    if (typeof $$barqValue !== "function") continue;`,
    `    const $$barqStable = !($$barqKey in $$barqSeen) || $$barqSeen[$$barqKey] === $$barqValue;`,
    `    $$barqSeen[$$barqKey] = $$barqValue;`,
    `    $$barqOptions[$$barqKey] = $$barqHot(import.meta.hot, "route:" + $$barqKey, $$barqValue, $$barqStable ? "stable" : null);`,
    `  }`,
    `}`,
    ``,
  ].join("\n");
  const accept = [
    ``,
    `import { hot as $$barqHot } from "@barqjs/core/hot";`,
    `if (import.meta.hot) {`,
    `  import.meta.hot.accept((next) => {`,
    `    const after = next?.$$barqOptions;`,
    `    const keys = new Set([...Object.keys($$barqOptions), ...Object.keys(after ?? {})]);`,
    `    if (after === undefined || [...keys].some((key) => after[key] !== $$barqOptions[key])) {`,
    `      import.meta.hot.invalidate();`,
    `    }`,
    `  });`,
    `}`,
    ``,
  ].join("\n");
  return code.slice(0, at) + hot + code.slice(at) + accept;
}

export function barqRouter(options: BarqRouterOptions = {}): Plugin {
  const routesDir = options.routesDir ?? "src/routes";
  const codeSplitting = options.codeSplitting ?? true;
  let root = process.cwd();
  let base = "/";
  let serving = false;
  /** Each route file's reference half as the client last compiled it, by shape. */
  const references = new Map<string, string>();
  let routeAssets: Record<string, string[]> = {};
  let routeCss: Record<string, string[]> = {};
  let moduleAssets: Record<string, { js: string[]; css: string[] }> = {};
  const empty = (): RouteTree => ({
    source: "",
    files: [],
    patterns: [],
    entries: [],
    warnings: [],
    mismatches: [],
    rewritten: [],
  });
  let tree = empty();

  const treeFile = options.routeTree === false ? null : (options.routeTree ?? DEFAULT_ROUTE_TREE);

  /**
   * Serving rewrites the id literal; building refuses to.
   *
   * A build that edits checked-out source surprises CI and can dirty a release
   * commit, so the disagreement is an error there instead — the fix is to run
   * the dev server once, or to correct the literal by hand.
   */
  let writeIds = false;

  const split = (code: string, file: string, client: boolean): RouteSplit =>
    native.routeSplit(
      code,
      relative(root, file).replaceAll("\\", "/"),
      `${file}?${SPLIT_QUERY}`,
      client,
      codeSplitting,
    );

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
    // A project with no routes directory has no table, and writing an empty
    // one would put a generated file in a project that does not route.
    if (!existsSync(join(root, routesDir))) {
      tree = empty();
      return;
    }
    tree = routeTree(root, routesDir, treeFile ?? DEFAULT_ROUTE_TREE, writeIds);
    for (const warning of tree.warnings ?? []) warn?.(`[barq-router] ${warning}`);
    for (const file of tree.rewritten ?? []) {
      warn?.(
        `[barq-router] \`${file}\`: the id passed to \`createFileRoute\` differed from the id the filename gives, so the dev server rewrote it in the file.`,
      );
    }
    // A BUILD refuses rather than warns. The id is what the route table, the
    // loader cache and the route-action manifest all key by, so shipping a
    // literal that disagrees with the tree is shipping two names for one route.
    if ((tree.mismatches ?? []).length > 0) {
      throw new Error(
        `[barq-router] These route files pass \`createFileRoute\` an id that differs from the id their filename gives:\n` +
          tree.mismatches
            .map(
              ({ file, declared, expected }) =>
                `  ${file}: ${JSON.stringify(declared)} should be ${JSON.stringify(expected)}`,
            )
            .join("\n") +
          `\nRoutes, loader data and route actions are looked up by this id, so the build stops instead of shipping two ids for one route. ` +
          `Run the dev server once to rewrite them, or correct them by hand.`,
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
     * from. The other half of the same lesson: sharing SOME is worse than
     * sharing none.
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
        environment?: { name?: string; config?: { consumer?: string } };
        error: (message: string) => never;
        warn: (message: string) => void;
      };
      // The CLIENT graph only. The ssr environment holds the server halves,
      // where every function is present by construction and reachability means
      // nothing.
      if (!forClient(context.environment)) return;

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
      serving = config.command === "serve";
      writeIds = serving;
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
      if (!forClient((this as { environment?: { config?: { consumer?: string } } }).environment)) {
        return;
      }
      // `viteMetadata.importedCss` is per CHUNK, so a route's stylesheets are
      // its own chunk's plus every chunk it statically imports — the same
      // closure the preloads use, read off the same `chunk.imports`.
      const next = routeChunks(
        tree.entries,
        Object.values(bundle).flatMap((chunk) =>
          chunk.type === "chunk"
            ? [
                {
                  fileName: chunk.fileName,
                  modules: Object.keys(chunk.modules),
                  imports: chunk.imports,
                },
              ]
            : [],
        ),
        base,
      );
      routeAssets = next;
      moduleAssets = lazyModuleAssets(
        Object.values(bundle).flatMap((chunk) =>
          chunk.type === "chunk" && chunk.isDynamicEntry && chunk.facadeModuleId !== null
            ? [
                {
                  module: chunk.facadeModuleId,
                  fileName: chunk.fileName,
                  imports: chunk.imports,
                },
              ]
            : [],
        ),
        Object.values(bundle).flatMap((chunk) =>
          chunk.type === "chunk"
            ? [{ fileName: chunk.fileName, css: [...(chunk.viteMetadata?.importedCss ?? [])] }]
            : [],
        ),
        root,
        base,
      );
      routeCss = routeStylesheets(
        tree.entries,
        Object.values(bundle).flatMap((chunk) =>
          chunk.type === "chunk"
            ? [
                {
                  fileName: chunk.fileName,
                  modules: Object.keys(chunk.modules),
                  imports: chunk.imports,
                  css: [...(chunk.viteMetadata?.importedCss ?? [])],
                },
              ]
            : [],
        ),
        base,
      );
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
        return (
          `export const routeAssets = ${JSON.stringify(routeAssets)};\n` +
          `export const routeCss = ${JSON.stringify(routeCss)};\n` +
          `export const moduleAssets = ${JSON.stringify(moduleAssets)};\n` +
          `export default routeAssets;\n`
        );
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
    async transform(
      this: {
        warn(message: string): void;
        resolve(source: string, importer: string): Promise<{ id: string } | null>;
        environment?: { name?: string; config?: { consumer?: string } };
      },
      source,
      id,
    ) {
      const code = await withModuleUrls(source, id, root, (spec) => this.resolve(spec, id));
      const injected = code !== source;
      const wantsSplit = isSplitId(id);
      const file = wantsSplit ? fileOfSplitId(id) : (id.split("?", 1)[0] ?? id);
      if (!isRouteFile(file)) return injected ? { code, map: null } : null;

      // The CLIENT build also DELETES `server`, which holds the route's HTTP
      // handlers, and that happens whether or not code splitting is on: it is
      // not a size optimisation, it is what keeps a handler's body — and the
      // database import it needed — out of the browser bundle.
      const client = forClient(this.environment);
      if (!codeSplitting && !client) return injected ? { code, map: null } : null;

      const answer = split(code, file, client);
      const refused = answer.refused !== undefined && answer.refused !== null;
      if (refused && !wantsSplit) {
        // Once, not twice: both halves ask the same question and would report
        // the same answer.
        this.warn(`[barq-router] ${answer.refused}`);
      }
      const hot = serving && client && codeSplitting && (options.hmr ?? true);
      if (hot && !wantsSplit) references.set(file, referenceShape(answer.reference));
      const out = wantsSplit
        ? hot && !refused
          ? withSplitHot(answer.split)
          : answer.split
        : answer.reference;
      return out === source ? null : { code: out, map: null };
    },

    /**
     * A route component edit updates the split half alone, and any other edit
     * to a route file reloads the page.
     *
     * Both halves are modules of the one file, so Vite hands both over. When
     * the edit left the reference half as it was, the reference is invalidated
     * without being part of the update and the split half takes the update
     * itself. When it did not, the edit is to the options the router read when
     * it was created, and the split half accepting the update would leave the
     * page running on the old ones. The split half imports `Route` from the
     * reference, so left to Vite that is what happens.
     */
    async hotUpdate({ file, modules, read }) {
      if (!forClient(this.environment) || !codeSplitting || !(options.hmr ?? true)) {
        return undefined;
      }
      if (!isRouteFile(file)) return undefined;
      const previous = references.get(file);
      if (previous === undefined) return undefined;
      const next = referenceShape(split(await read(), file, true).reference);
      references.set(file, next);
      const graph = this.environment.moduleGraph;
      if (next !== previous) {
        for (const module of modules) graph.invalidateModule(module);
        this.environment.hot.send({ type: "full-reload" });
        return [];
      }
      const kept = modules.filter((module) => module.id !== null && isSplitId(module.id));
      for (const module of modules) {
        if (!kept.includes(module)) graph.invalidateModule(module);
      }
      return kept;
    },

    configureServer(server) {
      // The table is a REAL FILE, so Vite's own watcher picks a rewrite up and
      // takes it through HMR like any other module. `rescan` writes only on
      // change, which is what keeps this from being a loop: the file this
      // writes is inside the directory this watches.
      const changed = (path: string): void => {
        if (relative(join(root, routesDir), path).startsWith("..")) return;
        rescan((message) => server.config.logger.warn(message));
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
