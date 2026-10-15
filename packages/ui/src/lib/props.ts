/**
 * What every component in this package accepts.
 *
 * shadcn spreads `React.ComponentProps<"div">` and lets anything through.
 * `uiProps` filters instead — a design-system prop like `variant` must not
 * become an attribute — so this type is the list of what survives the filter,
 * and `class` above all, because that is what the whole package is overridden
 * through.
 */

import type { Child } from "@barqjs/core";

/**
 * A `ref` for whichever element a component renders, as a callback.
 *
 * The parameter is left unchecked for variance, which a method signature is
 * and a property is not: a part hands this on to the element it builds, a
 * `<div>` here and an `<li>` there, and a callback written for either is the
 * right one to hand it. A component that renders one known element declares
 * `RefTarget` of that element instead, and takes a `{ current }` box as well.
 */
export type UiRef =
  | { on(element: HTMLElement | null): void | (() => void) }["on"]
  | null
  | undefined;

export interface UiProps {
  /** Composed with the component's own classes; yours wins, because this package's rules are layered. */
  class?: string;
  className?: string;
  style?: Record<string, string | number | undefined>;
  id?: string;
  children?: Child;
  role?: string;
  title?: string;
  tabIndex?: number;
  hidden?: boolean;
  dir?: "ltr" | "rtl" | "auto";
  lang?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-hidden"?: boolean | "true" | "false";
  /** Overrides the component's own slot name. Every element carries one; this renames it. */
  "data-slot"?: string;
  "data-testid"?: string;
  /** The element the component renders. */
  ref?: UiRef;
  onClick?: (event: MouseEvent) => void;
  onPointerDown?: (event: PointerEvent) => void;
  onPointerUp?: (event: PointerEvent) => void;
  onMouseEnter?: (event: MouseEvent) => void;
  onMouseLeave?: (event: MouseEvent) => void;
}
