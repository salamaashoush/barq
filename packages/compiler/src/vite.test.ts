/**
 * The plugin surface. There is exactly one pipeline: `@barqjs/compiler-rs` is a
 * hard dependency, and a checkout whose native binary has not been built is an
 * ERROR rather than a quieter build.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

async function run(
  plugin: ReturnType<typeof barqVitePlugin>,
  code: string,
  id: string,
  options?: { ssr?: boolean },
): Promise<{
  result: TransformResult | null;
  warnings: string[];
  positions: (number | undefined)[];
}> {
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
  ) => Promise<TransformResult | null> | TransformResult | null;
  return { result: await transform.call(context, code, id, options), warnings, positions };
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
  test("only transforms the configured extensions", async () => {
    const plugin = barqVitePlugin();
    expect((await run(plugin, SOURCE, "/a/app.css")).result).toBe(null);
    expect((await run(plugin, SOURCE, "/a/app.ts")).result).toBe(null);
    expect((await run(plugin, SOURCE, "/node_modules/x/a.tsx")).result).toBe(null);
  });

  test("a client module emits template clones, not createElement", async () => {
    const plugin = barqVitePlugin();
    const { result, warnings } = await run(plugin, SOURCE, "/a/app.tsx");
    expect(warnings).toEqual([]);
    expect(isCompiled(result?.code)).toBe(true);
    expect(result?.code).toContain("_$insert(");
    expect(result?.map).toBeTruthy();
  });

  test("an SSR module takes the string backend", async () => {
    // `ssr` is per MODULE: Vite transforms the same file twice and only this
    // argument says which build is running.
    const plugin = barqVitePlugin();
    const { result, warnings } = await run(plugin, SOURCE, "/a/app.tsx", { ssr: true });
    expect(result?.code).toContain("@barqjs/server");
    expect(result?.code).not.toContain("_$template(");
    expect(warnings).toEqual([]);

    // …and the client build of the SAME file still gets the DOM backend.
    const client = await run(plugin, SOURCE, "/a/app.tsx");
    expect(isCompiled(client.result?.code)).toBe(true);
    expect(client.result?.code).toContain("_$template(");
  });

  test("a missing native binary fails the build instead of degrading it", async () => {
    await withoutTheNativePackage(async () => {
      expect(loadNativeCompiler()).toBeUndefined();

      const plugin = barqVitePlugin();
      expect(run(plugin, SOURCE, "/a/app.tsx")).rejects.toThrow(/@barqjs\/compiler-rs/);
      // …and it names the command that fixes it, because the binary is a build
      // artifact and "not built yet" is a state a fresh checkout is in.
      expect(run(plugin, SOURCE, "/a/app.tsx")).rejects.toThrow(/compiler-rs build/);
    });
  });

  test("the loader is usable again once the package resolves", async () => {
    resetNativeCompilerCache();
    expect(loadNativeCompiler()).toBeDefined();
  });

  /**
   * A dev-mode compile note fires only when `dev` reaches the compiler. Vite
   * already knows which build this is, so the plugin asks it rather than making
   * the user pass `barqVitePlugin({ dev: true })` by hand.
   */
  describe("dev is derived from Vite rather than asked for", () => {
    // BARQ004 is the probe because it is the dev-gated note: what is under
    // test is that `dev` is derived from Vite's own command and mode.
    const DEV_NOTE = `import { For, store } from "@barqjs/core";\n
      const [state] = store({ rows: [] });
      export const V = () => <ul><For each={state.rows}>{(row) => <li>{row.name}</li>}</For></ul>;\n`;

    test("a dev server run warns", async () => {
      const plugin = barqVitePlugin();
      configure(plugin, { command: "serve", mode: "development" });
      const { warnings } = await run(plugin, DEV_NOTE, "/a/app.tsx");
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings.join("\n")).toContain("DESIGN O3");
    });

    test("a production build does not", async () => {
      const plugin = barqVitePlugin();
      configure(plugin, { command: "build", mode: "production" });
      expect((await run(plugin, DEV_NOTE, "/a/app.tsx")).warnings).toEqual([]);
    });

    test("an explicit dev option still wins over the derivation", async () => {
      const plugin = barqVitePlugin({ dev: true });
      configure(plugin, { command: "build", mode: "production" });
      expect((await run(plugin, DEV_NOTE, "/a/app.tsx")).warnings.length).toBeGreaterThan(0);

      const off = barqVitePlugin({ dev: false });
      configure(off, { command: "serve", mode: "development" });
      expect((await run(off, DEV_NOTE, "/a/app.tsx")).warnings).toEqual([]);
    });
  });

  /**
   * `this.warn(warning)` with no second argument produces no code frame in any
   * mode: Rollup fills `pos`/`loc`/`frame` only when it is given a position.
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

    test("a warning carries the byte offset Rollup's position argument wants", async () => {
      const { warnings, positions } = await run(dev(), COERCED, "/a/app.tsx");
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

    test("a suppression comment silences it and the codes are per-rule", async () => {
      const silenced = COERCED.replace(
        "export const V",
        "// barq-ignore-next-line BARQ001 (this panel wants the source text)\nexport const V",
      );
      expect((await run(dev(), silenced, "/a/app.tsx")).warnings).toEqual([]);

      const wrong = silenced.replace("BARQ001", "BARQ005");
      const { warnings } = await run(dev(), wrong, "/a/app.tsx");
      expect(warnings.join("\n")).toContain("BARQ001");
      expect(warnings.join("\n")).toContain("BARQ008");
    });

    test("the severity map is one resolution, shared with the compiler", async () => {
      expect(
        (await run(dev({ checks: { BARQ001: "suppress" } }), COERCED, "/a/app.tsx")).warnings,
      ).toEqual([]);
      const noted = await run(dev({ checks: { BARQ001: "note" } }), COERCED, "/a/app.tsx");
      expect(noted.warnings[0]).toContain("note:");
    });

    test("an escalated code fails the build through this.error", async () => {
      expect(run(dev({ checks: { BARQ001: "error" } }), COERCED, "/a/app.tsx")).rejects.toThrow(
        /BARQ001/,
      );
      // …and nothing escalates by default, which is the whole point.
      expect((await run(dev(), COERCED, "/a/app.tsx")).result).not.toBeNull();
    });

    test("the rules can be run on a production build for CI", async () => {
      const plugin = barqVitePlugin({ diagnostics: true });
      configure(plugin, { command: "build", mode: "production" });
      expect((await run(plugin, COERCED, "/a/app.tsx")).warnings.length).toBe(1);
    });

    test("the panel client is a virtual module and never a production import", async () => {
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
    test("the panel is fed over a custom HMR event, independent of the logger", async () => {
      const sent: { event?: string; data?: unknown }[] = [];
      const plugin = dev();
      const configureServer = plugin.configureServer as unknown as (server: unknown) => void;
      configureServer.call(plugin, {
        hot: {
          send: (payload: { event?: string; data?: unknown }) => sent.push(payload),
          on: () => {},
        },
      });

      await run(plugin, COERCED, "/a/app.tsx");
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
      await run(plugin, `export const V = () => <p>ok</p>;\n`, "/a/app.tsx");
      const cleared = sent.at(-1) as { data: { diagnostics: unknown[] } };
      expect(cleared.data.diagnostics).toEqual([]);
    });

    test("the structured diagnostic survives the napi boundary intact", async () => {
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

    async function build(options: Parameters<typeof barqVitePlugin>[0] = {}) {
      const plugin = barqVitePlugin(options);
      configure(plugin, { command: "build", mode: "production" });
      return (await run(plugin, FUSED, "/a/app.tsx")).result?.code ?? "";
    }

    test("the default is the optimising path", async () => {
      expect(await build()).toContain("bindEffect");
      expect(await build({ optimize: 1 })).toBe(await build());
    });

    test("optimize 0 turns every optimisation off", async () => {
      // `fuse` off means one effect per live prop, not none: there is no
      // runtime `setProp` dispatcher to hand a thunk to, so the effect around a
      // proven-live write belongs to the compiler at every level. What the
      // level decides is whether two props SHARE one.
      const reference = await build({ optimize: 0 });
      expect(reference.match(/_\$bindEffect\(/g)).toHaveLength(2);
      expect((await build()).match(/_\$bindEffect\(/g)).toHaveLength(1);
      // Each is a fused record of ONE, so its previous value is a scalar and
      // the compute returns it directly. The optimised build merges the two
      // into one record with positional fields.
      expect(reference).toContain(`if (_v$ !== _p$) _$setAttr(_el$1, "id", _v$);`);
      expect(reference).toContain(`if (_v$ !== _p$) _$setAttr(_el$1, "title", _v$);`);
      expect(await build()).toContain(`if (_v$.a !== _p$.a) _$setAttr(_el$1, "id", _v$.a);`);
      expect(await build()).toContain(`if (_v$.b !== _p$.b) _$setAttr(_el$1, "title", _v$.b);`);
    });

    test("one pass can be flipped against an otherwise optimised build", async () => {
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
      expect(await build({ passes: { fuse: false } })).toBe(
        await build({ optimize: 0, passes: fromBelow }),
      );
      expect(await build({ passes: { fuse: false } })).not.toBe(await build());
    });

    test("a pass name this build does not have is reported, not ignored", async () => {
      const plugin = barqVitePlugin({ passes: { tempaltes: false } as never });
      configure(plugin, { command: "build", mode: "production" });
      const { warnings } = await run(plugin, FUSED, "/a/app.tsx");
      expect(warnings.join("\n")).toContain("tempaltes");
    });
  });

  describe("the reference backend reaches the compiler", () => {
    const SOURCE =
      `import { signal } from "@barqjs/core";\n` +
      `const n = signal(0);\n` +
      `export const V = () => <b id={n()}>x</b>;\n`;

    async function build(
      options: Parameters<typeof barqVitePlugin>[0],
      transformOptions?: { ssr?: boolean },
    ) {
      const plugin = barqVitePlugin(options);
      configure(plugin, { command: "build", mode: "production" });
      return (await run(plugin, SOURCE, "/a/app.tsx", transformOptions)).result?.code ?? "";
    }

    test("interp serialises the IR instead of emitting the walk", async () => {
      const code = await build({ interp: true });
      expect(code).toContain('from "@barqjs/core/interp"');
      expect(code).toContain("_$interp(");
      expect(await build({})).not.toContain("/interp");
    });

    // It is a DOM backend, so it has nothing to say about the server pass and
    // asking for it must not silently produce a module `renderToString` cannot
    // serialise.
    test("the server pass still goes through the string backend", async () => {
      const code = await build({ interp: true }, { ssr: true });
      expect(code).not.toContain("/interp");
    });
  });
});

/**
 * The stylesheet is a query on the module's own id, which is the shape
 * `barqRouter` uses for a route's split half and `@vitejs/plugin-vue` uses for
 * a SFC's `<style>`. `lang.css` is what makes Vite's own CSS pipeline claim it.
 */
/**
 * The shape most projects have: the tokens are in one file and the components
 * import them. Without resolution every one of those calls is opaque and
 * `@barqjs/css` evaluates it in the browser.
 */
describe("a value imported from another file", () => {
  const DIR = join(tmpdir(), `barq-xfile-${process.pid}`);

  beforeAll(() => {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(join(DIR, "tokens.ts"), `export const BRAND = "var(--brand)";\n`);
    writeFileSync(
      join(DIR, "shared.ts"),
      `import { createIn, layer } from "@barqjs/css";
export const ui = layer("app");
export const shared = createIn("app", { ring: { outlineWidth: "3px" } });
`,
    );
  });
  afterAll(() => rmSync(DIR, { recursive: true, force: true }));

  /** The plugin context the resolver needs, over a real directory. */
  function withResolver(): PluginContext & {
    resolve(source: string): Promise<{ id: string; external: boolean } | null>;
    addWatchFile(file: string): void;
    watched: string[];
  } {
    const watched: string[] = [];
    return {
      warn() {},
      error(message: string): never {
        throw new Error(message);
      },
      resolve: async (source: string) =>
        source.startsWith(".")
          ? { id: join(DIR, source.replace(/^\.\//, "")), external: false }
          : null,
      addWatchFile: (file: string) => {
        watched.push(file);
      },
      watched,
    };
  }

  async function transform(
    plugin: ReturnType<typeof barqVitePlugin>,
    code: string,
    context = withResolver(),
  ): Promise<{ code: string; watched: string[] }> {
    const hook = plugin.transform as unknown as (
      this: unknown,
      code: string,
      id: string,
    ) => Promise<TransformResult | null>;
    const result = await hook.call(context, code, join(DIR, "card.tsx"));
    return { code: (result as { code?: string } | null)?.code ?? "", watched: context.watched };
  }

  const CARD = `import { atomsIn } from "@barqjs/css";
import { BRAND } from "./tokens.ts";
import { shared, ui } from "./shared.ts";
export const a = atomsIn("app", { color: BRAND });
export const b = atomsIn("app", shared.ring);
export const c = ui({ padding: 4 });
`;

  test("a token, a group and a layer binding all fold", async () => {
    const { code } = await transform(barqVitePlugin(), CARD);
    expect(code).not.toContain("atomsIn(");
    expect(code).not.toContain("ui({");
    expect(code).toContain("a-color_");
    expect(code).toContain("a-outline-width_");
  });

  test("and the file each value came from is watched, so an edit retransforms this one", async () => {
    const context = withResolver();
    await transform(barqVitePlugin(), CARD, context);
    expect(context.watched.some((file) => file.endsWith("tokens.ts"))).toBe(true);
    expect(context.watched.some((file) => file.endsWith("shared.ts"))).toBe(true);
  });

  test("this module carries the stylesheet of everything it folded a value out of", async () => {
    // Folding INLINES the value, which can leave the other module with no used
    // export — and a bundler then drops it and the `import "….barq.css"` inside
    // it. Measured on a four-file app: the JS named `a-outline-width_o01p2h`
    // and the asset defined nothing.
    const { code } = await transform(barqVitePlugin(), CARD);
    expect(code).toContain(`import "${join(DIR, "shared.ts")}.barq.css"`);
  });

  test("and with it off, the call is left for the runtime", async () => {
    const { code } = await transform(barqVitePlugin({ resolveImports: false }), CARD);
    expect(code).toContain("atomsIn(");
  });

  test("a plugin with no resolver still compiles, it just folds less", async () => {
    const plugin = barqVitePlugin();
    const hook = plugin.transform as unknown as (
      this: unknown,
      code: string,
      id: string,
    ) => Promise<TransformResult | null>;
    const bare = {
      warn() {},
      error(message: string): never {
        throw new Error(message);
      },
    };
    const result = await hook.call(bare, CARD, join(DIR, "card.tsx"));
    expect((result as { code?: string } | null)?.code ?? "").toContain("atomsIn(");
  });
});

describe("stylesheets", () => {
  const CSS_SOURCE = `import { css } from "@barqjs/css";
export const card = css\`color: red\`;
`;

  function resolve(plugin: ReturnType<typeof barqVitePlugin>, id: string): string | null {
    const hook = plugin.resolveId as unknown as (id: string) => string | null;
    return hook.call(plugin, id);
  }

  function load(plugin: ReturnType<typeof barqVitePlugin>, id: string): string | null {
    const hook = plugin.load as unknown as (id: string) => string | null;
    return hook.call(plugin, id);
  }

  test("a block becomes a class and its CSS is served from the module's own id", async () => {
    const plugin = barqVitePlugin();
    const { result } = await run(plugin, CSS_SOURCE, "/a/styles.ts");
    const code = result?.code ?? "";
    expect(code).toContain('import "/a/styles.ts.barq.css"');
    expect(code).not.toContain("css`");

    const sheet = load(plugin, "/a/styles.ts.barq.css") ?? "";
    const [, klass] = /\.(\w+)\{/.exec(sheet) ?? [];
    expect(sheet).toBe(`.${klass}{color: red}`);
    expect(code).toContain(`"${klass}"`);
  });

  /** A stylesheet lives in a `.ts` module, which the extension list excludes. */
  test("a module is transformed because it names the package, not because of its extension", async () => {
    const plugin = barqVitePlugin();
    expect((await run(plugin, SOURCE, "/a/plain.ts")).result).toBe(null);
    expect((await run(plugin, CSS_SOURCE, "/a/styles.ts")).result).not.toBe(null);
  });

  test("the id is claimed verbatim, so the query it is keyed by survives", async () => {
    const plugin = barqVitePlugin();
    expect(resolve(plugin, "/a/styles.ts.barq.css")).toBe("/a/styles.ts.barq.css");
    expect(resolve(plugin, "/a/styles.ts")).toBe(null);
  });

  test("a module that wrote no CSS gets no import appended", async () => {
    const plugin = barqVitePlugin();
    const { result } = await run(plugin, SOURCE, "/a/app.tsx");
    expect(result?.code).not.toContain(".barq.css");
  });

  test("an unknown stylesheet loads as empty rather than as undefined", async () => {
    const plugin = barqVitePlugin();
    expect(load(plugin, "/never/seen.ts.barq.css")).toBe("");
    expect(load(plugin, "/a/styles.ts")).toBe(null);
  });

  test("a custom cssSource is what the import must name", async () => {
    const plugin = barqVitePlugin({ cssSource: "@acme/styles" });
    expect((await run(plugin, CSS_SOURCE, "/a/styles.ts")).result).toBe(null);
    const renamed = CSS_SOURCE.replace("@barqjs/css", "@acme/styles");
    expect((await run(plugin, renamed, "/a/styles.ts")).result?.code).toContain(".barq.css");
  });
});

/**
 * The two delivery modes, which is the whole of how CSS reaches a page.
 *
 * A dev server has no `generateBundle`, so the asset path cannot work there —
 * measured before this existed: a server-rendered dev page carried 23 compiled
 * classes and zero stylesheets of any kind.
 */
describe("css delivery", () => {
  const CSS_SOURCE = `import { css } from "@barqjs/css";
export const card = css\`color: red\`;
`;

  function load(plugin: ReturnType<typeof barqVitePlugin>, id: string): string | null {
    const hook = plugin.load as unknown as (id: string) => string | null;
    return hook.call(plugin, id);
  }

  test("a build serves the CSS as an asset the module imports", async () => {
    const plugin = barqVitePlugin({ dev: false });
    const code = (await run(plugin, CSS_SOURCE, "/a/styles.ts")).result?.code ?? "";
    expect(code).toContain('import "/a/styles.ts.barq.css"');
    expect(code).not.toContain("registerCss");
    expect(load(plugin, "/a/styles.ts.barq.css")).toContain("color: red");
  });

  test("dev carries the rules in the module, keyed by its id", async () => {
    const plugin = barqVitePlugin({ dev: true });
    const code = (await run(plugin, CSS_SOURCE, "/a/styles.ts")).result?.code ?? "";
    expect(code).toContain('import { registerCss as _$registerCss } from "@barqjs/css"');
    // Keyed by the stylesheet's id, which carries the module's query: a split
    // route is two modules that differ only by `?barq-split`, and keying on the
    // path alone gave both the same rules.
    expect(code).toContain('_$registerCss("/a/styles.ts.barq.css"');
    expect(code).toContain("color: red");
  });

  test("the mode can be forced against the environment", async () => {
    const asAsset = barqVitePlugin({ dev: true, cssMode: "asset" });
    expect((await run(asAsset, CSS_SOURCE, "/a/styles.ts")).result?.code).toContain(".barq.css");
    const asInline = barqVitePlugin({ dev: false, cssMode: "inline" });
    expect((await run(asInline, CSS_SOURCE, "/a/styles.ts")).result?.code).toContain("registerCss");
  });

  test("the registration names the configured package, not a hard-coded one", async () => {
    const plugin = barqVitePlugin({ dev: true, cssSource: "@acme/styles" });
    const code = (await run(plugin, CSS_SOURCE.replace("@barqjs/css", "@acme/styles"), "/a/s.ts"))
      .result?.code;
    expect(code).toContain('from "@acme/styles"');
  });
  /**
   * A split route is two modules that differ only by a query, and both go
   * through this hook. Keyed by path alone they shared one stylesheet, so
   * whichever transformed last won — measured in a browser as a route whose
   * markup carried every class against a 36-byte sheet.
   */
  test("the two halves of a split route get their own stylesheets", async () => {
    const plugin = barqVitePlugin({ dev: false });
    const reference = `import { globalCss } from "@barqjs/css";\nglobalCss\`body { margin: 0 }\`;\n`;
    const split = `import { css } from "@barqjs/css";\nexport const box = css\`color: red\`;\n`;
    await run(plugin, reference, "/a/route.tsx");
    await run(plugin, split, "/a/route.tsx?barq-split");

    const load = plugin.load as unknown as (id: string) => string | null;
    expect(load.call(plugin, "/a/route.tsx.barq.css")).toBe("body{margin: 0}");
    expect(load.call(plugin, "/a/route.tsx.barq.css?barq-split")).toContain("color: red");
  });
});
