/**
 * A toolbar: a row of controls that Tab enters ONCE.
 *
 * Without one, a formatting bar of twelve buttons is twelve Tab stops between
 * the user and the next field. `role="toolbar"` says the arrows move inside it
 * and Tab leaves it, which is the same bargain a listbox or a tab list makes,
 * and it is the reason the role exists.
 *
 * Two things make it work rather than merely claim to:
 *
 * - **Tab leaves from the END.** Focus is moved to the last control before the
 *   browser handles the key, so its own Tab continues past the whole toolbar
 *   rather than into the middle of it. Shift+Tab moves to the first.
 * - **Coming back lands where you left.** The control that had focus when the
 *   toolbar was left is remembered and refocused, so a toolbar is not a place
 *   you have to arrow across again every time.
 *
 * A toolbar inside a toolbar takes no arrow keys of its own: the outer one is
 * already handling them, and two handlers on one keypress move focus twice.
 */

import { type Child, effect, type Incoming, isServer, signal } from "@barqjs/core";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import { contains, targetElement } from "./dom.ts";
import { createFocusManager } from "./focus.ts";
import { useLocale } from "./i18n.ts";
import type { ElementRef } from "./interactions/press.ts";
import type { Orientation } from "./selection.ts";
import {
  access,
  filterDOMProps,
  fromProps,
  mergeProps,
  styleProps,
  type DOMProps,
  type MaybeAccessor,
  type StyleProps,
} from "./utils.ts";

export interface ToolbarOptions {
  ref: ElementRef;
  /** @default "horizontal" */
  orientation?: MaybeAccessor<Orientation | undefined>;
  "aria-label"?: MaybeAccessor<string | undefined>;
  "aria-labelledby"?: MaybeAccessor<string | undefined>;
}

export interface ToolbarResult {
  toolbarProps: DOMProps;
}

export function toolbar(options: ToolbarOptions): ToolbarResult {
  const locale = useLocale();
  const manager = createFocusManager(options.ref);
  const nested = signal(false);

  const orientation = (): Orientation => access(options.orientation) ?? "horizontal";
  // Left and right follow the WRITING direction; up and down never do.
  const flipped = (): boolean => locale().direction === "rtl" && orientation() === "horizontal";

  if (!isServer) {
    effect(() => {
      const element = access(options.ref) as Element | null;
      const outer = element?.parentElement?.closest('[role="toolbar"]');
      nested.set(outer !== null && outer !== undefined);
    });
  }

  let lastFocused: HTMLElement | null = null;

  const onKeyDown = (event: KeyboardEvent): void => {
    // A key from a portalled subtree — a menu the toolbar opened — is not the
    // toolbar's to act on, whatever the DOM says about where it bubbled.
    const target = targetElement(event);
    if (!contains(event.currentTarget as Element, target)) return;
    if (nested()) return;

    const forwards = orientation() === "horizontal" ? "ArrowRight" : "ArrowDown";
    const backwards = orientation() === "horizontal" ? "ArrowLeft" : "ArrowUp";

    if (event.key === "Tab") {
      // Move to the end the browser is about to leave from, and let it.
      lastFocused = (target as HTMLElement | null) ?? null;
      if (event.shiftKey) manager.focusFirst();
      else manager.focusLast();
      return;
    }

    if (event.key === forwards) {
      if (flipped()) manager.focusPrevious();
      else manager.focusNext();
    } else if (event.key === backwards) {
      if (flipped()) manager.focusNext();
      else manager.focusPrevious();
    } else {
      return;
    }

    // A nested action group must not move focus a second time for one key.
    event.stopPropagation();
    event.preventDefault();
  };

  const onBlur = (event: FocusEvent): void => {
    const current = event.currentTarget as Element;
    if (contains(current, event.relatedTarget as Element | null)) return;
    if (lastFocused !== null) return;
    lastFocused = targetElement(event) as HTMLElement | null;
  };

  const onFocus = (event: FocusEvent): void => {
    const current = event.currentTarget as Element;
    if (lastFocused === null) return;
    // Only when focus came from OUTSIDE: moving between two controls inside
    // is the roving focus doing its job.
    if (contains(current, event.relatedTarget as Element | null)) return;
    if (!contains(current, targetElement(event))) return;
    // Gone from the document since: whatever the browser landed on stands.
    if (lastFocused.isConnected) lastFocused.focus();
    lastFocused = null;
  };

  return {
    toolbarProps: mergeProps(filterDOMProps(options, { labelable: true }), {
      role: "toolbar",
      "aria-orientation": orientation,
      onKeyDown,
      onFocusIn: onFocus,
      onFocusOut: onBlur,
    }),
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface ToolbarComponentProps extends StyleProps {
  children?: Child;
  /** @default "horizontal" */
  orientation?: Orientation;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  ref?: RefTarget<HTMLDivElement>;
}

/**
 * ```tsx
 * <Toolbar aria-label="Formatting">
 *   <ToggleButton>Bold</ToggleButton>
 *   <ToggleButton>Italic</ToggleButton>
 * </Toolbar>
 * ```
 */
export function Toolbar(props: Incoming<ToolbarComponentProps>) {
  const domRef = makeRef<HTMLDivElement>();
  const options = fromProps(props);

  const { toolbarProps } = toolbar({ ...(options as unknown as ToolbarOptions), ref: domRef });

  const elementProps = mergeProps(toolbarProps, styleProps(props), {
    "data-orientation": () => props.orientation?.() ?? "horizontal",
    "data-testid": () => props["data-testid"]?.(),
  });

  return (
    <div {...elementProps} ref={mergeRefs(domRef.set, props.ref?.())}>
      {props.children}
    </div>
  );
}
