/**
 * The plugin surface. Since M6 there is exactly one pipeline: the Babel plugin
 * is gone, `@barqjs/compiler-rs` is a hard dependency, and a checkout whose
 * native binary has not been built is an ERROR rather than a quieter build.
 */

import { describe, expect, test } from "bun:test";
import type { TransformResult } from "vite";

import {
  barqVitePlugin,
  DIAGNOSTICS_EVENT,
  loadNativeCompiler,
  resetNativeCompilerCache,
  type BarqDiagnostic,
  type BarqOptimisation,
} from "./vite.ts";

const SOURCE = `export const V = () => <div class="c">{n}</div>;\n`;

/** The shape only the compiler produces: a PURE annotation on the hoisted clone. */
function isCompiled(code: string | undefined): boolean {
  return code !== undefined && code.includes("__PURE__") && code.includes("_el$1");
}

interface PluginContext {
  warn(message: string, position?: number): void;
  error?(message: string, position?: number): never;
}

interface ConfigEnv {
  command: "build" | "serve";
  mode: string;
}

function run(
  plugin: ReturnType<typeof barqVitePlugin>,
  code: string,
  id: string,
  options?: { ssr?: boolean },
): {
  result: TransformResult | null;
  warnings: string[];
  positions: (number | undefined)[];
} {
  const warnings: string[] = [];
  const positions: (number | undefined)[] = [];
  const context: PluginContext = {
    warn(message, position) {
      warnings.push(message);
      positions.push(position);
    },
    error(message) {
      throw new Error(message);
    },
  };
  const transform = plugin.transform as unknown as (
    this: PluginContext,
    code: string,
    id: string,
    options?: { ssr?: boolean },
  ) => TransformResult | null;
  return { result: transform.call(context, code, id, options), warnings, positions };
}

/** Drive the `config` hook the way Vite does, so `dev` is derived. */
function configure(plugin: ReturnType<typeof barqVitePlugin>, env: ConfigEnv): void {
  const hook = plugin.config as unknown as (config: unknown, env: ConfigEnv) => void;
  hook.call(plugin, {}, env);
}

/** Break the module resolution the loader uses, without touching node_modules. */
function withoutTheNativePackage<T>(fn: () => T): T {
  resetNativeCompilerCache();
  const Module = require("node:module") as {
    _resolveFilename?: (...args: unknown[]) => string;
  };
  const resolve = Module._resolveFilename;
  if (resolve) {
    Module._resolveFilename = (...args: unknown[]) => {
      if (args[0] === "@barqjs/compiler-rs") throw new Error("Cannot find module");
      return resolve(...args);
    };
  }
  try {
    return fn();
  } finally {
    if (resolve) Module._resolveFilename = resolve;
    resetNativeCompilerCache();
  }
}

describe("barqVitePlugin", () => {
  test("only transforms the configured extensions", () => {
    const plugin = barqVitePlugin();
    expect(run(plugin, SOURCE, "/a/app.css").result).toBe(null);
    expect(run(plugin, SOURCE, "/a/app.ts").result).toBe(null);
    expect(run(plugin, SOURCE, "/node_modules/x/a.tsx").result).toBe(null);
  });

  test("a client module emits template clones, not createElement", () => {
    const plugin = barqVitePlugin();
    const { result, warnings } = run(plugin, SOURCE, "/a/app.tsx");
    expect(warnings).toEqual([]);
    expect(isCompiled(result?.code)).toBe(true);
    expect(result?.code).toContain("_$insert(");
    expect(result?.map).toBeTruthy();
  });

  test("an SSR module takes the string backend", () => {
    // `ssr` is per MODULE: Vite transforms the same file twice and only this
    // argument says which build is running. Since P8b the server build is the
    // compiler's too — one concatenation, and no `template()` clone.
    const plugin = barqVitePlugin();
    const { result, warnings } = run(plugin, SOURCE, "/a/app.tsx", { ssr: true });
    expect(result?.code).toContain("@barqjs/core/server");
    expect(result?.code).not.toContain("_$template(");
    expect(warnings).toEqual([]);

    // …and the client build of the SAME file still gets the DOM backend.
    const client = run(plugin, SOURCE, "/a/app.tsx");
    expect(isCompiled(client.result?.code)).toBe(true);
    expect(client.result?.code).toContain("_$template(");
  });

  test("a missing native binary fails the build instead of degrading it", () => {
    withoutTheNativePackage(() => {
      expect(loadNativeCompiler()).toBeUndefined();

      const plugin = barqVitePlugin();
      expect(() => run(plugin, SOURCE, "/a/app.tsx")).toThrow(/@barqjs\/compiler-rs/);
      // …and it names the command that fixes it, because the binary is a build
      // artifact and "not built yet" is a state a fresh checkout is in.
      expect(() => run(plugin, SOURCE, "/a/app.tsx")).toThrow(/compiler-rs build/);
    });
  });

  test("the loader is usable again once the package resolves", () => {
    resetNativeCompilerCache();
    expect(loadNativeCompiler()).toBeDefined();
  });

  /**
   * O3 is a dev-mode compile note, and before M6 it could not fire through this
   * plugin at all: `dev` reached the compiler only if the user passed
   * `barqVitePlugin({ dev: true })` by hand. Vite already knows which build this
   * is, so the plugin asks it.
   */
  describe("dev is derived from Vite rather than asked for", () => {
    // BARQ006 (DESIGN O7) used to be the probe here. M3 deleted it with the
    // getters it was about — under C3 every prop is a Cell and a copy of a Cell
    // is the same Cell, so `Dynamic` spreading its props reads nothing and
    // warning would be a lie about the emitted module. BARQ004 (DESIGN O3) is
    // the dev-gated note that survived, so the PROBE moved and the claim — dev
    // is derived from Vite's own command/mode — did not.
    const DEV_NOTE = `import { For, useStore } from "@barqjs/core";\n
      const [state] = useStore({ rows: [] });
      export const V = () => <ul><For each={state.rows}>{(row) => <li>{row.name}</li>}</For></ul>;\n`;

    test("a dev server run warns", () => {
      const plugin = barqVitePlugin();
      configure(plugin, { command: "serve", mode: "development" });
      const { warnings } = run(plugin, DEV_NOTE, "/a/app.tsx");
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings.join("\n")).toContain("DESIGN O3");
    });

    test("a production build does not", () => {
      const plugin = barqVitePlugin();
      configure(plugin, { command: "build", mode: "production" });
      expect(run(plugin, DEV_NOTE, "/a/app.tsx").warnings).toEqual([]);
    });

    test("an explicit dev option still wins over the derivation", () => {
      const plugin = barqVitePlugin({ dev: true });
      configure(plugin, { command: "build", mode: "production" });
      expect(run(plugin, DEV_NOTE, "/a/app.tsx").warnings.length).toBeGreaterThan(0);

      const off = barqVitePlugin({ dev: false });
      configure(off, { command: "serve", mode: "development" });
      expect(run(off, DEV_NOTE, "/a/app.tsx").warnings).toEqual([]);
    });
  });

  /**
   * M8a. `this.warn(warning)` with no second argument is why no code frame
   * existed anywhere, in any mode: Rollup produces `pos`/`loc`/`frame` only when
   * it is given a position.
   */
  describe("diagnostics reach both channels", () => {
    const COERCED =
      `import { signal } from "@barqjs/core";\n` +
      `const count = signal(0);\n` +
      "export const V = () => <p>{`total: ${count}`}</p>;\n";

    function dev(options: Parameters<typeof barqVitePlugin>[0] = {}) {
      const plugin = barqVitePlugin(options);
      configure(plugin, { command: "serve", mode: "development" });
      return plugin;
    }

    test("a warning carries the byte offset Rollup's position argument wants", () => {
      const { warnings, positions } = run(dev(), COERCED, "/a/app.tsx");
      expect(warnings.length).toBe(1);
      expect(warnings[0]).toContain("BARQ001");
      expect(positions[0]).toBe(COERCED.indexOf("${count}") + 2);
      // …and that offset really is the identifier in the ORIGINAL source.
      expect(COERCED.slice(positions[0]!, positions[0]! + 5)).toBe("count");
      // Rollup formats `(line:col)` from the position it was given, so the text
      // must NOT carry its own location: the string form of a diagnostic ends
      // up printed beside Rollup's, with two different columns for one
      // identifier (Rollup's is 0-based, ours is 1-based).
      expect(warnings[0]).not.toContain("/a/app.tsx");
      expect(warnings[0]).toMatch(/^BARQ001 warning: /);
    });

    test("a suppression comment silences it and the codes are per-rule", () => {
      const silenced = COERCED.replace(
        "export const V",
        "// barq-ignore-next-line BARQ001 (this panel wants the source text)\nexport const V",
      );
      expect(run(dev(), silenced, "/a/app.tsx").warnings).toEqual([]);

      const wrong = silenced.replace("BARQ001", "BARQ005");
      const { warnings } = run(dev(), wrong, "/a/app.tsx");
      expect(warnings.join("\n")).toContain("BARQ001");
      expect(warnings.join("\n")).toContain("BARQ008");
    });

    test("the severity map is one resolution, shared with the compiler", () => {
      expect(run(dev({ checks: { BARQ001: "suppress" } }), COERCED, "/a/app.tsx").warnings).toEqual(
        [],
      );
      const noted = run(dev({ checks: { BARQ001: "note" } }), COERCED, "/a/app.tsx");
      expect(noted.warnings[0]).toContain("note:");
    });

    test("an escalated code fails the build through this.error", () => {
      expect(() => run(dev({ checks: { BARQ001: "error" } }), COERCED, "/a/app.tsx")).toThrow(
        /BARQ001/,
      );
      // …and nothing escalates by default, which is the whole point.
      expect(() => run(dev(), COERCED, "/a/app.tsx")).not.toThrow();
    });

    test("the rules can be run on a production build for CI", () => {
      const plugin = barqVitePlugin({ diagnostics: true });
      configure(plugin, { command: "build", mode: "production" });
      expect(run(plugin, COERCED, "/a/app.tsx").warnings.length).toBe(1);
    });

    test("the panel client is a virtual module and never a production import", () => {
      const plugin = dev();
      const resolve = plugin.resolveId as unknown as (id: string) => string | null;
      const load = plugin.load as unknown as (id: string) => string | null;
      const resolved = resolve.call(plugin, "virtual:barq-diagnostics");
      expect(resolved).toBe("\0virtual:barq-diagnostics");
      const source = load.call(plugin, resolved!);
      expect(source).toContain(DIAGNOSTICS_EVENT);
      expect(source).toContain("import.meta.hot");
      expect(load.call(plugin, "/a/app.tsx")).toBe(null);

      // `publish()` runs on every transform, so an unconditional auto-open makes
      // the collapse toggle un-clickable: the next payload re-opens the panel.
      // `open = open || true` is `true` for every value of `open`.
      expect(source).not.toContain("open = open ||");
      expect(source).toContain("digest !== seen");

      // The injection is gated on dev, so no byte of the panel can reach a
      // production bundle even if someone imports the plugin there.
      const production = barqVitePlugin();
      configure(production, { command: "build", mode: "production" });
      const inject = production.transformIndexHtml as unknown as () => unknown;
      expect(inject.call(production)).toBeUndefined();
    });

    /**
     * The second channel, and the reason it exists: a terminal warning fires
     * once per transform and is gone after a reload, and `logLevel: 'error'`
     * silences plugin warnings entirely in both modes. This payload owes Vite's
     * logger nothing.
     */
    test("the panel is fed over a custom HMR event, independent of the logger", () => {
      const sent: { event?: string; data?: unknown }[] = [];
      const plugin = dev();
      const configureServer = plugin.configureServer as unknown as (server: unknown) => void;
      configureServer.call(plugin, {
        hot: {
          send: (payload: { event?: string; data?: unknown }) => sent.push(payload),
          on: () => {},
        },
      });

      run(plugin, COERCED, "/a/app.tsx");
      const last = sent.at(-1) as {
        event: string;
        data: { diagnostics: BarqDiagnostic[]; labels: Record<string, unknown[]> };
      };
      expect(last.event).toBe(DIAGNOSTICS_EVENT);
      expect(last.data.diagnostics).toHaveLength(1);
      expect(last.data.diagnostics[0]!.code).toBe("BARQ001");
      expect(last.data.diagnostics[0]!.file).toBe("/a/app.tsx");
      // Dev-mode labels ride the same payload.
      expect(Object.keys(last.data.labels)).toEqual(["/a/app.tsx"]);

      // A file that stops reporting clears its own rows rather than accreting.
      run(plugin, `export const V = () => <p>ok</p>;\n`, "/a/app.tsx");
      const cleared = sent.at(-1) as { data: { diagnostics: unknown[] } };
      expect(cleared.data.diagnostics).toEqual([]);
    });

    test("the structured diagnostic survives the napi boundary intact", () => {
      const compiler = loadNativeCompiler()!;
      const result = compiler.transform(COERCED, {
        filename: "/a/app.tsx",
        dev: true,
      }) as unknown as { diagnostics: BarqDiagnostic[]; labels: unknown[] };
      expect(result.diagnostics).toHaveLength(1);
      const diagnostic = result.diagnostics[0]!;
      expect(diagnostic.code).toBe("BARQ001");
      expect(diagnostic.severity).toBe("warning");
      expect(diagnostic.line).toBe(3);
      // A URL, not a package-relative path: the panel prints this verbatim and
      // a relative path resolves from nowhere in a browser.
      expect(diagnostic.docs).toStartWith("https://");
      expect(diagnostic.docs).toEndWith("/docs/BARQ001.md");
      expect(diagnostic.end).toBeGreaterThan(diagnostic.pos);
    });
  });

  /**
   * The optimisation axis has to reach a decision the compiler makes, or it is
   * exactly the kind of option this surface deleted `autoComputed` for. `-O0`
   * is the differential oracle's reference build, so a plugin that quietly
   * dropped the flag would hand the oracle two identical builds and report
   * green forever.
   */
  describe("the optimisation level reaches the compiler", () => {
    const FUSED =
      `import { signal } from "@barqjs/core";\n` +
      `const n = signal(0);\n` +
      `export const V = () => <b id={n()} title={n()}>x</b>;\n`;

    function build(options: Parameters<typeof barqVitePlugin>[0] = {}) {
      const plugin = barqVitePlugin(options);
      configure(plugin, { command: "build", mode: "production" });
      return run(plugin, FUSED, "/a/app.tsx").result?.code ?? "";
    }

    test("the default is the optimising path", () => {
      expect(build()).toContain("bindEffect");
      expect(build({ optimize: 1 })).toBe(build());
    });

    test("optimize 0 turns every optimisation off", () => {
      // `fuse` off means one effect per live prop, not none: CODESIGN §3.5
      // removed the `setProp` dispatcher a thunk used to be handed to, so the
      // effect around a proven-live write belongs to the compiler at every
      // level. What the level still decides is whether two props SHARE one.
      const reference = build({ optimize: 0 });
      expect(reference.match(/_\$bindEffect\(/g)).toHaveLength(2);
      expect(build().match(/_\$bindEffect\(/g)).toHaveLength(1);
      // Each is a fused record of ONE, so its previous value is a scalar and
      // the compute returns it directly. The optimised build merges the two
      // into one record with positional fields.
      expect(reference).toContain(`if (_v$ !== _p$) _$setAttr(_el$1, "id", _v$);`);
      expect(reference).toContain(`if (_v$ !== _p$) _$setAttr(_el$1, "title", _v$);`);
      expect(build()).toContain(`if (_v$.a !== _p$.a) _$setAttr(_el$1, "id", _v$.a);`);
      expect(build()).toContain(`if (_v$.b !== _p$.b) _$setAttr(_el$1, "title", _v$.b);`);
    });

    test("one pass can be flipped against an otherwise optimised build", () => {
      // The whole point of the axis: a differential failure bisects to one
      // pass. `fuse` off alone must move the output, and every other knob must
      // stay exactly where the level put it — reached here from both sides.
      const everythingElse: BarqOptimisation[] = [
        "fold",
        "dedup",
        "anchor",
        "walk",
        "eta",
        "hoist",
        "splice",
        "flow",
      ];
      const fromBelow = Object.fromEntries(everythingElse.map((name) => [name, true]));
      expect(build({ passes: { fuse: false } })).toBe(build({ optimize: 0, passes: fromBelow }));
      expect(build({ passes: { fuse: false } })).not.toBe(build());
    });

    test("a pass name this build does not have is reported, not ignored", () => {
      const plugin = barqVitePlugin({ passes: { tempaltes: false } as never });
      configure(plugin, { command: "build", mode: "production" });
      const { warnings } = run(plugin, FUSED, "/a/app.tsx");
      expect(warnings.join("\n")).toContain("tempaltes");
    });
  });

  describe("the reference backend reaches the compiler", () => {
    const SOURCE =
      `import { signal } from "@barqjs/core";\n` +
      `const n = signal(0);\n` +
      `export const V = () => <b id={n()}>x</b>;\n`;

    function build(
      options: Parameters<typeof barqVitePlugin>[0],
      transformOptions?: { ssr?: boolean },
    ) {
      const plugin = barqVitePlugin(options);
      configure(plugin, { command: "build", mode: "production" });
      return run(plugin, SOURCE, "/a/app.tsx", transformOptions).result?.code ?? "";
    }

    test("interp serialises the IR instead of emitting the walk", () => {
      const code = build({ interp: true });
      expect(code).toContain('from "@barqjs/core/interp"');
      expect(code).toContain("_$interp(");
      expect(build({})).not.toContain("/interp");
    });

    // It is a DOM backend, so it has nothing to say about the server pass and
    // asking for it must not silently produce a module `renderToString` cannot
    // serialise.
    test("the server pass still goes through the string backend", () => {
      const code = build({ interp: true }, { ssr: true });
      expect(code).not.toContain("/interp");
    });
  });
});
