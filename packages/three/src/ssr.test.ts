/**
 * `<Canvas>` on the server and in a page hydrating what the server wrote.
 *
 * Canvas is compiled with the page, once for each backend, so this compiles
 * `canvas.tsx` twice with the real compiler, as the application's build does.
 * The server calls it with every prop but `children`: it writes a `<div>` and
 * a `<canvas>` and builds nothing of three. The client claims that markup and
 * mounts the scene from the canvas's `ref`.
 */

import { afterAll, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import { block, flush, type JSXElement } from "@barqjs/core";
import { renderAndHydrate } from "@barqjs/testing";

import { Box } from "./fixtures/basic.scene.tsx";
import type { RootState } from "./store.ts";
import { fakeRenderer, manualFrames } from "./test-utils.ts";

const require_ = createRequire(import.meta.url);
const native = require_("@barqjs/compiler") as {
  transform(code: string, options?: Record<string, unknown>): { code: string };
};

const SRC = new URL(".", import.meta.url).pathname.replace(/\/$/, "");
const OUT = join(SRC, "..", "node_modules", `.barq-ssr-${process.pid}`);
const CORE = new URL("../node_modules/@barqjs/core/src/index.ts", import.meta.url).pathname;
const WEB = new URL("../node_modules/@barqjs/web/src/index.ts", import.meta.url).pathname;
const SERVER = new URL("../node_modules/@barqjs/server/src/index.ts", import.meta.url).pathname;

mkdirSync(OUT, { recursive: true });
afterAll(() => rmSync(OUT, { recursive: true, force: true }));

type CanvasModule = { Canvas: (props: Record<string, unknown>) => JSXElement };

/** `canvas.tsx` for one backend, its relative imports pointed back at the source. */
async function compileCanvas(ssr: boolean): Promise<CanvasModule> {
  const source = readFileSync(join(SRC, "canvas.tsx"), "utf8");
  const compiled = native.transform(source, {
    filename: join(SRC, "canvas.tsx"),
    moduleSource: WEB,
    coreSource: CORE,
    serverSource: SERVER,
    ssr,
  }).code;
  const file = join(OUT, ssr ? "canvas-server.ts" : "canvas-client.ts");
  writeFileSync(file, compiled.replaceAll('from "./', `from "${SRC}/`));
  return (await import(file)) as CanvasModule;
}

test("the server writes the canvas's markup, and the client claims it and mounts the scene", async () => {
  const server = await compileCanvas(true);
  const client = await compileCanvas(false);
  const frames = manualFrames();
  let state: RootState | null = null;
  const common = { class: () => "stage", dpr: () => 1 };

  const result = renderAndHydrate({
    server: () => server.Canvas(common),
    client: () =>
      client.Canvas({
        ...common,
        gl: () => (defaults: { canvas: HTMLCanvasElement }) => fakeRenderer(defaults.canvas),
        onCreated: () => (created: RootState) => {
          state = created;
        },
        children: block(() => Box()),
      }),
  });
  flush();

  expect(result.html).toContain('<div class="stage"');
  expect(result.html).toContain("<canvas");
  expect(result.recovered).toBe(false);
  expect(result.mismatches).toEqual([]);
  expect(result.claimed).toBeGreaterThan(0);
  const canvas = result.container.querySelector("canvas")!;
  expect(state).not.toBe(null);
  expect(state!.gl.domElement).toBe(canvas);
  expect(state!.scene.getObjectByName("box")).toBeDefined();
  result.unmount();
  frames.restore();
});
