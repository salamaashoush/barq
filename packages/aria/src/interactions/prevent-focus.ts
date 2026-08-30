/**
 * Stopping a press from moving focus, without `preventDefault()`.
 *
 * `preventDefault()` on `mousedown` would do it, but it also cancels the
 * browser's text selection and drag start, which a component that only wants
 * to keep focus where it is has no business cancelling. So focus is allowed to
 * move and then put back inside the same frame, with the intervening events
 * swallowed by capturing listeners so nothing else observes the round trip.
 *
 * Used by a combobox button and a menu trigger: pressing one must not take
 * focus off the input.
 */

import {
  activeElement,
  contains,
  focusWithoutScrolling,
  isFocusable,
  isShadowRoot,
  ownerWindow,
  targetElement,
} from "../dom.ts";
import { setIgnoringFocus } from "./flags.ts";

/**
 * Swallow the next focus that lands on `target`, restoring the element that
 * had it. Returns the teardown, or `undefined` when there was nothing to do.
 */
export function preventFocus(target: Element | null): (() => void) | undefined {
  // The browser focuses the nearest focusable ancestor, which is where the
  // events will actually land.
  let element: Element | null = target;
  while (element !== null && !isFocusable(element, { skipVisibilityCheck: true })) {
    element = element.parentElement;
  }

  const view = ownerWindow(element);
  const previous = activeElement(view.document) as HTMLElement | SVGElement | null;
  if (previous === null || (previous as Element) === element) return undefined;

  // Listen on the target's own root: a focus event inside a shadow root never
  // reaches the window.
  const targetRoot = element?.getRootNode();
  const root: EventTarget =
    targetRoot !== undefined && targetRoot !== null && isShadowRoot(targetRoot) ? targetRoot : view;

  const movingToTarget = (node: Element | null): boolean =>
    node === element || (node !== null && contains(element, node));
  const leavingPrevious = (node: Element | null): boolean =>
    node === (previous as Element) || (node !== null && contains(previous, node));

  setIgnoringFocus(true);
  let restoring = false;

  const onBlur = (event: Event): void => {
    if (leavingPrevious(targetElement(event)) || restoring) event.stopImmediatePropagation();
  };

  const onFocusOut = (event: Event): void => {
    if (!leavingPrevious(targetElement(event)) && !restoring) return;
    event.stopImmediatePropagation();
    // With no focusable ancestor there will be no focus event to react to, so
    // the restore has to happen here.
    if (element === null && !restoring) {
      restoring = true;
      focusWithoutScrolling(previous);
      cleanup();
    }
  };

  const onFocus = (event: Event): void => {
    if (movingToTarget(targetElement(event)) || restoring) event.stopImmediatePropagation();
  };

  const onFocusIn = (event: Event): void => {
    if (!movingToTarget(targetElement(event)) && !restoring) return;
    event.stopImmediatePropagation();
    if (restoring) return;
    restoring = true;
    focusWithoutScrolling(previous);
    cleanup();
  };

  root.addEventListener("blur", onBlur, true);
  root.addEventListener("focusout", onFocusOut, true);
  root.addEventListener("focusin", onFocusIn, true);
  root.addEventListener("focus", onFocus, true);

  const cleanup = (): void => {
    cancelAnimationFrame(frame);
    root.removeEventListener("blur", onBlur, true);
    root.removeEventListener("focusout", onFocusOut, true);
    root.removeEventListener("focusin", onFocusIn, true);
    root.removeEventListener("focus", onFocus, true);
    setIgnoringFocus(false);
    restoring = false;
  };

  // One frame is the ceiling: the focus either moved by then or is not coming.
  const frame = requestAnimationFrame(cleanup);
  return cleanup;
}
