/**
 * Barq's core: the reactive engine, components and control flow, with no
 * renderer. `@barqjs/web` renders into a document.
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
  isHydratable,
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
export { bindEffect, readSlot } from "./signals.ts";
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

/**
 * True under the development entry, which is what the `development` export
 * condition resolves `@barqjs/core` to. A literal here, so a production bundle
 * folds `if (isDev)` away; the development entry exports its own `true` over
 * this one.
 */
export const isDev: boolean = false;

export { isSafeError, markSafeError } from "./safe-error.ts";

/**
 * `HYDRATE` is public because a hand-written construct has to be able to pass
 * it. The compiler sets it on every range it emits, but `@barqjs/router` builds
 * its per-depth `branch` and `boundary` by hand — it is not compiled — and
 * without the flag the client claims nothing while the string backend still
 * writes the range, which is a page that silently re-renders itself cold.
 */
export { COUNT, STATIC_KEY, NO_SCOPE, HYDRATE, WHOLE } from "./flow.ts";
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
  Hydration,
} from "./components.ts";
export { children } from "./components.ts";
// Not one of the ten. `lazy` is a `computed` over an import — a reactivity
// primitive that happens to return a component — and it is here rather than in
// a router because every mechanism it rides is private to `signals.ts` and
// `flow.ts`.
export { lazy, lazyModule } from "./components.ts";
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
  LazyComponent,
  LazyModule,
} from "./components.ts";

// Type utilities
// `setProperty` is NOT exported: it is one character from `setProp`, which is a
// different thing, and only `dom.ts` uses it, to write a `{current}` ref.
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
  Ref,
  RefCallback,
  RefObject,
  Bindable,
} from "./component-types.ts";
export type { Child, Props, JSXElement, Element, ArrayElement } from "./types.ts";

// The L2b ownership trace. DEV/test only, off until asked
// for; every instrumentation site behind it is one branch when it is off.
export { beginOwnershipTrace, endOwnershipTrace, ownershipIdOf } from "./trace.ts";
export type { OwnershipEvent, OwnershipEventKind, ScopeKind } from "./trace.ts";
