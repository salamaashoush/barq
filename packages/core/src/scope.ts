/**
 * Scope — the unit of ownership and the unit of death. `SEMANTICS.md` §2 is
 * the specification; `CODESIGN.md` §3.1 and §3.3 are the design.
 *
 * **Why the implementation is in `signals.ts` and this module is its face.**
 * `signals.ts` may acquire neither a value import nor a reassigned top-level
 * binding — Bun inlines a module-scope numeric `const` only while it has
 * neither, and a signal accessor's `toString()` is snapshotted by
 * `diagnostic-accessor-coercion.tsx`. `enter`/`exit` write the ambient owner,
 * which lives there, so they live there too. What is genuinely this module's
 * is what needs no hot state: the calling conventions, the context channel and
 * the root.
 */

import {
  CONTEXT_MISS,
  ContextNotFoundError,
  NoOwnerError,
  abortSignal,
  cellOf,
  disposeScope,
  enter,
  enterRoot,
  exit,
  getOwner,
  isBlock,
  isDisposed,
  lookupContext,
  ownRange,
  pin,
  readSlot,
  untrack,
  provideOn,
  requireScope,
  ScopeMissingError,
  type Context,
  type Scope,
} from "./signals.ts";

export type { Boundary, Scope } from "./signals.ts";

/** §3.0: a deferred READ. No identity, callable many times, arity-tolerant. */
export type Cell<T> = (...ignored: never[]) => T;

/**
 * §3.0: a deferred CONSTRUCTION under a supplied scope. `s` is not OPTIONAL —
 * `undefined` is a missing argument and `ScopeMissingError` is the answer to it
 * — but it is nullable, because `null` is a scope value: it is the parent of a
 * root, and it is what the compiler emits for a module-level position
 * (`const _s$ = null`).
 */
export type Block<R, A extends unknown[] = Cell<unknown>[]> = (s: Scope | null, ...args: A) => R;

/**
 * §3.0/C4: a renderable slot takes either kind, because a Cell ignores the
 * scope a Block needs. Every other slot takes a Cell only, and a Block landing
 * in one is a type error at the read site.
 */
export type Slot<T> = Cell<T> | Block<T>;

/** C1: the whole component surface. Scope first, so mistiming is a missing argument. */
export type Component<P = Record<string, unknown>, R = unknown> = (s: Scope | null, props: P) => R;

export {
  /** O2/§3.0: open a fresh child of the given scope and make it current. */
  enter,
  /** O4.1: restore `CURRENT` to what it was before the matching `enter`. */
  exit,
  /** O2's escape hatch: a Block that ignores its scope and uses the pinned one. */
  pin,
  /** O3.4: the signal that fires when the scope dies. */
  abortSignal,
  /** O3.5: the range removal disposal runs last. */
  ownRange,
  /** O3: total, ordered and idempotent. */
  disposeScope as dispose,
  /** O5: the root a mount is owned by. */
  enterRoot,
  isDisposed,
  /** §3.0 rule 3: a construct invoked with no scope, named. */
  ScopeMissingError,
  /** The scope a construct was handed, or a throw naming where it was missing. */
  requireScope,
};

/**
 * X1: `enter` → fork → write → invoke, in that order, with `CURRENT` restored
 * on both paths (O4.1). The value stored is a `Cell`, so a provider whose
 * value changes does not re-render its children — consumers see it live (X2).
 */
export function provide<T, R>(
  scope: Scope,
  context: Context<T>,
  value: Cell<T>,
  block: Block<R>,
): R {
  const instance = enter(requireScope(scope, "provide"));
  // C3.8: the provided value is PROBED here, not merely stored.
  //
  // `provide` used to file the Cell and never invoke it, so a laundered
  // `() => aBlock` — which carries no brand for a value test to see — reached
  // every consumer of this context as a Cell that yields a Block, and the first
  // thing to stringify it put a Block's source text where a value belonged.
  // That is the outcome the `setProp` case made this rule worth having, and no
  // read-side probe could reach it: nothing here ever called the Cell.
  //
  // The trade this makes is stated rather than hidden: a provider's Cell now
  // runs ONCE at install rather than first at its earliest read. X2 already
  // says a provided value is a Cell so that provider updates are live, and a
  // consumer still reads it live; what moves is only when the first read
  // happens. `untrack` keeps that first read out of whatever computation is
  // installing, so it creates no dependency that did not exist before.
  if (typeof value === "function") {
    untrack(() => readSlot(value, "provide value"));
  }
  provideOn(instance, context.id, value);
  let built = false;
  try {
    let out: R = block(instance);
    // A Block forwarded inside a Cell is still a Block, and it has to run here,
    // inside the scope that carries the binding. See `context`'s Provider.
    while (isBlock(out)) out = (out as unknown as Block<R>)(instance);
    built = true;
    return out;
  } finally {
    exit(instance);
    // O4.4: a subtree that threw half-way is disposed, not abandoned. The
    // catcher M4 lands takes this over for every construct; until then the
    // one primitive that already enters a scope does it for its own.
    if (!built) disposeScope(instance);
  }
}

/**
 * Install a binding onto a scope that already exists, which is what
 * `setContext` does. `provide` is the sanctioned path and is the one the
 * compiler emits; this is for a construct that installs onto its own scope
 * after entering it, and it forks the same way (X6).
 */
export function install<T>(scope: Scope, context: Context<T>, value: Cell<T>): void {
  provideOn(scope, context.id, value);
}

/**
 * X3: a read is a walk of the SCOPE chain, performed whenever the read
 * happens, over each scope's own record. A consumer built before a provider
 * above it installed still sees the value — which is X3's stated consequence
 * and what `ErrorBoundary`'s build-then-install ordering needs to be harmless.
 */
export function read<T>(context: Context<T>, scope: Scope | null = getOwner()): Cell<T> {
  if (scope !== null) {
    const stored = lookupContext(scope, context.id);
    if (stored !== CONTEXT_MISS) return cellOf(stored) as Cell<T>;
  }
  if (context.defaultValue !== undefined) {
    return (): T => context.defaultValue as T;
  }
  throw scope === null ? new NoOwnerError() : new ContextNotFoundError();
}

/**
 * X5's stack. The scope chain IS the logical tree, so a component stack costs
 * a walk and no bookkeeping. Empty until M3 assigns `origin`.
 */
export function stack(scope: Scope | null = getOwner()): string[] {
  const frames: string[] = [];
  for (let at = scope; at !== null; at = at.parent) {
    if (at.origin !== undefined) frames.push(at.origin);
  }
  return frames;
}
