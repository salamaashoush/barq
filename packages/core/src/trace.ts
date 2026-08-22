/**
 * The L2b ownership trace (CODESIGN.md §6). DEV/test only, off by default.
 *
 * Every scope entry, exit and disposal, and every construction the runtime
 * performs on someone else's behalf, appends one record. The oracle then asks
 * whether the tree that log describes is the tree the compiler said it was
 * emitting — an expected value derived from the source, so this channel needs
 * no reference implementation and cannot inherit a second implementation's
 * bugs.
 *
 * **Why the sink lives in `signals.ts` and this module installs into it,
 * rather than the other way round.** `signals.ts` must acquire neither a value
 * import nor a reassigned module-level binding: Bun's transpiler inlines a
 * module-scope numeric `const` only while a module has neither, and a signal
 * accessor's `Function.prototype.toString` is observable — one fixture renders
 * it into the DOM and snapshots it. Instrumenting `signals.ts` by importing
 * this module moved that snapshot. `signals.ts` therefore owns a `const`
 * holder, `OWNERSHIP`, and every site is `if (OWNERSHIP.sink !== null)`: one
 * property load and one compare when the trace is off.
 */

import { OWNERSHIP } from "./signals.ts";

/** O1's creation set, plus `scope` for a scope the runtime did not label. */
export type ScopeKind = "root" | "provide" | "branch" | "each" | "portal" | "scope";

export type OwnershipEventKind =
  | "enter"
  | "exit"
  | "dispose"
  | "clone"
  | "own"
  | "block-enter"
  | "block-exit";

export interface OwnershipEvent {
  seq: number;
  kind: OwnershipEventKind;
  /** the scope this event is about, or the owner a clone/block ran under */
  scope: number;
  /** parent scope; -1 at the root and on a detached scope */
  parent: number;
  /**
   * for `enter`: what created it. For `clone`: the template's bytes. For `own`:
   * the reactive node's kind — `render`, `user` or `pure`.
   */
  label: string;
  /** `enter` only */
  scopeKind: ScopeKind;
  /**
   * `enter` only: this scope registered its disposer **with the scope recorded
   * as its parent**, so that parent's own unwinding is what takes it away.
   *
   * Two things make it false, and neither is a defect on its own. A DETACHED
   * scope registered with nobody — `map.ts` disposes rows in array order,
   * which is the list's bookkeeping and not the parent's, and it is the shape
   * `pin` will take. And a scope created inside an EFFECT registered with the
   * effect node, not with the scope above it, so the order it comes apart in
   * is that node's business. O3.2 is a claim about the kids a scope disposes
   * itself; folding either case in makes every list in the corpus look like a
   * disposal-order defect.
   */
  owned: boolean;
}

/**
 * What `signals.ts` and `dom.ts` call. The shape is duplicated there as a
 * type-only import, which is erased, so declaring it here costs the runtime
 * nothing.
 */
export interface OwnershipSink {
  enter(scope: object, parent: object | null, kind: ScopeKind, attached: boolean): void;

  exit(scope: object): void;
  dispose(scope: object): void;
  clone(html: string, owner: object | null): void;
  /**
   * One reactive node created, with the owner it was filed under.
   *
   * Without this the trace could see every SCOPE and every template clone and
   * no EFFECT at all — so an element binding opened under the ambient owner
   * instead of the scope its Block was handed produced a byte-identical trace,
   * and the whole effect-ownership half of O2/O4.5 was structurally invisible
   * to the channel built to see it. Measured: of six mutations injected into a
   * live trace, five were named and this one produced zero findings.
   */
  own(node: object, owner: object | null, kind: "render" | "user" | "pure"): void;
  /**
   * Opens a span over a construction the runtime was handed. `given` is the
   * scope the caller means it to run under; what it actually ran under is not
   * knowable at this instant — reading the ambient owner here would produce the
   * same value by construction, and a check whose two sides come from one read
   * cannot fail whatever the runtime does. The second source is every `clone`
   * that arrives before the matching `blockExit`: those happened INSIDE the
   * block, and O2 is the claim that each of them sits at `given` or below it.
   */
  blockEnter(label: string, given: object | null): void;
  blockExit(label: string): void;
}

let events: OwnershipEvent[] = [];
let seq = 0;
let nextId = 1;
let ids = new WeakMap<object, number>();
/** Scopes disposed since the trace opened, so a double dispose is visible. */
let disposedOnce = new WeakSet<object>();

function idOf(scope: object | null | undefined): number {
  if (!scope) return -1;
  let id = ids.get(scope);
  if (id === undefined) {
    id = nextId++;
    ids.set(scope, id);
  }
  return id;
}

/**
 * Enough of `Scope`/`ComputedNode` to climb. A scope points at `parent`; a
 * computation points at the scope it was created under with `_owner`, and at
 * the one it owns — which no `enter` ever declared — with `_scope`.
 */
interface Owned {
  parent?: Owned | null;
  _owner?: Owned | null;
}

/**
 * The nearest *entered scope* at or above `owner`.
 *
 * `currentOwner` is not always a scope: a computed makes itself the owner of
 * whatever its body creates (`signals.ts:880`), so `getOwner()` inside a
 * `renderEffect` is the effect node, not the `scope` that built it. The
 * ownership question is about the scope, so the chain is climbed until an
 * object the trace has actually seen `enter` turns up. Never mints an id:
 * minting one here would invent a scope that no `enter` event ever declared,
 * and the tree would silently gain a node.
 */
function scopeOf(owner: Owned | null | undefined): number {
  let at: Owned | null | undefined = owner;
  while (at) {
    const id = ids.get(at);
    if (id !== undefined) return id;
    at = at.parent !== undefined ? at.parent : at._owner;
  }
  return -1;
}

function push(
  kind: OwnershipEventKind,
  scope: number,
  parent: number,
  label: string,
  scopeKind: ScopeKind,
  owned = false,
): void {
  events.push({ seq: seq++, kind, scope, parent, label, scopeKind, owned });
}

const SINK: OwnershipSink = {
  enter(scope, parent, kind, attached) {
    // The parentage recorded is the one the SCOPE stores, not the one the
    // caller passed. Reading the argument makes both sides of the O2 check
    // come from the same expression, and a runtime that files every scope
    // under the wrong parent — or under none — produces a byte-identical
    // trace. Verified: with `scope.parent` forced to null the corpus was
    // unchanged; reading it here, that mutant is caught.
    const stored = (scope as Owned).parent;
    const above = stored !== undefined ? stored : parent;
    // `attached` is registration with whatever the current owner is. It counts
    // as OWNERSHIP only when that owner is the scope this event records as the
    // parent — otherwise an effect node sits between them and holds the
    // disposer, and the order this scope comes apart in is not the parent's.
    const owned = attached && above !== null && above !== undefined && ids.has(above);
    // The parent is resolved BEFORE the child is minted, so a scope can never
    // be recorded as its own parent, and a parent pointing at an effect node
    // resolves to the scope that owns the effect rather than to nothing.
    push("enter", idOf(scope), scopeOf(above), kind, kind, owned);
  },
  exit(scope) {
    push("exit", idOf(scope), -1, "", "scope");
  },
  dispose(scope) {
    const repeated = disposedOnce.has(scope);
    disposedOnce.add(scope);
    push("dispose", idOf(scope), -1, repeated ? "repeat" : "", "scope");
  },
  /**
   * One template instantiation, with the owner it happened under. This is the
   * compiler-addressed position: the compiler knows which template every unit
   * clones and which constructs own that unit, so this event is directly
   * comparable against the static tree — and it is the event that reports a
   * child built at its provider's CALL SITE rather than inside it.
   */
  clone(html, owner) {
    push("clone", scopeOf(owner), -1, html, "scope");
  },
  /**
   * The owner recorded is the node's OWN `_owner` slot, not the ambient read
   * the caller happened to make — the same discipline `enter` follows, and for
   * the same reason: both sides of the O2 check coming from one read cannot
   * fail whatever the runtime does.
   */
  own(node, owner, kind) {
    const stored = (node as Owned)._owner;
    push("own", scopeOf(stored !== undefined ? stored : owner), -1, kind, "scope");
  },
  blockEnter(label, given) {
    push("block-enter", scopeOf(given), -1, label, "scope");
  },
  blockExit(label) {
    push("block-exit", -1, -1, label, "scope");
  },
};

export function beginOwnershipTrace(): void {
  if (OWNERSHIP.sink !== null) {
    throw new Error("ownership trace: a trace is already open — renders must not overlap");
  }
  events = [];
  seq = 0;
  nextId = 1;
  ids = new WeakMap();
  disposedOnce = new WeakSet();
  OWNERSHIP.sink = SINK;
}

export function endOwnershipTrace(): OwnershipEvent[] {
  OWNERSHIP.sink = null;
  const captured = events;
  events = [];
  ids = new WeakMap();
  disposedOnce = new WeakSet();
  return captured;
}

/** The id a scope already has, or -1. Never mints one. */
export function ownershipIdOf(scope: object | null | undefined): number {
  if (!scope) return -1;
  return ids.get(scope) ?? -1;
}
