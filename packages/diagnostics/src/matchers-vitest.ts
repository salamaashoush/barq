/**
 * The matchers for vitest: the same `install` and table as `./matchers`, with
 * the declarations that type them on vitest's `expect`. vitest is imported for
 * its types only, so nothing here loads it.
 */
import type { ExpectStatic } from "vitest";

import { install as installMatchers } from "./matchers.ts";
import type { DiagnosticsMatchers } from "./matchers.ts";

export { matchers } from "./matchers.ts";

export const install: (expect: ExpectStatic) => void = installMatchers;

declare module "vitest" {
  interface Matchers<T> extends DiagnosticsMatchers {}
}
