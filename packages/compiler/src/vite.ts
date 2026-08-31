import { createRequire } from "node:module";
import type { Plugin, TransformResult, ViteDevServer } from "vite";

const NATIVE_PACKAGE = "@barqjs/compiler-rs";

/** Custom HMR event the in-page panel listens on. */
export const DIAGNOSTICS_EVENT = "barq:diagnostics";
const CLIENT_ID = "virtual:barq-diagnostics";
const RESOLVED_CLIENT_ID = "\0virtual:barq-diagnostics";

export type BarqDiagnosticLevel = "note" | "warning" | "error";

/**
 * One diagnostic, structured. `pos` is the byte offset into the ORIGINAL module
 * source, and it is the only reason a code frame can exist: Rollup produces
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
export interface BarqCompilerOptions {
  /** @default "@barqjs/core" */
  moduleSource?: string;

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
   * (BARQ004, BARQ006, BARQ007) plus the dev-mode template labels. Derived from
   * Vite's own mode when left unset.
   */
  dev?: boolean;

  /**
   * Run the source-level rules (BARQ001-BARQ003, BARQ005). Defaults to `dev`.
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
   * is serialised beside the module and `@barqjs/core/interp` walks it. It is
   * the SAME analysed IR codegen consumes — same anchors, same template bytes,
   * same ref plan, same patch program — which is what makes it usable as an
   * oracle rather than a second implementation.
   *
   * DEV and test only. It pulls in `@barqjs/core/interp`, and it is slower and
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
  routes?: readonly string[];
  moduleSource?: string;
  serverSource?: string;
  startSource?: string;
  clientSource?: string;
  serverFns?: boolean;
  env?: string;
  root?: string;
  dev?: boolean;
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
 * A module's compiled CSS, appended to the module itself.
 *
 * The `"inline"` half of {@link BarqVitePluginOptions.cssMode}, exported
 * because the Vite plugin is not the only loader a barq module goes through:
 * `bun test` runs the same native transform with no bundler behind it, and it
 * dropped `result.css` on the floor until this was shared rather than inlined
 * in one caller.
 *
 * Keyed by module id, so re-evaluating the module replaces its rules.
 */
export function cssRegistration(id: string, css: string, cssSource = DEFAULT_CSS_SOURCE): string {
  return (
    `\nimport { registerCss as _$registerCss } from ${JSON.stringify(cssSource)};\n` +
    `_$registerCss(${JSON.stringify(id)}, ${JSON.stringify(css)});\n`
  );
}

/** The specifier the compiler resolves `css`/`keyframes`/`globalCss` against. */
export const DEFAULT_CSS_SOURCE = "@barqjs/css";

interface NativeCompiler {
  transform(code: string, options?: NativeTransformOptions): NativeResult;
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
   * The in-page diagnostics panel, in dev. Deliberately not Vite's own overlay:
   * `ErrorOverlay` takes `ErrorPayload['err']`, has one red border and no
   * warning payload type at all. `"warning"` opens the panel on the first
   * warning or error, `true` opens it on anything including notes, `"error"`
   * only on an error, `false` turns it off.
   * @default "warning"
   */
  overlay?: boolean | "warning" | "error";
}

function checkPairs(checks: BarqCompilerOptions["checks"]): string[][] | undefined {
  if (!checks) return undefined;
  return Object.entries(checks).map(([code, category]) => [code, category]);
}

/** napi has no map type, so the per-pass overrides travel as pairs. */
function passPairs(passes: BarqCompilerOptions["passes"]): string[][] | undefined {
  if (!passes) return undefined;
  return Object.entries(passes).map(([name, on]) => [name, on ? "on" : "off"]);
}

export function barqVitePlugin(options: BarqVitePluginOptions = {}): Plugin {
  const {
    include = [".tsx", ".jsx"],
    exclude = [/node_modules/],
    overlay = "warning",
    cssMode,
    ...compilerOptions
  } = options;

  // The compiler's dev-mode diagnostics are advice about runtime behaviour, so
  // they belong on a dev build and nowhere else. Deriving it from Vite means the
  // user never has to ask for it twice — and left to the user it never fired at
  // all, because nothing else in the chain sets it.
  let dev = compilerOptions.dev;
  let server: ViteDevServer | undefined;

  // Per module, so a file that stops reporting clears its own rows. A terminal
  // warning fires once per transform and is gone after a reload; this is the
  // channel that survives one.
  const byModule = new Map<string, BarqDiagnostic[]>();
  const labelsByModule = new Map<string, BarqTemplateLabel[]>();
  const cssByModule = new Map<string, string>();

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

    config(_config, env) {
      if (dev === undefined) dev = env.command === "serve" || env.mode !== "production";
    },

    // A server-function id is derived relative to the project root, so an id
    // carries no absolute path into a client bundle. Vite knows the root; a
    // caller that passes one explicitly means something else by it and wins.
    configResolved(config: { root?: string }) {
      if (compilerOptions.root === undefined) compilerOptions.root = config.root;
    },

    configureServer(devServer) {
      server = devServer;
      // A page that connects after the transforms have already run would
      // otherwise see nothing until the next edit.
      devServer.hot.on("barq:diagnostics:ready", () => publish());
    },

    resolveId(id) {
      if (id === CLIENT_ID) return RESOLVED_CLIENT_ID;
      // Claimed verbatim rather than resolved: the id already IS a real path,
      // and letting Vite resolve it again drops the query the stylesheet is
      // keyed by.
      return id.includes(CSS_QUERY) ? id : null;
    },

    load(id) {
      if (id === RESOLVED_CLIENT_ID) return panelClient();
      if (!id.includes(CSS_QUERY)) return null;
      return cssByModule.get(id) ?? "";
    },

    // Dev only, so no byte of the panel can reach a production bundle.
    transformIndexHtml() {
      if (!dev || overlay === false || !server) return;
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
    transform(
      this: {
        environment?: { name?: string };
        error(message: string, position?: number): never;
        warn(message: string, position?: number): void;
      },
      code: string,
      id: string,
      transformOptions?: { ssr?: boolean },
    ): TransformResult | null {
      const environment = this?.environment;
      // `client` is Vite's name for the browser environment and `ssr` for the
      // server one; anything else a user configures is a server environment
      // unless it says otherwise, which is the safe direction — a module
      // wrongly treated as client-side loses its handler bodies and fails
      // loudly, where the reverse ships them.
      const forClient =
        environment?.name !== undefined
          ? environment.name === "client"
          : (transformOptions?.ssr ?? false) === false;
      // The QUERY comes off first. A module id can carry one — `barqRouter`
      // serves a route's split half at `<file>?barq-split` — and matching the
      // extension against the raw id skipped exactly those, so the split half
      // of every route reached the bundler with its JSX untransformed.
      // Our OWN stylesheet, coming back round: `…/Demo.tsx.barq.css` still
      // contains `.tsx`, and a `path.endsWith` list is not what tells them
      // apart.
      if (id.includes(CSS_QUERY)) return null;

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
      const shouldTransform = include.some((ext) => path.endsWith(ext)) || code.includes(cssSource);
      if (!shouldTransform) return null;

      const isExcluded = exclude.some((pattern) => {
        if (typeof pattern === "string") {
          return id.includes(pattern);
        }
        return pattern.test(id);
      });
      if (isExcluded) return null;

      const compiler = loadNativeCompiler();
      if (!compiler) {
        throw new Error(
          `[barq-compiler] ${NATIVE_PACKAGE} could not be loaded: ${nativeLoadError}. ` +
            `Its native binary is a build artifact — run ` +
            `\`bun install && bun run --cwd packages/compiler-rs build\`.`,
        );
      }

      // A native transform can fail on a parse diagnostic, and anything the
      // Rust side raises arrives here as a bare message with no file in it.
      let result: NativeResult;
      try {
        result = compiler.transform(code, {
          moduleSource: compilerOptions.moduleSource,
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
          filename: id,
          sourcemap: true,
          ssr: !forClient,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`[barq-compiler] Failed to transform ${id}: ${message}`, {
          cause: error,
        });
      }

      if (result.serverFns != null) compilerOptions.onServerFns?.(id, result.serverFns);

      const diagnostics = result.diagnostics ?? [];
      for (const diagnostic of diagnostics) {
        // THE second argument is the whole point: Rollup only produces
        // `pos`/`loc`/`frame` when it is given a position, and passing none is
        // why this pipeline had no code frame anywhere, in any mode. The text is
        // the message alone — `result.warnings[i]` carries its own
        // `file:line:col:` prefix, and Rollup prints the location it was given,
        // so passing that form printed one identifier at two columns.
        const text = `${diagnostic.code} ${diagnostic.severity}: ${diagnostic.message}`;
        if (diagnostic.severity === "error") {
          this.error(text, diagnostic.pos);
        } else {
          this.warn(text, diagnostic.pos);
        }
      }

      // Only the client pass, or a file compiled twice reports twice.
      if (!transformOptions?.ssr) {
        if (diagnostics.length > 0) byModule.set(id, diagnostics);
        else byModule.delete(id);
        if (result.labels?.length) labelsByModule.set(id, result.labels);
        else labelsByModule.delete(id);
        publish();
      }

      // Appended rather than prepended: an `import` is hoisted wherever it
      // stands, and adding a line at the top would shift every mapping in the
      // source map the compiler just produced.
      const mode = cssMode ?? (dev === true ? "inline" : "asset");
      let emitted = result.code;
      if (result.css != null && result.css !== "") {
        if (mode === "inline") {
          emitted += cssRegistration(stylesheet, result.css, cssSource);
        } else {
          const changed = cssByModule.get(stylesheet) !== result.css;
          cssByModule.set(stylesheet, result.css);
          emitted += `\nimport ${JSON.stringify(stylesheet)};\n`;
          // The stylesheet's id does not change when its content does, so Vite
          // would serve the module it already has.
          if (changed && server !== undefined) {
            const module = server.moduleGraph.getModuleById(stylesheet);
            if (module) server.moduleGraph.invalidateModule(module);
          }
        }
      } else if (cssByModule.delete(stylesheet) && server !== undefined) {
        const module = server.moduleGraph.getModuleById(stylesheet);
        if (module) server.moduleGraph.invalidateModule(module);
      }

      return {
        code: emitted,
        map: result.map ? (JSON.parse(result.map) as TransformResult["map"]) : null,
      };
    },
  };
}

/**
 * The second channel. A terminal warning fires exactly once per transform and is
 * gone after a reload — three successive page loads produce one occurrence — and
 * `logLevel: 'error'` silences plugin warnings entirely, in both modes. So the
 * panel is fed by a custom HMR event and owes Vite's logger nothing.
 *
 * Deliberately not Vite's own overlay: `ErrorOverlay` takes `ErrorPayload['err']`
 * and has one red border, with no warning payload type at all.
 */
function panelClient(): string {
  return `
const RANK = { note: 0, warning: 1, error: 2 }
const COLOR = { note: "#6b7cff", warning: "#e0a336", error: "#e05561" }
let open = false
let seen = ""
let state = { diagnostics: [], labels: {}, overlay: "warning" }

const host = document.createElement("div")
host.id = "barq-diagnostics"
const root = host.attachShadow({ mode: "open" })
const style = document.createElement("style")
style.textContent = \`
:host { all: initial }
.bar { position: fixed; bottom: 0; left: 0; right: 0; z-index: 2147483646;
  font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
  background: #16181d; color: #d7dae0; border-top: 1px solid #2b2f38 }
.bar button { all: unset; cursor: pointer; padding: 6px 10px; display: block; width: 100% ;
  box-sizing: border-box; text-align: left }
.list { max-height: 45vh; overflow: auto; border-top: 1px solid #2b2f38 }
.row { padding: 8px 10px; border-bottom: 1px solid #21242b; display: grid; gap: 2px }
.row a { color: inherit }
.code { font-weight: 700 }
.where { opacity: .65 }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px }
\`
root.append(style)
const bar = document.createElement("div")
bar.className = "bar"
root.append(bar)

function render() {
  const items = state.diagnostics
  if (items.length === 0) { host.remove(); return }
  if (!host.isConnected) document.body.append(host)
  const counts = { note: 0, warning: 0, error: 0 }
  for (const item of items) counts[item.severity]++
  const worst = items.reduce((a, b) => (RANK[b.severity] > RANK[a.severity] ? b : a))
  bar.textContent = ""
  const toggle = document.createElement("button")
  const dot = document.createElement("span")
  dot.className = "dot"
  dot.style.background = COLOR[worst.severity]
  toggle.append(dot, document.createTextNode(
    "barq — " + counts.error + " error, " + counts.warning + " warning, " +
    counts.note + " note" + (open ? "  ▾" : "  ▸")))
  toggle.onclick = () => { open = !open; render() }
  bar.append(toggle)
  if (!open) return
  const list = document.createElement("div")
  list.className = "list"
  for (const item of items) {
    const row = document.createElement("div")
    row.className = "row"
    const head = document.createElement("div")
    const badge = document.createElement("span")
    badge.className = "code"
    badge.style.color = COLOR[item.severity]
    badge.textContent = (item.code ? item.code + " " : "") + item.severity
    head.append(badge)
    const where = document.createElement("span")
    where.className = "where"
    where.textContent = "  " + item.file + ":" + item.line + ":" + item.column
    head.append(where)
    row.append(head, document.createTextNode(item.message))
    if (item.docs) {
      const docs = document.createElement("div")
      docs.className = "where"
      docs.textContent = item.docs
      row.append(docs)
    }
    list.append(row)
  }
  bar.append(list)
}

if (import.meta.hot) {
  import.meta.hot.on("${DIAGNOSTICS_EVENT}", (data) => {
    state = data
    const threshold = data.overlay === true ? 0 : data.overlay === "error" ? 2 : 1
    // Auto-open on a CHANGED payload only. \`publish()\` runs on every transform,
    // so re-opening on every payload made the collapse toggle un-clickable for
    // as long as the diagnostics stood.
    const digest = data.diagnostics
      .map((item) => item.file + ":" + item.line + ":" + item.column + ":" + item.code)
      .join("|")
    if (digest !== seen) {
      seen = digest
      if (data.diagnostics.some((item) => RANK[item.severity] >= threshold)) open = true
    }
    render()
  })
  import.meta.hot.send("barq:diagnostics:ready")
}
`;
}

export default barqVitePlugin;
