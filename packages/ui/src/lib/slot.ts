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
import { mergeRefs, type RefTarget } from "@barqjs/primitives/refs";

import { ui } from "./atoms.ts";

import type { UiProps } from "./props.ts";

/**
 * What a presentational element accepts beyond the global attributes and events
 * `filterDOMProps` already allows.
 */
const EXTRA = new Set([
  "role",
  "title",
  "tabIndex",
  "slot",
  "itemProp",
  "itemScope",
  "itemType",
  // The ARIA a presentational element legitimately carries. `filterDOMProps`
  // allows the LABELLING set and nothing else, which is right for a `<div>` and
  // wrong for one that is also a control: a sidebar menu button driving a
  // disclosure had its `aria-expanded` dropped in silence, so the row announced
  // nothing about the submenu it opens.
  "aria-expanded",
  "aria-controls",
  "aria-current",
  "aria-pressed",
  "aria-selected",
  "aria-haspopup",
  "aria-disabled",
  "aria-live",
  "aria-busy",
]);

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

/**
 * A component's props as `uiProps` reads them.
 *
 * The `ref` is whatever the component declares for its own element: the
 * callback every part takes, or the `RefTarget` of a component that renders
 * one known element. Both are handed to that element and neither is read.
 * `children` is the component's to place, in whatever shape it takes them.
 */
type Given = Incoming<Omit<UiProps, "ref" | "children">> & { ref?: () => unknown };

function build(
  slot: string,
  className: string | (() => string),
  props: Given,
  propNames: ReadonlySet<string>,
): DOMProps {
  const own = typeof className === "function" ? className : () => className;
  // `class` is composed here rather than left to `mergeProps`, which
  // CONCATENATES. A caller is often another component in this package handing
  // its own atoms down — `<FieldLabel>` to `<Label>` — and two atoms for one
  // property both apply, so the stylesheet's order decides which wins instead
  // of the order they were passed. `ui` merges by property; a class that is
  // not an atom passes through and still wins, because it is unlayered.
  const { class: _, ...presentation } = styleProps(props);
  // Only when one was given, so an element with a `ref` of its own written
  // after the spread is not handed a second, empty one to merge with.
  const forwarded: DOMProps =
    props.ref === undefined ? {} : { ref: mergeRefs(props.ref() as RefTarget<Element>) };

  return mergeProps(
    { class: () => ui(own(), props.class?.(), props.className?.()) },
    // First, so a caller renaming the slot wins. Last, the caller's own
    // `data-slot` reached the merge and was overwritten by this one, and a
    // wrapper like `AlertDialogAction` rendered as `data-slot="button"`.
    { "data-slot": slot },
    filterDOMProps(fromProps(props), { global: true, labelable: true, propNames }),
    presentation,
    forwarded,
  );
}

export function uiProps(slot: string, className: string | (() => string), props: Given): DOMProps {
  return build(slot, className, props, EXTRA);
}

/**
 * What a part hands on when ANOTHER component builds its element.
 *
 * `uiProps` is for an element the part writes itself. A part drawn by a
 * component from `@barqjs/aria` (a sheet by `<Modal>`) passes its class and its
 * slot by name, and whatever else the caller wrote has to be passed as well or
 * it is dropped without a word: `style`, `id`, the `ref` and every `data-*`.
 *
 * The values are the Cells they arrived as, so spreading the result onto a
 * component is the same as having written each prop. `data-slot` is left out,
 * because the part names its own.
 */
export function handedOn(props: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const source = props as Record<string, unknown>;
  for (const key in source) {
    if (!Object.hasOwn(source, key)) continue;
    const kept =
      key === "style" ||
      key === "id" ||
      key === "ref" ||
      (key.startsWith("data-") && key !== "data-slot");
    if (kept) out[key] = source[key];
  }
  return out;
}

const NAMING = ["aria-label", "aria-labelledby", "aria-describedby"] as const;

/**
 * The caller's name and description, for the element that has the ROLE.
 *
 * Where a part's box and its role are two elements (a dialog's panel and the
 * `role="dialog"` inside it), `aria-*` belongs on the second: a description on
 * the panel describes a `<div>`.
 */
export function named(props: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const source = props as Record<string, unknown>;
  for (const key of NAMING) {
    if (Object.hasOwn(source, key)) out[key] = source[key];
  }
  return out;
}

/**
 * The props minus the ones the component reads itself.
 *
 * A design-system prop whose name is ALSO a real attribute cannot be filtered
 * by the allow-list: `size` on `<NativeSelect>` means `"sm"` and `size` on a
 * `<select>` means how many rows to show, so `CONTROL` lets it through and the
 * control rendered as a listbox. shadcn hits the same collision and writes
 * `Omit<ComponentProps<"select">, "size">`; this is that, at runtime.
 */
export function omit<T extends object>(props: T, names: readonly string[]): T {
  const out = { ...props } as Record<string, unknown>;
  for (const name of names) delete out[name];
  return out as T;
}

/** {@link uiProps} for an `<input>`, `<textarea>` or `<select>`. */
export function controlProps(
  slot: string,
  className: string | (() => string),
  props: Given,
): DOMProps {
  return build(slot, className, props, CONTROL);
}

// Defined in aria, whose questionnaire parts draw their own elements and take a `render` too.
export { partRender, type PartRender, type RenderPart } from "@barqjs/aria/utils";
