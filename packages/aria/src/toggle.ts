/**
 * The shared half of a checkbox and a switch.
 *
 * Both are a real `<input type="checkbox">`, hidden but focusable, inside a
 * `<label>` that carries the visual. That is not a stylistic choice: the input
 * is what puts the control in a form's data, what the platform's own keyboard
 * handling activates, what a screen reader announces as a checkbox, and what
 * autofill and password managers can see. A `<div role="checkbox">` has none
 * of it and must reimplement all of it, imperfectly.
 *
 * The press handling is on the LABEL, so the visual is pressed while the
 * pointer is down anywhere on it, and the input's own keyboard activation is
 * left alone.
 */

import { type Accessor, effect, signal } from "@barqjs/core";
import { ownerDocument } from "./dom.ts";
import { focusable, type FocusableOptions } from "./interactions/focusable.ts";
import { press, type ElementRef, type PressEvent } from "./interactions/press.ts";
import type { ToggleState } from "./button.tsx";
import {
  fieldValidation,
  formValidation,
  type FormValidationState,
  type ValidateFunction,
  type ValidationBehavior,
} from "./validation.ts";
import { access, filterDOMProps, mergeProps, type DOMProps, type MaybeAccessor } from "./utils.ts";

export { toggleState } from "./button.tsx";
export type { ToggleState, ToggleStateOptions } from "./button.tsx";

/**
 * Return the control to its default when the form is reset.
 *
 * A reset fires no `change` or `input`, so a controlled component that does
 * not listen for it shows a value the form no longer has.
 */
export function formReset<T>(
  ref: ElementRef<HTMLInputElement>,
  initial: MaybeAccessor<T>,
  onReset: (value: T) => void,
): void {
  effect(() => {
    const element = access(ref) as HTMLInputElement | null;
    const form = element?.form;
    if (form === null || form === undefined) return undefined;

    const handle = (): void => onReset(access(initial) as T);
    form.addEventListener("reset", handle);
    return () => form.removeEventListener("reset", handle);
  });
}

export interface ToggleOptions extends FocusableOptions {
  isDisabled?: MaybeAccessor<boolean | undefined>;
  isReadOnly?: MaybeAccessor<boolean | undefined>;
  isRequired?: MaybeAccessor<boolean | undefined>;
  isInvalid?: MaybeAccessor<boolean | undefined>;
  /** What the page thinks of the value, checked as it changes. */
  validate?: ValidateFunction<boolean>;
  /** @default "aria" */
  validationBehavior?: MaybeAccessor<ValidationBehavior | undefined>;
  /** The caller's own message, which wins over anything validation found. */
  errorMessage?: MaybeAccessor<unknown>;
  /** The form value when selected. */
  value?: MaybeAccessor<string | undefined>;
  name?: MaybeAccessor<string | undefined>;
  form?: MaybeAccessor<string | undefined>;
  /** Whether there is a visible label. Without one, `aria-label` is required. */
  children?: MaybeAccessor<unknown>;
  "aria-label"?: MaybeAccessor<string | undefined>;
  "aria-labelledby"?: MaybeAccessor<string | undefined>;
  "aria-describedby"?: MaybeAccessor<string | undefined>;
  "aria-controls"?: MaybeAccessor<string | undefined>;
  "aria-errormessage"?: MaybeAccessor<string | undefined>;
  onPress?: (event: PressEvent) => void;
  onPressStart?: (event: PressEvent) => void;
  onPressEnd?: (event: PressEvent) => void;
  onPressChange?: (isPressed: boolean) => void;
  onFocus?: (event: FocusEvent) => void;
  onBlur?: (event: FocusEvent) => void;
  onFocusChange?: (isFocused: boolean) => void;
}

export interface ToggleResult {
  labelProps: DOMProps;
  inputProps: DOMProps;
  isSelected: Accessor<boolean>;
  isPressed: Accessor<boolean>;
  isDisabled: Accessor<boolean>;
  isReadOnly: Accessor<boolean>;
  /** What is wrong with the value, and whether the user is being told. */
  validation: FormValidationState;
  /** The messages to show, which may be the browser's own. */
  errors: Accessor<string[]>;
  isInvalid: Accessor<boolean>;
  /** For an error element, so `aria-describedby` can point at it. */
  errorMessage: Accessor<unknown>;
}

export function toggle(
  options: ToggleOptions,
  state: ToggleState,
  ref: ElementRef<HTMLInputElement>,
): ToggleResult {
  const isDisabled = (): boolean => access(options.isDisabled) === true;
  const isReadOnly = (): boolean => access(options.isReadOnly) === true;

  // The validation state lives here rather than in `toggleState`: a toggle's
  // VALUE is a boolean either way, and a `<ToggleButton>` built on the same
  // state is not a form field.
  const {
    state: validation,
    behavior,
    isInvalid,
    errors,
    errorMessage,
  } = fieldValidation<boolean>({
    value: state.isSelected,
    validate: options.validate,
    validationBehavior: options.validationBehavior,
    isInvalid: options.isInvalid,
    errorMessage: options.errorMessage,
    name: options.name,
  });

  formValidation(
    {
      validationBehavior: behavior,
      focus: () => (access(ref) as HTMLInputElement | null)?.focus(),
    },
    validation,
    ref,
  );

  // For a keyboard activation, and for a caller that puts the input somewhere
  // the label does not cover.
  const { pressProps, isPressed } = press({
    onPress: options.onPress,
    onPressStart: options.onPressStart,
    onPressEnd: options.onPressEnd,
    onPressChange: options.onPressChange,
    isDisabled,
  });

  const labelPressed = signal(false);

  // On the label, for the pressed STATE only.
  //
  // The toggle itself is left to the platform: a press on a `<label>` runs the
  // label's activation behaviour, which checks the input, fires `change`, and
  // moves focus to it. Doing it here instead — press, `preventDefault`, toggle
  // by hand — means reimplementing three platform behaviours to arrive at the
  // same place, and getting one of them wrong on any engine that runs the
  // activation at a moment the cancellation cannot reach.
  //
  // A keyboard or virtual press belongs to the INPUT, which the platform also
  // activates, so those are let through untouched.
  const { pressProps: labelPressProps } = press({
    isDisabled: () => isDisabled() || isReadOnly(),
    onPressStart(event) {
      if (event.pointerType === "keyboard" || event.pointerType === "virtual") {
        event.continuePropagation();
        return;
      }
      options.onPressStart?.(event);
      options.onPressChange?.(true);
      labelPressed.set(true);
    },
    onPressEnd(event) {
      if (event.pointerType === "keyboard" || event.pointerType === "virtual") {
        event.continuePropagation();
        return;
      }
      options.onPressEnd?.(event);
      options.onPressChange?.(false);
      labelPressed.set(false);
    },
    onPress(event) {
      if (event.pointerType === "keyboard" || event.pointerType === "virtual") {
        event.continuePropagation();
        return;
      }
      options.onPress?.(event);
    },
  });

  const { focusableProps } = focusable(options, ref);

  formReset(ref, state.isSelected(), (value) => state.setSelected(value));

  const onChange = (event: Event): void => {
    // The label carries the press props, so a change would be seen twice.
    event.stopPropagation();
    const input = event.target as HTMLInputElement;
    state.setSelected(input.checked);

    // The input has ALREADY changed itself; the state may not have followed,
    // because the component is controlled and its owner declined, or because
    // it is read-only. Nothing re-renders on a value that did not change, so
    // without this the checkbox shows a state the component does not hold.
    input.checked = state.isSelected();
    validation.commitValidation();
  };

  return {
    // The label's own click is what toggles the input, so it is left alone.
    // `mousedown` is not: without this the label takes focus, and the ring
    // appears around the text rather than the control.
    labelProps: mergeProps(labelPressProps, {
      onMouseDown: (event: MouseEvent) => event.preventDefault(),
    }),

    inputProps: mergeProps(
      filterDOMProps(options, { labelable: true }),
      pressProps,
      focusableProps,
      {
        type: "checkbox",
        checked: () => state.isSelected(),
        disabled: isDisabled,
        required: () => access(options.isRequired) === true,
        name: () => access(options.name),
        form: () => access(options.form),
        value: () => access(options.value),
        "aria-required": () => access(options.isRequired) === true || undefined,
        "aria-invalid": () => isInvalid() || undefined,
        "aria-errormessage": () => access(options["aria-errormessage"]),
        "aria-controls": () => access(options["aria-controls"]),
        "aria-readonly": () => isReadOnly() || undefined,
        onChange,
      },
    ),

    isSelected: state.isSelected,
    isPressed: () => isPressed() || labelPressed(),
    isDisabled,
    isReadOnly,
    validation,
    errors,
    isInvalid,
    errorMessage,
  };
}

/** The style that hides the input without hiding it from assistive technology. */
export const HIDDEN_INPUT_STYLE = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: "0",
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
  border: "0",
} as const;

/** The document a ref's element belongs to, for a component that needs it. */
export function documentOf(ref: ElementRef): Document {
  return ownerDocument(access(ref));
}
