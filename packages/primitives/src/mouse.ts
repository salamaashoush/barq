import { type Accessor, isServer, signal } from "@barqjs/core";
import { on } from "./event.ts";
import { type MaybeAccessor, access, shared } from "./utils.ts";

export interface MousePosition {
  /** Relative to the document, so scrolling does not move it under a fixed point. */
  x: Accessor<number>;
  y: Accessor<number>;
  /** Relative to the viewport. */
  clientX: Accessor<number>;
  clientY: Accessor<number>;
  /** False once the pointer leaves the window, and until it returns. */
  isInside: Accessor<boolean>;
}

/**
 * Where the pointer is.
 *
 * Shared, and bound with `pointermove` rather than `mousemove`, so a pen or a
 * touch drag reports as well. One listener for the page: a cursor-following
 * effect in six components should not mean six handlers on every frame of
 * movement.
 */
export const mousePosition: () => MousePosition = shared(() => {
  const x = signal(0);
  const y = signal(0);
  const clientX = signal(0);
  const clientY = signal(0);
  const isInside = signal(false);
  const position = { x, y, clientX, clientY, isInside };
  if (isServer) return position;

  on(
    window,
    "pointermove",
    (event) => {
      x.set(event.pageX);
      y.set(event.pageY);
      clientX.set(event.clientX);
      clientY.set(event.clientY);
      isInside.set(true);
    },
    { passive: true },
  );
  on(document, "pointerleave", () => isInside.set(false), { passive: true });
  on(document, "pointerenter", () => isInside.set(true), { passive: true });

  return position;
});

export interface ElementMousePosition {
  /** Relative to the element's top-left corner. */
  x: Accessor<number>;
  y: Accessor<number>;
  /** Whether the pointer is over the element. */
  isInside: Accessor<boolean>;
}

/**
 * Where the pointer is within an element.
 *
 * Listens on the element, not the window, so moving the pointer anywhere else
 * on the page costs nothing. The last position is kept when the pointer
 * leaves, which is what an effect animating back to rest needs to read.
 */
export function mouseInElement(
  target: MaybeAccessor<Element | null | undefined>,
): ElementMousePosition {
  const x = signal(0);
  const y = signal(0);
  const isInside = signal(false);
  if (isServer) return { x, y, isInside };

  on(
    target,
    "pointermove",
    (event) => {
      const element = access(target);
      if (element === null || element === undefined) return;
      const rect = element.getBoundingClientRect();
      x.set(event.clientX - rect.left);
      y.set(event.clientY - rect.top);
    },
    { passive: true },
  );
  on(target, "pointerenter", () => isInside.set(true), { passive: true });
  on(target, "pointerleave", () => isInside.set(false), { passive: true });

  return { x, y, isInside };
}
