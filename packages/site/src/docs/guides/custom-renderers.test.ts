import { afterAll, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { flush, type JSXElement } from "@barqjs/core";

import { SceneNode, render } from "./snippets/custom-renderers/renderer.ts";

const native = createRequire(import.meta.url)("@barqjs/compiler") as {
  transform(
    code: string,
    options: Record<string, unknown>,
  ): { code: string; diagnostics: unknown[] };
};

const snippets = fileURLToPath(new URL("./snippets/custom-renderers/", import.meta.url));
// Under the site's own node_modules so the compiled module resolves `@barqjs/core`
// as the site does, and outside `src`, where the suite's loader would compile it
// again for the document.
const out = fileURLToPath(
  new URL(`../../../node_modules/.guides-${process.pid}/`, import.meta.url),
);

afterAll(() => rmSync(out, { recursive: true, force: true }));

interface SceneModule {
  default: () => JSXElement;
  setPlayers: (names: string[]) => void;
  setPaused: (paused: boolean) => void;
}

test("the scene on the custom renderers page renders on its in-memory host and follows its signals", async () => {
  const filename = join(snippets, "scene.tsx");
  const compiled = native.transform(readFileSync(filename, "utf8"), {
    filename,
    target: "universal",
    moduleSource: join(snippets, "renderer.ts"),
  });
  expect(compiled.diagnostics).toEqual([]);
  mkdirSync(out, { recursive: true });
  const file = join(out, "scene.ts");
  writeFileSync(file, compiled.code);
  const scene = (await import(file)) as SceneModule;

  const root = new SceneNode("root");
  const dispose = render(scene.default, root);
  expect(String(root)).toBe(
    '<root><stage><sprite name="salama"></sprite><sprite name="acme"></sprite></stage></root>',
  );

  scene.setPaused(true);
  scene.setPlayers(["acme", "salama", "example.com"]);
  flush();
  expect(String(root)).toBe(
    '<root><stage><label text="paused"></label><sprite name="acme"></sprite>' +
      '<sprite name="salama"></sprite><sprite name="example.com"></sprite></stage></root>',
  );

  dispose();
  expect(String(root)).toBe("<root></root>");
});
