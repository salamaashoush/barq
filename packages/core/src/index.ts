/**
 * Barq - Tiny JSX renderer with fine-grained reactivity via signals
 *
 * Core: the reactive engine, JSX/DOM rendering, components, hydration
 * For scheduling, events, observers and browser APIs, see @barqjs/primitives
 */

// The reactive engine: `@solidjs/signals`, under its own names.
export {
  $PROXY,
  $TARGET,
  $TRACK,
  ContextNotFoundError,
  NoOwnerError,
  NotReadyError,
  OBSERVE,
  TimeoutError,
  action,
  affects,
  clearSnapshots,
  configureClientErrors,
  createEffect,
  createErrorBoundary,
  createLoadingBoundary,
  createMemo,
  createOptimistic,
  createOptimisticStore,
  createOwner,
  createProjection,
  createReaction,
  createRenderEffect,
  createRevealOrder,
  createRoot,
  createSignal,
  createStore,
  deep,
  enableExternalSource,
  enforceLoadingBoundary,
  flatten,
  flush,
  getNextChildId,
  getObserver,
  getOwner,
  isDisposed,
  isEqual,
  isPending,
  isWrappable,
  latest,
  mapArray,
  markRaw,
  markSnapshotScope,
  onCleanup,
  onSettled,
  peekNextChildId,
  reconcile,
  refresh,
  releaseSnapshotScope,
  repeat,
  resetErrorHalt,
  resolve,
  runWithOwner,
  setSnapshotCapture,
  snapshot,
  until,
  untrack,
} from "./signals.ts";
export type {
  Accessor,
  ArrayFilterFn,
  ClientErrorContext,
  ClientErrorHook,
  ClientErrorsConfig,
  ComputeFunction,
  CustomPartial,
  DiagnosticCode,
  DiagnosticKind,
  DiagnosticSeverity,
  DiagnosticSubject,
  Observe,
  EffectBundle,
  EffectFunction,
  EffectOptions,
  ExternalSource,
  ExternalSourceConfig,
  ExternalSourceFactory,
  Maybe,
  MemoOptions,
  NoInfer,
  NotWrappable,
  Part,
  PathSetter,
  ProjectionOptions,
  ProjectionStoreReturn,
  Refreshable,
  RevealOrder,
  Setter,
  Signal,
  SignalOptions,
  SolidStore,
  SourceAccessor,
  Store,
  StoreOptions,
  StorePathRange,
  StoreReturn,
  StoreSetter,
  Truthy,
  UntilOptions,
} from "./signals.ts";

// What barq adds beside the engine.
export {
  createContext,
  getContext,
  setContext,
  useContext,
  hasContext,
  followAsync,
  settle,
  DEV,
  createComponent,
  errorOwnerPath,
  ownerPathOf,
  ScopeMissingError,
  scopeAllocations,
  effectAllocations,
  resetChildIds,
  createUniqueId,
} from "./signals.ts";
export type {
  Context,
  ContextProviderComponent,
  ContextProviderProps,
  ContextRecord,
  BarqDiagnosticCode,
  DiagnosticCapture,
  DiagnosticEvent,
  DiagnosticListener,
  DiagnosticsChannel,
  Owner,
} from "./signals.ts";

// Scope — the ownership spine.
export {
  childScope,
  pin,
  dispose,
  rootScope,
  abortSignal,
  ownRange,
  provide,
  install,
  read,
} from "./scope.ts";

/**
 * The Cell-slot read, exported because a runtime library written on this ABI
 * has the same slots the
 * compiled path has and must refuse a Block in one the same way.
 */
export { readSlot } from "./signals.ts";
export type { Block, Cell, Scope, Slot } from "./scope.ts";

// The props model. `props` and `cell` are the two
// carriers the compiler emits; `merge` and `omit` are views over the same
// source list and copy nothing.
export { props, cell, block, isBlock, BLOCK, merge, omit, SOURCES } from "./props.ts";
export type { Merge, Source } from "./props.ts";

// What a JSX call site writes, and what a component body reads.
export type {
  CallSite,
  Incoming,
  StrictAccessor,
  StrictArrayAccessor,
  StrictChild,
} from "./config.ts";

export { isClient, isDev, isServer } from "#env";

export { isSafeError, markSafeError } from "./safe-error.ts";

// Server-side rendering

// Claim-based hydration. The two walk helpers are emitted ONLY by a
// `hydratable` compile — the index must cost nothing on the client-render path,
// which is the diff between the two emissions — and with the flag off neither
// name appears in a module.
export {
  child,
  sib,
  hole,
  hydrating as isHydrating,
  onHydrationEnd,
  type HydrationReport,
  type Mismatch,
  type MismatchKind,
} from "./hydration.ts";

// DOM
export {
  element,
  render,
  hydrate,
  template,
  insert,
  setProp,
  // The resolved channels. The compiler picks one at compile time from
  // `NameFlags` plus the namespace, so no name is classified at run time.
  setAttr,
  setDomProp,
  setLive,
  setClass,
  setStyle,
  setHtml,
  setRef,
  bindProp,
  readOpaque,
  readKeys,
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
  classToString,
  type Channel,
  // The SSR string backend's brand. It is read on the CLIENT too: a module that
  // fell back to this backend renders a string-compiled component's markup
  // through it.
  isSsrHtml,
  type Child,
  type Props,
  type JSXElement,
  type Element,
  type ArrayElement,
} from "./dom.ts";

// The two halves of a form write, exported because they are a CHANNEL and not
// an internal: `setLive` and every author-written directive that touches a
// user-mutable property need the same compare and the same caret restore, and a
// second implementation of either is how the two would drift.
export { writeLive, coerceLive, holdsLive, captureCaret, restoreCaret } from "./forms.ts";

// The four control-flow primitives.
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
  island,
  portal,
  reveal,
  COUNT,
  STATIC_KEY,
  NO_SCOPE,
  HYDRATE,
  WHOLE,
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
  NoHydration,
  Portal,
} from "./components.ts";
export { children } from "./components.ts";
// Not one of the ten. `lazy` is a `computed` over an import — a reactivity
// primitive that happens to return a component — and it is here rather than in
// a router because every mechanism it rides is private to `signals.ts` and
// `flow.ts`.
export { lazy, lazyModule } from "./components.ts";
// Solid 2.0's factory for a component chosen at run time, from `@solidjs/web`.
export { dynamic } from "./components.ts";
export type {
  ChildrenReturn,
  ResolvedChildren,
  ResolvedElement,
  ShowProps,
  ShowItem,
  ForProps,
  ForCallSite,
  ForKeyed,
  ForItem,
  ForIndex,
  MatchProps,
  RepeatProps,
  SwitchProps,
  LoadingProps,
  RevealProps,
  ErroredProps,
  PortalProps,
  DynamicComponent,
  DynamicProps,
  DynamicTag,
  LazyComponent,
  LazyModule,
} from "./components.ts";

// JSX — the TYPES stay whole; `jsx`/`jsxs`/`jsxDEV` are gone. Bun's JSX
// transform cannot produce scope-taking Blocks, so an un-compiled authoring
// path could not have the same semantics and there is no point shipping one.
export type { JSX } from "./jsx-runtime.ts";

// Type utilities
// `getProperty`/`setProperty` are NOT exported — zero consumers, and one
// character from `setProp`, which is a different thing. Both stay as internal
// helpers of `type-utils.ts`, which `dom.ts` uses to write a `{current}` ref.
export { isArray, toString } from "./type-utils.ts";

// Helper types for components (following SolidJS/React patterns)
export type {
  FunctionMaybe,
  MaybeAccessor,
  PropsWithChildren,
  ParentProps,
  VoidProps,
  FlowProps,
  Component,
  VoidComponent,
  ParentComponent,
  FlowComponent,
  ComponentProps,
  ValidComponent,
  IntrinsicElementProps,
  Ref,
  RefCallback,
  RefObject,
} from "./jsx-runtime.ts";

// The L2b ownership trace. DEV/test only, off until asked
// for; every instrumentation site behind it is one branch when it is off.
export { beginOwnershipTrace, endOwnershipTrace, ownershipIdOf } from "./trace.ts";
export type { OwnershipEvent, OwnershipEventKind, ScopeKind } from "./trace.ts";
