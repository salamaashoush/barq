// FIRST. See `./register-dom.ts` for why the registration cannot live here.
import * as dom from "./register-dom.ts";

void dom;

import { plugin } from "bun";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

/**
 * This package's own suite goes through the COMPILER, like every consumer does.
 *
 * bun's `react-jsx` transform cannot produce scope-taking Blocks, so a module
 * lowered that way gets DIFFERENT semantics: props arrive as plain values
 * rather than Cells, and children are built eagerly instead of lazily. A suite
 * driving that path measures a path no consumer takes.
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
