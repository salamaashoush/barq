/**
 * Built-in utility components
 * Uses comment markers for fine-grained DOM updates (like SolidJS)
 */

import type { Resource } from "./async.ts";
import type { Child, JSXElement } from "./dom.ts";
import { clearRange, createMarker, createMarkerPair, insertNodes } from "./markers.ts";
import { type Signal, computed, effect, signal, untrack } from "./signals.ts";

// Re-export marker utilities for external use
export { createMarker, createMarkerPair, clearRange, insertNodes };

/**
 * Convert a Child to an array of Nodes
 */
export function childToNodes(child: Child): Node[] {
  if (child === null || child === undefined || typeof child === "boolean") {
    return [];
  }

  if (child instanceof DocumentFragment) {
    return Array.from(child.childNodes);
  }

  if (child instanceof Node) {
    return [child];
  }

  if (typeof child === "function") {
    return childToNodes((child as () => Child)());
  }

  if (Array.isArray(child)) {
    const nodes: Node[] = [];
    for (const c of child) {
      nodes.push(...childToNodes(c));
    }
    return nodes;
  }

  return [document.createTextNode(String(child))];
}

/**
 * Fragment component
 */
export function Fragment(props: { children?: Child | Child[] }): JSXElement {
  const fragment = document.createDocumentFragment();
  const children = Array.isArray(props.children) ? props.children : [props.children];

  for (const child of children) {
    if (child !== null && child !== undefined && typeof child !== "boolean") {
      if (child instanceof Node) {
        fragment.appendChild(child);
      } else if (typeof child === "string" || typeof child === "number") {
        fragment.appendChild(document.createTextNode(String(child)));
      }
    }
  }

  return fragment;
}

/**
 * Show component - conditional rendering using comment markers
 *
 * Uses DocumentFragments to preserve entire subtrees (including content
 * between nested component markers) when hiding. This ensures that when
 * re-showing, nested components like Await have their content intact.
 *
 * The `when` prop accepts any truthy/falsy value accessor (like SolidJS),
 * not just strict booleans.
 */
export function Show<T>(props: {
  when: () => T | undefined | null | false;
  fallback?: JSXElement;
  children: Child | ((item: NonNullable<T>) => Child);
}): JSXElement {
  const [startMarker, endMarker] = createMarkerPair("Show");

  const fragment = document.createDocumentFragment();
  fragment.appendChild(startMarker);
  fragment.appendChild(endMarker);

  // Memoize the condition to ensure stable reactivity
  const condition = computed(props.when);

  effect(() => {
    const value = condition();
    const parent = endMarker.parentNode;
    if (!parent) return;

    // Clear existing content
    clearRange(startMarker, endMarker);

    if (value) {
      // Render children - support both static and callback patterns
      const children =
        typeof props.children === "function"
          ? props.children.length > 0
            ? (props.children as (item: NonNullable<T>) => Child)(value)
            : (props.children as () => Child)()
          : props.children;
      const nodes = childToNodes(children);
      insertNodes(endMarker, nodes);
    } else {
      // Render fallback if provided
      if (props.fallback !== null && props.fallback !== undefined) {
        const nodes = childToNodes(props.fallback);
        insertNodes(endMarker, nodes);
      }
    }
  });

  return fragment;
}

/**
 * For component - keyed list rendering with efficient reconciliation
 *
 * Like SolidJS's For: items are keyed by reference (or by keyFn if provided).
 * The item value is static, but the index is a signal that updates when position changes.
 *
 * Uses a proper keyed diffing algorithm that only moves/adds/removes changed nodes.
 *
 * Accepts either a direct array or a getter function for reactivity:
 * - Direct: `<For each={items}>` - static list
 * - Getter: `<For each={() => items()}>` - reactive list
 *
 * @example
 * ```tsx
 * <For each={users}>
 *   {(user, index) => <div>{index()}: {user.name}</div>}
 * </For>
 *
 * // With explicit key function
 * <For each={users} keyFn={(user) => user.id}>
 *   {(user, index) => <div>{user.name}</div>}
 * </For>
 * ```
 */
export function For<T, U extends JSXElement>(props: {
  each:
    | readonly T[]
    | T[]
    | undefined
    | null
    | false
    | (() => readonly T[] | T[] | undefined | null | false);
  fallback?: JSXElement;
  keyFn?: (item: T) => unknown;
  children: (item: T, index: () => number) => U;
}): JSXElement {
  const [startMarker, endMarker] = createMarkerPair("For");

  const fragment = document.createDocumentFragment();
  fragment.appendChild(startMarker);
  fragment.appendChild(endMarker);

  // Cache: key -> { nodes, indexSignal }
  type CacheEntry = {
    nodes: Node[];
    indexSignal: Signal<number>;
  };
  const cache = new Map<unknown, CacheEntry>();

  // Track current order of keys
  let currentKeys: unknown[] = [];

  // Get key for an item
  const getKey = props.keyFn ?? ((item: T) => item);

  effect(() => {
    // Support both getter function and direct array
    const rawEach = props.each;
    const items = typeof rawEach === "function" ? rawEach() : rawEach;
    const parent = endMarker.parentNode;
    if (!parent) return;

    // Handle empty/falsy list
    if (!items || items.length === 0) {
      clearRange(startMarker, endMarker);
      cache.clear();
      currentKeys = [];
      if (props.fallback !== null && props.fallback !== undefined) {
        insertNodes(endMarker, childToNodes(props.fallback));
      }
      return;
    }

    const newKeys = items.map(getKey);
    const newKeySet = new Set(newKeys);

    // Remove entries that are no longer in the list
    for (const key of currentKeys) {
      if (!newKeySet.has(key)) {
        const entry = cache.get(key);
        if (entry) {
          // Remove nodes from DOM
          for (const node of entry.nodes) {
            if (node.parentNode) {
              node.parentNode.removeChild(node);
            }
          }
          cache.delete(key);
        }
      }
    }

    // Build map of current positions for existing keys
    const currentKeyMap = new Map<unknown, number>();
    for (let i = 0; i < currentKeys.length; i++) {
      if (newKeySet.has(currentKeys[i])) {
        currentKeyMap.set(currentKeys[i], i);
      }
    }

    // Process new items - create entries and update indices
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const key = newKeys[i];
      let entry = cache.get(key);

      if (!entry) {
        // Create new entry with reactive index signal
        const indexSignal = signal(i);

        // Create the nodes from JSXElement
        const result = props.children(item, indexSignal);
        const nodes = childToNodes(result);

        entry = { nodes, indexSignal };
        cache.set(key, entry);
      } else {
        // Update index signal if changed
        if (entry.indexSignal() !== i) {
          entry.indexSignal.set(i);
        }
        // Note: We don't re-render when item content changes because:
        // 1. Store proxies wrap items, creating new proxy refs on each access
        // 2. For keyed reconciliation means same key = keep same DOM nodes
        // For reactive item properties, use Index component instead
      }
    }

    // Reconcile DOM order using efficient algorithm
    // Find the longest increasing subsequence to minimize moves
    reconcileNodes(parent, endMarker, currentKeys, newKeys, cache);

    currentKeys = newKeys;
  });

  return fragment;
}

/**
 * Efficient DOM reconciliation using longest increasing subsequence
 * Only moves nodes that are out of order, minimizing DOM operations
 */
function reconcileNodes(
  parent: Node,
  endMarker: Node,
  oldKeys: unknown[],
  newKeys: unknown[],
  cache: Map<unknown, { nodes: Node[]; indexSignal: Signal<number> }>,
): void {
  const newLen = newKeys.length;

  // Fast path: first render or complete replacement
  if (oldKeys.length === 0) {
    for (let i = 0; i < newLen; i++) {
      const entry = cache.get(newKeys[i]);
      if (!entry || entry.nodes.length === 0) continue;
      for (const node of entry.nodes) {
        parent.insertBefore(node, endMarker);
      }
    }
    return;
  }

  // Build map of old key positions
  const oldKeyIndex = new Map<unknown, number>();
  for (let i = 0; i < oldKeys.length; i++) {
    oldKeyIndex.set(oldKeys[i], i);
  }

  // Find indices in old array for each new key (-1 if new)
  const sources: number[] = Array.from(
    { length: newLen },
    (_, i) => oldKeyIndex.get(newKeys[i]) ?? -1,
  );

  // Find longest increasing subsequence of old indices
  // These nodes don't need to move
  const lis = longestIncreasingSubsequence(sources.filter((s) => s !== -1));

  // Determine which nodes need to be moved/inserted
  // Work backwards from end to use insertBefore efficiently
  let lisIndex = lis.length - 1;
  let nextNode: Node = endMarker;

  for (let i = newLen - 1; i >= 0; i--) {
    const key = newKeys[i];
    const entry = cache.get(key);
    if (!entry || entry.nodes.length === 0) continue;

    const oldIndex = sources[i];

    if (oldIndex === -1) {
      // New node - insert it
      for (let j = entry.nodes.length - 1; j >= 0; j--) {
        parent.insertBefore(entry.nodes[j], nextNode);
      }
    } else if (lisIndex >= 0 && lis[lisIndex] === oldIndex) {
      // Node is in LIS - don't move, just update nextNode
      lisIndex--;
    } else {
      // Node needs to move
      for (let j = entry.nodes.length - 1; j >= 0; j--) {
        parent.insertBefore(entry.nodes[j], nextNode);
      }
    }

    // Update nextNode for next iteration
    nextNode = entry.nodes[0];
  }
}

/**
 * Find longest increasing subsequence
 * Returns the actual values (not indices) that form the LIS
 */
function longestIncreasingSubsequence(arr: number[]): number[] {
  if (arr.length === 0) return [];

  const n = arr.length;
  const dp: number[] = Array.from({ length: n }, () => 1);
  const prev: number[] = Array.from({ length: n }, () => -1);

  let maxLen = 1;
  let maxIdx = 0;

  for (let i = 1; i < n; i++) {
    for (let j = 0; j < i; j++) {
      if (arr[j] < arr[i] && dp[j] + 1 > dp[i]) {
        dp[i] = dp[j] + 1;
        prev[i] = j;
      }
    }
    if (dp[i] > maxLen) {
      maxLen = dp[i];
      maxIdx = i;
    }
  }

  // Reconstruct the subsequence
  const result: number[] = [];
  let idx = maxIdx;
  while (idx !== -1) {
    result.unshift(arr[idx]);
    idx = prev[idx];
  }

  return result;
}

/**
 * Index component - index-keyed list rendering with efficient updates
 *
 * Like SolidJS's Index: items are keyed by their index position.
 * The index is static, but the item is a signal that updates when value at that position changes.
 *
 * Nodes are never moved - only values update. This is more efficient for lists where
 * items change but the number of items stays relatively constant.
 *
 * Use this for:
 * - Lists of primitives (strings, numbers)
 * - When you care about position stability, not value identity
 *
 * @example
 * ```tsx
 * <Index each={() => names()}>
 *   {(name, index) => <div>{index}: {name()}</div>}
 * </Index>
 * ```
 */
export function Index<T, U extends JSXElement>(props: {
  each:
    | readonly T[]
    | T[]
    | undefined
    | null
    | false
    | (() => readonly T[] | T[] | undefined | null | false);
  fallback?: JSXElement;
  children: (item: () => T, index: number) => U;
}): JSXElement {
  const [startMarker, endMarker] = createMarkerPair("Index");

  const fragment = document.createDocumentFragment();
  fragment.appendChild(startMarker);
  fragment.appendChild(endMarker);

  // Cache by index: index -> { nodes, itemSignal }
  type CacheEntry = {
    nodes: Node[];
    itemSignal: Signal<T>;
  };
  const cache: CacheEntry[] = [];

  let currentLength = 0;

  effect(() => {
    // Support both getter function and direct array
    const rawEach = props.each;
    const items = typeof rawEach === "function" ? rawEach() : rawEach;
    const parent = endMarker.parentNode;
    if (!parent) return;

    // Handle empty/falsy list
    if (!items || items.length === 0) {
      // Remove all cached nodes
      for (const entry of cache) {
        for (const node of entry.nodes) {
          if (node.parentNode) {
            node.parentNode.removeChild(node);
          }
        }
      }
      cache.length = 0;
      currentLength = 0;
      if (props.fallback !== null && props.fallback !== undefined) {
        insertNodes(endMarker, childToNodes(props.fallback));
      }
      return;
    }

    const newLength = items.length;

    // Clear fallback if present
    if (currentLength === 0 && props.fallback !== null && props.fallback !== undefined) {
      clearRange(startMarker, endMarker);
    }

    // Remove excess entries if array shrunk
    if (newLength < currentLength) {
      for (let i = newLength; i < currentLength; i++) {
        const entry = cache[i];
        if (entry) {
          for (const node of entry.nodes) {
            if (node.parentNode) {
              node.parentNode.removeChild(node);
            }
          }
        }
      }
      cache.length = newLength;
    }

    // Update existing entries and add new ones
    for (let i = 0; i < newLength; i++) {
      const item = items[i];
      let entry = cache[i];

      if (!entry) {
        // Create new entry with reactive item signal
        const itemSignal = signal(item);

        // Create the nodes with static index
        const result = props.children(itemSignal, i);
        const nodes = childToNodes(result);

        entry = { nodes, itemSignal };
        cache[i] = entry;

        // Insert new nodes at the end
        for (const node of nodes) {
          parent.insertBefore(node, endMarker);
        }
      } else {
        // Update item signal if value changed
        if (entry.itemSignal() !== item) {
          entry.itemSignal.set(item);
        }
      }
    }

    currentLength = newLength;
  });

  return fragment;
}

/**
 * Switch/Match components - pattern matching (SolidJS-style)
 *
 * Match just returns its props - Switch does all the work.
 * Children MUST be a function to enable lazy evaluation.
 *
 * Usage:
 * ```tsx
 * <Switch fallback={<div>Not Found</div>}>
 *   <Match when={() => route() === "home"}>
 *     {() => <Home />}
 *   </Match>
 *   <Match when={() => route() === "settings"}>
 *     {() => <Settings />}
 *   </Match>
 * </Switch>
 *
 * // With render prop (receives the truthy value):
 * <Match when={() => user()}>
 *   {(u) => <div>{u.name}</div>}
 * </Match>
 *
 * // With keyed - recreates children when value changes:
 * <Match when={() => selectedId()} keyed>
 *   {(id) => <ItemDetails id={id} />}
 * </Match>
 * ```
 */

export interface MatchProps<T> {
  /** Condition to evaluate - must be an accessor function for reactivity */
  when: () => T | undefined | null | false;
  /**
   * When true, children are recreated when the truthy value changes.
   * When false (default), children are reused if condition stays truthy.
   */
  keyed?: boolean;
  /**
   * Children MUST be a function for lazy evaluation.
   * Can be () => JSX or (value) => JSX to receive the truthy value.
   */
  children: (() => Child) | ((item: NonNullable<T>) => Child);
}

/**
 * Match component - just returns props for Switch to process
 * Like SolidJS, this is not a real component - it's a marker for Switch
 */
export function Match<T>(props: MatchProps<T>): JSXElement {
  return props as unknown as JSXElement;
}

/**
 * Switch component - renders first matching Match child
 * Evaluates conditions in order, renders first truthy match
 */
export function Switch(props: {
  fallback?: JSXElement;
  children: JSXElement | JSXElement[];
}): JSXElement {
  const [startMarker, endMarker] = createMarkerPair("Switch");

  const fragment = document.createDocumentFragment();
  fragment.appendChild(startMarker);
  fragment.appendChild(endMarker);

  let currentNodes: Node[] = [];
  let currentMatchIndex = -1;
  let currentValue: unknown = undefined;

  // Create a computed that finds the matching case
  const getMatch = computed(() => {
    const children = Array.isArray(props.children) ? props.children : [props.children];

    for (let i = 0; i < children.length; i++) {
      const child = children[i] as unknown as MatchProps<unknown>;
      // Skip non-Match children
      if (!child || typeof child !== "object" || !("when" in child)) continue;

      // Evaluate the condition
      const when = child.when;
      const conditionValue = typeof when === "function" ? (when as () => unknown)() : when;

      if (conditionValue) {
        return { index: i, value: conditionValue, match: child };
      }
    }
    return null;
  });

  effect(() => {
    const result = getMatch();

    // Determine if we need to re-render
    const needsRender = !result
      ? currentMatchIndex !== -1 // Was showing something, now showing fallback
      : currentMatchIndex !== result.index || // Different match
        (result.match.keyed && currentValue !== result.value); // Same match but keyed and value changed

    if (!needsRender && result && currentMatchIndex === result.index) {
      // Same match, not keyed or value unchanged - keep existing content
      currentValue = result.value;
      return;
    }

    // Clear existing content
    for (const node of currentNodes) {
      node.parentNode?.removeChild(node);
    }
    currentNodes = [];

    if (result) {
      const { index, value, match } = result;
      const children = match.children as (item?: unknown) => Child;

      // Children is always a function - call it untracked
      // If function.length > 0, it expects the truthy value as argument
      const content = untrack(() => (children.length > 0 ? children(value) : children()));

      const nodes = childToNodes(content);
      insertNodes(endMarker, nodes);
      currentNodes = nodes;
      currentMatchIndex = index;
      currentValue = value;
    } else {
      // No match - show fallback
      if (props.fallback !== null && props.fallback !== undefined) {
        const nodes = childToNodes(props.fallback);
        insertNodes(endMarker, nodes);
        currentNodes = nodes;
      }
      currentMatchIndex = -1;
      currentValue = undefined;
    }
  });

  return fragment;
}

/**
 * Suspense component - async boundary using comment markers
 */
export function Suspense(props: { fallback: JSXElement; children: Child }): JSXElement {
  const [startMarker, endMarker] = createMarkerPair("Suspense");

  const fragment = document.createDocumentFragment();
  fragment.appendChild(startMarker);
  fragment.appendChild(endMarker);

  let showFallback = true;

  const renderContent = () => {
    clearRange(startMarker, endMarker);

    if (showFallback) {
      insertNodes(endMarker, childToNodes(props.fallback));
    } else {
      const nodes = childToNodes(props.children);
      insertNodes(endMarker, nodes);
    }
  };

  // Initially show fallback
  queueMicrotask(() => renderContent());

  // Use microtask to attempt showing content
  queueMicrotask(() => {
    queueMicrotask(() => {
      try {
        showFallback = false;
        renderContent();
      } catch (promise) {
        if (promise instanceof Promise) {
          void promise.then(() => {
            showFallback = false;
            renderContent();
            return undefined;
          });
        }
      }
    });
  });

  return fragment;
}

/**
 * ErrorBoundary component using comment markers
 *
 * Children should be a function to enable reactive error catching:
 * ```tsx
 * <ErrorBoundary fallback={(err, reset) => <Error error={err} onReset={reset} />}>
 *   {() => <MaybeThrows />}
 * </ErrorBoundary>
 * ```
 */
export function ErrorBoundary(props: {
  fallback: (error: Error, reset: () => void) => JSXElement;
  children: Child | (() => Child);
}): JSXElement {
  const [startMarker, endMarker] = createMarkerPair("ErrorBoundary");

  const fragment = document.createDocumentFragment();
  fragment.appendChild(startMarker);
  fragment.appendChild(endMarker);

  // Track error state with a signal
  const errorSignal = signal<Error | null>(null);

  // Computed that tries to evaluate children and catches errors
  const content = computed(() => {
    const err = errorSignal();
    if (err) {
      // Return error marker - we'll render fallback
      return { error: err };
    }

    try {
      // Try to render children
      const children =
        typeof props.children === "function" ? (props.children as () => Child)() : props.children;
      return { children };
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      // Don't set signal inside computed - return error instead
      return { error };
    }
  });

  // Effect to render based on computed result
  effect(() => {
    const result = content();
    clearRange(startMarker, endMarker);

    if ("error" in result && result.error) {
      // Update error signal if this is a new error from children
      if (errorSignal.peek() !== result.error) {
        // Use queueMicrotask to avoid setting signal during effect
        queueMicrotask(() => errorSignal.set(result.error));
      }
      // Render fallback
      const reset = () => {
        errorSignal.set(null);
      };
      const fallbackResult = props.fallback(result.error, reset);
      insertNodes(endMarker, childToNodes(fallbackResult));
    } else if ("children" in result) {
      const nodes = childToNodes(result.children);
      insertNodes(endMarker, nodes);
    }
  });

  return fragment;
}

/**
 * Await component - render based on resource state using comment markers
 */
export function Await<T>(props: {
  resource: Resource<T>;
  loading?: JSXElement;
  error?: (error: Error) => JSXElement;
  children: (data: T) => JSXElement;
}): JSXElement {
  const [startMarker, endMarker] = createMarkerPair("Await");

  const fragment = document.createDocumentFragment();
  fragment.appendChild(startMarker);
  fragment.appendChild(endMarker);

  effect(() => {
    const status = props.resource.state();

    // Clear existing content
    clearRange(startMarker, endMarker);

    let nodes: Node[] = [];

    switch (status) {
      case "unresolved":
      case "pending":
        if (props.loading !== null && props.loading !== undefined) {
          nodes = childToNodes(props.loading);
        }
        break;
      case "errored": {
        const err = props.resource.error();
        if (props.error && err) {
          nodes = childToNodes(props.error(err));
        } else if (err) {
          nodes = [document.createTextNode(err.message)];
        }
        break;
      }
      case "ready":
      case "refreshing": {
        const data = props.resource.latest();
        if (data !== undefined) {
          nodes = childToNodes(props.children(data));
        }
        break;
      }
    }

    insertNodes(endMarker, nodes);
  });

  return fragment;
}

/**
 * Portal component - render children outside the component tree
 * Uses MutationObserver for cleanup when marker is removed from DOM
 */
export function Portal(props: { target?: HTMLElement | string; children: Child }): JSXElement {
  const marker = createMarker("Portal");
  let container: HTMLDivElement | null = null;
  let observer: MutationObserver | null = null;

  const cleanup = () => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (container?.parentNode) {
      container.parentNode.removeChild(container);
      container = null;
    }
  };

  // Mount after marker is in DOM
  queueMicrotask(() => {
    if (!marker.isConnected) return;

    // Resolve target
    let target: HTMLElement | null = null;
    if (typeof props.target === "string") {
      const el = document.querySelector(props.target);
      if (el instanceof HTMLElement) {
        target = el;
      }
    } else {
      target = props.target ?? document.body;
    }
    if (!target) return;

    // Create container for portal content
    container = document.createElement("div");
    container.style.display = "contents";

    // Mount children
    const nodes = childToNodes(props.children);
    for (const node of nodes) {
      container.appendChild(node);
    }
    target.appendChild(container);

    // Watch for marker removal using MutationObserver
    // Observe the marker's parent for child removal
    const parent = marker.parentNode;
    if (parent) {
      observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const removed of mutation.removedNodes) {
            if (removed === marker || removed.contains(marker)) {
              cleanup();
              return;
            }
          }
        }
        // Also check if marker is no longer connected
        if (!marker.isConnected) {
          cleanup();
        }
      });
      observer.observe(parent, { childList: true, subtree: true });
    }
  });

  return marker;
}
