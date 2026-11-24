/**
 * Checkboxes, on their own and in a group.
 *
 * The indeterminate state is the interesting part: it is a PROPERTY, settable
 * only from script, and it is presentational — the box shows a dash, but the
 * checkbox is still either checked or not, and pressing it commits whichever
 * the value already was. A group's "select all" is the usual reason for one.
 */

import {
  cells,
  type Accessor,
  type Child,
  createContext,
  createEffect,
  getContext,
  getOwner,
  type Incoming,
  install,
} from "@barqjs/core";
import { ref as makeRef, type RefTarget } from "@barqjs/primitives/refs";
import { focusRing } from "./focus.ts";
import { hover } from "./interactions/hover.ts";
import type { PressEvent } from "./interactions/press.ts";
import type { ElementRef } from "./interactions/press.ts";
import { field, type FieldOptions } from "./label.ts";
import {
  toggle,
  toggleState,
  toggleElementType,
  type ToggleElementType,
  type ToggleOptions,
  type ToggleResult,
} from "./toggle.ts";
import { toggleInput, withHelpText } from "./toggle-input.tsx";
import type { ToggleState } from "./button.tsx";
import {
  fieldValidation,
  formValidationState,
  VALID_RESULT,
  type ValidationResult,
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
  createEffect(
    () =>
      [access(ref) as HTMLInputElement | null, access(options.isIndeterminate) === true] as const,
    ([input, indeterminate]) => {
      if (input === null) return;
      input.indeterminate = indeterminate;
    },
  );

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
  /**
   * Whether a member still has to be checked: required, and nothing is.
   *
   * Every member carries it, so one checked box is what satisfies the group
   * rather than each box on its own.
   */
  isRequired: Accessor<boolean>;
  isInvalid: Accessor<boolean>;
  /** The group's own behaviour, or the form's, which its members follow. */
  validationBehavior: Accessor<ValidationBehavior | undefined>;
  /**
   * What one member found wrong with itself, by its value: a member's own
   * `validate`, or what the browser makes of its input.
   */
  setInvalid(value: string, result: ValidationResult): void;
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

  function isReadOnly(): boolean {
    return access(options.isReadOnly) === true;
  }
  function isDisabled(): boolean {
    return access(options.isDisabled) === true;
  }

  function add(next: string): void {
    if (isReadOnly() || isDisabled()) return;
    if (value().includes(next)) return;
    commit([...value(), next]);
  }

  function remove(next: string): void {
    if (isReadOnly() || isDisabled()) return;
    if (!value().includes(next)) return;
    commit(value().filter((entry) => entry !== next));
  }

  const {
    state: validation,
    behavior,
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

  function commit(next: string[]): void {
    setValue(next);
    validation.commitValidation();
  }

  const invalidMembers = new Map<string, ValidationResult>();

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
    isRequired: () => access(options.isRequired) === true && value().length === 0,
    isInvalid,
    validationBehavior: behavior,
    setInvalid: (member, result) => {
      if (result.isInvalid) invalidMembers.set(member, result);
      else invalidMembers.delete(member);
      validation.updateValidation(mergeValidation([...invalidMembers.values()]));
    },
    validation,
    errors,
    errorMessage,
  };
}

/** Every member's finding as one: invalid if any is, with each message once. */
function mergeValidation(results: ValidationResult[]): ValidationResult {
  if (results.length === 0) return VALID_RESULT;
  function any(key: keyof ValidityState): boolean {
    return results.some((result) => result.validationDetails[key]);
  }
  return {
    isInvalid: true,
    validationErrors: [...new Set(results.flatMap((result) => result.validationErrors))],
    validationDetails: {
      badInput: any("badInput"),
      customError: any("customError"),
      patternMismatch: any("patternMismatch"),
      rangeOverflow: any("rangeOverflow"),
      rangeUnderflow: any("rangeUnderflow"),
      stepMismatch: any("stepMismatch"),
      tooLong: any("tooLong"),
      tooShort: any("tooShort"),
      typeMismatch: any("typeMismatch"),
      valueMissing: any("valueMissing"),
      valid: false,
    },
  };
}

export interface CheckboxGroupOptions extends FieldOptions {
  isDisabled?: MaybeAccessor<boolean | undefined>;
  isRequired?: MaybeAccessor<boolean | undefined>;
  isReadOnly?: MaybeAccessor<boolean | undefined>;
  name?: MaybeAccessor<string | undefined>;
  /** The id of the `<form>` the members belong to, when they are not inside it. */
  form?: MaybeAccessor<string | undefined>;
}

export interface CheckboxGroupResult {
  groupProps: DOMProps;
  labelProps: DOMProps;
  descriptionProps: DOMProps;
  errorMessageProps: DOMProps;
  /** For each member's `aria-describedby`: the group's help text and error. */
  descriptionIds: Accessor<string | undefined>;
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
  const { labelProps, fieldProps, descriptionProps, errorMessageProps, descriptionIds } = field({
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
    descriptionIds,
  };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export interface CheckboxComponentProps extends StyleProps {
  children?: Child;
  /**
   * `"label"` when the children are the checkbox's name, `"span"` when they
   * are its drawing and the name comes from somewhere else. Defaults to a
   * label with children and a span without.
   */
  elementType?: ToggleElementType;
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
  /** Help text, rendered after the checkbox and announced with it. */
  description?: Child;
  /**
   * What is wrong, rendered after the checkbox while it is invalid. Without
   * one, whatever validation found is shown.
   */
  errorMessage?: Child;
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

/** What a part drawn inside a checkbox reads. */
export interface CheckboxContextValue {
  isSelected: Accessor<boolean>;
  isIndeterminate: Accessor<boolean>;
  isDisabled: Accessor<boolean>;
}

const CheckboxContext = createContext<CheckboxContextValue | null>(null);

/**
 * The checkbox a part is drawn inside: the tick or the dash of a design
 * system's box, which appears with a state it does not own.
 */
export function useCheckbox(): CheckboxContextValue {
  const value = getContext(CheckboxContext);
  if (value === null || value === undefined) {
    throw new Error("This must be rendered inside a Checkbox.");
  }
  return value;
}

function checkedState(value: CheckboxContextValue): "checked" | "unchecked" | "indeterminate" {
  if (value.isIndeterminate()) return "indeterminate";
  return value.isSelected() ? "checked" : "unchecked";
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
 *
 * With children it is a `<label>` around them, and they name it. With none it
 * is a `<span>`, so it can sit inside the `<label>` that carries the text:
 *
 * ```tsx
 * <label>
 *   <Checkbox /> I agree
 * </label>
 * ```
 */
export function Checkbox(props: Incoming<CheckboxComponentProps>) {
  const inputRef = makeRef<HTMLInputElement>();
  const options = fromProps(props);

  const state = toggleState(options);
  const {
    labelProps,
    inputProps,
    descriptionProps,
    errorMessageProps,
    isSelected,
    isPressed,
    isDisabled,
    isReadOnly,
    isInvalid,
    errorMessage,
  } = checkbox(
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

  const part: CheckboxContextValue = {
    isSelected,
    isIndeterminate: () => props.isIndeterminate?.() === true,
    isDisabled,
  };
  const owner = getOwner();
  if (owner !== null) install(owner, CheckboxContext, () => part);

  const outerProps = mergeProps(
    labelProps,
    hoverProps,
    // NOT `id`: this is a `<label>`, and `id` belongs on the input it wraps.
    // A `<label for>` elsewhere on the page can only reach a LABELABLE element,
    // so an `id` here answered `getElementById` first — the label came earlier
    // in the document — and clicking the text toggled nothing. Measured on the
    // site's checkbox page.
    filterDOMProps(options, { global: true, id: false }),
    styleProps(props),
    {
      "data-selected": isSelected,
      "data-state": () => checkedState(part),
      "data-indeterminate": () => props.isIndeterminate?.() === true,
      "data-pressed": isPressed,
      "data-hovered": isHovered,
      "data-focused": isFocused,
      "data-focus-visible": isFocusVisible,
      "data-disabled": isDisabled,
      "data-readonly": isReadOnly,
      "data-invalid": isInvalid,
      "data-required": () => props.isRequired?.() === true,
    },
  );

  return withHelpText(
    toggleInput({
      elementType: toggleElementType(props.elementType?.(), props.children),
      outerProps,
      inputProps,
      focusProps,
      inputRef,
      ref: props.ref?.(),
      children: props.children,
      isDisabled,
    }),
    {
      descriptionProps,
      errorMessageProps,
      description: () => props.description?.(),
      errorMessage: () => (isInvalid() ? errorMessage() : undefined),
    },
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
  /** The id of the `<form>` the members belong to, when they are not inside it. */
  form?: string;
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
export function CheckboxGroup(props: CheckboxGroupComponentProps) {
  const options = fromProps(cells(props));
  const state = checkboxGroupState({
    ...(options as CheckboxGroupStateOptions),
    validate: callback(cells(props).validate),
    validationBehavior: () => props.validationBehavior,
  });
  const { groupProps, labelProps, descriptionProps, errorMessageProps, descriptionIds } =
    checkboxGroup(options, state);

  provideCheckboxGroup({
    state,
    name: () => props.name,
    form: () => props.form,
    descriptionIds,
  });

  const outerProps = mergeProps(
    groupProps,
    filterDOMProps(options, { global: true }),
    styleProps(cells(props)),
    {
      "data-disabled": state.isDisabled,
      "data-readonly": state.isReadOnly,
      "data-invalid": state.isInvalid,
      "data-required": () => props.isRequired === true,
      "data-testid": () => props["data-testid"],
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
  "isSelected" | "defaultSelected" | "errorMessage"
> {
  value: string;
}

interface GroupMemberState {
  value: string;
  own: ValidationResult;
}

/**
 * A checkbox that belongs to the enclosing {@link CheckboxGroup}.
 *
 * Its selection lives in the group, so the group's value is one array rather
 * than one boolean per member. So does its validity: a member's own `validate`
 * makes the whole group invalid, and the group's error is the one shown.
 */
export function GroupCheckbox(props: Incoming<GroupCheckboxProps>) {
  const inputRef = makeRef<HTMLInputElement>();
  const options = fromProps(props);
  const group = useCheckboxGroup();
  const groupValidation = group.state.validation;

  const state = toggleState({
    isSelected: () => group.state.isSelected(props.value()),
    isReadOnly: () => group.state.isReadOnly() || props.isReadOnly?.() === true,
    onChange: (selected) => {
      if (selected) group.state.addValue(props.value());
      else group.state.removeValue(props.value());
      props.onChange?.()?.(selected);
    },
  });

  function behavior(): ValidationBehavior | undefined {
    return props.validationBehavior?.() ?? group.state.validationBehavior();
  }

  // Its own `validate`, shown as it happens whatever the behaviour: it only
  // decides what the group is told, and the group decides when to show it.
  const own = formValidationState<boolean>({
    value: state.isSelected,
    validate: callback(props.validate),
    validationBehavior: "aria",
  });

  // What the browser made of this input, and what this member last told the
  // group under which of its values.
  let native: ValidationResult = VALID_RESULT;
  let current: GroupMemberState | null = null;
  function report(): void {
    if (current === null) return;
    group.state.setInvalid(current.value, current.own.isInvalid ? current.own : native);
  }

  createEffect(
    () => [props.value(), own.realtimeValidation()] as const,
    ([value, found]) => {
      if (current !== null && current.value !== value) {
        group.state.setInvalid(current.value, VALID_RESULT);
      }
      current = { value, own: found };
      report();
    },
  );

  function realtimeValidation(): ValidationResult {
    const whole = groupValidation.realtimeValidation();
    return whole.isInvalid ? whole : own.realtimeValidation();
  }
  const validation: FormValidationState = {
    realtimeValidation,
    displayValidation: () =>
      behavior() === "native" ? groupValidation.displayValidation() : realtimeValidation(),
    updateValidation: (result) => {
      native = result;
      report();
    },
    resetValidation: () => groupValidation.resetValidation(),
    commitValidation: () => groupValidation.commitValidation(),
  };

  const {
    labelProps,
    inputProps,
    descriptionProps,
    isSelected,
    isPressed,
    isDisabled,
    isReadOnly,
    isInvalid,
  } = checkbox(
    {
      ...(options as CheckboxOptions),
      validate: undefined,
      validationState: validation,
      validationBehavior: behavior,
      isDisabled: () => group.state.isDisabled() || props.isDisabled?.() === true,
      isReadOnly: () => group.state.isReadOnly() || props.isReadOnly?.() === true,
      isRequired: () => props.isRequired?.() ?? group.state.isRequired(),
      isInvalid: () => props.isInvalid?.(),
      name: () => props.name?.() ?? group.name(),
      form: () => props.form?.() ?? group.form(),
    },
    state,
    inputRef,
  );

  const { hoverProps, isHovered } = hover({ isDisabled });
  const { focusProps, isFocused, isFocusVisible } = focusRing();

  const part: CheckboxContextValue = {
    isSelected,
    isIndeterminate: () => props.isIndeterminate?.() === true,
    isDisabled,
  };
  const owner = getOwner();
  if (owner !== null) install(owner, CheckboxContext, () => part);

  const outerProps = mergeProps(
    labelProps,
    hoverProps,
    // NOT `id`: this is a `<label>`, and `id` belongs on the input it wraps.
    // A `<label for>` elsewhere on the page can only reach a LABELABLE element,
    // so an `id` here answered `getElementById` first — the label came earlier
    // in the document — and clicking the text toggled nothing. Measured on the
    // site's checkbox page.
    filterDOMProps(options, { global: true, id: false }),
    styleProps(props),
    {
      "data-selected": isSelected,
      "data-state": () => checkedState(part),
      "data-pressed": isPressed,
      "data-hovered": isHovered,
      "data-focused": isFocused,
      "data-focus-visible": isFocusVisible,
      "data-disabled": isDisabled,
      "data-readonly": isReadOnly,
      "data-invalid": isInvalid,
      "data-required": () => props.isRequired?.() ?? group.state.isRequired(),
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  return withHelpText(
    toggleInput({
      elementType: toggleElementType(props.elementType?.(), props.children),
      outerProps,
      // The group's help text and error describe each member as well: a
      // screen reader moving from box to box never passes the group.
      inputProps: mergeProps(inputProps, { "aria-describedby": group.descriptionIds }),
      focusProps,
      inputRef,
      ref: props.ref?.(),
      children: props.children,
      isDisabled,
    }),
    {
      descriptionProps,
      errorMessageProps: {},
      description: () => props.description?.(),
      errorMessage: () => undefined,
    },
  );
}

// ---------------------------------------------------------------------------
// The group's context
// ---------------------------------------------------------------------------

interface CheckboxGroupContextValue {
  state: CheckboxGroupState;
  name: Accessor<string | undefined>;
  form: Accessor<string | undefined>;
  /** The group's help text and error, for each member's description. */
  descriptionIds: Accessor<string | undefined>;
}

const CheckboxGroupContext = createContext<CheckboxGroupContextValue | null>(null);

function provideCheckboxGroup(value: CheckboxGroupContextValue): void {
  const owner = getOwner();
  if (owner === null) return;
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
