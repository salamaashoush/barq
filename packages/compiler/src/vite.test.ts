/**
 * The plugin surface. `native` defaults to true and `@barqjs/compiler-rs` is an
 * OPTIONAL peer dependency whose binary is a build artifact, so the missing-peer
 * path is a shipping path and gets covered like any other.
 */

import { describe, expect, test } from "bun:test";
import type { TransformResult } from "vite";

import { barqVitePlugin, loadNativeCompiler, resetNativeCompilerCache } from "./vite.ts";

const SOURCE = `export const V = () => <div class="c">{n}</div>;\n`;

/**
 * Both pipelines emit `_$template` + `_$insert`, so the discriminator is the
 * shape only the Rust backend produces: a PURE annotation on the hoisted clone,
 * and refs numbered from 1.
 */
function isNative(code: string | undefined): boolean {
  return code !== undefined && code.includes("__PURE__") && code.includes("_el$1");
}

interface PluginContext {
  warn(message: string): void;
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

/** Break the module resolution the loader uses, without touching node_modules. */
function withoutTheNativePackage<T>(fn: () => T): T {
  const original = process.env.NODE_PATH;
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
    process.env.NODE_PATH = original;
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

  test("the default path emits template clones, not createElement", () => {
    const plugin = barqVitePlugin();
    const { result, warnings } = run(plugin, SOURCE, "/a/app.tsx");
    expect(warnings).toEqual([]);
    expect(isNative(result?.code)).toBe(true);
    expect(result?.code).toContain("_$insert(");
    expect(result?.map).toBeTruthy();
  });

  test("native: false takes the Babel path", () => {
    const plugin = barqVitePlugin({ native: false });
    const { result } = run(plugin, SOURCE, "/a/app.tsx");
    expect(isNative(result?.code)).toBe(false);
    expect(result?.code).toContain("_$template(");
  });

  test("an SSR module takes the Babel path, because P8b is milestone 6", () => {
    const plugin = barqVitePlugin();
    const { result, warnings } = run(plugin, SOURCE, "/a/app.tsx", { ssr: true });
    expect(isNative(result?.code)).toBe(false);
    expect(result?.code).toContain("_$template(");
    expect(warnings).toEqual([]);
  });

  test("a missing optional peer falls back to Babel with exactly one warning", () => {
    withoutTheNativePackage(() => {
      expect(loadNativeCompiler()).toBeUndefined();

      const plugin = barqVitePlugin();
      const first = run(plugin, SOURCE, "/a/app.tsx");
      expect(first.result?.code).toBeTruthy();
      expect(isNative(first.result?.code)).toBe(false);
      expect(first.warnings.length).toBe(1);
      expect(first.warnings[0]).toContain("@barqjs/compiler-rs");

      const second = run(plugin, SOURCE, "/a/other.tsx");
      expect(isNative(second.result?.code)).toBe(false);
      expect(second.warnings).toEqual([]);
    });
  });

  test("the loader is usable again once the package resolves", () => {
    resetNativeCompilerCache();
    expect(loadNativeCompiler()).toBeDefined();
  });
});
