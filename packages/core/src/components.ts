/**
 * Built-in utility components
 * Uses comment markers for fine-grained DOM updates (like SolidJS)
 * All dynamic rendering uses createScope for proper effect disposal
 */

import type { Resource } from "./async.ts";
import type { IsCompilerMode, StrictAccessor, StrictArrayAccessor } from "./config.ts";
import type { Child, JSXElement } from "./dom.ts";
import { type RevealHandle, REVEAL_COORD, createRevealCoordinator } from "./boundaries.ts";
import { clearRange, createMarker, createMarkerPair, insertNodes } from "./markers.ts";
import { createErrorCollector, createPendingCollector } from "./boundaries.ts";
import { mapArray, repeat } from "./map.ts";
import {
  ERROR_BOUNDARY,
  computed,
  createScope,
  getOwner,
  onCleanup,
  renderEffect,
  signal,
  untrack,
} from "./signals.ts";

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
 *
 * @example
 * ```tsx
 * // Strict mode (default) - requires accessor
 * <Show when={() => count() > 5} fallback={<Loading />}>
 *   {(value) => <div>Count is {value}</div>}
 * </Show>
 *
 * // Compiler mode - allows raw expressions (compiler wraps them)
 * <Show when={count() > 5} fallback={<Loading />}>
 *   <div>Count is greater than 5</div>
 * </Show>
 * ```
 */
/**
 * Show props - discriminated on `keyed` so children params infer:
 * - omitted / true (keyed): function children get the raw value; content
 *   re-renders when the value changes
 * - false (Solid 2.0 non-keyed): function children get a narrowed
 *   accessor; content only re-renders when truthiness flips
 */
export type ShowProps<T> =
  | {
      when: StrictAccessor<T | undefined | null | false>;
      fallback?: JSXElement;
      keyed?: true;
      children: Child | ((item: NonNullable<T>) => Child);
    }
  | {
      when: StrictAccessor<T | undefined | null | false>;
      fallback?: JSXElement;
      keyed: false;
      children: Child | ((item: () => NonNullable<T>) => Child);
    };

export function Show<T>(props: ShowProps<T>): JSXElement {
  const [startMarker, endMarker] = createMarkerPair("Show");

  const fragment = document.createDocumentFragment();
  fragment.appendChild(startMarker);
  fragment.appendChild(endMarker);

  // Normalize accessor - handle both function and raw value for defensive runtime
  const whenAccessor = typeof props.when === "function" ? props.when : () => props.when;
  const valueMemo = computed(whenAccessor as () => T | undefined | null | false);
  // Non-keyed: the rendering effect tracks only truthiness
  const condition = props.keyed === false ? computed(() => !!valueMemo()) : valueMemo;

  // Track dispose function for current content
  let disposeContent: (() => void) | null = null;

  renderEffect(() => {
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

        // Keyed (default): pass the raw value. Non-keyed: pass a narrowed
        // accessor so content reads stay live without re-rendering.
        const children =
          typeof props.children === "function"
            ? props.keyed === false
              ? (props.children as (item: () => NonNullable<T>) => Child)(
                  valueMemo as () => NonNullable<T>,
                )
              : (props.children as (item: NonNullable<T>) => Child)(
                  untrack(valueMemo) as NonNullable<T>,
                )
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
 *
 * @example
 * ```tsx
 * // Strict mode (default) - requires accessor
 * <For each={() => items()} fallback={<Empty />}>
 *   {(item, index) => <li>{index()}: {item.name}</li>}
 * </For>
 *
 * // Compiler mode - allows raw array (compiler wraps it)
 * <For each={items()} fallback={<Empty />}>
 *   {(item, index) => <li>{index()}: {item.name}</li>}
 * </For>
 * ```
 */
/**
 * For props - discriminated on `keyed` so children params infer correctly:
 * - omitted / true / key fn: keyed - children get (item, indexAccessor)
 * - false: non-keyed (old Index) - children get (itemAccessor, index)
 */
export type ForProps<T, U extends JSXElement> =
  | {
      each: StrictArrayAccessor<T>;
      fallback?: JSXElement;
      keyFn?: (item: T) => unknown;
      keyed?: true | ((item: T) => unknown);
      children: (item: T, index: () => number) => U;
    }
  | {
      each: StrictArrayAccessor<T>;
      fallback?: JSXElement;
      keyFn?: never;
      keyed: false;
      children: (item: () => T, index: number) => U;
    };

export function For<T, U extends JSXElement>(props: ForProps<T, U>): JSXElement {
  // Non-keyed mode delegates to Index semantics
  if (props.keyed === false) {
    return Index({
      each: props.each,
      fallback: props.fallback,
      children: props.children as (item: () => T, index: number) => U,
    });
  }

  const each = (): readonly T[] | undefined | null => {
    const raw = props.each;
    return (typeof raw === "function" ? raw() : raw) as readonly T[] | undefined | null;
  };

  // keyed-by-function rows survive an item change: the row keeps its DOM and
  // the item reaches children through a signal. Everything else keys on the
  // item itself, so a changed item is a different row.
  if (typeof props.keyed === "function") {
    return renderRows(
      "For",
      mapArray(
        each,
        (item: () => T, index: () => number) =>
          childToNodes(
            (props.children as unknown as (i: () => T, n: () => number) => U)(item, index),
          ),
        { keyed: props.keyed, fallback: fallbackNodes(props) },
      ),
    );
  }

  return renderRows(
    "For",
    mapArray(
      each,
      (item: T, index: () => number) =>
        childToNodes((props.children as (i: T, n: () => number) => U)(item, index)),
      { fallback: fallbackNodes(props) },
    ),
  );
}

/** The fallback rendered as nodes, or undefined when there is none */
function fallbackNodes(props: { fallback?: JSXElement }): (() => Node[]) | undefined {
  return props.fallback === null || props.fallback === undefined
    ? undefined
    : () => childToNodes(props.fallback);
}

/**
 * Mount an ordered list of row node-groups between markers and keep the DOM in
 * that order as the list changes.
 *
 * Row lifecycle (creation, reuse, disposal) belongs to mapArray/repeat; this
 * only moves nodes, so a group's array identity is what tracks a row.
 */
function renderRows(label: string, rows: () => Node[][]): JSXElement {
  const [startMarker, endMarker] = createMarkerPair(label);

  const fragment = document.createDocumentFragment();
  fragment.appendChild(startMarker);
  fragment.appendChild(endMarker);

  let current: Node[][] = [];

  renderEffect(() => {
    const next = rows();
    const parent = endMarker.parentNode;
    if (!parent) return;

    if (current.length > 0) {
      const kept = new Set(next);
      for (const group of current) {
        if (kept.has(group)) continue;
        for (const node of group) node.parentNode?.removeChild(node);
      }
    }

    syncNodeOrder(parent, endMarker, current, next);
    current = next;
  });

  onCleanup(() => {
    for (const group of current) {
      for (const node of group) node.parentNode?.removeChild(node);
    }
    current = [];
  });

  return fragment;
}

/**
 * Move as few nodes as possible to bring the DOM into `next` order, keeping the
 * longest increasing subsequence of already-correct rows in place.
 */
function syncNodeOrder(parent: Node, endMarker: Node, previous: Node[][], next: Node[][]): void {
  const newLen = next.length;

  if (previous.length === 0) {
    for (let i = 0; i < newLen; i++) {
      for (const node of next[i]) parent.insertBefore(node, endMarker);
    }
    return;
  }

  const previousIndex = new Map<Node[], number>();
  for (let i = 0; i < previous.length; i++) previousIndex.set(previous[i], i);

  const sources: number[] = new Array(newLen);
  for (let i = 0; i < newLen; i++) sources[i] = previousIndex.get(next[i]) ?? -1;

  const lis = longestIncreasingSubsequence(sources.filter((s) => s !== -1));

  let lisIndex = lis.length - 1;
  let nextNode: Node = endMarker;

  for (let i = newLen - 1; i >= 0; i--) {
    const group = next[i];
    if (group.length === 0) continue;

    if (sources[i] !== -1 && lisIndex >= 0 && lis[lisIndex] === sources[i]) {
      lisIndex--; // already in the right place
    } else {
      for (let j = group.length - 1; j >= 0; j--) {
        parent.insertBefore(group[j], nextNode);
      }
    }

    nextNode = group[0];
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
 *
 * @example
 * ```tsx
 * // Strict mode (default) - requires accessor
 * <Index each={() => items()} fallback={<Empty />}>
 *   {(item, index) => <li>{index}: {item().name}</li>}
 * </Index>
 *
 * // Compiler mode - allows raw array (compiler wraps it)
 * <Index each={items()} fallback={<Empty />}>
 *   {(item, index) => <li>{index}: {item().name}</li>}
 * </Index>
 * ```
 */
export function Index<T, U extends JSXElement>(props: {
  each: StrictArrayAccessor<T>;
  fallback?: JSXElement;
  children: (item: () => T, index: number) => U;
}): JSXElement {
  const each = (): readonly T[] | undefined | null => {
    const raw = props.each;
    return (typeof raw === "function" ? raw() : raw) as readonly T[] | undefined | null;
  };

  return renderRows(
    "Index",
    mapArray(each, (item: () => T, index: number) => childToNodes(props.children(item, index)), {
      keyed: false,
      fallback: fallbackNodes(props),
    }),
  );
}

/**
 * Repeat component (Solid 2.0) - render a block `count` times.
 *
 * No diffing: children receive a plain, stable index number. Growing
 * appends, shrinking disposes from the end. For store-backed lists,
 * skeletons, and windowing.
 */
export function Repeat(props: {
  count: StrictAccessor<number> | number;
  from?: number;
  fallback?: JSXElement;
  children: (index: number) => Child;
}): JSXElement {
  const count = (): number => {
    const raw = props.count;
    return typeof raw === "function" ? raw() : raw;
  };

  return renderRows(
    "Repeat",
    repeat(count, (index: number) => childToNodes(props.children(index)), {
      from: () => props.from ?? 0,
      fallback: fallbackNodes(props),
    }),
  );
}

/**
 * Switch/Match components - pattern matching (SolidJS-style)
 *
 * @example
 * ```tsx
 * // Strict mode (default) - requires accessor
 * <Switch fallback={<Default />}>
 *   <Match when={() => status() === 'loading'}>
 *     <Loading />
 *   </Match>
 *   <Match when={() => status() === 'error'}>
 *     {(err) => <Error message={err} />}
 *   </Match>
 * </Switch>
 *
 * // Compiler mode - allows raw expressions (compiler wraps them)
 * <Switch fallback={<Default />}>
 *   <Match when={status() === 'loading'}>
 *     <Loading />
 *   </Match>
 * </Switch>
 * ```
 */
export interface MatchProps<T> {
  when: StrictAccessor<T | undefined | null | false>;
  keyed?: boolean;
  children: IsCompilerMode extends true
    ? Child | (() => Child) | ((item: NonNullable<T>) => Child)
    : (() => Child) | ((item: NonNullable<T>) => Child);
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

  renderEffect(() => {
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
 * Loading component (Solid 2.0) - async boundary.
 *
 * Children render inside a scope that provides a boundary handle via
 * context. Effects under it that read a not-ready async value (throwing
 * NotReadyError) register as pending; the fallback is shown while any
 * registered effect is pending. Revalidation of already-resolved values
 * does not re-show the fallback (content stays until replaced).
 */
export function Loading(props: {
  fallback?: JSXElement;
  /**
   * When this expression changes while async work is pending, the
   * boundary re-shows its fallback instead of keeping stale content.
   */
  on?: () => unknown;
  children: Child;
}): JSXElement {
  const [startMarker, endMarker] = createMarkerPair("Loading");

  const fragment = document.createDocumentFragment();
  fragment.appendChild(startMarker);
  fragment.appendChild(endMarker);

  // Coordination with an enclosing Reveal, if any
  const revealHandle = getOwner()?._context[REVEAL_COORD] as RevealHandle | undefined;

  const pending = createPendingCollector();

  // Content lives between its own markers so it can be parked off-DOM
  // while the fallback shows, preserving state across swaps
  const contentFragment = document.createDocumentFragment();
  const [contentStart, contentEnd] = createMarkerPair("LoadingContent");
  contentFragment.appendChild(contentStart);
  contentFragment.appendChild(contentEnd);

  let disposeContent: (() => void) | null = null;

  // Render children under the boundary context; a function child is
  // re-rendered reactively (NotReadyError throws register as pending)
  createScope((dispose) => {
    disposeContent = dispose;
    const owner = getOwner();
    if (owner) pending.install(owner);
    if (typeof props.children === "function") {
      renderEffect(() => {
        const resolved = (props.children as () => Child)();
        clearRange(contentStart, contentEnd);
        insertNodes(contentEnd, childToNodes(resolved));
      });
    } else {
      insertNodes(contentEnd, childToNodes(props.children));
    }
  });

  onCleanup(() => {
    if (disposeContent) {
      disposeContent();
      disposeContent = null;
    }
  });

  const moveRange = (target: Node, before: Node | null, start: Node, end: Node): void => {
    let node: Node | null = start;
    while (node) {
      const next: Node | null = node === end ? null : node.nextSibling;
      target.insertBefore(node, before);
      node = next;
    }
  };

  // Fallback shows only until first readiness; revalidation keeps stale
  // content - unless the `on` expression changes while pending
  const revealed = signal(false);
  renderEffect(() => {
    if (pending.count() === 0) revealed.set(true);
  });
  if (props.on) {
    let first = true;
    let lastOn: unknown;
    renderEffect(() => {
      const value = (props.on as () => unknown)();
      if (!first && value !== lastOn && untrack(() => pending.count()) > 0) {
        revealed.set(false);
      }
      lastOn = value;
      first = false;
    });
  }

  const slot = revealHandle?.register({ settled: () => revealed() });

  let showing: "content" | "fallback" | "nothing" | null = null;
  renderEffect(() => {
    const mode: "content" | "fallback" | "nothing" = slot
      ? slot.display()
      : pending.count() > 0 && !revealed()
        ? "fallback"
        : "content";
    if (mode === showing) return;
    showing = mode;

    if (mode === "content") {
      clearRange(startMarker, endMarker);
      const parent = endMarker.parentNode;
      if (parent) {
        moveRange(parent, endMarker, contentStart, contentEnd);
      }
    } else {
      // Park content; show fallback (or nothing for collapsed Reveal)
      moveRange(contentFragment, null, contentStart, contentEnd);
      clearRange(startMarker, endMarker);
      if (mode === "fallback" && props.fallback !== null && props.fallback !== undefined) {
        insertNodes(endMarker, childToNodes(props.fallback));
      }
    }
  });

  return fragment;
}

/**
 * Reveal component (Solid 2.0, replaces SuspenseList) - coordinates how
 * descendant Loading boundaries reveal their content.
 *
 * - order="natural" (default): each boundary reveals as it becomes ready
 * - order="together": all boundaries reveal at once when every one is ready
 * - order="sequential": boundaries reveal in registration order; with
 *   `collapsed`, boundaries past the frontier render nothing at all
 */
export function Reveal(props: {
  order?: "sequential" | "together" | "natural";
  collapsed?: boolean;
  children: Child;
}): JSXElement {
  const handle = createRevealCoordinator(
    () => props.order ?? "natural",
    () => props.collapsed === true,
  );

  const fragment = document.createDocumentFragment();
  createScope(() => {
    const owner = getOwner();
    if (owner) {
      owner._context = { ...owner._context, [REVEAL_COORD]: handle };
    }
    const nodes = childToNodes(props.children);
    for (const node of nodes) {
      fragment.appendChild(node);
    }
  });

  return fragment;
}

/**
 * Errored component (Solid 2.0) - error boundary.
 *
 * Catches synchronous render errors AND errors thrown by effects under
 * it (routed via the reactive graph). The fallback receives an error
 * accessor and a reset action.
 */
export function Errored(props: {
  fallback: (error: () => Error, reset: () => void) => JSXElement;
  children: Child | (() => Child);
}): JSXElement {
  const [startMarker, endMarker] = createMarkerPair("Errored");

  const fragment = document.createDocumentFragment();
  fragment.appendChild(startMarker);
  fragment.appendChild(endMarker);

  const collector = createErrorCollector();
  const asError = (err: unknown): Error => (err instanceof Error ? err : new Error(String(err)));

  let disposeContent: (() => void) | null = null;

  onCleanup(() => {
    if (disposeContent) {
      disposeContent();
      disposeContent = null;
    }
  });

  const renderFallback = (err: Error): void => {
    createScope((dispose) => {
      disposeContent = dispose;
      const reset = () => collector.clear();
      const nodes = childToNodes(props.fallback(() => err, reset));
      insertNodes(endMarker, nodes);
    }, true);
  };

  renderEffect(() => {
    const err = collector.failed() ? asError(collector.error()) : null;

    if (disposeContent) {
      disposeContent();
      disposeContent = null;
    }
    clearRange(startMarker, endMarker);

    if (err) {
      renderFallback(err);
      return;
    }

    try {
      createScope((dispose) => {
        disposeContent = dispose;
        const owner = getOwner();
        if (owner) collector.install(owner);
        const children =
          typeof props.children === "function" ? (props.children as () => Child)() : props.children;
        insertNodes(endMarker, childToNodes(children));
      }, true);
    } catch (e) {
      // Synchronous render error: record it (a write during our own run
      // does not re-trigger this effect) and render the fallback inline
      const error = asError(e);
      collector.capture(error);
      // TS can't see the createScope callback assignment
      const dispose = disposeContent as (() => void) | null;
      if (dispose) {
        dispose();
        disposeContent = null;
      }
      clearRange(startMarker, endMarker);
      renderFallback(error);
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

  renderEffect(() => {
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
        // Route errors thrown by effects under this boundary here too
        const owner = getOwner();
        if (owner) {
          owner._context = {
            ...owner._context,
            [ERROR_BOUNDARY]: (err: unknown) => {
              errorSignal.set(err instanceof Error ? err : new Error(String(err)));
            },
          };
        }
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

  renderEffect(() => {
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
export function Dynamic<
  T extends keyof HTMLElementTagNameMap | ((props: Record<string, unknown>) => JSXElement),
>(props: { component: T | (() => T) } & Record<string, unknown>): JSXElement {
  const [startMarker, endMarker] = createMarkerPair("Dynamic");

  const fragment = document.createDocumentFragment();
  fragment.appendChild(startMarker);
  fragment.appendChild(endMarker);

  let disposeContent: (() => void) | null = null;

  // A zero-arg function is an accessor returning the component; a function
  // taking props is the component itself
  const getComponent = computed(() => {
    const comp = props.component;
    return typeof comp === "function" && (comp as () => T).length === 0
      ? (comp as () => T)()
      : comp;
  });

  renderEffect(() => {
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
            element.setAttribute(
              key,
              typeof value === "object"
                ? JSON.stringify(value)
                : String(value as string | number | boolean),
            );
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
 * dynamic(source) factory (Solid 2.0): returns a stable component whose
 * identity is driven reactively by `source`. Each instance renders the
 * current component and swaps when the source changes.
 */
export function dynamic<P extends Record<string, unknown>>(
  source: () =>
    | keyof HTMLElementTagNameMap
    | ((props: Record<string, unknown>) => JSXElement)
    | undefined,
): (props: P) => JSXElement {
  return (props: P) =>
    Dynamic({
      ...props,
      component: source as () => keyof HTMLElementTagNameMap,
    });
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
 * Merge props objects (Solid 2.0): unlike mergeProps, `undefined` is a
 * value — a later `undefined` overrides an earlier value.
 */
export function merge<T extends Record<string, unknown>[]>(
  ...sources: T
): T extends (infer U)[] ? U : never {
  const result: Record<string, unknown> = {};
  for (const source of sources) {
    if (!source) continue;
    for (const key in source) {
      result[key] = source[key];
    }
  }
  return result as T extends (infer U)[] ? U : never;
}

/**
 * Omit keys from a props object (Solid 2.0 replacement for splitProps):
 * returns the remaining props.
 */
export function omit<T extends Record<string, unknown>, K extends keyof T>(
  props: T,
  ...keys: K[]
): Omit<T, K> {
  const keySet = new Set<keyof T>(keys);
  const rest: Partial<Omit<T, K>> = {};
  for (const key in props) {
    if (!keySet.has(key)) {
      (rest as Record<string, unknown>)[key] = props[key];
    }
  }
  return rest as Omit<T, K>;
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
