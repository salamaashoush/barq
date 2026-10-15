// FIRST. See `./register-dom.ts` for why the registration cannot live here.
import * as dom from "./register-dom.ts";

void dom;

import { cssRegistration } from "@barqjs/compiler/vite";
import { plugin } from "bun";
import { createRequire } from "node:module";
import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The blocks go through the COMPILER, with the options `vite.config.ts` gives
 * it, so the suite measures the lowering the site ships.
 *
 * `.ts` is anchored on THIS package's `src`: a `css` block in `layout.ts` is a
 * class name only once the compiler has folded it, and a bare `\.ts$` would
 * also claim `@barqjs/core`'s sources, which resolve to `src` under bun and
 * have no business going through a second transform.
 */
const require_ = createRequire(import.meta.url);
const native = require_("@barqjs/compiler-rs") as {
  transform(code: string, options?: Record<string, unknown>): { code: string; css?: string };
};

const source = fileURLToPath(new URL("..", import.meta.url));
const ownTs = new RegExp(`^${source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.*\\.ts$`);

type Loaded = { contents: string; loader: "ts" | "tsx" };

type Raw = { contents: string; loader: "js" };

interface Build {
  onLoad(filter: { filter: RegExp }, load: (args: { path: string }) => Loaded): void;
  onLoad(
    filter: { filter: RegExp; namespace: string },
    load: (args: { path: string }) => Raw,
  ): void;
  onResolve(
    filter: { filter: RegExp },
    resolve: (args: { path: string; importer: string }) => { path: string; namespace: string },
  ): void;
}

/**
 * `import.meta.glob`, which Vite expands at build time and bun does not have.
 *
 * The keys are the files that exist, so a lookup that misses under Vite misses
 * here. A loader resolves without importing: the suite has no stylesheet
 * pipeline, and what the site globs is stylesheets.
 */
function expandGlobs(code: string, importer: string): string {
  return code.replace(/import\.meta\.glob\("([^"]+)"\)/g, (_call, pattern: string) => {
    const directory = dirname(pattern);
    const names = new Bun.Glob(basename(pattern));
    const entries = readdirSync(resolve(dirname(importer), directory))
      .filter((name) => names.match(name))
      .toSorted()
      .map((name) => `${JSON.stringify(`${directory}/${name}`)}: () => Promise.resolve({})`);
    return `({ ${entries.join(", ")} })`;
  });
}

/**
 * One source, lowered for the DOM or for the string backend.
 *
 * `plugin()` registers with the test runner's loader and a `Bun.build` inside
 * a test does not inherit it, so the hydration harness builds its two halves
 * with this and the suite's own loader is the DOM one.
 */
export function barqPlugin(options: { ssr?: boolean; hydratable?: boolean; every?: boolean }) {
  return {
    name: options.ssr === true ? "barq-ssr" : "barq-dom",
    setup(build: Build) {
      const load = (args: { path: string }): Loaded => {
        const result = native.transform(expandGlobs(readFileSync(args.path, "utf8"), args.path), {
          filename: args.path,
          strictCss: true,
          ...(options.ssr === true ? { ssr: true } : {}),
          ...(options.hydratable === true ? { hydratable: true } : {}),
        });
        // The CSS a module produced has nowhere to go without a bundler, and
        // dropping it is how a suite ends up asserting on an empty stylesheet.
        const contents =
          result.css === undefined || result.css === ""
            ? result.code
            : result.code + cssRegistration(args.path, result.css);
        return { contents, loader: args.path.endsWith(".tsx") ? "tsx" : "ts" };
      };

      // `./example.tsx?raw` is the file's text, as it is under Vite: a demo's
      // code panel shows the module it runs. The resolved path carries a
      // suffix of its own because a bundle keys a module by its path alone,
      // and the text would otherwise be answered with the compiled module.
      build.onResolve({ filter: /\?raw$/ }, (args) => ({
        path: `${resolve(dirname(args.importer), args.path.slice(0, -"?raw".length))}.raw`,
        namespace: "raw",
      }));
      build.onLoad({ filter: /\.raw$/, namespace: "raw" }, (args) => ({
        contents: `export default ${JSON.stringify(readFileSync(args.path.slice(0, -".raw".length), "utf8"))};`,
        loader: "js",
      }));

      build.onLoad({ filter: /\.tsx$/ }, load);
      build.onLoad({ filter: options.every === true ? /\.ts$/ : ownTs }, load);
    },
  };
}

plugin(barqPlugin({}));

import * as testing from "@barqjs/testing";

void testing;

import { afterEach } from "bun:test";
import { resetErrorHalt } from "@barqjs/core";

// An error nothing catches halts the reactive engine for good. The test that
// provoked it has failed on its own account; the halt must not fail the next.
afterEach(() => {
  resetErrorHalt();
});
