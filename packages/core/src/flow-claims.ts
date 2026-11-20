/**
 * What control flow does with the server's nodes: claim the range a construct
 * stands on, compare it with what the browser builds, and report and remove
 * what does not match.
 *
 * `flow.ts` reaches all of it through the `FlowClaims` table and only where a
 * claim exists or one is being made, and only `hydrate` installs the table, so
 * a page that never hydrates references this module from nowhere and its
 * bundle carries none of it, the reports' prose included.
 */

import {
  HydrationMismatch,
  atCursor,
  claimLate,
  claimWalk,
  cursorAtEnd,
  holdHydration,
  hydrating,
  inDocumentOrder,
  report,
  usualCauses,
  WHOLE,
  withoutClaim,
  type Cursor,
  type Range,
} from "./hydration-state.ts";
import type { Block, Scope } from "./scope.ts";
import { childScope, getOwner, setHydratable } from "./signals.ts";
import {
  HYDRATE,
  WRITTEN_AS,
  attempt,
  setFlowClaims,
  teardown,
  type BoundaryClaim,
  type FlowClaims,
  type Instance,
  type RangeHost,
  type Site,
} from "./flow.ts";

/**
 * What the wire says when the key it chose has no safe spelling in a comment.
 * The range is still claimed — positionally, which is all `<!--[-->` ever gave
 * a hole — and only the COMPARISON is skipped. `ssr.ts` writes it.
 */
const OPAQUE_KEY = "?";

const REST_REUSED = "and the rest of the server's markup was reused.";

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
 * The first activation at a claimed position, which builds under the server's
 * nodes.
 */
function activateClaimed(
  given: Scope | null,
  site: Site,
  body: Block<unknown>,
  args: readonly unknown[],
  flags: number,
  kind: "branch" | "portal",
  claim: Range,
  placed: boolean,
): Instance {
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
function evictUnclaimed(claim: Range, cursor: Cursor | null): void {
  if (cursor === null) return;
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
function reconcileKey(site: Site, claim: Range, k: unknown): void {
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
}

/** A claim an empty arm took, whose nodes nothing will adopt. */
function emptyArm(claim: Range): void {
  if (claim.nodes.length === 0) return;
  report(
    "structure",
    `The server sent ${claim.nodes.length} node(s) for ${WRITTEN_AS.branch} where the ` +
      `browser renders nothing. The nodes were removed ${REST_REUSED}`,
  );
  claimWalk().releaseRange(claim);
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
function inRow(cursor: Cursor, make: () => object[]): object[] {
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

/** What the list's cursor still holds once its first pass has built every row. */
function strandedRows(cursor: Cursor): void {
  if (cursorAtEnd(cursor)) return;
  const stranded = claimWalk().cursorRest(cursor);
  report(
    "structure",
    `The server sent ${stranded.length} node(s) in a list that no row in the browser ` +
      `matches, so the list is shorter in the browser. ${usualCauses("structure")} The ` +
      `extra nodes were removed ${REST_REUSED}`,
  );
  claimWalk().evict(stranded);
}

/** A claim a boundary declined, whose nodes nothing will adopt. */
function strandedBoundary(stranded: Range): void {
  if (stranded.nodes.length === 0) return;
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
 * The claim a boundary's position holds. `idle` answers whether the boundary
 * has no content standing yet, which is when a swapped range may still be
 * claimed.
 */
function boundaryClaim(site: Site, idle: () => boolean): BoundaryClaim {
  const host = site.host;
  const settled = takeSettledClaim(site);
  const fallback = settled === null ? takeUnsettledClaim(site) : null;
  // A range the stream still owes content: `swapDeferredRange` asks this
  // boundary before it places the server's nodes, and the boundary claims them
  // when its values arrive instead of building a second copy beside them. An
  // error boundary's range is never replaced under a client that hydrated it:
  // its own fallback shows the failure.
  let lateOpen: object | null = null;
  const owedRange = fallback ?? settled;
  const owed = owedRange?.open ?? null;
  const owedKey = owedRange === null ? null : claimWalk().rangeKey(owedRange);
  if (owed !== null && owedKey !== null && (owedKey.startsWith("b:") || owedKey.startsWith("e:"))) {
    const deferred = owedKey.startsWith("b:");
    (owed as { $$barq?: (failed: boolean) => boolean }).$$barq = (failed) => {
      if (!deferred || failed || !idle() || host.parentOf(owed) === null) return false;
      lateOpen = owed;
      return true;
    };
  }
  return {
    settled,
    fallback,
    release: owed !== null && owedKey !== null && owedKey.startsWith("b:") ? holdHydration() : null,
    // The swapped range, as a claim: everything between the open comment the
    // swap left and this site's anchor, which is the range's close.
    late(): Range | null {
      const open = lateOpen;
      lateOpen = null;
      const parent = open === null ? null : host.parentOf(open);
      if (open === null || parent === null) return null;
      const nodes = claimWalk().spanBetween(host.nextOf(open), site.anchor);
      return { open, close: site.anchor, parent, nodes };
    },
  };
}

/**
 * Build a boundary's content over the range the stream swapped in. `null` is a
 * claim that failed, whose build is gone and whose nodes are released, for the
 * boundary to build cold instead.
 */
function adoptLate(host: RangeHost, claim: Range, build: () => Instance): Instance | null {
  let claimed: { value: Instance; abandoned: HydrationMismatch | null };
  try {
    claimed = claimLate(claim.parent, build);
  } catch (error) {
    if (!(error instanceof HydrationMismatch)) throw error;
    return null;
  }
  if (claimed.abandoned === null) return claimed.value;
  teardown(host, claimed.value);
  return null;
}

/**
 * The island the server wrote at this position, claimed and built not at all:
 * its first node, or `null` for an empty one. `undefined` when the server wrote
 * no island here, for the caller to build cold.
 */
function island(parent: object | null, anchor: object | null): object | null | undefined {
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
    return claim.nodes.length > 0 ? claim.nodes[0] : null;
  }
  // Not an island on the wire — a client-only render, or a position the server
  // wrote differently. Give the claim back and build cold.
  if (claim !== null) claimWalk().releaseRange(claim);
  return undefined;
}

const FLOW_CLAIMS: FlowClaims = {
  claimSite,
  rangeNodes: (range) => claimWalk().rangeNodes(range),
  openCursor: (range) => claimWalk().openCursor(range),
  release: (range) => claimWalk().releaseRange(range),
  activate: activateClaimed,
  evictUnclaimed,
  reconcileKey,
  emptyArm,
  inRow,
  strandedRows,
  strandedBoundary,
  boundary: boundaryClaim,
  adoptLate,
  island,
  isMismatch: (error) => error instanceof HydrationMismatch,
};

export function installFlowClaims(): void {
  setFlowClaims(FLOW_CLAIMS);
}
