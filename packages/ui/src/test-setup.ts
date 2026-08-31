// FIRST. See `./register-dom.ts` for why the registration cannot live here.
import * as dom from "./register-dom.ts";

void dom;

import { cssRegistration } from "@barqjs/compiler/vite";
import { plugin } from "bun";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

/**
 * This package's own suite goes through the COMPILER, like every consumer does.
 *
 * Every `.tsx` goes through it, this package's and `@barqjs/aria`'s alike:
 * bun's own `react-jsx` transform cannot produce scope-taking Blocks, so a
 * component lowered that way gets DIFFERENT semantics — props arrive as plain
 * values rather than Cells, and children are built eagerly instead of lazily.
 *
 * `.ts` goes through it as well, which the other packages do not need: a `css`
 * block in a `.ts` module is a class name only once the compiler has folded it,
 * and a suite running the runtime fallback there would measure a path no built
 * application takes. That one is anchored on THIS package's `src`, because a
 * bare `\.ts$` would also claim `@barqjs/core`'s sources — which resolve to
 * `src` under bun and have no business going through a second transform.
 */
const require_ = createRequire(import.meta.url);
const native = require_("@barqjs/compiler-rs") as {
  transform(code: string, options?: Record<string, unknown>): { code: string; css?: string };
};

const ownTs = new RegExp(`^${import.meta.dir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/.*\\.ts$`);

/**
 * The same transform, for a `Bun.build` of its own.
 *
 * `plugin()` registers with the test runner's loader and a `Bun.build` inside a
 * test does not inherit it — so a suite that bundles this package would get raw
 * JSX. `tree-shaking.test.ts` is that suite, and it now bundles the SOURCE,
 * because source is what this package publishes.
 */
export const barqPlugin = {
  name: "barq",
  setup(build: {
    onLoad(
      filter: { filter: RegExp },
      load: (args: { path: string }) => { contents: string; loader: "ts" | "tsx" },
    ): void;
  }) {
    const load = (args: { path: string }) => {
      // `strictCss` here as well as in `tsdown.config.ts` and the gallery, or
      // the suite compiles this package's sources under different rules from
      // the build and a call that fails one passes the other.
      const result = native.transform(readFileSync(args.path, "utf8"), {
        filename: args.path,
        strictCss: true,
      });
      // The CSS a module produced has nowhere to go without a bundler, and
      // dropping it is how a suite ends up asserting on an empty stylesheet.
      // `cssRegistration` is the same two lines the Vite plugin appends in dev.
      const contents =
        result.css === undefined || result.css === ""
          ? result.code
          : result.code + cssRegistration(args.path, result.css);
      return { contents, loader: args.path.endsWith(".tsx") ? "tsx" : "ts" } as const;
    };

    build.onLoad({ filter: /\.tsx$/ }, load);
    build.onLoad({ filter: ownTs }, load);
  },
};

plugin(barqPlugin);

import * as testing from "@barqjs/testing";

void testing;
