import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { cssRegistration } from "./css-registration.ts";

export { cssRegistration, cssRegistrations, DEFAULT_CSS_SOURCE } from "./css-registration.ts";

interface Native {
  transform(
    code: string,
    options?: Record<string, unknown>,
  ): { code: string; warnings?: string[]; css?: string };
}

export interface CompilerLoaderOptions {
  /** Passed to the native transform beside `filename`. */
  transform?: Record<string, unknown>;
  /** The `.ts` modules that go through the compiler as well; every `.tsx` does. */
  ts?: RegExp;
}

type Loaded = { contents: string; loader: "ts" | "tsx" };

export interface CompilerLoader {
  name: string;
  setup(build: {
    onLoad(filter: { filter: RegExp }, load: (args: { path: string }) => Loaded): void;
  }): void;
}

/**
 * The barq compiler as a `bun test` loader, for `plugin()` in a preload or for a
 * `Bun.build` inside a test, which does not inherit the runner's loader.
 *
 * A suite has to compile its `.tsx` the way an application build does. bun's own
 * `react-jsx` transform cannot produce scope-taking Blocks, so a module lowered
 * that way gets different semantics: props arrive as plain values rather than
 * Cells, and children are built eagerly. The CSS a module produced is appended
 * the way the Vite plugin does in dev, since there is no bundler to emit it.
 */
export function compilerLoader(options: CompilerLoaderOptions = {}): CompilerLoader {
  const native = createRequire(import.meta.url)("@barqjs/compiler") as Native;
  return {
    name: "barq",
    setup(build) {
      const load = (args: { path: string }): Loaded => {
        const result = native.transform(readFileSync(args.path, "utf8"), {
          filename: args.path,
          ...options.transform,
        });
        if (result.warnings !== undefined && result.warnings.length > 0) {
          console.warn(`[barq] ${args.path}\n  ${result.warnings.join("\n  ")}`);
        }
        const css =
          result.css === undefined || result.css === ""
            ? ""
            : cssRegistration(args.path, result.css);
        return { contents: result.code + css, loader: args.path.endsWith(".tsx") ? "tsx" : "ts" };
      };
      build.onLoad({ filter: /\.tsx$/ }, load);
      if (options.ts !== undefined) build.onLoad({ filter: options.ts }, load);
    },
  };
}
