import { type Accessor, createEffect } from "@barqjs/core";
import {
  AriaLiveRegionExtension,
  FocusManagerExtension,
  type FocusManagerOptions,
  FocusTrapExtension,
  type FocusTrapInitialFocus,
  RovingTabIndexExtension,
  type RovingTabIndexOptions,
} from "@lexical/a11y";
import { getExtensionDependencyFromEditor } from "@lexical/extension";

import { useLexicalEditor } from "./context.ts";

export type { FocusManagerOptions, FocusTrapInitialFocus, RovingTabIndexOptions };

/** A ref: registers the element it is given and answers how to undo that. */
export type RegisteringRef = (element: HTMLElement) => () => void;

/**
 * A ref that makes the element a toolbar `FocusManagerExtension` manages:
 * arrow keys between its items, and Escape back to the editor.
 */
export function useLexicalFocusManagerRef(options: FocusManagerOptions = {}): RegisteringRef {
  const editor = useLexicalEditor();
  return (element) =>
    getExtensionDependencyFromEditor(editor, FocusManagerExtension).output.register(element, {
      toolbarItemSelector: options.toolbarItemSelector,
    });
}

/** A ref that makes the element a roving-tabindex group: one tab stop, arrows between items. */
export function useLexicalRovingTabIndexRef(options: RovingTabIndexOptions = {}): RegisteringRef {
  const editor = useLexicalEditor();
  return (element) =>
    getExtensionDependencyFromEditor(editor, RovingTabIndexExtension).output.register(element, {
      itemSelector: options.itemSelector,
      orientation: options.orientation,
    });
}

/**
 * A ref that traps focus inside the element while `isActive` is true, as a
 * dialog over the editor does. `isActive` is followed: the trap opens and
 * closes with it.
 */
export function useLexicalFocusTrapRef(
  isActive: boolean | Accessor<boolean>,
  initialFocus: FocusTrapInitialFocus = "firstFocusable",
  allowOutside?: (target: HTMLElement) => boolean,
): (element: HTMLElement) => void {
  const editor = useLexicalEditor();
  const active = typeof isActive === "function" ? isActive : (): boolean => isActive;
  return (element) => {
    createEffect(active, (on) => {
      if (!on) return undefined;
      return getExtensionDependencyFromEditor(editor, FocusTrapExtension).output.register(element, {
        allowOutside: (target) => (allowOutside === undefined ? false : allowOutside(target)),
        initialFocus,
      });
    });
  };
}

/** Announces a message through the editor's `AriaLiveRegionExtension`. */
export function useLexicalAriaLiveRegion(): (message: string) => void {
  const editor = useLexicalEditor();
  return (message) => {
    getExtensionDependencyFromEditor(editor, AriaLiveRegionExtension).output.announce(message);
  };
}
