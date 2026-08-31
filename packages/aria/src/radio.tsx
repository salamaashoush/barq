/**
 * A radio group: one of several, mutually exclusive.
 *
 * The keyboard behaviour is what separates a radio group from a list of
 * checkboxes, and it is not what the name suggests. The whole group is ONE Tab
 * stop, and the arrow keys move between the members AND select as they go —
 * there is no "focus without selecting". Tab therefore lands on the selected
 * radio, or on the first one when nothing is selected.
 *
 * The platform gives all of that to a set of `<input type="radio">` sharing a
 * `name`, which is why these are real radios. What is added is the arrow
 * navigation, which the platform only provides inside a single form, and the
 * roving `tabindex` that makes Tab skip the group once entered.
 */

import { type Accessor, type Child, type Incoming, signal } from "@barqjs/core";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import { ownerWindow, targetElement } from "./dom.ts";
import { focusableWalker } from "./focus.ts";
import { focusRing } from "./focus.ts";
import { hover } from "./interactions/hover.ts";
import { focusable } from "./interactions/focusable.ts";
import { press, type ElementRef, type PressEvent } from "./interactions/press.ts";
import { useLocale } from "./i18n.ts";
import { field, type FieldOptions } from "./label.ts";
import { formReset, HIDDEN_INPUT_STYLE } from "./toggle.ts";
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
  id,
  type MaybeAccessor,
  mergeProps,
  type StyleProps,
  styleProps,
} from "./utils.ts";

export interface RadioGroupStateOptions {
  value?: MaybeAccessor<string | null | undefined>;
  defaultValue?: MaybeAccessor<string | null | undefined>;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  isReadOnly?: MaybeAccessor<boolean | undefined>;
  isRequired?: MaybeAccessor<boolean | undefined>;
  isInvalid?: MaybeAccessor<boolean | undefined>;
  /** What the page thinks of the choice, checked as it changes. */
  validate?: ValidateFunction<string | null>;
  /** @default "aria" */
  validationBehavior?: MaybeAccessor<ValidationBehavior | undefined>;
  /** The caller's own message, which wins over anything validation found. */
  errorMessage?: MaybeAccessor<unknown>;
  /** The form field name, for matching a server error to this group. */
  name?: MaybeAccessor<string | undefined>;
  onChange?: (value: string) => void;
}

export interface RadioGroupState {
  selectedValue: Accessor<string | null>;
  setSelectedValue(value: string): void;
  /**
   * The radio Tab last landed on.
   *
   * With nothing selected, Tab must enter at the first radio; once the user
   * has been inside, it must return to where they were.
   */
  lastFocusedValue: Accessor<string | null>;
  setLastFocusedValue(value: string | null): void;
  defaultValue: Accessor<string | null>;
  isDisabled: Accessor<boolean>;
  isReadOnly: Accessor<boolean>;
  isRequired: Accessor<boolean>;
  isInvalid: Accessor<boolean>;
  /**
   * On the STATE rather than on `radioGroup`, because each radio reads it:
   * an invalid group marks every button in it, and a radio has no way back to
   * the hook.
   */
  validation: FormValidationState;
  errors: Accessor<string[]>;
  /** For `field`, so `aria-describedby` points at whatever is being shown. */
  errorMessage: Accessor<unknown>;
}

export function radioGroupState(options: RadioGroupStateOptions): RadioGroupState {
  const [value, setValue] = controllable<string | null>(
    () => access(options.value),
    () => access(options.defaultValue) ?? null,
    (next) => options.onChange?.(next as string),
  );

  const lastFocused = signal<string | null>(null);
  const isReadOnly = (): boolean => access(options.isReadOnly) === true;
  const isDisabled = (): boolean => access(options.isDisabled) === true;

  const {
    state: validation,
    isInvalid,
    errors,
    errorMessage,
  } = fieldValidation<string | null>({
    value,
    validate: options.validate,
    validationBehavior: options.validationBehavior,
    isInvalid: options.isInvalid,
    errorMessage: options.errorMessage,
    name: options.name,
  });

  return {
    selectedValue: value,
    setSelectedValue(next) {
      if (isReadOnly() || isDisabled()) return;
      setValue(next);
      validation.commitValidation();
    },
    lastFocusedValue: lastFocused,
    setLastFocusedValue: (next) => lastFocused.set(next),
    defaultValue: () => access(options.defaultValue) ?? null,
    isDisabled,
    isReadOnly,
    isRequired: () => access(options.isRequired) === true,
    isInvalid,
    validation,
    errors,
    errorMessage,
  };
}

export interface RadioGroupOptions extends FieldOptions {
  name?: MaybeAccessor<string | undefined>;
  /** @default "vertical" */
  orientation?: MaybeAccessor<"horizontal" | "vertical" | undefined>;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  isReadOnly?: MaybeAccessor<boolean | undefined>;
  isRequired?: MaybeAccessor<boolean | undefined>;
}

export interface RadioGroupResult {
  radioGroupProps: DOMProps;
  labelProps: DOMProps;
  descriptionProps: DOMProps;
  errorMessageProps: DOMProps;
  /** The shared `name`, which is what makes them one group to the platform. */
  name: Accessor<string>;
}

export function radioGroup(options: RadioGroupOptions, state: RadioGroupState): RadioGroupResult {
  const locale = useLocale();
  const groupName = id(options.name);

  const { labelProps, fieldProps, descriptionProps, errorMessageProps } = field({
    ...options,
    // A radiogroup is not a labelable element.
    labelElementType: "span",
    isInvalid: state.isInvalid,
    errorMessage: state.errorMessage,
  });

  const orientation = (): "horizontal" | "vertical" => access(options.orientation) ?? "vertical";

  const move = (direction: "next" | "previous", event: KeyboardEvent): boolean => {
    const container = event.currentTarget as Element | null;
    if (container === null) return false;

    const from = targetElement(event) ?? undefined;
    const walker = focusableWalker(container, {
      from,
      accept: (node) => node instanceof ownerWindow(node).HTMLInputElement && node.type === "radio",
    });

    let next = direction === "next" ? walker.nextNode() : walker.previousNode();
    if (next === null) {
      // Wrap: the group is a ring, which is what the authoring practices say.
      walker.currentNode = container;
      next = direction === "next" ? walker.nextNode() : walker.last();
    }
    if (next === null) return false;

    (next as HTMLInputElement).focus();
    state.setSelectedValue((next as HTMLInputElement).value);
    return true;
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    const rtl = locale().direction === "rtl";
    const horizontal = orientation() !== "vertical";
    let handled = false;

    switch (event.key) {
      case "ArrowRight":
        handled = move(rtl && horizontal ? "previous" : "next", event);
        break;
      case "ArrowLeft":
        handled = move(rtl && horizontal ? "next" : "previous", event);
        break;
      case "ArrowDown":
        handled = move("next", event);
        break;
      case "ArrowUp":
        handled = move("previous", event);
        break;
      default:
        return;
    }

    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  return {
    name: groupName,
    radioGroupProps: mergeProps(filterDOMProps(options, { labelable: true }), fieldProps, {
      role: "radiogroup",
      "aria-orientation": orientation,
      "aria-invalid": () => state.isInvalid() || undefined,
      "aria-readonly": () => state.isReadOnly() || undefined,
      "aria-required": () => state.isRequired() || undefined,
      "aria-disabled": () => state.isDisabled() || undefined,
      onKeyDown,
      // With nothing selected, Tab must enter at the FIRST radio again next
      // time; leaving the group is when that is decided.
      onFocusOut: (event: FocusEvent) => {
        const container = event.currentTarget as Element | null;
        const related = event.relatedTarget as Element | null;
        if (container !== null && related !== null && container.contains(related)) return;
        if (state.selectedValue() === null) state.setLastFocusedValue(null);
      },
    }),
    labelProps,
    descriptionProps,
    errorMessageProps,
  };
}

export interface RadioOptions {
  value: MaybeAccessor<string>;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  autoFocus?: MaybeAccessor<boolean | undefined>;
  children?: MaybeAccessor<unknown>;
  "aria-label"?: MaybeAccessor<string | undefined>;
  "aria-labelledby"?: MaybeAccessor<string | undefined>;
  "aria-describedby"?: MaybeAccessor<string | undefined>;
  onPress?: (event: PressEvent) => void;
  onFocus?: (event: FocusEvent) => void;
  onBlur?: (event: FocusEvent) => void;
}

export interface RadioResult {
  labelProps: DOMProps;
  inputProps: DOMProps;
  isSelected: Accessor<boolean>;
  isPressed: Accessor<boolean>;
  isDisabled: Accessor<boolean>;
}

export function radio(
  options: RadioOptions,
  state: RadioGroupState,
  ref: ElementRef<HTMLInputElement>,
  name: Accessor<string>,
): RadioResult {
  const value = (): string => access(options.value);
  const isDisabled = (): boolean => access(options.isDisabled) === true || state.isDisabled();
  const isSelected = (): boolean => state.selectedValue() === value();

  const { pressProps, isPressed } = press({ isDisabled, onPress: options.onPress });

  const labelPressed = signal(false);
  const { pressProps: labelPressProps } = press({
    isDisabled: () => isDisabled() || state.isReadOnly(),
    onPressStart: (event) => {
      if (event.pointerType === "keyboard" || event.pointerType === "virtual") {
        event.continuePropagation();
        return;
      }
      labelPressed.set(true);
    },
    onPressEnd: (event) => {
      if (event.pointerType === "keyboard" || event.pointerType === "virtual") {
        event.continuePropagation();
        return;
      }
      labelPressed.set(false);
    },
    onPress: (event) => {
      if (event.pointerType === "keyboard" || event.pointerType === "virtual") {
        event.continuePropagation();
        return;
      }
      options.onPress?.(event);
    },
  });

  const { focusableProps } = focusable(
    {
      ...options,
      onFocus: (event) => {
        state.setLastFocusedValue(value());
        options.onFocus?.(event);
      },
    },
    ref,
  );

  formReset(ref, state.defaultValue(), (next) => {
    if (next !== null) state.setSelectedValue(next);
  });

  /**
   * The roving tab index: exactly one radio in the group is tabbable.
   *
   * The selected one when there is a selection; otherwise the one focus last
   * left, or the first. Every other radio is reachable only with the arrows,
   * which is what makes the group a single Tab stop.
   */
  const tabIndex = (): number | undefined => {
    if (isDisabled()) return undefined;
    const selected = state.selectedValue();
    if (selected !== null) return selected === value() ? 0 : -1;
    const lastFocused = state.lastFocusedValue();
    return lastFocused === value() || lastFocused === null ? 0 : -1;
  };

  return {
    labelProps: mergeProps(labelPressProps, {
      onMouseDown: (event: MouseEvent) => event.preventDefault(),
    }),

    inputProps: mergeProps(
      filterDOMProps(options, { labelable: true }),
      pressProps,
      focusableProps,
      {
        type: "radio",
        name,
        tabIndex,
        checked: isSelected,
        value,
        disabled: isDisabled,
        required: () => state.isRequired(),
        onChange: (event: Event) => {
          event.stopPropagation();
          state.setSelectedValue(value());
          // The platform already checked this radio and unchecked its
          // siblings; if the state declined, put the DOM back.
          (event.target as HTMLInputElement).checked = isSelected();
        },
      },
    ),

    isSelected,
    isPressed: () => isPressed() || labelPressed(),
    isDisabled,
  };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

import { context, getContext, getOwner, install } from "@barqjs/core";

interface RadioGroupContextValue {
  state: RadioGroupState;
  name: Accessor<string>;
}

const RadioGroupContext = context<RadioGroupContextValue | null>(null);

/** The enclosing radio group. Throws outside one, which is a coding error. */
export function useRadioGroup(): RadioGroupContextValue {
  const value = getContext(RadioGroupContext);
  if (value === null || value === undefined) {
    throw new Error("A Radio must be rendered inside a RadioGroup.");
  }
  return value;
}

export interface RadioGroupComponentProps extends StyleProps {
  children?: Child;
  label?: Child;
  description?: Child;
  errorMessage?: Child;
  value?: string | null;
  defaultValue?: string | null;
  name?: string;
  orientation?: "horizontal" | "vertical";
  isDisabled?: boolean;
  isReadOnly?: boolean;
  isRequired?: boolean;
  isInvalid?: boolean;
  /** What the page thinks of the choice, checked as it changes. */
  validate?: ValidateFunction<string | null>;
  /** @default "aria" */
  validationBehavior?: ValidationBehavior;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  onChange?: (value: string) => void;
}

/**
 * ```tsx
 * <RadioGroup label="Size" defaultValue="m">
 *   <Radio value="s">Small</Radio>
 *   <Radio value="m">Medium</Radio>
 * </RadioGroup>
 * ```
 */
export function RadioGroup(props: Incoming<RadioGroupComponentProps>) {
  const options = fromProps(props);
  const state = radioGroupState({
    ...(options as RadioGroupStateOptions),
    validate: callback(props.validate),
    validationBehavior: () => props.validationBehavior?.(),
  });
  const { radioGroupProps, labelProps, descriptionProps, errorMessageProps, name } = radioGroup(
    options,
    state,
  );

  const owner = getOwner();
  if (owner !== null) {
    const value: RadioGroupContextValue = { state, name };
    install(owner, RadioGroupContext, () => value);
  }

  const outerProps = mergeProps(
    radioGroupProps,
    filterDOMProps(options, { global: true }),
    styleProps(props),
    {
      "data-disabled": state.isDisabled,
      "data-readonly": state.isReadOnly,
      "data-invalid": state.isInvalid,
      "data-required": state.isRequired,
      "data-orientation": () => props.orientation?.() ?? "vertical",
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

export interface RadioComponentProps extends StyleProps {
  value: string;
  children?: Child;
  isDisabled?: boolean;
  autoFocus?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  ref?: RefTarget<HTMLInputElement>;
  onFocus?: (event: FocusEvent) => void;
  onBlur?: (event: FocusEvent) => void;
  onPress?: (event: PressEvent) => void;
}

export function Radio(props: Incoming<RadioComponentProps>) {
  const inputRef = makeRef<HTMLInputElement>();
  const options = fromProps(props);
  const group = useRadioGroup();

  const { labelProps, inputProps, isSelected, isPressed, isDisabled } = radio(
    options as RadioOptions,
    group.state,
    inputRef,
    group.name,
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
