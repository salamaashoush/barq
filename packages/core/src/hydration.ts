/**
 * Claim-based hydration. `CODESIGN.md` §3.11, `SEMANTICS.md` H1–H4, H6.
 *
 * The client CLAIMS the server's nodes by walking them. Nothing is cleared,
 * nothing is replaced, and the walk that claims is the walk that would have
 * built — `child`/`sib` replace `.firstChild`/`.nextSibling` under `hydratable`
 * and address the same positions.
 *
 * THE WIRE FORMAT, which the compiler writes and this file reads:
 *
 *   <!--[-->  …  <!--]-->     a hole  (`Ssr::insert`, compile time)
 *   <!--[k--> …  <!--]-->     a range, `k` the branch key the server CHOSE
 *   <!--[--> … <!--]-->       one row of an `each`
 *   <!---->                   a skeleton marker, present on both sides
 *
 * §11 Q4 settled the trade: pay those bytes, get the recovery. The recovery is
 * the whole point — a mismatch must be DETECTED and degrade, because silent
 * success is the failure mode this class of framework is known for
 * (solid-start#1807 is titled "hydration fails silently without an error").
 *
 * So every claim below either succeeds or throws [`HydrationMismatch`], and
 * every catcher is one of exactly two:
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
 * A claimed range and the nodes inside it.
 *
 * `open` and `close` stay in the document: `close` is the anchor every later
 * write to this position uses, so removing it would cost the position its
 * identity the first time the value changed.
 */
export interface Range {
  open: Comment;
  close: Comment;
  nodes: Node[];
}

/** One cursor over a claimed sequence. `template()` pops from the innermost. */
interface Cursor {
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

export function beginHydration(container: Node): void {
  SESSION = {
    container,
    marked: hasRanges(container),
    stack: [{ parent: container, next: container.firstChild, end: null }],
    mismatches: [],
    claimed: 0,
    ranges: 0,
    built: 0,
  };
}

/**
 * Was this markup written by a `hydratable` build?
 *
 * One scan, at the start, and it is what lets a construct with no flag tell its
 * two situations apart. A module built without the flag over markup built
 * without it is ORDINARY — nothing was ever going to be claimed there, and
 * building cold is exactly right. The same module over markup built WITH it is a
 * deployment mistake, and a bad one: the client's walk is native, so it steps
 * onto a boundary comment and everything it addresses after that is off by an
 * unknown amount. That is not recoverable locally and must not be treated as if
 * it were.
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

/** Run `body` claiming from `range`'s interior. */
export function withRange<T>(range: Range, body: () => T): T {
  if (SESSION === null) return body();
  SESSION.stack.push({
    parent: range.open.parentNode ?? range.open,
    next: range.open.nextSibling,
    end: range.close,
  });
  try {
    return body();
  } finally {
    SESSION.stack.pop();
  }
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
export function claimNode(template: Node): Node | null {
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
  if (node.nodeName !== expect) {
    throw new HydrationMismatch(
      "structure",
      `the server wrote ${describe(node)} where the client builds <${expect.toLowerCase()}>`,
    );
  }
  verifySubtree(template, node, expect.toLowerCase());
  cursor.next = node.nextSibling;
  SESSION.claimed++;
  return node;
}

/**
 * The claimed subtree has the SKELETON the template has.
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
 * template has no node at a hole and the server has a `<!--[-->` … `<!--]-->`
 * there. Only the node NAMES are compared — the data inside a hole's neighbour
 * is the value's business, and `insert` reports a text drift on its own.
 *
 * O(subtree) per claim, and it exists only on the hydration path.
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
export function hole<T>(parent: Node | null, anchor: Node | null, build: () => T): T {
  if (!hydrating()) return build();
  // `null` is the compiler saying "this position has no address" — the fallback
  // element path, where the string backend serialised a whole subtree inline as
  // one value and there is no walk to claim it with.
  if (parent === null && anchor === null) return withoutClaim(build);
  const range = claimRange(parent, anchor);
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
 */
export function claimRange(parent: Node | null, anchor: Node | null): Range | null {
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
          return { open: node as Comment, close: close as Comment, nodes };
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
export function claimAt(parent: Node | null, anchor: Node | null): Range | null {
  if (parent !== null || anchor !== null) return claimRange(parent, anchor);
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
          return { open: open as Comment, close: node as Comment, nodes };
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

/** The key the server wrote in `<!--[k-->`, or `null` for an un-keyed range. */
export function rangeKey(range: Range): string | null {
  const data = range.open.data;
  return data.length > 1 ? data.slice(1) : null;
}

/**
 * The rows of a claimed `each`: the `<!--[-->` … `<!--]-->` ranges immediately
 * inside it, in order.
 */
export function claimRows(range: Range): Range[] {
  const rows: Range[] = [];
  let open: Comment | null = null;
  let nodes: Node[] = [];
  let depth = 0;
  let node: Node | null = range.open.nextSibling;
  while (node !== null && node !== range.close) {
    const next: Node | null = node.nextSibling;
    let counted = false;
    if (node.nodeType === COMMENT) {
      const data = (node as Comment).data;
      if (data.charAt(0) === OPEN) {
        if (depth === 0) {
          open = node as Comment;
          nodes = [];
        } else nodes.push(node);
        depth++;
        counted = true;
      } else if (data === CLOSE) {
        depth--;
        if (depth === 0 && open !== null) {
          rows.push({ open, close: node as Comment, nodes });
          open = null;
        }
        counted = true;
      }
    }
    if (!counted && depth > 0) nodes.push(node);
    node = next;
  }
  return rows;
}

/**
 * Give a claimed range back: the nodes go, the boundary comments stay.
 *
 * This is H4's recovery. The comments stay because the CLOSE is the anchor the
 * rebuilt content inserts before — throwing it away would make the position
 * unaddressable for every later update, which is the difference between "that
 * branch re-rendered" and "the page is now built on a different skeleton".
 */
export function releaseRange(range: Range): void {
  for (const node of range.nodes) node.parentNode?.removeChild(node);
  range.nodes.length = 0;
}

/** The anchor a rebuilt or claimed range writes against. */
export function rangeAnchor(range: Range): Node {
  return range.close;
}

export { MARKER, OPEN, CLOSE };
