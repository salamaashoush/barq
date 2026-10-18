import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { flush, type JSXElement } from "@barqjs/core";
import { createRoot, type RootState } from "@barqjs/three";
import * as THREE from "three";

const require_ = createRequire(import.meta.url);
const native = require_("@barqjs/compiler") as {
  transform(
    code: string,
    options: Record<string, unknown>,
  ): { code: string; diagnostics: unknown[]; warnings: string[] };
};

const snippets = fileURLToPath(new URL("./snippets/three/", import.meta.url));
const threePackage = fileURLToPath(new URL("../../../../three/", import.meta.url));
// Under the site's own node_modules so the compiled modules resolve the
// packages as the site does, and outside `src`, where the suite's loader would
// compile them again for the document.
const out = fileURLToPath(
  new URL(`../../../node_modules/.guides-three-${process.pid}/`, import.meta.url),
);

afterAll(() => rmSync(out, { recursive: true, force: true }));

interface Manifest {
  name: string;
  barq: {
    boundaries: { name: string; target: string; moduleSource: string }[];
    intrinsics: { tags: string; claimUnknown?: boolean; target: string; moduleSource: string }[];
  };
}

/** What `@barqjs/vite` reads from the package: its boundary and its tags. */
function discovered(): Record<string, unknown> {
  const manifest = JSON.parse(readFileSync(join(threePackage, "package.json"), "utf8")) as Manifest;
  const built = manifest.barq.intrinsics.every((entry) =>
    existsSync(join(threePackage, entry.tags)),
  );
  if (!built) {
    const build = Bun.spawnSync(["bun", "run", "build"], { cwd: threePackage });
    if (build.exitCode !== 0) throw new Error(build.stderr.toString());
  }
  return {
    boundaries: manifest.barq.boundaries.map((entry) => ({ source: manifest.name, ...entry })),
    intrinsics: manifest.barq.intrinsics.map((entry) => ({
      ...entry,
      tags: JSON.parse(readFileSync(join(threePackage, entry.tags), "utf8")) as string[],
    })),
  };
}

function compile(name: string): string {
  const filename = join(snippets, name);
  const compiled = native.transform(readFileSync(filename, "utf8"), { filename, ...discovered() });
  expect(compiled.diagnostics).toEqual([]);
  expect(compiled.warnings).toEqual([]);
  return compiled.code;
}

interface SceneModule {
  default: (props: { x: () => number }) => JSXElement;
}

const fakeRenderer = () => ({
  domElement: document.createElement("canvas"),
  render() {},
  setSize() {},
  setPixelRatio() {},
});

test("the page on the three.js guide compiles its canvas's children for the scene", () => {
  const code = compile("app.tsx");
  expect(code).toMatch(/createElement\$\d+\("ambientLight"\)/);
  expect(code).toMatch(/from "@barqjs\/three\/renderer"/);
  expect(code).toContain("<main><h1>");
});

test("the scene on the three.js guide renders through @barqjs/three and answers the pointer", async () => {
  mkdirSync(out, { recursive: true });
  const file = join(out, "scene.ts");
  writeFileSync(file, compile("scene.tsx"));
  const scene = (await import(file)) as SceneModule;

  const root = createRoot(document.createElement("canvas"));
  root.configure({ gl: fakeRenderer(), size: { width: 400, height: 300, top: 0, left: 0 } });
  const state: RootState = root.render(() => scene.default({ x: () => 1.2 }));
  flush();

  const box = state.scene.children[0] as THREE.Mesh;
  const material = box.material as THREE.MeshStandardMaterial;
  expect(box.position.x).toBe(1.2);
  expect(box.geometry).toBeInstanceOf(THREE.BoxGeometry);
  expect(material.color.getHexString()).toBe(new THREE.Color("orange").getHexString());

  // A ray straight through the box, in place of a pointer over the canvas.
  state.setEvents({
    compute: (_event, at) => {
      at.raycaster.set(new THREE.Vector3(1.2, 0, 10), new THREE.Vector3(0, 0, -1));
    },
  });
  state.scene.updateMatrixWorld(true);
  state.events.handlers!.onPointerMove({ offsetX: 0, offsetY: 0, pointerId: 1 } as never);
  flush();
  expect(material.color.getHexString()).toBe(new THREE.Color("hotpink").getHexString());

  root.unmount();
  expect(state.scene.children).toHaveLength(0);
});
