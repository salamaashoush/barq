/**
 * A switch: on or off, taking effect immediately.
 *
 * The same machinery as a checkbox with one attribute changed, and the
 * difference is not cosmetic. `role="switch"` is announced as "on"/"off"
 * rather than "checked"/"unchecked", which is what tells the user the setting
 * has already been applied rather than waiting for a Save.
 */

import {
  type Accessor,
  type Child,
  createContext,
  getContext,
  getOwner,
  type Incoming,
  install,
} from "@barqjs/core";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import { focusRing } from "./focus.ts";
import { hover } from "./interactions/hover.ts";
import type { PressEvent } from "./interactions/press.ts";
import type { ElementRef } from "./interactions/press.ts";
import type { ToggleState } from "./button.tsx";
import {
  toggle,
  toggleState,
  toggleElementType,
  pressesInput,
  HIDDEN_INPUT_STYLE,
  type ToggleElementType,
  type ToggleOptions,
  type ToggleResult,
} from "./toggle.ts";
import type { ValidateFunction, ValidationBehavior } from "./validation.ts";
import {
  access,
  callback,
  filterDOMProps,
  fromProps,
  mergeProps,
  styleProps,
  type StyleProps,
} from "./utils.ts";

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
  /**
   * `"label"` when the children are the switch's name, `"span"` when they are
   * its drawing and the name comes from somewhere else. Defaults to a label
   * with children and a span without.
   */
  elementType?: ToggleElementType;
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

/** What a part drawn inside a switch reads. */
export interface SwitchContextValue {
  isSelected: Accessor<boolean>;
  isDisabled: Accessor<boolean>;
}

const SwitchContext = createContext<SwitchContextValue | null>(null);

/**
 * The switch a part is drawn inside: the thumb of a design system's track,
 * which has to move and recolour with a state it does not own.
 */
export function useSwitch(): SwitchContextValue {
  const value = getContext(SwitchContext);
  if (value === null || value === undefined) {
    throw new Error("This must be rendered inside a Switch.");
  }
  return value;
}

/**
 * ```tsx
 * <Switch defaultSelected onChange={(on) => wifi.set(on)}>Wi-Fi</Switch>
 * ```
 *
 * With children it is a `<label>` around them, and they name it. With none it
 * is a `<span>`: an empty label names nothing, and a label may not contain
 * another, so it could not be put inside the `<label>` that does carry the
 * text. `elementType="span"` says the same for children that are a drawing (a
 * track's thumb) rather than a name.
 *
 * ```tsx
 * <label>
 *   Wi-Fi <Switch />
 * </label>
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

  const owner = getOwner();
  if (owner !== null) {
    const value: SwitchContextValue = { isSelected, isDisabled };
    install(owner, SwitchContext, () => value);
  }

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
      "data-state": () => (isSelected() ? "checked" : "unchecked"),
      "data-pressed": isPressed,
      "data-hovered": isHovered,
      "data-focused": isFocused,
      "data-focus-visible": isFocusVisible,
      "data-disabled": isDisabled,
      "data-readonly": isReadOnly,
      "data-invalid": isInvalid,
    },
  );

  const elementType = toggleElementType(props.elementType?.(), props.children);

  if (elementType === "span") {
    const onClick = pressesInput(() => access(inputRef), isDisabled);

    return (
      <span {...mergeProps(outerProps, { onClick })}>
        <input
          {...mergeProps(inputProps, focusProps)}
          ref={mergeRefs(inputRef.set, props.ref?.())}
          style={HIDDEN_INPUT_STYLE}
        />
        {props.children}
      </span>
    );
  }

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
