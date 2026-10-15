/**
 * A viewport that stays at the end while new content arrives.
 *
 * This is the piece `@barqjs/ui`'s `<MessageScroller>` needed. Upstream's is a
 * React primitive package, so the engine is written here and only the behaviour
 * is upstream's.
 *
 * A transcript is the one scroller where the interesting end is the BOTTOM, and
 * three things follow from that.
 *
 * **Sticking is a decision, and it survives new content.** Someone reading at
 * the bottom wants the next message; someone who has scrolled up to read wants
 * to be left alone. So the answer is not "scroll on every append" but "keep
 * doing whatever the last scroll said", and a message arriving does not change
 * what that was.
 *
 * **The end needs a tolerance.** Sub-pixel scroll offsets, a browser zoom and a
 * fractional device pixel ratio all mean
 * `scrollTop + clientHeight === scrollHeight` is almost never exactly true, and
 * a scroller that tests for it is one that never counts as being at the end.
 *
 * **A programmatic scroll is not the person scrolling.** Calling `toEnd()`
 * fires the same `scroll` event a finger does, and reading that event as
 * intent is how a scroller decides the user just scrolled away from the
 * bottom it moved them to.
 *
 * **A new turn goes to the top, not to the bottom.** A row marked as a scroll
 * anchor is the start of an exchange: the question just sent. Following the
 * end would show its last line and then push it away as the reply streams, so
 * it is placed a peek below the top instead and HELD there while what is under
 * it grows. There is usually not enough content below a new last row to scroll
 * it that high, so an empty spacer after the rows makes the room and gives it
 * back as the reply fills it. When none is left the reply has filled the
 * viewport, and following the end takes over.
 *
 * **Only a gesture lets go of a held turn or a jump.** A scroll event cannot
 * tell the person from the engine, and both of those positions are away from
 * the end on purpose. A wheel, a touch move or a scrolling key is the person.
 */

import { createSignal, type Accessor } from "@barqjs/core";

import { access, type MaybeAccessor } from "./utils.ts";

const pixels = (value: string): number => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** How far from the end still counts as being at it, in px. */
const TOLERANCE = 8;
/** How much of the previous message stays in view above a newly anchored one, in px. */
const PEEK = 64;
/** Two positions closer than this are the same one: zoom and HiDPI round differently. */
const EPSILON = 0.5;
/** How long a smooth scroll is assumed to take, which no event reports. */
const SMOOTH = 400;

/** Where a transcript opens the first time it has anything in it. */
export type MessageScrollerDefaultScrollPosition = "start" | "end" | "last-anchor";

export type MessageScrollerScrollAlign = "start" | "center" | "end" | "nearest";

export interface MessageScrollerScrollOptions {
  /** Which edge of the viewport the target lines up with. @default "start" */
  align?: MessageScrollerScrollAlign;
  /** @default "auto" */
  behavior?: ScrollBehavior;
  /** Space kept between the target and that edge, in px. @default the scroller's own */
  scrollMargin?: number;
}

/** Which ways there is still somewhere to scroll. */
export interface MessageScrollerScrollable {
  readonly start: boolean;
  readonly end: boolean;
}

export interface MessageScrollerVisibilityState {
  /**
   * The anchored turn being read: the last one to have reached the reading
   * line. It stays current after its first row scrolls out above.
   */
  readonly currentAnchorId: string | null;
  /** The message ids on screen, in document order. */
  readonly visibleMessageIds: readonly string[];
}

const NOT_SCROLLABLE: MessageScrollerScrollable = { start: false, end: false };
const NOTHING_VISIBLE: MessageScrollerVisibilityState = {
  currentAnchorId: null,
  visibleMessageIds: [],
};

/**
 * What the scroller is doing about new content.
 *
 * `following` keeps the end in view. `free` leaves the position alone. `anchored`
 * holds one turn at the reading line while its reply streams in below it.
 * `jumping` is where a `scrollToMessage` left it, which nothing but the person
 * moves it away from.
 */
type Mode = "following" | "free" | "anchored" | "jumping";

export interface MessageScrollerOptions {
  /** How close to the end still counts. @default 8 */
  tolerance?: MaybeAccessor<number | undefined>;
  /** Whether to follow new content at all. @default true */
  follow?: MaybeAccessor<boolean | undefined>;
  /** Where it opens once it first has content. @default wherever it is */
  defaultScrollPosition?: MaybeAccessor<MessageScrollerDefaultScrollPosition | undefined>;
  /** How much of the previous message shows above a newly anchored one, in px. @default 64 */
  scrollPreviousItemPeek?: MaybeAccessor<number | undefined>;
  /** Space kept at the aligned edge by `scrollToMessage` and by anchoring, in px. @default 0 */
  scrollMargin?: MaybeAccessor<number | undefined>;
}

export interface MessageScroller {
  /** Whether the viewport is at the end, within the tolerance. */
  readonly isAtEnd: Accessor<boolean>;
  /** Whether there is anything to scroll: false hides the button. */
  readonly isScrollable: Accessor<boolean>;
  /** True while a programmatic scroll is in flight. */
  readonly isAutoscrolling: Accessor<boolean>;
  /** Which ways there is still somewhere to go. */
  readonly scrollable: Accessor<MessageScrollerScrollable>;
  /** What is on screen. Empty until something calls {@link MessageScroller.watchVisibility}. */
  readonly visibility: Accessor<MessageScrollerVisibilityState>;
  /** True until the opening position has been applied, so the first paint can wait for it. */
  readonly isPending: Accessor<boolean>;
  /** The element to watch, or `null` to stop watching. */
  readonly attach: (viewport: HTMLElement | null) => void;
  /** The element whose children are the rows. @default the viewport's first child */
  readonly attachContent: (content: HTMLElement | null) => void;
  /** An empty last child of the content, which is grown to make room above an anchored turn. */
  readonly attachSpacer: (spacer: HTMLElement | null) => void;
  /** Name a row, so `scrollToMessage` and the visibility state can find it. */
  readonly register: (
    messageId: string,
    element: HTMLElement | null,
    removed?: HTMLElement | null,
  ) => void;
  /** Whether rows added above keep the row being read where it is. @default true */
  readonly preserveOnPrepend: (preserve: MaybeAccessor<boolean | undefined>) => void;
  /** Start computing {@link MessageScroller.visibility}. Returns what stops it. */
  readonly watchVisibility: () => () => void;
  /** A wheel, a touch or a scrolling key: the person is moving it themselves. */
  readonly intent: () => void;
  /** Jump or glide to the bottom. */
  readonly toEnd: (behavior?: ScrollBehavior) => boolean;
  readonly toStart: (behavior?: ScrollBehavior) => boolean;
  /** `toEnd` and `toStart` as upstream spells them. `false` before there is a viewport. */
  readonly scrollToEnd: (options?: MessageScrollerScrollOptions) => boolean;
  readonly scrollToStart: (options?: MessageScrollerScrollOptions) => boolean;
  /**
   * Bring a registered row into view. A row that has not mounted yet in an
   * empty transcript is remembered and scrolled to when it does; otherwise an
   * unknown id answers `false`.
   */
  readonly scrollToMessage: (messageId: string, options?: MessageScrollerScrollOptions) => boolean;
  /** Re-measure, which an append does through the observer already. */
  readonly measure: () => void;
}

const isAnchor = (element: HTMLElement): boolean => element.dataset.scrollAnchor === "true";

export function messageScroller(options: MessageScrollerOptions = {}): MessageScroller {
  // `ownedWrite`: `attach` is what a viewport's `ref` is given, so it measures,
  // and writes these, while the component holding the viewport is being built.
  const own = { ownedWrite: true } as const;
  const [atEnd, setAtEnd] = createSignal(true, own);
  const [scrollable, setScrollable] = createSignal(false, own);
  const [autoscrolling, setAutoscrolling] = createSignal(false);
  const [edges, setEdges] = createSignal<MessageScrollerScrollable>(NOT_SCROLLABLE, own);
  const [seenNow, setSeenNow] = createSignal<MessageScrollerVisibilityState>(NOTHING_VISIBLE, own);
  const opening = access(options.defaultScrollPosition);
  const [pending, setPending] = createSignal(opening === "end" || opening === "last-anchor", own);

  // The scroller's own copy of what the signals publish. A scroll event
  // measures and then decides in the same tick, and a signal write is not
  // published until the flush, so reading the signals back here would decide
  // against the measurement the previous event left behind.
  let isAtEnd = true;
  let isAutoscrolling = false;
  let published: MessageScrollerScrollable = NOT_SCROLLABLE;

  let viewport: HTMLElement | null = null;
  let content: HTMLElement | null = null;
  let spacer: HTMLElement | null = null;
  let spacerHeight = 0;
  let observer: ResizeObserver | null = null;
  let mutations: MutationObserver | null = null;
  // What the last real scroll said, which an append must not change.
  let mode: Mode = "following";
  let settle: ReturnType<typeof setTimeout> | null = null;
  let resized: number | null = null;

  let itemCount = 0;
  let firstItem: HTMLElement | null = null;
  // Rows already accounted for, so an anchor is scrolled to once: when it
  // arrives, not again every time something else in the list changes.
  let known = new WeakSet<HTMLElement>();
  let held: HTMLElement | null = null;
  let reading: { element: HTMLElement; top: number } | null = null;
  let queued: { messageId: string; options?: MessageScrollerScrollOptions } | null = null;
  let opened = false;
  let lastTop = 0;
  let preserve: MaybeAccessor<boolean | undefined> = true;

  const messages = new Map<string, HTMLElement>();
  const onScreen = new Set<string>();
  let watchers = 0;
  let intersections: IntersectionObserver | null = null;
  let visibilityFrame: number | null = null;

  const tolerance = (): number => access(options.tolerance) ?? TOLERANCE;
  const follows = (): boolean => access(options.follow) !== false;
  const peek = (): number => access(options.scrollPreviousItemPeek) ?? PEEK;
  const margin = (): number => access(options.scrollMargin) ?? 0;

  const contentOf = (): HTMLElement | null => {
    if (content !== null) return content;
    const first = viewport?.firstElementChild;
    return first instanceof HTMLElement ? first : null;
  };

  const itemsOf = (parent: HTMLElement): HTMLElement[] => {
    const out: HTMLElement[] = [];
    for (const child of parent.children) {
      if (child instanceof HTMLElement && child !== spacer) out.push(child);
    }
    return out;
  };

  const padding = (element: HTMLElement | null): { start: number; end: number } => {
    if (element === null) return { start: 0, end: 0 };
    const style = getComputedStyle(element);
    return {
      start: pixels(style.paddingBlockStart || style.paddingTop),
      end: pixels(style.paddingBlockEnd || style.paddingBottom),
    };
  };

  /** Where a row sits in the scrolled content, and where it sits on screen. */
  const topOf = (element: HTMLElement, box: HTMLElement): number =>
    element.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
  const screenTopOf = (element: HTMLElement, box: HTMLElement): number =>
    element.getBoundingClientRect().top - box.getBoundingClientRect().top;

  /**
   * Where the rows end, which is not where the content does: the spacer below
   * them is room made for an anchored turn, and a short transcript's column is
   * stretched to fill the viewport.
   */
  const rowsEnd = (parent: HTMLElement, box: HTMLElement): number => {
    const inset = padding(parent);
    const origin = box.getBoundingClientRect().top;
    let bottom = inset.start + inset.end;
    for (const item of itemsOf(parent)) {
      bottom = Math.max(
        bottom,
        item.getBoundingClientRect().bottom - origin + box.scrollTop + inset.end,
      );
    }
    return bottom;
  };

  const distance = (element: HTMLElement): number =>
    element.scrollHeight - spacerHeight - element.clientHeight - element.scrollTop;

  const measure = (): void => {
    if (viewport === null) return;
    const near = tolerance();
    const room = viewport.scrollHeight - spacerHeight - viewport.clientHeight;
    setScrollable(room > near);
    const left = distance(viewport);
    isAtEnd = left <= near;
    setAtEnd(isAtEnd);
    const start = viewport.scrollTop > near;
    const end = left > near;
    if (published.start !== start || published.end !== end) {
      published = { start, end };
      setEdges(published);
    }
  };

  const resizeSpacer = (height: number): void => {
    if (spacer === null) return;
    const next = Math.max(0, Math.ceil(height));
    if (next === spacerHeight) return;
    spacerHeight = next;
    spacer.hidden = next === 0;
    spacer.style.height = `${String(next)}px`;
    // The column's gap would otherwise sit between the last row and the
    // spacer, and the anchored turn would land that much short.
    const parent = spacer.parentElement;
    const style = parent === null ? null : getComputedStyle(parent);
    const gap = style === null ? 0 : pixels(style.rowGap === "normal" ? style.gap : style.rowGap);
    spacer.style.marginTop = next > 0 && gap > 0 ? `${String(-gap)}px` : "";
  };

  /**
   * The flag is for the ANIMATION and an instant jump has none. A smooth
   * scroll passes through positions that are not the target, and each fires a
   * `scroll` event that would otherwise read as the person scrolling away from
   * where this call is taking them. A jump lands and whatever event follows
   * finds it there.
   */
  const glide = (behavior: ScrollBehavior): void => {
    if (behavior !== "smooth") return;
    isAutoscrolling = true;
    setAutoscrolling(true);
    if (settle !== null) clearTimeout(settle);
    // There is no event for a smooth scroll finishing, so the flag is held
    // long enough to cover it and then dropped.
    settle = setTimeout(() => {
      settle = null;
      isAutoscrolling = false;
      setAutoscrolling(false);
      measure();
    }, SMOOTH);
  };

  const computeVisibility = (): MessageScrollerVisibilityState => {
    const parent = contentOf();
    if (viewport === null || parent === null) return NOTHING_VISIBLE;
    const box = viewport.getBoundingClientRect();
    // An anchored turn lands a peek below the margin, with the previous one
    // showing above it. A row only showing in that band has not been read down
    // to yet, so it is neither visible nor current.
    const line = box.top + margin() + peek();
    const byLayout = intersections === null;
    const visible: string[] = [];
    let current: string | null = null;

    for (const item of itemsOf(parent)) {
      const messageId = item.dataset.messageId;
      if (messageId === undefined || messageId === "") continue;
      const anchor = isAnchor(item);
      const rect = anchor || byLayout ? item.getBoundingClientRect() : null;
      const shown =
        byLayout && rect !== null
          ? rect.bottom > line && rect.top < box.bottom
          : onScreen.has(messageId);
      if (shown) visible.push(messageId);
      if (anchor && rect !== null && rect.top <= line + EPSILON) current = messageId;
    }

    if (visible.length === 0 && current === null) return NOTHING_VISIBLE;
    return { currentAnchorId: current, visibleMessageIds: visible };
  };

  const scheduleVisibility = (): void => {
    if (watchers === 0 || visibilityFrame !== null) return;
    visibilityFrame = requestAnimationFrame(() => {
      visibilityFrame = null;
      if (watchers === 0) return;
      const next = computeVisibility();
      const before = seenNow();
      const same =
        before.currentAnchorId === next.currentAnchorId &&
        before.visibleMessageIds.length === next.visibleMessageIds.length &&
        before.visibleMessageIds.every((id, at) => id === next.visibleMessageIds[at]);
      if (!same) setSeenNow(next);
    });
  };

  /** The row to hold still when older ones arrive above: the first one on screen. */
  const captureReading = (): void => {
    const parent = contentOf();
    if (viewport === null || parent === null || messages.size === 0) {
      reading = null;
      return;
    }
    const box = viewport.getBoundingClientRect();
    for (const item of itemsOf(parent)) {
      const messageId = item.dataset.messageId;
      if (messageId === undefined || messageId === "") continue;
      const rect = item.getBoundingClientRect();
      if (rect.bottom > box.top && rect.top < box.bottom) {
        reading = { element: item, top: rect.top - box.top };
        return;
      }
    }
    reading = null;
  };

  /**
   * Put the row being read back where it was.
   *
   * Measured against the viewport rather than the content, so it does nothing
   * where the browser's own scroll anchoring already held the row and only
   * corrects where it did not, without asking which engine this is.
   */
  const restoreReading = (): void => {
    if (viewport === null || reading === null || !reading.element.isConnected) return;
    const moved = screenTopOf(reading.element, viewport) - reading.top;
    if (Math.abs(moved) <= EPSILON) return;
    viewport.scrollTop += moved;
    lastTop = viewport.scrollTop;
    reading.top = screenTopOf(reading.element, viewport);
    measure();
    scheduleVisibility();
  };

  function toEnd(behavior: ScrollBehavior = "smooth"): boolean {
    if (viewport === null) return false;
    resizeSpacer(0);
    held = null;
    mode = "following";
    glide(behavior);
    viewport.scrollTo({ top: viewport.scrollHeight, behavior });
    lastTop = viewport.scrollTop;
    measure();
    scheduleVisibility();
    return true;
  }

  function toStart(behavior: ScrollBehavior = "smooth"): boolean {
    if (viewport === null) return false;
    resizeSpacer(0);
    held = null;
    mode = "free";
    viewport.scrollTo({ top: 0, behavior });
    lastTop = viewport.scrollTop;
    measure();
    scheduleVisibility();
    return true;
  }

  const targetFor = (
    element: HTMLElement,
    box: HTMLElement,
    align: MessageScrollerScrollAlign,
    space: number,
  ): number => {
    const top = topOf(element, box);
    const height = element.getBoundingClientRect().height;
    const inset = padding(contentOf());
    if (align === "center") {
      const room = Math.max(0, box.clientHeight - inset.start - inset.end);
      return top - inset.start - (room - height) / 2 - space;
    }
    if (align === "end") return top - box.clientHeight + height + inset.end + space;
    if (align === "nearest") {
      const bottom = top + height;
      const first = box.scrollTop + inset.start;
      const last = box.scrollTop + box.clientHeight - inset.end;
      if (top >= first && bottom <= last) return box.scrollTop;
      if (top < first) return top - inset.start - space;
      return bottom - box.clientHeight + inset.end + space;
    }
    return top - inset.start - space;
  };

  /**
   * Bring a row to an edge, making room below the rows if there is not enough.
   *
   * `hold` is the anchoring case: the row is a new turn, it goes a peek below
   * the top so the end of the previous one stays readable, and it is kept
   * there while its reply grows underneath.
   */
  const toElement = (
    element: HTMLElement,
    given: MessageScrollerScrollOptions = {},
    hold = false,
  ): boolean => {
    const parent = contentOf();
    if (viewport === null || parent === null || !parent.contains(element)) return false;
    const space = (given.scrollMargin ?? margin()) + (hold ? peek() : 0);
    const top = targetFor(element, viewport, given.align ?? "start", space);
    resizeSpacer(top + viewport.clientHeight - rowsEnd(parent, viewport));
    // Seeded with the target, so a prepend that lands before this scroll has
    // settled still holds the row that was jumped to.
    reading = { element, top: screenTopOf(element, viewport) };
    mode = hold ? "anchored" : "jumping";
    held = hold ? element : null;
    const behavior = given.behavior ?? "auto";
    glide(behavior);
    viewport.scrollTo({ top: Math.max(0, top), behavior });
    lastTop = viewport.scrollTop;
    measure();
    scheduleVisibility();
    return true;
  };

  const applied = (): void => {
    opened = true;
    setPending(false);
  };

  const flushQueued = (): boolean => {
    if (queued === null) return false;
    const element = messages.get(queued.messageId);
    if (element === undefined || !toElement(element, queued.options)) return false;
    queued = null;
    applied();
    return true;
  };

  const open = (): boolean => {
    const position = access(options.defaultScrollPosition);
    if (position === undefined || opened || itemCount === 0) return false;
    let handled: boolean;
    const parent = contentOf();
    if (position === "start") {
      handled = toStart("auto");
    } else if (position === "end" || viewport === null || parent === null) {
      handled = toEnd("auto");
    } else {
      const anchors = itemsOf(parent).filter(isAnchor);
      const last = anchors.at(-1);
      // A short last turn already fits below its first row, so opening at the
      // end shows all of it without a blank gap underneath.
      const fits =
        last === undefined ||
        rowsEnd(parent, viewport) - topOf(last, viewport) <= viewport.clientHeight;
      handled = fits || last === undefined ? toEnd("auto") : toElement(last, {}, true);
    }
    if (handled) applied();
    return handled;
  };

  /** The content grew, shrank or was re-laid out, with the same rows in it. */
  const follow = (): void => {
    measure();
    if (mode === "following" && follows()) {
      toEnd("auto");
      return;
    }
    // Hold the anchored turn as what is below it resizes, or the shrinking
    // content lets the browser clamp the position and the turn drops.
    if (mode === "anchored" && held !== null && held.isConnected) {
      const before = spacerHeight;
      toElement(held, {}, true);
      // The reply has used up the room made for it, so it has filled the
      // viewport and the reader is at the live edge: following takes over.
      if (follows() && before > 0 && spacerHeight === 0) toEnd("auto");
      return;
    }
    scheduleVisibility();
  };

  /** A row was added, removed or replaced. The order of the cases is load-bearing. */
  const reconcile = (): void => {
    const parent = contentOf();
    if (parent === null) return;
    const items = itemsOf(parent);
    const before = itemCount;
    const wasFirst = firstItem;
    itemCount = items.length;
    firstItem = items[0] ?? null;
    const fresh = items.filter((item) => !known.has(item));
    for (const item of fresh) known.add(item);

    if (flushQueued()) return;

    if (before === 0) {
      if (open()) return;
      follow();
      return;
    }

    const shifted = wasFirst === null ? -1 : items.indexOf(wasFirst);
    if (shifted > 0 && access(preserve) !== false) {
      restoreReading();
      return;
    }

    const anchors = fresh.filter(isAnchor);
    const anchor = anchors[0];
    if (anchor !== undefined && items.length >= before) {
      // Several turns arriving at once while the end is being followed keep
      // following it, rather than yanking back to the first of the batch.
      if (anchors.length > 1 && mode === "following" && follows()) {
        toEnd("auto");
        return;
      }
      toElement(anchor, {}, true);
      return;
    }

    follow();
  };

  const onScroll = (): void => {
    measure();
    if (viewport === null) return;
    const top = viewport.scrollTop;
    // Content growing past the end also reads as "not at the end", but only
    // the person moves the position UP. Growth must not release the follow: a
    // scroll event can arrive after a chunk and before the follow catches up.
    const up = top < lastTop - EPSILON;
    lastTop = top;
    // Only a scroll the PERSON made changes the decision. The one `toEnd`
    // caused fires this too, and reading it as intent is how a scroller
    // decides the user scrolled away from the bottom it just moved them to.
    if (!isAutoscrolling) {
      if (mode === "following" && !isAtEnd && up) mode = "free";
      else if (mode === "free" && isAtEnd) mode = "following";
    }
    scheduleVisibility();
    captureReading();
  };

  const watch = (): void => {
    if (viewport === null) return;
    observer?.disconnect();
    mutations?.disconnect();
    const parent = contentOf();
    // Both, because the two ways a transcript grows are different events: a
    // message added is a mutation, and an image finishing loading or a
    // window narrowing is a resize.
    if (typeof ResizeObserver !== "undefined") {
      // On the next frame: following resizes the spacer, which is inside the
      // observed content, and resizing an observed element while its
      // notification is being delivered is reported as a loop.
      observer = new ResizeObserver(() => {
        if (resized !== null) cancelAnimationFrame(resized);
        resized = requestAnimationFrame(() => {
          resized = null;
          follow();
        });
      });
      observer.observe(viewport);
      if (parent !== null) observer.observe(parent);
    }
    if (typeof MutationObserver !== "undefined") {
      mutations = new MutationObserver((records) => {
        const rows = contentOf();
        if (records.some((record) => record.type === "childList" && record.target === rows)) {
          reconcile();
          captureReading();
        } else {
          follow();
        }
      });
      mutations.observe(viewport, { childList: true, subtree: true, characterData: true });
    }
  };

  const unwatchVisibility = (): void => {
    if (visibilityFrame !== null) cancelAnimationFrame(visibilityFrame);
    visibilityFrame = null;
    intersections?.disconnect();
    intersections = null;
    onScreen.clear();
    setSeenNow(NOTHING_VISIBLE);
  };

  const observeVisibility = (): void => {
    if (viewport === null || watchers === 0) return;
    if (typeof IntersectionObserver !== "undefined" && intersections === null) {
      intersections = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const messageId =
              entry.target instanceof HTMLElement ? entry.target.dataset.messageId : "";
            if (messageId === undefined || messageId === "") continue;
            if (entry.isIntersecting) onScreen.add(messageId);
            else onScreen.delete(messageId);
          }
          scheduleVisibility();
        },
        {
          root: viewport,
          // The top edge moved down to the reading line, so the previous turn
          // showing in the band above it is not reported as visible while it
          // is not the current one either.
          rootMargin: `${String(-(margin() + peek()))}px 0px 0px 0px`,
          threshold: [0, 0.01, 0.5, 1],
        },
      );
      for (const element of messages.values()) intersections.observe(element);
    }
    scheduleVisibility();
  };

  return {
    isAtEnd: atEnd,
    isScrollable: scrollable,
    isAutoscrolling: autoscrolling,
    scrollable: edges,
    visibility: seenNow,
    isPending: pending,
    toEnd,
    toStart,
    measure,
    scrollToEnd: (given) => toEnd(given?.behavior ?? "auto"),
    scrollToStart: (given) => toStart(given?.behavior ?? "auto"),
    scrollToMessage(messageId, given) {
      const element = messages.get(messageId);
      if (element === undefined) {
        // Nothing has mounted yet, so the row may still be on its way: an
        // asynchronously loaded transcript asks before it has rows.
        if (itemCount > 0) return false;
        queued = given === undefined ? { messageId } : { messageId, options: given };
        applied();
        return true;
      }
      // An explicit jump is the opening position, so the default does not
      // replace it afterwards.
      applied();
      if (toElement(element, given)) {
        queued = null;
        return true;
      }
      queued = given === undefined ? { messageId } : { messageId, options: given };
      return true;
    },
    intent() {
      // A deliberate gesture lets go of a held turn and of a jump, so neither
      // is put back while the person is reading somewhere else.
      if (mode !== "anchored" && mode !== "jumping") return;
      held = null;
      mode = isAtEnd ? "following" : "free";
    },
    preserveOnPrepend(next) {
      preserve = next;
    },
    register(messageId, element, removed) {
      if (element !== null) {
        messages.set(messageId, element);
        intersections?.observe(element);
        scheduleVisibility();
        if (queued?.messageId === messageId && flushQueued()) captureReading();
        return;
      }
      if (removed !== null && removed !== undefined && messages.get(messageId) === removed) {
        messages.delete(messageId);
        onScreen.delete(messageId);
        intersections?.unobserve(removed);
        scheduleVisibility();
      }
    },
    watchVisibility() {
      watchers++;
      if (watchers === 1) observeVisibility();
      let stopped = false;
      return () => {
        if (stopped) return;
        stopped = true;
        watchers--;
        if (watchers === 0) unwatchVisibility();
      };
    },
    attachContent(element) {
      content = element;
      if (viewport !== null) watch();
    },
    attachSpacer(element) {
      spacer = element;
      spacerHeight = 0;
    },
    attach(element) {
      observer?.disconnect();
      mutations?.disconnect();
      viewport?.removeEventListener("scroll", onScroll);
      if (resized !== null) cancelAnimationFrame(resized);
      resized = null;
      observer = null;
      mutations = null;
      viewport = element;
      if (element === null) {
        unwatchVisibility();
        return;
      }

      element.addEventListener("scroll", onScroll, { passive: true });
      watch();
      lastTop = element.scrollTop;

      const parent = contentOf();
      const items = parent === null ? [] : itemsOf(parent);
      itemCount = items.length;
      firstItem = items[0] ?? null;
      known = new WeakSet(items);
      measure();
      // An empty transcript has nowhere to open at, so there is nothing for
      // the first paint to wait for.
      if (!open() && itemCount === 0) setPending(false);
      captureReading();
      observeVisibility();
    },
  };
}

// ---------------------------------------------------------------------------
// Scrollbars
// ---------------------------------------------------------------------------

/**
 * A scrollbar drawn by the page, over a viewport that still scrolls natively.
 *
 * The native scroller keeps doing all the scrolling: wheel, trackpad, touch and
 * keyboard never come through here. What this owns is the part a hidden native
 * scrollbar takes away with it, which is the thumb: how long it is, where it
 * sits, dragging it, and pressing the track to jump.
 *
 * **The thumb follows the viewport, never the other way round.** A drag writes
 * a scroll position and the thumb is then measured from where the viewport
 * ended up, so the two cannot disagree and a position the browser clamped is
 * the one that is drawn.
 *
 * **A press on the track is the start of a drag.** It brings the middle of the
 * thumb to the pointer and keeps following it, which is what every platform's
 * own scrollbar does; a press on the thumb keeps hold of the point it grabbed.
 *
 * **When it shows is a policy with four answers**, which are Radix's: `hover`
 * while the pointer is over the area, `scroll` while the content is moving,
 * `auto` whenever there is overflow, `always` regardless.
 */

export type ScrollbarOrientation = "vertical" | "horizontal";
export type ScrollbarType = "auto" | "always" | "scroll" | "hover";

/** The lengths a thumb is worked out from, along the scrollbar's own axis. */
export interface ScrollbarSizes {
  /** The whole scrollable content. */
  readonly content: number;
  /** The part of it on screen. */
  readonly viewport: number;
  readonly track: number;
  readonly paddingStart: number;
  readonly paddingEnd: number;
}

/** Shorter than this and a thumb cannot be taken hold of. */
const MIN_THUMB = 18;
/** How long without a scroll event counts as the scrolling having stopped. */
const SCROLL_END = 100;
const HIDE_DELAY = 600;

const scale = (
  value: number,
  from: readonly [number, number],
  to: readonly [number, number],
): number => {
  if (from[0] === from[1] || to[0] === to[1]) return to[0];
  const clamped = Math.min(Math.max(value, from[0]), from[1]);
  return to[0] + ((to[1] - to[0]) / (from[1] - from[0])) * (clamped - from[0]);
};

const scrollRange = (
  sizes: ScrollbarSizes,
  direction: "ltr" | "rtl",
): readonly [number, number] => {
  const most = Math.max(0, sizes.content - sizes.viewport);
  // Right to left the position starts at zero and counts DOWN, which is what
  // every engine has reported since they agreed on it.
  return direction === "ltr" ? [0, most] : [-most, 0];
};

/** How long the thumb is, in px. */
export function thumbSize(sizes: ScrollbarSizes, minimum: number = MIN_THUMB): number {
  const ratio = sizes.content > 0 ? Math.min(1, sizes.viewport / sizes.content) : 1;
  const room = sizes.track - sizes.paddingStart - sizes.paddingEnd;
  return Math.max(room * ratio, minimum);
}

/** How far along the track the thumb sits, in px from the track's padding. */
export function thumbOffset(
  position: number,
  sizes: ScrollbarSizes,
  direction: "ltr" | "rtl" = "ltr",
  minimum: number = MIN_THUMB,
): number {
  const room = sizes.track - sizes.paddingStart - sizes.paddingEnd;
  const travel = Math.max(0, room - thumbSize(sizes, minimum));
  return scale(position, scrollRange(sizes, direction), [0, travel]);
}

/**
 * The scroll position that puts the thumb under a pointer.
 *
 * `grab` is how far into the thumb the pointer holds it, so a drag keeps the
 * point that was pressed rather than snapping the thumb's edge to the pointer.
 */
export function scrollPositionAt(
  pointer: number,
  grab: number,
  sizes: ScrollbarSizes,
  direction: "ltr" | "rtl" = "ltr",
  minimum: number = MIN_THUMB,
): number {
  const thumb = thumbSize(sizes, minimum);
  const first = sizes.paddingStart + grab;
  const last = sizes.track - sizes.paddingEnd - (thumb - grab);
  const range = scrollRange(sizes, direction);
  if (last <= first) return direction === "ltr" ? range[0] : range[1];
  return scale(pointer, [first, last], range);
}

export interface ScrollbarOptions {
  /** @default "vertical" */
  orientation?: MaybeAccessor<ScrollbarOrientation | undefined>;
  /** Which way a horizontal bar runs. @default "ltr" */
  direction?: MaybeAccessor<"ltr" | "rtl" | undefined>;
  /** When the bar shows. @default "hover" */
  type?: MaybeAccessor<ScrollbarType | undefined>;
  /** How long it stays after the pointer leaves or the scrolling stops, in ms. @default 600 */
  hideDelay?: MaybeAccessor<number | undefined>;
  /** The shortest the thumb gets, in px. @default 18 */
  minThumbSize?: MaybeAccessor<number | undefined>;
}

export interface ScrollbarTrackProps {
  readonly onPointerDown: (event: PointerEvent) => void;
  readonly onPointerMove: (event: PointerEvent) => void;
  readonly onPointerUp: (event: PointerEvent) => void;
  readonly onPointerCancel: (event: PointerEvent) => void;
  readonly onPointerEnter: (event: PointerEvent) => void;
  readonly onPointerLeave: (event: PointerEvent) => void;
}

export interface Scrollbar {
  /** Whether the content is longer than the viewport on this axis. */
  readonly hasOverflow: Accessor<boolean>;
  /** Whether the policy in `type` has it showing right now. */
  readonly isVisible: Accessor<boolean>;
  readonly isDragging: Accessor<boolean>;
  /** The thumb's length, in px. */
  readonly thumbSize: Accessor<number>;
  /** The thumb's distance along the track, in px. */
  readonly thumbOffset: Accessor<number>;
  /** How far through the content the viewport is, from 0 to 100. */
  readonly value: Accessor<number>;
  /** The scroller and the track to draw for, or `null` for both to stop. */
  readonly attach: (viewport: HTMLElement | null, track: HTMLElement | null) => void;
  readonly measure: () => void;
  /** The pointer came over the scroll area, or left it. */
  readonly hoverStart: () => void;
  readonly hoverEnd: () => void;
  readonly trackProps: ScrollbarTrackProps;
  readonly thumbProps: { readonly onPointerDown: (event: PointerEvent) => void };
}

export function scrollbar(options: ScrollbarOptions = {}): Scrollbar {
  // `ownedWrite`: `attach` measures, and it is called from the component that
  // renders the bar while that component is still settling.
  const own = { ownedWrite: true } as const;
  const [overflow, setOverflow] = createSignal(false, own);
  const [size, setSize] = createSignal(0, own);
  const [offset, setOffset] = createSignal(0, own);
  const [value, setValue] = createSignal(0, own);
  const [dragging, setDragging] = createSignal(false);
  const [hovered, setHovered] = createSignal(false);
  const [scrolling, setScrolling] = createSignal(false);
  const [over, setOver] = createSignal(false);

  let viewport: HTMLElement | null = null;
  let track: HTMLElement | null = null;
  let observer: ResizeObserver | null = null;
  let mutations: MutationObserver | null = null;
  let isDragging = false;
  let isOver = false;
  /** How far into the thumb the pointer took hold, or 0 for a press on the track. */
  let grab = 0;
  let trackStart = 0;
  let hoverTimer: ReturnType<typeof setTimeout> | null = null;
  let scrollTimer: ReturnType<typeof setTimeout> | null = null;
  let restore: (() => void) | null = null;

  const vertical = (): boolean => (access(options.orientation) ?? "vertical") === "vertical";
  const direction = (): "ltr" | "rtl" =>
    vertical() ? "ltr" : (access(options.direction) ?? "ltr");
  const minimum = (): number => access(options.minThumbSize) ?? MIN_THUMB;
  const hideDelay = (): number => access(options.hideDelay) ?? HIDE_DELAY;

  const sizes = (): ScrollbarSizes | null => {
    if (viewport === null || track === null) return null;
    const style = getComputedStyle(track);
    return vertical()
      ? {
          content: viewport.scrollHeight,
          viewport: viewport.offsetHeight,
          track: track.clientHeight,
          paddingStart: pixels(style.paddingTop),
          paddingEnd: pixels(style.paddingBottom),
        }
      : {
          content: viewport.scrollWidth,
          viewport: viewport.offsetWidth,
          track: track.clientWidth,
          paddingStart: pixels(style.paddingLeft),
          paddingEnd: pixels(style.paddingRight),
        };
  };

  const position = (): number => {
    if (viewport === null) return 0;
    return vertical() ? viewport.scrollTop : viewport.scrollLeft;
  };

  const measure = (): void => {
    const measured = sizes();
    if (measured === null) return;
    const most = measured.content - measured.viewport;
    setOverflow(most > 0);
    setSize(thumbSize(measured, minimum()));
    setOffset(thumbOffset(position(), measured, direction(), minimum()));
    setValue(most > 0 ? Math.round((Math.min(Math.abs(position()), most) / most) * 100) : 0);
  };

  const clear = (timer: ReturnType<typeof setTimeout> | null): null => {
    if (timer !== null) clearTimeout(timer);
    return null;
  };

  /** Still for long enough, and then gone unless something is holding it. */
  const settle = (): void => {
    scrollTimer = clear(scrollTimer);
    scrollTimer = setTimeout(() => {
      scrollTimer = setTimeout(() => {
        scrollTimer = null;
        if (!isDragging && !isOver) setScrolling(false);
      }, hideDelay());
    }, SCROLL_END);
  };

  const onScroll = (): void => {
    measure();
    setScrolling(true);
    settle();
  };

  const watch = (): void => {
    if (observer === null || viewport === null) return;
    observer.disconnect();
    observer.observe(viewport);
    for (const child of viewport.children) {
      if (child !== track) observer.observe(child);
    }
  };

  const moveTo = (event: PointerEvent): void => {
    const measured = sizes();
    if (measured === null || viewport === null) return;
    const pointer = (vertical() ? event.clientY : event.clientX) - trackStart;
    const held = grab > 0 ? grab : thumbSize(measured, minimum()) / 2;
    const next = scrollPositionAt(pointer, held, measured, direction(), minimum());
    if (vertical()) viewport.scrollTop = next;
    else viewport.scrollLeft = next;
    measure();
  };

  const release = (event: PointerEvent): void => {
    if (!isDragging) return;
    isDragging = false;
    grab = 0;
    setDragging(false);
    if (track?.hasPointerCapture?.(event.pointerId) === true) {
      track.releasePointerCapture(event.pointerId);
    }
    restore?.();
    restore = null;
    settle();
  };

  return {
    hasOverflow: overflow,
    isDragging: dragging,
    thumbSize: size,
    thumbOffset: offset,
    value,
    measure,
    isVisible: () => {
      const type = access(options.type) ?? "hover";
      if (type === "always") return true;
      if (!overflow()) return false;
      if (type === "auto") return true;
      if (type === "hover") return hovered() || dragging();
      return scrolling() || dragging() || over();
    },
    hoverStart() {
      hoverTimer = clear(hoverTimer);
      setHovered(true);
    },
    hoverEnd() {
      hoverTimer = clear(hoverTimer);
      hoverTimer = setTimeout(() => {
        hoverTimer = null;
        setHovered(false);
      }, hideDelay());
    },
    attach(element, rail) {
      observer?.disconnect();
      mutations?.disconnect();
      viewport?.removeEventListener("scroll", onScroll);
      observer = null;
      mutations = null;
      hoverTimer = clear(hoverTimer);
      scrollTimer = clear(scrollTimer);
      restore?.();
      restore = null;
      isDragging = false;
      viewport = element;
      track = rail;
      if (element === null || rail === null) return;

      element.addEventListener("scroll", onScroll, { passive: true });
      // The content is whatever the viewport holds, so each child is watched
      // for its size and the list of them for who comes and goes.
      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(measure);
        watch();
      }
      if (typeof MutationObserver !== "undefined") {
        mutations = new MutationObserver(() => {
          watch();
          measure();
        });
        mutations.observe(element, { childList: true });
      }
      measure();
    },
    trackProps: {
      onPointerDown(event) {
        if (event.button !== 0 || viewport === null || track === null) return;
        track.setPointerCapture?.(event.pointerId);
        trackStart = vertical()
          ? track.getBoundingClientRect().top
          : track.getBoundingClientRect().left;
        // A drag across text would select it, and a viewport with smooth
        // scrolling would chase the pointer instead of following it.
        const body = track.ownerDocument.body;
        const select = body.style.webkitUserSelect;
        const behavior = viewport.style.scrollBehavior;
        const scroller = viewport;
        body.style.webkitUserSelect = "none";
        scroller.style.scrollBehavior = "auto";
        restore = (): void => {
          body.style.webkitUserSelect = select;
          scroller.style.scrollBehavior = behavior;
        };
        isDragging = true;
        setDragging(true);
        event.preventDefault();
        moveTo(event);
      },
      onPointerMove(event) {
        if (isDragging) moveTo(event);
      },
      onPointerUp: release,
      onPointerCancel: release,
      onPointerEnter() {
        isOver = true;
        setOver(true);
      },
      onPointerLeave() {
        isOver = false;
        setOver(false);
        settle();
      },
    },
    thumbProps: {
      onPointerDown(event) {
        const thumb = event.currentTarget ?? event.target;
        if (!(thumb instanceof Element)) return;
        const rect = thumb.getBoundingClientRect();
        grab = vertical() ? event.clientY - rect.top : event.clientX - rect.left;
      },
    },
  };
}
