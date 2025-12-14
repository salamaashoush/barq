/**
 * DOM marker utilities for fine-grained reactive updates
 */

// Unique ID counter for markers
let markerId = 0;

/**
 * Create a unique single marker
 */
export function createMarker(name: string): Comment {
  const id = markerId++;
  return document.createComment(`${name}:${id}`);
}

/**
 * Create a unique marker pair
 */
export function createMarkerPair(name: string): [Comment, Comment] {
  const id = markerId++;
  const start = document.createComment(`${name}:${id}`);
  const end = document.createComment(`/${name}:${id}`);
  // Store reference to pair for fast lookup
  (start as Comment & { __end?: Comment }).__end = end;
  return [start, end];
}

/**
 * Insert nodes before a marker
 */
export function insertNodes(marker: Node, nodes: Node[]): void {
  const parent = marker.parentNode;
  if (!parent) return;
  for (const node of nodes) {
    parent.insertBefore(node, marker);
  }
}

/**
 * Remove nodes between start marker and end marker (exclusive)
 */
export function clearRange(startMarker: Comment, endMarker: Comment): void {
  const parent = startMarker.parentNode;
  if (!parent) return;
  let node = startMarker.nextSibling;
  while (node && node !== endMarker) {
    const next = node.nextSibling;
    parent.removeChild(node);
    node = next;
  }
}
