/**
 * Labels, descriptions and error messages, wired to the field they belong to.
 *
 * A visible label must be associated with its control, or a screen reader
 * announces "edit text, blank" and the user has to guess. `<label for>` does
 * that for a native input and nothing else: a listbox, a slider or a group of
 * checkboxes is not a labelable element, and needs `aria-labelledby` instead.
 *
 * The description and the error message go in `aria-describedby` rather than
 * `aria-errormessage`, which VoiceOver and NVDA still do not announce.
 */

import { type Accessor } from "@barqjs/core";
import { access, id, mergeProps, type DOMProps, type MaybeAccessor } from "./utils.ts";

export interface LabelOptions {
  id?: MaybeAccessor<string | undefined>;
  /** Whether there is a visible label element at all. */
  label?: MaybeAccessor<unknown>;
  "aria-label"?: MaybeAccessor<string | undefined>;
  "aria-labelledby"?: MaybeAccessor<string | undefined>;
  /**
   * What renders the label. `span` when the field is not a labelable element,
   * because `<label for>` on a `<div role="listbox">` does nothing.
   *
   * @default "label"
   */
  labelElementType?: MaybeAccessor<string | undefined>;
}

export interface LabelResult {
  labelProps: DOMProps;
  fieldProps: DOMProps;
}

/**
 * ```tsx
 * const { labelProps, fieldProps } = label({ label: () => props.label?.() });
 * <label {...labelProps}>{props.label}</label>
 * <input {...fieldProps} />
 * ```
 */
export function label(options: LabelOptions): LabelResult {
  const fieldId = id(options.id);
  const labelId = id();

  const hasLabel = (): boolean => {
    const value = access(options.label);
    return value !== undefined && value !== null && value !== false && value !== "";
  };

  const labelledBy = (): string | undefined => {
    const given = access(options["aria-labelledby"]);
    if (!hasLabel()) return given;
    // Both: the visible label first, then whatever else was named, which is
    // the order a screen reader reads them in.
    return given === undefined ? labelId() : `${labelId()} ${given}`;
  };

  return {
    labelProps: {
      id: () => (hasLabel() ? labelId() : undefined),
      // `for` only when the field can actually be labelled by one.
      for: () =>
        hasLabel() && (access(options.labelElementType) ?? "label") === "label"
          ? fieldId()
          : undefined,
    },
    fieldProps: {
      id: fieldId,
      "aria-label": () => access(options["aria-label"]),
      "aria-labelledby": labelledBy,
    },
  };
}

export interface FieldOptions extends LabelOptions {
  /** Help text shown under the field. */
  description?: MaybeAccessor<unknown>;
  /** What is wrong, shown when the field is invalid. */
  errorMessage?: MaybeAccessor<unknown>;
  isInvalid?: MaybeAccessor<boolean | undefined>;
  "aria-describedby"?: MaybeAccessor<string | undefined>;
}

export interface FieldResult extends LabelResult {
  descriptionProps: DOMProps;
  errorMessageProps: DOMProps;
}

/**
 * A field, its label, and the help text or error under it.
 *
 * `aria-describedby` names only the elements that are actually rendered: an id
 * pointing at nothing is announced as nothing, and hides the description that
 * would have been read instead.
 */
export function field(options: FieldOptions): FieldResult {
  const { labelProps, fieldProps } = label(options);
  const descriptionId = id();
  const errorMessageId = id();

  const present = (value: MaybeAccessor<unknown>): boolean => {
    const resolved = access(value);
    return resolved !== undefined && resolved !== null && resolved !== false && resolved !== "";
  };

  const describedBy = (): string | undefined => {
    const parts = [
      present(options.description) ? descriptionId() : undefined,
      present(options.errorMessage) && access(options.isInvalid) === true
        ? errorMessageId()
        : undefined,
      access(options["aria-describedby"]),
    ].filter((part): part is string => part !== undefined);
    return parts.length === 0 ? undefined : parts.join(" ");
  };

  return {
    labelProps,
    fieldProps: mergeProps(fieldProps, { "aria-describedby": describedBy }),
    descriptionProps: { id: descriptionId },
    errorMessageProps: { id: errorMessageId },
  };
}

/** The id an element was given, for a component that needs to reference it. */
export type FieldId = Accessor<string>;
