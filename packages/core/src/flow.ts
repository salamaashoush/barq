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
 *
 * Nothing here touches a node. Every read and write of the tree goes through
 * the `RangeHost` a construct is handed, once per range rather than once per
 * node, and a list's reorder through the `SyncRows` its renderer passes beside
 * it, so the renderer that never reorders a list never ships the reorder.
 */

import type { Child } from "./types.ts";
import {
  HydrationMismatch,
  abandonClaim,
  atCursor,
  claimWalk,
  claimLate,
  cursorAtEnd,
  inDocumentOrder,
  holdHydration,
  hydrating,
  report,
  usualCauses,
  WHOLE,
  withoutClaim,
  type Cursor,
  type Range,
} from "./hydration-state.ts";
import type { Block, Cell, Scope } from "./scope.ts";
import { createMemo } from "@solidjs/signals";
import {
  CONTEXT_MISS,
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
  setHydratable,
  OWNERSHIP,
  repeat,
  jsxAsValue,
  lookupContext,
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
// The host a construct writes through
// ============================================================================

/**
 * What a renderer gives control flow to work with. `N` is the renderer's node;
 * nothing here knows what one is beyond the questions below.
 *
 * A range changes through one call, `insertRange` or `removeRange`, never a
 * call per node, so a host whose calls cost something pays once per change.
 */
export interface RangeHost<N extends object = object> {
  /** An empty node to anchor against, which renders nothing. */
  sentinel(): N;
  /** A detached container whose children move out with it when it is inserted. */
  park(): N;
  /** Whether `node` is such a container. */
  isPark(node: N): boolean;
  parentOf(node: N): N | null;
  nextOf(node: N): N | null;
  prevOf(node: N): N | null;
  firstOf(parent: N): N | null;
  lastOf(parent: N): N | null;
  /** What a list row of these nodes stands on, so a row that changes is moved whole. */
  row(nodes: N[]): N[];
  /** A child value, built into nodes under `scope`. */
  toNodes(child: Child, scope: Scope | null): N[];
  /** Put `nodes` in order before `before`, leaving any already in place where it is. */
  insertRange(parent: N, nodes: readonly N[], before: N | null): void;
  removeRange(nodes: readonly N[]): void;
}

/**
 * A list row: its one node, or its nodes. A row of one node is the common
 * case, and holding the node itself instead of an array around it is one
 * array fewer kept alive per row. The row's identity is the node then, which
 * is as stable as the array was.
 */
export type Row<N extends object = object> = N | readonly N[];

/**
 * Move a list's rows from `current` to `next` under `parent`, before `anchor`.
 * The rows are the same objects in both wherever a row survived, so identity
 * is what says a row stayed.
 */
export type SyncRows<N extends object = object> = (
  parent: N,
  anchor: N | null,
  current: readonly Row<N>[],
  next: readonly Row<N>[],
) => void;

/** A host and the list reorder that goes with it. */
export interface Renderer<N extends object = object> {
  host: RangeHost<N>;
  sync: SyncRows<N>;
}

/**
 * The owner context a renderer provides its `Renderer` under, for the
 * components below it.
 *
 * Compiled code never reads it: it calls a renderer's own `branch` and `each`,
 * which carry their host. Only `<Show>`, `<For>` and the rest called as
 * components, which is what a spread compiles to, have to ask where they are.
 */
export const HOST: unique symbol = Symbol("host");

let installed: Renderer | null = null;

/**
 * The renderer the components use where no owner provides one. A renderer
 * installs it from a module of its own rather than from `render`, so a page
 * whose compiled code never calls a component does not ship the list reorder.
 */
export function setDefaultHost<N extends object>(host: RangeHost<N>, sync: SyncRows<N>): void {
  // The node type is erased here and nowhere else: a component only ever hands
  // the host nodes the same host made, so no call can pair it with another's.
  installed = { host, sync } as unknown as Renderer;
}

/** The renderer a component called here renders through. */
export function rendererHere(construct: string): Renderer {
  const provided = lookupContext(getOwner(), HOST);
  if (provided !== CONTEXT_MISS) return provided as Renderer;
  if (installed !== null) return installed;
  throw new Error(
    `\`<${construct}>\` was called as a component with no renderer to render through. ` +
      "Compiled code installs one for every module that calls a component, so this " +
      'is a hand-written call: import "@barqjs/web/host" once before it, or render ' +
      "under a renderer that provides `HOST`.",
  );
}

/**
 * The nodes that stand at the END of something whose content changes after it
 * is built: a live hole's text node, a region's anchor.
 *
 * Whoever built a list of nodes and kept it has, wherever one of these is in
 * it, a snapshot of what stood before the edge on the day it was taken. `each`
 * asks, so that a row it moves is the row as it stands.
 */
export const LIVE_EDGES: WeakSet<object> = new WeakSet<object>();

// ============================================================================
// The range a region owns
// ============================================================================

const EMPTY: readonly object[] = [];

/** The parent is resolved from the anchor on every write, never captured: a
 * region built with no `(parent, anchor)` only learns its parent when the caller
 * inserts the anchor it returned. */
export interface Site {
  host: RangeHost;
  parent: object | null;
  anchor: object | null;
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
function siteFor(
  host: RangeHost,
  parent: object | null,
  anchor: object | null,
): { site: Site; out: object | null } {
  if (parent !== null) return { site: { host, parent, anchor }, out: null };
  const own = host.sentinel();
  LIVE_EDGES.add(own);
  const out = host.park();
  host.insertRange(out, [own], null);
  return { site: { host, parent: null, anchor: own }, out };
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
  parent: object | null,
  anchor: object | null,
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
    if (
      claimWalk().isScaffolding(anchor) ||
      (anchor === null && claimWalk().isScaffolding(parent))
    ) {
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
    const stray = claimWalk().probeRange(parent, anchor);
    if (stray !== null) {
      if (stray.nodes.length > 0) {
        report(
          "structure",
          `The server sent ${stray.nodes.length} node(s) for ${WRITTEN_AS[origin]} that the ` +
            "browser renders without `hydratable: true`. The nodes were removed, because the " +
            "browser built that content again.",
        );
      }
      claimWalk().releaseRange(stray);
      settleOn(site, stray);
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
  const range = claimWalk().claimAt(parent, anchor, flags & WHOLE);
  // `null` is "this position is not in the server's tree" — a region inside
  // something the client built. It claims nothing and builds cold, which is the
  // same answer `hole` gives one level up.
  if (range === null) {
    site.cold = true;
    return;
  }
  site.claim = range;
  settleOn(site, range);
}

/** Anchor `site` on the close of a range the server wrote. */
function settleOn(site: Site, range: Range): void {
  site.anchor = range.close;
  site.parent = (range.close === null ? null : site.host.parentOf(range.close)) ?? range.parent;
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
  const wire = claimWalk().rangeKey(claim);
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
  const wire = claimWalk().rangeKey(claim);
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
function outFor(site: Site, out: object | null, claimed: Range | null): object | object[] | null {
  if (out === null) return null;
  if (site.anchor !== null && site.host.parentOf(site.anchor) === out) return out;
  return claimed === null ? null : claimWalk().rangeNodes(claimed);
}

function parentOfSite(site: Site): object | null {
  return site.anchor !== null ? site.host.parentOf(site.anchor) : site.parent;
}

function insertAt(site: Site, nodes: readonly object[]): void {
  const parent = parentOfSite(site);
  if (parent === null) return;
  site.host.insertRange(parent, nodes, site.anchor);
}

// ============================================================================
// One activation
// ============================================================================

/** `scope` is null exactly when `NO_SCOPE` was proved. */
export interface Instance {
  scope: Scope | null;
  nodes: readonly object[];
}

/** Marks which arm a boundary's view is showing; the nodes are placed by hand. */
const CONTENT: unique symbol = Symbol("barq-content");

export const NOTHING: Instance = { scope: null, nodes: EMPTY };

/**
 * O1/O2/K6. The range removal is installed on the instance scope (O3.5), so a
 * disposal arriving from above removes the DOM without this module being asked.
 */
export function activate(
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
    claimWalk().releaseRange(claim);
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
    cursor = claimWalk().openCursor(claim);
    return atCursor(cursor, () => inDocumentOrder(work));
  };

  const host = site.host;
  if ((flags & NO_SCOPE) !== 0) {
    const nodes = under(() => host.row(build(host, given, body, args)));
    evictUnclaimed(claim, cursor);
    if (placed) insertAt(site, nodes);
    return { scope: null, nodes };
  }
  const scope = childScope(given, kind);
  const instance: { scope: Scope; nodes: readonly object[] } = { scope, nodes: EMPTY };
  // Installed before the body runs: a scope's cleanups unwind last-registered
  // first, so the range is still in the document while the body's own run.
  ownRange(scope, () => {
    host.removeRange(standingRow(host, instance.nodes));
    instance.nodes = EMPTY;
  });
  let built = false;
  try {
    instance.nodes = runWithOwner(scope, () =>
      under(() => host.row(build(host, scope, body, args))),
    );
    built = true;
  } finally {
    if (!built) {
      disposeScope(scope);
      // The claim goes with the attempt that failed. Its nodes are the server's
      // rendering of a body that just threw on the client, so they are wrong by
      // construction, and leaving them would put them beside whatever the
      // recovery builds instead.
      if (claim !== null) claimWalk().releaseRange(claim);
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
  const stranded = claimWalk().cursorRest(cursor);
  if (stranded.length === 0) return;
  claimWalk().evict(stranded);
  report(
    "structure",
    `The server sent ${stranded.length} more node(s) than the browser builds inside one ` +
      `conditional or boundary. ${usualCauses("structure")} The extra nodes were removed ` +
      REST_REUSED,
  );
}

/** A Cell ignores every argument, so one spelling serves both. */
function build(
  host: RangeHost,
  scope: Scope | null,
  body: Block<unknown>,
  args: readonly unknown[],
): object[] {
  // An already-built value in a renderable slot. Compiled code never produces
  // one — C6 makes children a Block — but the un-compiled surface `packages/extra`
  // is still on does, and `Out` admits a `Node` in its own right.
  if (typeof body !== "function") return host.toNodes(body, scope);
  return host.toNodes(invoke(scope, body, args) as Child, scope);
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

/** Count one activation, for a construct a renderer builds outside this module. */
export function nextActivation(): void {
  activation++;
}
const lastSeen = new WeakMap<object, number>();

function countCall(body: object): void {
  if (lastSeen.get(body) === activation) {
    emitDiagnostic({
      code: "BLOCK_EVALUATED_TWICE",
      kind: "render",
      severity: "error",
      message:
        "The content of one `<Show>`, `<For>`, `<Loading>` or `<Portal>` was built twice for a " +
        "single render, so its effects exist twice and one copy of its DOM was thrown away. " +
        "This is a bug in barq, not in your component: please report it with the component " +
        "that triggered it.",
    });
  }
  lastSeen.set(body, activation);
}

export function teardown(host: RangeHost, instance: Instance): void {
  if (instance.scope !== null) {
    // O3: total and ordered, ending in the range removal `activate` installed.
    // Nothing here duplicates it.
    disposeScope(instance.scope);
    return;
  }
  host.removeRange(standingRow(host, instance.nodes));
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
    const wire = claimWalk().rangeKey(claim);
    if (wire === null || wire === OPAQUE_KEY) return;
    if (wire === String(k)) return;
    report(
      "key",
      `The server rendered the branch \`${wire}\` of a conditional where the browser picks ` +
        `\`${String(k)}\`. ${usualCauses("key")} The server's branch was replaced by the ` +
        `browser's ${REST_REUSED}`,
    );
    claimWalk().releaseRange(claim);
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
        claimWalk().releaseRange(claim);
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
          site.host.removeRange(standingRow(site.host, previous.nodes));
        }
        insertAt(site, next.nodes);
        standing = next;
      },
    );
  }

  if ((flags & NO_SCOPE) !== 0) {
    // With no instance scope there is no `ownRange` to run, so the region's
    // last nodes come out with the scope that owns the region itself.
    onCleanup(() => site.host.removeRange(standingRow(site.host, standing.nodes)));
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
export function cellSlot(value: unknown, origin: string, returned = false): void {
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
export function branchIn<K, N extends object>(
  host: RangeHost<N>,
  parent: N | null,
  anchor: N | null,
  key: Cell<K>,
  bodies: Block<unknown> | readonly (Block<unknown> | null | undefined)[],
  flags = 0,
): N | N[] | null {
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
  const { site, out } = siteFor(host, parent, anchor);
  claimSite(site, parent, anchor, flags, "branch");
  const claimed = site.claim ?? null;
  underScope(given, "branch", () => region(site, key, bodies, flags, EMPTY_ARGS));
  return outFor(site, out, claimed) as N | N[] | null;
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

export function eachIn<T, N extends object>(
  host: RangeHost,
  sync: SyncRows<N>,
  parent: N | null,
  anchor: N | null,
  src: Cell<Maybe<readonly T[]>> | Cell<number>,
  carrier: ((item: T) => unknown) | false | null | typeof COUNT | Cell<unknown>,
  row: Block<unknown, never[]>,
  // Positional and part of the ABI — `fallback` sits behind it. The only bit
  // this frame reads is `HYDRATE`: `STATIC_KEY` is meaningless for a list, and
  // `NO_SCOPE` would have to reach the row scopes `mapArray`/`repeat` own.
  flags = 0,
  fallback?: Block<unknown> | null,
): N | N[] | null {
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
  const { site, out } = siteFor(host, parent, anchor);
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
  let rowCursor: Cursor | null = claim === null ? null : claimWalk().openCursor(claim);
  const body = row as Block<unknown>;
  const rowOf = (args: readonly unknown[]): object[] =>
    host.row(build(host, getOwner(), body, args));
  // A list with nothing to claim builds its rows cold, and says so to each
  // one: a row is built by the list's own node, under whatever cursor the
  // page left current, and a template there would claim from it.
  let cold = claim === null && hydrating();

  return underScope(given, "each", (): N | N[] | null => {
    const fallbackRows =
      fallback === null || fallback === undefined
        ? undefined
        : (): object[] => {
            activation++;
            if (OWNERSHIP.sink !== null) traceRow(given);
            // Under the list's cursor like any row: the server wrote the
            // fallback inside the list's range, and built outside it the
            // fallback's template claimed whatever the page had next.
            if (rowCursor === null) {
              return cold
                ? withoutClaim(() => build(host, getOwner(), fallback, EMPTY_ARGS))
                : build(host, getOwner(), fallback, EMPTY_ARGS);
            }
            return inRow(rowCursor, () => build(host, getOwner(), fallback, EMPTY_ARGS));
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
            return listRow(cold ? withoutClaim(() => rowOf([index])) : rowOf([index]));
          }
          return listRow(inRow(rowCursor, () => rowOf([index])));
        },
        { fallback: fallbackRows },
      );
    } else {
      const one = (item: unknown): Row => {
        activation++;
        if (OWNERSHIP.sink !== null) traceRow(given);
        if (rowCursor === null) {
          return listRow(cold ? withoutClaim(() => rowOf([item])) : rowOf([item]));
        }
        return listRow(inRow(rowCursor, () => rowOf([item])));
      };
      const two = (item: unknown, index: unknown): Row => {
        activation++;
        if (OWNERSHIP.sink !== null) traceRow(given);
        if (rowCursor === null) {
          return listRow(cold ? withoutClaim(() => rowOf([item, index])) : rowOf([item, index]));
        }
        return listRow(inRow(rowCursor, () => rowOf([item, index])));
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
    syncRows(site, sync as SyncRows, rows, () => {
      // The server's rows are spent by the first pass. A row the list gains
      // after it is new, built cold like any later change, and not a row the
      // server failed to send.
      const cursor = rowCursor;
      rowCursor = null;
      if (cursor !== null) cold = true;
      if (site.cold === true || cursor === null || cursorAtEnd(cursor)) return;
      const stranded = claimWalk().cursorRest(cursor);
      report(
        "structure",
        `The server sent ${stranded.length} node(s) in a list that no row in the browser ` +
          `matches, so the list is shorter in the browser. ${usualCauses("structure")} The ` +
          `extra nodes were removed ${REST_REUSED}`,
      );
      claimWalk().evict(stranded);
    });
    site.claim = null;
    return outFor(site, out, claimed) as N | N[] | null;
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
function inRow(cursor: Cursor | null, make: () => object[]): object[] {
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
   * hands back nothing and the row is, as far as the list's `sync` can tell, a
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
   * a node to be read from (the host's `row`); neither is the server's, and a row cut
   * down to its claimed span lost both, so the hole's next write had nowhere
   * in the document to go.
   */
  const claimed = claimWalk().spanBetween(from, cursor.next);
  if (claimed.length === 0) return made;
  return claimed.every((node) => made.includes(node)) ? made : claimed;
}

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
export const LIVE_ROWS: WeakSet<readonly object[]> = new WeakSet<readonly object[]>();

function listRow(nodes: readonly object[]): Row {
  return nodes.length === 1 && !LIVE_ROWS.has(nodes) ? nodes[0] : nodes;
}

export function isNodes<N extends object>(row: Row<N>): row is readonly N[] {
  return Array.isArray(row);
}

/** A row as it stands. */
export function standingRow<N extends object>(host: RangeHost<N>, row: readonly N[]): readonly N[] {
  if (!LIVE_ROWS.has(row)) return row;
  const first = row[0];
  const last = row[row.length - 1];
  const parent = host.parentOf(first);
  if (parent === null || parent !== host.parentOf(last)) return row;
  const nodes: N[] = [];
  for (let node: N | null = first; node !== null; node = host.nextOf(node)) {
    nodes.push(node);
    if (node === last) break;
  }
  return nodes;
}

export function standingRows<N extends object>(host: RangeHost<N>, rows: readonly Row<N>[]): N[] {
  const out: N[] = [];
  for (const row of rows) {
    if (!isNodes(row)) {
      out.push(row);
      continue;
    }
    const standing = standingRow(host, row);
    for (let i = 0; i < standing.length; i++) out.push(standing[i]);
  }
  return out;
}

/**
 * Row lifecycle belongs to `mapArray`/`repeat`; this only moves nodes, so a
 * group's ARRAY IDENTITY is what tracks a row — which is why a keyed move
 * preserves the moved row's nodes (K2). How they move is the renderer's
 * `sync`, called once per list update.
 */
function syncRows(site: Site, sync: SyncRows, rows: () => Row[], beforeFirst: () => void): void {
  let current: Row[] = [];
  let first = true;

  renderEffect(rows, (next) => {
    if (first) {
      first = false;
      beforeFirst();
    }
    const parent = parentOfSite(site);
    if (parent === null) return;
    sync(parent, site.anchor, current, next);
    current = next;
  });

  onCleanup(() => {
    site.host.removeRange(standingRows(site.host, current));
    current = [];
  });
}

/** Patience sorting plus binary search: O(n log n). */
export function longestIncreasingSubsequence(arr: number[]): number[] {
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
export function boundaryIn<N extends object>(
  host: RangeHost<N>,
  parent: N | null,
  anchor: N | null,
  kind: BoundaryKind,
  fallback: Block<unknown> | null | undefined,
  body: Block<unknown>,
  flags = 0,
  on?: Cell<unknown>,
): N | N[] | null {
  const given = getOwner();
  if (on !== undefined) cellSlot(on, "Loading.on");
  const { site, out } = siteFor(host, parent, anchor);
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
      claimWalk().releaseRange(stranded);
    }
  }
  return outFor(site, out, claimed) as N | N[] | null;
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
  const host = site.host;
  const park: Site = { host, parent: host.park(), anchor: null };
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
  // A range the stream still owes content: `swapDeferredRange` asks this
  // boundary before it places the server's nodes, and the boundary claims them
  // when its values arrive instead of building a second copy beside them. An
  // error boundary's range is never replaced under a client that hydrated it:
  // its own fallback shows the failure.
  let lateOpen: object | null = null;
  const owedRange = fallbackClaim ?? firstClaim;
  const owed = owedRange?.open ?? null;
  const owedKey = owedRange === null ? null : claimWalk().rangeKey(owedRange);
  if (owed !== null && owedKey !== null && (owedKey.startsWith("b:") || owedKey.startsWith("e:"))) {
    const deferred = owedKey.startsWith("b:");
    (owed as { $$barq?: (failed: boolean) => boolean }).$$barq = (failed) => {
      if (!deferred || failed || content !== NOTHING || host.parentOf(owed) === null) return false;
      lateOpen = owed;
      return true;
    };
  }
  // `onHydrationEnd` waits for the content the stream still owes.
  const releaseHold =
    owed !== null && owedKey !== null && owedKey.startsWith("b:") ? holdHydration() : null;
  if (releaseHold !== null) onCleanup(releaseHold);
  let content: Instance = NOTHING;
  let standIn: Instance = NOTHING;
  // Not the application's error, and this is not the thing that recovers from
  // it: `hydrate` does, by throwing the whole attempt away and rendering the
  // page cold, and it can only do that if the throw reaches it.
  let mismatch: HydrationMismatch | null = null;

  // The node the content stands after while it is at the site, `null` for the
  // start of the host. Everything from there to the site's anchor is the
  // content: the position is this boundary's alone.
  let lead: object | null = null;
  // A site with no parent is one node in a fragment the caller adopts, and once
  // it has, nothing says where this boundary's content begins: whatever the
  // caller placed before it is now its sibling. Such a site is given a node to
  // begin at, which travels with the fragment.
  let pinned = false;
  const fragment = site.anchor === null ? null : host.parentOf(site.anchor);
  if (site.anchor !== null && fragment !== null && host.isPark(fragment)) {
    lead = host.sentinel();
    host.insertRange(fragment, [lead], site.anchor);
    pinned = true;
  }
  const leadOf = (first: object | undefined): object | null => {
    if (first !== undefined) return host.prevOf(first);
    const parent = parentOfSite(site);
    if (site.anchor !== null) return host.prevOf(site.anchor);
    return parent === null ? null : host.lastOf(parent);
  };
  if (firstClaim !== null && !pinned) lead = leadOf(firstClaim.nodes[0]);

  const standing = (): object[] => {
    const parent = parentOfSite(site);
    if (parent === null) return [...content.nodes];
    const out: object[] = [];
    let node = lead === null ? host.firstOf(parent) : host.nextOf(lead);
    for (; node !== null && node !== site.anchor; node = host.nextOf(node)) out.push(node);
    return out;
  };

  const parked = (): object[] => {
    const out: object[] = [];
    for (let node = host.firstOf(park.parent!); node !== null; node = host.nextOf(node)) {
      out.push(node);
    }
    return out;
  };

  const move = (target: Site): void => {
    if (live === target) return;
    // Either way it is what is THERE that moves, not the node list the last
    // build returned: a region inside the content swaps arms on its own, and
    // the build's list still names the arm that left. The park holds this
    // boundary's content and nothing else, so its child list is the truth; at
    // the site the truth is everything between the lead and the anchor.
    const moving = live === park ? parked() : standing();
    live = target;
    if (target === site && !pinned) lead = leadOf(undefined);
    insertAt(target, moving);
  };

  // E2 entry point for what the engine cannot see: a handler, a cleanup, an
  // async continuation. Routing one here re-runs the content, which throws it
  // where the boundary is listening.
  const routed = kind === "error" ? createSignal<{ error: unknown } | null>(null) : null;

  // The swapped range, as a claim: everything between the open comment the
  // swap left and this site's anchor, which is the range's close.
  const lateClaim = (): Range | null => {
    const open = lateOpen;
    lateOpen = null;
    const parent = open === null ? null : host.parentOf(open);
    if (open === null || parent === null) return null;
    const nodes = claimWalk().spanBetween(host.nextOf(open), site.anchor);
    return { open, close: site.anchor, parent, nodes };
  };

  // Claimed where they stand. A mismatch costs this boundary its server nodes
  // and nothing else: the content is built cold, as it would have been had the
  // swap never come.
  const adopt = (own: Scope | null, claim: Range): Instance => {
    const cold = (): Instance => {
      live = park;
      return attempt(own, park, body, EMPTY_ARGS, 0, "branch", null);
    };
    live = site;
    if (!pinned) lead = claim.open;
    let claimed: { value: Instance; abandoned: HydrationMismatch | null };
    try {
      claimed = claimLate(claim.parent, () =>
        attempt(own, site, body, EMPTY_ARGS, 0, "branch", claim),
      );
    } catch (error) {
      if (!(error instanceof HydrationMismatch)) throw error;
      return cold();
    }
    if (claimed.abandoned === null) return claimed.value;
    teardown(host, claimed.value);
    return cold();
  };

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
      const late = claim === null ? lateClaim() : null;
      if (late !== null) {
        content = adopt(own, late);
        return;
      }
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
    teardown(host, standIn);
    standIn = NOTHING;
  };

  renderEffect(view, (showing: unknown) => {
    dropStandIn();
    if (showing === CONTENT) {
      releaseHold?.();
      // The server's fallback is DEAD once content shows, and it has to go or
      // it stands beside the content. This is the nested case: an outer
      // boundary owns the `[f:` range, a boundary INSIDE it absorbs the
      // pendingness, so the outer renders content and never builds the
      // fallback its claim was being held for.
      if (fallbackClaim !== null) {
        host.removeRange(fallbackClaim.nodes);
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
export function islandIn<N extends object>(
  host: RangeHost<N>,
  parent: N | null,
  anchor: N | null,
  block: Block<unknown>,
  flags = 0,
): N | null {
  const site: Site = { host, parent, anchor };
  if (hydrating()) {
    // BY ADDRESS, exactly as `hole` claims: inside a compiled template this
    // position is reached through `child`/`sib` off a claimed root, not through
    // the walk's cursor — so a cursor-based claim never sees the island at all.
    // Measured on the first attempt: `built: 1` with the island's body running
    // and its output appended beside the server's markup.
    const claim = claimWalk().claimRange(parent, anchor);
    if (claim !== null && claimWalk().rangeKey(claim) === ISLAND_KEY) {
      // Nothing is built and nothing is walked. The server's nodes stay exactly
      // where they are, which is the whole of what an island buys.
      //
      // The scope is still opened: the server's island took a position among
      // its siblings, and without this one every async value after it would be
      // looked up one position early.
      setHydratable(childScope(getOwner(), "branch"), false);
      return claim.nodes.length > 0 ? (claim.nodes[0] as N) : null;
    }
    // Not an island on the wire — a client-only render, or a position the server
    // wrote differently. Give the claim back and build cold.
    if (claim !== null) claimWalk().releaseRange(claim);
  }
  const unhydratable = (...args: readonly unknown[]): unknown => {
    setHydratable(getOwner()!, false);
    return typeof block === "function"
      ? (block as (...rest: readonly unknown[]) => unknown)(...args)
      : block;
  };
  // Never without a scope: the scope is what carries the mark.
  const scoped = flags & ~NO_SCOPE;
  const instance = attempt(getOwner(), site, unhydratable, EMPTY_ARGS, scoped, "branch", null);
  return instance.nodes.length > 0 ? (instance.nodes[0] as N) : null;
}

/**
 * Reveal ordering — the fifth thing `flow.ts` owns, and the one that is not a
 * range: it opens the scope every `Loading` boundary below it asks how to time
 * its reveal. The order and the collapsed flag arrive as Cells the compiler
 * computed, the children as the Block they already were.
 */
export function revealIn<N extends object>(
  host: RangeHost<N>,
  order: Cell<RevealOrder | undefined>,
  collapsed: Cell<boolean | undefined>,
  block: Block<unknown>,
): N[] {
  const given = getOwner();
  return createRevealOrder(
    () => {
      // The group's scope is the engine's; say so to the ownership trace.
      const group = getOwner();
      if (OWNERSHIP.sink !== null && group !== null) traceScope(group, given, "provide", true);
      return host.toNodes((block as unknown as () => unknown)() as Child, group);
    },
    { order: () => order() ?? "sequential", collapsed: () => collapsed() === true },
  );
}
