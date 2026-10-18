// FIRST. See `./test-dom.ts` for why the registration cannot live here.
import * as dom from "./test-dom.ts";

void dom;

import { plugin } from "bun";
import { afterEach } from "bun:test";
import { resetErrorHalt } from "@barqjs/core";
import { compilerLoader } from "@barqjs/vite/internal";

/**
 * Every `.tsx` goes through the compiler, as an application's would: a
 * `*.scene.tsx` fixture for this renderer, any other file for the document.
 * Exported for a `Bun.build` inside a test, which does not inherit the
 * runner's loader.
 */
export const barqPlugin: ReturnType<typeof compilerLoader> = compilerLoader({
  transform: {
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
