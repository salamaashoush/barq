/**
 * A renderer over any tree of nodes a host can create and arrange.
 *
 * `@barqjs/core` owns control flow and decides when a range of nodes changes;
 * this file is the node layer under it, written against `HostOps` instead of
 * the document: the `RangeHost` control flow writes through, the list reorder
 * `each` hands it, and the entry points compiled code calls.
 */

import {
  type BoundaryKind,
  type COUNT,
  type JSXElement,
  type Maybe,
  type RevealOrder,
  type Scope,
  createEffect,
  getOwner,
  isBlock,
  NotReadyError,
  onCleanup,
  ownRange,
  readSlot,
  rootScope,
  runWithOwner,
  untrack,
} from "@barqjs/core";
import type { Block, Cell } from "@barqjs/core";
import {
  CONTEXT_MISS,
  LIVE_EDGES,
  LIVE_ROWS,
  NOTHING,
  activate,
  boundaryIn,
  branchIn,
  cellSlot,
  disposeScope,
  eachIn,
  effectUnder,
  flushMount,
  internalMemo,
  isNodes,
  islandIn,
  jsxAsValue,
  longestIncreasingSubsequence,
  lookupContext,
  nextActivation,
  offerDefaultHost,
  provideHost,
  provideOn,
  revealIn,
  standingRow,
  standingRows,
  teardown,
  underScope,
  withoutClaim,
  type RangeHost,
  type Row,
  type Site,
  type SyncRows,
} from "@barqjs/core/internal";

/**
 * What a host gives the renderer. `N` is the host's node; the renderer never
 * looks inside one.
 *
 * `insertNode` MOVES a node that already has a parent, the way the document's
 * `insertBefore` does: a reorder is an insert of a node that is already in
 * the tree, and the renderer never removes it first.
 */
export interface HostOps<N extends object> {
  createElement(tag: string): N;
  createTextNode(value: string): N;
  replaceText(node: N, value: string): void;
  isTextNode(node: N): boolean;
  /** `prev` is the value this name was last set to on this node, `undefined` the first time. */
  setProperty(node: N, name: string, value: unknown, prev: unknown): void;
  /** Put `node` under `parent` before `anchor`, or last when `anchor` is `null`. */
  insertNode(parent: N, node: N, anchor: N | null): void;
  removeNode(parent: N, node: N): void;
  getParentNode(node: N): N | null | undefined;
  getFirstChild(node: N): N | null | undefined;
  getNextSibling(node: N): N | null | undefined;
  /** A node that renders nothing, to anchor a range against. Defaults to an empty text node. */
  createSentinel?(): N;
  /**
   * A detached node that holds children, for content built while it is not
   * shown: a `<Loading>` boundary's body while its fallback stands, or a range
   * built before anything placed it. Defaults to `createElement("#container")`.
   */
  createContainer?(): N;
  /**
   * Hand a `ref` what it should hold for `node`, in place of the node itself.
   * A host whose node stands for an object it builds later (once a property
   * the object's constructor needs has arrived) calls `deliver` with that
   * object when it exists and again each time it is replaced, and returns the
   * function that stops delivering. Without it a ref is handed the node, once.
   */
  attachRef?(node: N, deliver: (value: unknown) => void): () => void;
  /**
   * Told once a batch of inserts under `parent` is done: the nodes a list
   * placed, a hole filled, a range moved. A host that keeps its own order of
   * children cheaply by appending during the batch puts them in order here,
   * so nothing reads them in the wrong order.
   */
  placed?(parent: N): void;
}

/** What `render` accepts besides the tree and the node it is mounted into. */
export interface RenderOptions {
  /** Parents the root, so the tree reads that owner's contexts and is disposed with it. */
  readonly owner?: Scope | null;
  readonly renderId?: string;
}

export interface PortalProps<N extends object> {
  /** The node the children mount into. Defaults to the node the tree was rendered into. */
  mount?: N | null | (() => N | null | undefined);
  children: unknown;
}

/** What a `dynamic` source may answer with: a tag name or a function of one props object. */
export type DynamicTag = string | ((props: never) => unknown);

export type Spreadable = Record<string, unknown> | (() => Record<string, unknown>);

/**
 * What `createRenderer` returns. Every member is a function of its arguments
 * alone, so a renderer module destructures them into its exports.
 */
export interface Renderer<N extends object> {
  /**
   * Build `code` under a new root and put what it renders into `root`. The
   * returned function disposes the root and removes what it placed.
   */
  render: (code: (() => JSXElement) | JSXElement, root: N, options?: RenderOptions) => () => void;
  createElement: (tag: string) => N;
  createTextNode: (value: string) => N;
  insertNode: (parent: N, node: N, anchor?: N | null) => void;
  /** Writes one property and returns `value`, so a binding can keep it as its previous value. */
  setProp: <T>(node: N, name: string, value: T, prev?: unknown) => T;
  insert: (parent: N, value: unknown, anchor?: N | null) => void;
  spread: (node: N, props: Spreadable, later?: readonly string[]) => void;
  branch: <K>(
    parent: N | null,
    anchor: N | null,
    key: Cell<K>,
    bodies: Block<unknown> | readonly (Block<unknown> | null | undefined)[],
    flags?: number,
  ) => N | N[] | null;
  each: <T>(
    parent: N | null,
    anchor: N | null,
    src: Cell<Maybe<readonly T[]>> | Cell<number>,
    carrier: ((item: T) => unknown) | false | null | typeof COUNT | Cell<unknown>,
    row: Block<unknown, never[]>,
    flags?: number,
    fallback?: Block<unknown> | null,
  ) => N | N[] | null;
  boundary: (
    parent: N | null,
    anchor: N | null,
    kind: BoundaryKind,
    fallback: Block<unknown> | null | undefined,
    body: Block<unknown>,
    flags?: number,
    on?: Cell<unknown>,
  ) => N | N[] | null;
  island: (parent: N | null, anchor: N | null, block: Block<unknown>, flags?: number) => N | null;
  reveal: (
    order: Cell<RevealOrder | undefined>,
    collapsed: Cell<boolean | undefined>,
    block: Block<unknown>,
  ) => N[];
  portal: (target: Cell<N | null | undefined>, block: Block<unknown>, flags?: number) => N;
  /** Solid 2.0's factory for a component chosen at run time: a tag name or a component. */
  dynamic: (
    source: () => DynamicTag | null | undefined | false,
  ) => (props: Record<string, unknown>) => JSXElement;
  Portal: (props: PortalProps<N>) => JSXElement;
  /** The host control flow writes through, for a construct written by hand. */
  host: RangeHost<N>;
  /** The list reorder `each` hands control flow, over the same operations. */
  syncRows: SyncRows<N>;
}

const NO_ARGS: readonly unknown[] = [];

/** The node a tree was rendered into, for a portal that names no target. */
const RENDER_ROOT: unique symbol = Symbol("render-root");

/** What a live hole resolved to: text it writes through, or the nodes it owns. */
type Resolved<N> = string | number | N[];

const UNRESOLVED: unique symbol = Symbol("barq-unresolved");

/** A child that is neither a node, a function, an array nor nothing: text. */
function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return typeof value === "symbol" ? value.toString() : "";
}

export function createRenderer<N extends object>(ops: HostOps<N>): Renderer<N> {
  const isTextNode = (node: N): boolean => ops.isTextNode(node);
  const removeNode = (parent: N, node: N): void => ops.removeNode(parent, node);
  const setProperty = (node: N, name: string, value: unknown, prev: unknown): void =>
    ops.setProperty(node, name, value, prev);
  const createSentinel =
    ops.createSentinel === undefined ? () => createTextNode("") : () => ops.createSentinel!();
  const createContainer =
    ops.createContainer === undefined
      ? () => ops.createElement("#container")
      : () => ops.createContainer!();
  const attachRef =
    ops.attachRef === undefined
      ? undefined
      : (node: N, deliver: (value: unknown) => void) => ops.attachRef!(node, deliver);
  const placed =
    ops.placed === undefined ? (_parent: N): void => {} : (parent: N) => ops.placed!(parent);

  // The text each text node was created with or last set to. The host has no
  // operation to read it back, and a hole that rewrites the same string keeps
  // its node only if the comparison can be made here.
  const texts = new WeakMap<N, string>();
  const parks = new WeakSet<N>();
  // A container's children leave it when it is placed. Read twice, it answers
  // with what it held, as a document fragment's drained content is kept.
  const drained = new WeakMap<N, N[]>();

  function createTextNode(value: string): N {
    const node = ops.createTextNode(value);
    texts.set(node, value);
    return node;
  }

  function writeText(node: N, value: string): void {
    if (texts.get(node) === value) return;
    ops.replaceText(node, value);
    texts.set(node, value);
  }

  function parentOf(node: N): N | null {
    return ops.getParentNode(node) ?? null;
  }

  function nextOf(node: N): N | null {
    return ops.getNextSibling(node) ?? null;
  }

  function firstOf(parent: N): N | null {
    return ops.getFirstChild(parent) ?? null;
  }

  function insertNode(parent: N, node: N, anchor: N | null = null): void {
    ops.insertNode(parent, node, anchor);
  }

  function detach(node: N): void {
    const parent = parentOf(node);
    if (parent !== null) removeNode(parent, node);
  }

  /** `insertNode` that does nothing when the node is already there. */
  function place(parent: N, node: N, before: N | null): void {
    if (parentOf(node) === parent && nextOf(node) === before) return;
    insertNode(parent, node, before);
  }

  function park(): N {
    const node = createContainer();
    parks.add(node);
    return node;
  }

  function drain(container: N): N[] {
    const first = firstOf(container);
    if (first === null) return drained.get(container)?.slice() ?? [];
    const nodes: N[] = [];
    for (let node: N | null = first; node !== null; node = nextOf(node)) nodes.push(node);
    for (const node of nodes) removeNode(container, node);
    drained.set(container, nodes);
    return nodes.slice();
  }

  // ==========================================================================
  // Children into nodes
  // ==========================================================================

  /**
   * A Block is a construction and runs untracked. One that suspends is run
   * again tracked: nothing was built and an untracked read registered nothing,
   * so the position could never wake.
   */
  function buildChild(value: (owner: unknown) => unknown, owner: Scope | null): unknown {
    if (!isBlock(value)) return value(owner);
    try {
      return untrack(() => value(owner));
    } catch (error) {
      if (!(error instanceof NotReadyError)) throw error;
      return value(owner);
    }
  }

  /** What a Cell comes to once every Cell it yields has been read as well. */
  function yielded(value: unknown, owner: Scope | null): unknown {
    while (typeof value === "function" && !isBlock(value)) {
      value = (value as (owner: unknown) => unknown)(owner);
    }
    return value;
  }

  function toNodes(child: unknown, scope: Scope | null): N[] {
    if (child === null || child === undefined || typeof child === "boolean") return [];
    if (typeof child === "function") {
      if (!isBlock(child)) return liveHole(child as (owner: unknown) => unknown, scope);
      return toNodes(buildChild(child as (owner: unknown) => unknown, scope), scope);
    }
    if (Array.isArray(child)) {
      const nodes: N[] = [];
      for (let i = 0; i < child.length; i++) {
        const inner = toNodes(child[i], scope);
        for (let j = 0; j < inner.length; j++) nodes.push(inner[j]);
      }
      return nodes;
    }
    if (typeof child === "object") {
      return parks.has(child as N) ? drain(child as N) : [child as N];
    }
    return [createTextNode(asText(child))];
  }

  /**
   * Flatten a child to nodes for a hole that already holds `prev`, reusing a
   * text node at the same position whose text is unchanged.
   */
  function normalize(value: unknown, prev: readonly N[], scope: Scope | null): N[] {
    const out: N[] = [];
    const visit = (child: unknown): void => {
      if (child === null || child === undefined || typeof child === "boolean") return;
      if (typeof child === "function") {
        if (isBlock(child)) {
          visit(buildChild(child as (owner: unknown) => unknown, scope));
          return;
        }
        for (const node of liveHole(child as (owner: unknown) => unknown, scope)) out.push(node);
        return;
      }
      if (Array.isArray(child)) {
        for (let i = 0; i < child.length; i++) visit(child[i]);
        return;
      }
      if (typeof child === "object") {
        if (parks.has(child as N)) {
          for (const node of drain(child as N)) out.push(node);
        } else {
          out.push(child as N);
        }
        return;
      }
      const text = asText(child);
      const candidate = prev[out.length];
      if (candidate !== undefined && isTextNode(candidate) && texts.get(candidate) === text) {
        out.push(candidate);
      } else {
        out.push(createTextNode(text));
      }
    };
    visit(value);
    return out;
  }

  /**
   * A Cell that is not the whole value of a hole: one entry of a children
   * array, or a body with no element around it. It gets an effect and a text
   * node of its own, so it updates where it stands without anything around it
   * being asked again. The text node is the value when the value is text, and
   * the edge its nodes are placed before when it is not.
   */
  function liveHole(cell: (owner: unknown) => unknown, given: Scope | null): N[] {
    let tail: N | null = null;
    let current: N[] = [];
    let initial = UNRESOLVED as Resolved<N> | typeof UNRESOLVED;
    let written = false;
    let standing = false;

    const write = (resolved: Resolved<N>): void => {
      if (typeof resolved !== "object") {
        const text = String(resolved);
        if (tail === null) {
          tail = createTextNode(text);
          return;
        }
        if (current.length > 0) {
          removeAll(current);
          current = [];
        }
        writeText(tail, text);
        return;
      }
      if (tail === null) {
        tail = createTextNode("");
        current = resolved;
        return;
      }
      writeText(tail, "");
      const parent = parentOf(tail);
      current = parent === null ? resolved : placeInsert(parent, resolved, current, tail);
    };

    effectUnder<Resolved<N>>(
      given,
      "insert",
      () => {
        const owner = getOwner();
        const resolved = resolve(yielded(cell(owner), owner), current, given);
        if (!standing) initial = resolved;
        return resolved;
      },
      (resolved) => {
        if (!standing) {
          written = true;
          return;
        }
        const first = resolved === initial;
        initial = UNRESOLVED;
        if (!first) write(resolved);
      },
    );
    standing = true;
    const took = initial;
    if (written) initial = UNRESOLVED;
    if (took !== UNRESOLVED) write(took);
    const edge: N = tail ?? createTextNode("");
    LIVE_EDGES.add(edge);
    return current.length === 0 ? [edge] : [...current, edge];
  }

  function resolve(value: unknown, current: readonly N[], scope: Scope | null): Resolved<N> {
    if (typeof value === "string" || typeof value === "number") return value;
    return normalize(value, current, scope);
  }

  // ==========================================================================
  // Placing a hole's nodes
  // ==========================================================================

  function removeAll(nodes: readonly N[]): void {
    for (let i = 0; i < nodes.length; i++) detach(nodes[i]);
  }

  /**
   * Put `value` into `parent` in place of `current`, before `marker`, and
   * return what the hole holds now.
   */
  function placeInsert(parent: N, value: Resolved<N>, current: N[], marker: N | null): N[] {
    let next: N[];
    if (typeof value === "string" || typeof value === "number") {
      const text = String(value);
      if (current.length === 1 && isTextNode(current[0])) {
        writeText(current[0], text);
        return current;
      }
      next = [createTextNode(text)];
    } else {
      next = value;
    }
    if (current.length === 0) {
      for (let i = 0; i < next.length; i++) insertNode(parent, next[i], marker);
      placed(parent);
      return next;
    }
    if (next.length === 0) {
      removeAll(current);
      return [];
    }
    const into = parentOf(current[0]) ?? parent;
    reconcile(into, current, next, marker);
    placed(into);
    return next;
  }

  /**
   * Reconcile two node arrays by identity: common prefix and suffix, the swap
   * of two ends, then a map of what is left. Adapted from udomdiff, as the
   * document renderer's is.
   */
  function reconcile(parent: N, a: N[], b: N[], after: N | null): void {
    const bLength = b.length;
    let aEnd = a.length;
    let bEnd = bLength;
    let aStart = 0;
    let bStart = 0;
    let map: Map<N, number> | null = null;

    while (aStart < aEnd || bStart < bEnd) {
      if (a[aStart] === b[bStart]) {
        aStart++;
        bStart++;
        continue;
      }
      while (a[aEnd - 1] === b[bEnd - 1]) {
        aEnd--;
        bEnd--;
      }
      if (aEnd === aStart) {
        const anchor = bEnd < bLength ? (bStart ? nextOf(b[bStart - 1]) : b[bEnd - bStart]) : after;
        while (bStart < bEnd) insertNode(parent, b[bStart++], anchor);
      } else if (bEnd === bStart) {
        while (aStart < aEnd) {
          if (!map || !map.has(a[aStart])) detach(a[aStart]);
          aStart++;
        }
      } else if (a[aStart] === b[bEnd - 1] && b[bStart] === a[aEnd - 1]) {
        const node = nextOf(a[--aEnd]);
        insertNode(parent, b[bStart++], nextOf(a[aStart++]));
        insertNode(parent, b[--bEnd], node);
        a[aEnd] = b[bEnd];
      } else {
        if (!map) {
          map = new Map();
          for (let i = bStart; i < bEnd; i++) map.set(b[i], i);
        }
        const index = map.get(a[aStart]);
        if (index === undefined) {
          detach(a[aStart++]);
        } else if (index < bStart || index >= bEnd) {
          aStart++;
        } else {
          let sequence = 1;
          let t: number | undefined;
          while (
            aStart + sequence < aEnd &&
            (t = map.get(a[aStart + sequence])) !== undefined &&
            t === index + sequence
          ) {
            sequence++;
          }
          if (sequence > index - bStart) {
            const node = a[aStart];
            while (bStart < index) insertNode(parent, b[bStart++], node);
          } else {
            const replaced = a[aStart++];
            insertNode(parent, b[bStart++], replaced);
            removeNode(parent, replaced);
          }
        }
      }
    }
  }

  // ==========================================================================
  // The host control flow writes through
  // ==========================================================================

  /**
   * What a list row of these nodes stands on. A row holding a live edge is
   * given a node to start at, so it is read off the tree as it stands when it
   * moves rather than as it was built.
   */
  function asRow(nodes: N[]): N[] {
    for (let i = 0; i < nodes.length; i++) {
      if (!LIVE_EDGES.has(nodes[i])) continue;
      const row = [createSentinel(), ...nodes];
      LIVE_ROWS.add(row);
      return row;
    }
    return nodes;
  }

  const host: RangeHost<N> = {
    sentinel: createSentinel,
    park,
    isPark: (node) => parks.has(node),
    parentOf,
    nextOf,
    prevOf(node) {
      const parent = parentOf(node);
      if (parent === null) return null;
      let previous: N | null = null;
      for (let at = firstOf(parent); at !== null && at !== node; at = nextOf(at)) previous = at;
      return previous;
    },
    firstOf,
    lastOf(parent) {
      let last: N | null = null;
      for (let at = firstOf(parent); at !== null; at = nextOf(at)) last = at;
      return last;
    },
    row: asRow,
    toNodes,
    insertRange(parent, nodes, before) {
      let anchor = before;
      for (let i = nodes.length; i--;) {
        place(parent, nodes[i], anchor);
        anchor = nodes[i];
      }
      placed(parent);
    },
    removeRange: removeAll,
  };

  // ==========================================================================
  // The list reorder
  // ==========================================================================

  function rowFirst(row: Row<N>): N | undefined {
    return isNodes(row) ? row[0] : row;
  }

  function nodesOf(row: Row<N>): readonly N[] {
    return isNodes(row) ? standingRow(host, row) : [row];
  }

  /**
   * One list update. The rows both lists start and end with stay where they
   * are, two ends that traded places are two moves, and what is left is
   * placed against the longest run that already stands in order.
   */
  const syncRows: SyncRows<N> = (parent, anchor, current, next) => {
    const shared = Math.min(current.length, next.length);
    let head = 0;
    while (head < shared && current[head] === next[head]) head++;
    let was = current.length;
    let now = next.length;
    while (was > head && now > head && current[was - 1] === next[now - 1]) {
      was--;
      now--;
    }
    while (
      was - head > 1 &&
      now - head > 1 &&
      current[head] === next[now - 1] &&
      next[head] === current[was - 1] &&
      swapEnds(parent, current[head], current[was - 1])
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
      if (arriving.length === 0) {
        removeAll(standingRows(host, leaving));
      } else {
        const kept = new Set(arriving);
        for (const row of leaving) {
          if (!kept.has(row)) removeAll(nodesOf(row));
        }
      }
    }

    if (arriving.length > 0) {
      let after = anchor;
      for (let i = now; i < next.length; i++) {
        const lead = rowFirst(next[i]);
        if (lead === undefined) continue;
        after = lead;
        break;
      }
      orderRows(parent, after, leaving, arriving);
    }
    placed(parent);
  };

  function swapEnds(parent: N, low: Row<N>, high: Row<N>): boolean {
    const lowNodes = nodesOf(low);
    const highNodes = nodesOf(high);
    if (lowNodes.length === 0 || highNodes.length === 0) return false;
    const afterHigh = nextOf(highNodes[highNodes.length - 1]);
    const lowFirst = lowNodes[0];
    for (let i = 0; i < highNodes.length; i++) insertNode(parent, highNodes[i], lowFirst);
    for (let i = 0; i < lowNodes.length; i++) insertNode(parent, lowNodes[i], afterHigh);
    return true;
  }

  function orderRows(
    parent: N,
    anchor: N | null,
    previous: readonly Row<N>[],
    next: readonly Row<N>[],
  ): void {
    if (previous.length === 0) {
      let before = anchor;
      for (let i = next.length - 1; i >= 0; i--) {
        const row = nodesOf(next[i]);
        for (let j = row.length - 1; j >= 0; j--) {
          place(parent, row[j], before);
          before = row[j];
        }
      }
      return;
    }

    const previousIndex = new Map<Row<N>, number>();
    for (let i = 0; i < previous.length; i++) previousIndex.set(previous[i], i);
    const sources: number[] = new Array(next.length);
    for (let i = 0; i < next.length; i++) sources[i] = previousIndex.get(next[i]) ?? -1;
    const lis = longestIncreasingSubsequence(sources.filter((source) => source !== -1));

    let lisIndex = lis.length - 1;
    let before: N | null = anchor;
    for (let i = next.length - 1; i >= 0; i--) {
      const row = next[i];
      const first = rowFirst(row);
      if (first === undefined) continue;
      if (sources[i] !== -1 && lisIndex >= 0 && lis[lisIndex] === sources[i]) {
        lisIndex--;
      } else {
        // First to last, each before the same node, keeps a row of several
        // nodes in its own order.
        const nodes = nodesOf(row);
        for (let j = 0; j < nodes.length; j++) insertNode(parent, nodes[j], before);
      }
      before = first;
    }
  }

  // ==========================================================================
  // What compiled code calls
  // ==========================================================================

  function insert(parent: N, value: unknown, marker?: N | null): void {
    const given = getOwner();
    const anchor = marker ?? null;
    if (typeof value === "function" && isBlock(value)) {
      value = buildChild(value as (owner: unknown) => unknown, given);
      if (typeof value === "function") {
        insert(parent, value, marker);
        return;
      }
    }
    if (typeof value === "function") {
      insertLive(parent, value as (owner: unknown) => unknown, anchor, given);
      return;
    }
    if (value === null || value === undefined || typeof value === "boolean") return;
    const nodes = toNodes(value, given);
    for (let i = 0; i < nodes.length; i++) insertNode(parent, nodes[i], anchor);
    placed(parent);
  }

  function insertLive(
    parent: N,
    value: (owner: unknown) => unknown,
    anchor: N | null,
    given: Scope | null,
  ): void {
    let current: N[] = [];
    effectUnder<Resolved<N>>(
      given,
      "insert",
      () => {
        const owner = getOwner();
        return resolve(yielded(buildChild(value, owner), owner), current, given);
      },
      (resolved) => {
        current = placeInsert(parent, resolved, current, anchor);
      },
    );
  }

  function setProp<T>(node: N, name: string, value: T, prev?: unknown): T {
    if (name === "ref") {
      ref(node, value);
      return value;
    }
    setProperty(node, name, value, prev);
    return value;
  }

  function refuseBlock(target: unknown, origin: string, returned = false): void {
    if (isBlock(target)) throw jsxAsValue(origin, returned);
  }

  /**
   * A ref registration owned by the scope the node belongs to: a callback that
   * returns a function has it run when that scope goes.
   */
  function ref(node: N, value: unknown): void {
    const owner = getOwner();
    const undo: (() => void)[] = [];
    const one = (target: unknown): void => {
      refuseBlock(target, "A `ref`");
      if (typeof target === "function") {
        if (attachRef === undefined) {
          const back: unknown = target(node);
          refuseBlock(back, "A `ref`", true);
          if (typeof back === "function") undo.push(back as () => void);
          return;
        }
        let release: (() => void) | undefined;
        const stop = attachRef(node, (held) => {
          release?.();
          const back: unknown = target(held);
          refuseBlock(back, "A `ref`", true);
          release = typeof back === "function" ? (back as () => void) : undefined;
        });
        undo.push(() => {
          stop();
          release?.();
        });
      } else if (typeof target === "object" && target !== null && "current" in target) {
        if (attachRef === undefined) {
          target.current = node;
          return;
        }
        undo.push(
          attachRef(node, (held) => {
            target.current = held;
          }),
        );
      }
    };
    if (Array.isArray(value)) {
      for (const target of value) one(target);
    } else {
      one(value);
    }
    if (undo.length === 0 || owner === null) return;
    underScope(owner, "ref", () => {
      onCleanup(() => {
        for (const fn of undo) fn();
      });
    });
  }

  const isHandlerKey = (key: string): boolean =>
    key.charCodeAt(0) === 111 && key.charCodeAt(1) === 110;

  /**
   * A props object onto a node, diffed against what was last applied, with a
   * property that vanished set to `undefined`. A getter is read in the
   * tracked half, so the write half sees values only; a handler and a `ref`
   * are functions that are not getters and pass through as they are.
   * `children` is not a property: the element's own children are placed by
   * whoever built it.
   */
  function spread(node: N, props: Spreadable, later?: readonly string[]): void {
    const given = getOwner();
    const applied: Record<string, unknown> = {};
    let first = true;

    const read = (): Record<string, unknown> => {
      const next = typeof props === "function" ? props() : props;
      const resolved: Record<string, unknown> = {};
      for (const key in next) {
        if (key === "children") continue;
        if (later !== undefined && later.includes(key)) continue;
        const value = next[key];
        if (key === "ref" || isHandlerKey(key)) {
          resolved[key] = value;
          continue;
        }
        refuseBlock(value, `The \`${key}\` prop in a spread`);
        resolved[key] = typeof value === "function" ? (value as () => unknown)() : value;
      }
      return resolved;
    };

    effectUnder<Record<string, unknown>>(given, "spread", read, (next) => {
      for (const key in applied) {
        if (key in next) continue;
        setProperty(node, key, undefined, applied[key]);
        delete applied[key];
      }
      for (const key in next) {
        const value = next[key];
        if (key === "ref") {
          if (first) runWithOwner(given, () => ref(node, value));
          continue;
        }
        if (key in applied && applied[key] === value) continue;
        setProperty(node, key, value, applied[key]);
        applied[key] = value;
      }
      first = false;
    });
  }

  /** One element by tag name, its props spread and its children inserted. */
  function element(tag: string, props: Record<string, unknown>): N {
    const node = ops.createElement(tag);
    spread(node, props);
    const children = props.children;
    if (children !== undefined && children !== null) insert(node, children);
    return node;
  }

  // ==========================================================================
  // Components that need a host
  // ==========================================================================

  function portal(target: Cell<N | null | undefined>, block: Block<unknown>): N {
    const given = getOwner();
    cellSlot(target, "Portal.mount");
    cellSlot(untrack(target), "Portal.mount", true);
    const marker = createSentinel();
    underScope(given, "portal", () => {
      let instance = NOTHING;
      let request = 0;
      const site: Site = { host, parent: null, anchor: null };
      const clear = (): void => {
        if (instance !== NOTHING) {
          teardown(host, instance);
          instance = NOTHING;
        }
        site.parent = null;
      };
      // An effect, so the mount happens once the pass that built the marker
      // has committed, and is held with the rest of a boundary's content while
      // the boundary shows its fallback.
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
            if (mine !== request) return;
            if (requested !== null && requested !== undefined && typeof requested !== "object") {
              throw new TypeError(
                `\`<Portal mount>\` was given ${JSON.stringify(requested)}, and on a custom host it ` +
                  "takes a node of that host. A selector is something only the document can look " +
                  "up: pass the node itself, or leave `mount` out to mount into the render root.",
              );
            }
            const into = requested ?? renderRootOf(given);
            if (into === null) return;
            site.parent = into;
            nextActivation();
            instance = activate(given, site, block, NO_ARGS, 0, "portal");
          };
          // A portal nothing owns has no scope to build under, and the engine
          // refuses one made from inside an effect's write.
          if (given === null) queueMicrotask(mount);
          else mount();
        },
      );
      onCleanup(clear);
    });
    return marker;
  }

  function renderRootOf(owner: Scope | null): N | null {
    const found = lookupContext(owner, RENDER_ROOT);
    return found === CONTEXT_MISS ? null : (found as N);
  }

  function Portal(props: PortalProps<N>): JSXElement {
    return portal(
      () => readSlot(props.mount, "Portal.mount") as N | null | undefined,
      props.children as Block<unknown>,
    );
  }

  function dynamic(
    source: () => DynamicTag | null | undefined | false,
  ): (props: Record<string, unknown>) => JSXElement {
    return (props) => {
      const component = internalMemo(source);
      return branch(null, null, component, () => {
        const resolved = untrack(component);
        if (resolved === null || resolved === undefined || resolved === false) return null;
        if (typeof resolved === "string") return element(resolved, props);
        return (resolved as (props: Record<string, unknown>) => unknown)(props);
      });
    };
  }

  // ==========================================================================
  // Control flow over this host
  // ==========================================================================

  function branch<K>(
    parent: N | null,
    anchor: N | null,
    key: Cell<K>,
    bodies: Block<unknown> | readonly (Block<unknown> | null | undefined)[],
    flags?: number,
  ): N | N[] | null {
    return branchIn(host, parent, anchor, key, bodies, flags);
  }

  // ==========================================================================
  // Mounting
  // ==========================================================================

  function render(
    code: (() => JSXElement) | JSXElement,
    root: N,
    options?: RenderOptions,
  ): () => void {
    const caller = getOwner();
    const scope = rootScope(options?.owner ?? null, options?.renderId);
    // Provided on the root, so a component called inside this tree renders
    // through this host whatever the default is: an app that renders into the
    // document as well has two hosts, and only the root knows which is whose.
    // A document renderer's control flow reads it too, for a component that
    // compiled for the document and is rendered here.
    provideHost(scope, { host, sync: syncRows });
    provideOn(scope, RENDER_ROOT, root);
    ownRange(scope, () => {
      for (let child = firstOf(root); child !== null; child = firstOf(root)) {
        removeNode(root, child);
      }
    });
    // A host has no server markup, so a tree mounted while a page hydrates,
    // as a canvas component mounting its scene does, claims nothing.
    withoutClaim(() => {
      runWithOwner(scope, () => {
        insert(root, typeof code === "function" ? code() : code);
      });
      flushMount(caller);
    });
    return () => {
      disposeScope(scope);
    };
  }

  // A component called outside any tree this renderer mounted finds a host
  // through the default, which this fills only when nothing else has.
  offerDefaultHost(host, syncRows);

  return {
    render,
    createElement: (tag) => ops.createElement(tag),
    createTextNode,
    insertNode,
    setProp,
    insert,
    spread,
    branch,
    each: (parent, anchor, src, carrier, row, flags, fallback) =>
      eachIn(host, syncRows, parent, anchor, src, carrier, row, flags, fallback),
    boundary: (parent, anchor, kind, fallback, body, flags, on) =>
      boundaryIn(host, parent, anchor, kind, fallback, body, flags, on),
    island: (parent, anchor, block, flags) => islandIn(host, parent, anchor, block, flags),
    reveal: (order, collapsed, block) => revealIn(host, order, collapsed, block),
    portal,
    dynamic,
    Portal,
    host,
    syncRows,
  };
}
