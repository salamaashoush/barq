/**
 * Claim-based hydration.
 *
 * The client CLAIMS the server's nodes by walking them. Nothing is cleared,
 * nothing is replaced, and the walk that claims is the walk that would have
 * built — `child`/`sib` replace `.firstChild`/`.nextSibling` under `hydratable`
 * and address the same positions.
 *
 * THE WIRE FORMAT, which the compiler writes and this file reads:
 *
 *   <!--[-->  …  <!--]-->     a hole the client cannot bound on its own
 *   <!--[--> … <!--]-->       a control-flow range
 *   <!--[k--> …  <!--]-->     the same range in a DEV build, `k` the key the
 *                             primitive CHOSE
 *   <!--[b:N--> … <!--]-->    a boundary the stream has not flushed yet
 *   <!--[e:N--> … <!--]-->    an error boundary's content, which a stream
 *                             replaces whole with `<!--[f:-->` and the fallback
 *                             if something below it fails after the shell
 *   <!---->                   a skeleton marker, present on both sides
 *
 * and, as important, what it does NOT carry:
 *
 *   a hole that owns its parent element's whole child list — no comments; the
 *     extent is every child of the parent and the client reads it off the
 *     document
 *   a row of an `each` — no comments; the rows are built in order and each one
 *     claims from the list's cursor, so its extent is what it consumed
 *
 * Writing a boundary comment at every position was reversed on a measurement:
 * the comments cost 55.7% raw and 7.3% gzipped on a 100-row page, and 7.3% on
 * every page forever is material. The split that replaces it is this: THE WIRE
 * CARRIES WHAT RECOVERY NEEDS AND NOTHING ELSE, and DETECTION is an emission
 * axis that a dev build
 * turns on and a production build does not have. What is left above is
 * load-bearing for the claim itself — a delimited hole's extent is data the
 * client cannot compute, and a range's identity is a decision only the server
 * made.
 *
 * Every claim below either succeeds or throws [`HydrationMismatch`], and every
 * catcher is one of exactly two:
 *
 *  - a REGION catches it and rebuilds its own range — H4's local blast radius;
 *  - `hydrate` catches it and does a full client render — today's behaviour,
 *    exactly, which is the worst case this design admits.
 *
 * There is no third option and in particular no arm that swallows one.
 */

const ELEMENT = 1;
const COMMENT = 8;
const TEXT = 3;

/** `<!--[…-->` — a range opens. The rest of the data is the key, if any. */
const OPEN = "[";
/** `<!--]-->` — a range closes. */
const CLOSE = "]";
/** `<!---->` — a DOM insert anchor, present in the template and on the wire. */
const MARKER = "";

import {
  type ClaimWalk,
  type Cursor as HostCursor,
  type HydrationReport,
  type Range as HostRange,
  type Session,
  HydrationMismatch,
  drainHydrationEnd,
  hydrating,
  hydrationSession,
  installClaimWalk,
  noSession,
  setHydrationSession,
  withoutClaim,
  atCursor,
  LIVE_EDGES,
} from "@barqjs/core/internal";
import { WHOLE } from "@barqjs/core";

/**
 * The compiler's `TAGGED` (`ir/region.rs`): no range on the wire here, but the
 * build inside CAN claim — by tag name, because it is an `element()` call.
 *
 * A null address used to mean "build cold" unconditionally, which is what made
 * the whole `<html>`/`<head>`/`<body>` frame unhydratable: the parser strips
 * those out of a `<template>`, so they compile to `element()` and every one of
 * them took the cold path.
 */
export const TAGGED: number = 1 << 5;

/** A claimed range of the document. */
export type Range = HostRange<Node, Comment>;

/** One cursor over a claimed sequence of the document. */
export type Cursor = HostCursor<Node, Text>;

type DomSession = Session<Node, Comment, Text>;

function session(): DomSession | null {
  return hydrationSession<Node, Comment, Text>();
}

/**
 * The claim walk, reached through this table and installed by
 * `beginHydration`. A page that only ever calls `render` never references the
 * table, so a bundler drops the walk with it; called directly, every one of
 * these functions was kept in every bundle by the render path's own
 * `hydrating()` branches.
 *
 * With no table installed no `hydrate` has started, so no session is open and
 * each entry below answers exactly as its walk does with no session.
 */
let walk: typeof WALK | null = null;

export function claimNode(template: Node, detect?: boolean | string): Node | null {
  return walk === null ? null : walk.claimNode(template, detect);
}

export function claimText(value: string): Text | null {
  return walk === null ? null : walk.claimText(value);
}

export function claimElement(tag: string): Element | null {
  return walk === null ? null : walk.claimElement(tag);
}

export function withRangeTaken<T>(
  range: Range,
  body: () => T,
  after?: Taken,
): { value: T; taken: Node[]; held: Text[] } {
  return walk === null
    ? { value: body(), taken: [], held: [] }
    : walk.withRangeTaken(range, body, after);
}

export function hole<T>(
  parent: Node | null,
  anchor: Node | null,
  build: () => T,
  mode?: number,
): T {
  return walk === null ? build() : walk.hole(parent, anchor, build, mode);
}

export function claimRange(parent: Node | null, anchor: Node | null, mode?: number): Range | null {
  if (walk !== null) return walk.claimRange(parent, anchor, mode);
  if ((anchor !== null ? anchor.parentNode : parent) === null) throw strayRange();
  return null;
}

export function claimAt(parent: Node | null, anchor: Node | null, mode?: number): Range | null {
  if (walk !== null) return walk.claimAt(parent, anchor, mode);
  if (parent !== null || anchor !== null) return claimRange(parent, anchor, mode);
  throw noSession();
}

export function probeRange(parent: Node | null, anchor: Node | null): Range | null {
  return walk === null ? null : walk.probeRange(parent, anchor);
}

function strayRange(): HydrationMismatch {
  return new HydrationMismatch(
    "range",
    "the browser looked for server-rendered content at a node that is not in the document",
  );
}

/**
 * Where the claim walk starts inside a container.
 *
 * A DOCUMENT's first child is its `<!doctype html>`, which is a node the walk
 * would otherwise count as the position `<html>` occupies — and every index
 * after that is then off by one, so nothing claims and the render appends a
 * SECOND `<html>`. Measured before this line existed: "Failed to execute
 * 'appendChild' on 'Node': Only one element on document allowed."
 *
 * An element container has no such node, so this is `firstChild` there.
 */
function firstClaimable(container: Node): Node | null {
  let node = container.firstChild;
  while (node !== null && node.nodeType === 10 /* DOCUMENT_TYPE_NODE */) {
    node = node.nextSibling;
  }
  return node;
}

export function beginHydration(container: Node): void {
  walk = WALK;
  installClaimWalk(CLAIM_WALK);
  setHydrationSession({
    container,
    marked: hasRanges(container),
    stack: [{ parent: container, next: firstClaimable(container), end: null }],
    mismatches: [],
    claimed: 0,
    ranges: 0,
    built: 0,
    taken: [],
    abandoned: null,
  });
}

/**
 * Resolves once the server's shell and the scripts after it have been parsed:
 * the stream's own marker, or `DOMContentLoaded`, or at once when the parser is
 * done. A module entry loaded `async` from the head runs before the shell is
 * in; everything up to its first read of a seed can happen meanwhile, and the
 * read waits for this.
 */
export function shellReady(): Promise<void> {
  const global = globalThis as { __BARQ_SHELL__?: number; __BARQ_SHELL_WAIT__?: (() => void)[] };
  if (
    typeof document === "undefined" ||
    document.readyState !== "loading" ||
    global.__BARQ_SHELL__ === 1
  ) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    (global.__BARQ_SHELL_WAIT__ ??= []).push(resolve);
    document.addEventListener("DOMContentLoaded", () => resolve(), { once: true });
  });
}

/**
 * Claim server nodes that arrived after `hydrate` returned: a streamed
 * boundary's content, swapped in where the boundary's fallback was claimed.
 *
 * A session of its own for the length of `work`, over nothing but the range
 * the caller opens a cursor on, and only where a `hydrate` installed the walk:
 * a page that only ever renders never reaches this with a claim to make. What
 * a mismatch below hands `abandonClaim` comes back as `abandoned`, for the
 * caller to rebuild its own range rather than the page.
 */
export function claimLate<T>(
  container: Node,
  work: () => T,
): { value: T; abandoned: HydrationMismatch | null } {
  if (walk === null || session() !== null) return { value: work(), abandoned: null };
  const late: DomSession = {
    container,
    late: true,
    marked: true,
    stack: [],
    mismatches: [],
    claimed: 0,
    ranges: 0,
    built: 0,
    taken: [],
    abandoned: null,
  };
  setHydrationSession(late);
  try {
    return { value: work(), abandoned: late.abandoned };
  } finally {
    setHydrationSession(null);
    holeTaken = null;
    drainHydrationEnd();
  }
}

/**
 * Has the walk landed on claim scaffolding?
 *
 * A boundary comment is never a position the compiler addresses — it is the
 * marker AROUND one — so a `(parent, anchor)` pair whose anchor is one means the
 * walk that produced it counted the server's ranges as ordinary nodes. That is
 * precisely what a client half built WITHOUT the flag does over markup built
 * with it, and it means every index from here on is off by an unknown amount.
 *
 * Cheap, exact, and it does not depend on how deep the caller happens to be.
 */
export function isScaffolding(node: Node | null): boolean {
  if (node === null || node.nodeType !== COMMENT) return false;
  const data = (node as Comment).data;
  return data.charAt(0) === OPEN || data === CLOSE;
}

function hasRanges(root: Node): boolean {
  for (let node = root.firstChild; node !== null; node = node.nextSibling) {
    if (node.nodeType === COMMENT && (node as Comment).data.charAt(0) === OPEN) return true;
    if (node.nodeType === ELEMENT && hasRanges(node)) return true;
  }
  return false;
}

export function endHydration(): HydrationReport {
  const ended = session();
  setHydrationSession(null);
  holeTaken = null;
  drainHydrationEnd();
  if (ended === null) return { mismatches: [], claimed: 0, ranges: 0, built: 0 };
  return {
    mismatches: ended.mismatches,
    claimed: ended.claimed,
    ranges: ended.ranges,
    built: ended.built,
  };
}

/**
 * A cursor over `range`'s interior that OUTLIVES one entry into it.
 *
 * The rows of an `each` are why it exists. A row used to be delimited on the
 * wire so the client could hand row `i` its own nodes; it does not need to be,
 * because the rows are built in ORDER and a row's extent is exactly what its
 * build consumed. One cursor, shared by every row, is the whole mechanism —
 * which is what let 1,600 bytes of the 100-row page's 6,416 go.
 */
export function openCursor(range: Range): Cursor {
  const parent = range.open?.parentNode ?? range.parent;
  return {
    parent,
    next: range.open === null ? firstClaimable(parent) : range.open.nextSibling,
    end: range.close,
  };
}

/** Everything `cursor` still holds, consumed: text nobody took included. */
export function cursorRest(cursor: Cursor): Node[] {
  const rest: Node[] = cursor.held === undefined ? [] : cursor.held;
  cursor.held = undefined;
  for (let node = cursor.next; node !== null && node !== cursor.end; node = node.nextSibling) {
    rest.push(node);
  }
  cursor.next = cursor.end;
  return rest;
}

/** Run `body` claiming from `range`'s interior, once. */
export function withRange<T>(range: Range, body: () => T): T {
  if (session() === null) return body();
  return atCursor(openCursor(range), body);
}

/**
 * `withRange`, plus the nodes the body actually TOOK.
 *
 * A caller that reconciles what the body produced against what the server sent
 * needs this, because "produced nothing" and "claimed everything in place" look
 * identical from the outside: a nested region claims at its own site and hands
 * its caller no node to insert. Comparing produced-lists removes the page;
 * asking the cursor does not. `flow.ts`'s `attempt` asks the same question.
 */
function withRangeTakenWalk<T>(
  range: Range,
  body: () => T,
  /**
   * What an earlier pass over this range already took. The value at a hole is
   * built in two steps when part of it is a thunk: whatever is written before
   * the thunk claims as the value is evaluated, and the thunk claims when the
   * value is placed. The second step goes on from where the first stopped,
   * text it stepped over included.
   */
  after?: Taken,
): { value: T; taken: Node[]; held: Text[] } {
  const state = session();
  if (state === null) return { value: body(), taken: [], held: [] };
  const cursor = openCursor(range);
  if (after !== undefined && after.taken.length > 0) {
    cursor.next = after.taken[after.taken.length - 1].nextSibling;
    if (after.held.length > 0) cursor.held = after.held.slice();
  }
  const value = atCursor(cursor, body);
  const held = cursor.held === undefined ? [] : cursor.held.slice();
  const rest = new Set<Node>(cursorRest(cursor));
  // Read once the body is done: a text node it cut in two is two of the
  // range's nodes now, and the second is as much taken as the first.
  return { value, taken: range.nodes.filter((node) => !rest.has(node)), held };
}

/**
 * What one pass over a range claimed, and the text it stepped over on the way
 * that a string still to be made into a node owns.
 *
 * `["Label ", <i/>, () => x()]` evaluated at a hole claims the `<i>` and steps
 * over the label's text to reach it; the label is made into a node when the
 * value is placed, by the second pass, and that pass has to be handed the text
 * or it starts after the `<i>` and builds the label again.
 */
export interface Taken {
  taken: readonly Node[];
  held: readonly Text[];
}

/**
 * Claim the next node at the cursor, which is what `template()` calls instead
 * of cloning.
 *
 * `expect` is the template's own root node name. Comparing it is the cheapest
 * structural check there is and it catches the case that matters: the client
 * building a different tree from the one the server serialised. React's
 * documented consequence of NOT catching it is event handlers attached to the
 * wrong elements.
 */
function claimNodeWalk(template: Node, detect?: boolean | string): Node | null {
  const state = session();
  if (state === null) return null;
  const cursor = state.stack[state.stack.length - 1];
  if (cursor === undefined) return null;
  const expect = template.nodeName;
  let node = cursor.next;
  // An element being claimed where the server wrote text: the text belongs to
  // a string beside the element, which has not been made into a node yet.
  if (template.nodeType === 1) {
    while (node !== null && node !== cursor.end && node.nodeType === 3) {
      (cursor.held ??= []).push(node as Text);
      node = node.nextSibling;
    }
    cursor.next = node;
  }
  if (node === null || node === cursor.end) {
    throw new HydrationMismatch(
      "structure",
      `the server's markup ends where the browser builds ${describe(template)}`,
    );
  }
  // The ROOT name is compared in every build, and that is not a hedge: the
  // template node is already the argument, so the comparison is one string test
  // at a claim that was happening anyway. What is off the production path is
  // the O(subtree) walk below it.
  if (node.nodeName !== expect) {
    throw new HydrationMismatch(
      "structure",
      `the server sent ${describe(node)} where the browser builds ${describe(template)}`,
    );
  }
  // A development compile passes the template's source location as the flag.
  if (detect) verifySubtree(template, node, expect.toLowerCase());
  cursor.next = node.nextSibling;
  state.claimed++;
  return node;
}

/**
 * The text node the server wrote for a string child, when a template claim
 * stepped over it on the way to its own element.
 *
 * Only what was stepped over, and only when it says the same thing: a string
 * is also made into a node long after its cursor has closed, where the one on
 * the stack belongs to something else, and taking that one's next node would
 * be taking a neighbour's.
 */
function claimTextWalk(value: string): Text | null {
  const state = session();
  if (state === null) return null;
  const cursor = state.stack[state.stack.length - 1];
  if (cursor === undefined) return null;
  const held = cursor.held;
  if (held !== undefined && held.length > 0 && leads(held[0], value)) {
    state.claimed++;
    const node = held[0];
    if (node.data.length === value.length) held.shift();
    else held[0] = split(node, value.length);
    return node;
  }
  if (cursor.ordered !== true) return null;
  const node = cursor.next;
  if (node === null || node === cursor.end || node.nodeType !== 3) return null;
  if (!leads(node as Text, value)) return null;
  if ((node as Text).data.length > value.length) split(node as Text, value.length);
  cursor.next = node.nextSibling;
  state.claimed++;
  return node as Text;
}

/**
 * Whether the server's text node begins with `value`.
 *
 * Strings that stand next to each other with nothing between them reach the
 * parser as one run of characters, and it makes them one text node: rows of a
 * list that are text, a string beside a hole's text inside a component's
 * children. The client still makes one node per string, and they are the
 * server's run in order, so the first string takes its own length off the front
 * and leaves the rest standing for the next.
 */
function leads(node: Text, value: string): boolean {
  if (value === "") return node.data === "";
  return node.data.startsWith(value);
}

/**
 * Cut the server's text node at `at`, and give the rest to every claimed range
 * that holds the node. A range's node list is what its position reconciles
 * against once it is built, and the rest is the server's node as much as the
 * front is: left out, it reads as a node the client made and is moved.
 */
function split(node: Text, at: number): Text {
  const state = session();
  const rest = node.splitText(at);
  if (state !== null) {
    for (const range of state.taken) {
      if (range.parent !== node.parentNode) continue;
      const index = range.nodes.indexOf(node);
      if (index >= 0) range.nodes.splice(index + 1, 0, rest);
    }
  }
  return rest;
}

/**
 * Claim an element the compiler builds through `element()` rather than a template.
 *
 * `<html>`, `<head>` and `<body>` are the reason this exists: the parser strips
 * them out of a `<template>`, so the compiler cannot emit one for them and falls
 * back to `element()`. Until this function existed `element()` was
 * unconditionally `withoutClaim`, so a tree rooted at `<html>` claimed NOTHING —
 * measured as `claimed: 0` and then "Failed to execute 'appendChild' on 'Node':
 * Only one element on document allowed", the client having built a second
 * document beside the server's.
 *
 * `null` means "not hydrating, or nothing to claim" and the caller builds. A
 * node that IS there and disagrees is a mismatch, on the same terms as
 * `claimNode`'s — the walk below this point addresses the server's children, so
 * a wrong element here puts every binding under it on the wrong node.
 */
function claimElementWalk(tag: string): Element | null {
  const state = session();
  if (state === null) return null;
  const cursor = state.stack[state.stack.length - 1];
  if (cursor === undefined) return null;
  const node = cursor.next;
  if (node === null || node === cursor.end) return null;
  const expect = tag.toUpperCase();
  if (node.nodeType !== ELEMENT) return null;
  if (node.nodeName !== expect && node.nodeName.toUpperCase() !== expect) {
    throw new HydrationMismatch(
      "structure",
      `the server sent ${describe(node)} where the browser builds \`<${tag}>\``,
    );
  }
  cursor.next = node.nextSibling;
  state.claimed++;
  return node as Element;
}

/**
 * Run `body` with the cursor moved INSIDE `parent`.
 *
 * `claimElement` advances past the element it claimed, which is right for the
 * caller's own sequence and wrong for its children — they are claimed from
 * `parent`'s child list, not from the list the element sits in.
 */
export function withinElement<T>(parent: Element, body: () => T): T {
  const state = session();
  if (state === null) return body();
  state.stack.push({ parent, next: parent.firstChild, end: null });
  try {
    return body();
  } finally {
    state.stack.pop();
  }
}

/**
 * THE DETECTION, and it runs only in a build that asked for it.
 *
 * Claiming one node claims everything under it — the walk below is `child`/`sib`
 * over the server's own nodes — so if the server's subtree is not the template's
 * shape, every index below this point addresses something else and the bindings
 * land on the wrong elements. That is React's documented consequence of an
 * undetected mismatch, and without this check it is exactly what an EXTRA
 * element produces here: the walk indexes from both ends, so a node inserted in
 * the middle is invisible to it and survives into the hydrated page.
 *
 * Ranges contribute nothing, which is what makes this comparable at all: the
 * template has no node at a delimited hole and the server has a `<!--[-->` …
 * `<!--]-->` there.
 *
 * STATIC TEXT is compared as well as node names, and that is the compensation
 * owed for dropping the comments: an undelimited hole no longer leaves a
 * `<!--]-->` for `claimRange` to assert against, and two branch arms that
 * differ only in the words they print are structurally identical. Text that
 * came out of a HOLE is inside a range and is skipped; text that is here is
 * template bytes on both sides, from one compile, so a difference is a real
 * divergence rather than a normalisation artefact.
 *
 * O(subtree) per claim, which is exactly why the production build does not call
 * it. Silent failure is the dominant harm IN DEVELOPMENT, and this is where it
 * is answered.
 */
function verifySubtree(want: Node, have: Node, path: string): void {
  const wanted = want.childNodes;
  // An EMPTY template element says nothing about its contents, and there are
  // three reasons it can be empty: a hole lives there, a channel writes there
  // (`innerHTML`), or it is rawtext the tokenizer hands over whole. None of
  // those is a skeleton, so none of them is comparable, and asserting over them
  // would report `<div dangerouslySetInnerHTML>` as a mismatch on every page
  // that has one.
  if (wanted.length === 0) return;
  // Streamed rather than collected: this runs once per node of every claimed
  // subtree, and an array per element was the whole of the walk's allocation
  // cost. `logicalChildren` still exists for `child`/`sib`, which need random
  // access; this one only ever moves forward.
  let i = 0;
  let depth = 0;
  for (let node = have.firstChild; node !== null; node = node.nextSibling) {
    if (node.nodeType === COMMENT) {
      const data = (node as Comment).data;
      if (data.charAt(0) === OPEN) {
        depth++;
        continue;
      }
      if (data === CLOSE) {
        if (depth === 0) throw new HydrationMismatch("range", UNOPENED);
        depth--;
        continue;
      }
    }
    if (depth > 0) continue;
    const a = wanted[i];
    if (a === undefined) {
      throw new HydrationMismatch(
        "structure",
        `inside \`${path}\` the server sent ${describe(node)} where the browser builds ` +
          "nothing more",
      );
    }
    if (a.nodeName !== node.nodeName) {
      throw new HydrationMismatch(
        "structure",
        `at node ${i + 1} inside \`${path}\` the server sent ${describe(node)} where the ` +
          `browser builds ${describe(a)}`,
      );
    }
    if (node.nodeType === TEXT && (a as Text).data !== (node as Text).data) {
      throw new HydrationMismatch(
        "text",
        `at node ${i + 1} inside \`${path}\` the server sent ${describe(node)} where the ` +
          `browser builds ${describe(a)}`,
      );
    }
    verifySubtree(a, node, `${path} > ${a.nodeName.toLowerCase()}`);
    i++;
  }
  if (depth !== 0) {
    throw new HydrationMismatch("range", unclosed(depth));
  }
  if (i !== wanted.length) {
    throw new HydrationMismatch(
      "structure",
      `\`${path}\` holds ${i} node(s) from the server where the browser builds ` +
        `${wanted.length}`,
    );
  }
}

/**
 * Claim the range at a hole, THEN build the value that fills it.
 *
 * The compiler emits this around a hole whose value is an expression rather
 * than a thunk, because JavaScript evaluates `Comp(s, {})` before `insert` is
 * entered — so a component in a child position would otherwise claim its root
 * before anything had told it which hole it is in. The address is a compile-time
 * fact; this is where it is spent.
 *
 * `insert` claims the same range again a moment later, by the same
 * `(parent, anchor)`. That is a lookup and not a mutation, so the two agree by
 * construction rather than by a handshake.
 */
function holeWalk<T>(parent: Node | null, anchor: Node | null, build: () => T, mode?: number): T {
  if (!hydrating()) return build();
  // `null` is the compiler saying "this position has no address" — the fallback
  // element path. There is no RANGE to claim, but since `TAGGED` the build
  // itself may still claim: `element()` matches the server's node by tag name and
  // `withinElement` scopes the cursor to its children, so a `template()` further
  // down takes a node from the right list rather than the next position's.
  if (parent === null && anchor === null) {
    return ((mode ?? 0) & TAGGED) === 0 ? withoutClaim(build) : build();
  }
  const range = claimRange(parent, anchor, mode);
  // A hole in a tree the client built has nothing to claim, and its contents
  // must not claim either — otherwise the next `template()` inside it would
  // take a node belonging to a position further along the server's document.
  if (range === null) return withoutClaim(build);
  const { value, taken, held } = withRangeTaken(range, build);
  holeTaken = taken.length === 0 ? null : { parent: range.parent, close: range.close, taken, held };
  return value;
}

/**
 * What the build inside the last `hole` took in place, kept for the `insert`
 * that receives its value.
 *
 * A region claims the server's nodes where they stand and hands back nothing,
 * so the value that reaches `insert` says less than the build did: `[null]`
 * is both "nothing here" and "a branch adopted its range". Only the cursor
 * knows which, and it closed when `hole` returned.
 */
let holeTaken: ({ parent: Node; close: Comment | null } & Taken) | null = null;

/** What the `hole` at this range took, once: the next caller gets none. */
export function takenAtHole(range: Range): Taken {
  const last = holeTaken;
  holeTaken = null;
  return last !== null && last.parent === range.parent && last.close === range.close
    ? last
    : NONE_TAKEN;
}

const NONE_TAKEN: Taken = { taken: [], held: [] };

function describe(node: Node): string {
  if (node.nodeType === COMMENT) return `the comment \`<!--${(node as Comment).data}-->\``;
  if (node.nodeType === TEXT) return `the text ${JSON.stringify((node as Text).data)}`;
  return `\`<${node.nodeName.toLowerCase()}>\``;
}

const UNOPENED =
  "the server's markup has a closing marker `<!--]-->` with no opening `<!--[-->` before it";

function unclosed(depth: number): string {
  return (
    `the server's markup has ${depth} opening marker(s) \`<!--[-->\` with no closing ` +
    "`<!--]-->` after them"
  );
}

// ── the logical walk (H3) ────────────────────────────────────────────────
//
// The server's child list is the template's skeleton with a `<!--[-->` …
// `<!--]-->` range spliced in at every hole. A native sibling step counts every
// node in that range; a LOGICAL step counts the whole range as nothing, so the
// index the compiler computed against the template addresses the server's
// document unchanged.
//
// Both are O(children) rather than O(hops), and that is deliberate: correctness
// here is a property of the whole child list — where the ranges are — and a
// local step cannot see it. Nothing pays for it off the hydration path, because
// with no session live these two are the native property they replace.

function logicalChildren(parent: Node): Node[] {
  const out: Node[] = [];
  let depth = 0;
  for (let node = parent.firstChild; node !== null; node = node.nextSibling) {
    if (node.nodeType === COMMENT) {
      const data = (node as Comment).data;
      if (data.charAt(0) === OPEN) {
        depth++;
        continue;
      }
      if (data === CLOSE) {
        if (depth === 0) {
          throw new HydrationMismatch("range", UNOPENED);
        }
        depth--;
        continue;
      }
    }
    if (depth === 0) out.push(node);
  }
  if (depth !== 0) {
    throw new HydrationMismatch("range", unclosed(depth));
  }
  return out;
}

/**
 * `_$child(el, k)` — the k-th logical child, and `_$child(el, k, 1)` the k-th
 * from the END.
 */
export function child(parent: Node, k: number, back?: number): Node | null {
  if (!hydrating()) {
    let node = back === undefined ? parent.firstChild : parent.lastChild;
    for (let i = 0; i < k && node !== null; i++) {
      node = back === undefined ? node.nextSibling : node.previousSibling;
    }
    return node;
  }
  // Forward is streamed — the overwhelming case is `child(el, 0)` and it stops
  // at the first logical node. Backwards needs the count, so it collects.
  if (back === undefined) {
    let seen = 0;
    let depth = 0;
    for (let node = parent.firstChild; node !== null; node = node.nextSibling) {
      if (node.nodeType === COMMENT) {
        const data = (node as Comment).data;
        if (data.charAt(0) === OPEN) {
          depth++;
          continue;
        }
        if (data === CLOSE) {
          depth--;
          continue;
        }
      }
      if (depth > 0) continue;
      if (seen === k) return node;
      seen++;
    }
    throw new HydrationMismatch(
      "structure",
      `${describe(parent)} holds ${seen} node(s) from the server where the browser builds ` +
        `at least ${k + 1}`,
    );
  }
  const children = logicalChildren(parent);
  const node = children[children.length - 1 - k];
  if (node === undefined) {
    throw new HydrationMismatch(
      "structure",
      `${describe(parent)} holds ${children.length} node(s) from the server where the ` +
        `browser builds at least ${k + 1}`,
    );
  }
  return node;
}

/** `_$sib(el, k)` — k logical siblings on, and `_$sib(el, k, 1)` k back. */
export function sib(node: Node, k: number, back?: number): Node | null {
  if (!hydrating()) {
    let out: Node | null = node;
    for (let i = 0; i < k && out !== null; i++) {
      out = back === undefined ? out.nextSibling : out.previousSibling;
    }
    return out;
  }
  const parent = node.parentNode;
  if (parent === null) {
    throw new HydrationMismatch(
      "structure",
      `the browser reached ${describe(node)}, which is no longer in the document`,
    );
  }
  const children = logicalChildren(parent);
  const at = children.indexOf(node);
  if (at < 0) {
    throw new HydrationMismatch(
      "structure",
      `the server sent ${describe(node)} inside dynamic content where the browser builds it as ` +
        "static markup",
    );
  }
  const out = children[back === undefined ? at + k : at - k];
  if (out === undefined) {
    throw new HydrationMismatch(
      "structure",
      `the server's markup ends ${back === undefined ? "after" : "before"} ` +
        `${describe(node)} where the browser builds ${k} more node(s)`,
    );
  }
  return out;
}

// ── ranges ──────────────────────────────────────────────────────────────

/**
 * The range the server wrote at `(parent, anchor)` — the same pair the compiler
 * handed `insert` and the four primitives.
 *
 * A position's content ends immediately before its anchor, so the anchor's
 * previous sibling is that position's `<!--]-->`; with no anchor the position is
 * the last thing in its parent and the parent's last child is. Nothing searches:
 * if the comment is not exactly there, the client is not looking at the tree the
 * server serialised and says so.
 *
 * `mode` is the compiler's `WHOLE`: a hole that owns its parent's child list
 * was written with no comments at all.
 */
function claimRangeWalk(parent: Node | null, anchor: Node | null, mode?: number): Range | null {
  const state = session();
  const host = anchor !== null ? anchor.parentNode : parent;
  if (host === null) throw strayRange();
  // The position has to be somewhere the SERVER wrote. A parent the client just
  // built — `createElement`'s element, a template clone nothing claimed — is
  // detached from the container, and its children are the client's own with no
  // range to find. Returning `null` there is not a failure: it is the correct
  // answer to "what did the server put here", which is "this is not the
  // server's tree at all".
  if (state === null || !state.container.contains(host)) return null;
  // `WHOLE` is the compiler saying the string backend wrote this hole no
  // comments because it owns the element outright. The extent is then every
  // child of the parent, read off the document rather than off the wire.
  //
  // It is TOLD rather than sniffed, and the difference matters: "no `<!--]-->`
  // at the end, so it must be the whole list" would turn a corrupted wire into
  // a silently-accepted one, which is the exact shape of failure this file
  // exists to refuse.
  if (mode === WHOLE) {
    const nodes: Node[] = [];
    for (let node = firstClaimable(host); node !== null; node = node.nextSibling) nodes.push(node);
    return took({ open: null, close: null, parent: host, nodes });
  }
  const close = anchor !== null ? anchor.previousSibling : host.lastChild;
  if (close === null || close.nodeType !== COMMENT || (close as Comment).data !== CLOSE) {
    throw new HydrationMismatch(
      "range",
      `the browser expected a closing marker \`<!--]-->\` ` +
        `${anchor === null ? "at the end of" : `before ${describe(anchor)} inside`} ` +
        `${describe(host)} and found ${close === null ? "nothing" : describe(close)}`,
    );
  }
  let depth = 0;
  const nodes: Node[] = [];
  for (let node = close.previousSibling; node !== null; node = node.previousSibling) {
    if (node.nodeType === COMMENT) {
      const data = (node as Comment).data;
      if (data === CLOSE) depth++;
      else if (data.charAt(0) === OPEN) {
        if (depth === 0) {
          nodes.reverse();
          return took({ open: node as Comment, close: close as Comment, parent: host, nodes });
        }
        depth--;
      }
    }
    nodes.push(node);
  }
  throw new HydrationMismatch(
    "range",
    `a closing marker \`<!--]-->\` inside ${describe(host)} has no opening \`<!--[-->\` in ` +
      "the same element",
  );
}

function took(range: Range): Range {
  const state = session();
  if (state !== null) {
    // The container's own child list is where every page's value goes, not a
    // range the server wrote. Counted, it made a page nothing was reused from
    // read as one that claimed something, and `hydrate` never said so.
    if (range.open !== null || range.parent !== state.container) state.ranges++;
    state.taken.push(range);
  }
  return range;
}

/**
 * `claimRange`, plus the one position that has no `(parent, anchor)` to claim
 * against: a region that IS a unit root. The compiler hands those `(null, null)`
 * — there is no template around them to walk — so the range is the next thing at
 * the cursor, exactly as a `template()` call there would claim the next node.
 */
function claimAtWalk(parent: Node | null, anchor: Node | null, mode?: number): Range | null {
  const state = session();
  if (parent !== null || anchor !== null) return claimRange(parent, anchor, mode);
  if (state === null) throw noSession();
  const cursor = state.stack[state.stack.length - 1];
  if (cursor === undefined) {
    throw new HydrationMismatch(
      "range",
      "a component looked for server-rendered content in a part of the page that is being " +
        "built in the browser",
    );
  }
  // As in `claimNode`: text before the range belongs to a string beside it
  // that has not been made into a node yet. Held only once the range is
  // found, so a probe that finds none leaves the cursor as it was.
  let open = cursor.next;
  let stepped: Text[] | null = null;
  while (open !== null && open !== cursor.end && open.nodeType === 3) {
    (stepped ??= []).push(open as Text);
    open = open.nextSibling;
  }
  if (
    open === null ||
    open === cursor.end ||
    open.nodeType !== COMMENT ||
    (open as Comment).data.charAt(0) !== OPEN
  ) {
    throw new HydrationMismatch(
      "range",
      "the browser expected an opening marker `<!--[-->` at the root of a component and " +
        `found ${stepped !== null ? describe(stepped[0]) : open === null ? "nothing" : describe(open)}`,
    );
  }
  let depth = 0;
  const nodes: Node[] = [];
  for (let node = open.nextSibling; node !== null; node = node.nextSibling) {
    if (node.nodeType === COMMENT) {
      const data = (node as Comment).data;
      if (data.charAt(0) === OPEN) depth++;
      else if (data === CLOSE) {
        if (depth === 0) {
          if (stepped !== null) (cursor.held ??= []).push(...stepped);
          cursor.next = node.nextSibling;
          return took({
            open: open as Comment,
            close: node as Comment,
            parent: cursor.parent,
            nodes,
          });
        }
        depth--;
      }
    }
    nodes.push(node);
  }
  throw new HydrationMismatch(
    "range",
    "an opening marker `<!--[-->` at the root of a component has no closing `<!--]-->` after it",
  );
}

/**
 * `claimAt`, asking rather than requiring: `null` where a claim would have
 * thrown.
 *
 * The one legitimate third answer, and it is a question rather than a claim —
 * "did the server write a range at this position?" — asked by a construct that
 * has already decided to build cold and only wants to know whether there is
 * something to take away first. A `try`/`catch` around `claimAt` would be the
 * arm that swallows a mismatch, which this file does not have; this is a
 * separate entry point that does not raise one.
 */
function probeRangeWalk(parent: Node | null, anchor: Node | null): Range | null {
  try {
    return claimAt(parent, anchor);
  } catch (error) {
    if (error instanceof HydrationMismatch) return null;
    throw error;
  }
}

/**
 * The key the server wrote in `<!--[k-->`, or `null` when it wrote none.
 *
 * `null` is the ordinary answer in a PRODUCTION build: the key is on the
 * detection axis, so a production range is `<!--[-->` and the client claims it
 * positionally — which is exactly what a hole has always had, and what a key
 * with no safe comment spelling has always fallen back to.
 */
export function rangeKey(range: Range): string | null {
  const data = range.open?.data;
  return data !== undefined && data.length > 1 ? data.slice(1) : null;
}

/**
 * Give a claimed range back: the nodes go, the boundary comments stay.
 *
 * This is H4's recovery. The comments stay because the CLOSE is the anchor the
 * rebuilt content inserts before — throwing it away would make the position
 * unaddressable for every later update, which is the difference between "that
 * branch re-rendered" and "the page is now built on a different skeleton". An
 * undelimited range has no comments to keep and needs none: its anchor is the
 * end of its parent, which nothing can take away.
 */
export function releaseRange(range: Range): void {
  for (const node of range.nodes) node.parentNode?.removeChild(node);
  range.nodes.length = 0;
}

/** The anchor a rebuilt or claimed range writes against. */
export function rangeAnchor(range: Range): Node | null {
  return range.close;
}

export { MARKER, OPEN, CLOSE };

const WALK = {
  claimNode: claimNodeWalk,
  claimText: claimTextWalk,
  claimElement: claimElementWalk,
  withRangeTaken: withRangeTakenWalk,
  hole: holeWalk,
  claimRange: claimRangeWalk,
  claimAt: claimAtWalk,
  probeRange: probeRangeWalk,
};

/**
 * A claimed range as it stands, comments included.
 *
 * What a region that adopted the server's nodes hands its caller. The caller
 * places by identity, so nodes already in position cost nothing — and a value
 * that left them out read as "nothing here", which put a sibling built beside
 * them on the wrong side and reconciled the range's own comments away.
 */
export function rangeNodes(range: Range): Node[] {
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

/** The siblings from `from` up to, but not including, `to`. */
function spanBetween(from: Node | null, to: Node | null): Node[] {
  const out: Node[] = [];
  for (let node = from; node !== null && node !== to; node = node.nextSibling) out.push(node);
  return out;
}

function evict(nodes: readonly Node[]): void {
  for (const node of nodes) node.parentNode?.removeChild(node);
}

const CLAIM_WALK: ClaimWalk = {
  claimAt: claimAtWalk,
  claimRange: claimRangeWalk,
  probeRange: probeRangeWalk,
  claimLate,
  isScaffolding,
  rangeKey,
  releaseRange,
  openCursor,
  cursorRest,
  rangeNodes,
  spanBetween,
  evict,
};
