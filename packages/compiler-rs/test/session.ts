/**
 * The L4 session driver — one render window, every graded channel read off it.
 *
 * the grade table replaces near-total equality with GRADED properties, and
 * three of the grades want observations the L1/L2/L3 drivers never took: which
 * nodes survived a transition, which scopes were still alive when the render was
 * disposed, and what was still registered against the outside world afterwards.
 * Taking them in three separate renders would mean three different renders being
 * described as one, so they are taken here, together, in a single window.
 *
 * What this driver adds over `harness.ts`'s `renderModule`:
 *
 *  - **Every step is applied TWICE.** The replay frame is what makes the
 *    metamorphic grade possible at all: it is the only frame in the whole oracle
 *    produced by an input the runtime has already seen.
 *  - **A no-op write pass**, before anything else moves: every signal the fixture
 *    exports is written its own current value. Nothing may change.
 *  - **The ownership trace runs INSIDE the same window**, so a lost node and a
 *    disposed scope are two facts about one transition rather than two renders.
 *  - **The window outlives the disposal.** Every leak probe is a question about
 *    what happened after `dispose()` returned, and a driver that closes at
 *    disposal cannot ask it.
 *
 * The compiled path is the only path here. A metamorphic property is a claim
 * about one implementation under a transform, not about two implementations
 * agreeing — which is the whole reason it needs no exemption when they do not.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { compileSource, loadModule, settle } from "./harness.ts";
import { normalizeChannels, resetIdentity } from "./normalize.ts";
import { beginTrace, endTrace, type Trace } from "./tracer.ts";

export const L4_DIR = join(import.meta.dir, "..", "fixtures", "l4");

export interface OwnershipEvent {
  seq: number;
  kind: "enter" | "exit" | "dispose" | "clone" | "block-enter" | "block-exit";
  scope: number;
  parent: number;
  label: string;
  scopeKind: string;
  owned: boolean;
}

/**
 * The `scopeKind` of the marker scope opened and disposed at every snapshot.
 *
 * A frame and a disposal are two facts about one transition, and the ownership
 * stream carries no timestamps a frame could be located against. So the frame
 * puts itself INTO the stream: one scope, entered, exited and disposed with
 * nothing under it, whose only purpose is to be findable. Splitting the stream
 * at these markers gives, per transition, exactly the scopes that came apart
 * during it.
 */
export const FRAME_MARKER = "l4-frame";

interface CoreLike {
  flush(): void;
  render(block: unknown, container: Node): () => void;
  scope<T>(fn: (dispose: () => void) => T, detached?: boolean, kind?: string): T;
  clearDelegatedEvents(): void;
  enter(parent: unknown, kind: string): object;
  exit(scope: object): void;
  dispose(scope: object): void;
  beginOwnershipTrace(): void;
  endOwnershipTrace(): OwnershipEvent[];
  DEV: {
    diagnostics: {
      capture(): { stop(): Array<{ code: string; severity: string; message: string }> };
    };
  };
}

/**
 * How a frame came about. The grade a property is checked at depends on it: a
 * `replay` frame is an input the runtime has already seen and is the only frame
 * the stability properties are stated against.
 */
export type FrameKind = "mount" | "noop" | "step" | "replay" | "event";

export interface SessionFrame {
  label: string;
  kind: FrameKind;
  /** the scripted step or event this frame belongs to; -1 for mount and noop */
  index: number;
  html: string;
  /** one ordinal per element, document order, stamped on first sight */
  identity: number[];
  anchors: number;
  /** ownership events recorded up to the instant of this snapshot */
  at: number;
}

export interface ListenerRecord {
  type: string;
  /** `document`, `window`, a tag name, or the constructor name for anything else */
  target: string;
  /** still registered when the window closed */
  outstanding: boolean;
  /** registered on `document`: module-scope delegation, not per-position state */
  delegated: boolean;
}

export interface SessionDiagnostic {
  code: string;
  severity: string;
  message: string;
}

export interface Session {
  fixture: string;
  code: string;
  /**
   * The loaded module's own exports. C7's falsification procedure needs an
   * INSTRUMENTED Block — a Block that records its own invocations — and the
   * recorder has to be the one the render actually called, not a copy.
   */
  exports: Record<string, unknown>;
  frames: SessionFrame[];
  /**
   * `Function.prototype.toString` of each scripted step, in order. The
   * metamorphic grade decides whether re-applying a step is the same INPUT from
   * the step's own text — `count.set(count() + 1)` is an increment and
   * `visible.set(false)` is not — and deciding it from the frames instead would
   * be the observation-gated premise the regrade exists to remove.
   */
  stepSources: string[];
  ownership: OwnershipEvent[];
  diagnostics: SessionDiagnostic[];
  /** scope ids that were entered inside the window and never disposed (O3.7) */
  scopesNeverDisposed: number[];
  /** how many scopes the window entered at all, so a silent zero is visible */
  scopesEntered: number;
  /** effect runs recorded AFTER `dispose()` returned, with every signal poked */
  effectRunsAfterDispose: number;
  /** effects the window created, so a zero above is attributable */
  effectsCreated: number;
  listeners: ListenerRecord[];
  /** prototypes the listener probe patched; zero means it observed nothing */
  listenerOwners: number;
  /** timers and microtasks whose callback ran after `dispose()` returned */
  asyncAfterDispose: number;
  /** timers and microtasks still scheduled when the window closed */
  asyncStillPending: number;
  /** template clones still attached to the document after disposal */
  clonesAttachedAfterDispose: number;
  /** the container's markup after disposal; the empty string is the rule */
  containerAfterDispose: string;
  /** what a poke after disposal threw, if anything */
  threwAfterDispose: string[];
}

export interface SessionOptions {
  /** compiler options, so a session can be taken at -O0 as well as -Ox */
  compile?: Record<string, unknown>;
  /** skip the double-application of each step; used by the mutation runner */
  replay?: boolean;
}

// ---------------------------------------------------------------------------
// signal discovery
// ---------------------------------------------------------------------------

interface WritableSignal {
  (): unknown;
  set(value: unknown): void;
}

function isWritableSignal(value: unknown): value is WritableSignal {
  return (
    typeof value === "function" &&
    typeof (value as { set?: unknown }).set === "function" &&
    (value as { length: number }).length === 0
  );
}

function exportedSignals(mod: Record<string, unknown>): WritableSignal[] {
  const found: WritableSignal[] = [];
  for (const key of Object.keys(mod)) {
    if (key === "default") continue;
    const value = mod[key];
    if (isWritableSignal(value)) found.push(value);
  }
  return found;
}

/**
 * A value that is not the one the signal holds, chosen so that writing it wakes
 * whatever reads it. Only ever used AFTER disposal: nothing may run, and what
 * this is for is finding out whether something does.
 */
function differentValue(current: unknown): unknown {
  if (typeof current === "boolean") return !current;
  if (typeof current === "number") return current + 1;
  if (typeof current === "string") return `${current}-poked`;
  if (Array.isArray(current)) return current.length === 0 ? [] : current.slice(0, -1);
  if (current === null || current === undefined) return 0;
  return current;
}

// ---------------------------------------------------------------------------
// listener registry
// ---------------------------------------------------------------------------

interface LiveListener {
  target: EventTarget;
  type: string;
  listener: unknown;
  capture: boolean;
}

function optionsCapture(options: unknown): boolean {
  if (typeof options === "boolean") return options;
  if (options !== null && typeof options === "object") {
    return (options as { capture?: boolean }).capture === true;
  }
  return false;
}

function describeTarget(target: EventTarget): string {
  if (typeof document !== "undefined" && target === document) return "document";
  if (typeof window !== "undefined" && (target as unknown) === window) return "window";
  const element = target as { tagName?: string; constructor?: { name?: string } };
  if (typeof element.tagName === "string") return element.tagName.toLowerCase();
  return element.constructor?.name ?? "EventTarget";
}

/**
 * Every object on a live target's prototype chain that OWNS `addEventListener`.
 *
 * Patching `globalThis.EventTarget.prototype` is not enough and, worse, is
 * silently not enough: under `@happy-dom/global-registrator` the global
 * `EventTarget` can still be the host's own class while every DOM node inherits
 * happy-dom's, so the probe installs cleanly, intercepts nothing, and reports
 * zero listeners for a fixture that registers four. The owners are therefore
 * derived from real targets — an element, `document`, `window`, an
 * `AbortSignal` — and the probe asserts it found at least one.
 */
function listenerOwners(): object[] {
  const owners = new Set<object>();
  const consider = (target: unknown): void => {
    let at: object | null = target as object | null;
    while (at) {
      if (Object.getOwnPropertyDescriptor(at, "addEventListener") !== undefined) {
        owners.add(at);
        return;
      }
      at = Object.getPrototypeOf(at) as object | null;
    }
  };
  consider(document.createElement("div"));
  consider(document);
  if (typeof window !== "undefined") consider(window);
  if (typeof AbortController === "function") consider(new AbortController().signal);
  if (typeof EventTarget === "function") owners.add(EventTarget.prototype);
  return [...owners];
}

/**
 * Every `addEventListener` inside the window, matched against its removal.
 *
 * B4 says a listener dies with its position, and the only way to observe that is
 * from outside `EventTarget`: the runtime keeps no registry of its own, which is
 * precisely the defect. The patch is installed for the window and taken off in
 * `finally`, so nothing else in the process ever sees it.
 */
function installListenerProbe(): {
  live: LiveListener[];
  all: LiveListener[];
  owners: number;
  stop(): void;
} {
  const live: LiveListener[] = [];
  const all: LiveListener[] = [];
  const restore: Array<() => void> = [];

  for (const owner of listenerOwners()) {
    const host = owner as unknown as Record<string, unknown>;
    const realAdd = host.addEventListener as (...args: unknown[]) => unknown;
    const realRemove = host.removeEventListener as (...args: unknown[]) => unknown;
    if (typeof realAdd !== "function" || typeof realRemove !== "function") continue;

    host.addEventListener = function patchedAdd(
      this: EventTarget,
      type: string,
      listener: unknown,
      options?: unknown,
    ): unknown {
      live.push({ target: this, type, listener, capture: optionsCapture(options) });
      all.push(live[live.length - 1]);
      return realAdd.call(this, type, listener, options);
    };

    host.removeEventListener = function patchedRemove(
      this: EventTarget,
      type: string,
      listener: unknown,
      options?: unknown,
    ): unknown {
      const capture = optionsCapture(options);
      for (let i = live.length - 1; i >= 0; i--) {
        const record = live[i];
        if (record.target !== this) continue;
        if (record.type !== type || record.listener !== listener || record.capture !== capture)
          continue;
        live.splice(i, 1);
        break;
      }
      return realRemove.call(this, type, listener, options);
    };

    restore.push(() => {
      host.addEventListener = realAdd;
      host.removeEventListener = realRemove;
    });
  }

  return {
    live,
    all,
    owners: restore.length,
    stop() {
      for (const undo of restore.splice(0)) undo();
    },
  };
}

// ---------------------------------------------------------------------------
// async continuation probe
// ---------------------------------------------------------------------------

interface AsyncProbe {
  ranAfter: number;
  pending: number;
  disposed(): void;
  stop(): void;
}

/**
 * Continuations scheduled inside the window, counted by whether they ran before
 * or after disposal. O3.7's "async continuation" clause is unobservable without
 * this: a `queueMicrotask` that fires into a disposed scope leaves no trace in
 * the DOM, the scope tree or the effect counts.
 */
function installAsyncProbe(): AsyncProbe {
  const realMicrotask = globalThis.queueMicrotask;
  const realTimeout = globalThis.setTimeout;
  const realClear = globalThis.clearTimeout;
  let after = false;
  // Scheduled before disposal and not yet resolved one way or the other. This
  // and `ranAfter` are two different leaks: a continuation that RAN after
  // disposal fired into a dead scope, and one still OUTSTANDING when the window
  // closed is the canonical shape — one in-flight timer or fetch at teardown —
  // which the ran-after counter cannot see at all, because it never runs.
  let outstandingFromBefore = 0;
  const probe: AsyncProbe = {
    ranAfter: 0,
    pending: 0,
    disposed() {
      after = true;
    },
    stop() {
      globalThis.queueMicrotask = realMicrotask;
      globalThis.setTimeout = realTimeout;
      globalThis.clearTimeout = realClear;
      probe.pending = outstandingFromBefore;
    },
  };

  // Scheduled BEFORE disposal. A continuation the driver's own `settle`
  // schedules once the render is down is the driver settling, not the render
  // leaking, and counting it would make every fixture in the corpus look
  // identical and guilty.
  const account = (fn: () => void): { run: () => void; cancel: () => void } => {
    const scheduledBeforeDisposal = !after;
    if (scheduledBeforeDisposal) outstandingFromBefore++;
    let resolved = false;
    const cancel = (): void => {
      if (resolved || !scheduledBeforeDisposal) return;
      resolved = true;
      outstandingFromBefore--;
    };
    return {
      cancel,
      run: () => {
        const ranAfterDisposal = after && scheduledBeforeDisposal && !resolved;
        cancel();
        if (ranAfterDisposal) probe.ranAfter++;
        fn();
      },
    };
  };

  const cancels = new Map<unknown, () => void>();

  globalThis.queueMicrotask = (fn: () => void): void => realMicrotask(account(fn).run);
  globalThis.setTimeout = ((fn: unknown, ms?: number, ...rest: unknown[]) => {
    if (typeof fn !== "function")
      return realTimeout(fn as never, ms as never, ...(rest as never[]));
    const entry = account(fn as () => void);
    const handle = realTimeout(entry.run as never, ms as never, ...(rest as never[]));
    cancels.set(handle, entry.cancel);
    return handle;
  }) as typeof globalThis.setTimeout;
  // A cancelled timer is not outstanding. Without this every `clearTimeout`
  // would read as a continuation that never resolved, which is the opposite of
  // what it is.
  globalThis.clearTimeout = ((handle: unknown) => {
    cancels.get(handle)?.();
    cancels.delete(handle);
    return realClear(handle as never);
  }) as typeof globalThis.clearTimeout;

  return probe;
}

// ---------------------------------------------------------------------------
// the window
// ---------------------------------------------------------------------------

interface Driven {
  default?: unknown;
  steps?: Array<() => void>;
  events?: Array<(root: HTMLElement) => void>;
}

export async function openSession(
  fixture: string,
  source: string,
  options: SessionOptions = {},
): Promise<Session> {
  const core = (await import("@barqjs/core")) as unknown as CoreLike;
  const code = compileSource(source, `${fixture}.tsx`, options.compile ?? {});

  // Before the module is imported, not after: `_$delegateEvents([…])` is emitted
  // at module scope and runs at import time, so a probe installed later sees a
  // module that registered nothing and a document that is quietly listening.
  const listenerProbe = installListenerProbe();
  let mod: Driven & Record<string, unknown>;
  try {
    mod = (await loadModule(code, `l4-${fixture}`)) as unknown as Driven & Record<string, unknown>;
  } catch (error) {
    listenerProbe.stop();
    throw error;
  }

  const container = document.createElement("div");
  document.body.appendChild(container);

  resetIdentity();
  const trace: Trace = beginTrace();
  const asyncProbe = installAsyncProbe();
  const capture = core.DEV.diagnostics.capture();
  core.beginOwnershipTrace();

  const frames: SessionFrame[] = [];
  let ownership: OwnershipEvent[] = [];
  let dispose: (() => void) | undefined;
  let clear: (() => void) | undefined;
  const threwAfterDispose: string[] = [];

  const snapshot = (label: string, kind: FrameKind, index: number): void => {
    const channel = normalizeChannels(container);
    const marker = core.enter(null, FRAME_MARKER);
    core.exit(marker);
    core.dispose(marker);
    frames.push({
      label,
      kind,
      index,
      html: channel.html,
      identity: channel.identity,
      anchors: channel.anchors,
      at: frames.length,
    });
  };

  try {
    core.scope(
      (d: () => void) => {
        dispose = d;
        clear = core.render(mod.default as never, container);
      },
      true,
      "root",
    );
    await settle();
    snapshot("mount", "mount", -1);

    // The no-op write. Every signal the fixture exports is written the value it
    // already holds; nothing downstream may notice.
    const signals = exportedSignals(mod);
    for (const sig of signals) {
      try {
        sig.set(sig());
      } catch {
        // A writable computed can refuse a write it cannot invert. That is not
        // what this pass is about, and a refusal changes nothing either way.
      }
    }
    await settle();
    snapshot("noop-write", "noop", -1);

    const steps = mod.steps ?? [];
    for (let i = 0; i < steps.length; i++) {
      steps[i]();
      await settle();
      snapshot(`step ${i}`, "step", i);
      if (options.replay !== false) {
        steps[i]();
        await settle();
        snapshot(`step ${i} replayed`, "replay", i);
      }
    }

    const events = mod.events ?? [];
    for (let i = 0; i < events.length; i++) {
      events[i](container);
      await settle();
      snapshot(`event ${i}`, "event", i);
    }

    // Disposal is inside the window on purpose: everything below is a question
    // about what is still alive once it has returned.
    const runsBefore = trace.effects.reduce((total, e) => total + e.runs, 0);
    clear?.();
    dispose?.();
    await settle();
    asyncProbe.disposed();

    for (const sig of signals) {
      try {
        sig.set(differentValue(sig()));
      } catch (error) {
        threwAfterDispose.push(error instanceof Error ? error.message : String(error));
      }
    }
    try {
      await settle();
    } catch (error) {
      threwAfterDispose.push(error instanceof Error ? error.message : String(error));
    }
    // A second turn: a continuation that schedules another continuation is
    // exactly the shape a `Suspense` leak has.
    await settle();

    const runsAfter = trace.effects.reduce((total, e) => total + e.runs, 0);
    ownership = core.endOwnershipTrace();

    const entered = new Map<number, boolean>();
    const markers = new Set<number>();
    for (const event of ownership) {
      if (event.kind === "enter" && event.scopeKind === FRAME_MARKER) {
        markers.add(event.scope);
        continue;
      }
      if (event.kind === "enter" && !entered.has(event.scope)) entered.set(event.scope, false);
      if (event.kind === "dispose" && entered.has(event.scope)) entered.set(event.scope, true);
    }
    const scopesNeverDisposed = [...entered.entries()]
      .filter(([, disposedAlready]) => !disposedAlready)
      .map(([id]) => id);

    let attached = 0;
    for (const instance of trace.templates) {
      if (document.contains(instance.node)) attached++;
    }

    asyncProbe.stop();
    listenerProbe.stop();
    const diagnostics = capture.stop();

    const listeners: ListenerRecord[] = listenerProbe.all.map((record) => ({
      type: record.type,
      target: describeTarget(record.target),
      outstanding: listenerProbe.live.includes(record),
      delegated: typeof document !== "undefined" && record.target === document,
    }));

    return {
      fixture,
      code,
      exports: mod as Record<string, unknown>,
      frames,
      stepSources: (mod.steps ?? []).map((step) => step.toString()),
      ownership,
      diagnostics,
      scopesNeverDisposed,
      scopesEntered: entered.size,
      effectRunsAfterDispose: runsAfter - runsBefore,
      effectsCreated: trace.effects.length,
      listeners,
      listenerOwners: listenerProbe.owners,
      asyncAfterDispose: asyncProbe.ranAfter,
      asyncStillPending: asyncProbe.pending,
      clonesAttachedAfterDispose: attached,
      containerAfterDispose: normalizeChannels(container).html,
      threwAfterDispose,
    };
  } finally {
    core.endOwnershipTrace();
    endTrace();
    asyncProbe.stop();
    listenerProbe.stop();
    container.remove();
    document.body.innerHTML = "";
    core.clearDelegatedEvents();
  }
}

// ---------------------------------------------------------------------------
// the L4 corpus
// ---------------------------------------------------------------------------

export function listL4Fixtures(): string[] {
  return readdirSync(L4_DIR)
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => f.slice(0, -4))
    .sort();
}

export function l4Source(name: string): string {
  return readFileSync(join(L4_DIR, `${name}.tsx`), "utf8");
}
