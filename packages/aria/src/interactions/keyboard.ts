/**
 * Keyboard handling with propagation stopped by default.
 *
 * A component nested inside another that also handles keys — a menu inside a
 * dialog inside a listbox — must not let one Escape close all three. So a
 * handler here consumes the event unless it says otherwise, which inverts the
 * platform default and makes composition the easy case rather than the one
 * every caller has to remember.
 *
 * `continuePropagation()` is added to the native event rather than to a
 * synthetic copy of it, because barq has no synthetic event system and a copy
 * would break `preventDefault`, `currentTarget` and every other live property.
 */

import { access, type DOMProps, type MaybeAccessor } from "../utils.ts";

/** A native event with the opt-out from this module's default. */
export type BaseEvent<E extends Event> = E & { continuePropagation(): void };

const CONTINUE = Symbol.for("barq.aria.continuePropagation");

interface Marked {
  [CONTINUE]?: boolean;
}

/**
 * Wrap a handler so the event it receives stops propagating unless the handler
 * calls `continuePropagation()`.
 *
 * Nesting composes: an inner wrapper that was told to continue tells the outer
 * one too, so an event a child chose to let through is not swallowed by the
 * parent that delegated to it.
 */
export function createEventHandler<E extends Event>(
  handler?: (event: BaseEvent<E>) => void,
): ((event: E) => void) | undefined {
  if (handler === undefined) return undefined;

  return (event: E): void => {
    const marked = event as E & Marked;
    const outer = (event as unknown as Partial<BaseEvent<E>>).continuePropagation;
    let shouldStop = true;

    Object.defineProperty(event, "continuePropagation", {
      configurable: true,
      writable: true,
      value: (): void => {
        shouldStop = false;
        marked[CONTINUE] = true;
        // A wrapper further out has already decided to stop; tell it not to.
        outer?.call(event);
      },
    });

    try {
      handler(event as BaseEvent<E>);
    } finally {
      if (outer === undefined) {
        delete (event as unknown as Partial<BaseEvent<E>>).continuePropagation;
      } else
        Object.defineProperty(event, "continuePropagation", { configurable: true, value: outer });
    }

    if (shouldStop && !event.cancelBubble) event.stopPropagation();
  };
}

export interface KeyboardOptions {
  isDisabled?: MaybeAccessor<boolean | undefined>;
  onKeyDown?: (event: BaseEvent<KeyboardEvent>) => void;
  onKeyUp?: (event: BaseEvent<KeyboardEvent>) => void;
}

export interface KeyboardResult {
  keyboardProps: DOMProps;
}

/**
 * Key handling for a focusable element.
 *
 * ```tsx
 * const { keyboardProps } = keyboard({
 *   onKeyDown: (e) => {
 *     if (e.key !== "Escape") e.continuePropagation();
 *     else close();
 *   },
 * });
 * ```
 */
export function keyboard(options: KeyboardOptions = {}): KeyboardResult {
  const down = createEventHandler(options.onKeyDown);
  const up = createEventHandler(options.onKeyUp);
  const enabled = (): boolean => access(options.isDisabled) !== true;

  return {
    keyboardProps: {
      onKeyDown: (event: KeyboardEvent) => {
        if (enabled()) down?.(event);
      },
      onKeyUp: (event: KeyboardEvent) => {
        if (enabled()) up?.(event);
      },
    },
  };
}
