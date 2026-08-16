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
 * `jsx`/`jsxs` from `@barqjs/core/jsx-runtime`. M9 deleted those (CODESIGN §4.1)
 * and the reason is not tidiness: bun's transform cannot produce scope-taking
 * Blocks, so a module lowered that way gets DIFFERENT semantics — props arrive
 * as plain values rather than Cells, and children are built eagerly instead of
 * being Blocks. This file's own components carried a comment saying exactly
 * that, which means the suite was measuring a path §11 Q2 says does not exist.
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

import { afterEach } from "bun:test";
import { cleanup } from "./index.ts";

// Auto-cleanup after each test
afterEach(() => {
  cleanup();
});
