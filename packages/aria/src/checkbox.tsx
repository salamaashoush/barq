/**
 * Checkboxes, on their own and in a group.
 *
 * The indeterminate state is the interesting part: it is a PROPERTY, settable
 * only from script, and it is presentational — the box shows a dash, but the
 * checkbox is still either checked or not, and pressing it commits whichever
 * the value already was. A group's "select all" is the usual reason for one.
 */

import { type Accessor, type Child, effect, type Incoming } from "@barqjs/core";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import { focusRing } from "./focus.ts";
import { hover } from "./interactions/hover.ts";
import type { PressEvent } from "./interactions/press.ts";
import type { ElementRef } from "./interactions/press.ts";
import { field, type FieldOptions } from "./label.ts";
import {
  toggle,
  toggleState,
  HIDDEN_INPUT_STYLE,
  type ToggleOptions,
  type ToggleResult,
} from "./toggle.ts";
import type { ToggleState } from "./button.tsx";
import {
  fieldValidation,
  type FormValidationState,
  type ValidateFunction,
  type ValidationBehavior,
} from "./validation.ts";
import {
  access,
  callback,
  controllable,
  type DOMProps,
  filterDOMProps,
  fromProps,
  type MaybeAccessor,
  mergeProps,
  type StyleProps,
  styleProps,
} from "./utils.ts";

export interface CheckboxOptions extends ToggleOptions {
  /**
   * Show the mixed state.
   *
   * Presentational: the value is still checked or unchecked underneath, and
   * pressing the checkbox commits that value rather than a third one.
   */
  isIndeterminate?: MaybeAccessor<boolean | undefined>;
}

export type CheckboxResult = ToggleResult;

export function checkbox(
  options: CheckboxOptions,
  state: ToggleState,
  ref: ElementRef<HTMLInputElement>,
): CheckboxResult {
  const result = toggle(options, state, ref);

  // `indeterminate` has no attribute; it exists only as a property.
  effect(() => {
    const input = access(ref) as HTMLInputElement | null;
    if (input === null) return;
    input.indeterminate = access(options.isIndeterminate) === true;
  });

  return {
    ...result,
    inputProps: mergeProps(result.inputProps, {
      // The box shows a dash, and a screen reader must say "mixed".
      "aria-checked": () => (access(options.isIndeterminate) === true ? "mixed" : undefined),
    }),
  };
}

// ---------------------------------------------------------------------------
// Group
// ---------------------------------------------------------------------------

export interface CheckboxGroupStateOptions {
  value?: MaybeAccessor<string[] | undefined>;
  defaultValue?: MaybeAccessor<string[] | undefined>;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  isReadOnly?: MaybeAccessor<boolean | undefined>;
  isRequired?: MaybeAccessor<boolean | undefined>;
  isInvalid?: MaybeAccessor<boolean | undefined>;
  /** What the page thinks of the whole selection, checked as it changes. */
  validate?: ValidateFunction<string[]>;
  /** @default "aria" */
  validationBehavior?: MaybeAccessor<ValidationBehavior | undefined>;
  /** The caller's own message, which wins over anything validation found. */
  errorMessage?: MaybeAccessor<unknown>;
  /** The form field name, for matching a server error to this group. */
  name?: MaybeAccessor<string | undefined>;
  onChange?: (value: string[]) => void;
}

export interface CheckboxGroupState {
  value: Accessor<string[]>;
  setValue(value: string[]): void;
  isSelected(value: string): boolean;
  addValue(value: string): void;
  removeValue(value: string): void;
  toggleValue(value: string): void;
  isDisabled: Accessor<boolean>;
  isReadOnly: Accessor<boolean>;
  isRequired: Accessor<boolean>;
  isInvalid: Accessor<boolean>;
  /**
   * The validation lives on the STATE rather than on `checkboxGroup`, because
   * a member checkbox reads it too: a group that is invalid marks every box in
   * it, and the box has no way back to the hook.
   */
  validation: FormValidationState;
  errors: Accessor<string[]>;
  /** For `field`, so `aria-describedby` points at whatever is being shown. */
  errorMessage: Accessor<unknown>;
}

export function checkboxGroupState(options: CheckboxGroupStateOptions): CheckboxGroupState {
  const [value, setValue] = controllable<string[]>(
    () => access(options.value),
    () => access(options.defaultValue) ?? [],
    options.onChange,
  );

  const isReadOnly = (): boolean => access(options.isReadOnly) === true;
  const isDisabled = (): boolean => access(options.isDisabled) === true;

  const add = (next: string): void => {
    if (isReadOnly() || isDisabled()) return;
    if (value().includes(next)) return;
    commit([...value(), next]);
  };

  const remove = (next: string): void => {
    if (isReadOnly() || isDisabled()) return;
    if (!value().includes(next)) return;
    commit(value().filter((entry) => entry !== next));
  };

  const {
    state: validation,
    isInvalid,
    errors,
    errorMessage,
  } = fieldValidation<string[]>({
    value,
    validate: options.validate,
    validationBehavior: options.validationBehavior,
    isInvalid: options.isInvalid,
    errorMessage: options.errorMessage,
    name: options.name,
  });

  const commit = (next: string[]): void => {
    setValue(next);
    validation.commitValidation();
  };

  return {
    value,
    setValue: (next) => {
      if (isReadOnly() || isDisabled()) return;
      commit(next);
    },
    isSelected: (entry) => value().includes(entry),
    addValue: add,
    removeValue: remove,
    toggleValue: (entry) => (value().includes(entry) ? remove(entry) : add(entry)),
    isDisabled,
    isReadOnly,
    isRequired: () => access(options.isRequired) === true,
    isInvalid,
    validation,
    errors,
    errorMessage,
  };
}

export interface CheckboxGroupOptions extends FieldOptions {
  isDisabled?: MaybeAccessor<boolean | undefined>;
  isRequired?: MaybeAccessor<boolean | undefined>;
  isReadOnly?: MaybeAccessor<boolean | undefined>;
  name?: MaybeAccessor<string | undefined>;
}

export interface CheckboxGroupResult {
  groupProps: DOMProps;
  labelProps: DOMProps;
  descriptionProps: DOMProps;
  errorMessageProps: DOMProps;
}

/**
 * A set of related checkboxes.
 *
 * `role="group"`, not `radiogroup` and not `list`: the members are
 * independently checkable, and the group exists only so the shared label is
 * announced with each of them. A `<fieldset>` with a `<legend>` would do the
 * same, and this is what to use when the markup cannot be one.
 */
export function checkboxGroup(
  options: CheckboxGroupOptions,
  state: CheckboxGroupState,
): CheckboxGroupResult {
  const { labelProps, fieldProps, descriptionProps, errorMessageProps } = field({
    ...options,
    isInvalid: state.isInvalid,
    errorMessage: state.errorMessage,
    // A group is not a labelable element, so `<label for>` would do nothing.
    labelElementType: "span",
  });

  return {
    groupProps: mergeProps(filterDOMProps(options, { labelable: true }), fieldProps, {
      role: "group",
      "aria-disabled": () => access(options.isDisabled) === true || undefined,
      "aria-invalid": () => state.isInvalid() || undefined,
      "aria-required": () => access(options.isRequired) === true || undefined,
    }),
    labelProps,
    descriptionProps,
    errorMessageProps,
  };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export interface CheckboxComponentProps extends StyleProps {
  children?: Child;
  isSelected?: boolean;
  defaultSelected?: boolean;
  isIndeterminate?: boolean;
  isDisabled?: boolean;
  isReadOnly?: boolean;
  isRequired?: boolean;
  isInvalid?: boolean;
  /** What the page thinks of the value, checked as it changes. */
  validate?: ValidateFunction<boolean>;
  /** @default "aria" */
  validationBehavior?: ValidationBehavior;
  value?: string;
  name?: string;
  form?: string;
  autoFocus?: boolean;
  excludeFromTabOrder?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  ref?: RefTarget<HTMLInputElement>;
  onChange?: (isSelected: boolean) => void;
  onFocus?: (event: FocusEvent) => void;
  onBlur?: (event: FocusEvent) => void;
  onPress?: (event: PressEvent) => void;
}

/**
 * ```tsx
 * <Checkbox defaultSelected onChange={(on) => agreed.set(on)}>
 *   I agree
 * </Checkbox>
 * ```
 *
 * The `<input>` is a real one, hidden with a clip rectangle rather than
 * `display: none`, so it stays focusable and keeps its place in the form.
 */
export function Checkbox(props: Incoming<CheckboxComponentProps>) {
  const inputRef = makeRef<HTMLInputElement>();
  const options = fromProps(props);

  const state = toggleState(options);
  const { labelProps, inputProps, isSelected, isPressed, isDisabled, isReadOnly, isInvalid } =
    checkbox(
      {
        ...(options as CheckboxOptions),
        validate: callback(props.validate),
        validationBehavior: () => props.validationBehavior?.(),
      },
      state,
      inputRef,
    );
  const { hoverProps, isHovered } = hover({ isDisabled: options.isDisabled });
  const { focusProps, isFocused, isFocusVisible } = focusRing();

  const outerProps = mergeProps(
    labelProps,
    hoverProps,
    filterDOMProps(options, { global: true }),
    styleProps(props),
    {
      "data-selected": isSelected,
      "data-indeterminate": () => props.isIndeterminate?.() === true,
      "data-pressed": isPressed,
      "data-hovered": isHovered,
      "data-focused": isFocused,
      "data-focus-visible": isFocusVisible,
      "data-disabled": isDisabled,
      "data-readonly": isReadOnly,
      "data-invalid": isInvalid,
    },
  );

  return (
    <label {...outerProps}>
      <input
        {...mergeProps(inputProps, focusProps)}
        ref={mergeRefs(inputRef.set, props.ref?.())}
        style={HIDDEN_INPUT_STYLE}
      />
      {props.children}
    </label>
  );
}

export interface CheckboxGroupComponentProps extends StyleProps {
  children?: Child;
  label?: Child;
  description?: Child;
  errorMessage?: Child;
  value?: string[];
  defaultValue?: string[];
  isDisabled?: boolean;
  isReadOnly?: boolean;
  isRequired?: boolean;
  isInvalid?: boolean;
  /** What the page thinks of the whole selection, checked as it changes. */
  validate?: ValidateFunction<string[]>;
  /** @default "aria" */
  validationBehavior?: ValidationBehavior;
  name?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  onChange?: (value: string[]) => void;
}

/**
 * ```tsx
 * <CheckboxGroup label="Toppings" onChange={(v) => picked.set(v)}>
 *   <GroupCheckbox value="cheese">Cheese</GroupCheckbox>
 *   <GroupCheckbox value="olives">Olives</GroupCheckbox>
 * </CheckboxGroup>
 * ```
 */
export function CheckboxGroup(props: Incoming<CheckboxGroupComponentProps>) {
  const options = fromProps(props);
  const state = checkboxGroupState({
    ...(options as CheckboxGroupStateOptions),
    validate: callback(props.validate),
    validationBehavior: () => props.validationBehavior?.(),
  });
  const { groupProps, labelProps, descriptionProps, errorMessageProps } = checkboxGroup(
    options,
    state,
  );

  provideCheckboxGroup(state, options);

  const outerProps = mergeProps(
    groupProps,
    filterDOMProps(options, { global: true }),
    styleProps(props),
    {
      "data-disabled": state.isDisabled,
      "data-readonly": state.isReadOnly,
      "data-invalid": state.isInvalid,
      "data-required": state.isRequired,
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  return (
    <div {...outerProps}>
      <span {...labelProps}>{props.label}</span>
      {props.children}
      <span {...descriptionProps}>{props.description}</span>
      <span {...errorMessageProps}>
        {() => (state.isInvalid() ? (state.errorMessage() as Child) : null)}
      </span>
    </div>
  );
}

export interface GroupCheckboxProps extends Omit<
  CheckboxComponentProps,
  "isSelected" | "defaultSelected"
> {
  value: string;
}

/**
 * A checkbox that belongs to the enclosing {@link CheckboxGroup}.
 *
 * Its selection lives in the group, so the group's value is one array rather
 * than one boolean per member.
 */
export function GroupCheckbox(props: Incoming<GroupCheckboxProps>) {
  const inputRef = makeRef<HTMLInputElement>();
  const options = fromProps(props);
  const group = useCheckboxGroup();

  const state = toggleState({
    isSelected: () => group.state.isSelected(props.value()),
    isReadOnly: () => group.state.isReadOnly() || props.isReadOnly?.() === true,
    onChange: (selected) => {
      if (selected) group.state.addValue(props.value());
      else group.state.removeValue(props.value());
      props.onChange?.()?.(selected);
    },
  });

  const { labelProps, inputProps, isSelected, isPressed, isDisabled, isReadOnly } = checkbox(
    {
      ...(options as CheckboxOptions),
      isDisabled: () => group.state.isDisabled() || props.isDisabled?.() === true,
      isReadOnly: () => group.state.isReadOnly() || props.isReadOnly?.() === true,
      isRequired: () => group.state.isRequired() || props.isRequired?.() === true,
      isInvalid: () => group.state.isInvalid() || props.isInvalid?.() === true,
      name: () => props.name?.() ?? group.name(),
    },
    state,
    inputRef,
  );

  const { hoverProps, isHovered } = hover({ isDisabled });
  const { focusProps, isFocused, isFocusVisible } = focusRing();

  const outerProps = mergeProps(
    labelProps,
    hoverProps,
    filterDOMProps(options, { global: true }),
    styleProps(props),
    {
      "data-selected": isSelected,
      "data-pressed": isPressed,
      "data-hovered": isHovered,
      "data-focused": isFocused,
      "data-focus-visible": isFocusVisible,
      "data-disabled": isDisabled,
      "data-readonly": isReadOnly,
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  return (
    <label {...outerProps}>
      <input
        {...mergeProps(inputProps, focusProps)}
        ref={mergeRefs(inputRef.set, props.ref?.())}
        style={HIDDEN_INPUT_STYLE}
      />
      {props.children}
    </label>
  );
}

// ---------------------------------------------------------------------------
// The group's context
// ---------------------------------------------------------------------------

import { context, getContext, getOwner, install } from "@barqjs/core";

interface CheckboxGroupContextValue {
  state: CheckboxGroupState;
  name: Accessor<string | undefined>;
}

const CheckboxGroupContext = context<CheckboxGroupContextValue | null>(null);

function provideCheckboxGroup(state: CheckboxGroupState, options: CheckboxGroupOptions): void {
  const owner = getOwner();
  if (owner === null) return;
  const value: CheckboxGroupContextValue = { state, name: () => access(options.name) };
  install(owner, CheckboxGroupContext, () => value);
}

/** The enclosing checkbox group. Throws outside one, which is a coding error. */
export function useCheckboxGroup(): CheckboxGroupContextValue {
  const value = getContext(CheckboxGroupContext);
  if (value === null || value === undefined) {
    throw new Error("A GroupCheckbox must be rendered inside a CheckboxGroup.");
  }
  return value;
}
