import { type Accessor, computed, untrack } from "@barqjs/core";
import { elementSize } from "./element.ts";
import { scrollPosition } from "./scroll.ts";
import { type MaybeAccessor, access, clamp } from "./utils.ts";

export interface VirtualItem {
  index: number;
  /** Offset from the start of the list, in pixels. */
  start: number;
  size: number;
}

export interface VirtualOptions {
  /** How many items there are. */
  count: MaybeAccessor<number>;
  /**
   * The size of item `i`, in pixels. A number for a uniform list, a function
   * for a ragged one.
   *
   * A function is called once per item when the list or the estimate changes,
   * never per frame: the offsets are folded into a prefix sum, so scrolling is
   * a binary search rather than a walk.
   */
  size: MaybeAccessor<number> | ((index: number) => number);
  /** Items to render beyond each edge. Defaults to 3. */
  overscan?: MaybeAccessor<number>;
  /** `"vertical"` (default) or `"horizontal"`. */
  axis?: "vertical" | "horizontal";
}

export interface Virtual {
  /** The items to render, with their offsets. */
  items: Accessor<readonly VirtualItem[]>;
  /** The full scrollable extent, for the spacer element. */
  total: Accessor<number>;
  /** The index range currently rendered. */
  range: Accessor<{ start: number; end: number }>;
  /** Scroll so that `index` is at the top (or left) of the viewport. */
  scrollTo: (index: number, behavior?: ScrollBehavior) => void;
  /** Measured viewport length along the axis. */
  viewport: Accessor<number>;
}

/**
 * Render only the rows a scroll container can show.
 *
 * The offsets are a PREFIX SUM rebuilt when the count or the sizing changes,
 * so a scroll costs two binary searches and no walk — which is what makes a
 * hundred thousand ragged rows behave like ten. A uniform list skips the array
 * entirely and divides.
 *
 * ```tsx
 * const list = ref<HTMLDivElement>();
 * const rows = virtual(list, { count: () => data().length, size: 32 });
 *
 * <div ref={list.set} style={{ overflow: "auto", height: "400px" }}>
 *   <div style={{ height: `${rows.total()}px`, position: "relative" }}>
 *     <For each={rows.items} keyed={(row) => row.index}>
 *       {(row) => (
 *         <div style={{ position: "absolute", top: `${row().start}px` }}>…</div>
 *       )}
 *     </For>
 *   </div>
 * </div>
 * ```
 */
export function virtual(
  container: MaybeAccessor<Element | null | undefined>,
  options: VirtualOptions,
): Virtual {
  const horizontal = options.axis === "horizontal";
  const scroll = scrollPosition(container);
  const size = elementSize(container);
  const measured = horizontal ? size.width : size.height;
  // Before the observer reports, the container has no measured size and every
  // range would be empty. A fallback keeps the first paint non-blank.
  const viewport = () => measured() || 600;
  const offset = () => (horizontal ? scroll.x() : scroll.y());

  const uniform = typeof options.size !== "function";

  /** Cumulative offsets, one longer than the list: `offsets[i]` starts item `i`. */
  const offsets = computed<readonly number[] | null>(() => {
    if (uniform) return null;
    const count = access(options.count);
    const sizeOf = options.size as (index: number) => number;
    const sums = new Array<number>(count + 1);
    sums[0] = 0;
    for (let i = 0; i < count; i++) sums[i + 1] = (sums[i] as number) + sizeOf(i);
    return sums;
  });

  const total = computed(() => {
    const sums = offsets();
    if (sums !== null) return sums[sums.length - 1] ?? 0;
    return access(options.count) * access(options.size as MaybeAccessor<number>);
  });

  /** The first item whose END is past `at`. */
  const indexAt = (at: number): number => {
    const sums = untrack(offsets);
    if (sums === null) {
      const each = access(options.size as MaybeAccessor<number>);
      return each <= 0 ? 0 : Math.floor(at / each);
    }
    let low = 0;
    let high = sums.length - 1;
    while (low < high) {
      const mid = (low + high) >> 1;
      if ((sums[mid + 1] as number) <= at) low = mid + 1;
      else high = mid;
    }
    return low;
  };

  const range = computed(() => {
    const count = access(options.count);
    if (count === 0) return { start: 0, end: 0 };
    const pad = access(options.overscan ?? 3);
    const top = offset();
    const first = clamp(indexAt(top) - pad, 0, count - 1);
    const last = clamp(indexAt(top + viewport()) + pad, first, count - 1);
    return { start: first, end: last + 1 };
  });

  const items = computed<readonly VirtualItem[]>(() => {
    const { start, end } = range();
    const sums = offsets();
    const each = uniform ? access(options.size as MaybeAccessor<number>) : 0;
    const out: VirtualItem[] = [];
    for (let index = start; index < end; index++) {
      out.push(
        sums === null
          ? { index, start: index * each, size: each }
          : {
              index,
              start: sums[index] as number,
              size: (sums[index + 1] as number) - (sums[index] as number),
            },
      );
    }
    return out;
  });

  const startOf = (index: number): number => {
    const sums = untrack(offsets);
    if (sums !== null) return sums[clamp(index, 0, sums.length - 1)] ?? 0;
    return index * access(options.size as MaybeAccessor<number>);
  };

  return {
    items,
    total,
    range,
    viewport,
    scrollTo(index, behavior) {
      const element = access(container);
      if (element === null || element === undefined) return;
      const to = startOf(index);
      element.scrollTo(horizontal ? { left: to, behavior } : { top: to, behavior });
    },
  };
}
