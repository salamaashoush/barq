/**
 * Rendering only the rows that are on screen.
 *
 * A collection of ten thousand rows is ten thousand elements, ten thousand
 * press handlers and ten thousand entries in the accessibility tree, and a
 * browser will not hold that at sixty frames a second. Virtualisation renders
 * the visible window and lies about the rest: the scroll container is sized to
 * the WHOLE collection so the scrollbar is honest, and each visible row is
 * positioned absolutely where it would have been.
 *
 * Three things follow, and all three are why this cannot be a generic "render
 * a window of an array" helper:
 *
 * - **A screen reader is told the truth.** `aria-setsize` and `aria-posinset`
 *   name the item's place in the WHOLE collection, not in the window; without
 *   them a reader announces "1 of 12" halfway down a list of ten thousand.
 * - **Keyboard navigation stops being about the DOM.** Page Up and Page Down
 *   move by a viewport, and the elements a viewport away do not exist. That is
 *   what {@link LayoutDelegate} is for, and why a {@link Layout} is one.
 * - **Focus must survive scrolling away.** The focused row can be unmounted
 *   while it still holds focus, so the collection keeps its key and restores
 *   it when the row comes back.
 *
 * ## What this is not
 *
 * react-aria recycles view objects (`ReusableView`) so React does not remount
 * a row that moved. Nothing here does, and nothing needs to: `<For>` keys rows
 * by item, so a row that stays in the window keeps its element, its scope and
 * its state across a scroll, and one that leaves is disposed exactly once.
 *
 * There is no drag-and-drop layout either, because this package has no
 * drag-and-drop.
 */

import {
  type Accessor,
  type Child,
  createContext,
  createEffect,
  getContext,
  type Incoming,
  provide,
  createSignal,
  untrack,
} from "@barqjs/core";
import { isServer } from "@barqjs/web";
import { ListCollection } from "./collections.ts";
import type { Collection, Key, LayoutDelegate, Node, Rect, Size } from "./collections.ts";
import { access, type MaybeAccessor } from "./utils.ts";
import { addEvent, contains, ownerWindow, propagationTargets } from "./dom.ts";
import type { ElementRef } from "./interactions/press.ts";
import type { DropTarget, ItemDropTarget } from "./dnd/types.ts";

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export interface Point {
  x: number;
  y: number;
}

/** A rectangle from its edges, which is how a layout thinks about one. */
export function rect(x: number, y: number, width: number, height: number): Rect {
  return { x, y, width, height };
}

export function rectMaxX(r: Rect): number {
  return r.x + r.width;
}

export function rectMaxY(r: Rect): number {
  return r.y + r.height;
}

/** Whether two rectangles overlap at all. Touching edges do not count. */
export function rectIntersects(a: Rect, b: Rect): boolean {
  return a.x < rectMaxX(b) && rectMaxX(a) > b.x && a.y < rectMaxY(b) && rectMaxY(a) > b.y;
}

export function rectContainsPoint(r: Rect, point: Point): boolean {
  return point.x >= r.x && point.x <= rectMaxX(r) && point.y >= r.y && point.y <= rectMaxY(r);
}

export function rectEquals(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

// ---------------------------------------------------------------------------
// What a layout says about one item
// ---------------------------------------------------------------------------

export interface LayoutInfo {
  /** Matches the collection node's `type`: "item", "section", "header". */
  type: string;
  key: Key;
  rect: Rect;
  parentKey: Key | null;
  /**
   * The size is a GUESS until the row has been in the DOM once.
   *
   * A list of rows whose height depends on their content cannot be laid out
   * without rendering them, and rendering them all is the thing being avoided.
   * So the layout guesses, the virtualiser measures what it rendered, and the
   * guess is replaced — which moves everything below it, which is why
   * `updateItemSize` returns whether anything changed.
   */
  isEstimated: boolean;
  /** Stays put while its section scrolls under it. */
  isSticky: boolean;
}

export function layoutInfo(
  type: string,
  key: Key,
  bounds: Rect,
  extra: Partial<Omit<LayoutInfo, "type" | "key" | "rect">> = {},
): LayoutInfo {
  return {
    type,
    key,
    rect: bounds,
    parentKey: extra.parentKey ?? null,
    isEstimated: extra.isEstimated ?? false,
    isSticky: extra.isSticky ?? false,
  };
}

// ---------------------------------------------------------------------------
// The layout
// ---------------------------------------------------------------------------

export interface LayoutContext {
  collection: Collection<unknown>;
  /** What the scroll container shows, in content coordinates. */
  visibleRect: Rect;
  /**
   * The size of the scroll container's box. @default the visible rectangle's
   *
   * Larger than the visible rectangle when the page scrolls the container
   * rather than the container itself: rows are as wide as the container,
   * however little of it is on screen.
   */
  size?: Size;
}

/**
 * Where every item in a collection goes.
 *
 * It is a {@link LayoutDelegate} as well, which is the whole point: once the
 * rows are not all in the DOM, "what is the key above this one" and "how far
 * is a page" have to be answered from the layout rather than by measuring
 * elements that are not there.
 */
export abstract class Layout implements LayoutDelegate {
  protected context: LayoutContext = {
    collection: emptyCollection(),
    visibleRect: rect(0, 0, 0, 0),
  };

  /** Recompute. Called whenever the collection or the visible rectangle moves. */
  update(context: LayoutContext): void {
    this.context = context;
  }

  /** The window moved but the layout did not: keep the rectangle current. */
  setVisibleRect(area: Rect): void {
    this.context = { ...this.context, visibleRect: area };
  }

  abstract getLayoutInfo(key: Key): LayoutInfo | null;

  /** Every item overlapping the rectangle, in collection order. */
  abstract getVisibleLayoutInfos(area: Rect): LayoutInfo[];

  abstract getContentSize(): Size;

  /**
   * Whether a change in the visible rectangle needs a fresh layout.
   *
   * Only a resize by default: scrolling moves the window over a layout that
   * has not changed. A layout with sticky headers overrides it to `true`,
   * because where a header sits depends on where the scroll is.
   */
  shouldInvalidate(next: Rect, previous: Rect): boolean {
    return next.width !== previous.width || next.height !== previous.height;
  }

  /** The real size of a row that was measured. Returns whether it moved anything. */
  updateItemSize?(key: Key, size: Size): boolean;

  /**
   * Whether a loader is showing its loading row. A layout that answers gives
   * the loader a row's height only while it does. Returns whether that moved
   * anything.
   */
  updateLoaderState?(key: Key, isLoading: boolean): boolean;

  /**
   * The drop target under a point, the point measured from the scrolling
   * element's own corner. A layout that answers is what lets a virtualised
   * collection take a drop: the rows a point may fall between are mostly not
   * in the document to be measured.
   */
  getDropTargetFromPoint?(
    x: number,
    y: number,
    isValidDropTarget: (target: DropTarget) => boolean,
  ): DropTarget | null;

  /** Where the indicator for a position before or after an item is drawn. */
  getDropTargetLayoutInfo?(target: ItemDropTarget): LayoutInfo | null;

  getItemRect(key: Key): Rect | null {
    return this.getLayoutInfo(key)?.rect ?? null;
  }

  getVisibleRect(): Rect {
    return this.context.visibleRect;
  }

  getKeyRange(from: Key, to: Key): Key[] {
    const start = this.getLayoutInfo(from);
    const end = this.getLayoutInfo(to);
    if (start === null || end === null) return [];

    const top = Math.min(start.rect.y, end.rect.y);
    const bottom = Math.max(rectMaxY(start.rect), rectMaxY(end.rect));
    return this.getVisibleLayoutInfos(rect(0, top, this.getContentSize().width, bottom - top))
      .filter((info) => info.type === "item")
      .map((info) => info.key);
  }
}

/** What a layout holds before it has been given anything to lay out. */
function emptyCollection(): Collection<unknown> {
  return new ListCollection<unknown>([]);
}

// ---------------------------------------------------------------------------
// A list of rows
// ---------------------------------------------------------------------------

/** How near a row's edge a point counts as between rows, where a drop on the row is allowed. */
const DROP_EDGE = 10;
/** The height an indicator between two rows is given. Its look is the caller's. */
const DROP_INDICATOR_THICKNESS = 2;

export interface ListLayoutOptions {
  /** A fixed height for every row. Leave it out to estimate and measure. */
  rowHeight?: number;
  /** The starting guess when `rowHeight` is not given. @default 48 */
  estimatedRowHeight?: number;
  /** A fixed height for a section's heading. */
  headingHeight?: number;
  /** @default 36 */
  estimatedHeadingHeight?: number;
  /** Space between rows. @default 0 */
  gap?: number;
  /** Space around the whole list. @default 0 */
  padding?: number;
  /** Keep a section's heading in view while its rows scroll under it. */
  stickyHeadings?: boolean;
  /** The height of a loader's row while it is loading. @default `rowHeight`, or `estimatedRowHeight` */
  loaderHeight?: number;
}

/**
 * Rows stacked vertically, with optional section headings.
 *
 * Heights may be fixed or estimated. Estimated is the honest default for text
 * that wraps: the layout guesses, the virtualiser measures what it actually
 * rendered, and every row below the corrected one moves. That correction is
 * why the scrollbar drifts slightly on first scroll through a list of
 * estimated rows, and why `rowHeight` is worth giving when it is known.
 *
 * A loader takes `loaderHeight` while it is loading and nothing otherwise, and
 * is in every window whatever the scroll: its sentinel is what asks for the
 * next page, and it can only do that while it is rendered.
 */
export class ListLayout extends Layout {
  #options: Required<ListLayoutOptions>;
  #infos = new Map<Key, LayoutInfo>();
  /** In collection order, so a visible range is a slice rather than a scan. */
  #order: LayoutInfo[] = [];
  /** A measured height, and the width it was measured at. */
  #measured = new Map<Key, { height: number; width: number }>();
  #width = 0;
  #contentHeight = 0;
  /** The loaders whose loading row is showing. */
  #loading = new Set<Key>();

  constructor(options: ListLayoutOptions = {}) {
    super();
    this.#options = {
      rowHeight: options.rowHeight ?? Number.NaN,
      estimatedRowHeight: options.estimatedRowHeight ?? 48,
      headingHeight: options.headingHeight ?? Number.NaN,
      estimatedHeadingHeight: options.estimatedHeadingHeight ?? 36,
      gap: options.gap ?? 0,
      padding: options.padding ?? 0,
      stickyHeadings: options.stickyHeadings ?? false,
      loaderHeight: options.loaderHeight ?? options.rowHeight ?? options.estimatedRowHeight ?? 48,
    };
  }

  override shouldInvalidate(next: Rect, previous: Rect): boolean {
    if (this.#options.stickyHeadings) return true;
    return super.shouldInvalidate(next, previous);
  }

  override update(context: LayoutContext): void {
    super.update(context);

    const width = Math.max(
      0,
      (context.size?.width ?? context.visibleRect.width) - this.#options.padding * 2,
    );
    this.#width = width;
    const previous = this.#infos;
    this.#infos = new Map();
    this.#order = [];

    let y = this.#options.padding;

    const place = (node: Node<unknown>, parentKey: Key | null, isHeading: boolean): void => {
      const isLoader = node.type === "loader";
      const height = isLoader
        ? this.#loading.has(node.key)
          ? this.#options.loaderHeight
          : 0
        : this.#heightOf(node.key, isHeading);
      const info = layoutInfo(node.type, node.key, rect(this.#options.padding, y, width, height), {
        parentKey,
        isEstimated: !isLoader && this.#isEstimated(node.key, isHeading),
        isSticky: isHeading && this.#options.stickyHeadings,
      });
      this.#infos.set(node.key, info);
      this.#order.push(info);
      y += height + this.#options.gap;
    };

    const walk = (nodes: Iterable<Node<unknown>>, parentKey: Key | null): void => {
      for (const node of nodes) {
        if (node.type === "section") {
          place(node, parentKey, true);
          walk(context.collection.getChildren?.(node.key) ?? [], node.key);
        } else {
          place(node, parentKey, false);
        }
      }
    };

    walk(context.collection, null);

    // The trailing gap is between rows, not after the last one.
    this.#contentHeight =
      Math.max(this.#options.padding, y - this.#options.gap) + this.#options.padding;

    // A measurement survives a collection change: the row is the same row.
    // It does not survive a change of width, which `#isEstimated` has said.
    for (const [key, info] of this.#infos) {
      const old = previous.get(key);
      if (old !== undefined && !old.isEstimated && old.rect.width === info.rect.width) {
        info.isEstimated = false;
      }
    }
  }

  /**
   * Whether a row's height is a guess.
   *
   * A height measured at another width is one: text that wraps takes more or
   * fewer lines when the row narrows, so the old height is kept as the guess
   * and the row is measured again. Left as measured, the row would be drawn
   * at a fixed height that no longer fits it and never observed again.
   */
  #isEstimated(key: Key, isHeading: boolean): boolean {
    const fixed = !Number.isNaN(isHeading ? this.#options.headingHeight : this.#options.rowHeight);
    const measured = this.#measured.get(key);
    if (measured === undefined) return !fixed;
    return !fixed && measured.width !== this.#width;
  }

  #heightOf(key: Key, isHeading: boolean): number {
    const measured = this.#measured.get(key)?.height;
    if (measured !== undefined) return measured;
    const fixed = isHeading ? this.#options.headingHeight : this.#options.rowHeight;
    if (!Number.isNaN(fixed)) return fixed;
    return isHeading ? this.#options.estimatedHeadingHeight : this.#options.estimatedRowHeight;
  }

  override getLayoutInfo(key: Key): LayoutInfo | null {
    return this.#infos.get(key) ?? null;
  }

  override getVisibleLayoutInfos(area: Rect): LayoutInfo[] {
    const visible: LayoutInfo[] = [];
    let at = 0;
    for (; at < this.#order.length; at++) {
      const info = this.#order[at] as LayoutInfo;
      if (info.isSticky || info.type === "loader" || rectIntersects(info.rect, area)) {
        visible.push(info);
      }
      // In order, so once past the bottom there is nothing left — except a
      // sticky heading, which is why the loop does not break early when
      // headings stick.
      else if (info.rect.y > rectMaxY(area) && !this.#options.stickyHeadings) break;
    }
    // Nor a loader below the window, which is always rendered.
    for (; at < this.#order.length; at++) {
      const info = this.#order[at] as LayoutInfo;
      if (info.type === "loader") visible.push(info);
    }
    return visible;
  }

  override getContentSize(): Size {
    const width = this.context.size?.width ?? this.context.visibleRect.width;
    return { width, height: this.#contentHeight };
  }

  override updateItemSize(key: Key, size: Size): boolean {
    const known = this.#measured.get(key);
    // The width the layout gave the row, which is what it was measured at.
    const width = this.#infos.get(key)?.rect.width ?? this.#width;
    if (known !== undefined && known.height === size.height && known.width === width) return false;
    this.#measured.set(key, { height: size.height, width });
    return true;
  }

  override updateLoaderState(key: Key, isLoading: boolean): boolean {
    if (this.#loading.has(key) === isLoading) return false;
    if (isLoading) this.#loading.add(key);
    else this.#loading.delete(key);
    return true;
  }

  override getDropTargetFromPoint(
    x: number,
    y: number,
    isValidDropTarget: (target: DropTarget) => boolean,
  ): DropTarget | null {
    const visible = this.context.visibleRect;
    const at = y + visible.y;
    const gap = this.#options.gap;
    // A point in the gap between two rows belongs to the nearer of them.
    const search = rect(x + visible.x, Math.max(0, at - gap), 1, Math.max(1, gap * 2));

    let nearest: LayoutInfo | null = null;
    let distance = Number.POSITIVE_INFINITY;
    for (const info of this.#order) {
      if (info.type !== "item" || !rectIntersects(info.rect, search)) continue;
      const away = Math.min(Math.abs(info.rect.y - at), Math.abs(rectMaxY(info.rect) - at));
      if (away < distance) {
        distance = away;
        nearest = info;
      }
    }
    if (nearest === null || this.context.collection.size === 0) return { type: "root" };

    const start = nearest.rect.y;
    const end = rectMaxY(nearest.rect);
    const on: ItemDropTarget = { type: "item", key: nearest.key, dropPosition: "on" };
    const before: ItemDropTarget = { ...on, dropPosition: "before" };
    const after: ItemDropTarget = { ...on, dropPosition: "after" };

    if (!isValidDropTarget(on)) {
      if (at <= start + nearest.rect.height / 2 && isValidDropTarget(before)) return before;
      return isValidDropTarget(after) ? after : on;
    }
    // Still between rows within reach of an edge, where a drop on is allowed.
    if (at <= start + DROP_EDGE && isValidDropTarget(before)) return before;
    if (at >= end - DROP_EDGE && isValidDropTarget(after)) return after;
    return on;
  }

  override getDropTargetLayoutInfo(target: ItemDropTarget): LayoutInfo | null {
    let info = this.#infos.get(target.key);
    if (info === undefined) return null;

    if (target.dropPosition === "after") {
      // After the last row of the item's own branch, which is where an
      // expanded parent ends.
      const collection = this.context.collection;
      const level = collection.getItem(target.key)?.level ?? 0;
      let next = collection.getKeyAfter(target.key);
      while (next !== null) {
        const node = collection.getItem(next);
        if (node === null || node === undefined || (node.level ?? 0) <= level) break;
        info = this.#infos.get(next) ?? info;
        next = collection.getKeyAfter(next);
      }
    }

    const y =
      target.dropPosition === "before"
        ? Math.max(0, info.rect.y - DROP_INDICATOR_THICKNESS / 2)
        : target.dropPosition === "after"
          ? rectMaxY(info.rect) - DROP_INDICATOR_THICKNESS / 2
          : info.rect.y;
    const height = target.dropPosition === "on" ? info.rect.height : DROP_INDICATOR_THICKNESS;
    return layoutInfo("item", target.key, rect(info.rect.x, y, info.rect.width, height), {
      parentKey: info.parentKey,
    });
  }

  override getKeyRange(from: Key, to: Key): Key[] {
    const start = this.#infos.get(from);
    const end = this.#infos.get(to);
    if (start === undefined || end === undefined) return [];

    const first = this.#order.indexOf(start);
    const last = this.#order.indexOf(end);
    const [a, b] = first <= last ? [first, last] : [last, first];
    return this.#order
      .slice(a, b + 1)
      .filter((info) => info.type === "item")
      .map((info) => info.key);
  }
}

/** `new ListLayout(...)`, for a call site that reads better without `new`. */
export function listLayout(options: ListLayoutOptions = {}): ListLayout {
  return new ListLayout(options);
}

// ---------------------------------------------------------------------------
// The state
// ---------------------------------------------------------------------------

export interface VirtualizerOptions {
  layout: Layout;
  collection: Accessor<Collection<unknown>>;
  /** The scrolling element. */
  ref: ElementRef;
  /**
   * How much to render beyond the visible rectangle, as a fraction of it.
   *
   * Zero renders exactly what is on screen, and a fast scroll then shows blank
   * space for a frame. @default 1
   */
  overscan?: MaybeAccessor<number | undefined>;
  /** Always render these, wherever they are: the focused row is one. */
  persistedKeys?: MaybeAccessor<Iterable<Key> | undefined>;
}

export interface VirtualizerState {
  /** What to render, in collection order. */
  visible: Accessor<LayoutInfo[]>;
  /** The size the scroll container must claim for the scrollbar to be honest. */
  contentSize: Accessor<Size>;
  visibleRect: Accessor<Rect>;
  /** Report a rendered row's real size, for a layout that estimated it. */
  measure: (key: Key, size: Size) => void;
  /** Report whether a loader is showing its loading row. */
  setLoading: (key: Key, isLoading: boolean) => void;
  layout: Layout;
}

/**
 * Which rows are on screen, kept up to date as the container scrolls.
 *
 * The scroll listener is passive and does no layout of its own: it reads
 * `scrollTop` and `clientHeight`, which the browser already knows, and writes
 * a signal. Everything else falls out of that reactively.
 */
export function virtualizer(options: VirtualizerOptions): VirtualizerState {
  const [visibleRect, writeVisibleRect] = createSignal<Rect>(rect(0, 0, 0, 0));
  const [size, writeSize] = createSignal<Size>({ width: 0, height: 0 });
  const [revision, setRevision] = createSignal(0);

  const overscan = (): number => access(options.overscan) ?? 1;

  /**
   * What of the container is on screen: its own scroll position, clipped to
   * the window.
   *
   * A container that grows with its content never scrolls itself; the page
   * does. Its whole height would then count as visible and every row would
   * render, so the part of it above the viewport is skipped and no more than
   * a viewport is taken. Scrollers between it and the page are not measured,
   * only their scroll positions, which can render up to a viewport more than
   * is shown and never less.
   */
  const read = (element: HTMLElement): void => {
    const view = ownerWindow(element);
    const bounds = element.getBoundingClientRect();
    const offsetX = bounds.left < 0 ? -bounds.left : 0;
    const offsetY = bounds.top < 0 ? -bounds.top : 0;
    const next = rect(
      offsetX + element.scrollLeft,
      offsetY + element.scrollTop,
      Math.max(0, Math.min(element.clientWidth - offsetX, view.innerWidth)),
      Math.max(0, Math.min(element.clientHeight - offsetY, view.innerHeight)),
    );
    const box = { width: element.clientWidth, height: element.clientHeight };
    const known = untrack(size);
    if (box.width !== known.width || box.height !== known.height) writeSize(box);
    if (!rectEquals(next, untrack(visibleRect))) writeVisibleRect(next);
  };

  if (!isServer) {
    createEffect(
      () => access(options.ref) as HTMLElement | null,
      (element) => {
        if (element === null) return undefined;

        const measure = (): void => read(element);
        measure();
        // Captured at the window, so the page or any scroller around the
        // container moving it is seen as well as the container's own scroll.
        const onScroll = (event: Event): void => {
          const target = event.target;
          if (target instanceof Node && !contains(target, element)) return;
          measure();
        };
        const stopScroll = addEvent(propagationTargets(element), "scroll", onScroll, {
          capture: true,
          passive: true,
        });
        const stopResize = addEvent(ownerWindow(element), "resize", measure);

        const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
        observer?.observe(element);

        return () => {
          stopScroll();
          stopResize();
          observer?.disconnect();
        };
      },
    );
  }

  /**
   * The layout, brought up to date.
   *
   * `update` runs when the collection changes, when a measurement corrected an
   * estimate, or when the layout says the new visible rectangle matters — a
   * resize, or any scroll at all when headings stick. A plain scroll otherwise
   * only moves the window over a layout that has not changed, but the
   * rectangle is still stored, because `getVisibleRect` is what answers the
   * keyboard delegate's "how far is a page".
   */
  let lastRect = rect(0, 0, 0, 0);
  let lastCollection: Collection<unknown> | null = null;
  const laidOut = (): Layout => {
    revision();
    const area = visibleRect();
    const box = size();
    const collection = options.collection();
    // The layout is asked about the container's box: the window clipping it
    // changes what is on screen, not where anything goes.
    const sized = rect(area.x, area.y, box.width, box.height);
    const stale = collection !== lastCollection || options.layout.shouldInvalidate(sized, lastRect);

    if (stale) options.layout.update({ collection, visibleRect: area, size: box });
    else options.layout.setVisibleRect(area);

    lastCollection = collection;
    lastRect = sized;
    return options.layout;
  };

  const visible = (): LayoutInfo[] => {
    const layout = laidOut();
    const area = visibleRect();
    const margin = area.height * overscan();
    const window_ = rect(area.x, area.y - margin, area.width, area.height + margin * 2);

    const found = layout.getVisibleLayoutInfos(window_);
    const held = [...(access(options.persistedKeys) ?? [])];
    if (held.length === 0) return found;

    const seen = new Set(found.map((info) => info.key));
    for (const key of held) {
      if (seen.has(key)) continue;
      const info = layout.getLayoutInfo(key);
      // Appended rather than inserted in order: a persisted row is off screen,
      // so where it sits among the visible ones says nothing. Its position
      // comes from its rect, not from the order it was rendered in.
      if (info !== null) found.push(info);
    }
    return found;
  };

  const contentSize = (): Size => laidOut().getContentSize();

  const measure = (key: Key, measured: Size): void => {
    if (options.layout.updateItemSize?.(key, measured) === true) setRevision((n) => n + 1);
  };

  const setLoading = (key: Key, isLoading: boolean): void => {
    if (options.layout.updateLoaderState?.(key, isLoading) === true) setRevision((n) => n + 1);
  };

  return { visible, contentSize, visibleRect, measure, setLoading, layout: options.layout };
}

// ---------------------------------------------------------------------------
// The seam a collection component renders through
// ---------------------------------------------------------------------------

export interface VirtualizerValue {
  layout: Layout;
  /**
   * Told by the collection below what it holds and what scrolls.
   *
   * The virtualiser is written OUTSIDE the collection so a caller can choose
   * the layout, but the collection and the scrolling element are the
   * collection's own. So this is the handshake: the wrapper provides the
   * layout, the collection hands back the two things only it knows.
   */
  attach: (
    collection: Accessor<Collection<unknown>>,
    ref: ElementRef,
    focusedKey: Accessor<Key | null>,
    /** Rows the collection needs kept, as the one a drop is aimed at. */
    persistedKeys?: Accessor<Iterable<Key>>,
  ) => void;
  /** What to render, in collection order. */
  visible: Accessor<LayoutInfo[]>;
  contentSize: Accessor<Size>;
  measure: (key: Key, size: Size) => void;
  /** Whether a loader is showing its loading row, which the layout gives a height. */
  setLoading: (key: Key, isLoading: boolean) => void;
  /** Whether rows should measure themselves: only when the layout estimated. */
  shouldMeasure: Accessor<boolean>;
}

const VirtualizerContext = createContext<VirtualizerValue | null>(null);

/** The enclosing {@link Virtualizer}, if the collection is inside one. */
export function useVirtualizer(): VirtualizerValue | null {
  return getContext(VirtualizerContext) ?? null;
}

/**
 * The style the scrolling element carries, so the scrollbar tells the truth.
 *
 * `position: relative` because the rows inside are positioned absolutely
 * against it, and the height of the WHOLE collection because that is what the
 * scrollbar is measuring — the rendered rows are a fraction of it.
 */
export function contentStyle(size: Size): Record<string, string> {
  return { position: "relative", height: `${size.height}px` };
}

/**
 * The style a virtualised row carries.
 *
 * Absolute, from the layout. The rows above it are not rendered, so document
 * flow has nothing to go on; where the row belongs is what the layout says.
 * A row whose height was ESTIMATED is left to size itself, so it can be
 * measured and the estimate corrected.
 */
export function rowStyle(info: LayoutInfo): Record<string, string> {
  return {
    position: info.isSticky ? "sticky" : "absolute",
    top: `${info.rect.y}px`,
    left: `${info.rect.x}px`,
    width: `${info.rect.width}px`,
    ...(info.isEstimated ? {} : { height: `${info.rect.height}px` }),
    ...(info.isSticky ? { zIndex: "1" } : {}),
  };
}

/**
 * Measure a virtualised row and report its real height.
 *
 * Only for a layout that ESTIMATED: a fixed-height layout already knows, and
 * observing every row to be told what it was told would cost more than the
 * virtualisation saves.
 */
export function measureRow(virtual: VirtualizerValue | null, key: Key, ref: ElementRef): void {
  if (isServer || virtual === null) return;

  createEffect(
    () => (virtual.shouldMeasure() ? (access(ref) as HTMLElement | null) : null),
    (element) => {
      if (element === null) return undefined;

      const report = (): void => {
        virtual.measure(key, { width: element.offsetWidth, height: element.offsetHeight });
      };
      report();

      if (typeof ResizeObserver === "undefined") return undefined;
      const observer = new ResizeObserver(report);
      observer.observe(element);
      return () => observer.disconnect();
    },
  );
}

export interface VirtualizerComponentProps {
  /** Where the rows go. {@link listLayout} builds the usual one. */
  layout: Layout;
  /** See {@link VirtualizerOptions.overscan}. @default 1 */
  overscan?: number;
  /** Always rendered, wherever they are. The focused row is added anyway. */
  persistedKeys?: Iterable<Key>;
  children?: Child;
}

/**
 * Render only the rows that are on screen.
 *
 * ```tsx
 * <Virtualizer layout={listLayout({ rowHeight: 32 })}>
 *   <ListBox label="Cities" items={cities()} style={{ height: "300px", overflow: "auto" }}>
 *     {(city) => <Option>{city.name}</Option>}
 *   </ListBox>
 * </Virtualizer>
 * ```
 *
 * The collection inside keeps its whole collection — the state, the selection
 * and the keyboard delegate all see every item. Only the DOM is a window.
 */
export function Virtualizer(props: Incoming<VirtualizerComponentProps>) {
  // Boxed: a signal holding a FUNCTION would call it, and both of these are
  // functions that must be stored rather than read.
  //
  // `ownedWrite` because the collection attaches from its own component body,
  // which is the only place it knows what to hand over.
  const ATTACHED = { ownedWrite: true } as const;
  const [collection, setCollection] = createSignal<{ read: Accessor<Collection<unknown>> }>(
    { read: () => new ListCollection<unknown>([]) },
    ATTACHED,
  );
  const [scrollRef, setScrollRef] = createSignal<{ ref: ElementRef } | null>(null, ATTACHED);
  const [focusedKey, setFocusedKey] = createSignal<{ read: Accessor<Key | null> }>(
    { read: () => null },
    ATTACHED,
  );
  const [kept, setKept] = createSignal<{ read: Accessor<Iterable<Key>> }>(
    { read: () => [] },
    ATTACHED,
  );
  const layout = props.layout();

  const state = virtualizer({
    layout,
    collection: () => collection().read(),
    ref: () => {
      const held = scrollRef();
      return held === null ? null : access(held.ref);
    },
    overscan: () => props.overscan?.(),
    // The FOCUSED row is persisted whatever the caller asked for: unmounting
    // the element that holds focus drops focus to the body, and a keyboard
    // user scrolling with the arrows would lose their place every time.
    persistedKeys: () => {
      const focused = focusedKey().read();
      const given = [...(props.persistedKeys?.() ?? []), ...kept().read()];
      return focused === null ? given : [...given, focused];
    },
  });

  const value: VirtualizerValue = {
    layout,
    attach: (source, ref, focused, persisted) => {
      setCollection({ read: source });
      setScrollRef({ ref });
      setFocusedKey({ read: focused });
      if (persisted !== undefined) setKept({ read: persisted });
    },
    visible: state.visible,
    contentSize: state.contentSize,
    measure: state.measure,
    setLoading: state.setLoading,
    shouldMeasure: () => state.visible().some((info) => info.isEstimated),
  };

  // `provide`, not `install`: two virtualised lists side by side both run
  // their bodies before either one's children are built.
  return provide(
    VirtualizerContext,
    () => value,
    () => props.children as unknown,
  );
}
