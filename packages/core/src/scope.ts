/**
 * Scope: the unit of ownership and the unit of death.
 *
 * A scope is the reactive engine's owner. `signals.ts` holds the operations
 * that touch the engine; what is this module's is what sits on top of them: the
 * calling conventions and the context channel.
 */

import {
  CONTEXT_MISS,
  NoOwnerError,
  abortSignal,
  cellOf,
  childScope,
  contextNotFound,
  disposeScope,
  getOwner,
  isDisposed,
  lookupContext,
  ownRange,
  pin,
  readSlot,
  rootScope,
  untrack,
  unwrapBlocks,
  provideOn,
  runWithOwner,
  ScopeMissingError,
  type Context,
  type Scope,
} from "./signals.ts";

import type { JSXElement } from "./types.ts";

export type { Scope } from "./signals.ts";

/** A deferred READ. No identity, callable many times, arity-tolerant. */
export type Cell<T> = (...ignored: never[]) => T;

/**
 * A deferred CONSTRUCTION. It is invoked by the runtime, which makes the scope
 * it belongs to current first, so the body reads its owner from the ambient the
 * way every other reactive primitive does.
 */
export type Block<R, A extends unknown[] = Cell<unknown>[]> = (...args: A) => R;

/**
 * A renderable slot takes either kind, because a Cell ignores the
 * scope a Block needs. Every other slot takes a Cell only, and a Block landing
 * in one is a type error at the read site.
 */
export type Slot<T> = Cell<T> | Block<T>;

/** A component is a function of its props. Ownership is ambient. */
export type Component<P = Record<string, unknown>, R = unknown> = (props: P) => R;

export {
  /** Open a fresh child of the given scope. Run a body under it with `runWithOwner`. */
  childScope,
  /** O2's escape hatch: a Block that ignores the ambient scope and uses the pinned one. */
  pin,
  /** O3.4: the signal that fires when the scope dies. */
  abortSignal,
  /** O3.5: the range removal a scope owns. */
  ownRange,
  /** O3: total, ordered and idempotent. */
  disposeScope as dispose,
  /** O5: the root a mount is owned by. */
  rootScope,
  isDisposed,
  /** A construct invoked with no scope, named. */
  ScopeMissingError,
  runWithOwner,
};

/**
 * X1: open → bind → invoke, in that order. The value stored is a `Cell`, so a
 * provider whose value changes does not re-render its children — consumers see
 * it live (X2).
 */
export function provide<T>(context: Context<T>, value: Cell<T>, block: Block<unknown>): JSXElement {
  const instance = childScope(getOwner());
  // C3.8: the provided value is PROBED here, not merely stored.
  //
  // `provide` used to file the Cell and never invoke it, so a laundered
  // `() => aBlock` — which carries no brand for a value test to see — reached
  // every consumer of this context as a Cell that yields a Block, and the first
  // thing to stringify it put a Block's source text where a value belonged.
  //
  // The trade this makes is stated rather than hidden: a provider's Cell now
  // runs ONCE at install rather than first at its earliest read. `untrack`
  // keeps that first read out of whatever computation is installing, so it
  // creates no dependency that did not exist before.
  if (typeof value === "function") {
    untrack(() => readSlot(value, "The `value` of a context provider"));
  }
  provideOn(instance, context.id, value);
  let built = false;
  try {
    // A Block forwarded inside a Cell, or inside the ARRAY several children
    // arrive as, is still a Block and has to run here, inside the scope that
    // carries the binding. A context's own provider walks the same way, and both
    // call the same function so they cannot drift apart again.
    const out = runWithOwner(instance, () =>
      unwrapBlocks((block as unknown as () => JSXElement)(), instance),
    );
    built = true;
    return out;
  } finally {
    // O4.4: a subtree that threw half-way is disposed, not abandoned.
    if (!built) disposeScope(instance);
  }
}

/**
 * Install a binding onto a scope that already exists, which is what
 * `setContext` does. Everything opened under the scope AFTERWARDS sees it;
 * `provide` is the sanctioned path and is the one the compiler emits.
 */
export function install<T>(scope: Scope, context: Context<T>, value: Cell<T>): void {
  provideOn(scope, context.id, value);
}

/** The context read against an explicit scope, answering with the Cell. */
export function read<T>(context: Context<T>, scope: Scope | null = getOwner()): Cell<T> {
  if (scope !== null) {
    const stored = lookupContext(scope, context.id);
    if (stored !== CONTEXT_MISS) return cellOf(stored) as Cell<T>;
  }
  if (context.defaultValue !== undefined) {
    return (): T => context.defaultValue as T;
  }
  throw scope === null ? new NoOwnerError() : contextNotFound(context);
}
