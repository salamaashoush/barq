/**
 * The four control-flow primitives.
 *
 * Two invariants the shape of this file exists to hold:
 *
 * - O2/O3.7: `childScope(owner)` is the only spelling used, so an instance always
 *   has an owner that leads back to the scope the construct was HANDED — never
 *   nothing. `region` says why a swapped instance hangs off its effect.
 * - C7: every Block goes through `invoke`, including the two the error boundary
 *   hands `region` as its own arms.
 */

import type { Child } from "./dom.ts";
import {
  LIVE_EDGES,
  childToNodes,
  delegatedRootOf,
  hostPortal,
  registerDelegatedContainer,
  unregisterDelegatedContainer,
} from "./dom.ts";
import {
  HydrationMismatch,
  abandonClaim,
  atCursor,
  claimAt,
  cursorAtEnd,
  cursorRest,
  inDocumentOrder,
  isScaffolding,
  openCursor,
  probeRange,
  claimRange,
  hydrating,
  rangeKey,
  releaseRange,
  report,
  usualCauses,
  WHOLE,
  withoutClaim,
  type Cursor,
  type Range,
} from "./hydration.ts";
import type { Block, Cell, Scope } from "./scope.ts";
import { createMemo } from "@solidjs/signals";
import {
  createEffect,
  ERROR_BOUNDARY,
  type Maybe,
  NotReadyError,
  type RevealOrder,
  childScope,
  createErrorBoundary,
  createLoadingBoundary,
  createRevealOrder,
  createSignal,
  diagnosticsEnabled,
  disposeScope,
  emitDiagnostic,
  flush,
  isBlock,
  onCleanup,
  ownRange,
  provideOn,
  readSlot,
  renderEffect,
  runWithOwner,
  getOwner,
  mapArray,
  OWNERSHIP,
  repeat,
  jsxAsValue,
  traceScope,
  underScope,
  untrack,
} from "./signals.ts";

// ============================================================================
// Flags — the compiler ships proofs, the runtime skips work because of them
// ============================================================================

// A flag that moves neither an allocation count nor a
// wall-clock number is deleted. `bench:flags` throws if a flag declared here has
// no row; `FAST_CLEAR` and `INDEX_UNUSED` were written, measured at zero on both
// counters, and removed.

/** The key expression reads nothing reactive: evaluate once, open no effect. */
export const STATIC_KEY: number = 1 << 0;
/** No body registers anything disposable: activate without allocating a Scope. */
export const NO_SCOPE: number = 1 << 1;

/**
 * The module was compiled `hydratable`, so this range is written to the wire
 * between `<!--[-->` and `<!--]-->` and claimed rather than built. The compiler
 * sets it from one option for both backends, so the bytes
 * the string backend writes and the claim this side makes are one decision.
 */
export const HYDRATE: number = 1 << 2;

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
  LIVE_EDGES.add(own);
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
const WRITTEN_AS: Record<string, string> = {
  branch: "a conditional such as `<Show>` or `<Switch>`",
  each: "a list such as `<For>`",
  boundary: "a `<Loading>` or `<Errored>` boundary",
  portal: "a `<Portal>`",
};

const REST_REUSED = "and the rest of the server's markup was reused.";

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
        `the browser bundle renders ${WRITTEN_AS[origin]} compiled without ` +
          "`hydratable: true` over server markup compiled with it, so the two were not built " +
          "together",
      );
    }
    report(
      "not-hydratable",
      `The browser rendered ${WRITTEN_AS[origin]} that was not compiled with ` +
        "`hydratable: true`, so it could not reuse the server's markup at its position. " +
        `${usualCauses("not-hydratable")} It was built again in the browser ${REST_REUSED}`,
    );
    site.cold = true;
    const stray = probeRange(parent, anchor);
    if (stray !== null) {
      if (stray.nodes.length > 0) {
        report(
          "structure",
          `The server sent ${stray.nodes.length} node(s) for ${WRITTEN_AS[origin]} that the ` +
            "browser renders without `hydratable: true`. The nodes were removed, because the " +
            "browser built that content again.",
        );
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
function outFor(site: Site, out: Node | null, claimed: Range | null): Node | Node[] | null {
  if (out === null) return null;
  if (site.anchor !== null && site.anchor.parentNode === out) return out;
  return claimed === null ? null : rangeNodes(claimed);
}

/**
 * A claimed range as it stands, comments included.
 *
 * What a region that adopted the server's nodes hands its caller. The caller
 * places by identity, so nodes already in position cost nothing — and a value
 * that left them out read as "nothing here", which put a sibling built beside
 * them on the wrong side and reconciled the range's own comments away.
 */
function rangeNodes(range: Range): Node[] {
  const nodes: Node[] = [];
  const { open, close } = range;
  if (open === null || close === null || open.parentNode === null) return nodes;
  for (let node: Node | null = open; node !== null; node = node.nextSibling) {
    nodes.push(node);
    if (node === close) break;
  }
  LIVE_EDGES.add(close);
  return nodes;
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

// ============================================================================
// One activation
// ============================================================================

/** `scope` is null exactly when `NO_SCOPE` was proved. */
interface Instance {
  scope: Scope | null;
  nodes: readonly Node[];
}

/** Marks which arm a boundary's view is showing; the nodes are placed by hand. */
const CONTENT: unique symbol = Symbol("barq-content");

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
  placed = true,
): Instance {
  // The FIRST activation at a claimed position builds under the server's
  // nodes; every later one is an ordinary build. Taking it off the site here is
  // what makes that true without any caller having to remember it.
  const claim = site.claim ?? null;
  site.claim = null;
  if (claim === null) return attempt(given, site, body, args, flags, kind, null, placed);
  // H4'S BLAST RADIUS, GENERALISED.
  //
  // `hydration.ts` says a mismatch has exactly two catchers: a region rebuilds
  // its own range, or `hydrate` re-renders the page. While the branch key was
  // on the production wire only ONE mismatch reached the first catcher — a key
  // that disagreed — and every other kind travelled all the way up, so a
  // divergent arm cost the page rather than the range.
  //
  // The key is off the production wire now, which makes this the catcher that
  // has to work: a production build detects a divergent arm STRUCTURALLY, from
  // inside the claim, and this is what turns that into a local rebuild. The
  // attempt's own `finally` has already released the server's nodes and
  // disposed the scope, so the retry is an ordinary cold build at a position
  // that is now empty — the same state a released key mismatch leaves.
  //
  // It reports. A region that swallowed one would be the third catcher the
  // design says does not exist.
  try {
    return attempt(given, site, body, args, flags, kind, claim, placed);
  } catch (error) {
    if (!(error instanceof HydrationMismatch)) throw error;
    report(
      error.kind,
      `${error.message} Only the content of ${WRITTEN_AS[kind]} was rebuilt in the browser, ` +
        REST_REUSED,
    );
    releaseRange(claim);
    return attempt(given, site, body, args, flags, kind, null, placed);
  }
}

/**
 * Build one instance. With `placed` false the nodes are built and handed back
 * for the caller's effect to put in the document once its pass has committed;
 * a claimed build is in the document already, which is what a claim is.
 */

function attempt(
  given: Scope | null,
  site: Site,
  body: Block<unknown>,
  args: readonly unknown[],
  flags: number,
  kind: "branch" | "portal",
  claim: Range | null,
  placed = true,
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
    return atCursor(cursor, () => inDocumentOrder(work));
  };

  if ((flags & NO_SCOPE) !== 0) {
    const nodes = under(() => asRow(build(given, body, args)));
    evictUnclaimed(claim, cursor);
    if (placed) insertAt(site, nodes);
    return { scope: null, nodes };
  }
  const scope = childScope(given, kind);
  const instance: { scope: Scope; nodes: readonly Node[] } = { scope, nodes: EMPTY };
  // Installed before the body runs: a scope's cleanups unwind last-registered
  // first, so the range is still in the document while the body's own run.
  ownRange(scope, () => {
    removeNodes(standingRow(instance.nodes));
    instance.nodes = EMPTY;
  });
  let built = false;
  try {
    instance.nodes = runWithOwner(scope, () => under(() => asRow(build(scope, body, args))));
    built = true;
  } finally {
    if (!built) {
      disposeScope(scope);
      // The claim goes with the attempt that failed. Its nodes are the server's
      // rendering of a body that just threw on the client, so they are wrong by
      // construction, and leaving them would put them beside whatever the
      // recovery builds instead.
      if (claim !== null) releaseRange(claim);
    }
  }
  evictUnclaimed(claim, cursor);
  if (placed) insertAt(site, instance.nodes);
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
  report(
    "structure",
    `The server sent ${stranded.length} more node(s) than the browser builds inside one ` +
      `conditional or boundary. ${usualCauses("structure")} The extra nodes were removed ` +
      REST_REUSED,
  );
}

/** A Cell ignores every argument, so one spelling serves both. */
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
  // The scope is already CURRENT — `attempt` runs the build under it — so the
  // body reads it the way every other reactive primitive does, from the ambient
  // owner.
  void scope;
  return (body as (...rest: readonly unknown[]) => unknown)(...args);
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
      "The content of one `<Show>`, `<For>`, `<Loading>` or `<Portal>` was built twice for a " +
        "single render, so its effects exist twice and one copy of its DOM was thrown away. " +
        "This is a bug in barq, not in your component: please report it with the component " +
        "that triggered it.",
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
  removeNodes(standingRow(instance.nodes));
}

// ============================================================================
// The region driver — one body, four consumers
// ============================================================================

/**
 * The only place a key is compared and an instance is swapped.
 *
 * It is the engine's shape for a conditional: a memo holds the key, an effect's
 * compute builds the instance the key selects, and the effect's apply puts it
 * in the document. Three things follow from that and none of them is done by
 * hand here.
 *
 * - The instance is opened under the effect, so the engine retires it when the
 *   effect runs again, and its range leaves with it.
 * - A read inside the body is answered from the pass that selected the body. An
 *   instance opened anywhere else reads the world as it was BEFORE the write
 *   that selected it.
 * - A body that reads a pending value leaves the instance already standing
 *   where it is until the value arrives, and the effect is run again then.
 *
 * The memo is what makes the first of those safe: the effect may only run again
 * when the key has actually moved.
 */
function region<K>(
  site: Site,
  key: Cell<K>,
  bodies: Block<unknown> | readonly (Block<unknown> | null | undefined)[],
  flags: number,
  args: readonly unknown[],
): void {
  /** The instance in the document, kept for the one case nothing else removes. */
  let standing = NOTHING;

  const pick = (k: K): Block<unknown> | null | undefined =>
    typeof bodies === "function" ? bodies : bodies[k as unknown as number];

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
   * damage.
   */
  const reconcileKey = (k: K): void => {
    const claim = site.claim;
    if (claim === undefined || claim === null) return;
    const wire = rangeKey(claim);
    if (wire === null || wire === OPAQUE_KEY) return;
    if (wire === String(k)) return;
    report(
      "key",
      `The server rendered the branch \`${wire}\` of a conditional where the browser picks ` +
        `\`${String(k)}\`. ${usualCauses("key")} The server's branch was replaced by the ` +
        `browser's ${REST_REUSED}`,
    );
    releaseRange(claim);
    site.claim = null;
  };

  const make = (k: K, placed: boolean): Instance => {
    reconcileKey(k);
    activation++;
    const body = pick(k);
    if (body === null || body === undefined) {
      // An empty arm is this position's first activation too. Left on the
      // site, the claim would be taken by the next arm, built after the page
      // hydrated, under a range the server wrote empty.
      const claim = site.claim ?? null;
      site.claim = null;
      if (claim !== null && claim.nodes.length > 0) {
        report(
          "structure",
          `The server sent ${claim.nodes.length} node(s) for ${WRITTEN_AS.branch} where the ` +
            `browser renders nothing. The nodes were removed ${REST_REUSED}`,
        );
        releaseRange(claim);
      }
      return NOTHING;
    }
    return activate(getOwner(), site, body, args, flags, "branch", placed);
  };

  if ((flags & STATIC_KEY) !== 0) {
    // The compiler proved the key reads nothing reactive: no memo, no effect,
    // and — when `NO_SCOPE` is proved too — no allocation at all beyond the
    // nodes themselves.
    standing = make(untrack(key), true);
  } else {
    const selected = createMemo<K>(() => key());
    renderEffect<Instance>(
      () => {
        const k = selected();
        // Untracked: a body's own reads must not become dependencies of the
        // region, or every value the content displays would rebuild it instead
        // of updating in place.
        return untrack(() => make(k, false));
      },
      (next, previous) => {
        // An instance with a scope was retired by the engine along with the
        // pass that replaced it. One without has nothing else to remove it.
        if (previous !== undefined && previous.scope === null) {
          removeNodes(standingRow(previous.nodes));
        }
        insertAt(site, next.nodes);
        standing = next;
      },
    );
  }

  if ((flags & NO_SCOPE) !== 0) {
    // With no instance scope there is no `ownRange` to run, so the region's
    // last nodes come out with the scope that owns the region itself.
    onCleanup(() => removeNodes(standingRow(standing.nodes)));
  }
}

// ============================================================================
// branch — Show, Switch/Match, ternaries, `&&`, `dynamic`, a router Outlet
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
function cellSlot(value: unknown, origin: string, returned = false): void {
  if (isBlock(value)) throw jsxAsValue(origin, returned);
}

/**
 * K2/K5/K6. `key` is plain emitted JavaScript, usually an integer index into
 * `bodies`; an unchanged key is a no-op and a changed one disposes and rebuilds.
 *
 * `bodies` may be a single Block used for every key, which is how `dynamic` keys
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
  parent: Node | null,
  anchor: Node | null,
  key: Cell<K>,
  bodies: Block<unknown> | readonly (Block<unknown> | null | undefined)[],
  flags = 0,
): Node | Node[] | null {
  const given = getOwner();
  // The key ACCESSOR, not the key's value.
  //
  // A Block here is a mistimed construction and the guard is right. The VALUE
  // it yields is only ever compared with `===`: it is never invoked, never
  // stringified and never inserted, so C3.8 has nothing to protect. Guarding it
  // too made `dynamic(() => C)` impossible — each instance is a branch keyed on
  // the component, and a compiled component IS a Block — so rendering a
  // component held in data threw from inside the construct that exists to do
  // exactly that.
  cellSlot(key, "The condition of a `<Show>`, `<Match>` or `dynamic`");
  const { site, out } = siteFor(parent, anchor);
  claimSite(site, parent, anchor, flags, "branch");
  const claimed = site.claim ?? null;
  underScope(given, "branch", () => region(site, key, bodies, flags, EMPTY_ARGS));
  return outFor(site, out, claimed);
}

const EMPTY_ARGS: readonly unknown[] = [];

// ============================================================================
// each — For (three keying modes), Repeat
// ============================================================================

/**
 * A row IS a scope; row disposal is scope disposal. The LIS move-minimisation
 * in `map.ts` is retained wholesale: it is genuinely independent of ownership.
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
 * carrier crosses unresolved and `keyed` below is the arity rule, asked once
 * per construction rather than per row.
 */
/**
 * The arity rule, applied to the keying slot: a key FUNCTION declares a
 * parameter and a Cell declares none, and that is the only thing separating
 * them once both are values in one slot. `true` and `undefined` are identity,
 * which `mapArray` spells `null`.
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
      : readSlot(carrier, "For.keyed");
  if (typeof resolved === "function") return resolved as (item: T) => unknown;
  return resolved === false ? false : null;
}

export function each<T>(
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
): Node | Node[] | null {
  const given = getOwner();
  const keyOf = keyMode<T>(carrier);
  // The branded case is refused here. The laundered one, `() => aBlock`, is
  // only visible in what the source YIELDS, so the read is wrapped: one closure
  // per list, and a Block arriving where rows were expected is refused instead
  // of rendering as an empty list.
  cellSlot(src, "For.each");
  const source = (): unknown => {
    const yielded = (src as () => unknown)();
    cellSlot(yielded, "For.each", true);
    return yielded;
  };
  const { site, out } = siteFor(parent, anchor);
  claimSite(site, parent, anchor, flags, "each");
  const claimed = site.claim ?? null;
  // ONE cursor over the list's range, shared by every row.
  //
  // A row used to be delimited on the wire so the client could hand row `i` its
  // own nodes. It does not need to be: the rows are built in ORDER, so a row's
  // extent is exactly what its build consumed, and a cursor that survives
  // between rows records that with no bytes at all. That reversal is 1,600 of
  // the 100-row page's 6,416 hydration bytes, and the only two comments per row
  // anyone was ever paying for.
  //
  // A client that renders more rows than the server wrote builds the extra ones
  // cold; a client that renders fewer leaves nodes nobody adopted. Both are
  // reported and both are cleaned up below.
  const claim = site.claim ?? null;
  let rowCursor: Cursor | null = claim === null ? null : openCursor(claim);
  const body = row as Block<unknown>;
  // A list with nothing to claim builds its rows cold, and says so to each
  // one: a row is built by the list's own node, under whatever cursor the
  // page left current, and a template there would claim from it.
  let cold = claim === null && hydrating();

  return underScope(given, "each", (): Node | Node[] | null => {
    const fallbackRows =
      fallback === null || fallback === undefined
        ? undefined
        : (): Node[] => {
            activation++;
            if (OWNERSHIP.sink !== null) traceRow(given);
            // Under the list's cursor like any row: the server wrote the
            // fallback inside the list's range, and built outside it the
            // fallback's template claimed whatever the page had next.
            if (rowCursor === null) {
              return cold
                ? withoutClaim(() => build(getOwner(), fallback, EMPTY_ARGS))
                : build(getOwner(), fallback, EMPTY_ARGS);
            }
            return inRow(rowCursor, () => build(getOwner(), fallback, EMPTY_ARGS));
          };

    // A row IS the scope the engine opens for it, so the body is built under
    // whatever is current when the mapper runs.
    let rows: () => Row[];
    if (keyOf === COUNT) {
      rows = repeat(
        source as Cell<number>,
        (index: number): Row => {
          activation++;
          if (OWNERSHIP.sink !== null) traceRow(given);
          // The closure exists only for the hydrating cursor to wrap, and it is
          // one allocation PER ROW. Nothing is hydrating in the ordinary case.
          if (rowCursor === null) {
            return listRow(
              cold
                ? withoutClaim(() => asRow(build(getOwner(), body, [index])))
                : asRow(build(getOwner(), body, [index])),
            );
          }
          return listRow(inRow(rowCursor, () => asRow(build(getOwner(), body, [index]))));
        },
        { fallback: fallbackRows },
      );
    } else {
      const one = (item: unknown): Row => {
        activation++;
        if (OWNERSHIP.sink !== null) traceRow(given);
        if (rowCursor === null) {
          return listRow(
            cold
              ? withoutClaim(() => asRow(build(getOwner(), body, [item])))
              : asRow(build(getOwner(), body, [item])),
          );
        }
        return listRow(inRow(rowCursor, () => asRow(build(getOwner(), body, [item]))));
      };
      const two = (item: unknown, index: unknown): Row => {
        activation++;
        if (OWNERSHIP.sink !== null) traceRow(given);
        if (rowCursor === null) {
          return listRow(
            cold
              ? withoutClaim(() => asRow(build(getOwner(), body, [item, index])))
              : asRow(build(getOwner(), body, [item, index])),
          );
        }
        return listRow(inRow(rowCursor, () => asRow(build(getOwner(), body, [item, index]))));
      };
      // The engine reads the mapper's arity to decide whether a row needs an
      // index at all, and an index is a whole signal per row. The row Block's
      // own parameter list is the only thing that knows, and only a row that
      // declares exactly one parameter has said it takes no index: a variadic
      // one declares none and reads them all.
      rows = mapArray(
        source as Cell<Maybe<readonly T[]>>,
        ((row as { length: number }).length === 1 ? one : two) as never,
        { keyed: (keyOf ?? true) as never, fallback: fallbackRows },
      ) as () => Row[];
    }

    // Nodes the server wrote that no row adopted. They are in the document and
    // nothing owns them, so they go — H4's blast radius, at row granularity.
    // With no per-row comments the leftover is simply whatever the shared cursor
    // still holds, which is a stronger statement than the old row count: it
    // catches a row that consumed FEWER nodes than the server wrote for it as
    // well as a list that was shorter on the client.
    //
    // Once the rows are built and BEFORE they are placed: a claimed row is
    // already where it belongs only while nothing stands between it and the
    // row after it, and the leftovers are exactly what would.
    syncRows(site, rows, () => {
      // The server's rows are spent by the first pass. A row the list gains
      // after it is new, built cold like any later change, and not a row the
      // server failed to send.
      const cursor = rowCursor;
      rowCursor = null;
      if (cursor !== null) cold = true;
      if (site.cold === true || cursor === null || cursorAtEnd(cursor)) return;
      const stranded = cursorRest(cursor);
      report(
        "structure",
        `The server sent ${stranded.length} node(s) in a list that no row in the browser ` +
          `matches, so the list is shorter in the browser. ${usualCauses("structure")} The ` +
          `extra nodes were removed ${REST_REUSED}`,
      );
      for (const node of stranded) node.parentNode?.removeChild(node);
    });
    site.claim = null;
    return outFor(site, out, claimed);
  });
}

/**
 * A row is a scope the engine opened; say so to the ownership trace. It is the
 * list's to dispose and not the handed scope's, so it is reported as held
 * elsewhere: rows go in the list's order, which is not creation order.
 */
function traceRow(list: Scope | null): void {
  const row = getOwner();
  if (row !== null) traceScope(row, list, "each", false);
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
    report(
      "structure",
      "The browser's list has a row the server did not send, so the list is longer in the " +
        `browser. ${usualCauses("structure")} The row was built in the browser ${REST_REUSED}`,
    );
    return withoutClaim(make);
  }

  const from = cursor.next;
  // A row is made into nodes here, in order, so a row that is a string takes
  // the text it is level with.
  const made = atCursor(cursor, () => inDocumentOrder(make));

  /*
   * A row that ADOPTED the server's nodes created none of its own, so `build`
   * hands back nothing and the row is, as far as `syncNodeOrder` can tell, a
   * row with no extent. It cannot be moved, and worse, nothing can be inserted
   * next to it: the walk that places a NEW row looks for the first node of the
   * row after it, finds none the whole way down, and falls back on the list's
   * own anchor. Every row added to a hydrated list therefore landed at the end
   * of it, whatever its position in the array.
   *
   * What it occupies is what it claimed.
   *
   * Unless the build handed back all of that and more. A live hole in the row
   * makes the node its content is placed before, and a row holding one is given
   * a node to be read from (`asRow`); neither is the server's, and a row cut
   * down to its claimed span lost both, so the hole's next write had nowhere
   * in the document to go.
   */
  const claimed = spanBetween(from, cursor.next);
  if (claimed.length === 0) return made;
  return claimed.every((node) => made.includes(node)) ? made : claimed;
}

/** The siblings from `from` up to, but not including, `to`. */
function spanBetween(from: Node | null, to: Node | null): Node[] {
  const out: Node[] = [];
  for (let node = from; node !== null && node !== to; node = node.nextSibling) out.push(node);
  return out;
}

/**
 * Row lifecycle belongs to `mapArray`/`repeat`; this only moves nodes, so a
 * group's ARRAY IDENTITY is what tracks a row — which is why a keyed move
 * preserves the moved row's nodes (K2).
 */
/**
 * Rows whose content changes after they are built, which are the ones a
 * captured node list stops describing. A branch's arm is one too: the arm is
 * removed by the nodes it built, and `<Match>{on() ? <b/> : "no"}</Match>` left
 * the `<b>` it wrote after that behind when the match moved on.
 *
 * `<For>{(row) => <Show when={row.open()}>…</Show>}</For>`: the list is told
 * what the row built, and the branch goes on to put content beside its anchor
 * that the list never hears about. Moved by the captured nodes, the row left
 * that content behind; and a row whose content had gone was moved by a node no
 * longer in the document, which is an `insertBefore` that throws.
 *
 * Such a row is given a node to start at, and is read off the document from
 * there to its last node — which is an edge, or something that never moves.
 */
const LIVE_ROWS = new WeakSet<readonly Node[]>();

function asRow(nodes: Node[]): Node[] {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.nodeType === 1 || !LIVE_EDGES.has(node)) continue;
    const row = [document.createTextNode("") as Node, ...nodes];
    LIVE_ROWS.add(row);
    return row;
  }
  return nodes;
}

/**
 * A list row: its one node, or its nodes. A row of one node is the common
 * case, and holding the node itself instead of an array around it is one
 * array fewer kept alive per row. The row's identity is the node then, which
 * is as stable as the array was.
 */
type Row = Node | readonly Node[];

function listRow(nodes: readonly Node[]): Row {
  return nodes.length === 1 && !LIVE_ROWS.has(nodes) ? nodes[0] : nodes;
}

function isNodes(row: Row): row is readonly Node[] {
  return Array.isArray(row);
}

function rowFirst(row: Row): Node | undefined {
  return isNodes(row) ? row[0] : row;
}

function detach(node: Node): void {
  node.parentNode?.removeChild(node);
}

/** A row's nodes as they stand, one node handed to `visit`. */
function eachStanding(row: Row, visit: (node: Node) => void): void {
  if (!isNodes(row)) {
    visit(row);
    return;
  }
  const standing = standingRow(row);
  for (let i = 0; i < standing.length; i++) visit(standing[i]);
}

/** A row as it stands. */
function standingRow(row: readonly Node[]): readonly Node[] {
  if (!LIVE_ROWS.has(row)) return row;
  const first = row[0];
  const last = row[row.length - 1];
  if (first.parentNode === null || first.parentNode !== last.parentNode) return row;
  const nodes: Node[] = [];
  for (let node: Node | null = first; node !== null; node = node.nextSibling) {
    nodes.push(node);
    if (node === last) break;
  }
  return nodes;
}

function standingRows(rows: readonly Row[]): Node[] {
  const out: Node[] = [];
  const push = (node: Node): void => {
    out.push(node);
  };
  for (const row of rows) eachStanding(row, push);
  return out;
}

function syncRows(site: Site, rows: () => Row[], beforeFirst: () => void): void {
  let current: Row[] = [];
  let first = true;

  renderEffect(rows, (next) => {
    if (first) {
      first = false;
      beforeFirst();
    }
    const host = hostOf(site);
    if (host === null) return;

    // The rows both lists start and end with are where they were, so only what
    // lies between is compared. An append, a prepend or one row removed is then
    // the row itself rather than a set and an index of the whole list.
    const shared = Math.min(current.length, next.length);
    let head = 0;
    while (head < shared && current[head] === next[head]) head++;
    let was = current.length;
    let now = next.length;
    while (was > head && now > head && current[was - 1] === next[now - 1]) {
      was--;
      now--;
    }
    // The two ends of what is left traded places: two moves, and the rows
    // between them are shared again. Without this a swap of two rows is a map
    // and a longest increasing subsequence over every row in between.
    while (
      was - head > 1 &&
      now - head > 1 &&
      current[head] === next[now - 1] &&
      next[head] === current[was - 1] &&
      swapEnds(host, current[head], current[was - 1])
    ) {
      head++;
      was--;
      now--;
      while (head < was && head < now && current[head] === next[head]) head++;
      while (was > head && now > head && current[was - 1] === next[now - 1]) {
        was--;
        now--;
      }
    }
    const leaving = head === 0 && was === current.length ? current : current.slice(head, was);
    const arriving = head === 0 && now === next.length ? next : next.slice(head, now);

    if (leaving.length > 0) {
      // Emptying the list is its own case, and not only to skip a `Set` of
      // every group: it is the one removal that can go through `removeNodes`'s
      // single-call path, which is what `clear rows` is.
      if (arriving.length === 0) {
        removeNodes(standingRows(leaving));
      } else {
        const kept = new Set(arriving);
        for (const group of leaving) {
          if (kept.has(group)) continue;
          eachStanding(group, detach);
        }
      }
    }

    if (arriving.length > 0) {
      let after = site.anchor;
      for (let i = now; i < next.length; i++) {
        const lead = rowFirst(next[i]);
        if (lead === undefined) continue;
        after = lead;
        break;
      }
      syncNodeOrder(host, after, leaving, arriving);
    }
    current = next;
  });

  onCleanup(() => {
    removeNodes(standingRows(current));
    current = [];
  });
}

/**
 * Put `high` where `low` stands and `low` where `high` stood. `false`, with
 * nothing moved, when either row has no node to stand anywhere.
 */
function swapEnds(parent: Node, low: Row, high: Row): boolean {
  const lowNodes = isNodes(low) ? standingRow(low) : [low];
  const highNodes = isNodes(high) ? standingRow(high) : [high];
  if (lowNodes.length === 0 || highNodes.length === 0) return false;
  const afterHigh = highNodes[highNodes.length - 1].nextSibling;
  const lowFirst = lowNodes[0];
  for (let i = 0; i < highNodes.length; i++) parent.insertBefore(highNodes[i], lowFirst);
  for (let i = 0; i < lowNodes.length; i++) parent.insertBefore(lowNodes[i], afterHigh);
  return true;
}

function syncNodeOrder(parent: Node, anchor: Node | null, previous: Row[], next: Row[]): void {
  const newLen = next.length;

  if (previous.length === 0) {
    // Last to first against the node that follows, so a row the claim left in
    // position is not taken out and put back.
    let before = anchor;
    for (let i = newLen - 1; i >= 0; i--) {
      const group = next[i];
      if (!isNodes(group)) {
        place(parent, group, before);
        before = group;
        continue;
      }
      const row = standingRow(group);
      for (let j = row.length - 1; j >= 0; j--) {
        place(parent, row[j], before);
        before = row[j];
      }
    }
    return;
  }

  const previousIndex = new Map<Row, number>();
  for (let i = 0; i < previous.length; i++) previousIndex.set(previous[i], i);

  const sources: number[] = new Array(newLen);
  for (let i = 0; i < newLen; i++) sources[i] = previousIndex.get(next[i]) ?? -1;

  const lis = longestIncreasingSubsequence(sources.filter((source) => source !== -1));

  let lisIndex = lis.length - 1;
  let nextNode: Node | null = anchor;

  for (let i = newLen - 1; i >= 0; i--) {
    const group = next[i];
    const first = rowFirst(group);
    if (first === undefined) continue;

    if (sources[i] !== -1 && lisIndex >= 0 && lis[lisIndex] === sources[i]) {
      lisIndex--; // already in the right place
    } else {
      // First to last, each before the same node, which is what keeps a row
      // of several nodes in its own order: last to first put them down
      // reversed.
      if (!isNodes(group)) {
        parent.insertBefore(group, nextNode);
      } else {
        const standing = standingRow(group);
        for (let j = 0; j < standing.length; j++) {
          parent.insertBefore(standing[j], nextNode);
        }
      }
    }

    nextNode = first;
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
 * E2.1 is why the content Block is called INSIDE this function rather than
 * handed to it already built: the engine's boundary is in place before the
 * Block runs, so a construction throw lands in it.
 *
 * E2.3: a pending read is never captured by an error boundary — it passes
 * through to the nearest `Loading`.
 */
export function boundary(
  parent: Node | null,
  anchor: Node | null,
  kind: BoundaryKind,
  fallback: Block<unknown> | null | undefined,
  body: Block<unknown>,
  flags = 0,
  on?: Cell<unknown>,
): Node | Node[] | null {
  const given = getOwner();
  if (on !== undefined) cellSlot(on, "Loading.on");
  const { site, out } = siteFor(parent, anchor);
  claimSite(site, parent, anchor, flags, "boundary");
  const claimed = site.claim ?? null;
  underScope(given, "boundary", () => {
    if (kind === "error") {
      guarded(given, site, kind, fallback, body, on);
      return;
    }
    // A loading boundary has a scope of its own, and each arm is an instance
    // below it: what the boundary holds has to outlive any one build.
    const own = childScope(given, "branch");
    runWithOwner(own, () => guarded(own, site, kind, fallback, body, on));
  });
  // A claim nobody spent, which means a boundary that DECLINED one: a settled
  // range is built into where it stands, and a deferred `<!--[b:N-->` range is
  // the fallback's. What reaches here is the declined case, and the server's
  // nodes go rather than standing beside the rebuilt ones — without it the page
  // showed the fallback TWICE.
  if (site.claim !== undefined && site.claim !== null) {
    const stranded = site.claim;
    site.claim = null;
    if (stranded.nodes.length > 0) {
      report(
        "structure",
        `The server sent ${stranded.nodes.length} node(s) for a \`<Loading>\` or \`<Errored>\` ` +
          "boundary whose content is not ready in the browser. This usually means an async " +
          "value the server resolved did not reach the browser (the `data` option of `hydrate` " +
          "is missing or comes from another render). The server's nodes were removed and the " +
          "boundary shows its fallback until the value loads.",
      );
      releaseRange(stranded);
    }
  }
  return outFor(site, out, claimed);
}

/**
 * Both kinds, because they are one shape: the content is built ONCE, under the
 * engine's boundary, and stays alive while the fallback shows. What differs is
 * what the engine routes here — a pending read or a throw — and what the
 * fallback is handed.
 *
 * The content is PARKED in a fragment while it is not showing, rather than
 * detached: a region nested inside it swaps its own nodes relative to an anchor,
 * and an anchor with no parent has nowhere to put them.
 */
function guarded(
  given: Scope | null,
  site: Site,
  kind: BoundaryKind,
  fallback: Block<unknown> | null | undefined,
  body: Block<unknown>,
  on?: Cell<unknown>,
): void {
  const park: Site = { parent: document.createDocumentFragment(), anchor: null };
  // The server's nodes at this position, when the server actually SETTLED here.
  //
  // On the FIRST build of a hydration there is nothing to protect by parking:
  // the server already ran the body to completion and its markup is at `site`,
  // so parking means building a second copy beside markup that is already
  // correct and then throwing the server's away.
  //
  // A DEFERRED range is the one case where parking is still right. `<!--[b:N-->`
  // means the shell flushed before the body was ready and the stream will swap
  // the content in later; until it does, those nodes are the FALLBACK, and
  // claiming them would claim the wrong markup. `swapDeferredRange` rewrites the
  // open comment to the plain `[` once the content lands, so a swapped range
  // reads as settled here — which it is.
  let firstClaim: Range | null = takeSettledClaim(site);
  // The server's own fallback, when it wrote one. Consumed by the first build of
  // this boundary's fallback, which is the only thing entitled to it.
  let fallbackClaim: Range | null = firstClaim === null ? takeUnsettledClaim(site) : null;
  let live: Site = firstClaim === null ? park : site;
  let content: Instance = NOTHING;
  let standIn: Instance = NOTHING;
  // Not the application's error, and this is not the thing that recovers from
  // it: `hydrate` does, by throwing the whole attempt away and rendering the
  // page cold, and it can only do that if the throw reaches it.
  let mismatch: HydrationMismatch | null = null;

  // The node the content stands after while it is at the site, `null` for the
  // start of the host. Everything from there to the site's anchor is the
  // content: the position is this boundary's alone.
  let lead: Node | null = null;
  // A site with no parent is one node in a fragment the caller adopts, and once
  // it has, nothing says where this boundary's content begins: whatever the
  // caller placed before it is now its sibling. Such a site is given a node to
  // begin at, which travels with the fragment.
  let pinned = false;
  const fragment = site.anchor?.parentNode ?? null;
  if (site.anchor !== null && fragment !== null && fragment.nodeType === 11) {
    lead = document.createTextNode("");
    fragment.insertBefore(lead, site.anchor);
    pinned = true;
  }
  const leadOf = (first: Node | undefined): Node | null => {
    if (first !== undefined) return first.previousSibling;
    const host = hostOf(site);
    return site.anchor !== null ? site.anchor.previousSibling : (host?.lastChild ?? null);
  };
  if (firstClaim !== null && !pinned) lead = leadOf(firstClaim.nodes[0]);

  const standing = (): Node[] => {
    const host = hostOf(site);
    if (host === null) return [...content.nodes];
    const out: Node[] = [];
    let node = lead === null ? host.firstChild : lead.nextSibling;
    for (; node !== null && node !== site.anchor; node = node.nextSibling) out.push(node);
    return out;
  };

  const move = (target: Site): void => {
    if (live === target) return;
    // Either way it is what is THERE that moves, not the node list the last
    // build returned: a region inside the content swaps arms on its own, and
    // the build's list still names the arm that left. The park holds this
    // boundary's content and nothing else, so its child list is the truth; at
    // the site the truth is everything between the lead and the anchor.
    const moving = live === park ? [...park.parent!.childNodes] : standing();
    live = target;
    if (target === site && !pinned) lead = leadOf(undefined);
    insertAt(target, moving);
  };

  // E2 entry point for what the engine cannot see: a handler, a cleanup, an
  // async continuation. Routing one here re-runs the content, which throws it
  // where the boundary is listening.
  const routed = kind === "error" ? createSignal<{ error: unknown } | null>(null) : null;

  const compose = (): typeof CONTENT => {
    if (routed !== null) {
      const thrown = routed[0]();
      if (thrown !== null) throw thrown.error;
    }
    const own = getOwner();
    if (OWNERSHIP.sink !== null && own !== null) OWNERSHIP.sink.own(own, given, "pure");
    if (routed !== null && own !== null) {
      provideOn(own, ERROR_BOUNDARY, (error: unknown) => {
        if (error instanceof NotReadyError || error instanceof HydrationMismatch) throw error;
        routed[1]({ error });
      });
    }
    // The build is untracked: a body's own reads must not become dependencies
    // of the boundary, or every value the content displays would rebuild it.
    untrack(() => {
      const claim = firstClaim;
      firstClaim = null;
      activation++;
      try {
        content = attempt(own, live, body, EMPTY_ARGS, 0, "branch", claim);
      } catch (error) {
        content = NOTHING;
        // The server settled this range and the client could not — a seed that
        // never arrived, or a value only a browser can read. `attempt` has
        // already released the claim, so from here this boundary is an ordinary
        // cold one, and an ordinary cold one parks.
        if (claim !== null) live = park;
        if (!(error instanceof HydrationMismatch)) throw error;
        mismatch = error;
      }
    });
    return CONTENT;
  };

  // The error is read where the engine hands it over, inside the boundary's
  // own pass. By the time the effect below acts the read would be an outside
  // one, answered from before the throw.
  interface Failure {
    thrown: unknown;
    reset: () => void;
  }

  const view: () => unknown =
    kind === "error"
      ? createErrorBoundary(compose, (error, reset): Failure | undefined => {
          const thrown = error();
          // Not the application's error, so neither arm shows: `hydrate`
          // discards this attempt and renders the page again.
          if (thrown instanceof HydrationMismatch) {
            if (abandonClaim(thrown)) return undefined;
            throw thrown;
          }
          return {
            thrown,
            reset: () => {
              routed![1](null);
              // A retry reads what the caller has just written, which is still
              // staged: retried before it is published the content throws on
              // the old value and is built a second time at the flush.
              flush();
              reset();
            },
          };
        })
      : createLoadingBoundary(
          compose,
          () => fallback,
          on === undefined
            ? undefined
            : {
                on: () => {
                  const value = on();
                  cellSlot(value, "Loading.on", true);
                  return value;
                },
              },
        );

  if (mismatch !== null) throw mismatch as HydrationMismatch;

  const asError = (thrown: unknown): Error =>
    thrown instanceof Error ? thrown : new Error(String(thrown));

  const dropStandIn = (): void => {
    if (standIn === NOTHING) return;
    teardown(standIn);
    standIn = NOTHING;
  };

  renderEffect(view, (showing: unknown) => {
    dropStandIn();
    if (showing === CONTENT) {
      // The server's fallback is DEAD once content shows, and it has to go or
      // it stands beside the content. This is the nested case: an outer
      // boundary owns the `[f:` range, a boundary INSIDE it absorbs the
      // pendingness, so the outer renders content and never builds the
      // fallback its claim was being held for.
      if (fallbackClaim !== null) {
        removeNodes(fallbackClaim.nodes);
        fallbackClaim = null;
      }
      move(site);
      return;
    }
    move(park);
    // `undefined` is a collapsed `Reveal`: neither arm, by the group's order.
    if (showing === undefined || fallback === null || fallback === undefined) return;
    const claim = fallbackClaim;
    fallbackClaim = null;
    activation++;
    const args =
      kind === "error"
        ? [(): Error => asError((showing as Failure).thrown), (showing as Failure).reset]
        : EMPTY_ARGS;
    // HYDRATED, not rebuilt, when the server wrote this fallback: `place` is a
    // no-op for a node already in position, so the claim keeps their identity.
    standIn = attempt(given, site, fallback, args, 0, "branch", claim);
  });
}

// ============================================================================
// portal
// ============================================================================

/**
 * A hole whose insertion target is elsewhere and whose scope's parent is the
 * LEXICAL one, which is why a portalled modal reads the provider it is
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
  const instance = attempt(getOwner(), site, block, EMPTY_ARGS, flags, "branch", null);
  return instance.nodes.length > 0 ? instance.nodes[0] : null;
}

export function portal(target: Cell<Node | string | null | undefined>, block: Block<unknown>): Node;
export function portal(
  target: Cell<Node | string | null | undefined>,
  block: Block<unknown>,
  flags: number,
): Node | Node[];
export function portal(
  target: Cell<Node | string | null | undefined>,
  block: Block<unknown>,
  flags = 0,
): Node | Node[] {
  const given = getOwner();
  cellSlot(target, "Portal.mount");
  // Read once here as well as in the effect below: what the Cell YIELDS is
  // refused on the read, and the effect's first read is the engine's to
  // schedule, where a refusal would surface a turn late and away from the
  // construct that caused it.
  cellSlot(untrack(target), "Portal.mount", true);

  // A portal is the one construct whose server bytes are in the WRONG PLACE by
  // construction: the string backend has no second insertion point, so it wrote
  // an EMPTY range at the lexical position and the content is the client's to
  // build. The range is still this portal's to take: left at the cursor, it is
  // two nodes the enclosing region did not build and reports as a mismatch.
  const claimed = hydrating() && (flags & HYDRATE) !== 0 ? probeRange(null, null) : null;
  if (claimed !== null) releaseRange(claimed);
  const marker: Node = claimed?.close ?? document.createTextNode("");

  underScope(given, "portal", () => {
    let instance = NOTHING;
    let container: HTMLElement | null = null;
    let delegatingFor: Node | null = null;
    let request = 0;
    const site: Site = { parent: null, anchor: null };

    const clear = (): void => {
      if (instance !== NOTHING) {
        teardown(instance);
        instance = NOTHING;
      }
      if (container !== null && delegatingFor !== null) {
        unregisterDelegatedContainer(container, delegatingFor);
      }
      delegatingFor = null;
      container?.parentNode?.removeChild(container);
      container = null;
      site.parent = null;
    };

    // An EFFECT, not a render effect, and that is where the mount's timing
    // comes from. It runs once the pass that placed the marker has written the
    // document, so a target inside the tree being built is there to be found;
    // and under a boundary that is still showing its fallback the engine holds
    // it until the content is revealed, which is the moment a portal the
    // content declares should appear. Deferred to a microtask instead, it asked
    // once whether the marker was connected, found the parked content was not,
    // and never asked again.
    createEffect(
      () => {
        const requested = target();
        cellSlot(requested, "Portal.mount", true);
        return requested;
      },
      (requested) => {
        clear();
        const mine = ++request;
        const mount = (): void => {
          // The marker IS the portal's lexical position, so a tree that was
          // never put in a document mounts nothing outside itself either.
          if (mine !== request || !marker.isConnected) return;
          const host = resolveTarget(requested);
          if (host === null) return;
          container = document.createElement("div");
          container.style.display = "contents";
          hostPortal(container, marker);
          site.parent = container;
          activation++;
          instance = activate(given, site, block, EMPTY_ARGS, flags, "portal");
          host.appendChild(container);
          // A root's own listener already hears a portal mounted inside it.
          const root = delegatedRootOf(marker);
          if (root !== null && !root.contains(container)) {
            registerDelegatedContainer(container, root);
            delegatingFor = root;
          }
        };
        // A portal nothing owns has no scope to build under, and the engine
        // refuses one made from inside an effect's write. It mounts a turn
        // later, outside it, and only if it is still the one being asked for.
        if (given === null) queueMicrotask(mount);
        else mount();
      },
    );

    onCleanup(clear);
  });

  return claimed === null ? marker : rangeNodes(claimed);
}

/**
 * Reveal ordering — the fifth thing `flow.ts` owns, and the one that is not a
 * range: it opens the scope every `Loading` boundary below it asks how to time
 * its reveal. The order and the collapsed flag arrive as Cells the compiler
 * computed, the children as the Block they already were.
 */
export function reveal(
  order: Cell<RevealOrder | undefined>,
  collapsed: Cell<boolean | undefined>,
  block: Block<unknown>,
): Node[] {
  const given = getOwner();
  return createRevealOrder(
    () => {
      // The group's scope is the engine's; say so to the ownership trace.
      const group = getOwner();
      if (OWNERSHIP.sink !== null && group !== null) traceScope(group, given, "provide", true);
      return childToNodes((block as unknown as () => unknown)() as Child, group);
    },
    { order: () => order() ?? "sequential", collapsed: () => collapsed() === true },
  );
}

function resolveTarget(requested: Node | string | null | undefined): Node | null {
  if (typeof requested === "string") {
    const found = document.querySelector(requested);
    return found instanceof HTMLElement ? found : null;
  }
  if (requested === null || requested === undefined) return document.body;
  return requested;
}
