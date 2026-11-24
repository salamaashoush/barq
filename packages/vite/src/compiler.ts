import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

import { DEFAULT_CSS_SOURCE, cssRegistrations } from "./css-registration.ts";
import { frameAround, overlayModule, type OverlayFrame } from "./overlay.ts";
import {
  SERVER_DIAGNOSTICS_CLEAR,
  SERVER_DIAGNOSTICS_EVENT,
  clearServerDiagnostics,
  replayServerDiagnostics,
} from "./server-diagnostics.ts";
import type { Plugin, TransformResult, ViteDevServer } from "vite";

const NATIVE_PACKAGE = "@barqjs/compiler";

/** Custom HMR event the in-page panel listens on. */
export const DIAGNOSTICS_EVENT = "barq:diagnostics";
const CLIENT_ID = "virtual:barq-diagnostics";
const RESOLVED_CLIENT_ID = "\0virtual:barq-diagnostics";

export type BarqDiagnosticLevel = "note" | "warning" | "error";

/**
 * One diagnostic, structured. `pos` is the UTF-16 offset into the ORIGINAL
 * module source, and it is the only reason a code frame can exist: Rollup produces
 * `pos`/`loc`/`frame` when — and only when — `this.warn` is given a position.
 */
export interface BarqDiagnostic {
  code?: string;
  severity: BarqDiagnosticLevel;
  message: string;
  file: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  pos: number;
  end: number;
  docs?: string;
  /** The source lines around it, added by the plugin for the overlay. */
  frame?: OverlayFrame;
}

export interface BarqTemplateLabel {
  template: string;
  component?: string;
  line: number;
  column: number;
}

/**
 * The options the compiler reads. Every one of them reaches a decision it
 * makes: the Babel plugin's `autoComputed` and its three component name lists
 * are gone, because nothing resolves by name any more — every component and
 * every reactive read resolves by `SymbolId`.
 */
/** One entry of `renderers`. */
export interface BarqRenderer {
  /**
   * Globs the file name is matched against: `*` within one path segment,
   * `**` across them. A pattern that does not start with `/` matches at any
   * directory, so `src/scene/**` matches every file under a `src/scene`.
   */
  include: string | readonly string[];
  /** @default "universal" */
  target?: "dom" | "universal";
  /** The module these files import the renderer's helpers from. */
  moduleSource?: string;
}

/** One entry of `intrinsics`. */
export interface BarqIntrinsic {
  /** The lowercase tags the renderer claims. */
  tags: readonly string[];
  /** Also claim a lowercase tag without a hyphen that the document does not have. */
  claimUnknown?: boolean;
  target: "dom" | "universal";
  /** The module claimed elements import the renderer's helpers from. */
  moduleSource: string;
}

/** One entry of `boundaries`. */
export interface BarqBoundary {
  /** The module the component is imported from. */
  source: string;
  /** The name it is exported under. */
  name: string;
  /** What its children compile for. */
  target: "dom" | "universal";
  /** The module its children import the renderer's helpers from. */
  moduleSource: string;
}

export interface BarqCompilerOptions {
  /**
   * The renderer compiled code builds through. Under `target: "universal"`
   * it is the module that exports what `@barqjs/universal`'s
   * `createRenderer` returned.
   * @default "@barqjs/web"
   */
  moduleSource?: string;

  /**
   * `"universal"` compiles every file for a custom renderer imported from
   * `moduleSource`: elements are `createElement` calls and every attribute and
   * event is one `setProp`. `ssr` and `hydratable` are the document's and are
   * an error beside it; an app that also renders the document uses
   * `renderers` instead.
   * @default "dom"
   */
  target?: "dom" | "universal";

  /**
   * Per-file renderer selection. A file that matches an entry compiles for
   * that entry's target and module, so one build holds document files and a
   * custom renderer's files, and `ssr` and `hydratable` keep describing the
   * document's. The first entry that matches wins.
   *
   * ```ts
   * renderers: [{ include: ["src/scene/**"], target: "universal", moduleSource: "/src/scene/renderer.ts" }]
   * ```
   */
  renderers?: readonly BarqRenderer[];

  /**
   * Components whose JSX children compile for another renderer than the JSX
   * around them, so one file can hold a document page and a scene graph. An
   * element whose tag is the import `name` from `source` compiles for the
   * file's own renderer, and its children for the entry's `target` and
   * `moduleSource`. Boundaries nest.
   *
   * A dependency declares its own under `"barq": { "boundaries": [...] }` in
   * its `package.json`, and the plugin adds those with `source` set to the
   * package's name. An entry here wins over a declared one for the same
   * `source` and `name`.
   *
   * ```ts
   * boundaries: [{ source: "@acme/scene", name: "Canvas", target: "universal", moduleSource: "@acme/scene/renderer" }]
   * ```
   */
  boundaries?: readonly BarqBoundary[];

  /**
   * Intrinsic tags a renderer claims. Outside every boundary, a tree of
   * intrinsic elements whose root tag one entry claims, and the document does
   * not have, compiles for that entry's renderer wherever it is written, so
   * `function Box() { return <mesh /> }` is a scene object in any file. A tag
   * the document also has (`line`, `audio`) is the renderer's only when the
   * tree under it holds a tag that renderer alone claims.
   *
   * A dependency declares its own under `"barq": { "intrinsics": [...] }`,
   * where `tags` may be a path to a JSON file holding the list. These entries
   * come after the declared ones, and a tag or `claimUnknown` given here is
   * taken from every package that declares it.
   */
  intrinsics?: readonly BarqIntrinsic[];

  /**
   * Where the renderer-neutral half of the ABI and the components an author
   * imports come from.
   * @default "@barqjs/core"
   */
  coreSource?: string;

  /**
   * Module source for the string backend's helpers. Its own package rather than
   * a subpath of {@link moduleSource}: the server runtime carries a serializer
   * and a streaming loop no client bundle may pull in.
   * @default "@barqjs/server"
   */
  serverSource?: string;

  /**
   * Module source for `createServerFn`. Resolution is by symbol, so this is the
   * specifier an import must name rather than a text the source must contain.
   * @default "@barqjs/start"
   */
  startSource?: string;

  /**
   * Module source the emitted CLIENT stub imports `clientRpc` from.
   *
   * NOT {@link startSource}, and the separation is the point: `@barqjs/start`'s
   * index re-exports `context.ts` — `node:async_hooks` — so a stub importing it
   * put the request-context machinery in every client bundle that reached one
   * server function.
   * @default "@barqjs/start/client"
   */
  clientSource?: string;

  /**
   * Emit each module's export surface and which exports are server functions.
   * The build reads it to know what to mount; a reviewer reads it to see what
   * is public.
   * @default false
   */
  serverFns?: boolean;

  /**
   * `"client"` or `"server"` — which half of the program a module is compiled
   * for. A different question from `ssr`, which picks a backend: under
   * `"client"` a module whose exports are all server functions is replaced by
   * stubs rather than compiled, so no handler body reaches a browser bundle.
   * @default "server"
   */
  env?: "client" | "server";

  /**
   * Project root. Server-function ids are derived relative to it, so an id
   * carries no absolute path into the client bundle.
   */
  root?: string;

  /**
   * Called with each module's `serverFns` artefact, when `serverFns` is on.
   *
   * The channel exists so the ids come from ONE place. A build needs the same
   * `<module>#<export>` string on both sides — the client stub calls it and the
   * server mounts it — and deriving it twice, once per side, is how the two
   * halves drift into a call that reaches nothing.
   */
  onServerFns?: (id: string, artifact: string) => void;

  /**
   * Module source for `Link` and `NavLink`, for BARQ013.
   * @default "@barqjs/router"
   */
  routerSource?: string;

  /**
   * Module source for `css`, `keyframes` and `globalCss`. Resolution is by
   * symbol, so this is the specifier an import must NAME rather than a text the
   * source must contain — your own `css` is never mistaken for this one.
   * @default "@barqjs/css"
   */
  cssSource?: string;

  /**
   * Every CSS diagnostic is an error, so a call `@barqjs/css`'s runtime would
   * have to evaluate fails the build.
   *
   * The point is what it makes provable rather than what it forbids. With no
   * call falling back, nothing in the bundle reaches the runtime's object walk,
   * and a build can drop it deliberately instead of shipping it because a
   * bundler cannot prove it dead. `@barqjs/ui` passes with it on today.
   *
   * An explicit `checks` entry still wins, so one accepted call has a way back.
   * @default false
   */
  strictCss?: boolean;

  /**
   * Compile the packages that publish source, out of `node_modules`.
   *
   * A barq package cannot ship a build: the same component emits
   * `template()`/`spread` for the DOM and `html()`/`esc()` for a string render,
   * and `hydratable` moves it again — three outputs, and `hydratable` is the
   * application's decision. So `@barqjs/aria`, `@barqjs/ui` and `@barqjs/lucide`
   * publish source under a `barq` export condition, this plugin resolves that
   * condition first in every environment, and each environment compiles it for
   * itself. That is `vite-plugin-solid`'s arrangement, for the same reason.
   *
   * Off makes this build treat them as opaque dependencies, which is only right
   * if something else has already compiled them.
   * @default true
   */
  compilePackages?: boolean;

  /**
   * Fold values a module imports from another file: a design token, a shared
   * `create` group, a `layer` binding, a plain `const` holding a `var()`.
   *
   * Without it those are opaque and the whole call is evaluated by
   * `@barqjs/css` in the browser, which is the shape most projects have — the
   * tokens are in one file and the components import them.
   *
   * The compiler still reads no file. It reports which binding it would have
   * needed (`cssWanted`), this resolves that ONE module, and it compiles again
   * with the answer. So the transform stays a pure function of its inputs and a
   * name resolves to the same value in dev and in a build. That is what
   * separates it from StyleX's `globalThis.__stylex_unplugin_store`, which is
   * an aggregate over every module and cannot be either.
   *
   * Costs one extra transform per imported file, cached by path and mtime, and
   * only for the files something actually asked for.
   * @default true
   */
  resolveImports?: boolean;

  /**
   * Every route pattern in the project, which is what BARQ013 checks a
   * `<Link to>` against.
   *
   * Absent turns the check off: the compiler sees one module and the route set
   * is a whole-project fact, so a project with a hand-written table and no
   * build integration must never be warned about every link it writes.
   * `@barqjs/router/vite` reports it from the same scan it built the table
   * from — a check against a different scan is a check against a different
   * project.
   *
   * A THUNK is accepted and is what an integration wants, for the reason
   * `barqStart`'s `verify.reachability` is one: the scan happens in
   * `configResolved` and this is read per transform, and every layer between
   * the two spreads its options — so a plain array is snapshotted while it is
   * still empty and every link in the project is reported as matching no route.
   */
  routes?: readonly string[] | (() => readonly string[] | undefined);

  /**
   * Development mode: compile-time diagnostics about runtime behaviour
   * (BARQ004, BARQ010), the dev-mode template labels, the source location
   * written beside each hydratable template, and component calls named for the
   * owner path a runtime finding prints. Derived from Vite's own mode when left
   * unset.
   */
  dev?: boolean;

  /**
   * Carry names and positions from the source into the output, so a runtime
   * finding says which signal, which attribute of which element, and where it
   * is written (`at src/App.tsx:18:3`). A `.ts` module that imports the core is
   * compiled too, since that is where shared signals and stores are declared.
   * @default the value of `dev`
   */
  sourceNames?: boolean;

  /**
   * Replace an edited component in place on the development server, keeping
   * the state of everything above it. On by default while serving; the server
   * half and a production build never get it.
   */
  hmr?: boolean;

  /**
   * Run the source-level rules (BARQ001 to BARQ003, BARQ005, BARQ011, BARQ018 to
   * BARQ021). Defaults to `dev`.
   * Set it true on a production build to run them in CI.
   */
  diagnostics?: boolean;

  /**
   * Per-code severity. `"suppress" | "note" | "warning" | "error"`.
   * An explicit entry wins over {@link defaultCategory}, which wins over the
   * code's own level — the shape Angular's extended diagnostics use.
   */
  checks?: Record<string, "suppress" | "note" | "warning" | "error">;

  /** The category every code takes when {@link checks} does not name it. */
  defaultCategory?: "suppress" | "note" | "warning" | "error";

  /**
   * Hoist an intrinsic JSX tree to a cloneable template with a precomputed walk
   * to each dynamic hole.
   * @default true
   */
  templates?: boolean;

  /**
   * The optimisation level. `0` turns every optimisation off; `1` is the
   * optimising path. `-O0` shares the front end, the IR, the ABI and the
   * ownership model with `-O1`, so it can encode neither a legacy decision nor
   * an optimisation bug — it is the correctness reference the differential
   * oracle runs against, not a debug mode. Its output is slower and larger and
   * never different.
   * @default 1
   */
  optimize?: 0 | 1;

  /**
   * Emit for the reference backend instead of the DOM backend: the analysed IR
   * is serialised beside the module and `@barqjs/web/interp` walks it. It is
   * the SAME analysed IR codegen consumes — same anchors, same template bytes,
   * same ref plan, same patch program — which is what makes it usable as an
   * oracle rather than a second implementation.
   *
   * DEV and test only. It pulls in `@barqjs/web/interp`, and it is slower and
   * larger than the emitted module in every case. It is a DOM backend, so it
   * applies to the client pass only and the server pass still goes through the
   * string backend.
   * @default false
   */
  interp?: boolean;

  /**
   * Per-pass override on top of {@link optimize}, so any single optimisation
   * can be turned off against an otherwise-optimised build. That is the point
   * of the axis: a differential failure bisects to one pass by flipping one
   * flag.
   *
   * - `fold` — constant folding into the template HTML
   * - `dedup` — one `_tmpl$` per distinct markup, shared module-wide
   * - `anchor` — anchoring a hole against a node the template already carries
   * - `fuse` — one `renderEffect` per element instead of one per prop
   * - `walk` — addressing a node from the nearest already-addressed sibling
   * - `eta` — `x={s()}` emitted as `x: s`
   * - `hoist` — a capture-free handler as a module-scope constant
   * - `splice` — a unit's statements flat in the enclosing body, not an IIFE
   * - `flow` — a control-flow construct lowered onto `branch`/`each`/
   *   `boundary`/`portal`, handed the `(parent, anchor)` pair the template walk
   *   computed and a flags integer of proven properties. Off: it stays
   *   `Show($s, {…})` and the runtime adapter does the work.
   */
  passes?: Partial<Record<BarqOptimisation, boolean>>;

  /**
   * Emit for CLAIM-BASED HYDRATION.
   *
   * It changes BOTH emissions, and it has to be the same value for both halves
   * of one deployment: the string backend writes `<!--[-->` … `<!--]-->` at
   * every hole and `<!--[k-->` at every range, and the DOM backend walks through
   * `child`/`sib` — a logical index that steps over exactly those ranges.
   *
   * Off by default. A page that is never hydrated pays neither the wire bytes
   * (measured at +55.7% raw, +7.3% gzipped on a 100-row page) nor the
   * indirection. A client bundle built WITHOUT it, served markup built WITH it,
   * or either way round, is detected at run time and degrades to a full client
   * render rather than to a wrong tree.
   */
  hydratable?: boolean;
}

export type BarqOptimisation =
  | "fold"
  | "dedup"
  | "anchor"
  | "fuse"
  | "walk"
  | "eta"
  | "hoist"
  | "splice"
  | "flow";

interface NativeTransformOptions {
  routerSource?: string;
  cssSource?: string;
  strictCss?: boolean;
  cssExports?: boolean;
  cssImports?: string[][];
  routes?: readonly string[];
  moduleSource?: string;
  target?: string;
  renderers?: { include: string[]; target?: string; moduleSource?: string }[];
  boundaries?: { source: string; name: string; target: string; moduleSource: string }[];
  intrinsics?: { tags: string[]; claimUnknown?: boolean; target: string; moduleSource: string }[];
  coreSource?: string;
  serverSource?: string;
  startSource?: string;
  clientSource?: string;
  serverFns?: boolean;
  env?: string;
  root?: string;
  dev?: boolean;
  sourceNames?: boolean;
  templates?: boolean;
  diagnostics?: boolean;
  checks?: string[][];
  defaultCategory?: string;
  filename?: string;
  sourcemap?: boolean;
  ssr?: boolean;
  interp?: boolean;
  optimize?: number;
  passes?: string[][];
  hydratable?: boolean;
  ownership?: boolean;
  addresses?: boolean;
}

interface NativeResult {
  code: string;
  map?: string;
  warnings?: string[];
  diagnostics?: BarqDiagnostic[];
  labels?: BarqTemplateLabel[];
  serverFns?: string;
  css?: string;
  /** `[specifier, exported name]` a fold needed and did not have. */
  cssWanted?: string[][];
  /** `[exported name, kind, member, value]` this module can hand over. */
  cssExports?: string[][];
}

/**
 * The suffix a module's stylesheet is served under.
 *
 * A real `.css` PATH rather than the `?…&lang.css` query `@vitejs/plugin-vue`
 * uses for a SFC's `<style>`. Measured against Vite 8: the query form dies in
 * rolldown's `builtin:vite-transform` with "Failed to detect the lang of
 * …/Demo.tsx?barq-css&lang.css", because the path it reads still ends `.tsx`.
 * `vanilla-extract` reached the same shape (`<file>.vanilla.css`) for the same
 * reason. Ending in `.css` puts it in Vite's own CSS pipeline, so dev HMR, the
 * production asset and SSR collection are all the bundler's, and one file
 * edited invalidates one file's stylesheet.
 */
const CSS_QUERY = ".barq.css";

/**
 * What every module holding an atom imports in a build, served as the marker
 * rule below. A sheet carrying the marker is how `generateBundle` knows the
 * build asked for its atoms to be gathered; they are written to a file of
 * their own there, once every module's atoms are known, and the marker is
 * taken out. A real `.css` path, for the reason `CSS_QUERY` is one.
 */
const ATOMS_ID = "/__barq_atoms.css";
const ATOMS_MARKER = ".__barq_atoms__{--barq-atoms:0}";
const ATOMS_MARKER_RULE = /\.__barq_atoms__\{[^}]*\}/;

/** What one file exports that another folds against, and the stylesheets behind it. */
interface FoldedModule {
  rows: string[][];
  /** The file's own stylesheet. */
  css: string;
  /** The stylesheets of the files it folded a value out of, by file. */
  carried: Map<string, string>;
  /**
   * Every file its rows were read from, itself and what it folded against,
   * with the modification time each had: a value it took from a token file
   * is stale once that file changes, though this file has not.
   */
  stamps: ReadonlyMap<string, number>;
}

/** What a fold reads of Vite's dependency optimizer: where each pre-bundled package came from. */
interface DepsOptimizer {
  readonly metadata: {
    readonly optimized: Readonly<Record<string, { readonly file: string; readonly src?: string }>>;
    readonly discovered: Readonly<Record<string, { readonly file: string; readonly src?: string }>>;
  };
}

const NOTHING_FOLDED: FoldedModule = { rows: [], css: "", carried: new Map(), stamps: new Map() };

/**
 * The name the atoms' own asset is emitted under, which is how the router and
 * Start find it in a bundle to link it after every other stylesheet.
 */
export const ATOMS_ASSET = "barq-atoms.css";

/**
 * The attribute the atoms' `<link>` carries in a document, so a stylesheet
 * inserted at run time can be put in front of it.
 */
export const ATOMS_ATTRIBUTE = "data-barq-atoms";

/**
 * What Vite records as the source of the one stylesheet a
 * `build.cssCodeSplit: false` build writes. Its NAME follows `build.lib`
 * (`cssFileName`, or the package's name), and this does not.
 */
const UNSPLIT_SOURCE = "style.css";

/** The slice of a Rollup plugin context `generateBundle` uses here. */
interface BundleContext {
  environment?: {
    config?: {
      build?: { cssCodeSplit?: boolean; lib?: unknown };
      plugins?: readonly { name: string; api?: unknown }[];
    };
  };
  emitFile(file: { type: "asset"; name: string; source: string }): string;
  error(message: string): never;
  warn(message: string): void;
  getFileName(reference: string): string;
}

/** Whether this build writes a stylesheet per chunk, which is Vite's default. */
function cssCodeSplit(context: Pick<BundleContext, "environment"> | undefined): boolean {
  return context?.environment?.config?.build?.cssCodeSplit !== false;
}

function sourceText(asset: { source: string | Uint8Array }): string {
  return typeof asset.source === "string" ? asset.source : Buffer.from(asset.source).toString();
}

interface BundledAsset {
  type: string;
  fileName: string;
  names?: readonly string[];
  originalFileNames?: readonly string[];
  source?: string | Uint8Array;
}

/** The file a bundle's atoms were written to, when they have one. */
export function atomsAsset(bundle: Record<string, BundledAsset>): string | undefined {
  return Object.values(bundle).find(
    (asset) => asset.type === "asset" && asset.names?.includes(ATOMS_ASSET) === true,
  )?.fileName;
}

/** The one stylesheet of a `build.cssCodeSplit: false` build, once Vite has written it. */
export function unsplitAsset(bundle: Record<string, BundledAsset>): string | undefined {
  return Object.values(bundle).find(
    (asset) => asset.type === "asset" && asset.originalFileNames?.includes(UNSPLIT_SOURCE) === true,
  )?.fileName;
}

/**
 * Where a stylesheet the page inserts at run time goes: in front of the atoms'
 * `<link>`, so a chunk's `css` blocks loaded after the first paint cannot start
 * beating an atom at the same specificity. Self-contained, because it is
 * spliced into Vite's preload helper as text.
 */
const PLACE_STYLESHEET =
  `(function (link) { var atoms = link.rel === "stylesheet" && ` +
  `document.querySelector('link[rel="stylesheet"][${ATOMS_ATTRIBUTE}]'); ` +
  `if (atoms) atoms.parentNode.insertBefore(link, atoms); else document.head.append(link); })`;

const PRELOAD_HELPER_UNKNOWN =
  "[barq] Vite's preload helper was not one this version can make link a stylesheet in front " +
  "of the atoms, so a stylesheet a dynamic import brings would land after them and could beat " +
  'them. Update @barqjs/vite, or set `compiler: { preloadHelper: "warn" }` to build anyway.';

/**
 * Whether a dynamic import in this bundle brings a stylesheet: a dynamically
 * imported chunk, or a chunk it imports, lists one.
 */
function lazilyLinked(bundle: Record<string, unknown>): boolean {
  type Chunked = {
    type: string;
    isDynamicEntry?: boolean;
    imports?: readonly string[];
    viteMetadata?: { importedCss: Set<string> };
  };
  const chunks = bundle as Record<string, Chunked>;
  const linked = (name: string, seen: Set<string>): boolean => {
    const chunk = chunks[name];
    if (chunk?.type !== "chunk" || seen.has(name)) return false;
    seen.add(name);
    if ((chunk.viteMetadata?.importedCss.size ?? 0) > 0) return true;
    return (chunk.imports ?? []).some((each) => linked(each, seen));
  };
  return Object.entries(chunks).some(
    ([name, chunk]) =>
      chunk.type === "chunk" && chunk.isDynamicEntry === true && linked(name, new Set()),
  );
}

/** Vite's preload helper, which links the stylesheets of a dynamically imported chunk. */
const PRELOAD_HELPER = "\0vite/preload-helper.js";
const PRELOAD_INSERT = /\bdocument\.head\.appendChild\(([A-Za-z_$][\w$]*)\)/g;

interface NativeCompiler {
  transform(code: string, options?: NativeTransformOptions): NativeResult;
  /**
   * A bundled stylesheet with its atoms ordered by tier. Shared with the
   * compiler rather than reimplemented here: the tier is one semantic and this
   * would be its third copy.
   */
  orderCss(css: string, layers?: string[]): string;
  gatherAtoms(sheets: string[]): { atoms: string; sheets: string[] };
  /** The cascade layer order the given module stylesheets declare between them. */
  layerOrder(sheets: string[]): string[];
}

let nativeCompiler: NativeCompiler | undefined;
let nativeLoadError: string | undefined;

/**
 * The binary is a build artifact, so "not built yet" is a state a checkout can
 * be in. There is no second pipeline to fall back to, so the caller turns this
 * into a hard error rather than compiling the file some other way.
 */
export function loadNativeCompiler(): NativeCompiler | undefined {
  if (nativeCompiler) return nativeCompiler;
  if (nativeLoadError !== undefined) return undefined;

  try {
    const require = createRequire(import.meta.url);
    nativeCompiler = require(NATIVE_PACKAGE) as NativeCompiler;
  } catch (error) {
    nativeLoadError = error instanceof Error ? error.message : String(error);
    return undefined;
  }

  return nativeCompiler;
}

/** Test seam: the loader memoizes both outcomes for the process lifetime. */
export function resetNativeCompilerCache(): void {
  nativeCompiler = undefined;
  nativeLoadError = undefined;
}

export interface BarqVitePluginOptions extends BarqCompilerOptions {
  /** @default [".tsx", ".jsx"] */
  include?: string[];

  /** @default [/node_modules/] */
  exclude?: (string | RegExp)[];

  /**
   * How a module's compiled CSS reaches the page.
   *
   * `"asset"` serves it from a `.css` module the transformed code imports, so
   * Vite emits a real stylesheet and `<HeadContent />` links it. That needs a
   * BUNDLE, which is the one thing dev does not have: a dev server has no
   * `generateBundle`, so a server-rendered dev page arrived with its classes in
   * the markup and no stylesheet of any kind.
   *
   * `"inline"` appends `registerCss(id, css)` instead, so the module carries
   * its own rules and every environment reads one registry — the dev document
   * inlines `collectCss()`, `bun test` gets the rules in its sheet, and a block
   * the compiler declined lands in the same place instead of a parallel one.
   *
   * Derived from {@link dev} when left unset, which is the only correct
   * default: assets need a build and a build is not dev.
   */
  cssMode?: "asset" | "inline";

  /**
   * The in-page diagnostics overlay, in dev: compiler diagnostics with the
   * source they are about, runtime diagnostics, and errors nothing caught.
   * Deliberately not Vite's own overlay, which takes one error, has no warning
   * payload type at all and covers the page.
   *
   * It is a pill in the corner that counts what there is. The value says what
   * opens it without being asked: `"error"` an error, `"warning"` a warning or
   * an error, `true` anything including a note. `false` turns it off.
   * @default "error"
   */
  overlay?: boolean | "warning" | "error";

  /**
   * What a build does when Vite's preload helper is not the one this version
   * knows how to place a stylesheet with. A dynamic import's stylesheets are
   * then appended after the atoms' link and can beat an atom at the same
   * specificity, so the build fails. `"warn"` builds anyway and says so, which
   * is the way through a Vite release this version predates.
   * @default "error"
   */
  preloadHelper?: "error" | "warn";
}

function checkPairs(checks: BarqCompilerOptions["checks"]): string[][] | undefined {
  if (!checks) return undefined;
  return Object.entries(checks).map(([code, category]) => [code, category]);
}

const SCRIPT_MODULE = /\.[cm]?[jt]sx?$/;

const NAMED_IMPORT = /import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;

/**
 * Whether `code` calls a binding it imports, other than from the package, the
 * way a `layer` binding is called: `ui({ … })`, `ui.create({ … })`,
 * `ui.props(…{ … })` or `ui.dynamic(…)`. Such a module never names the
 * package, and whether the binding is a layer is known only once the module
 * it comes from is read, which the compile asks for. A guess that is wrong
 * costs one compile that folds nothing.
 */
function callsThroughImport(code: string, cssSource: string): boolean {
  for (const [, names, from] of code.matchAll(NAMED_IMPORT)) {
    if (from === cssSource || names === undefined) continue;
    for (const entry of names.split(",")) {
      const local = entry
        .trim()
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/)
        .pop()
        ?.trim();
      if (local === undefined || !/^[A-Za-z_$][\w$]*$/.test(local)) continue;
      const call = new RegExp(
        `(?<![\\w$.])${local.replace(/\$/g, "\\$")}(?:\\.dynamic\\(|(?:\\.(?:create|props))?\\([^()]*\\{)`,
      );
      if (call.test(code)) return true;
    }
  }
  return false;
}

/** The compiler takes `include` as a list, and an entry may name one glob. */
function rendererEntries(
  renderers: BarqCompilerOptions["renderers"],
): NativeTransformOptions["renderers"] {
  return renderers?.map((entry) => ({
    include: typeof entry.include === "string" ? [entry.include] : [...entry.include],
    target: entry.target,
    moduleSource: entry.moduleSource,
  }));
}

/** napi has no map type, so the per-pass overrides travel as pairs. */
function passPairs(passes: BarqCompilerOptions["passes"]): string[][] | undefined {
  if (!passes) return undefined;
  return Object.entries(passes).map(([name, on]) => [name, on ? "on" : "off"]);
}

/**
 * The export condition a barq package publishes its SOURCE under.
 *
 * A compiled component is backend-specific: the same file emits
 * `template()`/`spread` from `@barqjs/web` for the DOM and `html()`/`esc()`
 * from `@barqjs/server` for a string render, and `hydratable` moves it again —
 * three distinct outputs for a trivial component. `hydratable` is a decision
 * the APPLICATION makes, so a library cannot pre-compile for it, and a library
 * that pre-compiles for one backend is silently wrong on the other.
 *
 * So a barq package ships source and the consumer's build compiles it, once
 * per environment. That is what `vite-plugin-solid` does with its `solid`
 * condition, and for the same reason: `generate: "dom" | "ssr"` is our `ssr`
 * flag under another name.
 */
export const BARQ_CONDITION = "barq";

/** Whether a package publishes its source under {@link BARQ_CONDITION}. */
function publishesSource(exports: unknown): boolean {
  if (exports === null || typeof exports !== "object") return false;
  for (const [key, value] of Object.entries(exports as Record<string, unknown>)) {
    if (key === BARQ_CONDITION) return true;
    if (publishesSource(value)) return true;
  }
  return false;
}

/**
 * The barq packages a project depends on, by name.
 *
 * Vite EXTERNALISES a dependency in the SSR environment, so node would be
 * handed the `.ts` the condition resolved to and refuse it. They have to be
 * bundled, which means naming them, at every depth: an application installs a
 * design system, which builds on `@barqjs/aria`, which peers on
 * `@barqjs/primitives`, and the last one is as much source as the first.
 */
function barqPackages(root: string): string[] {
  const names = new Set<string>();
  for (const { manifest } of installedPackages(root)) {
    if (typeof manifest.name === "string" && publishesSource(manifest.exports)) {
      names.add(manifest.name);
    }
  }
  return [...names];
}

/**
 * Whether Vite's dependency optimizer will pre-bundle a package the project
 * imports.
 *
 * It pre-bundles a bare import that resolves into `node_modules` and leaves a
 * linked one alone, so naming a linked package in `optimizeDeps.include` would
 * pre-bundle it for no reason and give the app a second copy beside the one
 * every source import resolves to.
 */
export function optimizable(root: string, name: string): boolean {
  const dir = packageDir(root, name);
  if (dir === null) return false;
  try {
    return realpathSync(dir).split(/[\\/]/).includes("node_modules");
  } catch {
    return false;
  }
}

/** The directory a package is installed at, looked up from `root` the way Node does. */
export function packageDir(root: string, name: string): string | null {
  let at = root;
  for (;;) {
    const candidate = join(at, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) return candidate;
    const up = dirname(at);
    if (up === at) return null;
    at = up;
  }
}

interface BoundaryManifest {
  name?: unknown;
  exports?: unknown;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  workspaces?: unknown;
  barq?: { boundaries?: unknown; intrinsics?: unknown };
}

function readManifest(file: string): BoundaryManifest | null {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as BoundaryManifest;
  } catch {
    return null;
  }
}

/**
 * The directories a `workspaces` field names: a plain path, or a path ending
 * in `/*` for every directory under it.
 */
function workspaceDirs(root: string, workspaces: unknown): string[] {
  const patterns = Array.isArray(workspaces)
    ? workspaces
    : workspaces !== null && typeof workspaces === "object"
      ? (workspaces as { packages?: unknown }).packages
      : undefined;
  if (!Array.isArray(patterns)) return [];
  const dirs: string[] = [];
  for (const pattern of patterns) {
    if (typeof pattern !== "string" || pattern.startsWith("!")) continue;
    if (!pattern.endsWith("/*")) {
      dirs.push(join(root, pattern));
      continue;
    }
    const parent = join(root, pattern.slice(0, -2));
    try {
      for (const entry of readdirSync(parent, { withFileTypes: true })) {
        if (entry.isDirectory()) dirs.push(join(parent, entry.name));
      }
    } catch {
      // A pattern naming no directory names no package.
    }
  }
  return dirs;
}

/** The entries one package declares under `barq.boundaries`, with itself as the source. */
function declaredBoundaries(manifest: BoundaryManifest): BarqBoundary[] {
  const declared = manifest.barq?.boundaries;
  if (typeof manifest.name !== "string" || !Array.isArray(declared)) return [];
  const source = manifest.name;
  const found: BarqBoundary[] = [];
  for (const entry of declared as unknown[]) {
    if (entry === null || typeof entry !== "object") continue;
    const { name, target, moduleSource } = entry as Record<string, unknown>;
    if (
      typeof name === "string" &&
      (target === "dom" || target === "universal") &&
      typeof moduleSource === "string"
    ) {
      found.push({ source, name, target, moduleSource });
    }
  }
  return found;
}

/**
 * The entries one package declares under `barq.intrinsics`. `tags` is the
 * list, or a path from the package's directory to a JSON file holding it, so
 * a renderer with hundreds of tags can generate the file from its own
 * classes.
 */
function declaredIntrinsics(manifest: BoundaryManifest, dir: string): BarqIntrinsic[] {
  const declared = manifest.barq?.intrinsics;
  if (!Array.isArray(declared)) return [];
  const found: BarqIntrinsic[] = [];
  for (const entry of declared as unknown[]) {
    if (entry === null || typeof entry !== "object") continue;
    const { tags, claimUnknown, target, moduleSource } = entry as Record<string, unknown>;
    let list: unknown = tags;
    if (typeof tags === "string") {
      try {
        list = JSON.parse(readFileSync(join(dir, tags), "utf8"));
      } catch {
        continue;
      }
    }
    if (
      Array.isArray(list) &&
      list.every((tag): tag is string => typeof tag === "string") &&
      (claimUnknown === undefined || typeof claimUnknown === "boolean") &&
      (target === "dom" || target === "universal") &&
      typeof moduleSource === "string"
    ) {
      found.push({ tags: list, claimUnknown, target, moduleSource });
    }
  }
  return found;
}

/** Whether a package takes part in the build: it ships source, or declares under `barq`. */
function takesPart(manifest: BoundaryManifest): boolean {
  return publishesSource(manifest.exports) || manifest.barq !== undefined;
}

/**
 * Every package the project installs that the build has to know about: the
 * direct dependencies and workspace packages, and then, through each one that
 * takes part, what it depends on and peers on, to any depth.
 *
 * A package's own dependencies are looked up from where it is really
 * installed. Under an isolated install (bun's, pnpm's) a transitive
 * dependency is a sibling in the store, not something the root can see.
 * Packages that take no part are not walked into, which keeps this to the
 * barq corner of `node_modules` rather than all of it.
 */
function installedPackages(root: string): { dir: string; manifest: BoundaryManifest }[] {
  const manifest = readManifest(join(root, "package.json"));
  if (manifest === null) return [];
  const found = new Map<string, { dir: string; manifest: BoundaryManifest }>();
  const pending: { dir: string; manifest: BoundaryManifest }[] = [];
  const add = (dir: string): void => {
    let real: string;
    try {
      real = realpathSync(dir);
    } catch {
      return;
    }
    if (found.has(real)) return;
    const theirs = readManifest(join(real, "package.json"));
    if (theirs === null) return;
    const entry = { dir: real, manifest: theirs };
    found.set(real, entry);
    if (takesPart(theirs)) pending.push(entry);
  };
  for (const name of [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
  ]) {
    const dir = packageDir(root, name);
    if (dir !== null) add(dir);
  }
  for (const dir of workspaceDirs(root, manifest.workspaces)) add(dir);
  for (let next = pending.shift(); next !== undefined; next = pending.shift()) {
    for (const name of [
      ...Object.keys(next.manifest.dependencies ?? {}),
      ...Object.keys(next.manifest.peerDependencies ?? {}),
      ...Object.keys(next.manifest.optionalDependencies ?? {}),
    ]) {
      const dir = packageDir(next.dir, name);
      if (dir !== null) add(dir);
    }
  }
  return [...found.values()];
}

/**
 * Every boundary the project's dependencies and workspace packages declare in
 * their `package.json`, under `"barq": { "boundaries": [...] }`. A package
 * that ships a renderer knows which of its components host it, so an
 * application that installs it compiles those components' children for it
 * with no configuration.
 */
export function discoverBoundaries(root: string): BarqBoundary[] {
  const found = installedPackages(root).flatMap(({ manifest }) => declaredBoundaries(manifest));
  return mergeBoundaries([], found);
}

/**
 * Every intrinsic claim the project's dependencies and workspace packages
 * declare, under `"barq": { "intrinsics": [...] }`.
 */
export function discoverIntrinsics(root: string): BarqIntrinsic[] {
  return installedPackages(root).flatMap(({ dir, manifest }) => declaredIntrinsics(manifest, dir));
}

/**
 * The discovered claims, then the configured ones. A tag the configuration
 * claims is taken from every discovered entry, and so is `claimUnknown`, so
 * the application settles what two packages would otherwise both claim.
 */
export function mergeIntrinsics(
  configured: readonly BarqIntrinsic[],
  discovered: readonly BarqIntrinsic[],
): BarqIntrinsic[] {
  const taken = new Set(configured.flatMap((entry) => entry.tags));
  const unknownTaken = configured.some((entry) => entry.claimUnknown === true);
  const kept: BarqIntrinsic[] = [];
  for (const entry of discovered) {
    const tags = entry.tags.filter((tag) => !taken.has(tag));
    const claimUnknown = entry.claimUnknown === true && !unknownTaken;
    if (tags.length === 0 && !claimUnknown) continue;
    kept.push({ ...entry, tags, claimUnknown });
  }
  return [...kept, ...configured];
}

/**
 * The configured boundaries, then every discovered one the configuration does
 * not already name: an entry for the same `source` and `name` is the
 * application's decision, and it wins.
 */
export function mergeBoundaries(
  configured: readonly BarqBoundary[],
  discovered: readonly BarqBoundary[],
): BarqBoundary[] {
  const key = (entry: BarqBoundary): string => `${entry.source}\0${entry.name}`;
  const taken = new Set<string>();
  const merged: BarqBoundary[] = [];
  for (const entry of [...configured, ...discovered]) {
    if (taken.has(key(entry))) continue;
    taken.add(key(entry));
    merged.push(entry);
  }
  return merged;
}

/**
 * The nearest `package.json` above a file, and whether it is a barq package.
 *
 * Cached by directory: a build asks this once per module and the answer is a
 * fact about the package, not the file.
 */
function inBarqPackage(file: string, cache: Map<string, boolean>): boolean {
  let at = dirname(file);
  const walked: string[] = [];
  for (let up = 0; up < 24; up++) {
    const hit = cache.get(at);
    if (hit !== undefined) {
      for (const dir of walked) cache.set(dir, hit);
      return hit;
    }
    walked.push(at);
    const manifest = join(at, "package.json");
    if (existsSync(manifest)) {
      let answer = false;
      try {
        answer = publishesSource(
          (JSON.parse(readFileSync(manifest, "utf8")) as { exports?: unknown }).exports,
        );
      } catch {
        answer = false;
      }
      for (const dir of walked) cache.set(dir, answer);
      return answer;
    }
    const next = dirname(at);
    if (next === at) break;
    at = next;
  }
  for (const dir of walked) cache.set(dir, false);
  return false;
}

export function barqVitePlugin(options: BarqVitePluginOptions = {}): Plugin {
  const {
    include = [".tsx", ".jsx"],
    exclude = [/node_modules/],
    overlay = "error",
    cssMode,
    resolveImports = true,
    compilePackages = true,
    preloadHelper = "error",
    ...compilerOptions
  } = options;

  /**
   * What each file exports that another can fold against, keyed by path and
   * mtime so an edit is a different key and a build reads each file once.
   */
  const exportsByFile = new Map<string, FoldedModule>();

  /** Whether a directory sits in a package that publishes its source. */
  const barqPackageCache = new Map<string, boolean>();

  // The compiler's dev-mode diagnostics are advice about runtime behaviour, so
  // they belong on a dev build and nowhere else. Deriving it from Vite means the
  // user never has to ask for it twice — and left to the user it never fired at
  // all, because nothing else in the chain sets it.
  let dev = compilerOptions.dev;
  let server: ViteDevServer | undefined;
  let serving = false;
  let root = process.cwd();
  // The configured entries until `config` knows the root to discover from.
  let boundaries = mergeBoundaries(compilerOptions.boundaries ?? [], []);
  let intrinsics = mergeIntrinsics(compilerOptions.intrinsics ?? [], []);

  // Per module, so a file that stops reporting clears its own rows. A terminal
  // warning fires once per transform and is gone after a reload; this is the
  // channel that survives one.
  const byModule = new Map<string, BarqDiagnostic[]>();
  const labelsByModule = new Map<string, BarqTemplateLabel[]>();
  const cssByModule = new Map<string, string>();
  /**
   * Every stylesheet id a module has registered rules under in `"inline"` mode.
   *
   * The registry replaces an entry only when it is registered again, so a
   * module whose rules are all gone has to say so or its last version's rules
   * stay on the page. Never forgotten once added: the client's registry and
   * the server's are two, each transform pass speaks to one of them, and
   * registering nothing twice costs a line.
   */
  const inlined = new Set<string>();

  /** Whether this build's preload helper was rewritten to link in front of the atoms. */
  let helperPlaced = false;

  /** The stylesheet keys each module registers in `"inline"` mode, in the order it does. */
  const sheetsByModule = new Map<string, string[]>();

  function publish(): void {
    if (!server) return;
    server.hot.send({
      type: "custom",
      event: DIAGNOSTICS_EVENT,
      data: {
        overlay,
        diagnostics: [...byModule.values()].flat(),
        labels: Object.fromEntries(labelsByModule),
      },
    });
  }

  return {
    name: "barq-compiler",
    enforce: "pre",

    api: {
      /** The cascade layer order every module stylesheet so far declares between them. */
      layerOrder: (): string[] => loadNativeCompiler()?.layerOrder([...cssByModule.values()]) ?? [],
      /** The registry keys a module's own code registers its rules under, in dev. */
      stylesheetsOf: (id: string): readonly string[] => sheetsByModule.get(id) ?? [],
      /** Every registry key a module registers its rules under, in dev. */
      stylesheets: (): ReadonlySet<string> => new Set([...sheetsByModule.values()].flat()),
    } satisfies CompilerApi,

    config(
      config: {
        root?: string;
        resolve?: { noExternal?: unknown };
        optimizeDeps?: {
          include?: string[];
          exclude?: string[];
          rolldownOptions?: { transform?: { jsx?: unknown } };
        };
      },
      env,
    ) {
      if (dev === undefined) dev = env.command === "serve" || env.mode !== "production";
      serving = env.command === "serve";
      root = resolve(config.root ?? process.cwd());
      boundaries = mergeBoundaries(compilerOptions.boundaries ?? [], discoverBoundaries(root));
      intrinsics = mergeIntrinsics(compilerOptions.intrinsics ?? [], discoverIntrinsics(root));

      // A barq package ships SOURCE, so Vite must not externalise it: node
      // would be handed the `.ts` the condition resolved to and refuse it.
      // Named rather than matched, because "a package that publishes source"
      // is a fact about its manifest and not about its name.
      const bundled = compilePackages ? barqPackages(config.root ?? process.cwd()) : [];
      if (bundled.length > 0) {
        config.resolve ??= {};
        const already = config.resolve.noExternal;
        if (already !== true) {
          config.resolve.noExternal = [
            ...(Array.isArray(already) ? (already as unknown[]) : already ? [already] : []),
            ...bundled,
          ];
        }
      }

      const optimizeDeps = (config.optimizeDeps ??= {});
      // Pre-bundling one would compile its JSX with the bundler's own runtime
      // instead of this compiler.
      if (bundled.length > 0) optimizeDeps.exclude = [...(optimizeDeps.exclude ?? []), ...bundled];
      // The scanner reads raw TSX, and with the automatic runtime it reports a
      // `jsx-dev-runtime` import that no compiled module makes.
      optimizeDeps.rolldownOptions ??= {};
      optimizeDeps.rolldownOptions.transform ??= {};
      optimizeDeps.rolldownOptions.transform.jsx ??= { runtime: "classic" };
      // Every component module this plugin wraps imports it, and the scanner
      // never sees that import because it reads the source before the wrap.
      // Found later, it re-optimizes and reloads the page on the first edit.
      if (
        serving &&
        (compilerOptions.hmr ?? true) &&
        optimizable(root, compilerOptions.coreSource ?? "@barqjs/core")
      ) {
        optimizeDeps.include = [
          ...(optimizeDeps.include ?? []),
          `${compilerOptions.coreSource ?? "@barqjs/core"}/hot`,
        ];
      }
    },

    configEnvironment(
      name: string,
      config: { optimizeDeps?: { rolldownOptions?: { transform?: { jsx?: unknown } } } },
    ) {
      // Vite seeds only the client environment's optimizer from the top level,
      // and a server environment that turns discovery on scans TSX too.
      if (name === "client") return;
      config.optimizeDeps ??= {};
      config.optimizeDeps.rolldownOptions ??= {};
      config.optimizeDeps.rolldownOptions.transform ??= {};
      config.optimizeDeps.rolldownOptions.transform.jsx ??= { runtime: "classic" };
    },

    // A server-function id is derived relative to the project root, so an id
    // carries no absolute path into a client bundle. Vite knows the root; a
    // caller that passes one explicitly means something else by it and wins.
    configResolved(config: { root?: string; server?: { hmr?: unknown } }) {
      if (compilerOptions.root === undefined) compilerOptions.root = config.root;
      // A server with HMR off has no update to refresh a component with, and
      // the `import.meta.hot` such a server's module runner hands a module has
      // no `data` for the wrap to keep its components in: under vitest every
      // component module failed to load reading `barq:components` off it.
      if (config.server?.hmr === false) compilerOptions.hmr = false;
    },

    configureServer(devServer) {
      server = devServer;
      // A page that connects after the transforms have already run would
      // otherwise see nothing until the next edit.
      devServer.hot.on("barq:diagnostics:ready", () => {
        publish();
        replayServerDiagnostics(devServer);
      });
      devServer.hot.on(SERVER_DIAGNOSTICS_CLEAR, () => clearServerDiagnostics(devServer));
      devServer.watcher.on("change", () => clearServerDiagnostics(devServer));
    },

    resolveId(id) {
      if (id === CLIENT_ID) return RESOLVED_CLIENT_ID;
      if (id === ATOMS_ID) return ATOMS_ID;
      // Claimed verbatim rather than resolved: the id already IS a real path,
      // and letting Vite resolve it again drops the query the stylesheet is
      // keyed by.
      return id.includes(CSS_QUERY) ? id : null;
    },

    load(id) {
      if (id === RESOLVED_CLIENT_ID) {
        return overlayModule(
          {
            event: DIAGNOSTICS_EVENT,
            ready: "barq:diagnostics:ready",
            server: SERVER_DIAGNOSTICS_EVENT,
            clear: SERVER_DIAGNOSTICS_CLEAR,
            root,
          },
          compilerOptions.coreSource ?? "@barqjs/core",
        );
      }
      if (id === ATOMS_ID) return ATOMS_MARKER;
      if (!id.includes(CSS_QUERY)) return null;
      return cssByModule.get(id) ?? "";
    },

    /**
     * Every CSS asset, with its atoms ordered by tier.
     *
     * An atom's tier settles the one pair specificity cannot — a base rule
     * against the same property under an at-rule, since `@media` adds none —
     * and a call emits its atoms in tier order, so it held inside one call and
     * nowhere else. The compiler emits one stylesheet per MODULE and the
     * bundler concatenates them in import order, so a `@media` rule from one
     * module landed before a base rule from another and lost a pair it should
     * win. Measured on `@barqjs/ui`'s gallery: 8 computed values, among them a
     * calendar that laid out in a column at 1280px because
     * `@media (width >= 48rem) { flex-direction: row }` was beaten by a
     * `flex-direction: column` a later module wrote.
     *
     * `collectCss` has always sorted globally, so DEV was already right. This
     * is what makes the build agree with it.
     *
     * `generateBundle` and not `transform`, because the ordering is a fact
     * about the whole asset and `transform` is per file and holds no cross-file
     * state — which is the property that keeps dev and build identical
     * everywhere else, and the one StyleX gives up.
     *
     * The CASCADE LAYER ORDER is declared here for the same reason and settles
     * a different failure. A layer's position is fixed by its first appearance
     * across every stylesheet the document loads, and a code-split build is
     * several stylesheets whose link order the bundler decides — so the chunk
     * that happened to hold `@layer a, b, c;` is not reliably the first one,
     * and a chunk carrying `@layer b{ … }` ahead of it puts `b` at the front.
     * Measured on this site: `@barqjs/ui`'s components were declared before
     * `barq.reset`, Tailwind's preflight became the later layer and beat every
     * one of them, and buttons lost their padding and their background.
     *
     * The order is read from the MODULE stylesheets, not from the assets: by
     * the time an asset exists Lightning CSS has rewritten the statement to
     * name only the layers with no block in the same file, which is sound
     * within one sheet and loses the order across several.
     */
    generateBundle: {
      // Before every other plugin's: the router and Start read each chunk's
      // list of stylesheets in this hook to write what a route links, and this
      // is what takes the emptied ones off it.
      order: "pre",
      handler(this: BundleContext, _options, bundle) {
        const compiler = loadNativeCompiler();
        if (!compiler) return;
        // Unsplit, the one stylesheet is written by Vite's own `generateBundle`,
        // after this one; `barqStylesheets` finishes it once it exists.
        if (!cssCodeSplit(this)) return;
        const layers = compiler.layerOrder([...cssByModule.values()]);
        const assets = Object.values(bundle).filter(
          (asset) => asset.type === "asset" && asset.fileName.endsWith(".css"),
        ) as { source: string | Uint8Array }[];
        let sources = assets.map(sourceText);
        // One sheet for every atom: a chunk loaded later then cannot write a
        // base rule after another chunk's `@media` rule for the same property.
        // A build with no marker has no module that asked for the shared sheet,
        // and each asset keeps its own atoms.
        let atoms = "";
        if (sources.some((source) => ATOMS_MARKER_RULE.test(source))) {
          const gathered = compiler.gatherAtoms(sources);
          sources = gathered.sheets.map((source) => source.replace(ATOMS_MARKER_RULE, ""));
          atoms = gathered.atoms;
        }
        assets.forEach((asset, index) => {
          asset.source = compiler.orderCss(sources[index] ?? "", layers);
        });
        // Its own file, linked after every chunk's, because an atom and a `css`
        // block class are both 0-1-0 and the later rule wins the property. Left
        // where the marker stood, the atoms sat inside one chunk's sheet with
        // that chunk's blocks after them, and every chunk linked later followed
        // too. Every entry links it, last, so a page has it from its first
        // paint and no dynamic import is what brings it.
        if (atoms !== "") {
          // The helper is reached through `transform` under the id this
          // version knows. A Vite that renames it, or loads it some other way,
          // never got here, and its chunks' stylesheets would land after the
          // atoms with nothing said about it.
          if (!helperPlaced && lazilyLinked(bundle)) {
            if (preloadHelper === "warn") this.warn(PRELOAD_HELPER_UNKNOWN);
            else this.error(PRELOAD_HELPER_UNKNOWN);
          }
          const reference = this.emitFile({
            type: "asset",
            name: ATOMS_ASSET,
            source: compiler.orderCss(atoms, layers),
          });
          const fileName = this.getFileName(reference);
          for (const chunk of Object.values(bundle)) {
            if (chunk.type !== "chunk" || !chunk.isEntry) continue;
            const linked = chunk.viteMetadata?.importedCss;
            linked?.delete(fileName);
            linked?.add(fileName);
          }
        }
        // A chunk whose stylesheet was atoms and nothing else now has an empty
        // one. It leaves the bundle and every chunk's list of what to link, which
        // the manifest and the preload lists are written from after this, so no
        // page asks for a file that holds nothing.
        for (const [name, asset] of Object.entries(bundle)) {
          if (asset.type !== "asset" || !name.endsWith(".css")) continue;
          // Vite ends each sheet with a comment of its own at this point, which is
          // then all that is left.
          if (typeof asset.source !== "string") continue;
          if (asset.source.replace(/\/\*[\s\S]*?\*\//g, "").trim() !== "") continue;
          delete bundle[name];
          for (const chunk of Object.values(bundle)) {
            if (chunk.type === "chunk") chunk.viteMetadata?.importedCss.delete(name);
          }
        }
      },
    },

    // Dev only, so no byte of the panel can reach a production bundle.
    transformIndexHtml() {
      if (!dev || overlay === false || !server) return undefined;
      return [
        {
          tag: "script",
          // The UNRESOLVED id. `/@id/` takes a module specifier and resolves it;
          // handing it the already-resolved `\0`-prefixed form emits a literal
          // NUL in the attribute and 404s, so the overlay never loaded at all.
          // Measured against a dev server: `/@id/\0virtual:barq-diagnostics` is
          // 404, `/@id/virtual:barq-diagnostics` is 200.
          attrs: { type: "module", src: `/@id/${CLIENT_ID}` },
          injectTo: "body",
        },
      ];
    },

    // Which half is being compiled is a per-MODULE fact, not a per-plugin one:
    // Vite runs the same file through this hook once per environment.
    //
    // `this.environment.name` is the Environment API's answer and is preferred.
    // The `ssr` boolean is the pre-6 one, kept as the fallback for a caller that
    // is not Vite at all — the tests drive this hook directly — rather than as a
    // second opinion when both are present.
    async transform(
      this: {
        environment?: { name?: string; config?: { consumer?: string } };
        error(message: string, position?: number): never;
        warn(message: string, position?: number): void;
        resolve?(
          source: string,
          importer?: string,
        ): Promise<{ id: string; external?: boolean | string } | null>;
        addWatchFile?(file: string): void;
        parse?(code: string, options?: { lang?: "ts" }): unknown;
      },
      code: string,
      id: string,
      transformOptions?: { ssr?: boolean },
    ): Promise<TransformResult | null> {
      const environment = this?.environment;
      // The environment's consumer says which half a module is compiled for,
      // so a second browser environment is compiled as one. Without a config
      // the name decides: `client` is Vite's browser environment, and anything
      // else is a server one, which is the safe direction — a module wrongly
      // treated as client-side loses its handler bodies and fails loudly, where
      // the reverse ships them.
      const consumer = environment?.config?.consumer;
      const forClient =
        consumer !== undefined
          ? consumer === "client"
          : environment?.name !== undefined
            ? environment.name === "client"
            : transformOptions?.ssr !== true;
      // The QUERY comes off first. A module id can carry one — `barqRouter`
      // serves a route's split half at `<file>?barq-split` — and matching the
      // extension against the raw id skipped exactly those, so the split half
      // of every route reached the bundler with its JSX untransformed.
      // Our OWN stylesheet, coming back round: `…/Demo.tsx.barq.css` still
      // contains `.tsx`, and a `path.endsWith` list is not what tells them
      // apart.
      if (id.includes(CSS_QUERY)) return null;

      // The one place a build links a chunk's stylesheet after the first paint.
      // Vite appends it to `<head>`, after the atoms; it goes in front of them
      // instead. A helper that no longer appends this way fails the build rather
      // than linking stylesheets that beat every atom.
      if (id === PRELOAD_HELPER) {
        const inserts = [...code.matchAll(PRELOAD_INSERT)];
        if (inserts.length !== 1) {
          if (preloadHelper === "warn") {
            this.warn(PRELOAD_HELPER_UNKNOWN);
            return null;
          }
          this.error(PRELOAD_HELPER_UNKNOWN);
        }
        helperPlaced = true;
        return {
          code: code.replace(PRELOAD_INSERT, (_, link: string) => `${PLACE_STYLESHEET}(${link})`),
          map: null,
        };
      }

      const path = id.split("?", 1)[0] ?? id;
      const query = id.slice(path.length);
      // The stylesheet is keyed by the WHOLE id, query included. A route is
      // split into two modules that differ only by `?barq-split`, and keying on
      // the path alone gave both the same stylesheet: whichever transformed
      // last won, and the half that lost was the one with the component in it.
      // Measured in a browser — the route's markup carried every class and its
      // sheet was 36 bytes.
      const stylesheet = `${path}${CSS_QUERY}${query}`;
      const cssSource = compilerOptions.cssSource ?? DEFAULT_CSS_SOURCE;
      // A stylesheet lives in a `.ts` module with no JSX in it, so extension
      // alone would skip exactly the file the CSS is in. Naming the package is
      // the cheap gate; the compiler then resolves the tag by symbol.
      // Only a script module: a `package.json` or a JSON data file that merely
      // NAMES the package is not a module to compile.
      const coreSource = compilerOptions.coreSource ?? "@barqjs/core";
      const named =
        (compilerOptions.sourceNames ?? dev === true) &&
        (code.includes(coreSource) || code.includes("@solidjs/signals"));
      const shouldTransform =
        include.some((ext) => path.endsWith(ext)) ||
        (SCRIPT_MODULE.test(path) &&
          (named || code.includes(cssSource) || callsThroughImport(code, cssSource)));
      if (!shouldTransform) {
        // The package's name was the only reason this module was compiled, and
        // an edit that takes the last rule out usually takes the import too.
        if (!inlined.has(stylesheet)) return null;
        return { code: code + cssRegistrations([[stylesheet, ""]], cssSource), map: null };
      }

      // `node_modules` is excluded by default and a barq package inside it is
      // not: it published SOURCE precisely so this build would compile it, for
      // this environment. Skipping it leaves JSX in the graph and the module
      // fails to parse — or worse, another plugin lowers it with different
      // semantics.
      const isExcluded =
        exclude.some((pattern) =>
          typeof pattern === "string" ? id.includes(pattern) : pattern.test(id),
        ) && !(compilePackages && inBarqPackage(path, barqPackageCache));
      if (isExcluded) return null;

      const compiler = loadNativeCompiler();
      if (!compiler) {
        throw new Error(
          `[barq-compiler] \`${NATIVE_PACKAGE}\` could not be loaded (${nativeLoadError}), so no JSX file can be compiled. ` +
            `Reinstall dependencies with \`bun install\`. In a checkout of the barq repository, build the native binary with ` +
            `\`bun run --cwd packages/compiler build\`.`,
        );
      }

      /**
       * What one imported file exports, compiled once and remembered: its
       * rows, its own stylesheet, and the stylesheets it folded against.
       *
       * Recursive, because a token file can itself import a token file, and
       * depth-bounded and cycle-guarded because a module graph is neither a
       * tree nor acyclic. A file that will not resolve contributes nothing and
       * the fold declines exactly as it would have.
       */
      /**
       * The file a resolved dependency's values are read from. A package the
       * dev server pre-bundles resolves to the bundle, which wraps the source
       * in code a fold cannot read and may not be written yet while the
       * optimizer is still discovering; its own source is the same values.
       */
      const optimizer = (this as { environment?: { depsOptimizer?: DepsOptimizer } }).environment
        ?.depsOptimizer;
      const sourceOf = (resolvedId: string): string => {
        const file = resolvedId.split("?", 1)[0] ?? resolvedId;
        if (optimizer === undefined) return file;
        const { optimized, discovered } = optimizer.metadata;
        for (const info of [...Object.values(optimized), ...Object.values(discovered)]) {
          if (info.file === file && info.src !== undefined) return info.src;
        }
        return file;
      };

      const unchanged = async (stamps: ReadonlyMap<string, number>): Promise<boolean> => {
        for (const [file, at] of stamps) {
          try {
            if ((await stat(file)).mtimeMs !== at) return false;
          } catch {
            return false;
          }
        }
        return true;
      };

      const exportsOf = async (
        dependency: string,
        depth: number,
        seen: Set<string>,
      ): Promise<FoldedModule> => {
        if (depth <= 0 || seen.has(dependency)) return NOTHING_FOLDED;
        seen.add(dependency);
        let modified: number;
        try {
          modified = (await stat(dependency)).mtimeMs;
        } catch {
          return NOTHING_FOLDED;
        }
        const hit = exportsByFile.get(dependency);
        if (hit !== undefined && (await unchanged(hit.stamps))) return hit;

        let source: string;
        try {
          source = await readFile(dependency, "utf8");
        } catch {
          return NOTHING_FOLDED;
        }
        let folded = NOTHING_FOLDED;
        try {
          const carried = new Map<string, string>();
          const stamps = new Map([[dependency, modified]]);
          const out = await compileWithImports(
            source,
            dependency,
            depth - 1,
            seen,
            carried,
            { cssExports: true },
            stamps,
          );
          folded = { rows: out.cssExports ?? [], css: out.css ?? "", carried, stamps };
        } catch {
          folded = NOTHING_FOLDED;
        }
        exportsByFile.set(dependency, folded);
        return folded;
      };

      /**
       * The stylesheets a fold of `name` out of `dependency` needs.
       *
       * Folding an imported value INLINES it, which can leave that module with
       * no used export, and a bundler then drops the module and the
       * `import "….barq.css"` inside it. Measured on a four-file app: the JS
       * carried `a-outline-width_o01p2h` and the asset defined nothing, because
       * `shared.ts` had been tree-shaken whole. So the consumer carries the
       * stylesheet the value's rules are in, as a side-effect import that
       * survives.
       *
       * Through a barrel, that is the module the barrel's `from` row names
       * rather than the barrel, which holds no rules, and rather than everything
       * the barrel re-exports, which is every module behind it: an application
       * reading one treatment through `@barqjs/arc/style` would otherwise carry
       * the stylesheet of every family.
       */
      const carry = async (
        dependency: string,
        name: string,
        depth: number,
        seen: Set<string>,
        into: Map<string, string>,
      ): Promise<void> => {
        const folded = await exportsOf(dependency, depth, new Set(seen));
        const names =
          name === "*"
            ? [...new Set(folded.rows.map((row) => row[0] ?? ""))].filter(
                (one) => one !== "default",
              )
            : [name];
        let own = false;
        for (const one of names) {
          const from = folded.rows.find((row) => row[0] === one && row[1] === "from");
          const resolved =
            from === undefined || depth <= 1
              ? undefined
              : await this.resolve?.(from[3] ?? "", dependency);
          if (
            from === undefined ||
            !resolved ||
            resolved.external === true ||
            resolved.external === "absolute"
          ) {
            own = true;
            continue;
          }
          const origin = sourceOf(resolved.id);
          await carry(origin, from[2] ?? "", depth - 1, seen, into);
        }
        if (!own) return;
        if (folded.css !== "") into.set(dependency, folded.css);
        for (const [file, sheet] of folded.carried) into.set(file, sheet);
      };

      /**
       * A module compiled with its imports resolved, in as many rounds as it
       * asks for.
       *
       * More than one round because a style object stops reading at the FIRST
       * value it cannot resolve, so the second unresolved name in one object is
       * only reported once the first has an answer. Bounded, and a round that
       * learns nothing new ends it.
       *
       * A name of `*` is a namespace import or an `export *`, and is answered
       * with every row the other module exports. A `from` row says where a
       * value's rules are and is not a value, so it is never handed over.
       */
      const compileWithImports = async (
        source: string,
        file: string,
        depth: number,
        seen: Set<string>,
        carried: Map<string, string>,
        extra: { cssExports?: boolean } = {},
        stamps?: Map<string, number>,
      ): Promise<NativeResult> => {
        const base = {
          moduleSource: compilerOptions.moduleSource,
          target: compilerOptions.target,
          renderers: rendererEntries(compilerOptions.renderers),
          boundaries: boundaries.length > 0 ? boundaries : undefined,
          intrinsics:
            intrinsics.length > 0
              ? intrinsics.map((entry) => ({ ...entry, tags: [...entry.tags] }))
              : undefined,
          coreSource: compilerOptions.coreSource,
          serverSource: compilerOptions.serverSource,
          startSource: compilerOptions.startSource,
          clientSource: compilerOptions.clientSource,
          routerSource: compilerOptions.routerSource,
          cssSource: compilerOptions.cssSource,
          strictCss: compilerOptions.strictCss,
          routes:
            typeof compilerOptions.routes === "function"
              ? compilerOptions.routes()
              : compilerOptions.routes,
          serverFns: compilerOptions.serverFns,
          // Derived from the same argument that already decides the backend,
          // because it is the same fact: the client transform is the client
          // half. Explicit only when a caller means something other than what
          // Vite is doing.
          env: compilerOptions.env ?? (forClient ? "client" : "server"),
          root: compilerOptions.root,
          templates: compilerOptions.templates,
          diagnostics: compilerOptions.diagnostics,
          checks: checkPairs(compilerOptions.checks),
          defaultCategory: compilerOptions.defaultCategory,
          optimize: compilerOptions.optimize,
          passes: passPairs(compilerOptions.passes),
          // One value for both halves. It is a per-PLUGIN option and never a
          // per-module one, because a client that walks logically over markup
          // that carries no ranges is the mismatch, not a configuration.
          hydratable: compilerOptions.hydratable,
          interp: (compilerOptions.interp ?? false) && forClient,
          dev,
          sourceNames: compilerOptions.sourceNames,
          filename: file,
          sourcemap: true,
          ssr: !forClient,
          ...extra,
        };
        let out = compiler.transform(source, base);
        if (!resolveImports || depth <= 0 || this.resolve === undefined) return out;

        const cssImports: string[][] = [];
        const asked = new Set<string>();
        for (let round = 0; round < 4; round++) {
          const wanted = (out.cssWanted ?? []).filter(
            (entry) => !asked.has(`${entry[0]}\u0000${entry[1]}`),
          );
          if (wanted.length === 0) break;
          let learned = false;
          for (const [specifier, name] of wanted) {
            asked.add(`${specifier}\u0000${name}`);
            const resolved = await this.resolve?.(specifier ?? "", file);
            if (!resolved || resolved.external === true || resolved.external === "absolute")
              continue;
            const dependency = sourceOf(resolved.id);
            // A watched dependency, so editing the token file retransforms
            // every module that folded against it.
            this.addWatchFile?.(dependency);
            const { rows, stamps: read } = await exportsOf(dependency, depth, new Set(seen));
            for (const [one, at] of read) stamps?.set(one, at);
            let answered = false;
            for (const row of rows) {
              if (row[1] === "from" || (name !== "*" && row[0] !== name)) continue;
              cssImports.push([specifier ?? "", ...row]);
              answered = true;
            }
            if (!answered) continue;
            learned = true;
            await carry(dependency, name ?? "", depth, seen, carried);
          }
          if (!learned) break;
          out = compiler.transform(source, { ...base, cssImports });
        }
        return out;
      };

      // A native transform can fail on a parse diagnostic, and anything the
      // Rust side raises arrives here as a bare message with no file in it.
      let result: NativeResult;
      const foldedAgainst = new Map<string, string>();
      try {
        result = await compileWithImports(code, id, 6, new Set([id]), foldedAgainst);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`[barq-compiler] \`${id}\` could not be compiled: ${message}`, {
          cause: error,
        });
      }

      if (result.serverFns !== undefined) compilerOptions.onServerFns?.(id, result.serverFns);

      const diagnostics = result.diagnostics ?? [];
      for (const diagnostic of diagnostics) {
        // THE second argument is the whole point: Rollup only produces
        // `pos`/`loc`/`frame` when it is given a position, and passing none is
        // why this pipeline had no code frame anywhere, in any mode. The text is
        // the message alone — `result.warnings[i]` carries its own
        // `file:line:col:` prefix, and Rollup prints the location it was given,
        // so passing that form printed one identifier at two columns.
        const docs = diagnostic.docs === undefined ? "" : `\n  docs: ${diagnostic.docs}`;
        const text = `${diagnostic.code} ${diagnostic.severity}: ${diagnostic.message}${docs}`;
        if (diagnostic.severity === "error") {
          this.error(text, diagnostic.pos);
        } else {
          this.warn(text, diagnostic.pos);
        }
      }

      // Only the client pass, or a file compiled twice reports twice.
      if (forClient) {
        if (diagnostics.length > 0) {
          byModule.set(
            id,
            diagnostics.map((diagnostic) => ({
              ...diagnostic,
              frame: frameAround(code, diagnostic.line, diagnostic.endLine),
            })),
          );
        } else {
          byModule.delete(id);
        }
        if (result.labels?.length) labelsByModule.set(id, result.labels);
        else labelsByModule.delete(id);
        publish();
      }

      // Appended rather than prepended: an `import` is hoisted wherever it
      // stands, and adding a line at the top would shift every mapping in the
      // source map the compiler just produced.
      const mode = cssMode ?? (dev === true ? "inline" : "asset");
      let emitted = result.code;
      let sharesAtoms = false;
      // Collected rather than appended one at a time: they share an import.
      const inline: [string, string][] = [];
      if (result.css !== undefined && result.css !== "") {
        if (mode === "inline") {
          inline.push([stylesheet, result.css]);
          inlined.add(stylesheet);
        } else {
          const changed = cssByModule.get(stylesheet) !== result.css;
          cssByModule.set(stylesheet, result.css);
          emitted += `\nimport ${JSON.stringify(stylesheet)};\n`;
          sharesAtoms ||= result.css.includes(".a-");
          // The stylesheet's id does not change when its content does, so Vite
          // would serve the module it already has.
          if (changed && server !== undefined) {
            const module = server.moduleGraph.getModuleById(stylesheet);
            if (module) server.moduleGraph.invalidateModule(module);
          }
        }
      } else if (mode === "inline") {
        if (inlined.has(stylesheet)) inline.push([stylesheet, ""]);
      } else if (cssByModule.delete(stylesheet) && server !== undefined) {
        const module = server.moduleGraph.getModuleById(stylesheet);
        if (module) server.moduleGraph.invalidateModule(module);
      }

      // And the stylesheet of everything this module folded a value out of. The
      // module that declares a group emits those rules when it is compiled, but
      // inlining its value can leave it with no used export and a bundler drops
      // it whole. A side-effect import here keeps the rules a class on this
      // page needs.
      for (const [dependency, sheet] of foldedAgainst) {
        const other = `${dependency}${CSS_QUERY}`;
        if (mode === "inline") {
          inline.push([other, sheet]);
          continue;
        }
        cssByModule.set(other, sheet);
        emitted += `\nimport ${JSON.stringify(other)};\n`;
        sharesAtoms ||= sheet.includes(".a-");
      }
      // A build only: a server answers each module's own stylesheet as it is
      // asked for, and has no moment at which every atom is known.
      if (sharesAtoms && !serving) {
        emitted += `\nimport ${JSON.stringify(ATOMS_ID)};\n`;
      }

      if (inline.length === 0) sheetsByModule.delete(id);
      else
        sheetsByModule.set(
          id,
          inline.map(([key]) => key),
        );
      emitted += cssRegistrations(inline, cssSource);

      // The client half of an application's own module, while serving. A
      // dependency's components are read as data by the library that owns
      // them, and the server builds each page once.
      const own = id.split("?", 1)[0] ?? id;
      if (
        serving &&
        forClient &&
        (compilerOptions.hmr ?? true) &&
        this.parse !== undefined &&
        own.startsWith(root) &&
        !own.includes("/node_modules/")
      ) {
        const components = new Set<string>();
        for (const label of result.labels ?? []) {
          if (label.component !== undefined) components.add(label.component);
        }
        // The compiler leaves the types in for the bundler to erase, so this is
        // still TypeScript. A module the parser will not take is served as it
        // is: it reloads the page on an edit, which is what it did before.
        let program: HotProgram | undefined;
        try {
          program = this.parse(emitted, { lang: "ts" }) as HotProgram;
        } catch {
          program = undefined;
        }
        if (program !== undefined) {
          emitted = withHotComponents(
            emitted,
            componentsIn(program, components),
            program,
            compilerOptions.coreSource,
          );
        }
      }

      return {
        code: emitted,
        map: result.map ? (JSON.parse(result.map) as TransformResult["map"]) : null,
      };
    },
  };
}

/** What `barq-compiler` offers the plugins beside it. */
export interface CompilerApi {
  layerOrder(): string[];
  stylesheetsOf(id: string): readonly string[];
  stylesheets(): ReadonlySet<string>;
}

/**
 * The stylesheet work that has to wait for Vite's own.
 *
 * `build.cssCodeSplit: false` writes ONE stylesheet, and Vite writes it in its
 * own `generateBundle`, which runs after `barq-compiler`'s: that one is first
 * because the router and Start read each chunk's list of stylesheets in the
 * same hook. Unsplit, there was then nothing to gather when the gathering ran,
 * the marker rule stayed in the sheet and the atoms stayed in module order.
 * Here the sheet exists, and its atoms are taken out, written once and put
 * after its blocks, which is where a split build's own file of atoms is linked.
 *
 * And the document a client-rendered build writes: Vite links the entry's
 * stylesheets there, the atoms' last, and the attribute is what lets the
 * preload helper put a later stylesheet in front of them.
 */
export function barqStylesheets(): Plugin {
  return {
    name: "barq-compiler:stylesheets",
    apply: "build",
    generateBundle: {
      order: "post",
      handler(this: BundleContext, _options, bundle) {
        if (cssCodeSplit(this)) return;
        const compiler = loadNativeCompiler();
        if (compiler === undefined) return;
        const api = this.environment?.config?.plugins?.find(
          (plugin) => plugin.name === "barq-compiler",
        )?.api as CompilerApi | undefined;
        // By what it holds rather than by its name: the marker every module
        // holding an atom imports reaches only the one sheet an unsplit build
        // writes, whatever `build.lib` called it.
        const layers = api?.layerOrder() ?? [];
        const library =
          this.environment?.config?.build?.lib !== undefined &&
          this.environment.config.build.lib !== false;
        for (const asset of Object.values(bundle)) {
          if (asset.type !== "asset" || !asset.fileName.endsWith(".css")) continue;
          const source = sourceText(asset);
          if (!ATOMS_MARKER_RULE.test(source)) continue;
          const gathered = compiler.gatherAtoms([source]);
          const blocks = (gathered.sheets[0] ?? "").replace(ATOMS_MARKER_RULE, "");
          // A library ships one stylesheet for its consumer to import, so its
          // atoms stay in it, after its blocks.
          if (library || gathered.atoms === "") {
            asset.source = compiler.orderCss(blocks + gathered.atoms, layers);
            continue;
          }
          // An application's atoms are a file of their own, linked after the
          // sheet, as a split build's are: what the runtime registers and
          // what `useHead` or a streamed head adds then has a link to stand in
          // front of. Inside the one sheet they had none, and a block the
          // runtime evaluated was written after every atom.
          asset.source = compiler.orderCss(blocks, layers);
          const reference = this.emitFile({
            type: "asset",
            name: ATOMS_ASSET,
            source: compiler.orderCss(gathered.atoms, layers),
          });
          const atoms = this.getFileName(reference);
          for (const page of Object.values(bundle)) {
            if (page.type !== "asset" || !page.fileName.endsWith(".html")) continue;
            page.source = linkedAfter(sourceText(page), asset.fileName, atoms);
          }
        }
      },
    },
    transformIndexHtml: {
      order: "post",
      handler(html, context) {
        const atoms = context.bundle === undefined ? undefined : atomsAsset(context.bundle);
        if (atoms === undefined) return html;
        const href = atoms.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return html.replace(
          new RegExp(`<link\\b([^>]*\\shref="[^"]*${href}"[^>]*?)\\s*/?>`),
          `<link$1 ${ATOMS_ATTRIBUTE}>`,
        );
      },
    },
  };
}

/**
 * A document built for an unsplit sheet, with the atoms' link after the sheet's.
 * Vite has written the document by the time the atoms exist, so the link goes
 * in here rather than through `transformIndexHtml`.
 */
function linkedAfter(html: string, sheet: string, atoms: string): string {
  const name = sheet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return html.replace(
    new RegExp(`<link\\b[^>]*\\shref="([^"]*)${name}"[^>]*>`),
    (tag, prefix: string) =>
      `${tag}\n    <link rel="stylesheet" crossorigin href="${prefix}${atoms}" ${ATOMS_ATTRIBUTE}>`,
  );
}

interface HotNode {
  type: string;
  exportKind?: string;
  start: number;
  end: number;
  kind?: string;
  id?: { type: string; name: string; start: number; end: number } | null;
  declaration?: HotNode | null;
  declarations?: HotNode[];
  init?: { type: string } | null;
  source?: unknown;
  specifiers?: { local: { name: string }; exportKind?: string }[];
  name?: string;
}

interface HotProgram {
  body: HotNode[];
}

/**
 * Hand each of a module's components out through `hot`, and let the module
 * take its own updates when components are all it exports.
 *
 * Each rebinding is written on the line its declaration ends on, a `const`
 * becomes a `let` of the same width, and the import goes last, so no position
 * the compiler's source map knows about moves.
 *
 * A module that also exports a store or a constant does NOT accept itself: the
 * modules that import that value would go on holding the old one while the
 * components here closed over the new. The update travels to its importers
 * instead, and stops at the first one that is components only.
 */
export function withHotComponents(
  code: string,
  components: ReadonlySet<string>,
  program: HotProgram,
  coreSource = "@barqjs/core",
): string {
  const edits: [start: number, end: number, text: string][] = [];
  let wrapped = 0;
  let exported = 0;
  let onlyComponents = true;
  const signatureOf = hotSignatures(code, components, program);
  const rebind = (name: string, at: number): void => {
    wrapped++;
    const signature = JSON.stringify(signatureOf(name));
    edits.push([
      at,
      at,
      ` if (import.meta.hot) ${name} = __barq_hot(import.meta.hot, ${JSON.stringify(name)}, ${name}, ${signature});`,
    ]);
  };

  for (const statement of program.body) {
    let declaration: HotNode | null | undefined = statement;
    let isExport = false;
    // A type is gone before the module runs: exporting one changes nothing
    // about what the module hands out.
    if (statement.exportKind === "type" || ERASED.has(statement.declaration?.type ?? "")) continue;
    if (statement.type === "ExportAllDeclaration") {
      exported++;
      onlyComponents = false;
      continue;
    }
    if (statement.type === "ExportNamedDeclaration") {
      isExport = true;
      declaration = statement.declaration;
      if (declaration === null || declaration === undefined) {
        for (const specifier of statement.specifiers ?? []) {
          if (specifier.exportKind === "type") continue;
          exported++;
          const local =
            (statement.source === null || statement.source === undefined) &&
            components.has(specifier.local.name);
          if (!local) onlyComponents = false;
        }
        continue;
      }
    } else if (statement.type === "ExportDefaultDeclaration") {
      isExport = true;
      declaration = statement.declaration;
      if (declaration?.type === "Identifier") {
        exported++;
        if (!components.has(declaration.name ?? "")) onlyComponents = false;
        continue;
      }
    }
    if (declaration === null || declaration === undefined) continue;

    if (declaration.type === "FunctionDeclaration" && declaration.id) {
      const name = declaration.id.name;
      if (isExport) exported++;
      if (components.has(name)) rebind(name, statement.end);
      else if (isExport) onlyComponents = false;
      continue;
    }
    if (declaration.type === "VariableDeclaration") {
      let any = false;
      for (const declarator of declaration.declarations ?? []) {
        if (isExport) exported++;
        const name = declarator.id?.type === "Identifier" ? declarator.id.name : undefined;
        if (name !== undefined && components.has(name)) {
          any = true;
          rebind(name, statement.end);
        } else if (isExport) {
          onlyComponents = false;
        }
      }
      if (any && declaration.kind === "const") {
        edits.push([declaration.start, declaration.start + 5, "let  "]);
      }
      continue;
    }
    if (isExport) {
      exported++;
      onlyComponents = false;
    }
  }
  if (wrapped === 0) return code;

  let out = code;
  for (const [start, end, text] of edits.toSorted((a, b) => b[0] - a[0] || b[1] - a[1])) {
    out = out.slice(0, start) + text + out.slice(end);
  }
  out += `\nimport { hot as __barq_hot } from ${JSON.stringify(`${coreSource}/hot`)};\n`;
  if (exported > 0 && onlyComponents) out += `if (import.meta.hot) import.meta.hot.accept();\n`;
  return out;
}

const ERASED = new Set(["TSTypeAliasDeclaration", "TSInterfaceDeclaration"]);

const FUNCTIONS = new Set(["ArrowFunctionExpression", "FunctionExpression"]);

/**
 * The module-level functions that are components: the ones the compiler
 * labelled, and any other that is named as one.
 *
 * The compiler labels a component by the template it owns, and a component
 * that only arranges others owns none: a page is usually exactly that. A
 * capital letter is the convention JSX itself reads a component by, so it is
 * the one used here for the rest.
 */
function componentsIn(program: HotProgram, labelled: ReadonlySet<string>): Set<string> {
  const found = new Set(labelled);
  const named = (name: string | undefined): void => {
    if (name !== undefined && /^[A-Z]/.test(name)) found.add(name);
  };
  for (const statement of program.body) {
    const declaration =
      statement.type === "ExportNamedDeclaration" || statement.type === "ExportDefaultDeclaration"
        ? statement.declaration
        : statement;
    if (declaration === null || declaration === undefined) continue;
    if (declaration.type === "FunctionDeclaration") named(declaration.id?.name);
    if (declaration.type !== "VariableDeclaration") continue;
    for (const declarator of declaration.declarations ?? []) {
      if (declarator.id?.type === "Identifier" && FUNCTIONS.has(declarator.init?.type ?? "")) {
        named(declarator.id.name);
      }
    }
  }
  return found;
}

/** The compiler's own module-level constants: templates, constant cells, hoisted handlers. */
const HOISTED = /^_\$*[a-z]+\$+\d+$/;

const IDENTIFIER = /[A-Za-z_$][\w$]*/g;

/**
 * What each component is made of, as a string that moves when it does.
 *
 * A component is its own text plus the compiler constants that text names, a
 * template above all. Anything else at module level that it names, a helper or
 * a signal, is state or code the next evaluation makes afresh, and a component
 * left pointing at the old one would no longer share it with its neighbours:
 * that component answers `null` and is replaced on every update.
 */
function hotSignatures(
  code: string,
  components: ReadonlySet<string>,
  program: HotProgram,
): (name: string) => string | null {
  const own = new Map<string, string>();
  const hoisted = new Map<string, string>();
  const local = new Set<string>();
  for (const statement of program.body) {
    const declaration =
      statement.type === "ExportNamedDeclaration" || statement.type === "ExportDefaultDeclaration"
        ? statement.declaration
        : statement;
    if (declaration === null || declaration === undefined) continue;
    const text = code.slice(statement.start, statement.end);
    if (declaration.type === "FunctionDeclaration" && declaration.id) {
      if (components.has(declaration.id.name)) own.set(declaration.id.name, text);
      else local.add(declaration.id.name);
      continue;
    }
    if (declaration.type === "ClassDeclaration" && declaration.id) {
      local.add(declaration.id.name);
      continue;
    }
    if (declaration.type !== "VariableDeclaration") continue;
    for (const declarator of declaration.declarations ?? []) {
      const name = declarator.id?.type === "Identifier" ? declarator.id.name : undefined;
      if (name === undefined) {
        // A destructuring pattern: every name inside it is module state.
        const pattern = declarator.id ?? declarator;
        for (const found of code.slice(pattern.start, pattern.end).match(IDENTIFIER) ?? []) {
          local.add(found);
        }
      } else if (components.has(name)) own.set(name, text);
      else if (HOISTED.test(name)) hoisted.set(name, text);
      else local.add(name);
    }
  }
  return (name) => {
    const text = own.get(name);
    if (text === undefined) return null;
    const named = new Set(text.match(IDENTIFIER) ?? []);
    for (const found of named) {
      if (found !== name && local.has(found)) return null;
    }
    const parts = [text];
    for (const [constant, source] of hoisted) {
      if (named.has(constant)) parts.push(source);
    }
    return hash(parts.join("\n"));
  };
}

function hash(text: string): string {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    value = Math.imul(value ^ text.charCodeAt(index), 0x01000193);
  }
  return (value >>> 0).toString(36);
}
