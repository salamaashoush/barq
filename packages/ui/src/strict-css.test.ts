/**
 * Every style call in this package folds at compile time.
 *
 * An application that requires static extraction (`strictCss`) compiles these
 * sources itself, and a call the compiler cannot fold is an error there: a
 * spread into a style object, a spread argument, a key computed from a value.
 * The suite's own loader sets the same flag and only reads the code back, so a
 * call left to the runtime renders correctly here and breaks a consumer's
 * build.
 */

import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { Glob } from "bun";

const require_ = createRequire(import.meta.url);
const native = require_("@barqjs/compiler") as {
  transform(code: string, options?: Record<string, unknown>): { warnings?: readonly string[] };
};

function unfolded(root: string): string[] {
  const found: string[] = [];
  for (const path of new Glob("**/*.{ts,tsx}").scanSync({ cwd: root, absolute: true })) {
    if (path.includes(".test.") || path.endsWith(".d.ts")) continue;
    const { warnings } = native.transform(readFileSync(path, "utf8"), {
      filename: path,
      hydratable: true,
      strictCss: true,
    });
    for (const warning of warnings ?? []) {
      if (!warning.includes("BARQ017")) continue;
      found.push(warning.slice(warning.indexOf("/src/") + 1, warning.indexOf(": BARQ017")));
    }
  }
  return found.toSorted();
}

test("no style call in @barqjs/ui is left to the runtime", () => {
  expect(unfolded(new URL("./", import.meta.url).pathname)).toEqual([]);
});

test("no style call in @barqjs/aria is left to the runtime", () => {
  expect(unfolded(new URL("../../aria/src/", import.meta.url).pathname)).toEqual([]);
});
