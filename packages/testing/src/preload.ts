// FIRST. See `./register-dom.ts` for why the registration cannot live here, and
// `./index.ts` at the bottom of this file for why the import is spelled this way.
import * as dom from "./register-dom.ts";

void dom;

import { plugin } from "bun";
import { compilerLoader } from "@barqjs/vite/internal";

plugin(compilerLoader());

/**
 * NO `afterEach(cleanup)` HERE. `./index.ts` registers it, and importing that
 * module IS the effect.
 *
 * It has to happen in the PRELOAD rather than being left to each test file,
 * because bun shares one module registry across a run: the hook is registered
 * when `./index.ts` first evaluates, which attaches it to whichever test file
 * happened to import it first, and every other file in the run then has no
 * hook. Jest and vitest give each file a fresh registry, so React Testing
 * Library never had to say this.
 *
 * `import * as` with a `void` rather than a bare side-effect import only
 * because the lint rule cannot tell a deliberate one from a leftover — the same
 * reason `packages/start/test/build-fixture/src/entry-server.ts` spells it this
 * way.
 */
import * as testing from "./index.ts";

void testing;
