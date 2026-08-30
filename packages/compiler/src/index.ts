/** Wires `@barqjs/compiler-rs` into Vite. */

export {
  DEFAULT_CSS_SOURCE,
  barqVitePlugin,
  cssRegistration,
  loadNativeCompiler,
  resetNativeCompilerCache,
} from "./vite.js";
export type { BarqCompilerOptions, BarqOptimisation, BarqVitePluginOptions } from "./vite.js";
