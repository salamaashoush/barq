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
  type RevealOrder,
  createErrorCollector,
  createPendingCollector,
  createRevealCoordinator,
  outerRevealHandle,
} from "./boundaries.ts";
import {
  HydrationMismatch,
  atCursor,
  claimAt,
  cursorAtEnd,
  cursorRest,
  isScaffolding,
  openCursor,
  probeRange,
  claimRange,
  hydrating,
  rangeKey,
  releaseRange,
  report,
  WHOLE,
  withoutClaim,
  type Cursor,
  type Range,
} from "./hydration.ts";
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
  readSlot,
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

/**
 * The module was compiled `hydratable`, so this range is written to the wire
 * between `<!--[-->` and `<!--]-->` and claimed rather than built. The compiler
 * sets it from one option for both backends (`CODESIGN.md` §3.11), so the bytes
 * the string backend writes and the claim this side makes are one decision.
 */
export const HYDRATE = 1 << 2;

/**
 * `hydration.ts`'s `WHOLE`, re-exported on the flag integer the ABI already
 * carries.
 *
 * A hole marked with it owns its parent's whole child list, so the string
 * backend wrote it no boundary comments and the claim is every child read off
 * the document. Anything hand-written that inserts into an element the server
 * filled needs to say so, the way `element()` does.
 */
export { WHOLE };

// `DETECT`, `ir/region.rs`'s `1 << 3`, is deliberately NOT here. It asks the
// string backend to spell a range's key into its open comment and the compiler
// sends it to that backend alone: this side reads whatever key is on the wire
// and `null` — the production answer — has always meant "claim positionally".
// A constant no code path reads is a flag with no row.

/** `each`'s fourth mode: `src` is a count, not a list (`Repeat`). */
export const COUNT: unique symbol = Symbol("barq-count");

/** No key has been computed yet. `undefined` is a legal key, so it cannot say this. */
const UNSET: unique symbol = Symbol("barq-unset");

/**
 * What the wire says when the key it chose has no safe spelling in a comment.
 * The range is still claimed — positionally, which is all `<!--[-->` ever gave
 * a hole — and only the COMPARISON is skipped. `ssr.ts` writes it.
 */
const OPAQUE_KEY = "?";

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
  /**
   * The server's range for this position, until the FIRST activation consumes
   * it. It lives on the site rather than being threaded through `region`,
   * `errorBoundary` and `loadingBoundary` because "the first activation claims
   * and every later one builds" is a property of the POSITION, and putting it
   * anywhere else makes each of those three responsible for saying so.
   */
  claim?: Range | null;
  /**
   * This position is inside a hydration but cannot be claimed, so its body
   * builds the ordinary way and the enclosing `insert` reconciles the server's
   * nodes away. H4's blast radius, at its smallest useful size.
   */
  cold?: boolean;
}

/** K7: a region with no parent owns ONE empty text node, not a comment pair. */
function siteFor(parent: Node | null, anchor: Node | null): { site: Site; out: Node | null } {
  if (parent !== null) return { site: { parent, anchor }, out: null };
  const own = document.createTextNode("");
  const out = document.createDocumentFragment();
  out.appendChild(own);
  return { site: { parent: null, anchor: own }, out };
}

/**
 * The server's range for this site, or `null` when nothing is being hydrated.
 *
 * H2's other half. A range compiled WITHOUT `hydratable` has no boundary
 * comments on the wire, so a page that mixes the two is a build error rather
 * than a rendering accident — and it is detected here, at the first such range,
 * instead of surfacing later as a walk that ran off the end of a parent.
 *
 * The claim also becomes the site's anchor. Every later swap at this position
 * then writes INSIDE the range it claimed, which is what keeps the boundary
 * comments meaningful for the rest of the page's life rather than only for the
 * first paint.
 */
function claimSite(
  site: Site,
  parent: Node | null,
  anchor: Node | null,
  flags: number,
  origin: string,
): void {
  if (!hydrating()) return;
  if ((flags & HYDRATE) === 0) {
    // A construct the flow pass REFUSED reaches its primitive through an
    // adapter in `components.ts`, which has no flags to forward. The range the
    // server wrote is still around this position — the enclosing `insert`
    // claimed it — so the honest answer is to build cold inside it and let that
    // reconcile take the server's nodes out. Local, reported, not a page.
    // Two situations, and they are not the same failure.
    //
    // If the pair is SOUND, this is a construct the flow pass REFUSED reaching
    // its primitive through an adapter with no flags to forward. The position
    // around it owns the range and will reconcile whatever is built here, so
    // building cold is a local answer and a correct one.
    //
    // If the ANCHOR is a boundary comment, it is something else: the client half
    // was built without the flag and the server half with it, so the client's
    // native walk counted the ranges as nodes and everything it addresses from
    // here is off by an unknown amount. That is a deployment mistake, it is not
    // recoverable locally, and pretending otherwise showed the branch's arm
    // TWICE on the page.
    if (isScaffolding(anchor) || (anchor === null && isScaffolding(parent))) {
      throw new HydrationMismatch(
        "not-hydratable",
        `${origin} was compiled without \`hydratable\` and the server's markup was compiled ` +
          "with it — the two halves of this deployment are not the same build",
      );
    }
    report("not-hydratable", `${origin} reached its primitive without the hydratable flag`);
    site.cold = true;
    const stray = probeRange(parent, anchor);
    if (stray !== null) {
      if (stray.nodes.length > 0) {
        report("structure", `${stray.nodes.length} server node(s) at a range with no flag`);
      }
      releaseRange(stray);
      site.anchor = stray.close;
      site.parent = stray.close?.parentNode ?? stray.parent;
    }
    return;
  }
  // The ORIGINAL pair, not `siteFor`'s. A region with no parent was given a
  // synthesised anchor in a detached fragment, and nothing in that fragment is
  // the server's; `(null, null)` means "the next range at the cursor", which is
  // what a unit-root region actually occupies.
  // `WHOLE` is `hydration.ts`'s and `ir/region.rs`'s, riding the same integer
  // as `HYDRATE`: this range owns its parent element, so the string backend
  // wrote it no comments and the claim is every child of that parent. It is
  // never set under `DETECT`, because the open comment is where the key goes.
  const range = claimAt(parent, anchor, flags & WHOLE);
  // `null` is "this position is not in the server's tree" — a region inside
  // something the client built. It claims nothing and builds cold, which is the
  // same answer `hole` gives one level up.
  if (range === null) {
    site.cold = true;
    return;
  }
  site.claim = range;
  site.anchor = range.close;
  site.parent = range.close?.parentNode ?? range.parent;
}

/**
 * The two open comments the string backend writes for a boundary that did NOT
 * settle: `b:<id>` for one the stream will swap, `f:` for one nothing will.
 *
 * `ssr.ts`'s `SAFE_KEY` excludes `:` so that no DEV branch key can spell either,
 * which is what makes the test below a discrimination rather than a guess.
 */
const UNSETTLED_KEYS = ["b:", "f:"];

/** The key an ISLAND is written behind, joining `b:` and `f:` outside `SAFE_KEY`. */
const ISLAND_KEY = "i:";

/**
 * Take this site's claim if the server SETTLED it, leaving a deferred one alone.
 *
 * Consuming it here is what stops `boundary`'s strand-and-release running
 * afterwards: "the first activation claims" is a property of the position, and
 * a loading boundary that took the claim has spent it.
 */
function takeSettledClaim(site: Site): Range | null {
  const claim = site.claim;
  if (claim === undefined || claim === null) return null;
  const wire = rangeKey(claim);
  if (wire !== null && UNSETTLED_KEYS.some((key) => wire.startsWith(key))) return null;
  site.claim = null;
  return claim;
}

/**
 * The other half: take this site's claim precisely BECAUSE the server did not
 * settle it.
 *
 * `b:` and `f:` mean the nodes at this position are the boundary's FALLBACK —
 * the shell flushed before the body was ready. The client's fallback is the same
 * markup, so it claims those nodes rather than building a second copy beside
 * them, and only the CONTENT is parked.
 *
 * Without this the range was left unclaimed and the walk went on addressing
 * positions after it: measured on a page with one never-settling boundary as
 * "the server's markup ran out where the client expected <span>", `recovered:
 * true` and 0% reuse — a whole page thrown away for one pending boundary.
 *
 * This is the shape React calls a dehydrated boundary: `<!--$?-->` keeps its
 * fallback hydrated while the content waits
 * (`ReactDOMFizzInstructionSetShared.js`'s `SUSPENSE_PENDING_START_DATA`).
 */
function takeUnsettledClaim(site: Site): Range | null {
  const claim = site.claim;
  if (claim === undefined || claim === null) return null;
  const wire = rangeKey(claim);
  if (wire === null || !UNSETTLED_KEYS.some((key) => wire.startsWith(key))) return null;
  site.claim = null;
  return claim;
}

/**
 * The node a caller inserts, once the site is known.
 *
 * K7 synthesises an anchor in a detached fragment when a region has no
 * `(parent, anchor)` of its own, and the caller inserts that fragment. A
 * CLAIMED site is not that case: `claimSite` redirected it into the document,
 * so the content is already where it belongs and the fragment holds nothing but
 * its own empty text node.
 *
 * Returning the fragment there does two kinds of damage, and the second is the
 * one that took a browser to see. The stray text node is cosmetic. But the
 * fragment is also what `build` reports as the nodes this body PRODUCED, so
 * `evictUnclaimed` compares the server's whole claimed range against a single
 * empty text node and removes every node in it — measured on a router page as
 * `"5 server node(s) at a range the client rebuilt"` and an empty document.
 */
function outFor(site: Site, out: Node | null): Node | null {
  if (out === null) return null;
  return site.anchor !== null && site.anchor.parentNode === out ? out : null;
}

function hostOf(site: Site): Node | null {
  return site.anchor !== null ? site.anchor.parentNode : site.parent;
}

function insertAt(site: Site, nodes: readonly Node[]): void {
  const host = hostOf(site);
  if (host === null) return;
  let anchor = site.anchor;
  for (let i = nodes.length; i--;) {
    place(host, nodes[i], anchor);
    anchor = nodes[i];
  }
}

/**
 * `insertBefore` that does nothing when the node is already there.
 *
 * The DOM defines `insertBefore` on a node that is already in position as a
 * REMOVAL followed by an insertion, and a removal is what blurs the element
 * inside it. On the claim path every node is already in position, so without
 * this line hydration would move the whole page one node at a time and H6 would
 * fail for the one reason claiming exists to remove.
 */
function place(parent: Node, node: Node, before: Node | null): void {
  if (node.parentNode === parent && node.nextSibling === before) return;
  parent.insertBefore(node, before);
}

/**
 * Removal, in ONE DOM call when the run being removed is every child its parent
 * has — `dom.ts`'s `removeNodes` states the measurement and the guard.
 *
 * This is the copy the LIST path reaches, and the list is where it matters:
 * `clear rows` empties a `<tbody>` of 1,000 rows through `syncRows`, and the
 * per-node loop was 2.85 ms of that operation's 3.95 ms of JS.
 */
function removeNodes(nodes: readonly Node[]): void {
  const count = nodes.length;
  if (count === 0) return;
  const host = nodes[0].parentNode;
  if (host !== null && count === host.childNodes.length && allUnder(host, nodes)) {
    host.textContent = "";
    return;
  }
  for (let i = 0; i < count; i++) nodes[i].parentNode?.removeChild(nodes[i]);
}

function allUnder(host: Node, nodes: readonly Node[]): boolean {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].parentNode !== host) return false;
  }
  return true;
}

function flatten(groups: readonly Node[][]): Node[] {
  const out: Node[] = [];
  for (const group of groups) for (const node of group) out.push(node);
  return out;
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
  // The FIRST activation at a claimed position builds under the server's
  // nodes; every later one is an ordinary build. Taking it off the site here is
  // what makes that true without any caller having to remember it.
  const claim = site.claim ?? null;
  site.claim = null;
  if (claim === null) return attempt(given, site, body, args, flags, kind, null);
  // H4'S BLAST RADIUS, GENERALISED.
  //
  // `hydration.ts` says a mismatch has exactly two catchers: a region rebuilds
  // its own range, or `hydrate` re-renders the page. Until §12 only ONE
  // mismatch reached the first catcher — a branch key that disagreed — and
  // every other kind travelled all the way up, so a divergent arm cost the page
  // rather than the range.
  //
  // §12 took the key off the production wire, which makes this the catcher that
  // has to work: a production build detects a divergent arm STRUCTURALLY, from
  // inside the claim, and this is what turns that into a local rebuild. The
  // attempt's own `finally` has already released the server's nodes and
  // disposed the scope, so the retry is an ordinary cold build at a position
  // that is now empty — the same state a released key mismatch leaves.
  //
  // It reports. A region that swallowed one would be the third catcher the
  // design says does not exist.
  try {
    return attempt(given, site, body, args, flags, kind, claim);
  } catch (error) {
    if (!(error instanceof HydrationMismatch)) throw error;
    report(error.kind, `${kind}: ${error.message} — the range was rebuilt`);
    releaseRange(claim);
    return attempt(given, site, body, args, flags, kind, null);
  }
}

function attempt(
  given: Scope | null,
  site: Site,
  body: Block<unknown>,
  args: readonly unknown[],
  flags: number,
  kind: "branch" | "portal",
  claim: Range | null,
): Instance {
  // No claim means COLD, always. A region whose first attempt threw has already
  // spent its claim, and the fallback it builds instead must not go on claiming
  // from a cursor that is now pointing at the failed attempt's nodes — that is
  // the shape that turned an error boundary's recovery into "the markup ran
  // out". `withoutClaim` costs nothing when nothing is hydrating.
  //
  // The cursor is kept so `evictUnclaimed` can ask it what the body did NOT
  // consume, which is the same question `each` asks its row cursor.
  let cursor: Cursor | null = null;
  const under = <T>(work: () => T): T => {
    if (claim === null) return withoutClaim(work);
    cursor = openCursor(claim);
    return atCursor(cursor, work);
  };

  if ((flags & NO_SCOPE) !== 0) {
    const nodes = under(() => build(given, body, args));
    evictUnclaimed(claim, cursor);
    insertAt(site, nodes);
    return { scope: null, nodes };
  }
  const scope = enter(given, kind);
  let nodes: readonly Node[] = EMPTY;
  let built = false;
  try {
    nodes = under(() => build(scope, body, args));
    built = true;
  } finally {
    exit(scope);
    if (!built) {
      disposeScope(scope);
      // The claim goes with the attempt that failed. Its nodes are the server's
      // rendering of a body that just threw on the client, so they are wrong by
      // construction, and leaving them would put them beside whatever the
      // recovery builds instead.
      if (claim !== null) releaseRange(claim);
    }
  }
  const instance: Instance = { scope, nodes };
  ownRange(scope, () => {
    removeNodes(instance.nodes);
    instance.nodes = EMPTY;
  });
  evictUnclaimed(claim, cursor);
  insertAt(site, nodes);
  return instance;
}

/**
 * The server's nodes at a claimed position that the body did NOT take.
 *
 * A body that claimed everything leaves the cursor at the end and this removes
 * nothing. A body that could not — a construct the flow pass refused, reached
 * through an adapter with no flags to forward, or an arm that built cold after
 * its first attempt threw — leaves a tail, and the server's nodes there have to
 * go or the page shows both. That was measurable as a DUPLICATED fallback,
 * which is the failure a markup comparison catches and a reuse percentage does
 * not.
 *
 * ASK THE CURSOR, not the produced node list, and the difference is not a
 * refactor. A NESTED region claims in place and hands its caller nothing to
 * insert — there is no synthesised node once the site is claimed — so the outer
 * body's produced list is empty while the server's nodes are all correctly
 * taken. Comparing lists evicted the whole page. `each` has always asked its
 * row cursor this way (`cursorAtEnd`/`cursorRest`); this is the same question.
 */
function evictUnclaimed(claim: Range | null, cursor: Cursor | null): void {
  if (claim === null || cursor === null) return;
  claim.nodes = [];
  if (cursorAtEnd(cursor)) return;
  const stranded = cursorRest(cursor);
  if (stranded.length === 0) return;
  for (const node of stranded) node.parentNode?.removeChild(node);
  report("structure", `${stranded.length} server node(s) at a range the client rebuilt`);
}

/** A Cell ignores every argument (§3.0 rule 1), so one spelling serves both. */
function build(scope: Scope | null, body: Block<unknown>, args: readonly unknown[]): Node[] {
  // An already-built value in a renderable slot. Compiled code never produces
  // one — C6 makes children a Block — but the un-compiled surface `packages/extra`
  // is still on does, and `Out` admits a `Node` in its own right.
  if (typeof body !== "function") return childToNodes(body, scope);
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
  /**
   * The last attempt at `previous` SUSPENDED, so there is nothing standing at
   * this position and the key has not moved. Both halves have to be answered or
   * the region wedges: see `attemptTracked` below for the dependency, and the
   * `retry` test in the key effect for the rebuild.
   */
  let retry = false;

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

  /**
   * A body build is UNTRACKED — a body's own reads must not become dependencies
   * of the key, or every value the content displays would re-swap the whole
   * region instead of updating in place. That is right for a body that builds,
   * and wrong for one that SUSPENDS: a `NotReadyError` means nothing was built,
   * and an untracked read registered no dependency, so nothing will ever wake
   * this position again. The boundary above shows its fallback for good.
   *
   * So a suspended body is retried TRACKED. The read then lands on the key
   * effect, the resource settling re-runs it, and `retry` is what stops the
   * "key did not move" short-circuit from reading that as nothing to do. The
   * cost is confined to the suspended case: a body that completes is never
   * tracked, so nothing about the ordinary path changes.
   */
  const swapMaybeSuspending = (k: K): void => {
    try {
      untrack(() => swap(k));
    } catch (error) {
      if (!(error instanceof NotReadyError)) throw error;
      swap(k);
    }
  };

  /**
   * H2. The written key decides what may be CLAIMED, never what is built.
   *
   * The server wrote the key it chose; the client takes its own read anyway and
   * compares. Agreement claims the range's nodes untouched. Disagreement is a
   * MISMATCH, not a vote — the claim is released, the server's nodes go, and
   * the client's arm is built in their place, with H4's blast radius being this
   * range and nothing else.
   *
   * The client's arm is the one that wins, and that is deliberate: its
   * condition is what the reactive graph will go on maintaining, so a branch
   * held on the server's arm against the client's own read has nothing that
   * would ever repair it. What the wire buys is DETECTION and a bound on the
   * damage. Keeping the server's arm until the client is seeded needs a
   * seeding barrier nobody has specified, and H2 does not claim it.
   */
  const reconcileKey = (k: K): K => {
    const claim = site.claim;
    if (claim === undefined || claim === null) return k;
    const wire = rangeKey(claim);
    if (wire === null || wire === OPAQUE_KEY) return k;
    if (wire === String(k)) return k;
    report("key", `the server took branch ${JSON.stringify(wire)}, the client takes ${String(k)}`);
    releaseRange(claim);
    site.claim = null;
    return k;
  };

  const swapInner = (k: K): void => {
    if (instance !== NOTHING) {
      teardown(instance);
      instance = NOTHING;
    }
    k = reconcileKey(k);
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
      if (previous !== UNSET && k === previous && !retry) return;
      previous = k;
      // Set before the attempt and cleared on the far side of one that
      // returned, so a throw leaves it standing and the next run is a retry.
      retry = true;
      swapMaybeSuspending(k);
      retry = false;
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
    if (previous !== UNSET && k === previous && !retry) return;
    previous = k;
    retry = true;
    swapMaybeSuspending(k);
    retry = false;
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
  claimSite(site, parent, anchor, flags, "branch");
  underScope(given, "branch", () => region(given, site, key, bodies, flags, EMPTY_ARGS, null));
  return outFor(site, out);
}

const EMPTY_ARGS: readonly unknown[] = [];

// ============================================================================
// each — For (three keying modes), Repeat
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
 *
 * The mode is a RUNTIME argument, not a compiled-in shape: the row Block's
 * parameter list is `(scope, item, index)` in all three list modes and it is
 * `mapArray` that decides what `item` and `index` are. That is what lets a
 * construct whose `keyed` arrived through a spread lower here at all — the
 * carrier crosses unresolved and `keyed` below is §3.0 rule 1, asked once per
 * construction rather than per row.
 */
/**
 * §3.0 rule 1, applied to the keying slot: a key FUNCTION declares a parameter
 * and a Cell declares none, and that is the only thing separating them once both
 * are values in one slot. `true` and `undefined` are identity, which `mapArray`
 * spells `null`.
 *
 * The compiler answers this statically wherever it can see the prop and emits
 * `null` / `false` / the function itself, so the three tests below cost one
 * `typeof` per construction on that path. It is only a spread that reaches here
 * with something still to resolve.
 */
export function keyMode<T>(
  carrier: ((item: T) => unknown) | false | null | typeof COUNT | Cell<unknown>,
): ((item: T) => unknown) | false | null | typeof COUNT {
  if (carrier === COUNT || carrier === false || carrier === null || carrier === undefined) {
    return carrier === COUNT || carrier === false ? carrier : null;
  }
  const resolved =
    typeof carrier === "function" && (carrier as { length: number }).length >= 1
      ? carrier
      : readSlot(carrier, "each keyOf");
  if (typeof resolved === "function") return resolved as (item: T) => unknown;
  return resolved === false ? false : null;
}

export function each<T>(
  s: Scope | null,
  parent: Node | null,
  anchor: Node | null,
  src: Cell<Maybe<readonly T[]>> | Cell<number>,
  carrier: ((item: T) => unknown) | false | null | typeof COUNT | Cell<unknown>,
  row: Block<unknown, never[]>,
  // Positional and part of the ABI — `fallback` sits behind it. The only bit
  // this frame reads is `HYDRATE`: `STATIC_KEY` is meaningless for a list, and
  // `NO_SCOPE` would have to reach the row scopes `mapArray`/`repeat` own.
  flags = 0,
  fallback?: Block<unknown> | null,
): Node | null {
  const given = requireScope(s, "each");
  const keyOf = keyMode<T>(carrier);
  // The source is handed to `mapArray`/`repeat` BY IDENTITY, so the read
  // happens inside their own effects and there is no site here to test the
  // yielded value at. Wrapping it would cost a closure per construction on the
  // list path; the value test is what closes the branded case, and the
  // laundered `() => aBlock` form is registered rather than described —
  // `sem-props-block-in-cell-slot`'s `each source` row.
  cellSlot(src, "each source");
  const { site, out } = siteFor(parent, anchor);
  claimSite(site, parent, anchor, flags, "each");
  // ONE cursor over the list's range, shared by every row.
  //
  // A row used to be delimited on the wire so the client could hand row `i` its
  // own nodes. It does not need to be: the rows are built in ORDER, so a row's
  // extent is exactly what its build consumed, and a cursor that survives
  // between rows records that with no bytes at all. §12's reversal is what this
  // is — 1,600 of the 100-row page's 6,416 hydration bytes, and the only two
  // comments per row anyone was ever paying for.
  //
  // A client that renders more rows than the server wrote builds the extra ones
  // cold; a client that renders fewer leaves nodes nobody adopted. Both are
  // reported and both are cleaned up below.
  const claim = site.claim ?? null;
  const rowCursor: Cursor | null = claim === null ? null : openCursor(claim);
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
          // The closure exists only for the hydrating cursor to wrap, and it is
          // one allocation PER ROW. Nothing is hydrating in the ordinary case.
          if (rowCursor === null) return build(scope, body, [index]);
          return inRow(rowCursor, () => build(scope, body, [index]));
        },
        { fallback: fallbackRows },
      );
    } else {
      const mapper = (item: unknown, index: unknown, scope: Scope): Node[] => {
        activation++;
        if (rowCursor === null) return build(scope, body, [item, index]);
        return inRow(rowCursor, () => build(scope, body, [item, index]));
      };
      rows = mapArray(src as Cell<Maybe<readonly T[]>>, mapper as never, {
        keyed: (keyOf ?? true) as never,
        fallback: fallbackRows,
      });
    }

    syncRows(site, rows);
    // Nodes the server wrote that no row adopted. They are in the document and
    // nothing owns them, so they go — H4's blast radius, at row granularity.
    // With no per-row comments the leftover is simply whatever the shared cursor
    // still holds, which is a stronger statement than the old row count: it
    // catches a row that consumed FEWER nodes than the server wrote for it as
    // well as a list that was shorter on the client.
    if (site.cold !== true && rowCursor !== null && !cursorAtEnd(rowCursor)) {
      const stranded = cursorRest(rowCursor);
      report("structure", `the server wrote ${stranded.length} node(s) no row claimed`);
      for (const node of stranded) node.parentNode?.removeChild(node);
    }
    site.claim = null;
    return outFor(site, out);
  });
}

/**
 * Build one row, claiming from the list's shared cursor.
 *
 * A row past the server's count finds the cursor spent and builds cold —
 * deliberately not an exception: a list whose length changed between the render
 * and the hydration is the ordinary case, and the rows that DID match still keep
 * their nodes. It is still reported, because "nothing was reported" has to mean
 * the list was the list.
 */
function inRow(cursor: Cursor | null, make: () => Node[]): Node[] {
  if (cursor === null) return make();
  if (cursorAtEnd(cursor)) {
    report("structure", "a row the server did not write");
    return withoutClaim(make);
  }
  return atCursor(cursor, make);
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
      // Emptying the list is its own case, and not only to skip a `Set` of
      // every group: it is the one removal that can go through `removeNodes`'s
      // single-call path, which is what `clear rows` is.
      if (next.length === 0) {
        removeNodes(flatten(current));
      } else {
        const kept = new Set(next);
        for (const group of current) {
          if (kept.has(group)) continue;
          for (const node of group) node.parentNode?.removeChild(node);
        }
      }
    }

    syncNodeOrder(host, site.anchor, current, next);
    current = next;
  });

  onCleanup(() => {
    removeNodes(flatten(current));
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
  claimSite(site, parent, anchor, flags, "boundary");
  if (kind === "error") {
    errorBoundary(given, site, fallback, body, flags);
  } else {
    loadingBoundary(given, site, fallback, body, on);
  }
  // A claim nobody spent — which after M13 means a boundary that DECLINED one,
  // not every loading boundary. `loadingBoundary` takes a settled range and
  // builds into the document under it; it leaves a deferred `<!--[b:N-->` range
  // alone, because the stream has not swapped that one yet and its nodes are
  // still the fallback. `errorBoundary` goes through `activate` and has always
  // claimed. What reaches here is the declined case, and the server's nodes go
  // rather than standing beside the rebuilt ones — without it the page showed
  // the fallback TWICE.
  if (site.claim !== undefined && site.claim !== null) {
    const stranded = site.claim;
    site.claim = null;
    if (stranded.nodes.length > 0) {
      report("structure", `${stranded.nodes.length} server node(s) at a boundary that parks`);
      releaseRange(stranded);
    }
  }
  return outFor(site, out);
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
      if (err instanceof NotReadyError || err instanceof HydrationMismatch) throw err;
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
    // A `HydrationMismatch` is not the application's error and this is not the
    // thing that recovers from it. `hydrate` does — by throwing the whole
    // attempt away and rendering the page cold — and it can only do that if the
    // throw reaches it. Caught here instead, the boundary showed its fallback
    // (or nothing) and the page stayed broken with the recovery never run:
    // measured on a route whose two halves disagreed, as an empty region and one
    // console line. `NotReadyError` is re-thrown for the same reason a level up.
    if (error instanceof NotReadyError || error instanceof HydrationMismatch) return null;
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
  // The server's nodes at this position, when the server actually SETTLED here.
  //
  // This is the whole of H4's loading case and it was missing until M13. A
  // loading boundary parks its content so that an unready body never sits in
  // the document — but on the FIRST build of a hydration there is nothing to
  // protect: the server already ran the body to completion and its markup is at
  // `site`, so parking means building a second copy beside markup that is
  // already correct and then throwing the server's away. Measured on the router,
  // whose every route depth is one of these: `claimed: 0` on every page, the
  // seed unconsumed, and the loader refetched.
  //
  // A DEFERRED range is the one case where parking is still right. `<!--[b:N-->`
  // means the shell flushed before the body was ready and the stream will swap
  // the content in later; until it does, those nodes are the FALLBACK, and
  // claiming them would claim the wrong markup. `swapDeferredRange` rewrites the
  // open comment to the plain `[` once the content lands, so a swapped range
  // reads as settled here — which it is.
  const settled = takeSettledClaim(site);
  // The server's own fallback, when it wrote one. Consumed by the first build of
  // this boundary's fallback, which is the only thing entitled to it.
  let fallbackClaim: Range | null = settled === null ? takeUnsettledClaim(site) : null;
  let live: Site = settled === null ? park : site;
  let firstClaim: Range | null = settled;
  let instance: Instance = NOTHING;
  let shown: readonly Node[] = EMPTY;

  const move = (target: Site): void => {
    if (live === target) return;
    // Leaving the park takes EVERYTHING in it, not the node list the last build
    // returned. The fragment holds this boundary's content and nothing else, so
    // its child list is the truth — including whatever a nested region swapped
    // in while the content was parked, which the build's own list has never
    // heard of. Moving the list instead left those nodes in a fragment that
    // never reaches the document, which is the orphan half of M7's report.
    const moving = live === park ? [...park.parent!.childNodes] : instance.nodes;
    live = target;
    insertAt(target, moving);
  };

  try {
    pending.install(own);

    // ONE INSTANCE PER BUILD, torn down through its own scope — which is what
    // `activate` does for every other consumer of `region`, and what this
    // rebuilt by hand until M10.
    //
    // The hand-rolled version kept a NODE LIST and removed it directly. Both
    // halves were wrong the moment the body contained a region of its own,
    // because a nested region swaps its own nodes and the list is a snapshot
    // taken at the last build: it names nodes that are gone and omits the ones
    // that are there. A revalidation then removed a stale list, left the
    // nested region's current arm in the document, and inserted a fresh build
    // beside it — a DUPLICATED subtree, and one accumulating undisposed scope
    // per revalidation, since the body's own scope was entered once and never
    // re-entered.
    //
    // Going through `attempt` fixes both by not tracking anything: disposal
    // reaches the instance scope, every nested region under it is a CHILD, and
    // each removes whatever it currently owns through its own `ownRange`.
    //
    // Build BEFORE tearing down: a revalidation that throws `NotReadyError`
    // leaves the previous instance exactly where it is, which is what
    // "revalidation keeps stale content" means. Clearing first and rebuilding
    // second showed a blank frame for every refresh.
    renderEffect(() => {
      const claim = firstClaim;
      firstClaim = null;
      let next: Instance;
      try {
        next = attempt(own, live, body, EMPTY_ARGS, 0, "branch", claim);
      } catch (error) {
        // The server settled this range and the client could not — a seed that
        // never arrived, or a value only a browser can read. `attempt` has
        // already released the claim and disposed the scope it opened, so from
        // here this boundary is an ordinary cold one, and an ordinary cold one
        // parks. Without this line the retry would build the ready content
        // straight into the document while `mode()` still says fallback.
        if (claim !== null) live = park;
        throw error;
      }
      if (instance !== NOTHING) teardown(instance);
      instance = next;
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

    // A leaf's two predicates are one accessor: a boundary that has settled has
    // its own first visible content, and that IS its full readiness (A6).
    const slot = handle?.register({ ready: () => revealed(), minimallyReady: () => revealed() });
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
          // The server's fallback is DEAD once content shows, and it has to go
          // or it stands beside the content. This is the nested case: an outer
          // boundary owns the `[f:` range, a boundary INSIDE it absorbs the
          // pendingness, so the outer renders content and never builds the
          // fallback its claim was being held for. Measured as a fallback
          // rendered twice — `<span class="loading">` beside itself.
          if (fallbackClaim !== null) {
            removeNodes(fallbackClaim.nodes);
            fallbackClaim = null;
          }
          move(site);
          return;
        }
        move(park);
        if (next === 1 && fallback !== null && fallback !== undefined) {
          activation++;
          const claim = fallbackClaim;
          fallbackClaim = null;
          if (claim === null) {
            shown = build(own, fallback, EMPTY_ARGS);
          } else {
            // HYDRATED, not rebuilt: these are the server's fallback nodes and
            // this is the same fallback. `place` is a no-op for a node already
            // in position, so `insertAt` below keeps their identity.
            const cursor = openCursor(claim);
            shown = atCursor(cursor, () => build(own, fallback, EMPTY_ARGS));
            evictUnclaimed(claim, cursor);
          }
          insertAt(site, shown);
        }
      });
    });

    onCleanup(() => {
      removeNodes(shown);
      shown = EMPTY;
      // A slot list that only ever grows is not a contract: a boundary that
      // dies inside a `Show` would hold its group's frontier at its own index
      // for the rest of the page, and nothing reports it.
      slot?.unregister();
      // The instance's own nodes go with its scope, which is a child of `own`
      // and is disposed by the same cascade that runs this.
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
/**
 * An ISLAND: markup the server rendered that the client must not hydrate.
 *
 * Solid's `NoHydration`. The server half renders the subtree as ordinary markup
 * inside a delimited range; this half claims that range and BUILDS NOTHING, so a
 * static subtree costs zero claim work and ships no client behaviour.
 *
 * This is the fine-grained answer to the goal React reaches for with selective
 * hydration. React splits an expensive hydration into interruptible units because
 * it re-executes every component to hydrate (`ReactFiberBeginWork.js:1966-1972`);
 * a framework whose components run once has no such cost to split, and the win
 * available to it is not hydrating at all.
 *
 * COLD, it is transparent: with no claim to take — a client-only render, or a
 * position the server never wrote — the children build normally, because an
 * island is a statement about hydration and not about what the page contains.
 */
export function island(
  s: Scope | null,
  parent: Node | null,
  anchor: Node | null,
  block: Block<unknown>,
  flags = 0,
): Node | null {
  const site: Site = { parent, anchor };
  if (hydrating()) {
    // BY ADDRESS, exactly as `hole` claims: inside a compiled template this
    // position is reached through `child`/`sib` off a claimed root, not through
    // the walk's cursor — so a cursor-based claim never sees the island at all.
    // Measured on the first attempt: `built: 1` with the island's body running
    // and its output appended beside the server's markup.
    const claim = claimRange(parent, anchor);
    if (claim !== null && rangeKey(claim) === ISLAND_KEY) {
      // Nothing is built and nothing is walked. The server's nodes stay exactly
      // where they are, which is the whole of what an island buys.
      return claim.nodes.length > 0 ? claim.nodes[0] : null;
    }
    // Not an island on the wire — a client-only render, or a position the server
    // wrote differently. Give the claim back and build cold.
    if (claim !== null) releaseRange(claim);
  }
  const instance = attempt(s, site, block, EMPTY_ARGS, flags, "branch", null);
  return instance.nodes.length > 0 ? instance.nodes[0] : null;
}

export function portal(
  s: Scope | null,
  target: Cell<Node | string | null | undefined>,
  block: Block<unknown>,
  flags = 0,
): Node {
  const given = requireScope(s, "portal");
  cellSlot(target, "portal target");
  const marker = document.createTextNode("");

  // A portal is the one construct whose server bytes are in the WRONG PLACE by
  // construction: the string backend has no second insertion point, so it wrote
  // an EMPTY range at the lexical position and the content is the client's to
  // build on a microtask. Nothing is claimed here — the `insert` that places
  // this marker claims that range, finds it empty, and puts the marker in it.

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

/**
 * Reveal ordering — the fifth thing `flow.ts` owns, and the one that is not a
 * range.
 *
 * It creates a PROVIDE scope: the coordinator every `Loading` boundary below it
 * asks how to time its reveal. That is why it is not `branch` and never was —
 * `ownership.rs` lists `provide` separately, and there is no conditional here.
 * What M9 removed is the COMPONENT around it: the order and the collapsed flag
 * arrive as Cells the compiler computed, the children as the Block they already
 * were, and nothing reads a props record to find them.
 *
 * X1's order is the whole of it: enter, fork, write, invoke — with the outer
 * group looked up from the scope this was GIVEN, before the fork, because the
 * fork is what shadows it (A6).
 */
export function reveal(
  s: Scope | null,
  order: Cell<RevealOrder | undefined>,
  collapsed: Cell<boolean | undefined>,
  block: Block<unknown>,
): Node[] {
  const handle: RevealHandle = createRevealCoordinator(
    () => order() ?? "sequential",
    () => collapsed() === true,
    outerRevealHandle(s),
  );
  const scope = enter(s ?? null, "provide");
  try {
    onCleanup(() => handle.detach());
    provideOn(scope, REVEAL_COORD, handle);
    return childToNodes(block(scope) as Child, scope);
  } finally {
    exit(scope);
  }
}

function resolveTarget(requested: Node | string | null | undefined): Node | null {
  if (typeof requested === "string") {
    const found = document.querySelector(requested);
    return found instanceof HTMLElement ? found : null;
  }
  if (requested === null || requested === undefined) return document.body;
  return requested;
}
