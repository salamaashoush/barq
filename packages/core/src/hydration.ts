/**
 * Claim-based hydration. `CODESIGN.md` §3.11 and §12, `SEMANTICS.md` H1–H4, H6.
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
 * §12 REVERSED §11 Q4 on a measurement: the boundary comments cost 55.7% raw
 * and 7.3% gzipped on a 100-row page, and 7.3% on every page forever is
 * material. The split that replaces it is this: THE WIRE CARRIES WHAT RECOVERY
 * NEEDS AND NOTHING ELSE, and DETECTION is an emission axis that a dev build
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

/** What a mismatch was, for the report a caller can assert against. */
export type MismatchKind = "structure" | "range" | "key" | "text" | "portal" | "not-hydratable";

export interface Mismatch {
  kind: MismatchKind;
  detail: string;
}

/**
 * Thrown by every claim that cannot be satisfied. It is never caught by the
 * code that raised it: a region catches its own, `hydrate` catches the rest.
 */
export class HydrationMismatch extends Error {
  readonly kind: MismatchKind;
  constructor(kind: MismatchKind, detail: string) {
    super(`hydration mismatch (${kind}): ${detail}`);
    this.name = "HydrationMismatch";
    this.kind = kind;
  }
}

/**
 * The compiler's `WHOLE` (`ir/region.rs`): this position owns its parent
 * element's entire child list, so the server wrote it no boundary comments and
 * the claim is every child of the parent.
 *
 * ONE number for the two places it is spelled — a region carries it as a bit of
 * the flags integer both backends already take, and a hole carries it as
 * `insert`'s trailing argument. A hole has no flags integer and a region has no
 * spare argument, so the two spellings are unavoidable; the two VALUES are not.
 */
export const WHOLE = 1 << 4;

/**
 * The compiler's `TAGGED` (`ir/region.rs`): no range on the wire here, but the
 * build inside CAN claim — by tag name, because it is an `element()` call.
 *
 * A null address used to mean "build cold" unconditionally, which is what made
 * the whole `<html>`/`<head>`/`<body>` frame unhydratable: the parser strips
 * those out of a `<template>`, so they compile to `element()` and every one of
 * them took the cold path.
 */
export const TAGGED = 1 << 5;

/**
 * A claimed range and the nodes inside it.
 *
 * `open` and `close` stay in the document when they exist: `close` is the anchor
 * every later write to this position uses, so removing it would cost the
 * position its identity the first time the value changed. They are `null` for a
 * position that OWNS its parent's child list — there is nothing to remove and
 * nothing to anchor against, because appending to `parent` is already the right
 * answer for every later write.
 */
export interface Range {
  open: Comment | null;
  close: Comment | null;
  /** Where the range lives. The one field both shapes always have. */
  parent: Node;
  nodes: Node[];
}

/** One cursor over a claimed sequence. `template()` pops from the innermost. */
export interface Cursor {
  parent: Node;
  next: Node | null;
  /** Exclusive; `null` means "to the end of `parent`". */
  end: Node | null;
}

interface Session {
  container: Node;
  /** Whether the served markup carries range comments at all. */
  marked: boolean;
  stack: Cursor[];
  mismatches: Mismatch[];
  claimed: number;
  ranges: number;
  built: number;
}

let SESSION: Session | null = null;

/** True while a claim is live. Every hot path tests this and nothing else. */
export function hydrating(): boolean {
  return SESSION !== null && SESSION.stack.length > 0;
}

export function mismatches(): readonly Mismatch[] {
  return SESSION === null ? [] : SESSION.mismatches;
}

/**
 * Record a divergence that was RECOVERED rather than thrown.
 *
 * A text difference is the case: the server said one thing, the client another,
 * and writing the client's value through the claimed text node keeps the node
 * and fixes the content. It is still a divergence and still gets a row, because
 * "nothing was reported" has to mean "nothing diverged".
 */
export function report(kind: MismatchKind, detail: string): void {
  if (SESSION !== null) SESSION.mismatches.push({ kind, detail });
}

export interface HydrationReport {
  mismatches: readonly Mismatch[];
  /** Nodes taken from the server's markup. */
  claimed: number;
  /** Ranges taken from the server's markup. */
  ranges: number;
  /** Nodes the client built because it could not take one. */
  built: number;
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
  SESSION = {
    container,
    marked: hasRanges(container),
    stack: [{ parent: container, next: firstClaimable(container), end: null }],
    mismatches: [],
    claimed: 0,
    ranges: 0,
    built: 0,
  };
}

/**
 * Does this markup carry range comments?
 *
 * One scan, at the start, and it is what lets a construct with no flag tell its
 * two situations apart. A module built without the flag over markup built
 * without it is ORDINARY — nothing was ever going to be claimed there, and
 * building cold is exactly right. The same module over markup built WITH it is a
 * deployment mistake, and a bad one: the client's walk is native, so it steps
 * onto a boundary comment and everything it addresses after that is off by an
 * unknown amount. That is not recoverable locally and must not be treated as if
 * it were.
 *
 * `true` proves the markup is hydratable; `false` proves nothing. §12 took the
 * comments off every position whose extent the client can read off its parent,
 * so a hydratable page can now carry none at all. The caller uses it to choose
 * the wording of a diagnostic, which is all a one-way signal can carry.
 */
export function wireIsMarked(): boolean {
  return SESSION !== null && SESSION.marked;
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
  const session = SESSION;
  SESSION = null;
  if (session === null) return { mismatches: [], claimed: 0, ranges: 0, built: 0 };
  return {
    mismatches: session.mismatches,
    claimed: session.claimed,
    ranges: session.ranges,
    built: session.built,
  };
}

/**
 * Run `body` with the cursor suspended.
 *
 * A portal builds into a container the server never wrote at this position, and
 * a rebuilt branch builds nodes nobody may claim. Both need the ordinary client
 * path, and both are re-entrant with respect to the claim above them — hence a
 * stack rather than a flag.
 */
export function withoutClaim<T>(body: () => T): T {
  if (SESSION === null) return body();
  const stack = SESSION.stack;
  SESSION.stack = [];
  try {
    return body();
  } finally {
    SESSION.stack = stack;
  }
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
    next: range.open === null ? parent.firstChild : range.open.nextSibling,
    end: range.close,
  };
}

/** Run `body` claiming from `cursor`, which keeps whatever it consumed. */
export function atCursor<T>(cursor: Cursor, body: () => T): T {
  if (SESSION === null) return body();
  SESSION.stack.push(cursor);
  try {
    return body();
  } finally {
    SESSION.stack.pop();
  }
}

/** Whether `cursor` has anything left to claim. */
export function cursorAtEnd(cursor: Cursor): boolean {
  return cursor.next === null || cursor.next === cursor.end;
}

/** Everything `cursor` still holds, consumed. */
export function cursorRest(cursor: Cursor): Node[] {
  const rest: Node[] = [];
  for (let node = cursor.next; node !== null && node !== cursor.end; node = node.nextSibling) {
    rest.push(node);
  }
  cursor.next = cursor.end;
  return rest;
}

/** Run `body` claiming from `range`'s interior, once. */
export function withRange<T>(range: Range, body: () => T): T {
  if (SESSION === null) return body();
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
export function withRangeTaken<T>(range: Range, body: () => T): { value: T; taken: Node[] } {
  if (SESSION === null) return { value: body(), taken: [] };
  const all = range.nodes.slice();
  const cursor = openCursor(range);
  const value = atCursor(cursor, body);
  const rest = new Set<Node>(cursorRest(cursor));
  return { value, taken: all.filter((node) => !rest.has(node)) };
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
export function claimNode(template: Node, detect?: boolean): Node | null {
  if (SESSION === null) return null;
  const cursor = SESSION.stack[SESSION.stack.length - 1];
  if (cursor === undefined) return null;
  const expect = template.nodeName;
  const node = cursor.next;
  if (node === null || node === cursor.end) {
    throw new HydrationMismatch(
      "structure",
      `the server's markup ran out where the client expected <${expect.toLowerCase()}>`,
    );
  }
  // The ROOT name is compared in every build, and that is not a hedge on §12's
  // split: the template node is already the argument, so the comparison is one
  // string test at a claim that was happening anyway. What §12 moved off the
  // production path is the O(subtree) walk below it.
  if (node.nodeName !== expect) {
    throw new HydrationMismatch(
      "structure",
      `the server wrote ${describe(node)} where the client builds <${expect.toLowerCase()}>`,
    );
  }
  if (detect === true) verifySubtree(template, node, expect.toLowerCase());
  cursor.next = node.nextSibling;
  SESSION.claimed++;
  return node;
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
export function claimElement(tag: string): Element | null {
  if (SESSION === null) return null;
  const cursor = SESSION.stack[SESSION.stack.length - 1];
  if (cursor === undefined) return null;
  const node = cursor.next;
  if (node === null || node === cursor.end) return null;
  const expect = tag.toUpperCase();
  if (node.nodeType !== ELEMENT) return null;
  if (node.nodeName !== expect && node.nodeName.toUpperCase() !== expect) {
    throw new HydrationMismatch(
      "structure",
      `the server wrote ${describe(node)} where the client builds <${tag}>`,
    );
  }
  cursor.next = node.nextSibling;
  SESSION.claimed++;
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
  if (SESSION === null) return body();
  SESSION.stack.push({ parent, next: parent.firstChild, end: null });
  try {
    return body();
  } finally {
    SESSION.stack.pop();
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
 * §12 owes: an undelimited hole no longer leaves a `<!--]-->` for `claimRange`
 * to assert against, and two branch arms that differ only in the words they
 * print are structurally identical. Text that came out of a HOLE is inside a
 * range and is skipped; text that is here is template bytes on both sides, from
 * one compiler and one escaper, so a difference is a real divergence and not a
 * normalisation artefact.
 *
 * O(subtree) per claim — which is exactly why the production build does not
 * call it. §12: silent failure is the dominant harm IN DEVELOPMENT, and this is
 * where it is answered.
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
        if (depth === 0) throw new HydrationMismatch("range", "a range closed that never opened");
        depth--;
        continue;
      }
    }
    if (depth > 0) continue;
    const a = wanted[i];
    if (a === undefined) {
      throw new HydrationMismatch(
        "structure",
        `<${path}> has more nodes than the client's template — the server wrote ` +
          `${describe(node)} where the template ends`,
      );
    }
    if (a.nodeName !== node.nodeName) {
      throw new HydrationMismatch(
        "structure",
        `at ${path} child ${i}: the server wrote ${describe(node)} where the client builds ` +
          a.nodeName.toLowerCase(),
      );
    }
    if (node.nodeType === TEXT && (a as Text).data !== (node as Text).data) {
      throw new HydrationMismatch(
        "text",
        `at ${path} child ${i}: the server wrote ${JSON.stringify((node as Text).data)} where ` +
          `the client's template has ${JSON.stringify((a as Text).data)}`,
      );
    }
    verifySubtree(a, node, `${path} > ${a.nodeName.toLowerCase()}`);
    i++;
  }
  if (depth !== 0) {
    throw new HydrationMismatch("range", `${depth} range(s) opened and never closed`);
  }
  if (i !== wanted.length) {
    throw new HydrationMismatch(
      "structure",
      `<${path}> has ${i} node(s) where the client's template has ${wanted.length} — ` +
        "the server's tree is not the one this walk addresses",
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
export function hole<T>(
  parent: Node | null,
  anchor: Node | null,
  build: () => T,
  mode?: number,
): T {
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
  return range === null ? withoutClaim(build) : withRange(range, build);
}

/** A node the client had to build because no claim was possible. */
export function built(): void {
  if (SESSION !== null) SESSION.built++;
}

function describe(node: Node): string {
  if (node.nodeType === COMMENT) return `<!--${(node as Comment).data}-->`;
  if (node.nodeType === TEXT) return `the text ${JSON.stringify((node as Text).data)}`;
  return `<${node.nodeName.toLowerCase()}>`;
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
          throw new HydrationMismatch("range", "a range closed that never opened");
        }
        depth--;
        continue;
      }
    }
    if (depth === 0) out.push(node);
  }
  if (depth !== 0) {
    throw new HydrationMismatch("range", `${depth} range(s) opened and never closed`);
  }
  return out;
}

/**
 * `_$child(el, k)` — the k-th logical child, and `_$child(el, k, 1)` the k-th
 * from the END.
 */
export function child(parent: Node, k: number, back?: number): Node | null {
  if (SESSION === null || SESSION.stack.length === 0) {
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
      `no logical child ${k} of <${parent.nodeName.toLowerCase()}> — the server wrote ${seen}`,
    );
  }
  const children = logicalChildren(parent);
  const node = children[children.length - 1 - k];
  if (node === undefined) {
    throw new HydrationMismatch(
      "structure",
      `no logical child ${k} from the end of <${parent.nodeName.toLowerCase()}> — ` +
        `the server wrote ${children.length}`,
    );
  }
  return node;
}

/** `_$sib(el, k)` — k logical siblings on, and `_$sib(el, k, 1)` k back. */
export function sib(node: Node, k: number, back?: number): Node | null {
  if (SESSION === null || SESSION.stack.length === 0) {
    let out: Node | null = node;
    for (let i = 0; i < k && out !== null; i++) {
      out = back === undefined ? out.nextSibling : out.previousSibling;
    }
    return out;
  }
  const parent = node.parentNode;
  if (parent === null) {
    throw new HydrationMismatch("structure", "a logical sibling step from a detached node");
  }
  const children = logicalChildren(parent);
  const at = children.indexOf(node);
  if (at < 0) {
    throw new HydrationMismatch("structure", "a logical sibling step from inside a claimed range");
  }
  const out = children[back === undefined ? at + k : at - k];
  if (out === undefined) {
    throw new HydrationMismatch(
      "structure",
      `no logical sibling ${back === undefined ? "+" : "-"}${k} of ${describe(node)}`,
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
 * `mode` is the compiler's `WHOLE`, and it is the §12 half: a hole that owns its
 * parent's child list was written with no comments at all.
 */
export function claimRange(parent: Node | null, anchor: Node | null, mode?: number): Range | null {
  const host = anchor !== null ? anchor.parentNode : parent;
  if (host === null) {
    throw new HydrationMismatch("range", "a claim at a position with no parent");
  }
  // The position has to be somewhere the SERVER wrote. A parent the client just
  // built — `createElement`'s element, a template clone nothing claimed — is
  // detached from the container, and its children are the client's own with no
  // range to find. Returning `null` there is not a failure: it is the correct
  // answer to "what did the server put here", which is "this is not the
  // server's tree at all".
  if (SESSION === null || !SESSION.container.contains(host)) return null;
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
    for (let node = host.firstChild; node !== null; node = node.nextSibling) nodes.push(node);
    SESSION.ranges++;
    return { open: null, close: null, parent: host, nodes };
  }
  const close = anchor !== null ? anchor.previousSibling : host.lastChild;
  if (close === null || close.nodeType !== COMMENT || (close as Comment).data !== CLOSE) {
    throw new HydrationMismatch(
      "range",
      `expected <!--]--> before ${anchor === null ? "the end of " : ""}` +
        `<${host.nodeName.toLowerCase()}>, found ${close === null ? "nothing" : describe(close)}`,
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
          SESSION.ranges++;
          return { open: node as Comment, close: close as Comment, parent: host, nodes };
        }
        depth--;
      }
    }
    nodes.push(node);
  }
  throw new HydrationMismatch("range", "a <!--]--> whose <!--[--> is not in the same parent");
}

/**
 * `claimRange`, plus the one position that has no `(parent, anchor)` to claim
 * against: a region that IS a unit root. The compiler hands those `(null, null)`
 * — there is no template around them to walk — so the range is the next thing at
 * the cursor, exactly as a `template()` call there would claim the next node.
 */
export function claimAt(parent: Node | null, anchor: Node | null, mode?: number): Range | null {
  if (parent !== null || anchor !== null) return claimRange(parent, anchor, mode);
  if (SESSION === null) throw new HydrationMismatch("range", "a claim outside a hydration");
  const cursor = SESSION.stack[SESSION.stack.length - 1];
  if (cursor === undefined) throw new HydrationMismatch("range", "a claim with no cursor");
  const open = cursor.next;
  if (
    open === null ||
    open === cursor.end ||
    open.nodeType !== COMMENT ||
    (open as Comment).data.charAt(0) !== OPEN
  ) {
    throw new HydrationMismatch(
      "range",
      `expected <!--[--> at a root region, found ${open === null ? "nothing" : describe(open)}`,
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
          cursor.next = node.nextSibling;
          SESSION.ranges++;
          return {
            open: open as Comment,
            close: node as Comment,
            parent: cursor.parent,
            nodes,
          };
        }
        depth--;
      }
    }
    nodes.push(node);
  }
  throw new HydrationMismatch("range", "a <!--[--> at a root region that never closed");
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
export function probeRange(parent: Node | null, anchor: Node | null): Range | null {
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
 * `null` is the ordinary answer in a PRODUCTION build: §12 moved the key onto
 * the detection axis, so a production range is `<!--[-->` and the client claims
 * it positionally — which is exactly what a hole has always had, and what a key
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
