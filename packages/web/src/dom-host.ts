/**
 * Control flow's host in a document: the node loops `flow.ts` hands a range to,
 * and the list reorder `each` passes beside it.
 *
 * A list update is one call into `syncRowsDom`, and the trimming, the swap of
 * two ends, the longest increasing subsequence and the one-call clear all run
 * inside it against the DOM itself.
 */

import { childToNodes, removeNodes } from "./dom.ts";
import {
  LIVE_EDGES,
  LIVE_ROWS,
  isNodes,
  longestIncreasingSubsequence,
  standingRow,
  standingRows,
  type RangeHost,
  type Row as HostRow,
} from "@barqjs/core/internal";

type Row = HostRow<Node>;

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

function insertRange(parent: Node, nodes: readonly Node[], before: Node | null): void {
  let anchor = before;
  for (let i = nodes.length; i--;) {
    place(parent, nodes[i], anchor);
    anchor = nodes[i];
  }
}

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

export const DOM_HOST: RangeHost<Node> = {
  sentinel: () => document.createTextNode(""),
  park: () => document.createDocumentFragment(),
  isPark: (node) => node.nodeType === 11,
  parentOf: (node) => node.parentNode,
  nextOf: (node) => node.nextSibling,
  prevOf: (node) => node.previousSibling,
  firstOf: (parent) => parent.firstChild,
  lastOf: (parent) => parent.lastChild,
  row: asRow,
  toNodes: childToNodes,
  insertRange,
  removeRange: removeNodes,
  owns: (node) => node instanceof Node,
};

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
  const standing = standingRow(DOM_HOST, row);
  for (let i = 0; i < standing.length; i++) visit(standing[i]);
}

export function syncRowsDom(
  parent: Node,
  anchor: Node | null,
  current: readonly Row[],
  next: readonly Row[],
): void {
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
    // Emptying the list is its own case, and not only to skip a `Set` of
    // every group: it is the one removal that can go through `removeNodes`'s
    // single-call path, which is what `clear rows` is.
    if (arriving.length === 0) {
      removeNodes(standingRows(DOM_HOST, leaving));
    } else {
      const kept = new Set(arriving);
      for (const group of leaving) {
        if (kept.has(group)) continue;
        eachStanding(group, detach);
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
    syncNodeOrder(parent, after, leaving, arriving);
  }
}

/**
 * Put `high` where `low` stands and `low` where `high` stood. `false`, with
 * nothing moved, when either row has no node to stand anywhere.
 */
function swapEnds(parent: Node, low: Row, high: Row): boolean {
  const lowNodes = isNodes(low) ? standingRow(DOM_HOST, low) : [low];
  const highNodes = isNodes(high) ? standingRow(DOM_HOST, high) : [high];
  if (lowNodes.length === 0 || highNodes.length === 0) return false;
  const afterHigh = highNodes[highNodes.length - 1].nextSibling;
  const lowFirst = lowNodes[0];
  for (let i = 0; i < highNodes.length; i++) parent.insertBefore(highNodes[i], lowFirst);
  for (let i = 0; i < lowNodes.length; i++) parent.insertBefore(lowNodes[i], afterHigh);
  return true;
}

function syncNodeOrder(
  parent: Node,
  anchor: Node | null,
  previous: readonly Row[],
  next: readonly Row[],
): void {
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
      const row = standingRow(DOM_HOST, group);
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
        const standing = standingRow(DOM_HOST, group);
        for (let j = 0; j < standing.length; j++) {
          parent.insertBefore(standing[j], nextNode);
        }
      }
    }

    nextNode = first;
  }
}
