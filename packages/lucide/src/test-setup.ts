// FIRST. See `./register-dom.ts` for why the registration cannot live here.
import * as dom from "./register-dom.ts";

void dom;

import { plugin } from "bun";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

/**
 * The icons are `.tsx`, so the suite runs them through the COMPILER.
 *
 * bun's `react-jsx` transform cannot produce scope-taking Blocks, and an icon
 * lowered that way builds its `<svg>` element by element on every render where
 * the compiler clones one template.
 */
const require_ = createRequire(import.meta.url);
const native = require_("@barqjs/compiler-rs") as {
  transform(code: string, options?: Record<string, unknown>): { code: string };
};

plugin({
  name: "barq",
  setup(build) {
    build.onLoad({ filter: /\.tsx$/ }, (args) => {
      const result = native.transform(readFileSync(args.path, "utf8"), { filename: args.path });
      return { contents: result.code, loader: "tsx" };
    });
  },
});

import * as testing from "@barqjs/testing";

void testing;
