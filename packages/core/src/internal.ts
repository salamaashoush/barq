/**
 * `@barqjs/core/internal` — the runtime surface `@barqjs/server` needs and no
 * application does.
 *
 * The string backend is a second implementation of the same ABI, so it reaches
 * for the same collectors, the same scope operations and the same async session
 * the DOM backend does. None of that is application API, and exporting it from
 * the package index to move one package would have made it so permanently.
 *
 * Every name here is imported by `@barqjs/server`. Adding one that nothing there
 * imports makes this a second public surface by accident.
 */

export {
  REVEAL_COORD,
  createErrorCollector,
  createPendingCollector,
  createRevealCoordinator,
  outerRevealHandle,
} from "./boundaries.ts";
export type { RevealHandle } from "./boundaries.ts";

export { SSR_HTML_BRAND, styleToString } from "./dom.ts";

export { keyMode } from "./flow.ts";

export {
  ERROR_BOUNDARY,
  clearHydrationData,
  disposeScope,
  getHydrationData,
  provideOn,
  seedLater,
  setAsyncSession,
  settleStep,
  unclaimedSeeds,
} from "./signals.ts";

export { isObject } from "./type-utils.ts";
