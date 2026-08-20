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
  /**
   * Module source for barq imports
   * @default "@barqjs/core"
   */
  moduleSource?: string;

  /**
   * Module source for the string backend's helpers. Its own package rather than
   * a subpath of {@link moduleSource}: the server runtime carries a serializer
   * and a streaming loop no client bundle may pull in.
   * @default "@barqjs/server"
   */
  serverSource?: string;

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
   * Compile intrinsic JSX trees to hoisted cloneable templates with
   * precomputed walks to dynamic holes (the optimizing pass)
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
   * Emit for CLAIM-BASED HYDRATION (`CODESIGN.md` §3.11, `SEMANTICS.md` H1–H4).
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
  moduleSource?: string;
  serverSource?: string;
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
}

interface NativeResult {
  code: string;
  map?: string;
  warnings?: string[];
  diagnostics?: BarqDiagnostic[];
  labels?: BarqTemplateLabel[];
}

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
  /**
   * File extensions to transform
   * @default ['.tsx', '.jsx']
   */
  include?: string[];

  /**
   * File patterns to exclude
   * @default [/node_modules/]
   */
  exclude?: (string | RegExp)[];

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

/**
 * Vite plugin for the Barq compiler.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { defineConfig } from 'vite'
 * import { barqVitePlugin } from '@barqjs/compiler/vite'
 *
 * export default defineConfig({
 *   plugins: [barqVitePlugin()],
 * })
 * ```
 */
export function barqVitePlugin(options: BarqVitePluginOptions = {}): Plugin {
  const {
    include = [".tsx", ".jsx"],
    exclude = [/node_modules/],
    overlay = "warning",
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

    configureServer(devServer) {
      server = devServer;
      // A page that connects after the transforms have already run would
      // otherwise see nothing until the next edit.
      devServer.hot.on("barq:diagnostics:ready", () => publish());
    },

    resolveId(id) {
      return id === CLIENT_ID ? RESOLVED_CLIENT_ID : null;
    },

    load(id) {
      return id === RESOLVED_CLIENT_ID ? panelClient() : null;
    },

    // Dev only, so no byte of the panel can reach a production bundle.
    transformIndexHtml() {
      if (!dev || overlay === false || !server) return;
      return [
        {
          tag: "script",
          attrs: { type: "module", src: `/@id/${RESOLVED_CLIENT_ID}` },
          injectTo: "body",
        },
      ];
    },

    // `ssr` is per-module, not per-plugin: Vite transforms the same file twice,
    // once for the client and once for the server, and only this argument says
    // which one is running.
    transform(
      code: string,
      id: string,
      transformOptions?: { ssr?: boolean },
    ): TransformResult | null {
      const shouldTransform = include.some((ext) => id.endsWith(ext));
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
          interp: (compilerOptions.interp ?? false) && !(transformOptions?.ssr ?? false),
          dev,
          filename: id,
          sourcemap: true,
          ssr: transformOptions?.ssr ?? false,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`[barq-compiler] Failed to transform ${id}: ${message}`, {
          cause: error,
        });
      }

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

      return {
        code: result.code,
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
 * and has one red border, with no warning payload type. vite-plugin-checker
 * reached the same conclusion and ships its own.
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
