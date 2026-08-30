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
  context,
  effect,
  getContext,
  getOwner,
  type Incoming,
  isServer,
  provide,
  signal,
  untrack,
} from "@barqjs/core";
import { ListCollection } from "./collections.ts";
import type { Collection, Key, LayoutDelegate, Node, Rect, Size } from "./collections.ts";
import { access, type MaybeAccessor } from "./utils.ts";
import type { ElementRef } from "./interactions/press.ts";

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
    this.context = { collection: this.context.collection, visibleRect: area };
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
}

/**
 * Rows stacked vertically, with optional section headings.
 *
 * Heights may be fixed or estimated. Estimated is the honest default for text
 * that wraps: the layout guesses, the virtualiser measures what it actually
 * rendered, and every row below the corrected one moves. That correction is
 * why the scrollbar drifts slightly on first scroll through a list of
 * estimated rows, and why `rowHeight` is worth giving when it is known.
 */
export class ListLayout extends Layout {
  #options: Required<ListLayoutOptions>;
  #infos = new Map<Key, LayoutInfo>();
  /** In collection order, so a visible range is a slice rather than a scan. */
  #order: LayoutInfo[] = [];
  #measured = new Map<Key, number>();
  #contentHeight = 0;

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
    };
  }

  override shouldInvalidate(next: Rect, previous: Rect): boolean {
    if (this.#options.stickyHeadings) return true;
    return super.shouldInvalidate(next, previous);
  }

  override update(context: LayoutContext): void {
    super.update(context);

    const width = Math.max(0, context.visibleRect.width - this.#options.padding * 2);
    const previous = this.#infos;
    this.#infos = new Map();
    this.#order = [];

    let y = this.#options.padding;

    const place = (node: Node<unknown>, parentKey: Key | null, isHeading: boolean): void => {
      const height = this.#heightOf(node.key, isHeading);
      const info = layoutInfo(node.type, node.key, rect(this.#options.padding, y, width, height), {
        parentKey,
        isEstimated: this.#isEstimated(node.key, isHeading),
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
    for (const [key, info] of this.#infos) {
      const old = previous.get(key);
      if (old !== undefined && !old.isEstimated) info.isEstimated = false;
    }
  }

  #isEstimated(key: Key, isHeading: boolean): boolean {
    if (this.#measured.has(key)) return false;
    return Number.isNaN(isHeading ? this.#options.headingHeight : this.#options.rowHeight);
  }

  #heightOf(key: Key, isHeading: boolean): number {
    const measured = this.#measured.get(key);
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
    for (const info of this.#order) {
      if (info.isSticky || rectIntersects(info.rect, area)) visible.push(info);
      // In order, so once past the bottom there is nothing left — except a
      // sticky heading, which is why the loop does not break early when
      // headings stick.
      else if (info.rect.y > rectMaxY(area) && !this.#options.stickyHeadings) break;
    }
    return visible;
  }

  override getContentSize(): Size {
    return { width: this.context.visibleRect.width, height: this.#contentHeight };
  }

  override updateItemSize(key: Key, size: Size): boolean {
    const known = this.#measured.get(key);
    if (known === size.height) return false;
    this.#measured.set(key, size.height);
    return true;
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
  const visibleRect = signal<Rect>(rect(0, 0, 0, 0));
  const revision = signal(0);

  const overscan = (): number => access(options.overscan) ?? 1;

  const read = (): void => {
    const element = access(options.ref) as HTMLElement | null;
    if (element === null) return;
    const next = rect(
      element.scrollLeft,
      element.scrollTop,
      element.clientWidth,
      element.clientHeight,
    );
    if (!rectEquals(next, untrack(visibleRect))) visibleRect.set(next);
  };

  if (!isServer) {
    effect(() => {
      const element = access(options.ref) as HTMLElement | null;
      if (element === null) return undefined;

      read();
      element.addEventListener("scroll", read, { passive: true });

      const observer =
        typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => read());
      observer?.observe(element);

      return () => {
        element.removeEventListener("scroll", read);
        observer?.disconnect();
      };
    });
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
    const collection = options.collection();
    const stale = collection !== lastCollection || options.layout.shouldInvalidate(area, lastRect);

    if (stale) options.layout.update({ collection, visibleRect: area });
    else options.layout.setVisibleRect(area);

    lastCollection = collection;
    lastRect = area;
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

  const measure = (key: Key, size: Size): void => {
    if (options.layout.updateItemSize?.(key, size) === true) revision.update((n) => n + 1);
  };

  return { visible, contentSize, visibleRect, measure, layout: options.layout };
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
  ) => void;
  /** What to render, in collection order. */
  visible: Accessor<LayoutInfo[]>;
  contentSize: Accessor<Size>;
  measure: (key: Key, size: Size) => void;
  /** Whether rows should measure themselves: only when the layout estimated. */
  shouldMeasure: Accessor<boolean>;
}

const VirtualizerContext = context<VirtualizerValue | null>(null);

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

  effect(() => {
    if (!virtual.shouldMeasure()) return undefined;
    const element = access(ref) as HTMLElement | null;
    if (element === null) return undefined;

    const report = (): void => {
      virtual.measure(key, { width: element.offsetWidth, height: element.offsetHeight });
    };
    report();

    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(report);
    observer.observe(element);
    return () => observer.disconnect();
  });
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
  const collection = signal<{ read: Accessor<Collection<unknown>> }>({
    read: () => new ListCollection<unknown>([]),
  });
  const scrollRef = signal<{ ref: ElementRef } | null>(null);
  const focusedKey = signal<{ read: Accessor<Key | null> }>({ read: () => null });
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
      const given = [...(props.persistedKeys?.() ?? [])];
      return focused === null ? given : [...given, focused];
    },
  });

  const value: VirtualizerValue = {
    layout,
    attach: (source, ref, focused) => {
      collection.set({ read: source });
      scrollRef.set({ ref });
      focusedKey.set({ read: focused });
    },
    visible: state.visible,
    contentSize: state.contentSize,
    measure: state.measure,
    shouldMeasure: () => state.visible().some((info) => info.isEstimated),
  };

  const owner = getOwner();
  if (owner === null) return <>{props.children}</>;

  // `provide`, not `install`: two virtualised lists side by side both run
  // their bodies before either one's children are built.
  return provide(
    owner,
    VirtualizerContext,
    () => value,
    () => props.children as unknown,
  ) as never;
}
