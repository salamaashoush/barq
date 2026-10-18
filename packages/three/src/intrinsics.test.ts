import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import * as THREE from "three";

import { resolveConstructor } from "./catalogue.ts";
import { catalogueTags } from "./intrinsics.ts";

const PACKAGE = join(import.meta.dir, "..");

test("every catalogue tag names a class the renderer builds", () => {
  const tags = catalogueTags(THREE);
  expect(tags).toContain("mesh");
  expect(tags).toContain("boxGeometry");
  expect(tags).toContain("primitive");
  expect(tags).toContain("threeLine");
  expect(tags).not.toContain("mathUtils");
  for (const tag of tags) {
    if (tag === "primitive") continue;
    expect(resolveConstructor(tag), tag).not.toBe(null);
  }
});

test("the names three shares with the document are the four the web namespace leaves to it", () => {
  const require_ = createRequire(join(PACKAGE, "package.json"));
  const runtime = require_
    .resolve("@barqjs/web/jsx-runtime")
    .replace(/dist\/jsx-runtime\.js$/, "src/jsx-runtime.ts");
  const source = readFileSync(runtime, "utf8");
  const start = source.indexOf("export interface IntrinsicElements {");
  const body = source.slice(start, source.indexOf("\n  }", start));
  const documentTags = new Set(
    [...body.matchAll(/^\s+"?([a-zA-Z][\w-]*)"?\??:/gm)].map((m) => m[1]),
  );
  expect(documentTags.has("div")).toBe(true);
  expect(documentTags.has("circle")).toBe(true);
  const clashes = catalogueTags(THREE as unknown as Record<string, unknown>).filter((tag) =>
    documentTags.has(tag),
  );
  expect(clashes.toSorted()).toEqual(["audio", "line", "path", "source"]);
});

test("the build writes the catalogue's tags to dist/intrinsics.json", () => {
  const built = spawnSync("bun", ["run", "tools/intrinsics.ts"], {
    cwd: PACKAGE,
    encoding: "utf8",
  });
  expect(built.status).toBe(0);
  const written = JSON.parse(
    readFileSync(join(PACKAGE, "dist", "intrinsics.json"), "utf8"),
  ) as string[];
  expect(written).toEqual(catalogueTags(THREE as unknown as Record<string, unknown>));
});
