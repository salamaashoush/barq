// FIRST. See `./register-dom.ts` for why the registration cannot live here.
import * as dom from "./register-dom.ts";

void dom;

import { plugin } from "bun";
import { compilerLoader } from "@barqjs/vite/internal";

/**
 * The icons are `.tsx`, so the suite runs them through the COMPILER.
 *
 * bun's `react-jsx` transform cannot produce scope-taking Blocks, and an icon
 * lowered that way builds its `<svg>` element by element on every render where
 * the compiler clones one template.
 *
 * Exported for a `Bun.build` of its own: a build inside a test does not inherit
 * the runner's loader, and this package publishes SOURCE.
 */
export const barqPlugin = compilerLoader();

plugin(barqPlugin);

import * as testing from "@barqjs/testing";

void testing;
