/**
 * Built-in utility components
 * Uses comment markers for fine-grained DOM updates (like SolidJS)
 * All dynamic rendering uses createScope for proper effect disposal
 */

import type { Resource } from "./async.ts";
import type { Child, JSXElement } from "./dom.ts";
import { clearRange, createMarker, createMarkerPair, insertNodes } from "./markers.ts";
import { type Signal, computed, createScope, effect, onCleanup, signal, untrack } from "./signals.ts";

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

    // Register cleanup for when effect is disposed (component unmount)
    onCleanup(() => {
      if (disposeContent) {
        disposeContent();
        disposeContent = null;
      }
    });

    // Clear existing content
    clearRange(startMarker, endMarker);

    if (value) {
      // Render children in a scope for proper disposal
      createScope((dispose) => {
        disposeContent = dispose;

        // Always pass the value to function children - the function can choose to use it or not
        // Using .length is unreliable (default params have length 0)
        const children =
          typeof props.children === "function"
            ? (props.children as (item: NonNullable<T>) => Child)(value)
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

  // Cache: key -> { nodes, indexSignal, item, dispose }
  type CacheEntry = {
    nodes: Node[];
    indexSignal: Signal<number>;
    item: T; // Track item value to detect changes
    dispose: () => void;
  };
  const cache = new Map<unknown, CacheEntry>();

  // Track current order of keys
  let currentKeys: unknown[] = [];

  // Track fallback dispose
  let disposeFallback: (() => void) | null = null;

  // Get key for an item
  const getKey = props.keyFn ?? ((item: T) => item);

  // Register cleanup at component level (not effect level) for when parent unmounts
  // This ensures item scopes are disposed even though they're detached
  onCleanup(() => {
    for (const entry of cache.values()) {
      entry.dispose();
    }
    cache.clear();
    if (disposeFallback) {
      disposeFallback();
      disposeFallback = null;
    }
  });

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
      // Clear the fallback nodes from DOM
      clearRange(startMarker, endMarker);
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

    // Track which keys were re-rendered (same key but different value)
    const rerenderedKeys = new Set<unknown>();

    // Process new items - create entries and update indices
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const key = newKeys[i];
      let entry = cache.get(key);

      // Check if item value changed (same key, different value)
      const needsRerender = entry && !Object.is(entry.item, item);

      if (!entry || needsRerender) {
        // Dispose old entry if re-rendering
        if (entry) {
          rerenderedKeys.add(key);
          entry.dispose();
          for (const node of entry.nodes) {
            if (node.parentNode) {
              node.parentNode.removeChild(node);
            }
          }
        }

        // Create new entry with reactive index signal in a detached scope
        // (detached because we manage the lifecycle manually via cache)
        const indexSignal = entry?.indexSignal ?? signal(i);
        if (entry) {
          // Reuse index signal, just update if needed
          if (indexSignal() !== i) {
            indexSignal.set(i);
          }
        }
        let entryNodes: Node[] = [];
        let entryDispose!: () => void;

        createScope((dispose) => {
          entryDispose = dispose;
          const result = props.children(item, indexSignal);
          entryNodes = childToNodes(result);
        }, true); // detached

        entry = { nodes: entryNodes, indexSignal, item, dispose: entryDispose };
        cache.set(key, entry);
      } else {
        // Update index signal if changed
        if (entry.indexSignal() !== i) {
          entry.indexSignal.set(i);
        }
      }
    }

    // Filter out re-rendered keys from oldKeys so they're treated as new
    const effectiveOldKeys = rerenderedKeys.size > 0
      ? currentKeys.filter(k => !rerenderedKeys.has(k))
      : currentKeys;

    // Reconcile DOM order using efficient algorithm
    reconcileNodes(parent, endMarker, effectiveOldKeys, newKeys, cache);

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
  cache: Map<unknown, { nodes: Node[] }>,
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
 * Find longest increasing subsequence using patience sorting + binary search
 * O(n log n) time complexity
 */
function longestIncreasingSubsequence(arr: number[]): number[] {
  if (arr.length === 0) return [];

  const n = arr.length;
  // tails[i] = smallest tail value for LIS of length i+1
  const tails: number[] = [];
  // indices[i] = index in arr for tails[i]
  const indices: number[] = [];
  // parent[i] = index of previous element in LIS ending at arr[i]
  const parent: number[] = new Array(n).fill(-1);

  for (let i = 0; i < n; i++) {
    const val = arr[i];

    // Binary search for position where val can extend an LIS
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

    // lo is the position where val fits
    if (lo === tails.length) {
      tails.push(val);
      indices.push(i);
    } else {
      tails[lo] = val;
      indices[lo] = i;
    }

    // Track parent for reconstruction
    if (lo > 0) {
      parent[i] = indices[lo - 1];
    }
  }

  // Reconstruct the LIS by following parent pointers
  const result: number[] = new Array(tails.length);
  let idx = indices[indices.length - 1];
  for (let i = result.length - 1; i >= 0; i--) {
    result[i] = arr[idx];
    idx = parent[idx];
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
        // Create new entry with reactive item signal in a detached scope
        // (detached because we manage the lifecycle manually via cache)
        const itemSignal = signal(item);
        let entryNodes: Node[] = [];
        let entryDispose!: () => void;

        createScope((dispose) => {
          entryDispose = dispose;
          const result = props.children(itemSignal, i);
          entryNodes = childToNodes(result);
        }, true); // detached

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

  // Register cleanup at component level (not effect level) for when parent unmounts
  onCleanup(() => {
    for (const entry of cache) {
      entry.dispose();
    }
    cache.length = 0;
    if (disposeFallback) {
      disposeFallback();
      disposeFallback = null;
    }
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

      // Use detached scope so it's not auto-disposed when effect re-runs
      // This preserves inner effects for non-keyed matches
      createScope((dispose) => {
        disposeContent = dispose;
        // Always pass the value - function can choose to use it or not
        // Don't use untrack here as it prevents inner effects from tracking
        const content = children(value);
        const nodes = childToNodes(content);
        insertNodes(endMarker, nodes);
        currentNodes = nodes;
      }, true); // detached

      currentMatchIndex = index;
      currentValue = value;
    } else {
      if (props.fallback !== null && props.fallback !== undefined) {
        createScope((dispose) => {
          disposeContent = dispose;
          const nodes = childToNodes(props.fallback);
          insertNodes(endMarker, nodes);
          currentNodes = nodes;
        }, true); // detached
      }
      currentMatchIndex = -1;
      currentValue = undefined;
    }
  });

  // Register cleanup at component level for when parent unmounts
  onCleanup(() => {
    if (disposeContent) {
      disposeContent();
      disposeContent = null;
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
  let disposeContent: (() => void) | null = null;

  const cleanup = () => {
    if (disposeContent) {
      disposeContent();
      disposeContent = null;
    }
    if (container?.parentNode) {
      container.parentNode.removeChild(container);
      container = null;
    }
  };

  // Register cleanup with owner for automatic disposal
  onCleanup(cleanup);

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

    // Render children in a detached scope (cleanup handled by onCleanup above)
    createScope((dispose) => {
      disposeContent = dispose;
      const nodes = childToNodes(props.children);
      for (const node of nodes) {
        container!.appendChild(node);
      }
    }, true); // detached

    target.appendChild(container);
  });

  return marker;
}

/**
 * Dynamic component - render different components based on a reactive value
 * Similar to SolidJS's Dynamic component
 */
export function Dynamic<T extends keyof HTMLElementTagNameMap | ((props: Record<string, unknown>) => JSXElement)>(
  props: { component: T | (() => T) } & Record<string, unknown>,
): JSXElement {
  const [startMarker, endMarker] = createMarkerPair("Dynamic");

  const fragment = document.createDocumentFragment();
  fragment.appendChild(startMarker);
  fragment.appendChild(endMarker);

  let disposeContent: (() => void) | null = null;

  const getComponent = computed(() => {
    const comp = props.component;
    return typeof comp === "function" && !((comp as () => unknown).length === 0 && typeof comp() !== "undefined")
      ? comp
      : typeof comp === "function"
        ? (comp as () => T)()
        : comp;
  });

  effect(() => {
    const component = getComponent();

    // Dispose previous content
    if (disposeContent) {
      disposeContent();
      disposeContent = null;
    }

    clearRange(startMarker, endMarker);

    if (!component) return;

    createScope((dispose) => {
      disposeContent = dispose;

      // Extract component prop and pass rest to the component
      const { component: _, ...rest } = props;
      let nodes: Node[];

      if (typeof component === "string") {
        // Intrinsic element
        const element = document.createElement(component);
        for (const key in rest) {
          if (key === "children") continue;
          const value = rest[key];
          if (key.startsWith("on") && typeof value === "function") {
            element.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
          } else if (value !== undefined && value !== null) {
            element.setAttribute(key, String(value));
          }
        }
        if (rest.children) {
          const childNodes = childToNodes(rest.children as Child);
          for (const node of childNodes) {
            element.appendChild(node);
          }
        }
        nodes = [element];
      } else {
        // Function component
        const result = (component as (props: Record<string, unknown>) => JSXElement)(rest);
        nodes = childToNodes(result as Child);
      }

      insertNodes(endMarker, nodes);
    }, true);
  });

  // Cleanup when parent disposes
  onCleanup(() => {
    if (disposeContent) {
      disposeContent();
      disposeContent = null;
    }
  });

  return fragment;
}

/**
 * Split props into two objects based on keys
 * @param props The props object to split
 * @param keys Keys to extract into the first object
 * @returns Tuple of [extracted, remaining]
 */
export function splitProps<T extends Record<string, unknown>, K extends keyof T>(
  props: T,
  keys: K[],
): [Pick<T, K>, Omit<T, K>] {
  const keySet = new Set(keys);
  const picked: Partial<Pick<T, K>> = {};
  const rest: Partial<Omit<T, K>> = {};

  for (const key in props) {
    if (keySet.has(key as unknown as K)) {
      (picked as Record<string, unknown>)[key] = props[key];
    } else {
      (rest as Record<string, unknown>)[key] = props[key];
    }
  }

  return [picked as Pick<T, K>, rest as Omit<T, K>];
}

/**
 * Merge multiple props objects, with later objects overriding earlier ones
 * @param sources Props objects to merge
 * @returns Merged props object
 */
export function mergeProps<T extends Record<string, unknown>[]>(
  ...sources: T
): T extends (infer U)[] ? U : never {
  const result: Record<string, unknown> = {};

  for (const source of sources) {
    if (!source) continue;
    for (const key in source) {
      const value = source[key];
      // Special handling for children - concat arrays
      if (key === "children" && result.children !== undefined) {
        const existing = result.children;
        if (Array.isArray(existing) && Array.isArray(value)) {
          result.children = [...existing, ...value];
        } else if (Array.isArray(existing)) {
          result.children = [...existing, value];
        } else if (Array.isArray(value)) {
          result.children = [existing, ...value];
        } else {
          result.children = [existing, value];
        }
      } else if (value !== undefined) {
        result[key] = value;
      }
    }
  }

  return result as T extends (infer U)[] ? U : never;
}

/**
 * Resolve children from props, handling functions and arrays
 * @param fn Function that may return children
 * @returns Resolved children
 */
export function children(fn: () => Child): () => Node[] {
  const memo = computed(() => {
    const result = fn();
    return childToNodes(result);
  });
  return memo;
}
