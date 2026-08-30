/**
 * A switch: on or off, taking effect immediately.
 *
 * The same machinery as a checkbox with one attribute changed, and the
 * difference is not cosmetic. `role="switch"` is announced as "on"/"off"
 * rather than "checked"/"unchecked", which is what tells the user the setting
 * has already been applied rather than waiting for a Save.
 */

import { type Child, type Incoming } from "@barqjs/core";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import { focusRing } from "./focus.ts";
import { hover } from "./interactions/hover.ts";
import type { PressEvent } from "./interactions/press.ts";
import type { ElementRef } from "./interactions/press.ts";
import type { ToggleState } from "./button.tsx";
import {
  toggle,
  toggleState,
  HIDDEN_INPUT_STYLE,
  type ToggleOptions,
  type ToggleResult,
} from "./toggle.ts";
import type { ValidateFunction, ValidationBehavior } from "./validation.ts";
import { callback, fromProps, mergeProps, styleProps, type StyleProps } from "./utils.ts";

export interface SwitchOptions extends ToggleOptions {}

export type SwitchResult = ToggleResult;

export function switchToggle(
  options: SwitchOptions,
  state: ToggleState,
  ref: ElementRef<HTMLInputElement>,
): SwitchResult {
  const result = toggle(options, state, ref);
  return {
    ...result,
    inputProps: mergeProps(result.inputProps, { role: "switch" }),
  };
}

export interface SwitchComponentProps extends StyleProps {
  children?: Child;
  isSelected?: boolean;
  defaultSelected?: boolean;
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
 * <Switch defaultSelected onChange={(on) => wifi.set(on)}>Wi-Fi</Switch>
 * ```
 */
export function Switch(props: Incoming<SwitchComponentProps>) {
  const inputRef = makeRef<HTMLInputElement>();
  const options = fromProps(props);

  const state = toggleState(options);
  const { labelProps, inputProps, isSelected, isPressed, isDisabled, isReadOnly, isInvalid } =
    switchToggle(
      {
        ...(options as SwitchOptions),
        validate: callback(props.validate),
        validationBehavior: () => props.validationBehavior?.(),
      },
      state,
      inputRef,
    );
  const { hoverProps, isHovered } = hover({ isDisabled: options.isDisabled });
  const { focusProps, isFocused, isFocusVisible } = focusRing();

  const outerProps = mergeProps(labelProps, hoverProps, styleProps(props), {
    "data-selected": isSelected,
    "data-pressed": isPressed,
    "data-hovered": isHovered,
    "data-focused": isFocused,
    "data-focus-visible": isFocusVisible,
    "data-disabled": isDisabled,
    "data-readonly": isReadOnly,
    "data-invalid": isInvalid,
    "data-testid": () => props["data-testid"]?.(),
  });

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
