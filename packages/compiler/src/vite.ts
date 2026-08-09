import { createRequire } from "node:module"
import type { Plugin, TransformResult } from "vite"

const NATIVE_PACKAGE = "@barqjs/compiler-rs"

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
  moduleSource?: string

  /**
   * Development mode: compile-time diagnostics about runtime behaviour
   * (DESIGN O3 and O7). Derived from Vite's own mode when left unset.
   */
  dev?: boolean

  /**
   * Compile intrinsic JSX trees to hoisted cloneable templates with
   * precomputed walks to dynamic holes (the optimizing pass)
   * @default true
   */
  templates?: boolean
}

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

let nativeCompiler: NativeCompiler | undefined
let nativeLoadError: string | undefined

/**
 * The binary is a build artifact, so "not built yet" is a state a checkout can
 * be in. There is no second pipeline to fall back to, so the caller turns this
 * into a hard error rather than compiling the file some other way.
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
    ...compilerOptions
  } = options

  // The compiler's dev-mode diagnostics (DESIGN O3 and O7) are advice about
  // runtime behaviour, so they belong on a dev build and nowhere else. Deriving
  // it from Vite means the user never has to ask for it twice — and left to the
  // user it never fired at all, because nothing else in the chain sets it.
  let dev = compilerOptions.dev

  return {
    name: "barq-compiler",
    enforce: "pre",

    config(_config, env) {
      if (dev === undefined) dev = env.command === "serve" || env.mode !== "production"
    },

    // `ssr` is per-module, not per-plugin: Vite transforms the same file twice,
    // once for the client and once for the server, and only this argument says
    // which one is running.
    transform(
      code: string,
      id: string,
      options?: { ssr?: boolean }
    ): TransformResult | null {
      const shouldTransform = include.some((ext) => id.endsWith(ext))
      if (!shouldTransform) return null

      const isExcluded = exclude.some((pattern) => {
        if (typeof pattern === "string") {
          return id.includes(pattern)
        }
        return pattern.test(id)
      })
      if (isExcluded) return null

      const compiler = loadNativeCompiler()
      if (!compiler) {
        throw new Error(
          `[barq-compiler] ${NATIVE_PACKAGE} could not be loaded: ${nativeLoadError}. ` +
            `Its native binary is a build artifact — run ` +
            `\`bun install && bun run --cwd packages/compiler-rs build\`.`
        )
      }

      // A native transform can fail on a parse diagnostic, and anything the
      // Rust side raises arrives here as a bare message with no file in it.
      let result
      try {
        result = compiler.transform(code, {
          ...compilerOptions,
          dev,
          filename: id,
          sourcemap: true,
          ssr: options?.ssr ?? false,
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
    },
  }
}

export default barqVitePlugin
