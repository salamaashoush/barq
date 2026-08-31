/**
 * The props a component puts on its element.
 *
 * Three jobs in one place, because every component in the package needs all
 * three and getting one of them wrong is invisible until someone tries to
 * style, name or click the thing:
 *
 * - **`data-slot`**, which shadcn/ui puts on every element it renders. It is
 *   what `[data-slot="card-title"] { … }` selects, and what a component's own
 *   CSS reaches a child by.
 * - **The class**, ours first and the caller's after. Order in the attribute is
 *   cosmetic — a caller's rules are unlayered and win regardless — but reading
 *   the base first is what anyone expects in devtools.
 * - **Everything else the caller passed**, filtered. A `<div>` in a design
 *   system has to accept `role`, `title`, `aria-label` and a click handler, and
 *   must not accept `variant` — spreading the props wholesale writes
 *   `variant="outline"` into the markup.
 *
 * A handler prop goes through `fromProps` first. Inside a component every prop
 * is a Cell, handlers included, so `props.onClick` is `() => handler`; put on
 * the element unwrapped it binds a listener that returns the handler and calls
 * nothing. It looks like it works until you press the thing.
 */

import {
  filterDOMProps,
  fromProps,
  mergeProps,
  styleProps,
  type DOMProps,
} from "@barqjs/aria/utils";
import type { Incoming } from "@barqjs/core";

import type { UiProps } from "./props.ts";

/**
 * What a presentational element accepts beyond the global attributes and events
 * `filterDOMProps` already allows.
 */
const EXTRA = new Set(["role", "title", "tabIndex", "slot", "itemProp", "itemScope", "itemType"]);

/**
 * What a form control accepts on top of that.
 *
 * `filterDOMProps` allows the GLOBAL events and none of the rest, which is
 * right for a `<div>` and wrong for an `<input>`: without these, `placeholder`
 * and `onInput` are silently dropped and the control looks inert.
 */
const CONTROL = new Set([
  ...EXTRA,
  "name",
  "value",
  "defaultValue",
  "placeholder",
  "disabled",
  "readOnly",
  "required",
  "checked",
  "autoComplete",
  "autoFocus",
  "autoCapitalize",
  "autoCorrect",
  "maxLength",
  "minLength",
  "min",
  "max",
  "step",
  "pattern",
  "type",
  "inputMode",
  "enterKeyHint",
  "spellCheck",
  "form",
  "multiple",
  "accept",
  "rows",
  "cols",
  "wrap",
  "size",
  "list",
  "aria-invalid",
  "aria-required",
  "aria-errormessage",
  "aria-activedescendant",
  "aria-autocomplete",
  "aria-controls",
  "aria-expanded",
  "onInput",
  "onChange",
  "onFocus",
  "onBlur",
  "onKeyDown",
  "onKeyUp",
  "onKeyPress",
  "onCopy",
  "onCut",
  "onPaste",
  "onCompositionStart",
  "onCompositionEnd",
  "onSelect",
]);

function build(
  slot: string,
  className: string | (() => string),
  props: Incoming<UiProps>,
  propNames: ReadonlySet<string>,
): DOMProps {
  return mergeProps(
    { class: typeof className === "function" ? className : () => className },
    // First, so a caller renaming the slot wins. Last, the caller's own
    // `data-slot` reached the merge and was overwritten by this one, and a
    // wrapper like `AlertDialogAction` rendered as `data-slot="button"`.
    { "data-slot": slot },
    filterDOMProps(fromProps(props), { global: true, labelable: true, propNames }),
    styleProps(props),
  );
}

export function uiProps(
  slot: string,
  className: string | (() => string),
  props: Incoming<UiProps>,
): DOMProps {
  return build(slot, className, props, EXTRA);
}

/** {@link uiProps} for an `<input>`, `<textarea>` or `<select>`. */
export function controlProps(
  slot: string,
  className: string | (() => string),
  props: Incoming<UiProps>,
): DOMProps {
  return build(slot, className, props, CONTROL);
}
