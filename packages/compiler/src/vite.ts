import type { Plugin, TransformResult } from "vite"
import * as babel from "@babel/core"
import barqBabelPlugin from "./babel.js"
import type { BarqCompilerOptions } from "./babel.js"

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
    ...compilerOptions
  } = options

  return {
    name: "barq-compiler",
    enforce: "pre",

    transform(code: string, id: string): TransformResult | null {
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
