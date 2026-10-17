/**
 * happy-dom globals, then the barq compiler as a `bun test` loader.
 *
 * A `.tsx` test has to be COMPILED like any other consumer. Left to bun's own
 * `react-jsx` transform it reaches the runtime through a second implementation
 * of component invocation, so the suite sees the declaration half and never the
 * invocation half.
 */

import { GlobalRegistrator } from "@happy-dom/global-registrator";

// A real origin, so `history.pushState` and `window.location` behave. The
// default is `about:blank`, where `location.pathname` reads "blank".
GlobalRegistrator.register({ url: "http://localhost/" });

import { followAsync, resetErrorHalt } from "@barqjs/core";
import { afterEach } from "bun:test";

// Tests await loaders with `settle`, so async memos are followed here the way a
// server render follows its own.
followAsync(true);

// An error nothing catches halts the reactive engine for good and is handed to
// `reportError`. A test that provokes one has already asserted on it: the halt
// must not reach the next test, and the report must not fail the run.
globalThis.reportError = () => {};
afterEach(() => {
  resetErrorHalt();
});

import { plugin } from "bun";
import { compilerLoader } from "@barqjs/vite/internal";

plugin(compilerLoader({ transform: { dev: true } }));
