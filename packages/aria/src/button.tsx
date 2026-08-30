/**
 * Buttons.
 *
 * A `<button>` gets most of this from the platform. The reason the hook exists
 * is everything that is not a `<button>`: a `<div role="button">` has no
 * keyboard activation, no disabled state that assistive technology can see,
 * and no press state to style. And even a real button needs the press
 * handling, because `onClick` cannot report the press beginning, cannot be
 * cancelled by dragging off, and arrives late on touch.
 */

import { type Accessor, type Child, type Incoming } from "@barqjs/core";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import { focusRing } from "./focus.ts";
import { focusable, type FocusableOptions } from "./interactions/focusable.ts";
import { hover } from "./interactions/hover.ts";
import { press, type ElementRef, type PressEvent } from "./interactions/press.ts";
import { controllable } from "./utils.ts";
import {
  access,
  filterDOMProps,
  fromProps,
  mergeProps,
  styleProps,
  triggerSlot,
  type DOMProps,
  type MaybeAccessor,
  type StyleProps,
} from "./utils.ts";

export interface ButtonOptions extends FocusableOptions {
  isDisabled?: MaybeAccessor<boolean | undefined>;
  /**
   * What the element actually is.
   *
   * Anything other than `button` gets `role="button"` and the keyboard
   * handling the platform would otherwise not provide.
   *
   * @default "button"
   */
  elementType?: MaybeAccessor<string | undefined>;
  /** @default "button" */
  type?: MaybeAccessor<"button" | "submit" | "reset" | undefined>;
  /** Keep focus where it is. Only safe where another control owns the keyboard. */
  preventFocusOnPress?: MaybeAccessor<boolean | undefined>;
  href?: MaybeAccessor<string | undefined>;
  target?: MaybeAccessor<string | undefined>;
  rel?: MaybeAccessor<string | undefined>;
  form?: MaybeAccessor<string | undefined>;
  name?: MaybeAccessor<string | undefined>;
  value?: MaybeAccessor<string | undefined>;
  "aria-label"?: MaybeAccessor<string | undefined>;
  "aria-labelledby"?: MaybeAccessor<string | undefined>;
  "aria-describedby"?: MaybeAccessor<string | undefined>;
  "aria-expanded"?: MaybeAccessor<boolean | undefined>;
  "aria-haspopup"?: MaybeAccessor<boolean | string | undefined>;
  "aria-controls"?: MaybeAccessor<string | undefined>;
  "aria-pressed"?: MaybeAccessor<boolean | "mixed" | undefined>;
  "aria-current"?: MaybeAccessor<boolean | string | undefined>;
  /**
   * A button standing in for a form control carries these too.
   *
   * A select's trigger is a `<button>`, and it is the field: it has to be able
   * to say it is required and that what it holds is wrong.
   */
  "aria-invalid"?: MaybeAccessor<boolean | undefined>;
  "aria-required"?: MaybeAccessor<boolean | undefined>;
  onPress?: (event: PressEvent) => void;
  onPressStart?: (event: PressEvent) => void;
  onPressEnd?: (event: PressEvent) => void;
  onPressUp?: (event: PressEvent) => void;
  onPressChange?: (isPressed: boolean) => void;
  onClick?: (event: MouseEvent) => void;
}

export interface ButtonResult {
  buttonProps: DOMProps;
  isPressed: Accessor<boolean>;
}

/**
 * ```tsx
 * const domRef = ref<HTMLButtonElement>();
 * const { buttonProps, isPressed } = button({ onPress: () => count.update((n) => n + 1) }, domRef);
 * <button {...buttonProps} ref={domRef.set} data-pressed={isPressed}>Add</button>
 * ```
 */
export function button(options: ButtonOptions, ref?: ElementRef): ButtonResult {
  const elementType = (): string => access(options.elementType) ?? "button";
  const isDisabled = (): boolean => access(options.isDisabled) === true;

  const { pressProps, isPressed } = press({ ...options, ref });
  const { focusableProps } = focusable(options, ref);

  const nativeProps: DOMProps = {
    type: () =>
      elementType() === "button" || elementType() === "input"
        ? (access(options.type) ?? "button")
        : undefined,
    // A native button expresses "disabled" through the platform; anything else
    // has to say so in ARIA, because `disabled` means nothing on a `<div>`.
    disabled: () =>
      elementType() === "button" || elementType() === "input" ? isDisabled() : undefined,
    role: () => (elementType() === "button" ? undefined : "button"),
    "aria-disabled": () =>
      elementType() === "button" || elementType() === "input"
        ? undefined
        : isDisabled() || undefined,
    // A disabled link must not navigate, and `disabled` does not exist on `<a>`.
    href: () => (elementType() === "a" && !isDisabled() ? access(options.href) : undefined),
    target: () => (elementType() === "a" ? access(options.target) : undefined),
    rel: () => (elementType() === "a" ? access(options.rel) : undefined),
    form: () => access(options.form),
    name: () => access(options.name),
    value: () => access(options.value),
  };

  return {
    isPressed,
    buttonProps: mergeProps(nativeProps, focusableProps, pressProps, {
      "aria-label": () => access(options["aria-label"]),
      "aria-labelledby": () => access(options["aria-labelledby"]),
      "aria-describedby": () => access(options["aria-describedby"]),
      "aria-haspopup": () => access(options["aria-haspopup"]),
      "aria-expanded": () => access(options["aria-expanded"]),
      "aria-controls": () => access(options["aria-controls"]),
      "aria-pressed": () => access(options["aria-pressed"]),
      "aria-current": () => access(options["aria-current"]),
      "aria-invalid": () => access(options["aria-invalid"]) || undefined,
      "aria-required": () => access(options["aria-required"]) || undefined,
    }),
  };
}

// ---------------------------------------------------------------------------
// Toggle button
// ---------------------------------------------------------------------------

export interface ToggleState {
  isSelected: Accessor<boolean>;
  setSelected(isSelected: boolean): void;
  toggle(): void;
}

export interface ToggleStateOptions {
  isSelected?: MaybeAccessor<boolean | undefined>;
  defaultSelected?: MaybeAccessor<boolean | undefined>;
  isReadOnly?: MaybeAccessor<boolean | undefined>;
  onChange?: (isSelected: boolean) => void;
}

/** On or off, controlled or not. Shared by checkbox, switch and toggle button. */
export function toggleState(options: ToggleStateOptions = {}): ToggleState {
  const [isSelected, setSelected] = controllable<boolean>(
    () => access(options.isSelected),
    () => access(options.defaultSelected) ?? false,
    options.onChange,
  );

  const set = (value: boolean): void => {
    // Read-only means the value is shown but not the user's to change.
    if (access(options.isReadOnly) === true) return;
    setSelected(value);
  };

  return {
    isSelected,
    setSelected: set,
    toggle: () => set(!isSelected()),
  };
}

export interface ToggleButtonOptions extends Omit<ButtonOptions, "aria-pressed"> {
  isSelected?: MaybeAccessor<boolean | undefined>;
  defaultSelected?: MaybeAccessor<boolean | undefined>;
  onChange?: (isSelected: boolean) => void;
}

export interface ToggleButtonResult extends ButtonResult {
  isSelected: Accessor<boolean>;
}

/**
 * A button with two states, e.g. "bold" in a text editor.
 *
 * `aria-pressed` is what makes it a toggle rather than a button that happens
 * to look different; without it a screen reader announces no state at all.
 */
export function toggleButton(
  options: ToggleButtonOptions,
  state: ToggleState,
  ref?: ElementRef,
): ToggleButtonResult {
  const { buttonProps, isPressed } = button(
    {
      ...options,
      onPress: (event) => {
        state.toggle();
        options.onPress?.(event);
      },
      "aria-pressed": () => state.isSelected(),
    },
    ref,
  );

  return { buttonProps, isPressed, isSelected: state.isSelected };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export interface ButtonComponentProps extends StyleProps {
  children?: Child;
  isDisabled?: boolean;
  type?: "button" | "submit" | "reset";
  autoFocus?: boolean;
  excludeFromTabOrder?: boolean;
  form?: string;
  name?: string;
  value?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-expanded"?: boolean;
  "aria-haspopup"?: boolean | string;
  "aria-controls"?: string;
  ref?: RefTarget<HTMLButtonElement>;
  onPress?: (event: PressEvent) => void;
  onPressStart?: (event: PressEvent) => void;
  onPressEnd?: (event: PressEvent) => void;
  onPressChange?: (isPressed: boolean) => void;
  onClick?: (event: MouseEvent) => void;
}

/**
 * A button, with the interaction states as data attributes.
 *
 * `data-pressed`, `data-hovered`, `data-focused` and `data-focus-visible` are
 * written as their presence, so `[data-pressed] { … }` is the selector. There
 * is no class name and no style: what it looks like is the caller's.
 *
 * ```tsx
 * <Button onPress={() => save()}>Save</Button>
 * ```
 */
export function Button(props: Incoming<ButtonComponentProps>) {
  const domRef = makeRef<HTMLButtonElement>();
  const options = fromProps(props);
  // What a tooltip or a menu wrapped around this button wants on it. FIRST, so
  // the button's own props win a conflict and only the handlers accumulate.
  const slot = triggerSlot();

  const { buttonProps, isPressed } = button(options, domRef);
  const { hoverProps, isHovered } = hover({ isDisabled: options.isDisabled });
  const { focusProps, isFocused, isFocusVisible } = focusRing();

  const elementProps = mergeProps(
    slot.props,
    buttonProps,
    hoverProps,
    focusProps,
    filterDOMProps(options, { global: true }),
    styleProps(props),
    {
      "data-pressed": isPressed,
      "data-hovered": isHovered,
      "data-focused": isFocused,
      "data-focus-visible": isFocusVisible,
      "data-disabled": () => props.isDisabled?.() === true,
    },
  );

  return (
    <button {...elementProps} ref={mergeRefs(domRef.set, slot.ref, props.ref?.())}>
      {props.children}
    </button>
  );
}

export interface ToggleButtonComponentProps extends Omit<ButtonComponentProps, "aria-pressed"> {
  isSelected?: boolean;
  defaultSelected?: boolean;
  onChange?: (isSelected: boolean) => void;
}

/**
 * ```tsx
 * <ToggleButton defaultSelected onChange={(on) => bold.set(on)}>Bold</ToggleButton>
 * ```
 */
export function ToggleButton(props: Incoming<ToggleButtonComponentProps>) {
  const domRef = makeRef<HTMLButtonElement>();
  const options = fromProps(props);
  const slot = triggerSlot();

  const state = toggleState(options);
  const { buttonProps, isPressed } = toggleButton(options, state, domRef);
  const { hoverProps, isHovered } = hover({ isDisabled: options.isDisabled });
  const { focusProps, isFocused, isFocusVisible } = focusRing();

  const elementProps = mergeProps(
    slot.props,
    buttonProps,
    hoverProps,
    focusProps,
    filterDOMProps(options, { global: true }),
    styleProps(props),
    {
      "data-pressed": isPressed,
      "data-hovered": isHovered,
      "data-focused": isFocused,
      "data-focus-visible": isFocusVisible,
      "data-selected": state.isSelected,
      "data-disabled": () => props.isDisabled?.() === true,
    },
  );

  return (
    <button {...elementProps} ref={mergeRefs(domRef.set, slot.ref, props.ref?.())}>
      {props.children}
    </button>
  );
}
