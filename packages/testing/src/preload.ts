import { GlobalRegistrator } from "@happy-dom/global-registrator";

// Must register before any other imports that might use DOM
GlobalRegistrator.register();

import { plugin } from "bun";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

/**
 * This package's own suite goes through the COMPILER, like every consumer does.
 *
 * It used to rely on bun's `react-jsx` transform, which lowers JSX onto
 * `jsx`/`jsxs` from `@barqjs/core/jsx-runtime`. Those are gone, and the reason
 * is not tidiness: bun's transform cannot produce scope-taking
 * Blocks, so a module lowered that way gets DIFFERENT semantics — props arrive
 * as plain values rather than Cells, and children are built eagerly instead of
 * being Blocks. This file's own components carried a comment saying exactly
 * that, which means the suite was measuring a path no consumer takes.
 *
 * One `onLoad` hook fixes it: `.tsx` under `src/` is handed to the native
 * transform first, so what these tests drive is what a user's build produces.
 */
const require_ = createRequire(import.meta.url);
const native = require_("@barqjs/compiler-rs") as {
  transform(code: string, options?: Record<string, unknown>): { code: string };
};

plugin({
  name: "barq",
  setup(build) {
    build.onLoad({ filter: /\.tsx$/ }, (args) => ({
      contents: native.transform(readFileSync(args.path, "utf8"), { filename: args.path }).code,
      loader: "tsx",
    }));
  },
});

/**
 * NO `afterEach(cleanup)` HERE. `./index.ts` registers it, and importing that
 * module IS the effect.
 *
 * It has to happen in the PRELOAD rather than being left to each test file,
 * because bun shares one module registry across a run: the hook is registered
 * when `./index.ts` first evaluates, which attaches it to whichever test file
 * happened to import it first, and every other file in the run then has no
 * hook. Jest and vitest give each file a fresh registry, so React Testing
 * Library never had to say this.
 *
 * `import * as` with a `void` rather than a bare side-effect import only
 * because the lint rule cannot tell a deliberate one from a leftover — the same
 * reason `packages/start/test/build-fixture/src/entry-server.ts` spells it this
 * way.
 */
import * as testing from "./index.ts";

void testing;
