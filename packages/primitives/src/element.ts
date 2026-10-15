import { type Accessor, isServer, createRenderEffect, createSignal, untrack } from "@barqjs/core";
import { on } from "./event.ts";
import { intersectionObserver, resizeObserver } from "./observers.ts";
import { type Clear, type MaybeAccessor, access, shared } from "./utils.ts";

export interface Size {
  width: Accessor<number>;
  height: Accessor<number>;
}

/**
 * An element's content size, kept current by a shared `ResizeObserver`.
 *
 * `width` and `height` are separate signals, so a component that only lays out
 * on width is not woken by a change in height.
 */
export function elementSize<T extends Element>(
  target: MaybeAccessor<T | null | undefined>,
  options?: ResizeObserverOptions,
): Size {
  const [width, setWidth] = createSignal(0);
  const [height, setHeight] = createSignal(0);

  resizeObserver(
    target,
    (entry) => {
      const box = boxOf(entry, options?.box);
      setWidth(box.width);
      setHeight(box.height);
    },
    options,
  );

  return { width, height };
}

function boxOf(
  entry: ResizeObserverEntry,
  box: ResizeObserverBoxOptions | undefined,
): { width: number; height: number } {
  const sizes =
    box === "border-box"
      ? entry.borderBoxSize
      : box === "device-pixel-content-box"
        ? entry.devicePixelContentBoxSize
        : entry.contentBoxSize;
  // `contentRect` is the only one Safari reported for years, and the entry can
  // still arrive without the box arrays in a WebView.
  const first = sizes?.[0];
  return first === undefined
    ? { width: entry.contentRect.width, height: entry.contentRect.height }
    : { width: first.inlineSize, height: first.blockSize };
}

export interface Bounds extends Size {
  x: Accessor<number>;
  y: Accessor<number>;
  top: Accessor<number>;
  right: Accessor<number>;
  bottom: Accessor<number>;
  left: Accessor<number>;
}

export interface BoundsOptions {
  /** Re-measure on window scroll. On by default: position moves without a resize. */
  scroll?: boolean;
  /** Re-measure on window resize. On by default. */
  resize?: boolean;
}

/**
 * An element's position and size in viewport coordinates.
 *
 * Eight signals rather than one rect, for the same reason as {@link
 * elementSize}: a tooltip that only reads `top` and `left` should not re-run
 * because the element got wider.
 *
 * Scroll and resize are listened to passively and measured on the event. A
 * layout change with no scroll, no resize and no size change — a sibling being
 * removed above this element, say — is not observable without a mutation
 * observer over the whole document, and this deliberately does not install
 * one: call `measure()` when you know you have moved something.
 */
export function bounds<T extends Element>(
  target: MaybeAccessor<T | null | undefined>,
  options?: BoundsOptions,
): Bounds & { measure: () => void } {
  // `measure` is the caller's to call, a component body included.
  const field = { ownedWrite: true };
  const [x, setX] = createSignal(0, field);
  const [y, setY] = createSignal(0, field);
  const [width, setWidth] = createSignal(0, field);
  const [height, setHeight] = createSignal(0, field);
  const [top, setTop] = createSignal(0, field);
  const [right, setRight] = createSignal(0, field);
  const [bottom, setBottom] = createSignal(0, field);
  const [left, setLeft] = createSignal(0, field);

  const read = (element: Element | null | undefined): void => {
    if (element === null || element === undefined) return;
    const rect = element.getBoundingClientRect();
    setX(rect.x);
    setY(rect.y);
    setWidth(rect.width);
    setHeight(rect.height);
    setTop(rect.top);
    setRight(rect.right);
    setBottom(rect.bottom);
    setLeft(rect.left);
  };
  const measure = (): void => read(untrack(() => access(target)));

  if (!isServer) {
    resizeObserver(target, measure);
    if (options?.scroll !== false) {
      on(window, "scroll", measure, { capture: true, passive: true });
    }
    if (options?.resize !== false) {
      on(window, "resize", measure, { passive: true });
    }
    // The target may be a ref that is still empty; measure again when it lands.
    createRenderEffect(() => access(target), read);
  }

  return { x, y, width, height, top, right, bottom, left, measure };
}

export interface VisibleOptions extends IntersectionObserverInit {
  /**
   * Stop observing after the element first becomes visible. What a lazy image
   * or a "load more" sentinel wants: the answer is only interesting once.
   */
  once?: boolean;
}

/**
 * Whether an element intersects the viewport, through a shared
 * `IntersectionObserver`.
 */
export function visible<T extends Element>(
  target: MaybeAccessor<T | null | undefined>,
  options?: VisibleOptions,
): Accessor<boolean> {
  const [showing, setShowing] = createSignal(false);
  if (isServer) return showing;

  // A holder rather than the binding itself: an observer that reported
  // synchronously would reach the callback before the assignment completed.
  const subscription: { clear?: Clear } = {};
  subscription.clear = intersectionObserver(
    target,
    (entry) => {
      setShowing(entry.isIntersecting);
      if (entry.isIntersecting && options?.once) subscription.clear?.();
    },
    options,
  );

  return showing;
}

/**
 * The viewport's size.
 *
 * Shared: every caller on the page gets the same two signals behind one
 * `resize` listener, and the listener goes away when the last of them does.
 */
export const windowSize: () => Size = shared(() => {
  if (isServer) return { width: () => 0, height: () => 0 };

  const [width, setWidth] = createSignal(window.innerWidth);
  const [height, setHeight] = createSignal(window.innerHeight);
  on(window, "resize", () => {
    setWidth(window.innerWidth);
    setHeight(window.innerHeight);
  });
  return { width, height };
});
