/**
 * Hover, minus the two things CSS `:hover` gets wrong for a widget.
 *
 * A touch leaves the element in the hover state until the user taps somewhere
 * else, so a tooltip opened on tap never closes. And when a hovered element is
 * removed or shrinks out from under the pointer the browser fires no
 * `pointerleave` at all, so the state sticks until the pointer moves again.
 *
 * Emulated mouse events are the mechanism behind the first: iOS fires
 * `pointerenter` twice for a tap, once as `touch` and once as `mouse`. The
 * `mouse` one is suppressed for half a second after any touch anywhere on the
 * page, which has to be page-wide because the second event can land on a
 * different element than the first.
 */

import { type Accessor, effect, isServer, signal } from "@barqjs/core";
import { tryCleanup } from "@barqjs/primitives/utils";
import { contains, ownerDocument, targetElement } from "../dom.ts";
import { access, type DOMProps, type MaybeAccessor } from "../utils.ts";
import { globalListeners } from "./listeners.ts";
import type { PointerType } from "./modality.ts";

export interface HoverEvent {
  type: "hoverstart" | "hoverend";
  pointerType: "mouse" | "pen";
  target: Element;
}

export interface HoverOptions {
  isDisabled?: MaybeAccessor<boolean | undefined>;
  onHoverStart?: (event: HoverEvent) => void;
  onHoverEnd?: (event: HoverEvent) => void;
  onHoverChange?: (isHovered: boolean) => void;
}

export interface HoverResult {
  /** Props to spread on the hoverable element. */
  hoverProps: DOMProps;
  /** Whether a pointer that can hover is over the element. */
  isHovered: Accessor<boolean>;
}

let ignoreEmulatedMouseEvents = false;
let hoverCount = 0;

function suppressEmulatedMouseEvents(): void {
  ignoreEmulatedMouseEvents = true;
  // Cleared shortly after: iOS fires the emulated `pointerenter` immediately
  // after `pointerup`, and a touch now must not suppress a genuine mouse hover
  // a minute from now.
  setTimeout(() => {
    ignoreEmulatedMouseEvents = false;
  }, 500);
}

function onGlobalPointerUp(event: Event): void {
  if ((event as PointerEvent).pointerType === "touch") suppressEmulatedMouseEvents();
}

/** One document listener shared by every hover on the page. */
function trackEmulatedMouseEvents(): () => void {
  const doc = ownerDocument(null);
  if (doc === undefined) return () => {};

  if (hoverCount === 0) {
    if (typeof PointerEvent !== "undefined") {
      doc.addEventListener("pointerup", onGlobalPointerUp);
    } else {
      doc.addEventListener("touchend", suppressEmulatedMouseEvents);
    }
  }
  hoverCount++;

  return () => {
    hoverCount--;
    if (hoverCount > 0) return;
    if (typeof PointerEvent !== "undefined") {
      doc.removeEventListener("pointerup", onGlobalPointerUp);
    } else {
      doc.removeEventListener("touchend", suppressEmulatedMouseEvents);
    }
  };
}

/**
 * Hover handling for one element.
 *
 * ```tsx
 * const { hoverProps, isHovered } = hover({ onHoverChange: (over) => tip.set(over) });
 * <button {...hoverProps} data-hovered={isHovered} />
 * ```
 */
export function hover(options: HoverOptions): HoverResult {
  const hovered = signal(false);
  const listeners = globalListeners();

  const state = {
    isHovered: false,
    ignoreEmulatedMouseEvents: false,
    pointerType: "" as PointerType | "",
    target: null as Element | null,
  };

  if (!isServer) tryCleanup(trackEmulatedMouseEvents());

  const isDisabled = (): boolean => access(options.isDisabled) === true;

  const triggerHoverEnd = (target: Element | null, pointerType: PointerType | ""): void => {
    const element = target ?? state.target;
    state.pointerType = "";
    state.target = null;

    if (pointerType === "touch" || !state.isHovered || element === null) return;

    state.isHovered = false;
    listeners.removeAll();

    options.onHoverEnd?.({
      type: "hoverend",
      target: element,
      pointerType: pointerType as "mouse",
    });
    options.onHoverChange?.(false);
    hovered.set(false);
  };

  const triggerHoverStart = (event: Event, pointerType: PointerType): void => {
    state.pointerType = pointerType;
    const currentTarget = event.currentTarget as Element | null;
    if (
      isDisabled() ||
      pointerType === "touch" ||
      state.isHovered ||
      currentTarget === null ||
      !contains(currentTarget, targetElement(event))
    ) {
      return;
    }

    state.isHovered = true;
    state.target = currentTarget;

    // The browser fires no `pointerleave` when the hovered element is removed,
    // but it does fire `pointerover` on whatever is under the pointer next —
    // immediately in Chrome, on the next pixel of movement elsewhere.
    listeners.add(
      ownerDocument(targetElement(event)),
      "pointerover",
      (over: Event) => {
        const pointer = over as PointerEvent;
        if (
          state.isHovered &&
          state.target !== null &&
          !contains(state.target, targetElement(pointer))
        ) {
          triggerHoverEnd(state.target, pointer.pointerType as PointerType);
        }
      },
      { capture: true },
    );

    options.onHoverStart?.({
      type: "hoverstart",
      target: currentTarget,
      pointerType: pointerType as "mouse",
    });
    options.onHoverChange?.(true);
    hovered.set(true);
  };

  const hoverProps: DOMProps = {};

  if (typeof PointerEvent !== "undefined") {
    hoverProps.onPointerEnter = (event: PointerEvent): void => {
      if (ignoreEmulatedMouseEvents && event.pointerType === "mouse") return;
      triggerHoverStart(event, event.pointerType as PointerType);
    };

    hoverProps.onPointerLeave = (event: PointerEvent): void => {
      const currentTarget = event.currentTarget as Element | null;
      if (isDisabled() || currentTarget === null) return;
      if (!contains(currentTarget, targetElement(event))) return;
      triggerHoverEnd(currentTarget, event.pointerType as PointerType);
    };
  } else {
    hoverProps.onTouchStart = (): void => {
      state.ignoreEmulatedMouseEvents = true;
    };

    hoverProps.onMouseEnter = (event: MouseEvent): void => {
      if (!state.ignoreEmulatedMouseEvents && !ignoreEmulatedMouseEvents) {
        triggerHoverStart(event, "mouse");
      }
      state.ignoreEmulatedMouseEvents = false;
    };

    hoverProps.onMouseLeave = (event: MouseEvent): void => {
      const currentTarget = event.currentTarget as Element | null;
      if (isDisabled() || currentTarget === null) return;
      if (!contains(currentTarget, targetElement(event))) return;
      triggerHoverEnd(currentTarget, "mouse");
    };
  }

  // Disabling mid-hover has to end it, or a tooltip stays open over a control
  // that no longer responds.
  effect(() => {
    if (isDisabled()) triggerHoverEnd(state.target, state.pointerType);
  });

  return { hoverProps, isHovered: hovered };
}
