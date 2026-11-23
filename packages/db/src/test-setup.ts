/**
 * happy-dom globals, then the barq compiler as a `bun test` loader.
 *
 * The runtime's own timers are put back over happy-dom's: TanStack DB calls
 * `unref()` on the handle a collection's garbage-collection timer returns,
 * which happy-dom's timer objects do not have, so every collection cleanup
 * would throw.
 */

import { GlobalRegistrator } from "@happy-dom/global-registrator";

const timers = {
  setTimeout: globalThis.setTimeout,
  clearTimeout: globalThis.clearTimeout,
  setInterval: globalThis.setInterval,
  clearInterval: globalThis.clearInterval,
};

GlobalRegistrator.register();
Object.assign(globalThis, timers);

import { plugin } from "bun";
import { compilerLoader } from "@barqjs/vite/internal";

plugin(compilerLoader({ transform: { dev: true } }));
