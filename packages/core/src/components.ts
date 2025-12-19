/**
 * Built-in utility components
 * Uses comment markers for fine-grained DOM updates (like SolidJS)
 * All dynamic rendering uses createScope for proper effect disposal
 */

import type { Resource } from "./async.ts";
import type { Child, JSXElement } from "./dom.ts";
import { clearRange, createMarker, createMarkerPair, insertNodes } from "./markers.ts";
import { type Signal, computed, createScope, effect, signal, untrack } from "./signals.ts";

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
 * Uses createScope for proper effect disposal when content changes
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

  // Track dispose function for current content
  let disposeContent: (() => void) | null = null;

  effect(() => {
    const value = condition();
    const parent = endMarker.parentNode;
    if (!parent) return;

    // Dispose previous content's effects
    if (disposeContent) {
      disposeContent();
      disposeContent = null;
    }

    // Clear existing content
    clearRange(startMarker, endMarker);

    if (value) {
      // Render children in a scope for proper disposal
      createScope((dispose) => {
        disposeContent = dispose;

        const children =
          typeof props.children === "function"
            ? props.children.length > 0
              ? (props.children as (item: NonNullable<T>) => Child)(value)
              : (props.children as () => Child)()
            : props.children;
        const nodes = childToNodes(children);
        insertNodes(endMarker, nodes);
      });
    } else {
      // Render fallback if provided (also in a scope)
      if (props.fallback !== null && props.fallback !== undefined) {
        createScope((dispose) => {
          disposeContent = dispose;
          const nodes = childToNodes(props.fallback);
          insertNodes(endMarker, nodes);
        });
      }
    }
  });

  return fragment;
}

/**
 * For component - keyed list rendering with efficient reconciliation
 * Uses createScope for each item to ensure proper effect disposal
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

  // Cache: key -> { nodes, indexSignal, dispose }
  type CacheEntry = {
    nodes: Node[];
    indexSignal: Signal<number>;
    dispose: () => void;
  };
  const cache = new Map<unknown, CacheEntry>();

  // Track current order of keys
  let currentKeys: unknown[] = [];

  // Track fallback dispose
  let disposeFallback: (() => void) | null = null;

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
      // Dispose all cached entries
      for (const entry of cache.values()) {
        entry.dispose();
      }
      cache.clear();
      clearRange(startMarker, endMarker);
      currentKeys = [];

      if (props.fallback !== null && props.fallback !== undefined) {
        createScope((dispose) => {
          disposeFallback = dispose;
          insertNodes(endMarker, childToNodes(props.fallback));
        });
      }
      return;
    }

    // Dispose fallback if it was showing
    if (disposeFallback) {
      disposeFallback();
      disposeFallback = null;
    }

    const newKeys = items.map(getKey);
    const newKeySet = new Set(newKeys);

    // Remove entries that are no longer in the list
    for (const key of currentKeys) {
      if (!newKeySet.has(key)) {
        const entry = cache.get(key);
        if (entry) {
          // Dispose effects before removing nodes
          entry.dispose();
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
        // Create new entry with reactive index signal in a scope
        const indexSignal = signal(i);
        let entryNodes: Node[] = [];
        let entryDispose!: () => void;

        createScope((dispose) => {
          entryDispose = dispose;
          const result = props.children(item, indexSignal);
          entryNodes = childToNodes(result);
        });

        entry = { nodes: entryNodes, indexSignal, dispose: entryDispose };
        cache.set(key, entry);
      } else {
        // Update index signal if changed
        if (entry.indexSignal() !== i) {
          entry.indexSignal.set(i);
        }
      }
    }

    // Reconcile DOM order using efficient algorithm
    reconcileNodes(parent, endMarker, currentKeys, newKeys, cache);

    currentKeys = newKeys;
  });

  return fragment;
}

/**
 * Efficient DOM reconciliation using longest increasing subsequence
 */
function reconcileNodes(
  parent: Node,
  endMarker: Node,
  oldKeys: unknown[],
  newKeys: unknown[],
  cache: Map<unknown, { nodes: Node[]; indexSignal: Signal<number>; dispose: () => void }>,
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
  const lis = longestIncreasingSubsequence(sources.filter((s) => s !== -1));

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
      // Node is in LIS - don't move
      lisIndex--;
    } else {
      // Node needs to move
      for (let j = entry.nodes.length - 1; j >= 0; j--) {
        parent.insertBefore(entry.nodes[j], nextNode);
      }
    }

    nextNode = entry.nodes[0];
  }
}

/**
 * Find longest increasing subsequence
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
 * Uses createScope for each item to ensure proper effect disposal
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

  // Cache by index: index -> { nodes, itemSignal, dispose }
  type CacheEntry = {
    nodes: Node[];
    itemSignal: Signal<T>;
    dispose: () => void;
  };
  const cache: CacheEntry[] = [];

  let currentLength = 0;
  let disposeFallback: (() => void) | null = null;

  effect(() => {
    const rawEach = props.each;
    const items = typeof rawEach === "function" ? rawEach() : rawEach;
    const parent = endMarker.parentNode;
    if (!parent) return;

    // Handle empty/falsy list
    if (!items || items.length === 0) {
      // Dispose all cached entries
      for (const entry of cache) {
        entry.dispose();
        for (const node of entry.nodes) {
          if (node.parentNode) {
            node.parentNode.removeChild(node);
          }
        }
      }
      cache.length = 0;
      currentLength = 0;

      if (props.fallback !== null && props.fallback !== undefined) {
        createScope((dispose) => {
          disposeFallback = dispose;
          insertNodes(endMarker, childToNodes(props.fallback));
        });
      }
      return;
    }

    // Dispose fallback if it was showing
    if (disposeFallback) {
      disposeFallback();
      disposeFallback = null;
      clearRange(startMarker, endMarker);
    }

    const newLength = items.length;

    // Remove excess entries if array shrunk
    if (newLength < currentLength) {
      for (let i = newLength; i < currentLength; i++) {
        const entry = cache[i];
        if (entry) {
          entry.dispose();
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
        // Create new entry with reactive item signal in a scope
        const itemSignal = signal(item);
        let entryNodes: Node[] = [];
        let entryDispose!: () => void;

        createScope((dispose) => {
          entryDispose = dispose;
          const result = props.children(itemSignal, i);
          entryNodes = childToNodes(result);
        });

        entry = { nodes: entryNodes, itemSignal, dispose: entryDispose };
        cache[i] = entry;

        // Insert new nodes at the end
        for (const node of entryNodes) {
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
 */
export interface MatchProps<T> {
  when: () => T | undefined | null | false;
  keyed?: boolean;
  children: (() => Child) | ((item: NonNullable<T>) => Child);
}

export function Match<T>(props: MatchProps<T>): JSXElement {
  return props as unknown as JSXElement;
}

/**
 * Switch component - renders first matching Match child
 * Uses createScope for proper effect disposal when match changes
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
  let disposeContent: (() => void) | null = null;

  const getMatch = computed(() => {
    const children = Array.isArray(props.children) ? props.children : [props.children];

    for (let i = 0; i < children.length; i++) {
      const child = children[i] as unknown as MatchProps<unknown>;
      if (!child || typeof child !== "object" || !("when" in child)) continue;

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

    const needsRender = !result
      ? currentMatchIndex !== -1
      : currentMatchIndex !== result.index || (result.match.keyed && currentValue !== result.value);

    if (!needsRender && result && currentMatchIndex === result.index) {
      currentValue = result.value;
      return;
    }

    // Dispose previous content
    if (disposeContent) {
      disposeContent();
      disposeContent = null;
    }

    // Clear existing content
    for (const node of currentNodes) {
      node.parentNode?.removeChild(node);
    }
    currentNodes = [];

    if (result) {
      const { index, value, match } = result;
      const children = match.children as (item?: unknown) => Child;

      createScope((dispose) => {
        disposeContent = dispose;
        const content = untrack(() => (children.length > 0 ? children(value) : children()));
        const nodes = childToNodes(content);
        insertNodes(endMarker, nodes);
        currentNodes = nodes;
      });

      currentMatchIndex = index;
      currentValue = value;
    } else {
      if (props.fallback !== null && props.fallback !== undefined) {
        createScope((dispose) => {
          disposeContent = dispose;
          const nodes = childToNodes(props.fallback);
          insertNodes(endMarker, nodes);
          currentNodes = nodes;
        });
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
  let disposeContent: (() => void) | null = null;

  const renderContent = () => {
    // Dispose previous content
    if (disposeContent) {
      disposeContent();
      disposeContent = null;
    }

    clearRange(startMarker, endMarker);

    createScope((dispose) => {
      disposeContent = dispose;

      if (showFallback) {
        insertNodes(endMarker, childToNodes(props.fallback));
      } else {
        const nodes = childToNodes(props.children);
        insertNodes(endMarker, nodes);
      }
    });
  };

  queueMicrotask(() => renderContent());

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
 * Uses createScope for proper effect disposal
 */
export function ErrorBoundary(props: {
  fallback: (error: Error, reset: () => void) => JSXElement;
  children: Child | (() => Child);
}): JSXElement {
  const [startMarker, endMarker] = createMarkerPair("ErrorBoundary");

  const fragment = document.createDocumentFragment();
  fragment.appendChild(startMarker);
  fragment.appendChild(endMarker);

  const errorSignal = signal<Error | null>(null);
  let disposeContent: (() => void) | null = null;

  const content = computed(() => {
    const err = errorSignal();
    if (err) {
      return { error: err };
    }

    try {
      const children =
        typeof props.children === "function" ? (props.children as () => Child)() : props.children;
      return { children };
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      return { error };
    }
  });

  effect(() => {
    const result = content();

    // Dispose previous content
    if (disposeContent) {
      disposeContent();
      disposeContent = null;
    }

    clearRange(startMarker, endMarker);

    createScope((dispose) => {
      disposeContent = dispose;

      if ("error" in result && result.error) {
        if (errorSignal.peek() !== result.error) {
          queueMicrotask(() => errorSignal.set(result.error));
        }
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
  });

  return fragment;
}

/**
 * Await component - render based on resource state using comment markers
 * Uses createScope for proper effect disposal
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

  let disposeContent: (() => void) | null = null;

  effect(() => {
    const status = props.resource.state();

    // Dispose previous content
    if (disposeContent) {
      disposeContent();
      disposeContent = null;
    }

    clearRange(startMarker, endMarker);

    createScope((dispose) => {
      disposeContent = dispose;

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
  });

  return fragment;
}

/**
 * Portal component - render children outside the component tree
 */
export function Portal(props: { target?: HTMLElement | string; children: Child }): JSXElement {
  const marker = createMarker("Portal");
  let container: HTMLDivElement | null = null;
  let observer: MutationObserver | null = null;
  let disposeContent: (() => void) | null = null;

  const cleanup = () => {
    if (disposeContent) {
      disposeContent();
      disposeContent = null;
    }
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (container?.parentNode) {
      container.parentNode.removeChild(container);
      container = null;
    }
  };

  queueMicrotask(() => {
    if (!marker.isConnected) return;

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

    container = document.createElement("div");
    container.style.display = "contents";

    // Render children in a scope
    createScope((dispose) => {
      disposeContent = dispose;
      const nodes = childToNodes(props.children);
      for (const node of nodes) {
        container!.appendChild(node);
      }
    });

    target.appendChild(container);

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
        if (!marker.isConnected) {
          cleanup();
        }
      });
      observer.observe(parent, { childList: true, subtree: true });
    }
  });

  return marker;
}
