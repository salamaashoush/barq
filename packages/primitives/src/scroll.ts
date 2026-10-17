import { type Accessor, createRenderEffect, createSignal, untrack } from "@barqjs/core";
import { isServer } from "@barqjs/web";
import { on } from "./event.ts";
import { type MaybeAccessor, access, shared } from "./utils.ts";

export interface ScrollPosition {
  x: Accessor<number>;
  y: Accessor<number>;
}

function readWindow(): [number, number] {
  return [window.scrollX, window.scrollY];
}

/**
 * The page's scroll offset.
 *
 * Shared, and listening passively: a `scroll` handler that is not passive
 * blocks the compositor, and the event is already delivered at most once per
 * frame.
 */
export const windowScroll: () => ScrollPosition = shared(() => {
  if (isServer) return { x: () => 0, y: () => 0 };

  const [initialX, initialY] = readWindow();
  const [x, setX] = createSignal(initialX);
  const [y, setY] = createSignal(initialY);
  on(
    window,
    "scroll",
    () => {
      const [nextX, nextY] = readWindow();
      setX(nextX);
      setY(nextY);
    },
    { passive: true },
  );
  return { x, y };
});

/**
 * An element's scroll offset, following a target that may arrive late.
 *
 * For the page itself use {@link windowScroll}, which is shared; this one is
 * per call, because an element's listener cannot be.
 */
export function scrollPosition(target: MaybeAccessor<Element | null | undefined>): ScrollPosition {
  const present = isServer ? undefined : untrack(() => access(target));
  const [x, setX] = createSignal(present?.scrollLeft ?? 0);
  const [y, setY] = createSignal(present?.scrollTop ?? 0);
  if (isServer) return { x, y };

  const read = (element: Element): void => {
    setX(element.scrollLeft);
    setY(element.scrollTop);
  };

  on(target, "scroll", (event) => read(event.currentTarget), { passive: true });
  createRenderEffect(
    () => access(target),
    (element) => {
      if (element === null || element === undefined) return;
      read(element);
    },
    { defer: true },
  );

  return { x, y };
}
