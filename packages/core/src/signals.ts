/**
 * The reactive engine, and what barq's renderer adds beside it.
 *
 * The graph, the scheduler, transitions and async status are
 * `@solidjs/signals`', exported from here under its own names and untouched.
 * What this module owns is what the engine has no opinion about: the Block
 * brand, the scopes the flow primitives open, the context channel, and the
 * crossing of async values from a server render to the client.
 *
 * The engine's production build mangles every underscore property, so nothing
 * here may reach past its exported API.
 */

import {
  type Owner as EngineOwner,
  type Context as EngineContext,
  type MemoOptions,
  type SourceAccessor,
  ContextNotFoundError,
  NoOwnerError,
  NotReadyError,
  createContext as engineCreateContext,
  createEffect as engineCreateEffect,
  createMemo as engineCreateMemo,
  createSignal as engineCreateSignal,
  onSettled as engineOnSettled,
  createOwner,
  createRenderEffect,
  flush,
  getContext as engineGetContext,
  getObserver,
  getOwner,
  isDisposed,
  onCleanup,
  runWithOwner,
  setContext as engineSetContext,
  DEV as ENGINE_DEV,
  OBSERVE,
  type Dev as EngineDev,
  type DiagnosticCode,
  type DiagnosticEvent as EngineDiagnosticEvent,
  type DiagnosticKind,
  type DiagnosticSeverity,
  type DiagnosticSubject,
  type Observe,
} from "@solidjs/signals";
import { abandonClaim, hydrating, mismatchIn } from "./hydration-state.ts";
import { sharedSourcesOf } from "./shared-sources.ts";
import type { OwnershipSink, ScopeKind } from "./trace.ts";

export {
  $PROXY,
  $TARGET,
  $TRACK,
  ContextNotFoundError,
  NoOwnerError,
  NotReadyError,
  OBSERVE,
  TimeoutError,
  SUPPORTS_PROXY,
  action,
  affects,
  clearSnapshots,
  configureClientErrors,
  createErrorBoundary,
  createLoadingBoundary,
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
  merge,
  omit,
  onCleanup,
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
} from "@solidjs/signals";
export type {
  Accessor,
  ArrayFilterFn,
  ClientErrorContext,
  ClientErrorHook,
  ClientErrorsConfig,
  ComputeFunction,
  DiagnosticCode,
  DiagnosticKind,
  DiagnosticSeverity,
  DiagnosticSubject,
  Observe,
  CustomPartial,
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
  StoreNode,
  StoreOptions,
  StorePathRange,
  StoreReturn,
  StoreSetter,
  Truthy,
  UntilOptions,
} from "@solidjs/signals";

/**
 * `createEffect` and `onSettled` do nothing while a page
 * is being rendered on a server.
 *
 * An effect is where a component reaches outside itself: a listener on
 * `document`, a timer, a measurement. A server render has none of those to
 * reach, its markup is whatever the tree built, and the process it runs in is
 * shared by every request, so a `document.addEventListener` in an `onSettled`
 * took the whole server down from one page. This is Solid's rule, and the
 * reason a component needs no `isServer` test around its effects.
 */
export const createEffect = ((...args: Parameters<typeof engineCreateEffect>): void => {
  if (activeAsyncSession !== null) return;
  engineCreateEffect(...args);
}) as typeof engineCreateEffect;

export const onSettled = (...args: Parameters<typeof engineOnSettled>): void => {
  if (activeAsyncSession !== null) return;
  engineOnSettled(...args);
};

/**
 * The L2b ownership trace's attachment point. `null` until
 * `beginOwnershipTrace()` installs a sink.
 */
export const OWNERSHIP: { sink: OwnershipSink | null } = { sink: null };

// ============================================================================
// The Block brand
// ============================================================================

/**
 * The Block brand and its enforcement, in one value.
 *
 * The brand is POSITIVE: it means "this value requires a scope". An unbranded
 * function is a Cell, or a Block that ignores its scope (an arity-0
 * `template()`, C6) — which is simultaneously a legal Cell, which is why rule 2
 * lets one call site serve both kinds. Kind travels with the value (rule 4),
 * so a forwarded Block is still branded and an arity guess is never consulted.
 */
export const BLOCK: unique symbol = Symbol.for("barq.block");

/**
 * Mark a value as a deferred CONSTRUCTION rather than a deferred read.
 *
 * The runtime enters the scope a Block belongs to before invoking it, so the
 * body reads its owner the way every other reactive primitive does. What the
 * brand buys is kind: a Block landing in a Cell slot is refused rather than
 * invoked and stringified.
 */
export function block<F extends (...args: never[]) => unknown>(fn: F): F {
  (fn as unknown as Record<symbol, boolean>)[BLOCK] = true;
  return fn;
}

/** Whether `value` is a Block: a deferred CONSTRUCTION rather than a read. */
export function isBlock(value: unknown): boolean {
  return (
    typeof value === "function" && (value as unknown as Record<symbol, unknown>)[BLOCK] === true
  );
}

/**
 * A construct invoked without a scope throws and NEVER falls back
 * to the ambient owner: that fallback is the Provider bug reintroduced at the
 * one place nobody would look for it.
 *
 * `null` is a scope VALUE, not a missing one. Only `undefined` is missing.
 */
export class ScopeMissingError extends Error {
  constructor(
    readonly origin: string,
    message: string = `\`${origin}\` was called with \`undefined\` where its owner is expected, so ` +
      "nothing would dispose the effects and listeners it creates. Pass the owner from " +
      "`getOwner()`, or `null` to run without one on purpose.",
  ) {
    super(message);
    this.name = "ScopeMissingError";
  }
}

/**
 * The refusal for JSX arriving where a value is read. `origin` is either a
 * `Component.prop` label or a phrase that already starts the sentence.
 */
export function jsxAsValue(origin: string, returned = false): ScopeMissingError {
  const label = /^([A-Z]\w*)\.(\w+)$/.exec(origin);
  const where = label === null ? origin : `The \`${label[2]}\` prop of \`<${label[1]}>\``;
  return new ScopeMissingError(
    origin,
    `${where} ${returned ? "is a function that returned" : "was given"} JSX where a value is ` +
      "expected. JSX passed as a prop or as children is built only where it is rendered, so " +
      "there is no value to read from it here. Render it as a child, " +
      "`<span>{props.children}</span>`, or pass a string, a number or an accessor.",
  );
}

/**
 * A CELL-slot read. A Cell is called with no arguments and yields its value; a
 * Block reaching here throws rather than silently building under whatever is
 * current or yielding `undefined`. The brand makes it a property test, so the
 * throw names both ends instead of waiting for a downstream `TypeError`.
 */
export function readSlot(value: unknown, origin: string): unknown {
  if (typeof value !== "function") return value;
  if (isBlock(value)) throw jsxAsValue(origin);
  const read = (value as () => unknown)();
  // A Cell that YIELDS a Block is the laundered form: an uncompiled caller
  // wrapping a forwarded prop in `() => x` produces one, and it walks past the
  // test above because the wrapper carries no brand. Stringifying it into an
  // attribute is what the brand exists to prevent, so the same throw answers.
  if (isBlock(read)) throw jsxAsValue(origin, true);
  return read;
}

// ============================================================================
// Dev diagnostics
// ============================================================================

/**
 * What barq reports that the engine cannot see: the renderer's bindings, the
 * hydration walk, the server renderer and Start's response.
 */
export type BarqDiagnosticCode =
  | "BIND_TARGET_NOT_WRITABLE"
  | "BLOCK_EVALUATED_TWICE"
  | "DELEGATED_EVENT_DOES_NOT_BUBBLE"
  | "FUNCTION_AS_ATTRIBUTE"
  | "HYDRATION_MISMATCH"
  | "HYDRATION_SEED_DRIFT"
  | "LATE_HEADER_WRITE"
  | "RENDER_SUBTREE_NOT_OWNED"
  | "SERVER_FUNCTION_FAILED"
  | "SSR_RENDER_ERROR_CONTAINED";

/**
 * One finding on the one channel the engine and barq share: the engine's event
 * shape, with barq's codes beside the engine's and the page that explains the
 * code.
 */
export interface DiagnosticEvent extends Omit<EngineDiagnosticEvent, "code"> {
  code: DiagnosticCode | BarqDiagnosticCode;
  /** What the code means and how to fix it. */
  docs?: string;
}

export type DiagnosticListener = (
  event: DiagnosticEvent,
  subject: DiagnosticSubject | undefined,
) => void;

/** A finding as a host runtime reports it: the engine numbers it and finds its owner path. */
export interface DiagnosticReport {
  code: BarqDiagnosticCode;
  kind: DiagnosticKind;
  severity: DiagnosticSeverity;
  message: string;
  nodeName?: string;
  data?: Record<string, unknown>;
  /** For a finding whose owners are not the engine's, such as a server render's. */
  ownerPath?: string[];
}

export interface DiagnosticCapture {
  readonly events: readonly DiagnosticEvent[];
  clear(): void;
  stop(): DiagnosticEvent[];
}

export interface DiagnosticsChannel {
  subscribe(listener: DiagnosticListener): () => void;
  capture(): DiagnosticCapture;
}

/**
 * The engine's channel as a host sees it. `emit` takes any code at run time and
 * its declaration names only the engine's own; a host reporting its own codes
 * is the case the method exists for, and declaring it as a method here is what
 * lets barq's wider codes through without restating the engine's types.
 */
interface HostChannel {
  subscribe(listener: DiagnosticListener): () => void;
  emit(
    event: Omit<DiagnosticEvent, "sequence">,
    subject?: DiagnosticSubject | null,
  ): DiagnosticEvent;
}

const DIAGNOSTIC_DOCS =
  "https://github.com/salamaashoush/barq/blob/main/packages/core/docs/diagnostics";

/**
 * The engine's channel exists in its development and observe builds. In its
 * production build `OBSERVE` is a literal `undefined`, every branch that reads
 * it is dropped from a production bundle, and barq's codes reach barq's own
 * listeners only, so a test or a production subscriber still hears them.
 */
function engineChannel(observe: Observe): HostChannel {
  return observe.diagnostics;
}

let diagnosticSequence = 0;
const localListeners = new Set<DiagnosticListener>();
let listening = 0;
let reporter: ((event: DiagnosticEvent) => void) | null = null;
/** Mirrors "anything will hear it" as a single load for hot paths. */
let diagnosticsOn = false;

function refreshDiagnosticsOn(): void {
  diagnosticsOn = listening !== 0 || reporter !== null;
}

function addDiagnosticListener(listener: DiagnosticListener): () => void {
  let release: () => void;
  if (OBSERVE !== undefined) {
    release = engineChannel(OBSERVE).subscribe((event, subject) => {
      // The engine's own findings point at the engine's repair guide.
      event.docs ??= ENGINE_DEV?.guideUrl(event.code as DiagnosticCode);
      listener(event, subject);
    });
  } else {
    localListeners.add(listener);
    release = () => localListeners.delete(listener);
  }
  listening++;
  refreshDiagnosticsOn();
  let live = true;
  return () => {
    if (!live) return;
    live = false;
    release();
    listening--;
    refreshDiagnosticsOn();
  };
}

/**
 * The console face. The development entry installs one; anything else hears
 * findings by subscribing.
 */
export function setDiagnosticReporter(report: ((event: DiagnosticEvent) => void) | null): void {
  reporter = report;
  refreshDiagnosticsOn();
}

/**
 * The same single load `emitDiagnostic` short-circuits on, for a caller whose
 * CHECK is the expensive part rather than the message.
 */
export function diagnosticsEnabled(): boolean {
  return diagnosticsOn;
}

/**
 * Report a finding on the shared channel. `subject` locates it, the current
 * owner by default, and the engine turns it into the owner path
 * (`<App> › <Row>`) where its build keeps owner names.
 */
export function emitDiagnostic(
  report: DiagnosticReport,
  located?: DiagnosticSubject | null,
): DiagnosticEvent | undefined {
  // Before anything else, and nothing in a default parameter: a production
  // bundle in which nothing subscribes then sees an empty function and drops
  // every call to it, message and all.
  if (!diagnosticsOn) return undefined;
  const subject = located === undefined ? getOwner() : located;
  const docs = `${DIAGNOSTIC_DOCS}/${report.code}.md`;
  let event: DiagnosticEvent;
  if (OBSERVE !== undefined) {
    event = engineChannel(OBSERVE).emit({ ...report, docs }, subject);
  } else {
    event = { sequence: ++diagnosticSequence, ...report, docs };
    for (const listener of localListeners) listener(event, subject ?? undefined);
  }
  reporter?.(event);
  return event;
}

/**
 * The component path from the root to `subject`, as `["<App>", "<Row>"]`.
 * Names exist where a development compile labelled the components and the
 * engine keeps them, so this is `undefined` in a production build.
 */
export function ownerPathOf(subject: DiagnosticSubject | null | undefined): string[] | undefined {
  return OBSERVE?.ownerPath(subject);
}

const OWNER_PATH = Symbol.for("barq.ownerPath");

/**
 * Where an error was thrown, as a component path: the innermost component
 * whose body threw it, or the computation the engine says it left.
 */
export function errorOwnerPath(error: unknown): string[] | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const marked = (error as Record<symbol, unknown>)[OWNER_PATH];
  if (Array.isArray(marked)) return marked as string[];
  const source = (error as { source?: unknown }).source;
  if (typeof source === "object" && source !== null && "_parent" in source) {
    return ownerPathOf(source as DiagnosticSubject);
  }
  const cause = (error as { cause?: unknown }).cause;
  return cause === error ? undefined : errorOwnerPath(cause);
}

/**
 * Call a component under an owner named for it, so a finding, an error and a
 * hydration report inside it say `in <App> › <Row>`.
 *
 * A development compile emits this in place of `Row(props)`. The owner is
 * transparent, so the engine numbers what is inside it exactly as it would
 * without it, and the body runs untracked, as the compiled call already does.
 * With no owner to attach to, the component is called as it is: an owner made
 * here would be one nothing ever disposes, and would hide the engine's own
 * report about the missing owner.
 */
export function createComponent<P, R>(component: (props: P) => R, props: P, name?: string): R {
  const parent = getOwner();
  if (parent === null) return component(props);
  const owner = runWithOwner(parent, openTransparent);
  owner._name = `<${name || component.name || "Anonymous"}>`;
  try {
    return runWithOwner(owner, () => component(props));
  } catch (error) {
    if (typeof error === "object" && error !== null && !(OWNER_PATH in error)) {
      const path = ownerPathOf(owner);
      if (path !== undefined) {
        Object.defineProperty(error, OWNER_PATH, { value: path, configurable: true });
      }
    }
    throw error;
  }
}

/**
 * The engine's development tier (devtools hooks, graph traversal, the console
 * face) with the channel both the engine's and barq's findings arrive on. The
 * engine's tier is empty in its production build; the channel is not.
 */
export const DEV: Partial<EngineDev> & { readonly diagnostics: DiagnosticsChannel } = {
  ...ENGINE_DEV,
  diagnostics: {
    subscribe: addDiagnosticListener,
    capture(): DiagnosticCapture {
      const events: DiagnosticEvent[] = [];
      const stop = addDiagnosticListener((event) => {
        events.push(event);
      });
      return {
        events,
        clear() {
          events.length = 0;
        },
        stop() {
          stop();
          return events;
        },
      };
    },
  },
};

// ============================================================================
// Scope — the unit of ownership and the unit of death
// ============================================================================

/**
 * A scope is the engine's owner. A computation is one too, which is why
 * `getOwner()` inside an effect answers with something that has no `dispose`:
 * only a scope that was opened by hand can be closed by hand.
 */
export type Owner = EngineOwner;
export type Scope = EngineOwner;

interface Disposable {
  dispose(): void;
}

export type ContextRecord = Record<string | symbol, unknown>;

let scopesAllocated = 0;

/** How many scopes barq has opened; the flag gate's `NO_SCOPE` row reads it. */
export function scopeAllocations(): number {
  return scopesAllocated;
}

// A scope barq opens is transparent to the engine's numbering: the ids the
// engine hands out depend on the computations alone and not on how many ranges
// the renderer happened to open around them.
const TRANSPARENT = { transparent: true } as const;
const openTransparent = (): Scope => createOwner(TRANSPARENT);

/**
 * A place in the tree of scopes, and the count of what has been declared
 * directly under it.
 *
 * This is what an async value's key is made of, and it is deliberately not the
 * engine's id. The engine numbers every computation, and the two halves of a
 * render do not have the same computations: the DOM backend opens an effect per
 * binding, a memo per branch key and the engine's own owners inside every
 * boundary and list, and the string backend opens none of them. What both
 * halves do have is the scopes the flow primitives open and the values the
 * application declares, in the same order, so those are what is counted.
 */
interface Numbering {
  readonly id: string;
  /**
   * One count per kind of thing declared here. Shared, a memo that only the
   * client declares, behind an `isServer` test in a library, moved the position
   * of every branch and every id after it, and with them everything declared
   * inside those branches.
   */
  scopes: number;
  values: number;
  ids: number;
}

const NUMBERING = engineCreateContext<Numbering | null>(null);

function numberingAt(id: string): Numbering {
  return { id, scopes: 0, values: 0, ids: 0 };
}

/**
 * The position `count` stands for under `numbering`. A count past one digit is
 * prefixed with its length, so no position is a prefix of a sibling's.
 */
function positionUnder(numbering: Numbering, count: number): string {
  const digits = count.toString(36);
  const extra = digits.length - 1;
  return numbering.id + (extra === 0 ? "" : String.fromCharCode(64 + extra)) + digits;
}

let unownedIds = 0;

/**
 * An identifier for an element, the same on the server and on the client that
 * hydrates it.
 *
 * It is the declaration's position among the scopes of its render, which is
 * what an async value is keyed by and for the same reason: the engine's own
 * ids count effects and owners only one backend has. Outside any render there
 * is no other side to agree with, and a counter is enough.
 */
export function createUniqueId(): string {
  const owner = getOwner();
  const numbering = owner === null ? null : engineGetContext(NUMBERING, owner);
  return numbering === null
    ? `barq-u${(unownedIds++).toString(36)}`
    : `barq-${positionUnder(numbering, numbering.ids++)}`;
}

/**
 * Open a fresh child of `parent`. It is NOT made current: run a body under it
 * with `runWithOwner`.
 *
 * `parent` has no default, deliberately. O4.5: a primitive that reads the
 * ambient owner where a `Scope` argument is in scope is the defect shape the
 * scope spine exists to remove, and a defaulted parameter is that read with a
 * nicer name.
 *
 * While async values are being followed a BRANCH takes the next position under
 * `parent` and counts what is declared under it from zero. Only a branch does,
 * because a branch is the one scope both backends are made to open alike: the
 * compiler emits the same region to each. A provider's scope is opened wherever
 * the code that provides happens to stand, which a router's server and client
 * halves do not agree on, and a list row is an owner the engine opens on the
 * DOM backend and no scope of barq's at all. What either declares is counted
 * where it stands.
 *
 * `counted` is for a body that is built more than once. The first build passes
 * `{ id: undefined }` and gets the position written into it; every later build
 * passes the same record, so the scope stands at the same position, its count
 * starts from zero again, and each declaration gets the key the first build
 * gave it. Without it a rebuild would stand at a new position and find nothing
 * recorded under any of its keys.
 */
export function childScope(
  parent: Scope | null,
  kind: ScopeKind = "scope",
  counted?: { id: string | undefined },
): Scope {
  scopesAllocated++;
  const scope = runWithOwner(parent, openTransparent);
  const outer =
    parent !== null && kind === "branch" && seeding() ? engineGetContext(NUMBERING, parent) : null;
  if (outer !== null) {
    const id = counted?.id ?? positionUnder(outer, outer.scopes++);
    if (counted !== undefined) counted.id = id;
    engineSetContext(NUMBERING, numberingAt(id), scope);
  }
  if (OWNERSHIP.sink !== null) traceScope(scope, parent, kind, parent !== null);
  return scope;
}

/**
 * Declare a scope to the ownership trace. `childScope` and `rootScope` do it
 * for what they open; a scope the ENGINE opened, a list row, is declared by
 * whoever builds under it. Call only while a trace is installed.
 */
export function traceScope(
  scope: Scope,
  parent: Scope | null,
  kind: ScopeKind,
  attached: boolean,
): void {
  const sink = OWNERSHIP.sink!;
  sink.enter(scope, parent, kind, attached);
  // The engine runs a scope's cleanups after it has disposed what the scope
  // owns, so a scope reached by a cascade reports here, on its way out.
  runWithOwner(scope, () => onCleanup(() => reportDisposal(scope)));
}

/** Scopes whose disposal the trace has been told about, while one is open. */
const disposalsReported = new WeakSet<Scope>();

function reportDisposal(scope: Scope): void {
  const sink = OWNERSHIP.sink;
  if (sink === null || disposalsReported.has(scope)) return;
  disposalsReported.add(scope);
  sink.dispose(scope);
}

/**
 * The scope a construct was GIVEN, made current for `fn`, so every ambient read
 * below it resolves to that argument rather than to whatever happened to be
 * current at the call site (O2/O4.5).
 */
export function underScope<T>(
  scope: Scope | null | undefined,
  origin: string,
  fn: (scope: Scope | null) => T,
): T {
  if (scope === undefined) throw new ScopeMissingError(origin);
  return runWithOwner(scope, () => fn(scope));
}

/** O3: total, ordered and idempotent — kids first, then cleanups in reverse. */
export function disposeScope(scope: Scope): void {
  // Said BEFORE the cascade, so the trace sees a scope disposed by hand begin
  // to unwind ahead of the kids that unwinding takes with it.
  if (OWNERSHIP.sink !== null) reportDisposal(scope);
  (scope as unknown as Disposable).dispose();
}

const aborts = new WeakMap<Scope, AbortController>();

/**
 * O3.4: an `AbortSignal` that fires when the scope dies, so native listeners
 * and in-flight fetches are killed by the same act that kills the scope.
 */
export function abortSignal(scope: Scope): AbortSignal {
  let controller = aborts.get(scope);
  if (controller === undefined) {
    controller = new AbortController();
    aborts.set(scope, controller);
    const live = controller;
    if (isDisposed(scope)) live.abort();
    else runWithOwner(scope, () => onCleanup(() => live.abort()));
  }
  return controller.signal;
}

/**
 * O3.5: the range removal this scope owns.
 *
 * Cleanups run last-registered-first, so a caller that wants the range to
 * outlive the body's own cleanups registers it BEFORE running the body.
 */
export function ownRange(scope: Scope, remove: () => void): void {
  runWithOwner(scope, () => onCleanup(remove));
}

/**
 * `pin(s, body)` — the one sanctioned way to break dynamic ownership (O2).
 * The returned Block runs under `s` whatever is current when it is invoked, and
 * because it is visible in the emitted text the exception is auditable.
 */
export function pin<A extends unknown[], R>(
  scope: Scope,
  body: (owner: Scope, ...args: A) => R,
): (ignored?: Scope, ...args: A) => R {
  return block((_ignored?: Scope, ...args: A): R =>
    runWithOwner(scope, () => body(scope, ...args)),
  );
}

// Root ids are numbered per render epoch, not per process: a server that
// reuses its module graph across requests would otherwise hand out r1, r2, …
// while every fresh client page starts again at r0, and the seeded data would
// land under keys nobody looks up.
//
// And per `renderId` within an epoch, because the prefix is what a second root
// on the page is matched by. A client that hydrates two regions of one page
// the server rendered under two prefixes has to number each from where the
// server did, whatever else it mounted first.
const rootCounts = new Map<symbol | null, Map<string, number>>();

function nextRootId(renderId: string): string {
  let counts = rootCounts.get(activeAsyncSession);
  if (counts === undefined) {
    counts = new Map<string, number>();
    rootCounts.set(activeAsyncSession, counts);
  }
  const next = counts.get(renderId) ?? 0;
  counts.set(renderId, next + 1);
  return `${renderId}r${next.toString(36)}`;
}

/**
 * Start a fresh id epoch. Server renders get one for free (each carries its
 * own async session); the client's epoch spans the page, so only reused
 * processes and tests need to call this.
 */
export function resetChildIds(session?: symbol): void {
  if (session !== undefined) rootCounts.delete(session);
  else rootCounts.clear();
}

/**
 * O5: the root a mount is owned by. It carries the id every async value below
 * it is numbered from, which is what lets a server render and the client that
 * hydrates it agree on a key without either naming one.
 */
export function rootScope(owner: Scope | null = null, renderId = ""): Scope {
  scopesAllocated++;
  const id = nextRootId(renderId);
  const root = runWithOwner(owner, () => createOwner({ id }));
  engineSetContext(NUMBERING, numberingAt(id), root);
  if (activeAsyncSession !== null) {
    recordsOf(activeAsyncSession);
    engineSetContext(RENDER_SESSION, activeAsyncSession, root);
  }
  if (OWNERSHIP.sink !== null) traceScope(root, null, "root", false);
  return root;
}

// ============================================================================
// Context
// ============================================================================

/** Returned by `lookupContext` for a key no scope on the chain binds. */
export const CONTEXT_MISS: unique symbol = Symbol("context-miss");

/** Context key for error boundaries; value is (err: unknown) => void */
export const ERROR_BOUNDARY: unique symbol = Symbol("error-boundary");

const channels = new Map<string | symbol, EngineContext<unknown>>();

function channel(key: string | symbol): EngineContext<unknown> {
  let found = channels.get(key);
  if (found === undefined) {
    found = engineCreateContext<unknown>(CONTEXT_MISS);
    channels.set(key, found);
  }
  return found;
}

/**
 * Bind `key` on `scope`. The engine copies a scope's bindings to its children
 * when they are CREATED, so a binding is visible to everything opened under
 * the scope afterwards and to nothing opened before: install, then build.
 */
export function provideOn(scope: Scope, key: string | symbol, value: unknown): void {
  // X2 makes a provided value a Cell, so a Block here is C5.1's Block-in-a-Cell
  // slot. It is rejected at the INSTALL rather than at the read: a binding
  // nobody reads until three components later reports the mistake three
  // components away from the site that made it.
  if (isBlock(value)) throw jsxAsValue("The `value` of a context provider");
  engineSetContext(channel(key), value, scope);
}

/** `provideOn` for a value the runtime binds itself, which is never a Block. */
export function bindOn(scope: Scope, key: string | symbol, value: unknown): void {
  engineSetContext(channel(key), value, scope);
}

export function lookupContext(scope: Scope | null, key: string | symbol): unknown {
  return scope === null ? CONTEXT_MISS : engineGetContext(channel(key), scope);
}

/** Value can be static or a reactive accessor */
type MaybeAccessor<T> = T | (() => T);

// Type-only: keeps a context usable as a JSX component (no runtime cycle)
import type { JSXElement } from "./types.ts";

/** What a context provider is handed: `value` is a Cell, `children` a Block. */
export interface ContextProviderProps<T> {
  value: MaybeAccessor<T>;
  children: unknown;
}

export type ContextProviderComponent<T> = (props: ContextProviderProps<T>) => JSXElement;

/**
 * A context is its own provider component, as in Solid 2.0: `<Theme
 * value="dark">`. The compiler calls a tag as `Comp(props)`, so the call
 * signature is the whole of what makes that spelling work.
 */
export interface Context<T> extends ContextProviderComponent<T> {
  readonly id: symbol;
  readonly defaultValue: T | undefined;
}

/**
 * Create a context for dependency injection. The second argument names the
 * context in a missing-provider error, either as a string or as Solid's
 * `{ name }`.
 */
export function createContext<T>(
  defaultValue?: T,
  description?: string | { name?: string },
): Context<T> {
  const name = typeof description === "string" ? description : description?.name;
  const id = Symbol(name || "context");

  /**
   * X1: open -> bind -> INVOKE, in that order. `children` is a Block, so there
   * is no expression in the emitted language that means "children, already
   * built": the only party holding the instance scope is this function, and it
   * writes the binding before it runs the body under that scope.
   */
  const provider = (props: ContextProviderProps<T>): JSXElement => {
    const instance = childScope(getOwner(), "provide");
    provideOn(instance, id, cellOf(props.value));
    let built = false;
    try {
      if (typeof props.children !== "function") return props.children as JSXElement;
      const children = props.children as () => JSXElement;
      if (OWNERSHIP.sink !== null) OWNERSHIP.sink.blockEnter("Provider.children", instance);
      const out = runWithOwner(instance, () => unwrapBlocks(children(), instance));
      if (OWNERSHIP.sink !== null) OWNERSHIP.sink.blockExit("Provider.children");
      built = true;
      return out;
    } finally {
      // O4.4: a subtree that threw half-way is disposed, not abandoned.
      if (!built) disposeScope(instance);
    }
  };

  const context: { id?: symbol; defaultValue?: T } & typeof provider = provider;
  context.id = id;
  context.defaultValue = defaultValue;
  return context as Context<T>;
}

/**
 * A Block that arrived wrapped in a Cell — `children: () => props.children` —
 * is still a Block, and it has to run inside the scope that carries the
 * binding. Resolving it at the INSERTION site instead runs it under the
 * caller's scope, which is O2's negation with extra steps. Call this with
 * `instance` current.
 *
 * Rule 4: kind travels with the value. Only a BRANDED Block is run here. A
 * Cell (`() => count()`, `() => on() ? <A /> : null`) stays a Cell, as the one
 * `Out` admits, and is re-homed rather than called: what it yields is read
 * through a memo this scope owns. A function that TAKES something is a row
 * callback in a children slot and is handed on untouched.
 */
export function unwrapBlocks<R>(out: R, instance: Scope): R {
  let at = out;
  for (;;) {
    if (isBlock(at)) {
      at = (at as unknown as (s: Scope) => R)(instance);
      continue;
    }
    // A children slot holding SEVERAL things is an array, and a Block inside
    // one is still a Block that has to run under this scope.
    if (Array.isArray(at)) {
      let changed = false;
      const each = (at as unknown[]).map((item) => {
        const built = unwrapBlocks(item, instance);
        if (built !== item) changed = true;
        return built;
      });
      return (changed ? each : at) as R;
    }
    if (typeof at !== "function") return at;
    // A Cell is called later, by the hole that receives it, and that hole
    // belongs to whoever placed the provider: under its owner the binding
    // installed here is not in reach, so `{on() ? <Reads /> : null}` built a
    // component that could not find the context it was written inside. A memo
    // made HERE is owned by this scope and is still a Cell to the hole that
    // reads it, so what the Cell builds is built where the binding is.
    if ((at as unknown as { length: number }).length > 0) return at;
    const cell = at as unknown as () => R;
    return internalMemo(() => unwrapBlocks(cell(), getOwner() as Scope)) as unknown as R;
  }
}

/**
 * Get a context value for the given context.
 *
 * @throws `NoOwnerError` if there's no owner at the time of call.
 * @throws `ContextNotFoundError` if context value has not been set and no default.
 */
export function getContext<T>(context: Context<T>, owner: Owner | null = getOwner()): T {
  if (!owner) {
    throw new NoOwnerError();
  }

  const stored = lookupContext(owner, context.id);
  const value = stored === CONTEXT_MISS ? context.defaultValue : (cellOf(stored) as () => T)();

  if (value === undefined && context.defaultValue === undefined) {
    throw new ContextNotFoundError();
  }

  return value as T;
}

/**
 * Set a context value on the current owner.
 *
 * @throws `NoOwnerError` if there's no owner at the time of call.
 */
export function setContext<T>(
  context: Context<T>,
  value?: T,
  owner: Owner | null = getOwner(),
): void {
  if (!owner) {
    throw new NoOwnerError();
  }

  const resolved = value === undefined ? context.defaultValue : value;
  provideOn(owner, context.id, () => resolved);
}

/**
 * Check if a context has been set on the owner or its ancestors.
 */
export function hasContext<T>(context: Context<T>, owner: Owner | null = getOwner()): boolean {
  if (!owner) return false;
  return lookupContext(owner, context.id) !== CONTEXT_MISS;
}

/**
 * What a scope stores for a context key is a Cell. Every write site
 * that can take a plain value wraps here, so a stored function is always the
 * Cell and never a value that happens to be callable — the ambiguity that had
 * `getContext` hand back the accessor while `read` handed back its result.
 */
export function cellOf(value: unknown): () => unknown {
  return typeof value === "function" ? (value as () => unknown) : (): unknown => value;
}

/**
 * The user-facing context read, returning a Cell: the same rule applied to the
 * context channel, and the form every compiled read takes.
 *
 * The name is Solid's, and so is the split: `@solidjs/signals` marks its
 * `getContext(ctx, owner?)` `@internal` and says "the user-facing read API is
 * `useContext` (in `solid-js`), which wraps this primitive". `getContext` above
 * is that low-level owner-targeted read and answers with the VALUE; this one is
 * what components call, and it answers with the accessor so the read stays
 * live. Two readers, two questions.
 */
export function useContext<T>(context: Context<T>): () => T {
  const stored = lookupContext(getOwner(), context.id);

  if (stored !== CONTEXT_MISS) {
    return cellOf(stored) as () => T;
  }

  if (context.defaultValue !== undefined) {
    return () => context.defaultValue as T;
  }

  throw contextNotFound(context);
}

/**
 * The engine's miss, saying WHICH context. Its own message is the same for
 * every context, and the description `createContext` was given is the only
 * thing that tells one missing provider from another.
 */
export function contextNotFound(context: { readonly id: symbol }): ContextNotFoundError {
  const error = new ContextNotFoundError();
  const name = context.id.description;
  if (name !== undefined && name !== "context") {
    error.message =
      `The context \`${name}\` was read with no provider above the component that reads it, ` +
      `so there is no value to return. Wrap that component in the context, as in ` +
      `\`<Theme value={…}>\`, or ` +
      `give \`createContext\` a default value. ${error.message}`;
  }
  return error;
}

// ============================================================================
// The renderer's own effect, and the one gated creator
// ============================================================================

let effectsAllocated = 0;

/**
 * The other half of the flag gate: `STATIC_KEY` skips an effect and no scope,
 * so `scopeAllocations` cannot see it and only a wall-clock number was left.
 */
export function effectAllocations(): number {
  return effectsAllocated;
}

/**
 * The error as the application threw it. One that left a computation is
 * carried by the engine in a wrapper naming the node it left, with the
 * original as its cause; a boundary hands on what is inside. The engine's own
 * boundaries do this through their accessor, and this is the same step for
 * code that catches a read with `try`.
 */
export function thrownBy(error: unknown): unknown {
  return error instanceof Error && "source" in error && error.cause !== undefined
    ? error.cause
    : error;
}

/**
 * Tell the ownership trace which owner a reactive node was created under. The
 * node is only nameable from inside its own compute, where it is the ambient
 * owner, so the first run reports it.
 */
function traced<V>(compute: (prev: V) => V, kind: "render" | "pure"): (prev: V) => V {
  const creator = getOwner();
  let reported = false;
  return (prev) => {
    if (!reported) {
      reported = true;
      const node = getOwner();
      if (node !== null) OWNERSHIP.sink?.own(node, creator, kind);
    }
    return compute(prev);
  };
}

/**
 * The render effect every binding and every region is built on: `compute`
 * reads, `apply` writes the DOM once the pass has committed. It is the engine's
 * `createRenderEffect` plus the two counters the renderer is measured by.
 */
export function renderEffect<T>(
  compute: (prev: T | undefined) => T,
  apply: (value: T, prev: T | undefined) => void | (() => void),
): void {
  effectsAllocated++;
  const run = (OWNERSHIP.sink !== null ? traced(compute, "render") : compute) as typeof compute;
  if (hydrating() && claiming !== null) {
    claiming(run, apply);
    return;
  }
  createRenderEffect<T>(run as never, apply);
}

/**
 * A render effect owned by `given`. Entering `given` makes it current and the
 * build untracked; when it already is both, entering it again changes nothing,
 * and every binding of every row would pay two closures and a `runWithOwner`
 * for it. A disposed `given` still goes through `runWithOwner`, whose
 * development build reports it.
 */
export function effectUnder<T>(
  given: Scope | null,
  origin: string,
  compute: (prev: T | undefined) => T,
  apply: (value: T, prev: T | undefined) => void | (() => void),
): void {
  if (given === null || (given === getOwner() && getObserver() === null && !isDisposed(given))) {
    renderEffect(compute, apply);
    return;
  }
  underScope(given, origin, () => renderEffect(compute, apply));
}

/**
 * O4.5 for the element-binding channel: the effect belongs to the scope the
 * enclosing Block was HANDED, not to whatever the call site left current.
 *
 * This is what the compiled attribute/class/style/domprop path emits, and it
 * used to emit a bare `renderEffect(compute, apply)` taking no scope at all —
 * so `insert` and `setProp` honoured the argument while the channel beside them
 * followed `CURRENT`, and one component could split its ownership across two
 * scopes. The scope-first shape makes a mistiming a missing argument rather
 * than a silent reparent, and it is why `brand` can see these components: a
 * body whose only reactive work is an element binding now names `_s$`.
 */
export function bindEffect<T>(
  compute: (prev: T | undefined) => T,
  apply: (value: T, prev: T | undefined) => void | (() => void),
): void {
  effectUnder(getOwner(), "bindEffect", compute, apply);
}

/**
 * `claimEffect`, installed by `hydrate` so a page that never hydrates does not
 * ship it. Nothing hydrates before `hydrate` has run, which installs it first.
 */
let claiming: typeof claimEffect | null = null;

export function installClaimEffect(): void {
  claiming = claimEffect;
}

const ABANDONED: unique symbol = Symbol("abandoned");

/**
 * A render effect created while a claim is live, whose reads may carry a
 * mismatch raised inside a computation: a list row, a boundary's fallback. A
 * render effect is where the engine treats an error nothing caught as a crash,
 * halting every update and reporting it to `window.onerror`, so the mismatch
 * is handed to `hydrate` here instead and the effect writes nothing.
 */
function claimEffect<T>(
  compute: (prev: T | undefined) => T,
  apply: (value: T, prev: T | undefined) => void | (() => void),
): void {
  createRenderEffect<T | typeof ABANDONED>(
    (prev: T | typeof ABANDONED | undefined) => {
      try {
        return compute(prev === ABANDONED ? undefined : prev);
      } catch (error) {
        const mismatch = mismatchIn(error);
        if (mismatch === null || !abandonClaim(mismatch)) throw error;
        return ABANDONED;
      }
    },
    (value: T | typeof ABANDONED, prev: T | typeof ABANDONED | undefined) => {
      if (value === ABANDONED) return;
      return apply(value, prev === ABANDONED ? undefined : prev);
    },
  );
}

/**
 * `createMemo` for the runtime's own bookkeeping.
 *
 * It takes no position. A memo only one backend needs, counted, moved every
 * key and id declared after it on that side and on no other.
 */
export function internalMemo<T>(
  compute: (prev: T | undefined) => T,
  options?: MemoOptions<T>,
): SourceAccessor<T> {
  return engineCreateMemo<T>(
    (OWNERSHIP.sink !== null ? traced(compute as never, "pure") : compute) as never,
    options,
  );
}

/**
 * `createMemo`, with one branch in front of it.
 *
 * While a server render is open, a seed payload is on the page, or a test has
 * asked, an async memo's answers are followed: `settle` can wait for them and,
 * under the memo's id, they cross from the server to the client. Otherwise this
 * is the engine's function and nothing else, which is how `solid-js` gates its
 * own creators for hydration.
 *
 * The id is the memo's position among the scopes and declarations of its
 * render. A position is not an identity: if the client tree diverges from the
 * server's, the ids after the divergence shift, and a read can claim the value
 * recorded for a DIFFERENT call. `name` folds an identity into the id — siblings only have to differ
 * from each other, and a drifted key then misses and refetches instead of
 * seeding the wrong value. `key` replaces it outright and has to be unique
 * across the page. `unclaimedSeeds()` reports the drift after the fact.
 */
export const createMemo: {
  <T>(
    compute: (prev: T) => T | PromiseLike<T> | AsyncIterable<T>,
    options: MemoOptions<T> & HydrationOptions & { loadingValue: T },
  ): SourceAccessor<T>;
  <T>(
    compute: (prev: T | undefined) => T | PromiseLike<T> | AsyncIterable<T>,
    options?: MemoOptions<T> & HydrationOptions,
  ): SourceAccessor<T>;
} = <T>(
  compute: (prev: T | undefined) => T | PromiseLike<T> | AsyncIterable<T>,
  options?: MemoOptions<T> & HydrationOptions,
): SourceAccessor<T> => {
  let fn = compute;
  const source = options?.ssrSource;
  if (seeding() || (source !== undefined && source !== "server" && hydrating())) {
    fn = asyncAware(fn, options);
  }
  if (OWNERSHIP.sink !== null) fn = traced(fn as never, "pure") as typeof fn;
  return engineCreateMemo<T>(fn as never, options);
};

/**
 * Where a memo's value comes from across a server render, Solid 2.0's
 * per-memo options. `ssrSource`:
 *
 * - `"server"`, the default: the server's value is seeded and the browser
 *   adopts it without running the compute.
 * - `"hybrid"`: the same, and a compute that returns an async iterable is run
 *   again in the browser once the page has been claimed, continuing the
 *   stream from the server's value. Its first yield repeats that value and is
 *   dropped.
 * - `"client"`: the server never runs the compute. It renders the memo's
 *   `loadingValue` when one is declared, and otherwise the memo never settles
 *   there and the `<Loading>` around it ships its fallback. The browser runs
 *   the compute once the page has been claimed.
 *
 * `deferStream` holds a streamed shell until the memo's first value has
 * settled, so the `<Loading>` around it renders its content into the shell
 * instead of its fallback. It means nothing in the browser.
 */
export interface HydrationOptions {
  /** The seed key, in place of the memo's position. Unique across the page. */
  readonly key?: string;
  readonly ssrSource?: "server" | "hybrid" | "client";
  readonly deferStream?: boolean;
}

let following = false;

/** The payload a server render left on the page, while any of it is unclaimed. */
function seeds(): Record<string, unknown> | undefined {
  return (globalThis as { __BARQ_DATA__?: Record<string, unknown> }).__BARQ_DATA__;
}

/** Whether async values declared now are followed, and so need a key. */
function seeding(): boolean {
  return (
    following || activeAsyncSession !== null || hydrationData.size !== 0 || seeds() !== undefined
  );
}

/**
 * Follow async memos created from here on, so `settle` can wait for them. A
 * server render and a hydrating page turn this on for themselves; a test turns
 * it on to await a graph it built by hand.
 */
export function followAsync(on: boolean): boolean {
  const was = following;
  following = on;
  return was;
}

// ============================================================================
// Async values across a server render
// ============================================================================

/** In-flight async computations, stamped with the session that started them */
const inFlight = new Map<PromiseLike<unknown>, symbol | null>();

/**
 * The flight each async memo is waiting on, by the engine node that owns it.
 *
 * A `NotReadyError` names the node it came from, so this is how a reader finds
 * the promise to wait for when the flight is not its own session's: a memo two
 * renders share is stamped with whichever declared it.
 */
const flights = new WeakMap<object, PromiseLike<unknown>>();

/** What a `NotReadyError` says about itself: the engine node that threw it. */
interface Unready {
  readonly source: unknown;
}

/** The flight a `NotReadyError` is waiting on, while it is still in the air. */
function flightOf(error: Unready): PromiseLike<unknown> | undefined {
  const source = error.source;
  return typeof source === "object" && source !== null ? flights.get(source) : undefined;
}

/**
 * Promises/A+ shape. `instanceof Promise` is a test about the CONSTRUCTOR, and
 * a thenable from another realm, another library, or a transpiled async
 * function is none the less awaitable — `await` itself asks this question, so a
 * reactivity core that asks the narrower one disagrees with the language.
 */
function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as PromiseLike<unknown>).then === "function"
  );
}

/** Resolved values of keyed async computeds, bucketed by session (SSR) */
const hydrationData = new Map<symbol | null, Map<string, unknown>>();

/**
 * The bucket a session records into, opened on first use.
 *
 * The bucket is also the session's lifetime. `clearHydrationData` drops it, and
 * whatever was declared against it can tell from then on that its render has
 * ended, even when the same symbol is in use again.
 */
function recordsOf(session: symbol): Map<string, unknown> {
  let bucket = hydrationData.get(session);
  if (bucket === undefined) {
    bucket = new Map();
    hydrationData.set(session, bucket);
  }
  return bucket;
}

/**
 * A keyed async value this session has STARTED and not yet settled.
 *
 * Solid's shape. `registerFragment` writes the key into the payload the moment
 * a boundary parks, with the promise still pending, so the client's store holds
 * a PROMISE rather than a hole and the read of that promise IS the wait: an
 * unsettled key is a promise on the wire, and the ordinary async path awaits it
 * because a `compute` that returns a promise is already an async node.
 */
interface PendingSeed {
  readonly promise: Promise<unknown>;
  resolve(value: unknown): void;
  reject(error: unknown): void;
  /**
   * Whether no flight stands behind the promise any more.
   *
   * A compute that reads a value still in flight is rejected with
   * `NotReadyError` before it fetched anything. The string backend builds a
   * parked body again rather than re-asking the memo that failed, so nothing
   * will ever settle the seed on that memo's behalf: the next declaration of
   * the key has to run for itself, and settles this same promise when it does.
   */
  vacant: boolean;
}

const pendingSeeds = new Map<symbol | null, Map<string, PendingSeed>>();

/**
 * What a pending seed the server gave up on RESOLVES with, so the read that is
 * waiting fetches rather than failing.
 *
 * Resolved and not rejected, which is not a style choice: the promise goes on
 * the wire through seroval, and on the client nobody is awaiting it until a read
 * happens to want that key. A rejection with no handler is an unhandled
 * rejection — a console error in the browser and a process kill on Node.
 *
 * Absent is not an error either way: it is what a page with no seed at all
 * answers with, and the read's job is to fetch.
 */
export const SEED_ABANDONED = "__barq_seed_abandoned__";

export function isAbandonedSeed(value: unknown): boolean {
  return typeof value === "object" && value !== null && SEED_ABANDONED in value;
}

function openPendingSeed(session: symbol, key: string): PendingSeed {
  let bucket = pendingSeeds.get(session);
  if (bucket === undefined) {
    bucket = new Map();
    pendingSeeds.set(session, bucket);
  }
  const open = bucket.get(key);
  if (open !== undefined) return open;
  let settleWith!: (value: unknown) => void;
  let failWith!: (error: unknown) => void;
  const promise = new Promise<unknown>((res, rej) => {
    settleWith = res;
    failWith = rej;
  });
  // Nobody may be awaiting this yet — it exists to be SERIALIZED — and an
  // unhandled rejection would take the process down on Node. A FAILED value is
  // the one case that still rejects, and it rejects on both sides by design.
  promise.catch(() => undefined);
  const seed: PendingSeed = { promise, resolve: settleWith, reject: failWith, vacant: false };
  bucket.set(key, seed);
  return seed;
}

/**
 * The promises to put on the wire for keys still in flight, so the client waits
 * on them instead of finding a hole and refetching.
 */
export function pendingSeedsOf(session?: symbol): Record<string, Promise<unknown>> {
  const bucket = pendingSeeds.get(session ?? null);
  if (bucket === undefined) return {};
  const kept = unhydrated.get(session ?? null);
  const out: Record<string, Promise<unknown>> = {};
  for (const [key, seed] of bucket) if (kept?.has(key) !== true) out[key] = seed.promise;
  return out;
}

/** The keys each session declared under `<NoHydration>`, which never reach the page. */
const unhydrated = new Map<symbol | null, Set<string>>();

/**
 * Give up on every key this session never sent, so no client read waits for a
 * value that is not coming. This is what Solid's `_$HY.done` is for; per-key
 * rather than one global flag, because the read that has to fall back is the
 * one whose key was abandoned and not every read on the page.
 */
export function abandonPendingSeeds(session?: symbol): void {
  const key = session ?? null;
  const bucket = pendingSeeds.get(key);
  if (bucket === undefined) return;
  for (const [, seed] of bucket) seed.resolve({ [SEED_ABANDONED]: 1 });
  pendingSeeds.delete(key);
}

/**
 * The render whose own code is running right now, for code no owner speaks for.
 *
 * One slot for the whole process, so it is only ever right inside a stretch
 * that does not yield: a render building its tree, a boundary being resumed, a
 * compute being run. Anything that awaits has to let go of it first and take it
 * again afterwards, because every other request runs in the gap.
 */
let activeAsyncSession: symbol | null = null;

/**
 * Name the render the code that follows belongs to, and answer with the one
 * named before so the caller can put it back. Bracket synchronous code only.
 */
export function setAsyncSession(session: symbol | null): symbol | null {
  const prev = activeAsyncSession;
  activeAsyncSession = session;
  return prev;
}

/** Whether the code running now is part of a server render. */
export function serverRendering(): boolean {
  return activeAsyncSession !== null;
}

/** The server render the calling owner belongs to, while that render is still open. */
export function currentRenderSession(): symbol | null {
  const session = declaringSession(getOwner());
  return session !== null && hydrationData.has(session) ? session : null;
}

/**
 * The render a root was opened for. Every scope and computation below the root
 * inherits it, which is how a declaration made long after the render's own
 * bracket has closed, by a recompute the engine scheduled or another render's
 * flush happened to run, still finds the render it belongs to.
 */
const RENDER_SESSION = engineCreateContext<symbol | null>(null);

/**
 * The session a declaration made here belongs to: its render's, when the owner
 * it is made under came from one, and the bracketed one otherwise. A render
 * that has ended is nobody, and what is declared under it afterwards is not
 * handed to whichever render is current instead.
 */
function declaringSession(owner: Owner | null): symbol | null {
  if (owner !== null) {
    const carried = engineGetContext(RENDER_SESSION, owner);
    if (carried !== null) return hydrationData.has(carried) ? carried : null;
  }
  return activeAsyncSession;
}

/**
 * Set on the scope a `<NoHydration>` opens, and cleared on the one a nested
 * `<Hydration>` opens in a server render.
 */
const NO_HYDRATE = engineCreateContext<boolean>(false);

/** Mark whether what is declared under `scope` reaches a hydrating client. */
export function setHydratable(scope: Scope, hydratable: boolean): void {
  engineSetContext(NO_HYDRATE, !hydratable, scope);
}

function underNoHydration(owner: Owner): boolean {
  return engineGetContext(NO_HYDRATE, owner);
}

/**
 * Solid 2.0's `isHydratable`: whether the calling owner sits where hydration
 * applies, so a value keyed to this position reaches a hydrating client.
 * `false` under `<NoHydration>`, `true` again under a nested `<Hydration>` in
 * a server render, and `false` with no owner. On the server the owner must also
 * belong to a render in progress. On the client `<Hydration>` is a passthrough,
 * so inside a `<NoHydration>` zone this stays `false` even under one.
 *
 * barq decides this itself for its own async values. A library that carries
 * values of its own from the server reads it to make the same decision.
 */
export function isHydratable(): boolean {
  const owner = getOwner();
  if (owner === null || underNoHydration(owner)) return false;
  const carried = engineGetContext(RENDER_SESSION, owner);
  if (carried !== null) return hydrationData.has(carried);
  // No render above it: the client's answer where there is a document, and
  // the server's outside a render where there is none. Asked at the call
  // rather than once at load, so a DOM a test registers later is seen.
  return "document" in globalThis;
}

/**
 * The scope a server render's `<Hydration>` opens under a `<NoHydration>`, or
 * `null` where `<Hydration>` passes its children through: on the client, and
 * outside a `<NoHydration>`.
 *
 * Numbered as a root of its own under `renderId`, because the client claims
 * this markup with a root of its own: `hydrate(fn, container, { renderId })`
 * over the element that holds it, which is numbered the same way.
 */
export function hydrationScope(owner: Scope | null, renderId: string): Scope | null {
  if (owner === null || !underNoHydration(owner)) return null;
  if (declaringSession(owner) === null) return null;
  const scope = childScope(owner);
  engineSetContext(NUMBERING, numberingAt(nextRootId(renderId)), scope);
  setHydratable(scope, true);
  return scope;
}

/** Client: the payload a server render's seed script assigned, if present */
function getSeed(key: string): { found: boolean; value?: unknown } {
  const store = (globalThis as { __BARQ_DATA__?: Record<string, unknown> }).__BARQ_DATA__;
  if (store && Object.hasOwn(store, key)) {
    const value = store[key];
    delete store[key]; // consume: a later refresh() refetches for real
    return { found: true, value };
  }
  return { found: false };
}

/**
 * What a compute that must not run yet answers with: a flight that never
 * lands. A synchronous answer would be the memo's first value, which a bare
 * memo would commit as `undefined` and a declared one would take in place of
 * its `loadingValue`. A later run supersedes it, so its callbacks never fire.
 */
const UNASKED: PromiseLike<never> = new Promise<never>(() => {});

/**
 * The seed a `"hybrid"` memo whose compute returned an async iterable is sent
 * as, so the browser knows to continue the stream rather than adopt the value
 * and stop. Only the server knows the compute's shape: asking in the browser
 * would mean calling it, which for a promise is the fetch the seed saves.
 */
const LIVE_SEED = "__barq_live__";

function liveSeed(value: unknown): { live: boolean; value: unknown } {
  if (typeof value === "object" && value !== null && LIVE_SEED in value) {
    return { live: true, value: (value as Record<string, unknown>)[LIVE_SEED] };
  }
  return { live: false, value };
}

/** The keys each server render declared `"hybrid"`, whose values are sent as live seeds. */
const liveKeys = new Map<symbol, Set<string>>();

/** Flights a streamed shell waits for: those of `deferStream` memos, by render. */
const deferred = new Map<symbol, Set<PromiseLike<unknown>>>();

/** What a streamed shell is still waiting on before it may flush. */
export function deferredFlightsOf(session: symbol): PromiseLike<unknown>[] {
  return [...(deferred.get(session) ?? [])];
}

function holdShell(session: symbol, promise: PromiseLike<unknown>): void {
  let held = deferred.get(session);
  if (held === undefined) deferred.set(session, (held = new Set()));
  held.add(promise);
  const release = (): void => {
    held.delete(promise);
    if (held.size === 0 && deferred.get(session) === held) deferred.delete(session);
  };
  promise.then(release, release);
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] === "function"
  );
}

/**
 * A stream continued from the value the page was served: that value first, in
 * the same turn, so the memo reads settled through the handoff, then the
 * source's own first yield, which repeats it and lands as an equal write, then
 * everything after.
 */
function continuedFrom<T>(source: AsyncIterable<T>, adopted: T): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator](): AsyncIterator<T> {
      const inner = source[Symbol.asyncIterator]();
      let step = 0;
      return {
        next: () => {
          if (step === 0) {
            step = 1;
            // A bare result, not a promise: the engine takes it as a step that
            // has already settled, as `for await` does, so it lands in this turn.
            return { done: false, value: adopted } as unknown as Promise<IteratorResult<T>>;
          }
          const pulled = Promise.resolve(inner.next());
          if (step === 1) {
            step = 2;
            return pulled.then((first) =>
              first.done === true ? first : { done: false, value: adopted },
            );
          }
          return pulled;
        },
        return: (value?: unknown) =>
          inner.return === undefined
            ? Promise.resolve({ done: true, value: value as T })
            : Promise.resolve(inner.return(value)),
      };
    },
  };
}

/**
 * Wrap a compute so its async answers are visible to `settle` and, under a key,
 * cross from the server to the client.
 *
 * The session is taken where the value is DECLARED and kept. The engine's flush
 * is one for the whole process: a re-ask it schedules on its own microtask runs
 * outside any render's bracket, and one that is pending while another render
 * flushes runs inside that render's. Neither is where the value belongs.
 */
function asyncAware<T>(
  fn: (prev: T | undefined) => T | PromiseLike<T> | AsyncIterable<T>,
  options: (MemoOptions<T> & HydrationOptions) | undefined,
): (prev: T | undefined) => T | PromiseLike<T> | AsyncIterable<T> {
  const explicitKey = options?.key;
  const name = options?.name;
  const source = options?.ssrSource ?? "server";
  const holdsShell = options?.deferStream === true;
  const owner = getOwner();
  const declaredIn = declaringSession(owner);
  const records = declaredIn === null ? null : recordsOf(declaredIn);
  // A position is taken whether or not the value is keyed by hand, so keying
  // one read does not move the reads declared after it.
  const numbering = owner === null ? null : engineGetContext(NUMBERING, owner);
  const position = numbering === null ? undefined : positionUnder(numbering, numbering.values++);
  const key =
    explicitKey ??
    (position === undefined ? undefined : name === undefined ? position : `${position}~${name}`);
  // Under `<NoHydration>` nothing claims the value. The key still serves the
  // render's own resumes, which find the flight a parked body started by it,
  // and is kept off the page.
  if (key !== undefined && declaredIn !== null && owner !== null && underNoHydration(owner)) {
    let keys = unhydrated.get(declaredIn);
    if (keys === undefined) unhydrated.set(declaredIn, (keys = new Set()));
    keys.add(key);
  }
  // The browser's half of `"client"` and `"hybrid"`: shut while the page is
  // claimed, and opened a microtask after the claim pass, which is when the
  // compute may run against the browser. The claim pass is synchronous to its
  // end, so a microtask is after it and before anything paints.
  let gate: (() => boolean) | null = null;
  if (declaredIn === null && source !== "server" && hydrating()) {
    const [opened, open] = engineCreateSignal(false);
    gate = opened;
    queueMicrotask(() => open(true));
  }
  // A `"hybrid"` memo that adopted a live seed, until its stream is continued.
  let handoff = false;
  let first = true;

  const adopt = (value: unknown): T => {
    const seeded = liveSeed(value);
    if (seeded.live && source === "hybrid" && gate !== null) {
      handoff = true;
      // Read so that opening the gate runs the compute again.
      gate();
    }
    return seeded.value as T;
  };

  const run = (prev: T | undefined, session: symbol | null): ReturnType<typeof fn> => {
    const node = getOwner();
    if (source === "client") {
      // The server never runs it, and nothing waits for it there.
      if (declaredIn !== null) return UNASKED;
      if (gate !== null && !gate()) return UNASKED;
      first = false;
    }
    if (handoff && gate !== null && gate()) {
      handoff = false;
      const continued = fn(prev);
      return isAsyncIterable(continued)
        ? followStream(continuedFrom(continued, prev as T), session, undefined, node, false)
        : continued;
    }
    if (first) {
      first = false;
      if (key !== undefined) {
        // What THIS render already has for the key, so a second declaration of
        // it inside the same render answers rather than fetching again. It is
        // the session's own recorded output and is not consumed, because
        // `getHydrationData` still has to emit it.
        //
        // Session-scoped, and deliberately never the `null` bucket: on the
        // client the session is null and a hit here would let one keyed read
        // answer another's, defeating the consume-on-read that makes
        // `refresh()` refetch for real.
        if (session !== null && records !== null) {
          if (records.has(key)) return records.get(key) as T;
          // Asked and not answered yet: the string backend builds a parked
          // boundary's body again on every resume, and the declaration inside
          // it joins the flight the first build started.
          const asked = pendingSeeds.get(session)?.get(key);
          if (asked !== undefined && !asked.vacant) {
            return follow(
              asked.promise.then((arrived) => {
                if (isAbandonedSeed(arrived)) return fn(prev) as T | PromiseLike<T>;
                return arrived as T;
              }),
              session,
              undefined,
              node,
              holdsShell,
            );
          }
        }
        const seed = getSeed(key);
        if (seed.found) {
          const value = seed.value;
          // A seeded value may be a PROMISE: the server writes a key the moment
          // its flight starts, so a boundary that had not settled when the shell
          // flushed is on the wire as something to await rather than as a hole.
          if (isThenable(value)) {
            // A promise the stream has already settled carries seroval's stamp,
            // `s` 1 for a value and 2 for a failure and `v` what it settled on.
            // Read now, so the content builds in the pass that claims the
            // server's markup for it: a `.then` answers a microtask too late,
            // and a failure the server rendered an error boundary for would
            // otherwise reach the client as content that is not ready yet.
            const stamped = value as { s?: unknown; v?: unknown };
            if (stamped.s === 2) throw stamped.v;
            if (stamped.s === 1 && !isAbandonedSeed(stamped.v)) return adopt(stamped.v);
            // Followed without a key: the wait is this read's own work, and
            // what arrives is the server's value, already on the page.
            return follow(
              (value as PromiseLike<T>).then((arrived: unknown) => {
                // The server gave up on this key: fetch it, which is what a
                // page with no seed at all does.
                if (isAbandonedSeed(arrived)) return fn(prev) as T | PromiseLike<T>;
                return liveSeed(arrived).value as T;
              }),
              session,
              undefined,
              node,
              false,
            );
          }
          return adopt(value);
        }
      }
    }

    const result = fn(prev);
    if (typeof result !== "object" || result === null) return result;
    if (isThenable(result)) return follow(result, session, key, node, holdsShell);
    if (isAsyncIterable(result)) {
      if (source === "hybrid" && key !== undefined && session !== null) {
        let keys = liveKeys.get(session);
        if (keys === undefined) liveKeys.set(session, (keys = new Set()));
        keys.add(key);
      }
      // A live connection's render reads its sources through the
      // connection's seats, where the render before it left them.
      const shared = sharedSourcesOf(declaredIn);
      return followStream(
        shared === undefined ? result : shared.seat(result),
        session,
        key,
        node,
        holdsShell,
      );
    }
    return result;
  };

  return (prev) => {
    // A render that has ended dropped its bucket, and what it declared is
    // nobody's from then on.
    const session =
      declaredIn !== null && hydrationData.get(declaredIn) === records ? declaredIn : null;
    if (session === activeAsyncSession) return run(prev, session);
    // Whoever is flushing is not who this value belongs to, and what the
    // compute declares in passing, under a root of its own with no render
    // above it, has only the slot to go by.
    const outer = activeAsyncSession;
    activeAsyncSession = session;
    try {
      return run(prev, session);
    } finally {
      activeAsyncSession = outer;
    }
  };
}

const IGNORE = (): void => {};

function follow<T>(
  promise: PromiseLike<T>,
  session: symbol | null,
  key: string | undefined,
  node: object | null,
  holdsShell: boolean,
): PromiseLike<T> {
  inFlight.set(promise, session);
  if (node !== null) flights.set(node, promise);
  if (holdsShell && session !== null) holdShell(session, promise);
  const landed = (): void => {
    inFlight.delete(promise);
    if (node !== null && flights.get(node) === promise) flights.delete(node);
  };
  if (key === undefined || session === null) {
    promise.then(landed, landed);
    return promise;
  }
  const records = recordsOf(session);
  const seed = openPendingSeed(session, key);
  seed.vacant = false;
  promise.then(
    (value) => {
      landed();
      // An answer that arrives after its render has ended is dropped: the
      // bucket it would be written to is one nothing will clear again.
      if (hydrationData.get(session) === records) records.set(key, value);
      seed.resolve(value);
    },
    (error: unknown) => {
      landed();
      // Not an answer: the compute read a value that is still in flight.
      // Rejected with this, every later declaration of the key joined a wait
      // on a node from a build that is gone.
      if (error instanceof NotReadyError) {
        seed.vacant = true;
        return;
      }
      seed.reject(error);
    },
  );
  return promise;
}

/**
 * A stream is in flight until its FIRST yield and a changing value from then
 * on, so that is all `settle` waits for: a producer that never finishes must
 * not hold a render open.
 */
function followStream<T>(
  source: AsyncIterable<T>,
  session: symbol | null,
  key: string | undefined,
  node: object | null,
  holdsShell: boolean,
): AsyncIterable<T> {
  let answered!: (value: unknown) => void;
  const firstAnswer = new Promise<unknown>((res) => {
    answered = res;
  });
  inFlight.set(firstAnswer, session);
  if (node !== null) flights.set(node, firstAnswer);
  if (holdsShell && session !== null) holdShell(session, firstAnswer);
  const firstAnswered = (value: unknown): void => {
    inFlight.delete(firstAnswer);
    if (node !== null && flights.get(node) === firstAnswer) flights.delete(node);
    answered(value);
  };
  const records = key === undefined || session === null ? null : recordsOf(session);
  return {
    [Symbol.asyncIterator](): AsyncIterator<T> {
      const inner = source[Symbol.asyncIterator]();
      const landed = (step: IteratorResult<T>): IteratorResult<T> => {
        if (
          !step.done &&
          key !== undefined &&
          records !== null &&
          hydrationData.get(session) === records
        ) {
          records.set(key, step.value);
        }
        firstAnswered(step.value);
        return step;
      };
      return {
        next: () => {
          const pulled = inner.next();
          // A step that has already settled stays one: the engine reads a bare
          // result in the turn it is pulled, and a promise around it would cost
          // the read a suspension for a value that is here.
          if (!isThenable(pulled)) return landed(pulled) as unknown as Promise<IteratorResult<T>>;
          return Promise.resolve(pulled).then(landed, (error: unknown) => {
            firstAnswered(undefined);
            throw error;
          });
        },
        return: (value?: unknown) => {
          firstAnswered(undefined);
          return inner.return !== undefined
            ? Promise.resolve(inner.return(value))
            : Promise.resolve({ done: true, value: undefined as T });
        },
      };
    },
  };
}

/**
 * Un-attributed promises a `settle` has already waited a full turn on.
 *
 * Pruned against `inFlight`, which drops a promise when it settles, so this
 * holds only work that is genuinely outstanding.
 */
const abandoned = new Set<PromiseLike<unknown>>();

function inFlightOf(
  session: symbol | undefined,
  stale?: Set<PromiseLike<unknown>>,
): PromiseLike<unknown>[] {
  if (stale !== undefined) {
    for (const promise of stale) {
      if (!inFlight.has(promise)) stale.delete(promise);
    }
  }
  const waiting: PromiseLike<unknown>[] = [];
  for (const [promise, from] of inFlight) {
    // A render waits for its own work and nothing else. A memo keeps the
    // session it was declared in, so a re-ask the engine schedules later is
    // still the render's; what belongs to no render is some other page's, or a
    // test's, and one promise there that never settles must not hold this one.
    if (session !== undefined) {
      if (from === session) waiting.push(promise);
      continue;
    }
    if (from === null && stale?.has(promise) === true) continue;
    waiting.push(promise);
  }
  return waiting;
}

/**
 * Wait until the reactive graph is quiet: flushes synchronously, awaits
 * in-flight async computations, and repeats until nothing remains
 * (covers async waterfalls). The backbone of renderToStringAsync; also
 * handy in tests.
 *
 * With `session`, only waits for fetches attributed to that session (see
 * setAsyncSession) - required on servers where concurrent renders share
 * the module graph.
 */
export async function settle(session?: symbol): Promise<void> {
  flush();
  while (true) {
    const waiting = inFlightOf(session, abandoned);
    if (waiting.length === 0) break;
    // With no session named, un-attributed work gets ONE turn, recorded before
    // the await rather than after, because the await may never return: a
    // promise nobody ever settles stays in `inFlight` for the life of the
    // process, and every later `settle()` would otherwise wait on it forever.
    if (session === undefined) {
      for (const [promise, from] of inFlight) {
        if (from === null) abandoned.add(promise);
      }
    }
    await Promise.allSettled(waiting);
    flush();
  }
}

/**
 * One step of `settle`: wait for the FIRST of this session's in-flight promises,
 * then flush. `false` when nothing was in flight.
 *
 * Streaming needs the step and not the fixpoint. `settle` returns only once
 * every promise in the session has settled, so a stream driven by it holds every
 * parked boundary until the SLOWEST one resolves.
 *
 * `parkedOn` is what the caller's own reads threw. A read of a value another
 * render declared is waiting on a flight this session never started, and the
 * error is the only thing that names it.
 */
export async function settleStep(
  session?: symbol,
  parkedOn: readonly Unready[] = [],
): Promise<boolean> {
  flush();
  const waiting = inFlightOf(session);
  for (const error of parkedOn) {
    const flight = flightOf(error);
    if (flight !== undefined && !waiting.includes(flight)) waiting.push(flight);
  }
  if (waiting.length === 0) return false;
  await Promise.race(waiting.map(landing));
  flush();
  return true;
}

/**
 * When a flight has something to say.
 *
 * A compute that read a value still in flight is rejected with `NotReadyError`
 * at once, having fetched nothing. Counted as an answer, it woke the caller,
 * whose rebuild declared the same compute and was rejected the same way: a
 * loop of microtasks in which the timer the first value was waiting on never
 * ran. What that flight is waiting for is the one the error names.
 */
function landing(promise: PromiseLike<unknown>): PromiseLike<void> {
  return promise.then(IGNORE, (error: unknown) => {
    if (!(error instanceof NotReadyError)) return undefined;
    const upstream = flightOf(error);
    if (upstream !== undefined) return landing(upstream);
    // Nothing names what it waits on. A turn of the event loop rather than of
    // the microtask queue, so whatever it is has the chance to arrive.
    return new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

/**
 * SSR: resolved values of keyed async computeds, for serialization.
 * With a session, returns that render's values and only that render's: a value
 * that cannot be shown to belong to this render is not seeded into it.
 */
export function getHydrationData(session?: symbol): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const emit = (from: symbol | null, bucket: Map<string, unknown>): void => {
    const kept = unhydrated.get(from);
    const live = from === null ? undefined : liveKeys.get(from);
    for (const [key, value] of bucket) {
      if (kept?.has(key) === true) continue;
      result[key] = live?.has(key) === true ? { [LIVE_SEED]: value } : value;
    }
  };
  if (session !== undefined) {
    const bucket = hydrationData.get(session);
    if (bucket) emit(session, bucket);
    return result;
  }
  for (const [from, bucket] of hydrationData) emit(from, bucket);
  return result;
}

/** SSR: reset recorded async data (one session's, or everything) */
export function clearHydrationData(session?: symbol): void {
  if (session !== undefined) {
    hydrationData.delete(session);
    // And the unattributed bucket, which is nobody's and which nothing else
    // ever clears — a long-lived server otherwise accumulates every value ever
    // resolved outside a render.
    hydrationData.delete(null);
    // A fetch that never answers is still registered when its render ends, and
    // nothing else would ever let go of it.
    for (const [promise, from] of inFlight) {
      if (from === session) inFlight.delete(promise);
    }
    unhydrated.delete(session);
    unhydrated.delete(null);
    liveKeys.delete(session);
    deferred.delete(session);
  } else {
    hydrationData.clear();
    inFlight.clear();
    unhydrated.clear();
    liveKeys.clear();
    deferred.clear();
  }
  resetChildIds(session);
}

/**
 * Seeded values the client never claimed, reported once hydration has settled.
 *
 * An auto-key is a POSITION in the render's tree, so a client tree that is not the
 * server's shifts every key after the divergence: a read can then claim a value
 * recorded for a different call and resolve synchronously with it, which is
 * wrong data rather than a refetch. Nothing positional can tell those apart at
 * the moment of the read, but the leftovers prove it afterwards, because a
 * shifted tree always strands the tail of the payload.
 */
export function unclaimedSeeds(): string[] {
  const store = (globalThis as { __BARQ_DATA__?: Record<string, unknown> }).__BARQ_DATA__;
  const unclaimed = store === undefined ? [] : Object.keys(store);
  if (unclaimed.length !== 0) {
    emitDiagnostic({
      code: "HYDRATION_SEED_DRIFT",
      kind: "ssr",
      severity: "warn",
      message:
        `The server sent ${unclaimed.length} async ${unclaimed.length === 1 ? "value" : "values"} ` +
        `that no \`createMemo\` in the browser asked for (${unclaimed.join(", ")}). The browser ` +
        "rendered a different set of components than the server did, so an async memo may be " +
        "showing a value the server computed for another one. Render the same components on " +
        "both sides, and name each async memo so that a mismatch fetches again instead: " +
        '`createMemo(load, { name: "user" })`.',
      data: { keys: unclaimed },
    });
  }
  return unclaimed;
}
