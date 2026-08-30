/**
 * "The user did something outside this element", for a popover or dialog that
 * closes when they do.
 *
 * A `click` listener alone gets three cases wrong. It fires for a drag that
 * began inside and ended outside, which should not close anything: hence the
 * pointerdown/click pair, with the close only when both landed outside. It
 * misses the element having been removed between the two. And in a shadow DOM
 * `event.target` is the host, so the composed path is what actually answers
 * "was this inside".
 *
 * `pointerup` would be the obvious partner for `pointerdown`; `click` is used
 * instead because Chrome on Android delays and sometimes drops the pointer
 * events after a tap on a form control.
 */

import { effect } from "@barqjs/core";
import { contains, ownerDocument, targetElement, TOP_LAYER_ATTRIBUTE } from "../dom.ts";
import { access, type MaybeAccessor } from "../utils.ts";
import type { ElementRef } from "./press.ts";

export interface InteractOutsideOptions {
  /** The element that defines "inside". */
  ref: ElementRef;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  /** Fired on the pointer going down outside, before the interaction completes. */
  onInteractOutsideStart?: (event: PointerEvent) => void;
  /** Fired once the interaction outside has completed. */
  onInteractOutside?: (event: PointerEvent) => void;
}

function isOutside(event: Event, element: Element | null | undefined): boolean {
  if ((event as MouseEvent).button > 0) return false;

  const target = targetElement(event);
  if (target !== null) {
    // An element already detached tells us nothing about where the user
    // pointed; treating it as outside closes overlays on their own teardown.
    const doc = target.ownerDocument;
    if (doc === null || !contains(doc.documentElement, target)) return false;
    // The top layer is above everything, so an interaction there is not
    // "outside" anything below it.
    if (target.closest(`[${TOP_LAYER_ATTRIBUTE}]`) !== null) return false;
  }

  if (element === null || element === undefined) return false;

  // The composed path, not `target`: inside a shadow root the two differ, and
  // only the path names the element the user actually pointed at.
  const path = typeof event.composedPath === "function" ? event.composedPath() : [event.target];
  return !path.includes(element);
}

/**
 * ```tsx
 * interactOutside({ ref: popover, onInteractOutside: () => setOpen(false) });
 * ```
 */
export function interactOutside(options: InteractOutsideOptions): void {
  const state = { isPointerDown: false, ignoreEmulatedMouseEvents: false };

  effect(() => {
    if (access(options.isDisabled) === true) return undefined;

    const element = access(options.ref);
    const doc = ownerDocument(element);

    const onPointerDown = (event: Event): void => {
      if (options.onInteractOutside === undefined) return;
      if (!isOutside(event, access(options.ref))) return;
      options.onInteractOutsideStart?.(event as PointerEvent);
      state.isPointerDown = true;
    };

    if (typeof PointerEvent !== "undefined") {
      const onClick = (event: Event): void => {
        if (state.isPointerDown && isOutside(event, access(options.ref))) {
          options.onInteractOutside?.(event as PointerEvent);
        }
        state.isPointerDown = false;
      };

      // Capturing: a handler in between may stop propagation, and a combobox
      // that closes on selection removes the element before the bubble phase.
      doc.addEventListener("pointerdown", onPointerDown, true);
      doc.addEventListener("click", onClick, true);

      return () => {
        doc.removeEventListener("pointerdown", onPointerDown, true);
        doc.removeEventListener("click", onClick, true);
      };
    }

    const onMouseUp = (event: Event): void => {
      if (state.ignoreEmulatedMouseEvents) {
        state.ignoreEmulatedMouseEvents = false;
      } else if (state.isPointerDown && isOutside(event, access(options.ref))) {
        options.onInteractOutside?.(event as PointerEvent);
      }
      state.isPointerDown = false;
    };

    const onTouchEnd = (event: Event): void => {
      state.ignoreEmulatedMouseEvents = true;
      if (state.isPointerDown && isOutside(event, access(options.ref))) {
        options.onInteractOutside?.(event as PointerEvent);
      }
      state.isPointerDown = false;
    };

    doc.addEventListener("mousedown", onPointerDown, true);
    doc.addEventListener("mouseup", onMouseUp, true);
    doc.addEventListener("touchstart", onPointerDown, true);
    doc.addEventListener("touchend", onTouchEnd, true);

    return () => {
      doc.removeEventListener("mousedown", onPointerDown, true);
      doc.removeEventListener("mouseup", onMouseUp, true);
      doc.removeEventListener("touchstart", onPointerDown, true);
      doc.removeEventListener("touchend", onTouchEnd, true);
    };
  });
}
