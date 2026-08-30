/**
 * A press held past a threshold, with the platform's own long-press behaviour
 * suppressed for the duration.
 *
 * Three things fight a long press. The context menu opens on touch, which is
 * the platform's own long press. The click that follows would activate the
 * short-press action as well, so both would fire. And on touch the browser
 * only focuses on pointer up, so the element the menu belongs to has no focus
 * when the menu opens.
 *
 * A `pointercancel` is dispatched at the threshold so any other press on the
 * same element abandons its own interaction rather than firing too.
 */

import { focusWithoutScrolling, ownerDocument, ownerWindow } from "../dom.ts";
import { access, mergeProps, type DOMProps, type MaybeAccessor } from "../utils.ts";
import { description } from "./description.ts";
import { globalListeners } from "./listeners.ts";
import type { PointerType } from "./modality.ts";
import { press, type PressEvent } from "./press.ts";

export interface LongPressEvent extends Omit<PressEvent, "type"> {
  type: "longpressstart" | "longpressend" | "longpress";
}

export interface LongPressOptions {
  isDisabled?: MaybeAccessor<boolean | undefined>;
  /** Which pointer types count. Both mouse and touch by default. */
  pointerType?: MaybeAccessor<"mouse" | "touch" | undefined>;
  /** How long the press must be held. @default 500 */
  threshold?: MaybeAccessor<number | undefined>;
  /**
   * What assistive technology should say the long press does, e.g.
   * "Long press to open the menu". There is no visible affordance to infer it
   * from, so without this the action is undiscoverable.
   */
  accessibilityDescription?: MaybeAccessor<string | undefined>;
  onLongPressStart?: (event: LongPressEvent) => void;
  onLongPressEnd?: (event: LongPressEvent) => void;
  onLongPress?: (event: LongPressEvent) => void;
}

export interface LongPressResult {
  longPressProps: DOMProps;
}

export interface LongPressHandlers {
  onPressStart: (event: PressEvent) => void;
  onPressEnd: (event: PressEvent) => void;
  /** `aria-describedby` for the accessibility description, if there is one. */
  describedProps: DOMProps;
}

const DEFAULT_THRESHOLD = 500;

function asLongPress(event: PressEvent, type: LongPressEvent["type"]): LongPressEvent {
  return {
    type,
    pointerType: event.pointerType,
    target: event.target,
    shiftKey: event.shiftKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    altKey: event.altKey,
    x: event.x,
    y: event.y,
    key: event.key,
    continuePropagation: () => event.continuePropagation(),
  };
}

/**
 * The long press as press callbacks, for an element that already has a press.
 *
 * A menu trigger is a button, so it has one already; a second `press` on the
 * same element would mean two pressed states and two sets of global pointer
 * listeners racing over one gesture.
 */
export function longPressHandlers(options: LongPressOptions): LongPressHandlers {
  const listeners = globalListeners();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const accepts = (event: PressEvent): boolean => {
    const wanted = access(options.pointerType);
    if (wanted !== undefined) return event.pointerType === wanted;
    return event.pointerType === "mouse" || event.pointerType === "touch";
  };

  const described = description(() => {
    if (options.onLongPress === undefined || access(options.isDisabled) === true) return undefined;
    return access(options.accessibilityDescription);
  });

  return {
    describedProps: described,
    onPressStart(event) {
      // A long press is not a press: the short-press handler on the same
      // element must still see this event.
      event.continuePropagation();
      if (!accepts(event)) return;

      options.onLongPressStart?.(asLongPress(event, "longpressstart"));

      const threshold = access(options.threshold) ?? DEFAULT_THRESHOLD;
      timer = setTimeout(() => {
        // Any other press bound to this element abandons its interaction.
        event.target.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true }));
        // And the click that would otherwise follow is swallowed, so a long
        // press on a link does not also open it.
        listeners.add(event.target, "click", (click) => click.preventDefault(), { once: true });

        // On touch the browser focuses on pointer up, which has not happened.
        if (ownerDocument(event.target).activeElement !== event.target) {
          focusWithoutScrolling(event.target as HTMLElement);
        }

        options.onLongPress?.(asLongPress(event, "longpress"));
        timer = undefined;
      }, threshold);

      if (event.pointerType === "touch") {
        listeners.add(event.target, "contextmenu", (menu) => menu.preventDefault(), { once: true });
      }

      listeners.add(
        ownerWindow(event.target),
        "pointerup",
        () => {
          // The click and contextmenu handlers above are only for the events
          // this long press provoked. If neither arrives promptly, they must
          // come off, or the next ordinary click is swallowed too.
          setTimeout(() => listeners.removeAll(), 100);
        },
        { once: true },
      );
    },
    onPressEnd(event) {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      if (accepts(event)) options.onLongPressEnd?.(asLongPress(event, "longpressend"));
    },
  };
}

/**
 * ```tsx
 * const { longPressProps } = longPress({
 *   accessibilityDescription: "Long press to open the menu",
 *   onLongPress: () => menu.open(),
 * });
 * ```
 */
export function longPress(options: LongPressOptions): LongPressResult {
  const { describedProps, ...handlers } = longPressHandlers(options);
  const { pressProps } = press({ isDisabled: options.isDisabled, ...handlers });
  return { longPressProps: mergeProps(pressProps, describedProps) };
}

/** What a pointer type is called, for a consumer branching on it. */
export type LongPressPointerType = PointerType;
