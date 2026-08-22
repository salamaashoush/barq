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
  scope,
  onCleanup,
  onMount,
  onSettled,
  context,
  getContext,
  useContext,
  hasContext,
  flush,
  getOwner,
  runWithOwner,
  // Async helpers
  isPending,
  latest,
  refresh,
  settle,
  // Boundary context keys (used by Loading/Errored components)
  // Dev diagnostics
  DEV,
  // Error classes
  ContextNotFoundError,
  NotReadyError,
  ScopeMissingError,
} from "./signals.ts";
export type { LoadingBoundaryHandle, DiagnosticEvent } from "./signals.ts";

// Solid 2.0 parity primitives
export {
  owner,
  reaction,
  trackedEffect,
  getNextChildId,
  isDisposed,
  peekNextChildId,
  scopeAllocations,
  effectAllocations,
  resetChildIds,
  resolve,
  markInMotion,
} from "./signals.ts";
export type { ExternalSource, ExternalSourceConfig, ExternalSourceFactory } from "./signals.ts";

// root: detached scope for SolidJS compatibility
import { scope as _createScope } from "./signals.ts";
export function root<T>(fn: (dispose: () => void) => T): T {
  return _createScope(fn, true);
}

export type { SignalOptions, MemoOptions, Owner, ContextRecord } from "./signals.ts";

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
export { isClient, isServer } from "./env.ts";

export { store, produce, reconcile, unwrap, snapshot, projection, deep } from "./store.ts";
export type { Part, StorePathRange } from "./store.ts";

// Actions & optimistic updates
export { action, affects, commit, optimistic, optimisticStore } from "./actions.ts";

// Server-side rendering

// Core hooks
export { errorBoundary, loadingBoundary, revealOrder, flatten } from "./boundaries.ts";
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
  type HydrationReport,
  type Mismatch,
  type MismatchKind,
} from "./hydration.ts";

// DOM
export {
  dynamic,
  element,
  render,
  hydrate,
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
  formAction,
  listen,
  delegate,
  spread,
  delegateEvents,
  clearDelegatedEvents,
  classToString,
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
/**
 * `HYDRATE` is public because a hand-written construct has to be able to pass
 * it. The compiler sets it on every range it emits, but `@barqjs/router` builds
 * its per-depth `branch` and `boundary` by hand — it is not compiled — and
 * without the flag the client claims nothing while the string backend still
 * writes the range, which is a page that silently re-renders itself cold.
 */
export {
  branch,
  each,
  boundary,
  portal,
  reveal,
  COUNT,
  STATIC_KEY,
  NO_SCOPE,
  HYDRATE,
} from "./flow.ts";
export type { BoundaryKind } from "./flow.ts";

// The flow components — the adapters `passes::flow` falls back to when it
// cannot read a construct's props, which today is exactly a SPREAD. See
// `components.ts` for the corpus measurement and for what unblocks deleting
// them; `ssr.ts` carries the same twelve on the string side, for the same
// reason, and the two are one deletion.
export {
  Fragment,
  Show,
  For,
  Repeat,
  Switch,
  Match,
  Loading,
  Reveal,
  Errored,
  Portal,
  Dynamic,
} from "./components.ts";
// Not one of the ten. `lazy` is a `computed` over an import — a reactivity
// primitive that happens to return a component — and it is here rather than in
// a router because every mechanism it rides is private to `signals.ts` and
// `flow.ts`.
export { lazy } from "./components.ts";
export type {
  ShowProps,
  ForProps,
  MatchProps,
  RepeatProps,
  SwitchProps,
  LoadingProps,
  RevealProps,
  ErroredProps,
  PortalProps,
  DynamicComponent,
} from "./components.ts";

// JSX — the TYPES stay whole; `jsx`/`jsxs`/`jsxDEV` are gone (§4.1). Bun's JSX
// transform cannot produce scope-taking Blocks, so an un-compiled authoring
// path could not have the same semantics and there is no point shipping one.
export type { JSX } from "./jsx-runtime.ts";

// Type utilities
// §13: `getProperty`/`setProperty` are NOT exported — zero consumers, and one
// character from `setProp`, which is a different thing. Both stay as internal
// helpers of `type-utils.ts`, which `dom.ts` uses to write a `{current}` ref.
export { isArray, toString } from "./type-utils.ts";

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
