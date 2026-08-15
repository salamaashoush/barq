/**
 * The four control-flow primitives. `CODESIGN.md` §3.4, `SEMANTICS.md` K and E.
 *
 * Two invariants the shape of this file exists to hold:
 *
 * - O2/O3.7: `enter(given)` is the only spelling used, so an instance is a child
 *   of the scope the construct was HANDED — never of the effect that swapped it,
 *   never of nothing.
 * - C7: every Block goes through `invoke`, including the two the error boundary
 *   hands `region` as its own arms.
 */

import type { Child } from "./dom.ts";
import { childToNodes } from "./dom.ts";
import {
  REVEAL_COORD,
  type RevealHandle,
  createErrorCollector,
  createPendingCollector,
} from "./boundaries.ts";
import { type Maybe, mapArray, repeat } from "./map.ts";
import type { Block, Cell, Scope } from "./scope.ts";
import {
  ERROR_BOUNDARY,
  NotReadyError,
  diagnosticsEnabled,
  disposeScope,
  emitDiagnostic,
  enter,
  exit,
  isBlock,
  lookupContext,
  onCleanup,
  ownRange,
  provideOn,
  renderEffect,
  requireScope,
  ScopeMissingError,
  signal,
  underScope,
  untrack,
} from "./signals.ts";

// ============================================================================
// Flags — the compiler ships proofs, the runtime skips work because of them
// ============================================================================

// CODESIGN.md §8: a flag that moves neither an allocation count nor a
// wall-clock number is deleted. `bench:flags` throws if a flag declared here has
// no row; `FAST_CLEAR` and `INDEX_UNUSED` were written, measured at zero on both
// counters, and removed.

/** The key expression reads nothing reactive: evaluate once, open no effect. */
export const STATIC_KEY = 1 << 0;
/** No body registers anything disposable: activate without allocating a Scope. */
export const NO_SCOPE = 1 << 1;

/** `each`'s fourth mode: `src` is a count, not a list (`Repeat`). */
export const COUNT: unique symbol = Symbol("barq-count");

/** No key has been computed yet. `undefined` is a legal key, so it cannot say this. */
const UNSET: unique symbol = Symbol("barq-unset");

// ============================================================================
// The range a region owns
// ============================================================================

const EMPTY: readonly Node[] = [];

/** The parent is resolved from the anchor on every write, never captured: a
 * region built with no `(parent, anchor)` only learns its parent when the caller
 * inserts the anchor it returned. */
interface Site {
  parent: Node | null;
  anchor: Node | null;
}

/** K7: a region with no parent owns ONE empty text node, not a comment pair. */
function siteFor(parent: Node | null, anchor: Node | null): { site: Site; out: Node | null } {
  if (parent !== null) return { site: { parent, anchor }, out: null };
  const own = document.createTextNode("");
  const out = document.createDocumentFragment();
  out.appendChild(own);
  return { site: { parent: null, anchor: own }, out };
}

function hostOf(site: Site): Node | null {
  return site.anchor !== null ? site.anchor.parentNode : site.parent;
}

function insertAt(site: Site, nodes: readonly Node[]): void {
  const host = hostOf(site);
  if (host === null) return;
  const anchor = site.anchor;
  for (let i = 0; i < nodes.length; i++) host.insertBefore(nodes[i], anchor);
}

function removeNodes(nodes: readonly Node[]): void {
  for (let i = 0; i < nodes.length; i++) nodes[i].parentNode?.removeChild(nodes[i]);
}

// ============================================================================
// One activation
// ============================================================================

/** `scope` is null exactly when `NO_SCOPE` was proved. */
interface Instance {
  scope: Scope | null;
  nodes: readonly Node[];
}

const NOTHING: Instance = { scope: null, nodes: EMPTY };

/**
 * O1/O2/K6. The range removal is installed on the instance scope (O3.5), so a
 * disposal arriving from above removes the DOM without this module being asked.
 */
function activate(
  given: Scope | null,
  site: Site,
  body: Block<unknown>,
  args: readonly unknown[],
  flags: number,
  kind: "branch" | "portal",
): Instance {
  if ((flags & NO_SCOPE) !== 0) {
    const nodes = build(given, body, args);
    insertAt(site, nodes);
    return { scope: null, nodes };
  }
  const scope = enter(given, kind);
  let nodes: readonly Node[] = EMPTY;
  let built = false;
  try {
    nodes = build(scope, body, args);
    built = true;
  } finally {
    exit(scope);
    if (!built) disposeScope(scope);
  }
  const instance: Instance = { scope, nodes };
  ownRange(scope, () => {
    removeNodes(instance.nodes);
    instance.nodes = EMPTY;
  });
  insertAt(site, nodes);
  return instance;
}

/** A Cell ignores every argument (§3.0 rule 1), so one spelling serves both. */
function build(scope: Scope | null, body: Block<unknown>, args: readonly unknown[]): Node[] {
  // An already-built value in a renderable slot. Compiled code never produces
  // one — C6 makes children a Block — but the un-compiled surface `packages/extra`
  // is still on does, and `Out` admits a `Node` in its own right.
  if (typeof body !== "function") return childToNodes(body as Child, scope);
  return childToNodes(invoke(scope, body, args) as Child, scope);
}

/**
 * C7's one call site. `errorBoundary` needs the raw result rather than `build`'s
 * nodes, and routing it here is what puts the boundary's own two arms under the
 * count — a boundary building its fallback twice was invisible while they were
 * outside it.
 */
function invoke(scope: Scope | null, body: Block<unknown>, args: readonly unknown[]): unknown {
  if (diagnosticsEnabled()) countCall(body);
  return (body as (s: Scope | null, ...rest: readonly unknown[]) => unknown)(scope, ...args);
}

// `activation` is bumped once per activation, so this asserts "once per
// activation" rather than "once ever".
let activation = 0;
const lastSeen = new WeakMap<object, number>();

function countCall(body: object): void {
  if (lastSeen.get(body) === activation) {
    emitDiagnostic(
      "BLOCK_EVALUATED_TWICE",
      "error",
      "a Block was invoked twice for one activation (SEMANTICS.md C7): a second call at one compile-addressed slot builds a second subtree and discards one of them.",
    );
  }
  lastSeen.set(body, activation);
}

function teardown(instance: Instance): void {
  if (instance.scope !== null) {
    // O3: total and ordered, ending in the range removal `activate` installed.
    // Nothing here duplicates it.
    disposeScope(instance.scope);
    return;
  }
  removeNodes(instance.nodes);
}

// ============================================================================
// The region driver — one body, four consumers
// ============================================================================

/**
 * What `branch` and `boundary` share, and the only place a key is compared, an
 * instance is swapped or a throw is recovered from.
 *
 * `recover` is E3's `try`: a construction throw inside the selected body asks
 * for the key to build instead, and `null` re-throws. `branch` passes none, so
 * a plain conditional has no error path to get wrong.
 */
function region<K>(
  given: Scope | null,
  site: Site,
  key: Cell<K>,
  bodies: Block<unknown> | readonly (Block<unknown> | null | undefined)[],
  flags: number,
  args: readonly unknown[],
  recover: ((error: unknown) => K | null) | null,
): () => void {
  let instance = NOTHING;
  let previous: K | typeof UNSET = UNSET;
  let swapping = false;

  const pick = (k: K): Block<unknown> | null | undefined =>
    typeof bodies === "function" ? bodies : bodies[k as unknown as number];

  const swap = (k: K): void => {
    swapping = true;
    try {
      swapInner(k);
    } finally {
      swapping = false;
    }
  };

  const swapInner = (k: K): void => {
    if (instance !== NOTHING) {
      teardown(instance);
      instance = NOTHING;
    }
    activation++;
    const body = pick(k);
    if (body === null || body === undefined) return;
    if (recover === null) {
      instance = activate(given, site, body, args, flags, "branch");
      return;
    }
    try {
      instance = activate(given, site, body, args, flags, "branch");
    } catch (error) {
      const alternative = recover(error);
      if (alternative === null) throw error;
      previous = alternative;
      const fallback = pick(alternative);
      if (fallback === null || fallback === undefined) return;
      activation++;
      instance = activate(given, site, fallback, args, flags, "branch");
    }
  };

  if ((flags & STATIC_KEY) !== 0) {
    // The compiler proved the key reads nothing reactive: no effect, no
    // previous-key record, and — when `NO_SCOPE` is proved too — no allocation
    // at all beyond the nodes themselves.
    const k = untrack(key);
    cellSlot(k, "branch key");
    swap(k);
  } else {
    renderEffect(() => {
      const k = key();
      cellSlot(k, "branch key");
      if (previous !== UNSET && k === previous) return;
      previous = k;
      untrack(() => swap(k));
    });
  }

  if ((flags & NO_SCOPE) !== 0) {
    // With no instance scope there is no `ownRange` to run, so the region's
    // last nodes come out with the scope that owns the region itself.
    onCleanup(() => teardown(instance));
  }

  /**
   * Re-read the key and swap if it moved, outside the effect.
   *
   * E2 routes an error to `s.catcher`, and a catcher that only WRITES a signal
   * is at the mercy of the flush it was called from: an error raised by an
   * effect during the very flush that created this region marks a render effect
   * that has already run, and the mark is consumed by nothing. A boundary that
   * recovers on the second flush and not the first is not a boundary. So the
   * catcher acts, and the key it re-reads is the same expression the effect
   * reads — one decision procedure, two entry points.
   */
  return (): void => {
    if (swapping) return;
    const k = untrack(key);
    if (previous !== UNSET && k === previous) return;
    previous = k;
    untrack(() => swap(k));
  };
}

// ============================================================================
// branch — Show, Switch/Match, ternaries, `&&`, Dynamic, a router Outlet
// ============================================================================

/**
 * C3.8 at the four Cell slots of the primitive surface — `branch`'s key,
 * `each`'s source, `boundary`'s `on` and `portal`'s target.
 *
 * `setProp` and `components.ts` route their slots through `readSlot`; these four
 * did not, so a Block reaching one of them was invoked with no argument and its
 * return value used. A `block()`-made Block carries an entry guard and threw on
 * its own; a `pin()`ned one is branded but deliberately UNGUARDED, so it ran
 * silently — C3.8 is a property of the VALUE, and for these four slots it had
 * become a property of the call site.
 *
 * Split from `readSlot` rather than reusing it because the call sites keep
 * control of tracking: `branch` reads its key inside `untrack` on the
 * `STATIC_KEY` path and inside a `renderEffect` otherwise, and `readSlot` would
 * decide that for them.
 */
function cellSlot(value: unknown, origin: string): void {
  if (isBlock(value)) throw new ScopeMissingError(`${origin} (a Block reached a Cell slot)`);
}

/**
 * K2/K5/K6. `key` is plain emitted JavaScript, usually an integer index into
 * `bodies`; an unchanged key is a no-op and a changed one disposes and rebuilds.
 *
 * `bodies` may be a single Block used for every key, which is how `Dynamic` keys
 * on a component VALUE rather than on an index.
 *
 * There is deliberately NO slot-argument parameter: a body wanting the branch's
 * value is wrapped by whoever emits it, so the value is read at ACTIVATION time.
 * A parameter here would be captured at construction, which is the staleness the
 * keyed form exists to avoid.
 *
 * Returns the anchor to insert when the caller supplied no `parent`, else `null`.
 */
export function branch<K>(
  s: Scope | null,
  parent: Node | null,
  anchor: Node | null,
  key: Cell<K>,
  bodies: Block<unknown> | readonly (Block<unknown> | null | undefined)[],
  flags = 0,
): Node | null {
  const given = requireScope(s, "branch");
  cellSlot(key, "branch key");
  const { site, out } = siteFor(parent, anchor);
  underScope(given, "branch", () => region(given, site, key, bodies, flags, EMPTY_ARGS, null));
  return out;
}

const EMPTY_ARGS: readonly unknown[] = [];

// ============================================================================
// each — For, Index, Repeat
// ============================================================================

/**
 * A row IS a scope; row disposal is scope disposal. The LIS move-minimisation
 * in `map.ts` is retained wholesale — it is genuinely independent of ownership
 * (`CODESIGN.md` §3.4).
 *
 * `keyOf` picks the identity, and the four modes are `mapArray`'s three plus
 * `Repeat`'s:
 *
 * | `keyOf`     | identity                | row Block receives          |
 * |-------------|-------------------------|-----------------------------|
 * | `null`      | the item itself         | `(item, index: Cell)`       |
 * | a function  | `keyOf(item)`           | `(item: Cell, index: Cell)` |
 * | `false`     | the index               | `(item: Cell, index)`       |
 * | `COUNT`     | the index; `src` counts | `(index)`                   |
 */
export function each<T>(
  s: Scope | null,
  parent: Node | null,
  anchor: Node | null,
  src: Cell<Maybe<readonly T[]>> | Cell<number>,
  keyOf: ((item: T) => unknown) | false | null | typeof COUNT,
  row: Block<unknown, never[]>,
  // Positional and part of the ABI — `fallback` sits behind it — but nothing
  // here reads it: `STATIC_KEY` is meaningless for a list, and `NO_SCOPE` would
  // have to reach the row scopes `mapArray`/`repeat` own rather than this frame.
  _flags = 0,
  fallback?: Block<unknown> | null,
): Node | null {
  const given = requireScope(s, "each");
  // The source is handed to `mapArray`/`repeat` BY IDENTITY, so the read
  // happens inside their own effects and there is no site here to test the
  // yielded value at. Wrapping it would cost a closure per construction on the
  // list path; the value test is what closes the branded case, and the
  // laundered `() => aBlock` form is registered rather than described —
  // `sem-props-block-in-cell-slot`'s `each source` row.
  cellSlot(src, "each source");
  const { site, out } = siteFor(parent, anchor);
  const body = row as Block<unknown>;

  return underScope(given, "each", (): Node | null => {
    const fallbackRows =
      fallback === null || fallback === undefined
        ? undefined
        : (scope: Scope): Node[] => {
            activation++;
            return build(scope, fallback, EMPTY_ARGS);
          };

    let rows: () => Node[][];
    if (keyOf === COUNT) {
      rows = repeat(
        src as Cell<number>,
        (index: number, scope: Scope): Node[] => {
          activation++;
          return build(scope, body, [index]);
        },
        { fallback: fallbackRows },
      );
    } else {
      const mapper = (item: unknown, index: unknown, scope: Scope): Node[] => {
        activation++;
        return build(scope, body, [item, index]);
      };
      rows = mapArray(src as Cell<Maybe<readonly T[]>>, mapper as never, {
        keyed: (keyOf ?? true) as never,
        fallback: fallbackRows,
      });
    }

    syncRows(site, rows);
    return out;
  });
}

/**
 * Row lifecycle belongs to `mapArray`/`repeat`; this only moves nodes, so a
 * group's ARRAY IDENTITY is what tracks a row — which is why a keyed move
 * preserves the moved row's nodes (K2).
 */
function syncRows(site: Site, rows: () => Node[][]): void {
  let current: Node[][] = [];

  renderEffect(() => {
    const next = rows();
    const host = hostOf(site);
    if (host === null) return;

    if (current.length > 0) {
      const kept = new Set(next);
      for (const group of current) {
        if (kept.has(group)) continue;
        for (const node of group) node.parentNode?.removeChild(node);
      }
    }

    syncNodeOrder(host, site.anchor, current, next);
    current = next;
  });

  onCleanup(() => {
    const flat: Node[] = [];
    for (const group of current) for (const node of group) flat.push(node);
    removeNodes(flat);
    current = [];
  });
}

function syncNodeOrder(
  parent: Node,
  anchor: Node | null,
  previous: Node[][],
  next: Node[][],
): void {
  const newLen = next.length;

  if (previous.length === 0) {
    for (let i = 0; i < newLen; i++) {
      for (const node of next[i]) parent.insertBefore(node, anchor);
    }
    return;
  }

  const previousIndex = new Map<Node[], number>();
  for (let i = 0; i < previous.length; i++) previousIndex.set(previous[i], i);

  const sources: number[] = new Array(newLen);
  for (let i = 0; i < newLen; i++) sources[i] = previousIndex.get(next[i]) ?? -1;

  const lis = longestIncreasingSubsequence(sources.filter((source) => source !== -1));

  let lisIndex = lis.length - 1;
  let nextNode: Node | null = anchor;

  for (let i = newLen - 1; i >= 0; i--) {
    const group = next[i];
    if (group.length === 0) continue;

    if (sources[i] !== -1 && lisIndex >= 0 && lis[lisIndex] === sources[i]) {
      lisIndex--; // already in the right place
    } else {
      for (let j = group.length - 1; j >= 0; j--) {
        parent.insertBefore(group[j], nextNode);
      }
    }

    nextNode = group[0];
  }
}

/** Patience sorting plus binary search: O(n log n). */
function longestIncreasingSubsequence(arr: number[]): number[] {
  if (arr.length === 0) return [];

  const n = arr.length;
  const tails: number[] = [];
  const indices: number[] = [];
  const parent: number[] = new Array(n).fill(-1);

  for (let i = 0; i < n; i++) {
    const val = arr[i];

    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (tails[mid] < val) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    if (lo === tails.length) {
      tails.push(val);
      indices.push(i);
    } else {
      tails[lo] = val;
      indices[lo] = i;
    }

    if (lo > 0) parent[i] = indices[lo - 1];
  }

  const result: number[] = new Array(tails.length);
  let idx = indices[indices.length - 1];
  for (let i = result.length - 1; i >= 0; i--) {
    result[i] = arr[idx];
    idx = parent[idx];
  }

  return result;
}

// ============================================================================
// boundary — Errored / ErrorBoundary, Loading / Suspense
// ============================================================================

export type BoundaryKind = "error" | "loading";

/**
 * E3: a boundary is a `branch` keyed on `{content | fallback}` plus a `try`.
 *
 * E2.1 is why the content Block is called INSIDE this function rather than
 * handed to it already built: the catcher is installed on the instance scope
 * before the Block runs, so a construction throw lands in this `try`.
 *
 * E2.3: `NotReadyError` is re-thrown, never captured — an error boundary passes
 * it through to the nearest `Loading`.
 */
export function boundary(
  s: Scope | null,
  parent: Node | null,
  anchor: Node | null,
  kind: BoundaryKind,
  fallback: Block<unknown> | null | undefined,
  body: Block<unknown>,
  flags = 0,
  on?: Cell<unknown>,
): Node | null {
  const given = requireScope(s, "boundary");
  if (on !== undefined) cellSlot(on, "boundary on");
  const { site, out } = siteFor(parent, anchor);
  if (kind === "error") {
    errorBoundary(given, site, fallback, body, flags);
  } else {
    loadingBoundary(given, site, fallback, body, on);
  }
  return out;
}

function errorBoundary(
  given: Scope | null,
  site: Site,
  fallback: Block<unknown> | null | undefined,
  body: Block<unknown>,
  flags: number,
): void {
  const collector = createErrorCollector();
  const reset = (): void => collector.clear();
  const asError = (err: unknown): Error => (err instanceof Error ? err : new Error(String(err)));
  let refresh: () => void = () => {};

  // E2/E2.3. The catcher installed on the INSTANCE scope is what every routed
  // entry point below the boundary reaches — effect body, cleanup, handler,
  // async continuation — and it both records and acts, because a catcher that
  // only writes a signal cannot recover during the flush it was called from.
  const install = (scope: Scope): void => {
    provideOn(scope, ERROR_BOUNDARY, (err: unknown) => {
      if (err instanceof NotReadyError) throw err;
      collector.capture(err);
      refresh();
    });
  };

  const content: Block<unknown> = (scope: Scope | null): unknown => {
    install(scope as Scope);
    return invoke(scope, body, EMPTY_ARGS);
  };

  const recovered: Block<unknown> = (scope: Scope | null): unknown => {
    if (fallback === null || fallback === undefined) return null;
    const error = (): Error => asError(collector.error());
    return invoke(scope, fallback, [error, reset]);
  };

  // The key IS the branch: 0 is the content, 1 is the fallback, and `reset` is a
  // flip back to 0 — a fresh scope and a fresh build, by K6.
  const key = (): number => (collector.failed() ? 1 : 0);
  const recover = (error: unknown): number | null => {
    if (error instanceof NotReadyError) return null;
    collector.capture(error);
    return 1;
  };

  underScope(given, "boundary", () => {
    refresh = region(given, site, key, [content, recovered], flags, EMPTY_ARGS, recover);
    // A user effect runs synchronously at creation, so a catcher can fire while
    // the region is still being constructed and find nothing to call. One
    // re-read settles it, and it is a no-op when the key did not move.
    refresh();
  });
}

/**
 * One scope, entered once: the collector's home and the owner of both arms, so
 * the static ownership tree — ONE `branch` node per `Loading` — is what the
 * runtime produces.
 *
 * The content is a live hole rather than a branch arm, and that is forced:
 * `NotReadyError` registers the EFFECT that threw with the nearest
 * `LOADING_BOUNDARY` on its own scope chain, so a build outside an effect under
 * this scope can never be known to be pending.
 *
 * The content is PARKED, not disposed, while the fallback shows (§3.8). That
 * parking deliberately does NOT reach `branch`: transitions are unspecified (A5).
 */
function loadingBoundary(
  given: Scope | null,
  site: Site,
  fallback: Block<unknown> | null | undefined,
  body: Block<unknown>,
  on?: Cell<unknown>,
): void {
  const pending = createPendingCollector();
  const revealed = signal(false);
  const stored = lookupContext(given, REVEAL_COORD);
  const handle =
    typeof stored === "object" && stored !== null ? (stored as RevealHandle) : undefined;

  const own = enter(given, "branch");
  const park: Site = { parent: document.createDocumentFragment(), anchor: null };
  let live: Site = park;
  let content: readonly Node[] = EMPTY;
  let shown: readonly Node[] = EMPTY;

  const move = (target: Site): void => {
    if (live === target) return;
    live = target;
    insertAt(target, content);
  };

  try {
    pending.install(own);

    // Build BEFORE removing: a revalidation that throws `NotReadyError` leaves
    // the previous nodes exactly where they are, which is what "revalidation
    // keeps stale content" means. Clearing first and rebuilding second showed a
    // blank frame for every refresh.
    renderEffect(() => {
      activation++;
      const next = build(own, body, EMPTY_ARGS);
      if (content.length !== 0) removeNodes(content);
      content = next;
      insertAt(live, content);
    });

    renderEffect(() => {
      if (pending.count() === 0) revealed.set(true);
    });
    if (on !== undefined) {
      let first = true;
      let last: unknown;
      renderEffect(() => {
        const value = on();
        cellSlot(value, "boundary on");
        if (!first && value !== last && untrack(() => pending.count()) > 0) revealed.set(false);
        last = value;
        first = false;
      });
    }

    const slot = handle?.register({ settled: () => revealed() });
    // 0 content, 1 fallback, 2 nothing — the third is a collapsed `Reveal`,
    // which is a display decision and not a third kind of boundary.
    const mode = (): number => {
      if (slot !== undefined) {
        const display = slot.display();
        return display === "content" ? 0 : display === "fallback" ? 1 : 2;
      }
      return pending.count() > 0 && !revealed() ? 1 : 0;
    };

    let showing = -1;
    renderEffect(() => {
      const next = mode();
      if (next === showing) return;
      showing = next;
      untrack(() => {
        if (shown.length !== 0) {
          removeNodes(shown);
          shown = EMPTY;
        }
        if (next === 0) {
          move(site);
          return;
        }
        move(park);
        if (next === 1 && fallback !== null && fallback !== undefined) {
          activation++;
          shown = build(own, fallback, EMPTY_ARGS);
          insertAt(site, shown);
        }
      });
    });

    onCleanup(() => {
      removeNodes(shown);
      removeNodes(content);
      shown = EMPTY;
      content = EMPTY;
    });
  } finally {
    exit(own);
  }
}

// ============================================================================
// portal
// ============================================================================

/**
 * A hole whose insertion target is elsewhere and whose scope's parent is the
 * LEXICAL one (§3.4), which is why a portalled modal reads the provider it is
 * WRITTEN under (X4).
 */
export function portal(
  s: Scope | null,
  target: Cell<Node | string | null | undefined>,
  block: Block<unknown>,
  flags = 0,
): Node {
  const given = requireScope(s, "portal");
  cellSlot(target, "portal target");
  const marker = document.createTextNode("");

  underScope(given, "portal", () => {
    let instance = NOTHING;
    let container: HTMLElement | null = null;
    const site: Site = { parent: null, anchor: null };

    const clear = (): void => {
      if (instance !== NOTHING) {
        teardown(instance);
        instance = NOTHING;
      }
      container?.parentNode?.removeChild(container);
      container = null;
      site.parent = null;
    };

    renderEffect(() => {
      const requested = target();
      cellSlot(requested, "portal target");
      untrack(() => {
        clear();
        // A portal target is very often a node the very tree being built will
        // contain, and that tree is still detached at this instant. The marker
        // IS the portal's lexical position, so its connectedness is the exact
        // predicate for "the surrounding tree has been mounted".
        queueMicrotask(() => {
          if (!marker.isConnected) return;
          const host = resolveTarget(requested);
          if (host === null) return;
          container = document.createElement("div");
          container.style.display = "contents";
          site.parent = container;
          activation++;
          instance = activate(given, site, block, EMPTY_ARGS, flags, "portal");
          host.appendChild(container);
        });
      });
    });

    onCleanup(clear);
  });

  return marker;
}

function resolveTarget(requested: Node | string | null | undefined): Node | null {
  if (typeof requested === "string") {
    const found = document.querySelector(requested);
    return found instanceof HTMLElement ? found : null;
  }
  if (requested === null || requested === undefined) return document.body;
  return requested;
}
