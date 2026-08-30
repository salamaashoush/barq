/**
 * Making an element focusable, and moving focus to one safely.
 *
 * `element.focus()` has two failure modes a widget hits constantly. It scrolls
 * the element into view, which yanks the page when a menu opens below the
 * fold. And under a virtual cursor on iOS, focusing an element that is mid
 * transition scrolls the page to wherever the element was rather than where it
 * is going, so VoiceOver reads the wrong thing.
 */

import { effect, isServer, signal } from "@barqjs/core";
import { activeElement, focusWithoutScrolling, ownerDocument, runAfterTransition } from "../dom.ts";
import { access, mergeProps, type DOMProps, type MaybeAccessor } from "../utils.ts";
import { focused, type FocusOptions } from "./focus-events.ts";
import { keyboard, type BaseEvent } from "./keyboard.ts";
import { getInteractionModality } from "./modality.ts";
import type { ElementRef } from "./press.ts";

/**
 * Move focus without scrolling, and without landing mid-transition when a
 * virtual cursor is driving.
 */
export function focusSafely(element: HTMLElement | SVGElement): void {
  if (!element.isConnected) return;

  if (getInteractionModality() !== "virtual") {
    focusWithoutScrolling(element);
    return;
  }

  const doc = ownerDocument(element);
  const before = activeElement(doc);
  runAfterTransition(() => {
    const active = activeElement(doc);
    // Only if nothing else claimed focus in the meantime.
    if ((active === before || active === doc.body) && element.isConnected) {
      focusWithoutScrolling(element);
    }
  });
}

export interface FocusableOptions extends FocusOptions {
  /** Take focus when first rendered. */
  autoFocus?: MaybeAccessor<boolean | undefined>;
  /** Stay focusable, but out of the Tab order. */
  excludeFromTabOrder?: MaybeAccessor<boolean | undefined>;
  onKeyDown?: (event: BaseEvent<KeyboardEvent>) => void;
  onKeyUp?: (event: BaseEvent<KeyboardEvent>) => void;
}

export interface FocusableResult {
  focusableProps: DOMProps;
}

/**
 * Focus, keys and tab order for one element.
 *
 * `tabIndex` is always written, even for a native button: WebKit leaves
 * buttons and form controls out of the Tab order unless one is present, which
 * is the "full keyboard access" preference being off by default.
 */
export function focusable(options: FocusableOptions, ref?: ElementRef): FocusableResult {
  const { focusProps } = focused(options);
  const { keyboardProps } = keyboard(options);

  const shouldAutoFocus = signal(access(options.autoFocus) === true);

  if (!isServer) {
    effect(() => {
      if (!shouldAutoFocus()) return;
      const element = ref === undefined ? null : access(ref);
      if (element === null || element === undefined) return;
      shouldAutoFocus.set(false);
      focusSafely(element as HTMLElement);
    });
  }

  const tabIndex = (): number | undefined => {
    if (access(options.isDisabled) === true) return undefined;
    return access(options.excludeFromTabOrder) === true ? -1 : 0;
  };

  return { focusableProps: mergeProps(focusProps, keyboardProps, { tabIndex }) };
}
