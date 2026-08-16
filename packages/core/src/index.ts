/**
 * Barq - Tiny JSX renderer with fine-grained reactivity via signals
 *
 * Core: signals, JSX/DOM rendering, components, async resources, stores
 * For CSS-in-JS and utility hooks, see @barqjs/extra
 */

// Core reactivity - primitives
export {
  signal,
  linked,
  computed,
  effect,
  renderEffect,
  batch,
  untrack,
  createScope,
  onCleanup,
  onMount,
  onSettled,
  createContext,
  getContext,
  useContext,
  setContext,
  hasContext,
  flush,
  getOwner,
  runWithOwner,
  // Async helpers
  isPending,
  latest,
  refresh,
  settle,
  setAsyncSession,
  // Boundary context keys (used by Loading/Errored components)
  LOADING_BOUNDARY,
  ERROR_BOUNDARY,
  // Dev diagnostics
  DEV,
  // Error classes
  NoOwnerError,
  ContextNotFoundError,
  NotReadyError,
  ScopeMissingError,
} from "./signals.ts";
export type { LoadingBoundaryHandle, DiagnosticEvent } from "./signals.ts";

// Solid 2.0 parity primitives
export {
  createOwner,
  createReaction,
  createTrackedEffect,
  getNextChildId,
  getObserver,
  isDisposed,
  isEqual,
  peekNextChildId,
  scopeAllocations,
  effectAllocations,
  resetChildIds,
  unclaimedSeeds,
  resolve,
  enableExternalSource,
  resetExternalSource,
  markInMotion,
  setSnapshotCapture,
  markSnapshotScope,
  releaseSnapshotScope,
  clearSnapshots,
  SUPPORTS_PROXY,
} from "./signals.ts";
export type { ExternalSource, ExternalSourceConfig, ExternalSourceFactory } from "./signals.ts";

// createRoot: detached scope for SolidJS compatibility
import { createScope as _createScope } from "./signals.ts";
export function createRoot<T>(fn: (dispose: () => void) => T): T {
  return _createScope(fn, true);
}

export type { SignalOptions, Owner, ContextRecord } from "./signals.ts";

// Scope — the ownership spine (SEMANTICS.md §2, CODESIGN.md §3.1/§3.3)
export {
  enter,
  exit,
  pin,
  dispose,
  enterRoot,
  abortSignal,
  ownRange,
  provide,
  install,
  read,
  stack,
  requireScope,
} from "./scope.ts";

/**
 * §3.0 rule 2's Cell-slot read, exported because a runtime library written on
 * this ABI — `packages/extra`'s router is the first — has the same slots the
 * compiled path has and must refuse a Block in one the same way.
 */
export { readSlot } from "./signals.ts";
export type { Block, Boundary, Cell, Scope, Slot } from "./scope.ts";

// The props model — CODESIGN §3.0/§3.3. `props` and `cell` are the two
// carriers the compiler emits; the four helpers are views over the same
// source list and copy nothing (§4.1).
export {
  props,
  cell,
  block,
  isBlock,
  BLOCK,
  mergeProps,
  merge,
  omit,
  splitProps,
  SOURCES,
} from "./props.ts";
export type { Source } from "./props.ts";

// Types
export type { Signal, Computed, Context } from "./signals.ts";
export type { Resource, ResourceInfo, ResourceOptions, ResourceStatus } from "./async.ts";
export type { Store } from "./store.ts";

// Type configuration - for compiler mode opt-in
export type {
  BarqConfig,
  IsCompilerMode,
  StrictAccessor,
  StrictArrayAccessor,
  StrictChild,
} from "./config.ts";

// Store - fine-grained nested reactivity
export {
  store,
  produce,
  reconcile,
  unwrap,
  snapshot,
  createProjection,
  deep,
  isWrappable,
  storePath,
  $PROXY,
  $TARGET,
  $TRACK,
} from "./store.ts";
export type { Part, StorePathRange } from "./store.ts";

// Actions & optimistic updates
export { action, affects, commit, createOptimistic, createOptimisticStore } from "./actions.ts";

// Server-side rendering
export {
  renderToString,
  renderToStringAsync,
  renderPage,
  generateHydrationScript,
  getRenderData,
  clearRenderData,
} from "./server.ts";

// Core hooks
export {
  createErrorBoundary,
  createLoadingBoundary,
  createRevealOrder,
  enforceLoadingBoundary,
  flatten,
  hasEscapedError,
  resetErrorHalt,
} from "./boundaries.ts";
export type { RevealDisplay, RevealOrder } from "./boundaries.ts";

export { mapArray, repeat } from "./map.ts";
export type { Maybe } from "./map.ts";

// Async data loading — CODESIGN §3.8's one resource. `resource` is the
// hook-shaped alias and nothing more.
export { resource } from "./async.ts";

// Claim-based hydration (`CODESIGN.md` §3.11, `SEMANTICS.md` H1–H4, H6). The
// two walk helpers are emitted ONLY by a `hydratable` compile — H3's "the index
// must cost nothing on the client-render path" is the diff between the two
// emissions, and with the flag off neither name appears in a module.
export {
  child,
  sib,
  hole,
  HydrationMismatch,
  type HydrationReport,
  type Mismatch,
  type MismatchKind,
} from "./hydration.ts";

// DOM
export {
  createElement,
  dyn,
  element,
  render,
  hydrate,
  useRef,
  template,
  insert,
  setProp,
  // CODESIGN §3.5's resolved channels. The compiler picks one at compile time
  // from `NameFlags` plus the namespace, so no name is classified at run time.
  setAttr,
  setDomProp,
  setLive,
  setBool,
  setClass,
  setStyle,
  setStyleProp,
  setClassList,
  setHtml,
  setRef,
  bindProp,
  bindEffect,
  bindValue,
  bindEvent,
  bindChannelOf,
  ref,
  listen,
  delegate,
  spread,
  delegateEvents,
  clearDelegatedEvents,
  classToString,
  styleToString,
  type Channel,
  // The SSR string backend's brand. It is read on the CLIENT too: a module that
  // fell back to this backend renders a string-compiled component's markup
  // through it (DESIGN §5).
  isSsrHtml,
  type Child,
  type Props,
  type Component,
  type JSXElement,
  type Element,
  type ArrayElement,
} from "./dom.ts";

// CODESIGN §3.10's two halves, exported because they are a CHANNEL and not an
// internal: `setLive` and every author-written directive that touches a
// user-mutable property need the same compare and the same caret restore, and a
// second implementation of either is how the two would drift.
export { writeLive, coerceLive, holdsLive, captureCaret, restoreCaret } from "./forms.ts";

// The four control-flow primitives — CODESIGN §3.4, SEMANTICS K and E.
// Everything under `Components` below is an adapter over these; compiled code
// reaches them directly.
export { branch, each, boundary, portal, reveal, COUNT, STATIC_KEY, NO_SCOPE } from "./flow.ts";
export type { BoundaryKind } from "./flow.ts";

// Components
export {
  Fragment,
  Show,
  For,
  Repeat,
  Switch,
  Match,
  Suspense,
  Loading,
  Reveal,
  ErrorBoundary,
  Errored,
  Await,
  Portal,
  Dynamic,
  dynamic,
  children,
  // DOM marker utilities
  createMarkerPair,
  insertNodes,
  clearRange,
  childToNodes,
} from "./components.ts";
export type { MatchProps } from "./components.ts";

// JSX
export type { JSX } from "./jsx-runtime.ts";
export { jsx, jsxs, Fragment as JSXFragment } from "./jsx-runtime.ts";

// Type utilities
export {
  isString,
  isNumber,
  isBoolean,
  isFunction,
  isObject,
  isArray,
  isNullish,
  isNode,
  isElement,
  isHTMLElement,
  toString,
  asHTMLElement,
  asElement,
  asNode,
  getProperty,
  setProperty,
} from "./type-utils.ts";

// Helper types for components (following SolidJS/React patterns)
export type {
  Accessor,
  Setter,
  FunctionMaybe,
  MaybeAccessor,
  PropsWithChildren,
  ParentProps,
  VoidProps,
  FlowProps,
  ComponentProps,
  ValidComponent,
  IntrinsicElementProps,
  Ref,
  RefCallback,
  RefObject,
} from "./jsx-runtime.ts";

// The L2b ownership trace (CODESIGN.md §6). DEV/test only, off until asked
// for; every instrumentation site behind it is one branch when it is off.
export { beginOwnershipTrace, endOwnershipTrace, ownershipIdOf } from "./trace.ts";
export type { OwnershipEvent, OwnershipEventKind, ScopeKind } from "./trace.ts";

// Version
export const VERSION = "0.1.0";
