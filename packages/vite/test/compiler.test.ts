/**
 * The plugin surface. There is exactly one pipeline: `@barqjs/compiler` is a
 * hard dependency, and a checkout whose native binary has not been built is an
 * ERROR rather than a quieter build.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TransformResult } from "vite";

import {
  barqVitePlugin,
  DIAGNOSTICS_EVENT,
  discoverBoundaries,
  loadNativeCompiler,
  mergeBoundaries,
  resetNativeCompilerCache,
  type BarqBoundary,
  type BarqDiagnostic,
  type BarqOptimisation,
} from "../src/compiler.ts";
import { reportServerDiagnostic } from "../src/server-diagnostics.ts";

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
      if (args[0] === "@barqjs/compiler") throw new Error("Cannot find module");
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
  describe("the dependency optimizer", () => {
    const made: string[] = [];
    afterAll(() => {
      for (const dir of made) rmSync(dir, { recursive: true, force: true });
    });

    /** A project whose `@barqjs/core` is installed, or linked from elsewhere. */
    function projectWith(core: "installed" | "linked"): string {
      const root = join(tmpdir(), `barq-optimize-${core}-${process.pid}`);
      made.push(root);
      rmSync(root, { recursive: true, force: true });
      mkdirSync(join(root, "node_modules", "@barqjs"), { recursive: true });
      writeFileSync(join(root, "package.json"), JSON.stringify({ name: "salama-app" }));
      const target = join(root, "node_modules", "@barqjs", "core");
      if (core === "installed") {
        mkdirSync(target);
        writeFileSync(join(target, "package.json"), JSON.stringify({ name: "@barqjs/core" }));
      } else {
        const elsewhere = join(root, "packages", "core");
        mkdirSync(elsewhere, { recursive: true });
        writeFileSync(join(elsewhere, "package.json"), JSON.stringify({ name: "@barqjs/core" }));
        symlinkSync(elsewhere, target);
      }
      return root;
    }

    const optimizeDeps = (root: string, command: "serve" | "build") => {
      const plugin = barqVitePlugin();
      const config: { root: string; optimizeDeps?: Record<string, unknown> } = { root };
      const hook = plugin.config as unknown as (config: unknown, env: ConfigEnv) => void;
      hook.call(plugin, config, { command, mode: "development" });
      return config.optimizeDeps as {
        include?: string[];
        rolldownOptions?: { transform?: { jsx?: unknown } };
      };
    };

    /**
     * Every component module the plugin wraps imports `@barqjs/core/hot`, after
     * the scanner has read it. Found late, it re-optimizes and reloads the page.
     */
    test("pre-bundles the hot runtime up front when the runtime is an installed package", () => {
      expect(optimizeDeps(projectWith("installed"), "serve").include).toContain("@barqjs/core/hot");
    });

    test("leaves a linked runtime alone, since Vite would not pre-bundle it either", () => {
      expect(optimizeDeps(projectWith("linked"), "serve").include ?? []).not.toContain(
        "@barqjs/core/hot",
      );
      expect(optimizeDeps(projectWith("installed"), "build").include ?? []).not.toContain(
        "@barqjs/core/hot",
      );
    });

    test("scans TSX with the classic runtime, so no `jsx-dev-runtime` import is invented", () => {
      expect(optimizeDeps(projectWith("linked"), "serve").rolldownOptions?.transform?.jsx).toEqual({
        runtime: "classic",
      });
    });
  });

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
      expect(run(plugin, SOURCE, "/a/app.tsx")).rejects.toThrow(/@barqjs\/compiler/);
      // …and it names the command that fixes it, because the binary is a build
      // artifact and "not built yet" is a state a fresh checkout is in.
      expect(run(plugin, SOURCE, "/a/app.tsx")).rejects.toThrow(/compiler build/);
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
      export const V = () => <ul><For each={state.rows}>{({ name }) => <li>{name}</li>}</For></ul>;\n`;

    test("a dev server run warns", async () => {
      const plugin = barqVitePlugin();
      configure(plugin, { command: "serve", mode: "development" });
      const { warnings } = await run(plugin, DEV_NOTE, "/a/app.tsx");
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings.join("\n")).toContain("BARQ004");
      expect(warnings.join("\n")).toContain("where the items in `each` come from");
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
      `import { createSignal } from "@barqjs/core";\n` +
      `const [count] = createSignal(0);\n` +
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
      const offset = COERCED.indexOf("${count}") + 2;
      expect(positions[0]).toBe(offset);
      // …and that offset really is the identifier in the ORIGINAL source.
      expect(COERCED.slice(offset, offset + 5)).toBe("count");
      // Rollup formats `(line:col)` from the position it was given, so the text
      // must NOT carry its own location: the string form of a diagnostic ends
      // up printed beside Rollup's, with two different columns for one
      // identifier (Rollup's is 0-based, ours is 1-based).
      expect(warnings[0]).not.toContain("/a/app.tsx");
      expect(warnings[0]).toMatch(/^BARQ001 warning: /);
      expect(warnings[0]).toEndWith(
        "\n  docs: https://github.com/salamaashoush/barq/blob/main/packages/compiler/docs/BARQ001.md",
      );
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

      // That a repeated payload leaves a closed overlay closed is asserted by
      // driving it, in `overlay.test.ts`.

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
        watcher: { on: () => {} },
      });

      await run(plugin, COERCED, "/a/app.tsx");
      const last = sent.at(-1) as {
        event: string;
        data: { diagnostics: BarqDiagnostic[]; labels: Record<string, unknown[]> };
      };
      expect(last.event).toBe(DIAGNOSTICS_EVENT);
      expect(last.data.diagnostics).toHaveLength(1);
      expect(last.data.diagnostics[0].code).toBe("BARQ001");
      expect(last.data.diagnostics[0].file).toBe("/a/app.tsx");
      // Dev-mode labels ride the same payload.
      expect(Object.keys(last.data.labels)).toEqual(["/a/app.tsx"]);

      // A file that stops reporting clears its own rows rather than accreting.
      await run(plugin, `export const V = () => <p>ok</p>;\n`, "/a/app.tsx");
      const cleared = sent.at(-1) as { data: { diagnostics: unknown[] } };
      expect(cleared.data.diagnostics).toEqual([]);
    });

    test("what the server reported reaches the next page to connect, until a file changes", () => {
      const sent: { event?: string; data?: unknown }[] = [];
      const hot = new Map<string, () => void>();
      const watcher = new Map<string, () => void>();
      const server = {
        hot: {
          send: (payload: { event?: string; data?: unknown }) => sent.push(payload),
          on: (event: string, listener: () => void) => hot.set(event, listener),
        },
        watcher: { on: (event: string, listener: () => void) => watcher.set(event, listener) },
        config: { root: "/a" },
      };
      const plugin = dev();
      const configureServer = plugin.configureServer as unknown as (server: unknown) => void;
      configureServer.call(plugin, server);

      reportServerDiagnostic(server, {
        code: "SSR_RENDER_ERROR_CONTAINED",
        severity: "error",
        message: "salama's profile failed to load",
      });
      const served = (): unknown[] =>
        sent.filter((payload) => payload.event === "barq:server-diagnostics").map((p) => p.data);
      expect(served()).toHaveLength(1);

      hot.get("barq:diagnostics:ready")?.();
      expect(served()).toHaveLength(2);
      expect(served()[1]).toMatchObject({ message: "salama's profile failed to load" });

      watcher.get("change")?.();
      hot.get("barq:diagnostics:ready")?.();
      expect(served()).toHaveLength(2);
    });

    test("the structured diagnostic survives the napi boundary intact", async () => {
      const compiler = loadNativeCompiler()!;
      const result = compiler.transform(COERCED, {
        filename: "/a/app.tsx",
        dev: true,
      }) as unknown as { diagnostics: BarqDiagnostic[]; labels: unknown[] };
      expect(result.diagnostics).toHaveLength(1);
      const diagnostic = result.diagnostics[0];
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
      `import { createSignal } from "@barqjs/core";\n` +
      `const [n] = createSignal(0);\n` +
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
      // Each is a fused record of ONE, so its previous value is a scalar, the
      // compute returns it directly and the channel is handed it to compare
      // against. The optimised build merges the two into one record with
      // positional fields.
      expect(reference).toContain(`_$setAttr(_el$1, "id", _v$, _p$);`);
      expect(reference).toContain(`_$setAttr(_el$1, "title", _v$, _p$);`);
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
    const REFERENCE =
      `import { createSignal } from "@barqjs/core";\n` +
      `const [n] = createSignal(0);\n` +
      `export const V = () => <b id={n()}>x</b>;\n`;

    async function build(
      options: Parameters<typeof barqVitePlugin>[0],
      transformOptions?: { ssr?: boolean },
    ) {
      const plugin = barqVitePlugin(options);
      configure(plugin, { command: "build", mode: "production" });
      return (await run(plugin, REFERENCE, "/a/app.tsx", transformOptions)).result?.code ?? "";
    }

    test("interp serialises the IR instead of emitting the walk", async () => {
      const code = await build({ interp: true });
      expect(code).toContain('from "@barqjs/web/interp"');
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

  test("its own rules and the folded ones share ONE import of registerCss", async () => {
    // Two `cssRegistration` calls wrote the import twice, which is a
    // REDECLARED binding rather than a duplicate import a bundler dedupes:
    // "Identifier `_$registerCss` has already been declared", and the module
    // never parsed. Every component reaching a shared group is such a module,
    // so dev served the whole package as a parse error.
    const { code } = await transform(barqVitePlugin({ dev: true }), CARD);
    const imports = code.match(/import \{ registerCss as _\$registerCss \}/g) ?? [];
    expect(imports).toHaveLength(1);
    // And both stylesheets are still registered.
    expect(code).toContain(`_$registerCss("${join(DIR, "card.tsx")}.barq.css"`);
    expect(code).toContain(`_$registerCss("${join(DIR, "shared.ts")}.barq.css"`);
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
 * The cascade layer order, in the assets a build emits.
 *
 * A layer's position is fixed by its FIRST appearance across every stylesheet
 * the document loads, and a code-split build is several stylesheets whose link
 * order the bundler decides. Measured on `@barqjs/site`: the chunk carrying
 * `@layer barq.ui{…}` was linked first, the components were therefore declared
 * before `barq.reset`, and Tailwind's preflight — a later layer — beat every
 * one of them. Buttons lost their padding and their background.
 */
describe("cascade layer order", () => {
  const ORDER = `import { globalCss } from "@barqjs/css";
globalCss\`@layer barq.reset, barq.base, barq.ui;\`;
`;
  const LAYERED = `import { css, layer } from "@barqjs/css";
layer("barq.ui");
export const card = css\`color: red\`;
`;

  function bundle(plugin: ReturnType<typeof barqVitePlugin>, assets: Record<string, string>) {
    const chunks = Object.fromEntries(
      Object.entries(assets).map(([fileName, source]) => [
        fileName,
        { type: "asset" as const, fileName, source },
      ]),
    );
    const hook = plugin.generateBundle as unknown as (options: unknown, bundle: unknown) => void;
    hook.call(plugin, {}, chunks);
    return Object.fromEntries(Object.entries(chunks).map(([name, asset]) => [name, asset.source]));
  }

  test("every asset naming a layer declares the whole order", async () => {
    const plugin = barqVitePlugin({ dev: false });
    await run(plugin, ORDER, "/a/layers.ts");
    await run(plugin, LAYERED, "/a/card.ts");

    const out = bundle(plugin, {
      // The chunk the order statement did NOT land in, linked first.
      "components.css": "@layer barq.ui{.a-color_x{color:red}}",
      "theme.css": "@layer barq.reset, barq.base;@layer barq.ui{.b{color:blue}}",
    });
    for (const source of Object.values(out)) {
      expect(source.startsWith("@layer barq.reset, barq.base, barq.ui;")).toBe(true);
    }
  });

  test("an asset naming no layer is left alone", async () => {
    const plugin = barqVitePlugin({ dev: false });
    await run(plugin, ORDER, "/a/layers.ts");
    const out = bundle(plugin, { "font.css": "@font-face{font-family:x;src:url(x.woff2)}" });
    expect(out["font.css"]).toBe("@font-face{font-family:x;src:url(x.woff2)}");
  });

  /**
   * Read from the MODULE stylesheets and not from the assets, because by the
   * time an asset exists Lightning CSS has rewritten the statement to name only
   * the layers with no block in the same file. Nothing the build saw declares
   * an order here, so there is none to declare.
   */
  test("a build that saw no order statement declares none", async () => {
    const plugin = barqVitePlugin({ dev: false });
    await run(plugin, LAYERED, "/a/card.ts");
    const out = bundle(plugin, { "components.css": "@layer barq.ui{.a-color_x{color:red}}" });
    expect(out["components.css"]).toBe("@layer barq.ui{.a-color_x{color:red}}");
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

  test("a module whose rules are all gone clears the ones it registered", async () => {
    // The registry is keyed by the module's stylesheet id and only a
    // registration replaces an entry, so a module that says nothing keeps
    // every rule its last version had until the page is reloaded.
    const plugin = barqVitePlugin({ dev: true });
    const bare = `import { css } from "@barqjs/css";\nexport const card = "plain";\n`;
    await run(plugin, CSS_SOURCE, "/a/styles.ts");
    const code = (await run(plugin, bare, "/a/styles.ts")).result?.code ?? "";
    expect(code).toContain('_$registerCss("/a/styles.ts.barq.css", "");');
    // The server's registry is a second one, and it is cleared the same way.
    const served = (await run(plugin, bare, "/a/styles.ts", { ssr: true })).result?.code ?? "";
    expect(served).toContain('_$registerCss("/a/styles.ts.barq.css", "");');
  });

  test("and so does one that stopped naming the package at all", async () => {
    const plugin = barqVitePlugin({ dev: true });
    await run(plugin, CSS_SOURCE, "/a/styles.ts");
    const result = (await run(plugin, `export const card = "plain";\n`, "/a/styles.ts")).result;
    expect(result?.code).toBe(
      'export const card = "plain";\n' +
        '\nimport { registerCss as _$registerCss } from "@barqjs/css";\n' +
        '_$registerCss("/a/styles.ts.barq.css", "");\n',
    );
  });

  test("a module that never registered a rule is given nothing to clear", async () => {
    const plugin = barqVitePlugin({ dev: true });
    const bare = `import { css } from "@barqjs/css";\nexport const card = "plain";\n`;
    expect((await run(plugin, bare, "/a/other.ts")).result?.code).not.toContain("registerCss");
    expect((await run(plugin, `export const x = 1;\n`, "/a/plain.ts")).result).toBeNull();
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

    const loadHook = plugin.load as unknown as (id: string) => string | null;
    expect(loadHook.call(plugin, "/a/route.tsx.barq.css")).toBe("body{margin: 0}");
    expect(loadHook.call(plugin, "/a/route.tsx.barq.css?barq-split")).toContain("color: red");
  });
});

describe("renderers", () => {
  const SCENE = "export const Box = (p) => <box title={p.title()}>{p.label}</box>;\n";

  test("a file a renderer entry matches compiles for that renderer, the rest for the document", async () => {
    const plugin = barqVitePlugin({
      dev: false,
      renderers: [{ include: "src/scene/**", moduleSource: "/src/scene/renderer.ts" }],
    });
    const scene = (await run(plugin, SCENE, "/app/src/scene/Box.tsx")).result?.code ?? "";
    expect(scene).toContain('from "/src/scene/renderer.ts"');
    expect(scene).toContain("_$createElement(");
    expect(scene).not.toContain("@barqjs/web");

    const page = (await run(plugin, SCENE, "/app/src/page/Box.tsx")).result?.code ?? "";
    expect(page).toContain('from "@barqjs/web"');
    expect(page).toContain("_$template(");
  });

  test("the server half compiles a renderer's files for that renderer too, with no error", async () => {
    const plugin = barqVitePlugin({
      dev: false,
      renderers: [{ include: ["src/scene/**"], moduleSource: "/src/scene/renderer.ts" }],
    });
    const { result, warnings } = await run(plugin, SCENE, "/app/src/scene/Box.tsx", { ssr: true });
    expect(result?.code).toContain("_$createElement(");
    expect(warnings).toEqual([]);
  });

  test("`target` compiles every file for a custom renderer", async () => {
    const plugin = barqVitePlugin({
      dev: false,
      target: "universal",
      moduleSource: "/src/renderer.ts",
    });
    const code = (await run(plugin, SCENE, "/app/src/Box.tsx")).result?.code ?? "";
    expect(code).toContain('from "/src/renderer.ts"');
    expect(code).toContain("_$setProp(");
  });
});

describe("boundaries", () => {
  const PAGE = `import { Canvas } from "@acme/scene";
export const App = (p) => <main><h1>{p.title()}</h1><Canvas><mesh name={p.title()} /></Canvas></main>;
`;
  const canvas = (moduleSource: string): BarqBoundary => ({
    source: "@acme/scene",
    name: "Canvas",
    target: "universal",
    moduleSource,
  });

  const made: string[] = [];
  afterAll(() => {
    for (const dir of made) rmSync(dir, { recursive: true, force: true });
  });

  /** An app that installs `@acme/scene` and holds `@acme/overlay` as a workspace package. */
  function project(): string {
    const root = join(tmpdir(), `barq-boundaries-${process.pid}`);
    made.push(root);
    rmSync(root, { recursive: true, force: true });
    const write = (path: string, manifest: unknown) => {
      mkdirSync(join(root, path), { recursive: true });
      writeFileSync(join(root, path, "package.json"), JSON.stringify(manifest));
    };
    write(".", {
      name: "salama-app",
      dependencies: { "@acme/scene": "1.0.0", "@acme/plain": "1.0.0" },
      workspaces: ["packages/*"],
    });
    write("node_modules/@acme/scene", {
      name: "@acme/scene",
      barq: {
        boundaries: [
          { name: "Canvas", target: "universal", moduleSource: "@acme/scene/renderer" },
          { name: "Html", target: "dom", moduleSource: "@barqjs/web" },
          { name: "Broken", target: "canvas", moduleSource: "@acme/scene/renderer" },
        ],
      },
    });
    write("node_modules/@acme/plain", { name: "@acme/plain" });
    write("packages/overlay", {
      name: "@acme/overlay",
      barq: { boundaries: [{ name: "Layer", target: "dom", moduleSource: "@barqjs/web" }] },
    });
    return root;
  }

  test("an entry in compiler.boundaries compiles the children for its renderer", async () => {
    const plugin = barqVitePlugin({ dev: false, boundaries: [canvas("/src/renderer.ts")] });
    const code = (await run(plugin, PAGE, "/app/src/App.tsx")).result?.code ?? "";
    expect(code).toContain("_$template(`<main><h1></h1></main>`)");
    expect(code).toContain('_$createElement$1("mesh")');
    expect(code).toContain('from "/src/renderer.ts"');
  });

  test("dependencies and workspace packages declare their own, and a malformed entry is skipped", () => {
    expect(discoverBoundaries(project())).toEqual([
      canvas("@acme/scene/renderer"),
      { source: "@acme/scene", name: "Html", target: "dom", moduleSource: "@barqjs/web" },
      { source: "@acme/overlay", name: "Layer", target: "dom", moduleSource: "@barqjs/web" },
    ]);
  });

  test("a configured entry wins over a declared one for the same component", () => {
    expect(mergeBoundaries([canvas("/src/renderer.ts")], [canvas("@acme/scene/renderer")])).toEqual(
      [canvas("/src/renderer.ts")],
    );
  });

  /** The plugin, configured the way Vite does it for a build at `root`. */
  function builtAt(root: string, boundaries?: BarqBoundary[]) {
    const plugin = barqVitePlugin({ dev: false, boundaries });
    const hook = plugin.config as unknown as (config: unknown, env: ConfigEnv) => void;
    hook.call(plugin, { root }, { command: "build", mode: "production" });
    return plugin;
  }

  test("the plugin discovers them from the project root with no configuration", async () => {
    const plugin = builtAt(project());
    const code = (await run(plugin, PAGE, "/app/src/App.tsx")).result?.code ?? "";
    expect(code).toContain('_$createElement$1("mesh")');
    expect(code).toContain('from "@acme/scene/renderer"');

    const configured = builtAt(project(), [canvas("/src/renderer.ts")]);
    const own = (await run(configured, PAGE, "/app/src/App.tsx")).result?.code ?? "";
    expect(own).toContain('from "/src/renderer.ts"');
    expect(own).not.toContain("@acme/scene/renderer");
  });
});
