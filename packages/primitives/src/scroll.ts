import { type Accessor, isServer, renderEffect, signal } from "@barqjs/core";
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
  const x = signal(initialX);
  const y = signal(initialY);
  on(
    window,
    "scroll",
    () => {
      const [nextX, nextY] = readWindow();
      x.set(nextX);
      y.set(nextY);
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
  const x = signal(0);
  const y = signal(0);
  if (isServer) return { x, y };

  const read = (element: Element): void => {
    x.set(element.scrollLeft);
    y.set(element.scrollTop);
  };

  on(target, "scroll", (event) => read(event.currentTarget), { passive: true });
  renderEffect(() => {
    const element = access(target);
    if (element === null || element === undefined) return;
    read(element);
  });

  return { x, y };
}
