/**
 * A drawer's drag: how far it has been pulled, and whether letting go closes it.
 *
 * This is the piece `@barqjs/ui`'s `<Drawer>` needed. shadcn's is the `vaul`
 * package, which is React hooks over Radix, so the engine is written here and
 * only the behaviour is upstream's.
 *
 * A drawer is a modal like any other until a pointer touches it. What makes it
 * a drawer is that the pointer can take it away, and four things about that are
 * decisions rather than details.
 *
 * **The threshold is a fraction of the drawer, not a distance.** A 100px pull
 * on a 200px drawer is halfway and means it; the same pull on a full-height one
 * is a nudge. A constant would make tall drawers impossible to close and short
 * ones impossible to keep.
 *
 * **A flick closes it however far it got.** Someone who throws the drawer down
 * has already decided, and making them cross a distance first turns a gesture
 * into a haul. That is why the speed is measured and not only the offset.
 *
 * **Pulling the wrong way is damped rather than blocked.** A drawer that will
 * not move at all reads as broken; one that moves an eighth as far says "this
 * is as open as it gets" and springs back.
 *
 * **A drag that starts inside something scrolled is a scroll.** This is the
 * bug every hand-written sheet has: the list inside scrolls to the middle, the
 * next pull down takes the whole drawer with it, and the content the person was
 * reading leaves the screen. `canDragFrom` is what stops it.
 *
 * **A snap point is how much of the SCREEN the drawer covers.** `0.5` is half
 * the viewport and `"148px"` is that many pixels, which is Vaul's meaning. What
 * differs is a drawer shorter than its snap point: Vaul positions against the
 * viewport alone and pushes such a drawer part way off screen, and this one is
 * simply as open as it gets.
 *
 * **Letting go between snap points reads the whole gesture, not its last
 * sample.** A flick's final few milliseconds are noise, and "which point did
 * they mean" is a question about the pull from start to finish. Closing a
 * drawer that has no snap points still reads the last sample, because there a
 * pull back at the end is a change of mind.
 */

import { createSignal, type Accessor } from "@barqjs/core";

import { access, type MaybeAccessor } from "./utils.ts";

export type DrawerDirection = "top" | "bottom" | "left" | "right";

/** A fraction of the viewport, or a length in pixels written `"148px"`. */
export type DrawerSnapPoint = number | string;

/** How much of the drawer has to be pulled away before letting go closes it. */
const THRESHOLD = 0.25;
/** px per ms past which a flick closes it whatever the offset. */
const VELOCITY = 0.4;
/** How much of a pull the wrong way is kept. */
const DAMPING = 8;
/** px per ms past which a throw skips every snap point in between. */
const THROW = 2;
/** The share of the viewport a pull stays under to count as a flick between points. */
const FLICK_REACH = 0.4;
/** How much of the viewport shows around the page while a drawer is over it. */
const WINDOW_OFFSET = 26;
const BACKGROUND_RADIUS = 8;
const BACKGROUND_SHIFT = 14;
/** How far a drawer steps back when another opens over it. */
const NESTED_DISPLACEMENT = 16;
const SETTLE_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

/** How much of the screen a snap point shows, in px. */
export function snapPointExtent(point: DrawerSnapPoint, viewport: number): number {
  if (typeof point === "string") return Number.parseInt(point, 10) || 0;
  return point * viewport;
}

/**
 * How far from fully open a drawer of `size` rests at a snap point.
 *
 * Never negative: a drawer shorter than what the snap point asks for cannot
 * show more than itself.
 */
export function snapPointOffset(point: DrawerSnapPoint, viewport: number, size: number): number {
  return Math.max(0, size - snapPointExtent(point, viewport));
}

export interface DrawerDragOptions {
  /** Which edge the drawer is attached to. @default "bottom" */
  direction?: MaybeAccessor<DrawerDirection | undefined>;
  /** The fraction that closes it. @default 0.25 */
  threshold?: MaybeAccessor<number | undefined>;
  /** The speed that closes it, in px/ms. @default 0.4 */
  velocity?: MaybeAccessor<number | undefined>;
  /**
   * Whether a pull can close it. @default true
   *
   * Without snap points a drawer that cannot be dismissed does not move at
   * all; with them it moves between the points and stops at the first.
   */
  dismissible?: MaybeAccessor<boolean | undefined>;
  /** Where it may rest, smallest first. */
  snapPoints?: MaybeAccessor<readonly DrawerSnapPoint[] | undefined>;
  /** The snap point it rests at, when a caller holds it. */
  activeSnapPoint?: MaybeAccessor<DrawerSnapPoint | null | undefined>;
  onSnapPointChange?: (point: DrawerSnapPoint | null) => void;
  /**
   * The snap point from which the page behind is fully dimmed.
   * @default the last one
   */
  fadeFromIndex?: MaybeAccessor<number | undefined>;
  /** A throw moves one snap point at a time instead of to the end. */
  snapToSequentialPoint?: MaybeAccessor<boolean | undefined>;
  /** The viewport's extent along the drawer's axis. @default the window's */
  viewport?: () => number;
  /** @default Date.now */
  now?: () => number;
  /** Called on every move with how much of the drawer has been pulled away, 0 to 1. */
  onDrag?: (progress: number) => void;
  /** Called on letting go, with whether the drawer stayed open. */
  onRelease?: (open: boolean) => void;
  onClose?: () => void;
}

export interface DrawerDrag {
  /** How far it has been pulled toward its edge, in px. Never negative. */
  readonly offset: Accessor<number>;
  readonly isDragging: Accessor<boolean>;
  /** `size` is the drawer's extent along the axis, which the threshold is of. */
  start(point: { readonly x: number; readonly y: number }, size: number): void;
  move(point: { readonly x: number; readonly y: number }): void;
  /** Ends the drag, and answers whether it closed the drawer. */
  end(): boolean;
  /** Ends it where it started: a cancelled pointer took no decision. */
  cancel(): void;
  /** Tell it the drawer's extent along its axis, which a snap point is placed against. */
  measure(size: number): void;
  readonly activeSnapPoint: Accessor<DrawerSnapPoint | null>;
  readonly activeSnapIndex: Accessor<number | null>;
  setActiveSnapPoint(point: DrawerSnapPoint | null): void;
  /** How far from fully open it rests, in px: the active snap point's offset. */
  readonly rest: Accessor<number>;
  /** How far from fully open it is right now: `rest` plus the pull. */
  readonly position: Accessor<number>;
  /** How much of the drawer is off screen, 0 to 1. */
  readonly progress: Accessor<number>;
  /** How dim the page behind should be, 0 to 1. */
  readonly overlayOpacity: Accessor<number>;
  /** What pressing the handle does: the next snap point, or closing after the last. */
  cycle(): void;
}

/** Along which axis the drawer moves, and which way counts as closing. */
function axisOf(direction: DrawerDirection): { vertical: boolean; sign: number } {
  return {
    vertical: direction === "top" || direction === "bottom",
    // A bottom drawer closes downward, so a growing y is a growing offset.
    sign: direction === "bottom" || direction === "right" ? 1 : -1,
  };
}

export function drawerDrag(options: DrawerDragOptions = {}): DrawerDrag {
  const [trackOffset, setOffset] = createSignal(0);
  const [dragging, setDragging] = createSignal(false);
  const [trackSize, setSize] = createSignal(0);
  const [trackSnap, setSnap] = createSignal<DrawerSnapPoint | null>(null);
  // The gesture's own copy of each. A pointer stream is read in the same tick
  // it is written, and a signal write is not published until the flush, so the
  // move after a `start` would find the drag not yet begun.
  let isDragging = false;
  let from = { x: 0, y: 0 };
  let size = 0;
  let speed = 0;
  let lastAt = 0;
  let startedAt = 0;
  let lastOffset = 0;
  let chosen: DrawerSnapPoint | null | undefined;

  const now = (): number => (options.now ?? Date.now)();
  const direction = (): DrawerDirection => access(options.direction) ?? "bottom";
  const dismissible = (): boolean => access(options.dismissible) !== false;
  const points = (): readonly DrawerSnapPoint[] => access(options.snapPoints) ?? [];

  const viewport = (): number => {
    if (options.viewport !== undefined) return options.viewport();
    if (typeof window === "undefined") return 0;
    return axisOf(direction()).vertical ? window.innerHeight : window.innerWidth;
  };

  // The offset is where the pointer IS, and the gesture paints from it in the
  // same handler that moved it, so a read answers from the gesture's copy and
  // the signal is only what tells a reader to look again.
  const offset = (): number => {
    trackOffset();
    return lastOffset;
  };

  const activeSnapPoint = (): DrawerSnapPoint | null => {
    trackSnap();
    const all = points();
    if (all.length === 0) return null;
    const held = access(options.activeSnapPoint);
    if (held !== undefined) return held;
    if (chosen !== undefined && (chosen === null || all.includes(chosen))) return chosen;
    return all[0] ?? null;
  };

  const activeSnapIndex = (): number | null => {
    const active = activeSnapPoint();
    if (active === null) return null;
    const index = points().indexOf(active);
    return index < 0 ? null : index;
  };

  const offsets = (): number[] => {
    trackSize();
    const extent = viewport();
    return points().map((point) => snapPointOffset(point, extent, size));
  };

  const rest = (): number => {
    trackSize();
    const active = activeSnapPoint();
    return active === null ? 0 : snapPointOffset(active, viewport(), size);
  };

  const position = (): number => rest() + offset();

  const progress = (): number => {
    trackSize();
    if (size <= 0) return 0;
    return Math.min(1, Math.max(0, position() / size));
  };

  const overlayOpacity = (): number => {
    const all = offsets();
    if (all.length === 0) return 1 - progress();
    const fadeFrom = access(options.fadeFromIndex) ?? all.length - 1;
    const opaque = all[fadeFrom] ?? 0;
    const clear = fadeFrom > 0 ? (all[fadeFrom - 1] ?? size) : size;
    if (clear <= opaque) return position() <= opaque ? 1 : 0;
    return Math.min(1, Math.max(0, (clear - position()) / (clear - opaque)));
  };

  const setActiveSnapPoint = (point: DrawerSnapPoint | null): void => {
    if (point === activeSnapPoint()) return;
    chosen = point;
    setSnap(point);
    options.onSnapPointChange?.(point);
  };

  const raw = (point: { x: number; y: number }): number => {
    const { vertical, sign } = axisOf(direction());
    const moved = vertical ? point.y - from.y : point.x - from.x;
    return moved * sign;
  };

  /** A pull toward open: free while a larger snap point is ahead, damped past the last. */
  const towardOpen = (moved: number): number => {
    const all = offsets();
    if (all.length === 0) return moved / DAMPING;
    const room = rest() - Math.min(...all);
    return -moved <= room ? moved : -room + (moved + room) / DAMPING;
  };

  const settle = (): void => {
    isDragging = false;
    lastOffset = 0;
    setDragging(false);
    setOffset(0);
  };

  const close = (): boolean => {
    settle();
    options.onRelease?.(false);
    options.onClose?.();
    return true;
  };

  const stay = (point?: DrawerSnapPoint): boolean => {
    settle();
    if (point !== undefined) setActiveSnapPoint(point);
    options.onRelease?.(true);
    return false;
  };

  /** Which snap point a release between them means, or `null` for closing. */
  const landing = (): DrawerSnapPoint | null => {
    const all = points();
    const at = offsets();
    const index = activeSnapIndex();
    const last = all.length - 1;
    const elapsed = now() - startedAt;
    const velocity = elapsed > 0 ? Math.abs(lastOffset) / elapsed : 0;
    const opening = lastOffset < 0;
    const sequential = access(options.snapToSequentialPoint) === true;

    if (!sequential && velocity > THROW) {
      if (opening) return all[last] as DrawerSnapPoint;
      return dismissible() ? null : (all[0] as DrawerSnapPoint);
    }

    if (velocity > VELOCITY && Math.abs(lastOffset) < viewport() * FLICK_REACH && index !== null) {
      if (opening) return all[Math.min(index + 1, last)] as DrawerSnapPoint;
      if (index === 0) return dismissible() ? null : (all[0] as DrawerSnapPoint);
      return all[index - 1] as DrawerSnapPoint;
    }

    const here = position();
    let nearest = 0;
    for (let i = 1; i < at.length; i++) {
      if (Math.abs((at[i] as number) - here) < Math.abs((at[nearest] as number) - here)) {
        nearest = i;
      }
    }
    return all[nearest] as DrawerSnapPoint;
  };

  return {
    offset,
    isDragging: dragging,
    activeSnapPoint,
    activeSnapIndex,
    setActiveSnapPoint,
    rest,
    position,
    progress,
    overlayOpacity,
    measure(extent) {
      if (extent === size) return;
      size = extent;
      setSize(extent);
    },
    start(point, extent) {
      if (!dismissible() && points().length === 0) return;
      from = { x: point.x, y: point.y };
      size = extent;
      speed = 0;
      lastAt = now();
      startedAt = lastAt;
      lastOffset = 0;
      isDragging = true;
      setSize(extent);
      setOffset(0);
      setDragging(true);
    },
    move(point) {
      if (!isDragging) return;
      const moved = raw(point);
      // Past the open position the drawer still moves, an eighth as far, so
      // the gesture is answered without the drawer leaving its edge.
      let next = moved >= 0 ? moved : towardOpen(moved);
      // The first snap point is the floor of a drawer that cannot be closed.
      if (next > 0 && !dismissible() && activeSnapIndex() === 0) next = 0;
      const at = now();
      const since = at - lastAt;
      // Two moves in the same millisecond are one move, so the speed keeps
      // its last value. The baseline still moves: leaving it behind measures
      // the next sample from an offset the drawer no longer has, and a pull
      // back then reads as a flick forward.
      if (since > 0) {
        speed = (next - lastOffset) / since;
        lastAt = at;
      }
      lastOffset = next;
      setOffset(next);
      options.onDrag?.(progress());
    },
    end() {
      if (!isDragging) return false;
      if (points().length > 0) {
        const target = landing();
        return target === null ? close() : stay(target);
      }
      const far = lastOffset > size * (access(options.threshold) ?? THRESHOLD);
      const limit = access(options.velocity) ?? VELOCITY;
      // Two measures, and a flick passes both. The last move says the hand was
      // still going toward closed, which a pull that turned back was not. The
      // whole gesture says how fast it was, which is vaul's measure and the
      // only one that falls while a hand rests on the drawer before letting go.
      const elapsed = now() - startedAt;
      const overall = elapsed > 0 ? lastOffset / elapsed : speed;
      const fast = speed > limit && overall > limit;
      return far || fast ? close() : stay();
    },
    cancel() {
      settle();
    },
    cycle() {
      if (isDragging) return;
      const all = points();
      if (all.length === 0) {
        if (dismissible()) options.onClose?.();
        return;
      }
      const index = activeSnapIndex();
      if (index === null) return;
      if (index === all.length - 1) {
        if (dismissible()) options.onClose?.();
        return;
      }
      setActiveSnapPoint(all[index + 1] as DrawerSnapPoint);
    },
  };
}

/**
 * Whether a drag starting at `target` belongs to the drawer or to a scroller
 * inside it.
 *
 * Walking up from the target to the drawer, the first element that can scroll
 * along the drag's axis takes the gesture unless it is already at the edge the
 * drag would take it past. A list scrolled to the middle keeps the pull; the
 * same list at its top hands it over, which is what makes a drawer with a long
 * body still closable by pulling its content.
 */
export function canDragFrom(
  target: Element | null,
  content: Element,
  direction: DrawerDirection,
): boolean {
  const { vertical, sign } = axisOf(direction);
  let at: Element | null = target;

  while (at !== null && at !== content) {
    const scrolled = vertical ? at.scrollTop : at.scrollLeft;
    const extent = vertical ? at.scrollHeight - at.clientHeight : at.scrollWidth - at.clientWidth;
    if (extent > 0) {
      // A bottom drawer is closed by dragging down, which scrolls the list up,
      // so the list only gives up the gesture at its own start.
      return sign > 0 ? scrolled <= 0 : scrolled >= extent;
    }
    at = at.parentElement;
  }

  return true;
}

/** A number as CSS writes it: no float noise, no trailing zeros. */
function tidy(value: number): string {
  return String(Math.round(value * 10000) / 10000);
}

function along(direction: DrawerDirection, distance: string): string {
  return axisOf(direction).vertical
    ? `translate3d(0, ${distance}, 0)`
    : `translate3d(${distance}, 0, 0)`;
}

/**
 * What the page behind a drawer looks like, `progress` of the way to closed.
 *
 * Scaled down so a strip of the viewport shows around it and its corners
 * round, which is what makes the drawer read as a sheet laid over a card
 * rather than a panel on a page.
 */
export function drawerBackgroundStyle(
  direction: DrawerDirection,
  viewportWidth: number,
  progress: number,
): { transform: string; borderRadius: string } {
  const resting = viewportWidth > 0 ? (viewportWidth - WINDOW_OFFSET) / viewportWidth : 1;
  const scale = Math.min(resting + progress * (1 - resting), 1);
  const shift = Math.max(0, BACKGROUND_SHIFT - progress * BACKGROUND_SHIFT);
  return {
    transform: `scale(${tidy(scale)}) ${along(direction, `${tidy(shift)}px`)}`,
    borderRadius: `${tidy(BACKGROUND_RADIUS - progress * BACKGROUND_RADIUS)}px`,
  };
}

/**
 * The transform of a drawer that has another open over it, with the upper one
 * `progress` of the way to closed.
 */
export function nestedDrawerTransform(
  direction: DrawerDirection,
  viewportWidth: number,
  progress: number,
): string {
  const resting = viewportWidth > 0 ? (viewportWidth - NESTED_DISPLACEMENT) / viewportWidth : 1;
  const scale = resting + progress * (1 - resting);
  const shift = -NESTED_DISPLACEMENT + progress * NESTED_DISPLACEMENT;
  return `scale(${tidy(scale)}) ${along(direction, `${tidy(shift)}px`)}`;
}

/** The element an application marked as the page a drawer scales. */
const WRAPPER = "[data-drawer-wrapper], [data-vaul-drawer-wrapper], [vaul-drawer-wrapper]";

export interface DrawerBackgroundOptions {
  direction?: MaybeAccessor<DrawerDirection | undefined>;
  /** Paint the body black behind the scaled page. @default true */
  setBackgroundColor?: MaybeAccessor<boolean | undefined>;
  /** How long the page takes to scale, in ms. @default 500 */
  duration?: number;
  /** The viewport's width. @default the window's */
  viewport?: () => number;
}

export interface DrawerBackground {
  /** Scale the page down. A second call while it is scaled does nothing. */
  open(): void;
  /** Follow a pull, `progress` of the way to closed, with no transition. */
  drag(progress: number): void;
  /** Go back to the open look after a pull that did not close. */
  settle(): void;
  /**
   * Scale the page back, then put it exactly as it was found.
   *
   * The transform goes at once and everything else after the transition: the
   * transition is what carries the page back, and the black behind it must
   * outlast the corners that are still rounding out.
   */
  close(): void;
}

/**
 * The page behind a drawer, scaled while the drawer is open.
 *
 * The page is whichever element carries `data-drawer-wrapper` (Vaul's
 * `data-vaul-drawer-wrapper` is read too), found when the drawer opens rather
 * than when this is called, because the wrapper is usually an ancestor that
 * does not exist yet. With none on the page every method is a no-op.
 */
export function drawerBackground(options: DrawerBackgroundOptions = {}): DrawerBackground {
  const KEYS = [
    "transform",
    "transformOrigin",
    "transitionProperty",
    "transitionDuration",
    "transitionTimingFunction",
    "borderRadius",
    "overflow",
  ] as const;
  let wrapper: HTMLElement | null = null;
  let before: Record<(typeof KEYS)[number], string> | null = null;
  let bodyBefore: string | null = null;
  let restoring: ReturnType<typeof setTimeout> | undefined;
  const duration = options.duration ?? 500;

  const direction = (): DrawerDirection => access(options.direction) ?? "bottom";
  const width = (): number =>
    options.viewport?.() ?? (typeof window === "undefined" ? 0 : window.innerWidth);

  const paint = (progress: number, animated: boolean): void => {
    if (wrapper === null) return;
    const style = drawerBackgroundStyle(direction(), width(), progress);
    wrapper.style.transitionProperty = animated ? "transform, border-radius" : "none";
    wrapper.style.transitionDuration = `${String(duration)}ms`;
    wrapper.style.transitionTimingFunction = SETTLE_EASE;
    wrapper.style.transform = style.transform;
    wrapper.style.borderRadius = style.borderRadius;
  };

  return {
    open() {
      if (typeof document === "undefined") return;
      if (restoring !== undefined) {
        // Reopened on its way back: the page is still the one that was found.
        clearTimeout(restoring);
        restoring = undefined;
      } else {
        if (wrapper !== null) return;
        wrapper = document.querySelector<HTMLElement>(WRAPPER);
        if (wrapper === null) return;
        const found = wrapper;
        before = Object.fromEntries(KEYS.map((key) => [key, found.style[key]])) as Record<
          (typeof KEYS)[number],
          string
        >;
        if (access(options.setBackgroundColor) !== false) {
          bodyBefore = document.body.style.background;
          document.body.style.background = "black";
        }
      }
      if (wrapper === null) return;
      wrapper.style.transformOrigin = axisOf(direction()).vertical ? "top" : "left";
      wrapper.style.overflow = "hidden";
      paint(0, true);
    },
    drag(progress) {
      paint(progress, false);
    },
    settle() {
      paint(0, true);
    },
    close() {
      if (wrapper === null || before === null || restoring !== undefined) return;
      const found = wrapper;
      const was = before;
      found.style.transitionProperty = "transform, border-radius";
      found.style.transform = was.transform;
      found.style.borderRadius = was.borderRadius;
      restoring = setTimeout(() => {
        restoring = undefined;
        for (const key of KEYS) found.style[key] = was[key];
        if (bodyBefore !== null) document.body.style.background = bodyBefore;
        wrapper = null;
        before = null;
        bodyBefore = null;
      }, duration);
    },
  };
}

export interface DrawerKeyboardOptions {
  /** Shorten the drawer rather than lift it. */
  fixed?: MaybeAccessor<boolean | undefined>;
}

const TEXT_INPUTS = new Set([
  "text",
  "search",
  "email",
  "url",
  "tel",
  "password",
  "number",
  "date",
  "datetime-local",
  "month",
  "time",
  "week",
]);

function takesText(element: Element | null): boolean {
  if (element === null) return false;
  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLInputElement) return TEXT_INPUTS.has(element.type);
  return element instanceof HTMLElement && element.isContentEditable;
}

/**
 * Keep a bottom drawer clear of an on-screen keyboard.
 *
 * The keyboard is what the visual viewport loses when a field inside the
 * drawer has focus. The drawer is lifted by that much, and shortened to the
 * viewport if it is taller; `fixed` keeps its bottom edge where it is and only
 * shortens it. Gone again, the drawer's own size comes back. Returns the
 * cleanup.
 */
export function drawerKeyboard(
  element: HTMLElement,
  options: DrawerKeyboardOptions = {},
): () => void {
  const view = element.ownerDocument.defaultView;
  const viewport = view?.visualViewport;
  if (view === null || viewport === null || viewport === undefined) return () => {};

  let resting: number | null = null;
  const restore = (): void => {
    element.style.height = "";
    element.style.bottom = "";
  };

  const onResize = (): void => {
    const keyboard = Math.max(0, view.innerHeight - viewport.height);
    const focused = element.ownerDocument.activeElement;
    if (keyboard === 0 || !takesText(focused) || !element.contains(focused)) {
      restore();
      return;
    }
    resting ??= element.getBoundingClientRect().height;
    if (access(options.fixed) === true) {
      element.style.height = `${String(Math.max(0, resting - keyboard))}px`;
      return;
    }
    element.style.bottom = `${String(keyboard)}px`;
    if (resting > viewport.height) element.style.height = `${String(viewport.height)}px`;
  };

  viewport.addEventListener("resize", onResize);
  return () => {
    viewport.removeEventListener("resize", onResize);
    restore();
  };
}
