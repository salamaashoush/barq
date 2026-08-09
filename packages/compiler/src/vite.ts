import { createRequire } from "node:module"
import type { Plugin, TransformResult } from "vite"
import * as babel from "@babel/core"
import barqBabelPlugin from "./babel.js"
import type { BarqCompilerOptions } from "./babel.js"

interface NativeTransformOptions extends BarqCompilerOptions {
  filename?: string
  sourcemap?: boolean
  ssr?: boolean
}

interface NativeCompiler {
  transform(
    code: string,
    options?: NativeTransformOptions
  ): { code: string; map?: string; warnings?: string[] }
}

const NATIVE_PACKAGE = "@barqjs/compiler-rs"

let nativeCompiler: NativeCompiler | undefined
let nativeLoadError: string | undefined

/**
 * `@barqjs/compiler-rs` is an OPTIONAL peer dependency and its binary is a build
 * artifact, so "not installed" is an ordinary state, not an error. Returns
 * undefined and lets the caller fall back to Babel.
 */
export function loadNativeCompiler(): NativeCompiler | undefined {
  if (nativeCompiler) return nativeCompiler
  if (nativeLoadError !== undefined) return undefined

  try {
    const require = createRequire(import.meta.url)
    nativeCompiler = require(NATIVE_PACKAGE) as NativeCompiler
  } catch (error) {
    nativeLoadError = error instanceof Error ? error.message : String(error)
    return undefined
  }

  return nativeCompiler
}

/** Test seam: the loader memoizes both outcomes for the process lifetime. */
export function resetNativeCompilerCache(): void {
  nativeCompiler = undefined
  nativeLoadError = undefined
}

export interface BarqVitePluginOptions extends BarqCompilerOptions {
  /**
   * File extensions to transform
   * @default ['.tsx', '.jsx']
   */
  include?: string[]

  /**
   * File patterns to exclude
   * @default [/node_modules/]
   */
  exclude?: (string | RegExp)[]

  /**
   * Babel presets to use
   * @default [['@babel/preset-typescript', { isTSX: true, allExtensions: true }]]
   */
  babelPresets?: babel.PluginItem[]

  /**
   * Compile with the native Rust compiler (@barqjs/compiler-rs) instead of Babel.
   * On since milestone 2: the Rust pipeline emits template clones and patch
   * calls, and the whole differential fixture corpus renders identically to the
   * un-compiled `createElement` path.
   *
   * The package is an OPTIONAL peer dependency, so a project without it falls
   * back to the Babel plugin with one warning rather than failing. SSR modules
   * take the Babel path regardless: the Rust backend has no string mode until
   * milestone 6 and refuses `ssr: true` outright.
   * @default true
   */
  native?: boolean
}

/**
 * Vite plugin for Barq compiler
 *
 * Transforms JSX files to add fine-grained reactivity.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { defineConfig } from 'vite'
 * import { barqVitePlugin } from '@barqjs/compiler/vite'
 *
 * export default defineConfig({
 *   plugins: [
 *     barqVitePlugin({
 *       autoComputed: true
 *     })
 *   ]
 * })
 * ```
 */
export function barqVitePlugin(options: BarqVitePluginOptions = {}): Plugin {
  const {
    include = [".tsx", ".jsx"],
    exclude = [/node_modules/],
    babelPresets = [
      ["@babel/preset-typescript", { isTSX: true, allExtensions: true }],
    ],
    native = true,
    ...compilerOptions
  } = options

  let warnedAboutFallback = false

  return {
    name: "barq-compiler",
    enforce: "pre",

    // `ssr` is per-module, not per-plugin: Vite transforms the same file twice,
    // once for the client and once for the server, and only this argument says
    // which one is running.
    transform(
      code: string,
      id: string,
      options?: { ssr?: boolean }
    ): TransformResult | null {
      // Check if file should be transformed
      const shouldTransform = include.some((ext) => id.endsWith(ext))
      if (!shouldTransform) return null

      // Check exclusions
      const isExcluded = exclude.some((pattern) => {
        if (typeof pattern === "string") {
          return id.includes(pattern)
        }
        return pattern.test(id)
      })
      if (isExcluded) return null

      // P8b is milestone 6, and the native compiler rejects `ssr: true` rather
      // than emitting DOM code for a server build.
      const compiler = native && !options?.ssr ? loadNativeCompiler() : undefined

      if (native && !options?.ssr && !compiler && !warnedAboutFallback) {
        warnedAboutFallback = true
        this.warn(
          `[barq-compiler] ${NATIVE_PACKAGE} could not be loaded, falling back to the Babel ` +
            `pipeline. Install it and build the native binary with ` +
            `\`bun install && bun run --cwd packages/compiler-rs build\`, ` +
            `or set native: false to silence this.`
        )
      }

      if (compiler) {
        // Same failure handling the Babel branch below has. A native transform
        // can fail on a parse diagnostic, and anything the Rust side raises
        // arrives here as a bare message with no file in it.
        let result
        try {
          result = compiler.transform(code, {
            ...compilerOptions,
            filename: id,
            sourcemap: true,
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          throw new Error(`[barq-compiler] Failed to transform ${id}: ${message}`)
        }

        for (const warning of result.warnings ?? []) {
          this.warn(warning)
        }

        return {
          code: result.code,
          map: result.map
            ? (JSON.parse(result.map) as TransformResult["map"])
            : null,
        }
      }

      try {
        const result = babel.transformSync(code, {
          filename: id,
          plugins: [[barqBabelPlugin, compilerOptions]],
          presets: babelPresets,
          sourceMaps: true,
        })

        if (!result || !result.code) return null

        return {
          code: result.code,
          map: (result.map ?? null) as TransformResult["map"],
        }
      } catch (error) {
        // Re-throw with better error message
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`[barq-compiler] Failed to transform ${id}: ${message}`)
      }
    },
  }
}

export default barqVitePlugin
