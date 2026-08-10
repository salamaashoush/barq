/**
 * The built-in components, on the M3 calling convention: `Comp(s, props)`,
 * every prop a `Cell`, every renderable slot a `Block`.
 *
 * `CODESIGN.md` §3.2 C1/C4/C6, `SEMANTICS.md` C1–C6. Their INTERNALS are still
 * the marker/`createScope` machinery M4 replaces with `branch`/`each`; what
 * changed here is only the boundary they present to compiled code.
 */

import type { Resource } from "./async.ts";
import type { Child, JSXElement } from "./dom.ts";
import { drainFragment, isSsrHtml } from "./dom.ts";
import { type RevealHandle, REVEAL_COORD, createRevealCoordinator } from "./boundaries.ts";
import { clearRange, createMarker, createMarkerPair, insertNodes } from "./markers.ts";
import { createErrorCollector, createPendingCollector } from "./boundaries.ts";
import { mapArray, repeat } from "./map.ts";
import { merge, omit } from "./props.ts";
import type { Block, Cell, Scope, Slot } from "./scope.ts";
import {
  ERROR_BOUNDARY,
  computed,
  createScope,
  getOwner,
  onCleanup,
  provideOn,
  readSlot,
  renderEffect,
  signal,
  underScope,
  untrack,
} from "./signals.ts";

// Re-export marker utilities for external use
export { createMarker, createMarkerPair, clearRange, insertNodes };

/**
 * C4/C6: read a renderable slot by CALLING it, scope first. A Cell ignores
 * every argument (§3.0 rule 1) so `c($s)` and `c()` are the same call; a Block
 * uses it. One call site therefore serves both kinds, and that asymmetry is the
 * whole rule.
 *
 * `s` is the scope the CONSTRUCT was given, threaded down from its parameter.
 * Reading it back off `CURRENT` instead cannot fail whatever the runtime does:
 * an ambient read compared against itself is O4.5's defect wearing the shape of
 * a check, and it is what left `pin` with nothing to override.
 */
function readCell(s: Scope | null, slot: unknown, ...args: unknown[]): unknown {
  if (typeof slot !== "function") return slot;
  return (slot as Block<unknown>)(s, ...(args as Cell<unknown>[]));
}

/**
 * A CELL-slot read (§3.0 rule 2): the value is called with no scope. A branded
 * Block reaching here is rule 3's throw, not a silent build under `CURRENT`.
 */
function readValue(slot: unknown, origin: string): unknown {
  return readSlot(slot, origin);
}

/** The same read, resolved to the nodes a renderable slot stands for. */
function buildSlot(s: Scope | null, slot: unknown, ...args: unknown[]): Node[] {
  return childToNodes(readCell(s, slot, ...args) as Child, s);
}

/**
 * Convert a Child to an array of Nodes, under the scope a nested Block must run
 * in. `s` defaults to the ambient owner for the hand-written callers that hold
 * no scope; a compiled construct always passes its own.
 */
export function childToNodes(child: Child, s: Scope | null = getOwner()): Node[] {
  if (child === null || child === undefined || typeof child === "boolean") {
    return [];
  }

  if (child instanceof DocumentFragment) {
    return drainFragment(child);
  }

  if (child instanceof Node) {
    return [child];
  }

  // A component compiled to the SSR string backend, rendered by a module that
  // fell back to this DOM backend (DESIGN §5). Without this the markup would
  // arrive as escaped text.
  if (isSsrHtml(child as unknown)) {
    const holder = document.createElement("template");
    holder.innerHTML = (child as unknown as { readonly t: string }).t;
    return Array.from(holder.content.childNodes);
  }

  // A function reached here is a Cell or a Block, and the two are told apart
  // by what they IGNORE, not by a test: a Cell drops the argument, a Block
  // uses it. Passing the scope is therefore correct for both and is the only
  // way a Block that arrived nested inside a Cell (`children: () => props.children`)
  // ever reaches one.
  if (typeof child === "function") {
    return childToNodes((child as Block<Child>)(s), s);
  }

  if (Array.isArray(child)) {
    const nodes: Node[] = [];
    for (const c of child) {
      nodes.push(...childToNodes(c, s));
    }
    return nodes;
  }

  return [document.createTextNode(String(child))];
}

/**
 * Fragment component
 */
export function Fragment(_s: Scope | null, props: { children?: Child | Child[] }): JSXElement {
  return underScope(_s, "Fragment", (s): JSXElement => {
    const fragment = document.createDocumentFragment();
    for (const node of buildSlot(s, props.children)) fragment.appendChild(node);
    return fragment;
  });
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
      when: Cell<T | undefined | null | false>;
      fallback?: Slot<Child>;
      keyed?: Cell<true>;
      children: Block<Child, [item: NonNullable<T>]> | Cell<Child>;
    }
  | {
      when: Cell<T | undefined | null | false>;
      fallback?: Slot<Child>;
      keyed: Cell<false>;
      children: Block<Child, [item: Cell<NonNullable<T>>]> | Cell<Child>;
    };

export function Show<T>(_s: Scope | null, props: ShowProps<T>): JSXElement {
  return underScope(_s, "Show", (): JSXElement => {
    const [startMarker, endMarker] = createMarkerPair("Show");

    const fragment = document.createDocumentFragment();
    fragment.appendChild(startMarker);
    fragment.appendChild(endMarker);

    const valueMemo = computed(
      () => readValue(props.when, "Show.when") as T | undefined | null | false,
    );
    const keyed = readValue(props.keyed, "Show.keyed");
    // Non-keyed: the rendering effect tracks only truthiness
    const condition = keyed === false ? computed(() => !!valueMemo()) : valueMemo;

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
        createScope(
          (dispose, branch) => {
            disposeContent = dispose;

            // Keyed (default): pass the raw value. Non-keyed: pass a narrowed
            // accessor so content reads stay live without re-rendering.
            const item = keyed === false ? valueMemo : untrack(valueMemo);
            insertNodes(endMarker, buildSlot(branch, props.children, item));
          },
          false,
          "branch",
        );
      } else {
        // Render fallback if provided (also in a scope)
        if (props.fallback !== null && props.fallback !== undefined) {
          createScope(
            (dispose, branch) => {
              disposeContent = dispose;
              insertNodes(endMarker, buildSlot(branch, props.fallback));
            },
            false,
            "branch",
          );
        }
      }
    });

    return fragment;
  });
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
 * - omitted / true: keyed by identity - children get (item, indexAccessor)
 * - key fn: the row survives an item change, so the item arrives through a row
 *   SIGNAL - children get (itemAccessor, indexAccessor)
 * - false: non-keyed (old Index) - children get (itemAccessor, index)
 */
export type ForProps<T, U extends JSXElement> =
  | {
      each: Cell<readonly T[] | undefined | null>;
      fallback?: Slot<Child>;
      keyed?: Cell<true>;
      children: Block<U, [item: T, index: Cell<number>]>;
    }
  | {
      each: Cell<readonly T[] | undefined | null>;
      fallback?: Slot<Child>;
      keyed: Cell<(item: T) => unknown>;
      children: Block<U, [item: Cell<T>, index: Cell<number>]>;
    }
  | {
      each: Cell<readonly T[] | undefined | null>;
      fallback?: Slot<Child>;
      keyed: Cell<false>;
      children: Block<U, [item: Cell<T>, index: number]>;
    };

export function For<T, U extends JSXElement>(_s: Scope | null, props: ForProps<T, U>): JSXElement {
  return underScope(_s, "For", (s): JSXElement => {
    // `keyed`'s VALUE is a function, so a bare key function and a Cell carrying
    // one land in the same slot: the compiler emits `_$cell((r) => r.id)` for a
    // key it can see, and passes a spread source's `keyed` through verbatim.
    // They are told apart by the parameter a key function declares and a Cell
    // never does (§3.0 rule 1).
    const carrier = props.keyed as unknown;
    const keyed =
      typeof carrier === "function" && (carrier as { length: number }).length >= 1
        ? carrier
        : readValue(carrier, "For.keyed");

    // Non-keyed mode delegates to Index semantics
    if (keyed === false) {
      return Index(s, props as unknown as IndexProps<T, U>);
    }

    const each = (): readonly T[] | undefined | null =>
      readValue(props.each, "For.each") as readonly T[] | undefined | null;

    // keyed-by-function rows survive an item change: the row keeps its DOM and
    // the item reaches children through a signal. Everything else keys on the
    // item itself, so a changed item is a different row.
    if (typeof keyed === "function") {
      return renderRows(
        "For",
        mapArray(
          each,
          (item: () => T, index: () => number, row: Scope) =>
            buildSlot(row, props.children, item, index),
          {
            keyed: keyed as (item: T) => unknown,
            fallback: fallbackNodes(props),
          },
        ),
      );
    }

    return renderRows(
      "For",
      mapArray(
        each,
        (item: T, index: () => number, row: Scope) => buildSlot(row, props.children, item, index),
        { fallback: fallbackNodes(props) },
      ),
    );
  });
}

/** The fallback rendered as nodes, or undefined when there is none */
function fallbackNodes(props: { fallback?: Slot<Child> }): ((scope: Scope) => Node[]) | undefined {
  return props.fallback === null || props.fallback === undefined
    ? undefined
    : (scope: Scope): Node[] => buildSlot(scope, props.fallback);
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
export interface IndexProps<T, U extends JSXElement> {
  each: Cell<readonly T[] | undefined | null>;
  fallback?: Slot<Child>;
  children: Block<U, [item: Cell<T>, index: number]>;
}

export function Index<T, U extends JSXElement>(
  _s: Scope | null,
  props: IndexProps<T, U>,
): JSXElement {
  return underScope(_s, "Index", (): JSXElement => {
    const each = (): readonly T[] | undefined | null =>
      readValue(props.each, "Index.each") as readonly T[] | undefined | null;

    return renderRows(
      "Index",
      mapArray(
        each,
        (item: () => T, index: number, row: Scope) => buildSlot(row, props.children, item, index),
        { keyed: false, fallback: fallbackNodes(props) },
      ),
    );
  });
}

/**
 * Repeat component (Solid 2.0) - render a block `count` times.
 *
 * No diffing: children receive a plain, stable index number. Growing
 * appends, shrinking disposes from the end. For store-backed lists,
 * skeletons, and windowing.
 */
export function Repeat(
  _s: Scope | null,
  props: {
    count: Cell<number>;
    from?: Cell<number>;
    fallback?: Slot<Child>;
    children: Block<Child, [index: number]>;
  },
): JSXElement {
  return underScope(_s, "Repeat", (): JSXElement => {
    const count = (): number => readValue(props.count, "Repeat.count") as number;

    return renderRows(
      "Repeat",
      repeat(count, (index: number, row: Scope) => buildSlot(row, props.children, index), {
        from: () => (readValue(props.from, "Repeat.from") as number | undefined) ?? 0,
        fallback: fallbackNodes(props),
      }),
    );
  });
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
  when: Cell<T | undefined | null | false>;
  keyed?: Cell<boolean>;
  children: Block<Child, [item: NonNullable<T>]> | Cell<Child>;
}

/** C8-adjacent: `Match` is an identity function — `Switch` reads its props. */
export function Match<T>(_s: Scope | null, props: MatchProps<T>): JSXElement {
  return underScope(_s, "Match", (): JSXElement => {
    return props as unknown as JSXElement;
  });
}

/**
 * Switch component - renders first matching Match child
 * Uses createScope for proper effect disposal when match changes
 */
export function Switch(
  _s: Scope | null,
  props: { fallback?: Slot<Child>; children: Slot<JSXElement | JSXElement[]> },
): JSXElement {
  return underScope(_s, "Switch", (s): JSXElement => {
    const [startMarker, endMarker] = createMarkerPair("Switch");

    const fragment = document.createDocumentFragment();
    fragment.appendChild(startMarker);
    fragment.appendChild(endMarker);

    let currentNodes: Node[] = [];
    let currentMatchIndex = -1;
    let currentValue: unknown = undefined;
    let disposeContent: (() => void) | null = null;

    // `children` is a Block that RETURNS the `Match` records; `Match` builds no
    // DOM, so re-invoking it inside the memo costs an object per arm and keeps
    // every `when` read tracked by this memo.
    const getMatch = computed(() => {
      const resolved = readCell(s, props.children);
      const children = Array.isArray(resolved) ? resolved : [resolved];

      for (let i = 0; i < children.length; i++) {
        const child = children[i] as unknown as MatchProps<unknown>;
        if (!child || typeof child !== "object" || !("when" in child)) continue;

        const conditionValue = readValue(child.when, "Match.when");

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
        : currentMatchIndex !== result.index ||
          (result.match.keyed && currentValue !== result.value);

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

        // Use detached scope so it's not auto-disposed when effect re-runs
        // This preserves inner effects for non-keyed matches
        createScope(
          (dispose, branch) => {
            disposeContent = dispose;
            // Always pass the value - the Block can choose to use it or not
            const nodes = buildSlot(branch, match.children, value);
            insertNodes(endMarker, nodes);
            currentNodes = nodes;
          },
          true,
          "branch",
        ); // detached

        currentMatchIndex = index;
        currentValue = value;
      } else {
        if (props.fallback !== null && props.fallback !== undefined) {
          createScope(
            (dispose, branch) => {
              disposeContent = dispose;
              const nodes = buildSlot(branch, props.fallback);
              insertNodes(endMarker, nodes);
              currentNodes = nodes;
            },
            true,
            "branch",
          ); // detached
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
  });
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
export function Loading(
  _s: Scope | null,
  props: {
    fallback?: Slot<Child>;
    /**
     * When this expression changes while async work is pending, the
     * boundary re-shows its fallback instead of keeping stale content.
     */
    on?: Cell<unknown>;
    children: Slot<Child>;
  },
): JSXElement {
  return underScope(_s, "Loading", (s): JSXElement => {
    const [startMarker, endMarker] = createMarkerPair("Loading");

    const fragment = document.createDocumentFragment();
    fragment.appendChild(startMarker);
    fragment.appendChild(endMarker);

    // Coordination with an enclosing Reveal, if any
    const revealHandle = s?.ctx?.[REVEAL_COORD] as RevealHandle | undefined;

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
    createScope(
      (dispose, branch) => {
        disposeContent = dispose;
        pending.install(branch);
        if (typeof props.children === "function") {
          renderEffect(() => {
            const nodes = buildSlot(branch, props.children);
            clearRange(contentStart, contentEnd);
            insertNodes(contentEnd, nodes);
          });
        } else {
          insertNodes(contentEnd, childToNodes(props.children as Child, branch));
        }
      },
      false,
      "branch",
    );

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
        const value = readValue(props.on, "Loading.on");
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
          insertNodes(endMarker, buildSlot(s, props.fallback));
        }
      }
    });

    return fragment;
  });
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
export function Reveal(
  _s: Scope | null,
  props: {
    order?: Cell<"sequential" | "together" | "natural">;
    collapsed?: Cell<boolean>;
    children: Slot<Child>;
  },
): JSXElement {
  return underScope(_s, "Reveal", (): JSXElement => {
    const handle = createRevealCoordinator(
      () =>
        (readValue(props.order, "Reveal.order") as
          | "sequential"
          | "together"
          | "natural"
          | undefined) ?? "natural",
      () => readValue(props.collapsed, "Reveal.collapsed") === true,
    );

    const fragment = document.createDocumentFragment();
    createScope(
      (_dispose, branch) => {
        provideOn(branch, REVEAL_COORD, handle);
        for (const node of buildSlot(branch, props.children)) {
          fragment.appendChild(node);
        }
      },
      false,
      "branch",
    );

    return fragment;
  });
}

/**
 * Errored component (Solid 2.0) - error boundary.
 *
 * Catches synchronous render errors AND errors thrown by effects under
 * it (routed via the reactive graph). The fallback receives an error
 * accessor and a reset action.
 */
export function Errored(
  _s: Scope | null,
  props: {
    fallback: Block<Child, [error: Cell<Error>, reset: () => void]>;
    children: Slot<Child>;
  },
): JSXElement {
  return underScope(_s, "Errored", (): JSXElement => {
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
      createScope(
        (dispose, branch) => {
          disposeContent = dispose;
          const reset = (): void => collector.clear();
          insertNodes(
            endMarker,
            buildSlot(branch, props.fallback, () => err, reset),
          );
        },
        true,
        "branch",
      );
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
        createScope(
          (dispose, branch) => {
            disposeContent = dispose;
            collector.install(branch);
            insertNodes(endMarker, buildSlot(branch, props.children));
          },
          true,
          "branch",
        );
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
  });
}

/**
 * Suspense component - async boundary using comment markers
 */
export function Suspense(
  _s: Scope | null,
  props: { fallback: Slot<Child>; children: Slot<Child> },
): JSXElement {
  return underScope(_s, "Suspense", (): JSXElement => {
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

      createScope(
        (dispose, branch) => {
          disposeContent = dispose;

          insertNodes(endMarker, buildSlot(branch, showFallback ? props.fallback : props.children));
        },
        false,
        "branch",
      );
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
  });
}

/**
 * ErrorBoundary component using comment markers
 * Uses createScope for proper effect disposal
 */
export function ErrorBoundary(
  _s: Scope | null,
  props: {
    fallback: Block<Child, [error: Error, reset: () => void]>;
    children: Slot<Child>;
  },
): JSXElement {
  return underScope(_s, "ErrorBoundary", (s): JSXElement => {
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
        return { children: readCell(s, props.children) as Child };
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

      createScope(
        (dispose, branch) => {
          disposeContent = dispose;

          if ("error" in result && result.error) {
            if (errorSignal.peek() !== result.error) {
              queueMicrotask(() => errorSignal.set(result.error));
            }
            const reset = (): void => {
              errorSignal.set(null);
            };
            insertNodes(endMarker, buildSlot(branch, props.fallback, result.error, reset));
          } else if ("children" in result) {
            // Route errors thrown by effects under this boundary here too
            provideOn(branch, ERROR_BOUNDARY, (err: unknown) => {
              errorSignal.set(err instanceof Error ? err : new Error(String(err)));
            });
            const nodes = childToNodes(result.children, branch);
            insertNodes(endMarker, nodes);
          }
        },
        false,
        "branch",
      );
    });

    return fragment;
  });
}

/**
 * Await component - render based on resource state using comment markers
 * Uses createScope for proper effect disposal
 */
export function Await<T>(
  _s: Scope | null,
  props: {
    resource: Cell<Resource<T>>;
    loading?: Slot<Child>;
    error?: Block<Child, [error: Error]>;
    children: Block<Child, [data: T]>;
  },
): JSXElement {
  return underScope(_s, "Await", (): JSXElement => {
    const [startMarker, endMarker] = createMarkerPair("Await");

    const fragment = document.createDocumentFragment();
    fragment.appendChild(startMarker);
    fragment.appendChild(endMarker);

    let disposeContent: (() => void) | null = null;

    renderEffect(() => {
      // A `Resource` is itself callable, so forwarding one by name (C5) puts a
      // value-carrying Cell and the resource in the same slot. The resource is
      // told from its own value by a property it has and a value does not.
      const carrier = props.resource as unknown;
      const resource = (
        typeof carrier === "function" && "state" in carrier
          ? carrier
          : readValue(carrier, "Await.resource")
      ) as Resource<T>;
      const status = resource.state();

      // Dispose previous content
      if (disposeContent) {
        disposeContent();
        disposeContent = null;
      }

      clearRange(startMarker, endMarker);

      createScope(
        (dispose, branch) => {
          disposeContent = dispose;

          let nodes: Node[] = [];

          switch (status) {
            case "unresolved":
            case "pending":
              if (props.loading !== null && props.loading !== undefined) {
                nodes = buildSlot(branch, props.loading);
              }
              break;
            case "errored": {
              const err = resource.error();
              if (props.error && err) {
                nodes = buildSlot(branch, props.error, err);
              } else if (err) {
                nodes = [document.createTextNode(err.message)];
              }
              break;
            }
            case "ready":
            case "refreshing": {
              const data = resource.latest();
              if (data !== undefined) {
                nodes = buildSlot(branch, props.children, data);
              }
              break;
            }
          }

          insertNodes(endMarker, nodes);
        },
        false,
        "branch",
      );
    });

    return fragment;
  });
}

/**
 * Portal component - render children outside the component tree
 */
export function Portal(
  _s: Scope | null,
  props: { target?: Cell<HTMLElement | string>; children: Slot<Child> },
): JSXElement {
  return underScope(_s, "Portal", (): JSXElement => {
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

      const requested = readValue(props.target, "Portal.target") as
        | HTMLElement
        | string
        | undefined;
      let target: HTMLElement | null = null;
      if (typeof requested === "string") {
        const el = document.querySelector(requested);
        if (el instanceof HTMLElement) {
          target = el;
        }
      } else {
        target = requested ?? document.body;
      }
      if (!target) return;

      container = document.createElement("div");
      container.style.display = "contents";

      // Render children in a detached scope (cleanup handled by onCleanup above)
      createScope(
        (dispose, branch) => {
          disposeContent = dispose;
          for (const node of buildSlot(branch, props.children)) {
            container!.appendChild(node);
          }
        },
        true,
        "portal",
      ); // detached

      target.appendChild(container);
    });

    return marker;
  });
}

/**
 * Dynamic component - render different components based on a reactive value
 * Similar to SolidJS's Dynamic component
 */
export function Dynamic<
  T extends
    | keyof HTMLElementTagNameMap
    | ((s: Scope | null, props: Record<string, unknown>) => JSXElement),
>(_s: Scope | null, props: { component: Cell<T> } & Record<string, unknown>): JSXElement {
  return underScope(_s, "Dynamic", (): JSXElement => {
    const [startMarker, endMarker] = createMarkerPair("Dynamic");

    const fragment = document.createDocumentFragment();
    fragment.appendChild(startMarker);
    fragment.appendChild(endMarker);

    let disposeContent: (() => void) | null = null;

    const getComponent = computed(() => readValue(props.component, "Dynamic.component") as T);

    renderEffect(() => {
      const component = getComponent();

      // Dispose previous content
      if (disposeContent) {
        disposeContent();
        disposeContent = null;
      }

      clearRange(startMarker, endMarker);

      if (!component) return;

      createScope(
        (dispose, branch) => {
          disposeContent = dispose;

          // C3/C5: `rest` is a VIEW of the same carriers, not a copy — the
          // callee's `props.x()` still reaches the caller's Cell.
          const rest = omit(props as Record<string, unknown>, "component");
          let nodes: Node[];

          if (typeof component === "string") {
            // Intrinsic element
            const element = document.createElement(component);
            for (const key in rest) {
              if (key === "children") continue;
              const value = readValue((rest as Record<string, unknown>)[key], `Dynamic.${key}`);
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
            if ((rest as Record<string, unknown>).children) {
              for (const node of buildSlot(branch, (rest as Record<string, unknown>).children)) {
                element.appendChild(node);
              }
            }
            nodes = [element];
          } else {
            nodes = buildSlot(branch, component as unknown, rest);
          }

          insertNodes(endMarker, nodes);
        },
        true,
        "branch",
      );
    });

    // Cleanup when parent disposes
    onCleanup(() => {
      if (disposeContent) {
        disposeContent();
        disposeContent = null;
      }
    });

    return fragment;
  });
}

/**
 * dynamic(source) factory (Solid 2.0): returns a stable component whose
 * identity is driven reactively by `source`. Each instance renders the
 * current component and swaps when the source changes.
 */
export function dynamic<P extends Record<string, unknown>>(
  source: Cell<
    keyof HTMLElementTagNameMap | ((s: Scope | null, props: Record<string, unknown>) => JSXElement)
  >,
): (s: Scope | null, props: P) => JSXElement {
  return (s: Scope | null, props: P): JSXElement =>
    Dynamic(s, merge(props, { component: source }) as { component: Cell<never> });
}

/**
 * The props helpers live in `props.ts` and are re-exported here for the
 * import path every consumer already uses. `CODESIGN.md` §4.1 predicted they
 * become one-liners once the model is right; they are views over the source
 * list and they copy nothing.
 */
export { mergeProps, merge, omit, splitProps } from "./props.ts";

export function children(fn: Slot<Child>, s: Scope | null = getOwner()): () => Node[] {
  return computed(() => buildSlot(s, fn));
}
