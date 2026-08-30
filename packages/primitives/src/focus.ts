import { type Accessor, isServer, scope, signal } from "@barqjs/core";
import { on } from "./event.ts";
import { type Clear, type MaybeAccessor, access, shared } from "./utils.ts";

/**
 * Whatever has focus right now.
 *
 * Bound with `focusin`/`focusout`, which bubble; `focus` and `blur` do not, so
 * a listener on the document never hears them. `focusout` fires before the new
 * element takes focus, so it reads `null` for one turn of the loop — which is
 * correct, and is why a menu closing on blur has to check where focus went.
 */
export const activeElement: () => Accessor<Element | null> = shared(() => {
  const active = signal<Element | null>(isServer ? null : document.activeElement);
  if (isServer) return active;

  on(document, "focusin", () => active.set(document.activeElement));
  on(document, "focusout", () => active.set(document.activeElement));
  // The document loses focus to the browser chrome or another window without
  // either event firing.
  on(window, "blur", () => active.set(null));
  on(window, "focus", () => active.set(document.activeElement));

  return active;
});

/** Whether an element has focus. */
export function focused(target: MaybeAccessor<Element | null | undefined>): Accessor<boolean> {
  const has = signal(false);
  if (isServer) return has;
  on(target, "focus", () => has.set(true));
  on(target, "blur", () => has.set(false));
  return has;
}

/** Whether an element, or anything inside it, has focus. */
export function focusWithin(target: MaybeAccessor<Element | null | undefined>): Accessor<boolean> {
  const has = signal(false);
  if (isServer) return has;
  on(target, "focusin", () => has.set(true));
  on(target, "focusout", (event) => {
    const element = access(target);
    const next = event.relatedTarget;
    // `relatedTarget` is where focus is going. Without this check a click on
    // one child from another closes the popover the click was inside.
    has.set(
      element !== null && element !== undefined && next instanceof Node
        ? element.contains(next)
        : false,
    );
  });
  return has;
}

export interface ClickOutsideOptions {
  /** Extra elements a click may land in without counting as outside. */
  ignore?: MaybeAccessor<readonly (Element | null | undefined)[]>;
  /** Also close on Escape. On by default, because a dismissible thing should be dismissible from the keyboard. */
  escape?: boolean;
  /**
   * What counts as a click. Defaults to `pointerdown`, which covers mouse, pen
   * and touch in one listener. `["mousedown", "touchstart"]` is the older
   * spelling, and `["click"]` waits for the button to come back up.
   */
  events?: readonly (keyof DocumentEventMap)[];
}

/**
 * Call `handler` when a pointer goes down anywhere outside `target`.
 *
 * `pointerdown` in the capture phase, not `click`: a `click` handler fires
 * after the element it was aimed at may already have been removed, and a
 * bubbling listener never sees an event a child stopped.
 */
export function clickOutside(
  target: MaybeAccessor<Element | null | undefined>,
  handler: (event: Event) => void,
  options?: ClickOutsideOptions,
): Clear {
  if (isServer) return () => {};

  const outside = (event: Event): void => {
    const element = access(target);
    if (element === null || element === undefined) return;
    const hit = event.target;
    if (!(hit instanceof Node)) return;
    if (element.contains(hit)) return;
    for (const other of access(options?.ignore) ?? []) {
      if (other !== null && other !== undefined && other.contains(hit)) return;
    }
    handler(event);
  };

  return scope((dispose) => {
    on(document, options?.events ?? ["pointerdown"], outside, { capture: true });
    if (options?.escape !== false) {
      on(document, "keydown", (event) => {
        if (event.key === "Escape") handler(event);
      });
    }
    return dispose;
  });
}
