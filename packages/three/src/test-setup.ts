// FIRST. See `./test-dom.ts` for why the registration cannot live here.
import * as dom from "./test-dom.ts";

void dom;

import { readFileSync } from "node:fs";
import { plugin } from "bun";
import { afterEach } from "bun:test";
import { resetErrorHalt } from "@barqjs/core";
import { compilerLoader } from "@barqjs/vite/internal";
import * as THREE from "three";

import { catalogueTags } from "./intrinsics.ts";

interface Manifest {
  name: string;
  barq: {
    boundaries: { name: string; target: string; moduleSource: string }[];
    intrinsics: { claimUnknown?: boolean; target: string; moduleSource: string }[];
  };
}

const manifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as Manifest;

/**
 * Every `.tsx` goes through the compiler with what `@barqjs/vite` discovers
 * in this package's `package.json`: `<Canvas>`'s children and every tree of
 * three's tags compile for this renderer, the rest for the document. The tags
 * are the catalogue's, as the build writes them. A `*.scene.tsx` fixture takes
 * the configured path instead, a file given to the renderer by name.
 *
 * Exported for a `Bun.build` inside a test, which does not inherit the
 * runner's loader.
 */
export const barqPlugin: ReturnType<typeof compilerLoader> = compilerLoader({
  transform: {
    boundaries: manifest.barq.boundaries.map((entry) => ({ source: manifest.name, ...entry })),
    intrinsics: manifest.barq.intrinsics.map((entry) => ({
      ...entry,
      tags: catalogueTags(THREE),
    })),
    renderers: [
      { include: ["*.scene.tsx"], target: "universal", moduleSource: "@barqjs/three/renderer" },
    ],
  },
});

plugin(barqPlugin);

// An error nothing catches halts the engine for good; a test that provokes one
// has already asserted on it, and the next test must not inherit the halt.
globalThis.reportError = () => {};
afterEach(() => {
  resetErrorHalt();
});
