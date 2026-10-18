/**
 * `@barqjs/core/internal` — the runtime surface a renderer and the server
 * backend need and no application does.
 *
 * A renderer places nodes and core decides when: control flow is written once
 * here over a `RangeHost`, the hydration session and its cursors are core's,
 * and the engine's scope operations are what every backend builds under. None
 * of that is application API, and exporting it from the package index would
 * have made it so permanently.
 *
 * Every name here is imported by `@barqjs/web`, `@barqjs/universal`,
 * `@barqjs/server` or `@barqjs/start`. Adding one that none of them imports
 * makes this a second public surface by accident.
 */

export {
  CONTEXT_MISS,
  ERROR_BOUNDARY,
  OWNERSHIP,
  clearHydrationData,
  currentRenderSession,
  diagnosticsEnabled,
  disposeScope,
  effectUnder,
  emitDiagnostic,
  mountTree,
  getHydrationData,
  installClaimEffect,
  internalMemo,
  jsxAsValue,
  lookupContext,
  provideOn,
  renderEffect,
  SEED_ABANDONED,
  abandonPendingSeeds,
  deferredFlightsOf,
  pendingSeedsOf,
  serverRendering,
  setAsyncSession,
  setHydratable,
  settleStep,
  thrownBy,
  unclaimedSeeds,
  underScope,
} from "./signals.ts";

// Control flow over a host. A renderer passes its `RangeHost` to each
// construct, and its `SyncRows` beside it to `eachIn`.
export {
  HOST,
  LIVE_EDGES,
  LIVE_ROWS,
  NOTHING,
  activate,
  boundaryIn,
  branchIn,
  cellSlot,
  eachIn,
  isNodes,
  islandIn,
  keyMode,
  longestIncreasingSubsequence,
  nextActivation,
  offerDefaultHost,
  provideDefaultHost,
  provideHost,
  revealIn,
  setDefaultHost,
  standingRow,
  standingRows,
  teardown,
  type Renderer,
  type RangeHost,
  type Row,
  type Site,
  type SyncRows,
} from "./flow.ts";

export { callSlot } from "./components.ts";

// The hydration session. The claim walk is the renderer's, installed through
// `installClaimWalk`; the session, the report and the cursors are core's, so
// control flow claims through them without knowing what a node is.
export {
  HydrationMismatch,
  abandonedClaim,
  adopted,
  atCursor,
  built,
  claimingTemplate,
  drainHydrationEnd,
  hydrating,
  hydrationSession,
  inDocumentOrder,
  installClaimWalk,
  mismatchIn,
  noSession,
  onHydrationEnd,
  report,
  setHydrationSession,
  usualCauses,
  wireIsMarked,
  withoutClaim,
  type ClaimWalk,
  type Cursor,
  type HydrationReport,
  type Mismatch,
  type MismatchKind,
  type Range,
  type Session,
} from "./hydration-state.ts";

export { reportModule, setModuleSink, type ModuleSink } from "./module-sink.ts";

export { SharedSources, shareSources, unshareSources } from "./shared-sources.ts";

export type { AsDeclared, DeclaredCallSite } from "./config.ts";

export {
  isBoolean,
  isNullish,
  isObject,
  isRefCallback,
  isSignalGetter,
  isString,
  setProperty,
} from "./type-utils.ts";
