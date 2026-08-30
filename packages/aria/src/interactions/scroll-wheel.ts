/**
 * The wheel, for a control that consumes it rather than scrolling: a number
 * field, a slider, a colour area.
 *
 * Bound non-passively, which is the whole point — a passive `wheel` listener
 * cannot call `preventDefault()`, so the page scrolls underneath. Modern
 * engines default `wheel` on the document to passive, and a listener added
 * through a framework's prop system usually inherits that default, which is
 * why this binds the element directly.
 */

import { effect } from "@barqjs/core";
import { access, type MaybeAccessor } from "../utils.ts";
import type { ElementRef } from "./press.ts";

export interface ScrollWheelOptions {
  ref: ElementRef;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  onScroll?: (delta: { deltaX: number; deltaY: number }) => void;
}

export function scrollWheel(options: ScrollWheelOptions): void {
  effect(() => {
    if (access(options.isDisabled) === true || options.onScroll === undefined) return undefined;
    const element = access(options.ref);
    if (element === null || element === undefined) return undefined;

    const onWheel = (event: WheelEvent): void => {
      // Control held is a zoom gesture, which belongs to the browser.
      if (event.ctrlKey) return;
      event.preventDefault();
      event.stopPropagation();
      options.onScroll?.({ deltaX: event.deltaX, deltaY: event.deltaY });
    };

    element.addEventListener("wheel", onWheel as EventListener, { passive: false });
    return () => element.removeEventListener("wheel", onWheel as EventListener);
  });
}
