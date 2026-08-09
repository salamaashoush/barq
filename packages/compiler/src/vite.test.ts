/**
 * The plugin surface. Since M6 there is exactly one pipeline: the Babel plugin
 * is gone, `@barqjs/compiler-rs` is a hard dependency, and a checkout whose
 * native binary has not been built is an ERROR rather than a quieter build.
 */

import { describe, expect, test } from "bun:test";
import type { TransformResult } from "vite";

import { barqVitePlugin, loadNativeCompiler, resetNativeCompilerCache } from "./vite.ts";

const SOURCE = `export const V = () => <div class="c">{n}</div>;\n`;

/** The shape only the compiler produces: a PURE annotation on the hoisted clone. */
function isCompiled(code: string | undefined): boolean {
  return code !== undefined && code.includes("__PURE__") && code.includes("_el$1");
}

interface PluginContext {
  warn(message: string): void;
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
): { result: TransformResult | null; warnings: string[] } {
  const warnings: string[] = [];
  const context: PluginContext = {
    warn(message) {
      warnings.push(message);
    },
  };
  const transform = plugin.transform as unknown as (
    this: PluginContext,
    code: string,
    id: string,
    options?: { ssr?: boolean },
  ) => TransformResult | null;
  return { result: transform.call(context, code, id, options), warnings };
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
   * O3 and O7 are dev-mode compile notes, and before M6 they could not fire
   * through this plugin at all: `dev` reached the compiler only if the user
   * passed `barqVitePlugin({ dev: true })` by hand. Vite already knows which
   * build this is, so the plugin asks it.
   */
  describe("dev is derived from Vite rather than asked for", () => {
    // `Dynamic` spreading a getter prop is O7's warning, and it needs `dev`.
    const O7 = `import { Dynamic, signal } from "@barqjs/core";\n
      const n = signal(0);
      export const V = () => <Dynamic component="div" total={n()} />;\n`;

    test("a dev server run warns", () => {
      const plugin = barqVitePlugin();
      configure(plugin, { command: "serve", mode: "development" });
      const { warnings } = run(plugin, O7, "/a/app.tsx");
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings.join("\n")).toContain("DESIGN O7");
    });

    test("a production build does not", () => {
      const plugin = barqVitePlugin();
      configure(plugin, { command: "build", mode: "production" });
      expect(run(plugin, O7, "/a/app.tsx").warnings).toEqual([]);
    });

    test("an explicit dev option still wins over the derivation", () => {
      const plugin = barqVitePlugin({ dev: true });
      configure(plugin, { command: "build", mode: "production" });
      expect(run(plugin, O7, "/a/app.tsx").warnings.length).toBeGreaterThan(0);

      const off = barqVitePlugin({ dev: false });
      configure(off, { command: "serve", mode: "development" });
      expect(run(off, O7, "/a/app.tsx").warnings).toEqual([]);
    });
  });
});
