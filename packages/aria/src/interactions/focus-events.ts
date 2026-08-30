/**
 * Focus and blur, for the element itself and for its subtree.
 *
 * Two platform gaps are papered over here.
 *
 * A form control that is disabled while it has focus loses it, but Firefox
 * fires no event to say so, and no engine fires one when the focused element
 * is simply removed from the document. A component whose "is focused" state
 * never returns to false keeps a ring, or an open popover, on something that
 * is not there.
 *
 * The first is watched with a `MutationObserver` on the `disabled` attribute;
 * the second with a capturing `focus` listener on the document, which reports
 * where focus went instead.
 */

import { type Accessor, signal } from "@barqjs/core";
import { tryCleanup } from "@barqjs/primitives/utils";
import { activeElement, contains, ownerDocument, targetElement } from "../dom.ts";
import { access, type DOMProps, type MaybeAccessor } from "../utils.ts";
import { globalListeners } from "./listeners.ts";

export interface FocusOptions {
  isDisabled?: MaybeAccessor<boolean | undefined>;
  onFocus?: (event: FocusEvent) => void;
  onBlur?: (event: FocusEvent) => void;
  onFocusChange?: (isFocused: boolean) => void;
}

export interface FocusResult {
  focusProps: DOMProps;
  /** Whether the element itself has focus. */
  isFocused: Accessor<boolean>;
}

/**
 * A blur for a control that was disabled while focused.
 *
 * Returns the `focus` handler that arms the watch; it disarms itself on the
 * first `focusout`, which every engine but Firefox fires on its own, and the
 * observer then never gets the chance to fire a second one.
 */
function watchDisabledBlur(onBlur: (event: FocusEvent) => void): {
  arm: (event: FocusEvent) => void;
  disconnect: () => void;
} {
  const state = { isFocused: false, observer: null as MutationObserver | null };

  const disconnect = (): void => {
    state.observer?.disconnect();
    state.observer = null;
  };

  const arm = (event: FocusEvent): void => {
    const target = targetElement(event);
    if (
      !(target instanceof HTMLButtonElement) &&
      !(target instanceof HTMLInputElement) &&
      !(target instanceof HTMLTextAreaElement) &&
      !(target instanceof HTMLSelectElement)
    ) {
      return;
    }

    state.isFocused = true;

    target.addEventListener(
      "focusout",
      (out: Event) => {
        state.isFocused = false;
        if (target.disabled) onBlur(out as FocusEvent);
        disconnect();
      },
      { once: true },
    );

    disconnect();
    state.observer = new MutationObserver(() => {
      if (!state.isFocused || !target.disabled) return;
      disconnect();
      const related = target === activeElement(ownerDocument(target)) ? null : activeElement();
      target.dispatchEvent(new FocusEvent("blur", { relatedTarget: related }));
      target.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: related }));
    });
    state.observer.observe(target, { attributes: true, attributeFilter: ["disabled"] });
  };

  return { arm, disconnect };
}

/**
 * Focus for the element itself; anything a descendant does is ignored.
 *
 * ```tsx
 * const { focusProps, isFocused } = focused({ onFocusChange: (on) => open.set(on) });
 * <input {...focusProps} data-focused={isFocused} />
 * ```
 */
export function focused(options: FocusOptions = {}): FocusResult {
  const isFocused = signal(false);

  const onBlur = (event: FocusEvent): void => {
    if (targetElement(event) !== event.currentTarget && event.currentTarget !== null) return;
    isFocused.set(false);
    options.onBlur?.(event);
    options.onFocusChange?.(false);
  };

  const disabledBlur = watchDisabledBlur(onBlur);
  tryCleanup(disabledBlur.disconnect);

  const onFocus = (event: FocusEvent): void => {
    // A handler chained before this one may already have moved focus.
    const target = targetElement(event);
    const active = activeElement(ownerDocument(target));
    if (target !== event.currentTarget || target !== active) return;

    isFocused.set(true);
    options.onFocus?.(event);
    options.onFocusChange?.(true);
    disabledBlur.arm(event);
  };

  const enabled = (): boolean => access(options.isDisabled) !== true;

  return {
    isFocused,
    focusProps: {
      onFocus: (event: FocusEvent) => {
        if (enabled()) onFocus(event);
      },
      onBlur: (event: FocusEvent) => {
        if (enabled()) onBlur(event);
      },
    },
  };
}

export interface FocusWithinOptions {
  isDisabled?: MaybeAccessor<boolean | undefined>;
  onFocusWithin?: (event: FocusEvent) => void;
  onBlurWithin?: (event: FocusEvent) => void;
  onFocusWithinChange?: (isFocusWithin: boolean) => void;
}

export interface FocusWithinResult {
  focusWithinProps: DOMProps;
  /** Whether the element or anything inside it has focus. */
  isFocusWithin: Accessor<boolean>;
}

/**
 * Focus for the element and everything inside it.
 *
 * Bound to `focusin`/`focusout`, which bubble. `focus` and `blur` do not, so a
 * listener on a container never hears a child take focus.
 */
export function focusWithin(options: FocusWithinOptions = {}): FocusWithinResult {
  const isFocusWithin = signal(false);
  const listeners = globalListeners();

  const onBlur = (event: FocusEvent): void => {
    const currentTarget = event.currentTarget as Element | null;
    if (currentTarget === null || !contains(currentTarget, targetElement(event))) return;

    // Focus moving between two children is not leaving. `relatedTarget` is
    // where it is going.
    if (!isFocusWithin() || contains(currentTarget, event.relatedTarget as Element | null)) return;

    isFocusWithin.set(false);
    listeners.removeAll();
    options.onBlurWithin?.(event);
    options.onFocusWithinChange?.(false);
  };

  const onFocus = (event: FocusEvent): void => {
    const currentTarget = event.currentTarget as Element | null;
    if (currentTarget === null || !contains(currentTarget, targetElement(event))) return;

    const target = targetElement(event);
    const doc = ownerDocument(target);
    if (isFocusWithin() || activeElement(doc) !== target) return;

    options.onFocusWithin?.(event);
    options.onFocusWithinChange?.(true);
    isFocusWithin.set(true);

    // No blur fires when the focused element is removed. A focus landing
    // outside is the evidence that it left.
    listeners.add(
      doc,
      "focus",
      (moved: Event) => {
        const next = targetElement(moved);
        if (!isFocusWithin() || contains(currentTarget, next)) return;
        const synthetic = new FocusEvent("blur", { relatedTarget: next });
        Object.defineProperty(synthetic, "target", { value: currentTarget });
        Object.defineProperty(synthetic, "currentTarget", { value: currentTarget });
        onBlur(synthetic);
      },
      { capture: true },
    );
  };

  const enabled = (): boolean => access(options.isDisabled) !== true;

  return {
    isFocusWithin,
    focusWithinProps: {
      onFocusIn: (event: FocusEvent) => {
        if (enabled()) onFocus(event);
      },
      onFocusOut: (event: FocusEvent) => {
        if (enabled()) onBlur(event);
      },
    },
  };
}
