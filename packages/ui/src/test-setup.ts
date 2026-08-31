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

plugin({
  name: "barq",
  setup(build) {
    const load = (args: { path: string }) => {
      const result = native.transform(readFileSync(args.path, "utf8"), { filename: args.path });
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
});

import * as testing from "@barqjs/testing";

void testing;
