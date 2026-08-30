/**
 * Text fields.
 *
 * The input itself is the platform's, and almost all of the accessibility with
 * it. What is added is the wiring a field needs and the platform has no way to
 * express: the label, the description and the error message all announced with
 * the control, the value controllable without the caret jumping, and a search
 * field's Escape-to-clear.
 *
 * `aria-describedby` rather than `aria-errormessage` for the error, because
 * VoiceOver and NVDA still do not announce the latter.
 */

import { type Accessor, type Child, type Incoming } from "@barqjs/core";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import { focusRing } from "./focus.ts";
import { focusable, type FocusableOptions } from "./interactions/focusable.ts";
import { hover } from "./interactions/hover.ts";
import { type ElementRef } from "./interactions/press.ts";
import { field, type FieldOptions } from "./label.ts";
import { formReset } from "./toggle.ts";
import {
  fieldValidation,
  formValidation,
  type FormValidationState,
  type ValidateFunction,
  type ValidationBehavior,
} from "./validation.ts";
import { button } from "./button.tsx";
import {
  access,
  callback,
  chain,
  controllable,
  filterDOMProps,
  fromProps,
  mergeProps,
  styleProps,
  type DOMProps,
  type MaybeAccessor,
  type StyleProps,
} from "./utils.ts";

export type TextFieldType = "text" | "search" | "url" | "tel" | "email" | "password";

export interface TextFieldOptions extends FieldOptions, FocusableOptions {
  value?: MaybeAccessor<string | undefined>;
  /** What the page thinks of the value, checked as it changes. */
  validate?: ValidateFunction<string>;
  /** @default "aria" */
  validationBehavior?: MaybeAccessor<ValidationBehavior | undefined>;
  defaultValue?: MaybeAccessor<string | undefined>;
  /** @default "text" */
  type?: MaybeAccessor<TextFieldType | undefined>;
  /** Render a `<textarea>` rather than an `<input>`. */
  isMultiLine?: MaybeAccessor<boolean | undefined>;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  isReadOnly?: MaybeAccessor<boolean | undefined>;
  isRequired?: MaybeAccessor<boolean | undefined>;
  placeholder?: MaybeAccessor<string | undefined>;
  name?: MaybeAccessor<string | undefined>;
  form?: MaybeAccessor<string | undefined>;
  autoComplete?: MaybeAccessor<string | undefined>;
  maxLength?: MaybeAccessor<number | undefined>;
  minLength?: MaybeAccessor<number | undefined>;
  pattern?: MaybeAccessor<string | undefined>;
  inputMode?: MaybeAccessor<string | undefined>;
  onChange?: (value: string) => void;
  onKeyDown?: (event: KeyboardEvent) => void;
  onKeyUp?: (event: KeyboardEvent) => void;
}

export interface TextFieldResult {
  labelProps: DOMProps;
  inputProps: DOMProps;
  descriptionProps: DOMProps;
  errorMessageProps: DOMProps;
  value: Accessor<string>;
  setValue(value: string): void;
  /** What is wrong with the value, and whether the user is being told. */
  validation: FormValidationState;
  /** The messages to show, which may be the browser's own. */
  errors: Accessor<string[]>;
  isInvalid: Accessor<boolean>;
}

export function textField(
  options: TextFieldOptions,
  ref: ElementRef<HTMLInputElement | HTMLTextAreaElement>,
): TextFieldResult {
  const [value, setValue] = controllable<string>(
    () => access(options.value),
    () => access(options.defaultValue) ?? "",
    options.onChange,
  );

  // What the BROWSER makes of it is NOT read back into the state's own view of
  // the value: the page's errors are written onto the element with
  // `setCustomValidity`, so reading the element's validity as an input would
  // be reading back what was just written and calling it a new finding.
  // `formValidation` reads it only once the page has nothing to say.
  const {
    state: validation,
    behavior,
    isInvalid,
    errors,
    errorMessage,
  } = fieldValidation<string>({
    value,
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

  const { labelProps, fieldProps, descriptionProps, errorMessageProps } = field({
    ...options,
    isInvalid,
    errorMessage,
  });
  const { focusableProps } = focusable(options, ref);

  formReset(ref as ElementRef<HTMLInputElement>, access(options.defaultValue) ?? "", setValue);

  const isDisabled = (): boolean => access(options.isDisabled) === true;
  const isReadOnly = (): boolean => access(options.isReadOnly) === true;
  const isRequired = (): boolean => access(options.isRequired) === true;

  const onInput = (event: Event): void => {
    const input = event.target as HTMLInputElement;
    setValue(input.value);
    // The field has already changed itself. When the component is controlled
    // and its owner declined, or it is read-only, nothing re-renders on a
    // value that did not move, so the DOM has to be put back by hand.
    if (input.value !== value()) input.value = value();
  };

  return {
    value,
    setValue,
    validation,
    errors,
    isInvalid,
    labelProps,
    descriptionProps,
    errorMessageProps,
    inputProps: mergeProps(
      filterDOMProps(options, { labelable: true }),
      fieldProps,
      focusableProps,
      {
        type: () =>
          access(options.isMultiLine) === true ? undefined : (access(options.type) ?? "text"),
        value,
        disabled: isDisabled,
        readOnly: isReadOnly,
        required: isRequired,
        placeholder: () => access(options.placeholder),
        name: () => access(options.name),
        form: () => access(options.form),
        autocomplete: () => access(options.autoComplete),
        maxlength: () => access(options.maxLength),
        minlength: () => access(options.minLength),
        pattern: () => access(options.pattern),
        inputmode: () => access(options.inputMode),
        "aria-invalid": () => isInvalid() || undefined,
        "aria-required": () => isRequired() || undefined,
        "aria-readonly": () => isReadOnly() || undefined,
        onInput,
        onKeyDown: options.onKeyDown,
        onKeyUp: options.onKeyUp,
        onBlur: () => validation.commitValidation(),
      },
    ),
  };
}

// ---------------------------------------------------------------------------
// Search field
// ---------------------------------------------------------------------------

export interface SearchFieldOptions extends TextFieldOptions {
  /** Fired on Enter, and on the clear button. */
  onSubmit?: (value: string) => void;
  onClear?: () => void;
}

export interface SearchFieldResult extends TextFieldResult {
  clearButtonProps: DOMProps;
}

/**
 * A search field: `type="search"`, Enter submits, Escape clears.
 *
 * The clear button is `tabIndex={-1}` and hidden from assistive technology,
 * which sounds wrong and is not: Escape already clears the field from the
 * keyboard, so a Tab stop that does the same thing is an extra stop between
 * the field and whatever follows it, for no new capability.
 */
export function searchField(
  options: SearchFieldOptions,
  ref: ElementRef<HTMLInputElement>,
): SearchFieldResult {
  const result = textField({ ...options, type: () => access(options.type) ?? "search" }, ref);

  const clear = (): void => {
    if (access(options.isReadOnly) === true || access(options.isDisabled) === true) return;
    result.setValue("");
    const input = access(ref) as HTMLInputElement | null;
    if (input !== null) input.value = "";
    options.onClear?.();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Enter") {
      event.preventDefault();
      options.onSubmit?.(result.value());
      return;
    }
    if (event.key === "Escape") {
      if (result.value() === "" && options.onClear === undefined) return;
      event.preventDefault();
      clear();
    }
  };

  const { buttonProps } = button({
    isDisabled: () => access(options.isDisabled) === true || access(options.isReadOnly) === true,
    // Pressing it must not take focus off the field the user is typing in.
    preventFocusOnPress: true,
    excludeFromTabOrder: true,
    onPress: clear,
  });

  return {
    ...result,
    inputProps: mergeProps(result.inputProps, {
      onKeyDown: chain(onKeyDown, options.onKeyDown),
    }),
    clearButtonProps: mergeProps(buttonProps, { "aria-hidden": true, tabIndex: -1 }),
  };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export interface TextFieldComponentProps extends StyleProps {
  label?: Child;
  description?: Child;
  errorMessage?: Child;
  value?: string;
  defaultValue?: string;
  type?: TextFieldType;
  isMultiLine?: boolean;
  isDisabled?: boolean;
  isReadOnly?: boolean;
  isRequired?: boolean;
  isInvalid?: boolean;
  /** What the page thinks of the value. Return a message, or nothing. */
  validate?: ValidateFunction<string>;
  /** @default "aria" */
  validationBehavior?: ValidationBehavior;
  placeholder?: string;
  name?: string;
  form?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  maxLength?: number;
  minLength?: number;
  pattern?: string;
  inputMode?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  ref?: RefTarget<HTMLInputElement>;
  onChange?: (value: string) => void;
  onFocus?: (event: FocusEvent) => void;
  onBlur?: (event: FocusEvent) => void;
  onKeyDown?: (event: KeyboardEvent) => void;
}

/**
 * ```tsx
 * <TextField label="Name" onChange={(v) => name.set(v)} />
 * ```
 */
export function TextField(props: Incoming<TextFieldComponentProps>) {
  const inputRef = makeRef<HTMLInputElement>();
  const options = fromProps(props);

  const { labelProps, inputProps, descriptionProps, errorMessageProps, errors, isInvalid } =
    textField(
      {
        ...(options as TextFieldOptions),
        validate: callback(props.validate),
        validationBehavior: () => props.validationBehavior?.(),
      },
      inputRef,
    );
  const { hoverProps, isHovered } = hover({ isDisabled: options.isDisabled });
  const { focusProps, isFocused, isFocusVisible } = focusRing({ isTextInput: true });

  const controlProps = mergeProps(inputProps, hoverProps, focusProps, {
    "data-hovered": isHovered,
    "data-focused": isFocused,
    "data-focus-visible": isFocusVisible,
    "data-disabled": () => props.isDisabled?.() === true,
    "data-invalid": isInvalid,
  });

  return (
    <div
      {...mergeProps(styleProps(props), {
        "data-testid": () => props["data-testid"]?.(),
      })}
    >
      <label {...labelProps}>{props.label}</label>
      {() =>
        props.isMultiLine?.() === true ? (
          <textarea
            {...controlProps}
            ref={
              mergeRefs(inputRef.set, props.ref?.()) as unknown as (el: HTMLTextAreaElement) => void
            }
          />
        ) : (
          <input {...controlProps} ref={mergeRefs(inputRef.set, props.ref?.())} />
        )
      }
      <span {...descriptionProps}>{props.description}</span>
      {/* The caller's message when it gave one, and otherwise whatever found
          the problem — which may be the browser, in its own language. */}
      <span {...errorMessageProps}>
        {() => {
          if (!isInvalid()) return null;
          const given = props.errorMessage?.();
          if (given !== undefined && given !== null) return given;
          return errors().join(" ");
        }}
      </span>
    </div>
  );
}

export interface SearchFieldComponentProps extends TextFieldComponentProps {
  onSubmit?: (value: string) => void;
  onClear?: () => void;
  /** What the clear button says. @default "Clear search" */
  clearLabel?: string;
}

/**
 * ```tsx
 * <SearchField label="Search" onSubmit={(q) => search(q)} />
 * ```
 */
export function SearchField(props: Incoming<SearchFieldComponentProps>) {
  const inputRef = makeRef<HTMLInputElement>();
  const options = fromProps(props);

  const {
    labelProps,
    inputProps,
    descriptionProps,
    errorMessageProps,
    clearButtonProps,
    value,
    errors,
    isInvalid,
  } = searchField(options as SearchFieldOptions, inputRef);
  const { hoverProps, isHovered } = hover({ isDisabled: options.isDisabled });
  const { focusProps, isFocused, isFocusVisible } = focusRing({ isTextInput: true });

  const controlProps = mergeProps(inputProps, hoverProps, focusProps, {
    "data-hovered": isHovered,
    "data-focused": isFocused,
    "data-focus-visible": isFocusVisible,
    "data-disabled": () => props.isDisabled?.() === true,
  });

  return (
    <div
      {...mergeProps(styleProps(props), {
        "data-testid": () => props["data-testid"]?.(),
        "data-empty": () => value() === "",
      })}
    >
      <label {...labelProps}>{props.label}</label>
      <input {...controlProps} ref={mergeRefs(inputRef.set, props.ref?.())} />
      <button type="button" {...clearButtonProps}>
        {() => props.clearLabel?.() ?? "Clear search"}
      </button>
      <span {...descriptionProps}>{props.description}</span>
      {/* The caller's message when it gave one, and otherwise whatever found
          the problem — which may be the browser, in its own language. */}
      <span {...errorMessageProps}>
        {() => {
          if (!isInvalid()) return null;
          const given = props.errorMessage?.();
          if (given !== undefined && given !== null) return given;
          return errors().join(" ");
        }}
      </span>
    </div>
  );
}
