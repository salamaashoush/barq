/**
 * @barqjs/compiler
 *
 * The build-tool integration for the Barq compiler. The compiler itself is
 * `@barqjs/compiler-rs`; this package wires it into Vite.
 *
 * ```js
 * // vite.config.js
 * import { barqVitePlugin } from '@barqjs/compiler/vite'
 *
 * export default { plugins: [barqVitePlugin()] }
 * ```
 */

export { barqVitePlugin, loadNativeCompiler, resetNativeCompilerCache } from "./vite.js"
export type { BarqCompilerOptions, BarqVitePluginOptions } from "./vite.js"
