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

import { cells, createEffect, onCleanup, provide, type Accessor, type Child } from "@barqjs/core";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import { focusRing } from "./focus.ts";
import { focusable, type FocusableOptions } from "./interactions/focusable.ts";
import { hover, type HoverEvent } from "./interactions/hover.ts";
import { press, type ElementRef, type PressEvent } from "./interactions/press.ts";
import { ProgressBarContext } from "./progress-bar-context.ts";
import { announce, pruneAnnouncements } from "./live.ts";
import { SelectionIndicatorProvider } from "./selection-indicator.tsx";
import { controllable } from "./utils.ts";
import {
  access,
  filterDOMProps,
  fromProps,
  id,
  mergeProps,
  styleProps,
  triggerSlot,
  type DOMProps,
  type MaybeAccessor,
  type StyleProps,
} from "./utils.ts";

export interface ButtonOptions extends FocusableOptions {
  id?: MaybeAccessor<string | undefined>;
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
  /** Where a submit button sends the form, in place of the form's own `action`. */
  formAction?: MaybeAccessor<string | undefined>;
  formEncType?: MaybeAccessor<string | undefined>;
  formMethod?: MaybeAccessor<string | undefined>;
  formNoValidate?: MaybeAccessor<boolean | undefined>;
  formTarget?: MaybeAccessor<string | undefined>;
  name?: MaybeAccessor<string | undefined>;
  value?: MaybeAccessor<string | undefined>;
  /**
   * Keep a `tabindex` of -1 while disabled, so a control that moves focus to
   * the button itself (a number field's stepper) can still do so.
   */
  allowFocusWhenDisabled?: MaybeAccessor<boolean | undefined>;
  "aria-disabled"?: MaybeAccessor<boolean | "true" | "false" | undefined>;
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
  function elementType(): string {
    return access(options.elementType) ?? "button";
  }
  function isDisabled(): boolean {
    return access(options.isDisabled) === true;
  }

  const { pressProps, isPressed } = press({ ...options, ref });
  const { focusableProps: focusableBase } = focusable(options, ref);
  const focusableProps = mergeProps(focusableBase, {
    tabIndex: () =>
      access(options.allowFocusWhenDisabled) === true && isDisabled()
        ? -1
        : access(focusableBase.tabIndex as MaybeAccessor<number | undefined>),
  });
  function isFormControl(): boolean {
    return elementType() === "button" || elementType() === "input";
  }

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
      access(options["aria-disabled"]) ??
      (elementType() === "button" || elementType() === "input"
        ? undefined
        : isDisabled() || undefined),
    // A disabled link must not navigate, and `disabled` does not exist on `<a>`.
    href: () => (elementType() === "a" && !isDisabled() ? access(options.href) : undefined),
    target: () => (elementType() === "a" ? access(options.target) : undefined),
    rel: () => (elementType() === "a" ? access(options.rel) : undefined),
    form: () => access(options.form),
    formAction: () => (isFormControl() ? access(options.formAction) : undefined),
    formEncType: () => (isFormControl() ? access(options.formEncType) : undefined),
    formMethod: () => (isFormControl() ? access(options.formMethod) : undefined),
    formNoValidate: () => (isFormControl() ? access(options.formNoValidate) : undefined),
    formTarget: () => (isFormControl() ? access(options.formTarget) : undefined),
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

  function set(value: boolean): void {
    // Read-only means the value is shown but not the user's to change.
    if (access(options.isReadOnly) === true) return;
    setSelected(value);
  }

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
  /**
   * Waiting on the action the button started. Presses and hover are ignored,
   * focus stays, a submit button stops submitting, and a focused button
   * announces the change. A `<ProgressBar>` inside joins the button's name.
   */
  isPending?: boolean;
  type?: "button" | "submit" | "reset";
  autoFocus?: boolean;
  excludeFromTabOrder?: boolean;
  id?: string;
  form?: string;
  formAction?: string;
  formEncType?: string;
  formMethod?: string;
  formNoValidate?: boolean;
  formTarget?: string;
  name?: string;
  value?: string;
  "aria-disabled"?: boolean | "true" | "false";
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
  onPressUp?: (event: PressEvent) => void;
  onPressChange?: (isPressed: boolean) => void;
  onHoverStart?: (event: HoverEvent) => void;
  onHoverEnd?: (event: HoverEvent) => void;
  onHoverChange?: (isHovered: boolean) => void;
  onFocus?: (event: FocusEvent) => void;
  onBlur?: (event: FocusEvent) => void;
  onClick?: (event: MouseEvent) => void;
}

/**
 * `press` already delivers `onClick`, including the one a keyboard or a touch
 * activation would have produced, and `focusable` delivers `onFocus` and
 * `onBlur`. Bound on the element as well, a caller's handler runs twice.
 */
function withoutClick(props: DOMProps): DOMProps {
  const { onClick: _click, onFocus: _focus, onBlur: _blur, ...rest } = props;
  return rest;
}

/** What a pending button still answers: focus, and what a tooltip listens to. */
const LIVE_WHILE_PENDING =
  /Focus|Blur|Hover|Pointer(Enter|Leave|Over|Out)|Mouse(Enter|Leave|Over|Out)/;

function inertWhilePending(props: DOMProps, isPending: () => boolean): DOMProps {
  const result: DOMProps = {};
  for (const key in props) {
    const value = props[key];
    if (key.startsWith("on") && typeof value === "function" && !LIVE_WHILE_PENDING.test(key)) {
      const handler = value as (event: Event) => void;
      result[key] = (event: Event): void => {
        if (!isPending()) handler(event);
      };
    } else {
      result[key] = value;
    }
  }
  return result;
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
export function Button(props: ButtonComponentProps) {
  const domRef = makeRef<HTMLButtonElement>();
  // What a tooltip, a menu or a dialog wrapped around this button wants on it,
  // merged into the button's OPTIONS rather than onto its element.
  //
  // Onto the element it could not work, and did not: `onPress` is not a DOM
  // event, so a trigger's press handler became `addEventListener("press")` and
  // never fired; and `aria-haspopup` lost to the button's own accessor for the
  // same key, which yields `undefined` and is still a function, so `mergeProps`
  // saw a value and kept it. Through the options both arrive where `button()`
  // already knows what to do with them, and `mergeProps` chains the two
  // `onPress` handlers instead of one replacing the other.
  const options = mergeProps(fromProps(cells(props)), triggerSlot().props) as ButtonOptions;
  const slot = triggerSlot();

  function isPending(): boolean {
    return props.isPending === true;
  }

  const { buttonProps, isPressed } = button(options, domRef);
  const { hoverProps, isHovered } = hover({
    isDisabled: () => access(options.isDisabled) === true || isPending(),
    onHoverStart: (event) => props.onHoverStart?.(event),
    onHoverEnd: (event) => props.onHoverEnd?.(event),
    onHoverChange: (hovered) => props.onHoverChange?.(hovered),
  });
  const { focusProps, isFocused, isFocusVisible } = focusRing();

  const buttonId = id(options.id);
  const progressId = id();
  // `aria-labelledby` outranks `aria-label` in the name computation, so a
  // labelled button that wants its progress bar read has to name itself.
  function labelledBy(): string | undefined {
    const given = access(options["aria-labelledby"]);
    if (!isPending()) return given;
    if (given) return `${given} ${progressId()}`;
    if (access(options["aria-label"])) {
      return `${buttonId()} ${progressId()}`;
    }
    return given;
  }

  let wasPending = isPending();
  // Each announcement names this button by id, so none may outlive it.
  const withdrawals: (() => void)[] = [];
  onCleanup(() => {
    for (const withdraw of withdrawals.splice(0)) withdraw();
  });
  createEffect(
    () => ({ pending: isPending(), focused: isFocused(), by: labelledBy() || buttonId() }),
    ({ pending, focused, by }) => {
      if (focused && pending !== wasPending) {
        withdrawals.push(announce({ "aria-labelledby": by }, "assertive"));
      }
      // The progress bar shown while pending goes with it, and the
      // announcement that named it must not be left pointing at nothing.
      if (wasPending && !pending) queueMicrotask(pruneAnnouncements);
      wasPending = pending;
    },
  );

  const elementProps = mergeProps(
    inertWhilePending(buttonProps, isPending),
    hoverProps,
    focusProps,
    withoutClick(filterDOMProps(options, { global: true })),
    styleProps(cells(props)),
    {
      id: buttonId,
      // A pending submit button must not submit, implicitly from a text field
      // on Enter included.
      type: () => {
        const type = access(buttonProps.type as MaybeAccessor<string | undefined>);
        return type === "submit" && isPending() ? "button" : type;
      },
      "aria-labelledby": labelledBy,
      "aria-disabled": () =>
        isPending()
          ? "true"
          : access(buttonProps["aria-disabled"] as MaybeAccessor<string | boolean | undefined>),
      "data-pressed": () => isPressed() && !isPending(),
      "data-hovered": isHovered,
      "data-focused": isFocused,
      "data-focus-visible": isFocusVisible,
      "data-disabled": () => props.isDisabled === true,
      "data-pending": isPending,
    },
  );

  return (
    <button {...elementProps} ref={mergeRefs(domRef.set, slot.ref, props.ref)}>
      {provide(
        ProgressBarContext,
        () => ({ id: progressId }),
        () => props.children as unknown,
      )}
    </button>
  );
}

export interface ToggleButtonComponentProps extends Omit<
  ButtonComponentProps,
  "aria-pressed" | "isPending"
> {
  isSelected?: boolean;
  defaultSelected?: boolean;
  onChange?: (isSelected: boolean) => void;
}

/**
 * ```tsx
 * <ToggleButton defaultSelected onChange={(on) => bold.set(on)}>Bold</ToggleButton>
 * ```
 */
export function ToggleButton(props: ToggleButtonComponentProps) {
  const domRef = makeRef<HTMLButtonElement>();
  // See `Button` for why the slot goes into the options and not onto the
  // element.
  const options = mergeProps(fromProps(cells(props)), triggerSlot().props) as ToggleButtonOptions;
  const slot = triggerSlot();

  const state = toggleState(options);
  const { buttonProps, isPressed } = toggleButton(options, state, domRef);
  const { hoverProps, isHovered } = hover({
    isDisabled: options.isDisabled,
    onHoverStart: (event) => props.onHoverStart?.(event),
    onHoverEnd: (event) => props.onHoverEnd?.(event),
    onHoverChange: (hovered) => props.onHoverChange?.(hovered),
  });
  const { focusProps, isFocused, isFocusVisible } = focusRing();

  const elementProps = mergeProps(
    buttonProps,
    hoverProps,
    focusProps,
    withoutClick(filterDOMProps(options, { global: true })),
    styleProps(cells(props)),
    {
      "data-pressed": isPressed,
      "data-hovered": isHovered,
      "data-focused": isFocused,
      "data-focus-visible": isFocusVisible,
      "data-selected": state.isSelected,
      "data-disabled": () => props.isDisabled === true,
    },
  );

  return (
    <button {...elementProps} ref={mergeRefs(domRef.set, slot.ref, props.ref)}>
      <SelectionIndicatorProvider isSelected={state.isSelected()}>
        {props.children}
      </SelectionIndicatorProvider>
    </button>
  );
}
