/**
 * The matchers for `bun:test`: the same `install` and table as `./matchers`,
 * with the declarations that type them on bun's `expect`.
 */
import type { DiagnosticsMatchers } from "./matchers.ts";

export { install, matchers } from "./matchers.ts";

declare module "bun:test" {
  interface Matchers<T> extends DiagnosticsMatchers {}
}
