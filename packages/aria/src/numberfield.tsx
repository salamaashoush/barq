/**
 * A number field: a text input that holds a number, with stepper buttons.
 *
 * `<input type="number">` is not this. It accepts `1e5` and `--` and rejects
 * nothing, it cannot show a currency symbol or a thousands separator, its
 * spinner is unstyleable and unreachable by touch, and its `valueAsNumber` is
 * NaN whenever the user is mid-edit. So this is a `type="text"` input with the
 * numeric parts put back:
 *
 * - **It is formatted while you are not editing and plain while you are.** The
 *   value shows as "$1,234.50" and commits back to that on blur, but a
 *   keystroke that could still become a number is accepted as typed.
 * - **Parsing is locale-aware.** "1.234,5" is one thousand two hundred and
 *   thirty four and a half in German, and `parseFloat` would read 1.234.
 * - **It announces.** The input carries no `role`, because a spin button role
 *   makes VoiceOver refuse to focus it; instead the value is announced
 *   assertively when it changes, which is what a real spin button would do.
 *
 * The stepper buttons are out of the Tab order and take no focus: they belong
 * to the input, and a keyboard user reaches the same thing with the arrows.
 */

import {
  type Accessor,
  type Child,
  computed,
  context,
  effect,
  getContext,
  getOwner,
  type Incoming,
  install,
  isServer,
  signal,
} from "@barqjs/core";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import { button } from "./button.tsx";
import { focusRing } from "./focus.ts";
import { numberFormatter, numberParser } from "./i18n.ts";
import { focusWithin } from "./interactions/focus-events.ts";
import { hover } from "./interactions/hover.ts";
import type { ElementRef, PressEvent } from "./interactions/press.ts";
import { scrollWheel } from "./interactions/scroll-wheel.ts";
import { announce, clearAnnouncer } from "./live.ts";
import { textField, type TextFieldOptions } from "./textfield.tsx";
import {
  type FormValidationState,
  type ValidateFunction,
  type ValidationBehavior,
} from "./validation.ts";
import { formReset } from "./toggle.ts";
import {
  callback,
  access,
  clamp,
  controllable,
  id,
  mergeProps,
  snapValueToStep,
  styleProps,
  type DOMProps,
  type MaybeAccessor,
  type StyleProps,
} from "./utils.ts";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface NumberFieldStateOptions {
  value?: MaybeAccessor<number | null | undefined>;
  defaultValue?: MaybeAccessor<number | null | undefined>;
  minValue?: MaybeAccessor<number | undefined>;
  maxValue?: MaybeAccessor<number | undefined>;
  step?: MaybeAccessor<number | undefined>;
  formatOptions?: MaybeAccessor<Intl.NumberFormatOptions | undefined>;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  isReadOnly?: MaybeAccessor<boolean | undefined>;
  /**
   * Whether committing snaps to the step, or only validates.
   *
   * @default "snap"
   */
  commitBehavior?: MaybeAccessor<"snap" | "validate" | undefined>;
  onChange?: (value: number) => void;
}

export interface NumberFieldState {
  /** What the input shows: as typed while editing, formatted otherwise. */
  inputValue: Accessor<string>;
  /** What it currently parses to, or NaN. */
  numberValue: Accessor<number>;
  defaultNumberValue: Accessor<number>;
  minValue: Accessor<number | undefined>;
  maxValue: Accessor<number | undefined>;
  canIncrement: Accessor<boolean>;
  canDecrement: Accessor<boolean>;
  /** Whether the text could still become a number as the user keeps typing. */
  validate(value: string): boolean;
  setInputValue(value: string): void;
  setNumberValue(value: number): void;
  /** Parse, clamp, snap and format. What blur and Enter do. */
  commit(value?: string): void;
  increment(): void;
  decrement(): void;
  incrementToMax(): void;
  decrementToMin(): void;
}

/** Add or subtract without the binary floating point drift. */
function step(operation: "+" | "-", value: number, amount: number): number {
  const decimals = (entry: number): number => {
    const text = String(entry);
    const point = text.indexOf(".");
    return point === -1 ? 0 : text.length - point - 1;
  };
  const places = Math.max(decimals(value), decimals(amount));
  const scale = 10 ** places;
  const scaled =
    operation === "+" ? value * scale + amount * scale : value * scale - amount * scale;
  return scaled / scale;
}

export function numberFieldState(options: NumberFieldStateOptions): NumberFieldState {
  const format = numberFormatter(access(options.formatOptions));
  const parser = numberParser(access(options.formatOptions));

  const min = (): number | undefined => access(options.minValue);
  const max = (): number | undefined => access(options.maxValue);
  const snaps = (): boolean => (access(options.commitBehavior) ?? "snap") === "snap";

  const stepSize = (): number => {
    const given = access(options.step);
    if (given !== undefined && !Number.isNaN(given)) return given;
    // A percent field's natural step is one percentage point, which is 0.01 of
    // the value it holds.
    return format().resolvedOptions().style === "percent" ? 0.01 : 1;
  };

  const snap = (value: number): number => {
    const given = access(options.step);
    if (given === undefined || Number.isNaN(given)) return clamp(value, min(), max());
    return snapValueToStep(value, min(), max(), given);
  };

  const [numberValue, setNumberValueRaw] = controllable<number>(
    () => {
      const given = access(options.value);
      if (given === undefined) return undefined;
      if (given === null || Number.isNaN(given)) return Number.NaN;
      return snaps() ? snap(given) : given;
    },
    () => {
      const given = access(options.defaultValue);
      if (given === null || given === undefined || Number.isNaN(given)) return Number.NaN;
      return snaps() ? snap(given) : given;
    },
    options.onChange,
  );

  const initial = numberValue();
  const asText = (value: number): string => (Number.isNaN(value) ? "" : format().format(value));

  const inputValue = signal(asText(numberValue()));

  // What the LAST write produced, so a keystroke reads its own change back
  // rather than the value a controlled owner has not caught up with yet.
  let live = numberValue();

  if (!isServer) {
    // The number changing from OUTSIDE reformats the field. A change the field
    // made itself is already in it, as typed.
    effect(() => {
      const value = numberValue();
      if (value === live) return;
      live = value;
      inputValue.set(asText(value));
    });
  }

  const parsed = computed(() => parser().parse(inputValue()));

  const setNumberValue = (value: number): void => {
    live = value;
    setNumberValueRaw(value);
    inputValue.set(asText(value));
  };

  const commit = (override?: string): void => {
    const text = override ?? inputValue();

    if (text.length === 0) {
      live = Number.NaN;
      setNumberValueRaw(Number.NaN);
      inputValue.set(access(options.value) === undefined ? "" : asText(numberValue()));
      return;
    }

    const value = override === undefined ? parsed() : parser().parse(override);
    if (Number.isNaN(value)) {
      // Not a number after all: the field goes back to what it holds rather
      // than keeping text that means nothing.
      inputValue.set(asText(numberValue()));
      return;
    }

    // Formatted and read back, so the value IS what the field will show: a
    // field displaying two decimal places holds two decimal places.
    const clamped = parser().parse(asText(snaps() ? snap(value) : value));
    live = clamped;
    setNumberValueRaw(clamped);
    inputValue.set(asText(access(options.value) === undefined ? clamped : numberValue()));
  };

  /**
   * The next step boundary in a direction.
   *
   * From a value already off the boundary, the first move is ONTO it — the
   * user asked for the next valid value, not for the next one plus a step.
   */
  const nextStep = (operation: "+" | "-", empty: number | undefined): number => {
    const current = parsed();
    const size = stepSize();

    if (Number.isNaN(current)) {
      return snapValueToStep(
        empty === undefined || Number.isNaN(empty) ? 0 : empty,
        min(),
        max(),
        size,
      );
    }

    const snapped = snapValueToStep(current, min(), max(), size);
    if ((operation === "+" && snapped > current) || (operation === "-" && snapped < current)) {
      return snapped;
    }
    return snapValueToStep(step(operation, current, size), min(), max(), size);
  };

  const canStep = (operation: "+" | "-"): boolean => {
    if (access(options.isDisabled) === true || access(options.isReadOnly) === true) return false;
    const current = parsed();
    const limit = operation === "+" ? max() : min();
    if (Number.isNaN(current) || limit === undefined || Number.isNaN(limit)) return true;
    const size = stepSize();
    if (operation === "+") {
      return (
        snapValueToStep(current, min(), max(), size) > current || step("+", current, size) <= limit
      );
    }
    return (
      snapValueToStep(current, min(), max(), size) < current || step("-", current, size) >= limit
    );
  };

  return {
    inputValue,
    numberValue,
    defaultNumberValue: () => {
      const given = access(options.defaultValue);
      if (given === null || given === undefined || Number.isNaN(given)) return initial;
      return snaps() ? snap(given) : given;
    },
    minValue: min,
    maxValue: max,
    canIncrement: () => canStep("+"),
    canDecrement: () => canStep("-"),
    validate: (value) => parser().isValidPartialNumber(value, min(), max()),
    setInputValue: (value) => inputValue.set(value),
    setNumberValue,
    commit,
    increment: () => setNumberValue(nextStep("+", min())),
    decrement: () => setNumberValue(nextStep("-", max())),
    incrementToMax: () => {
      const limit = max();
      if (limit !== undefined) setNumberValue(snapValueToStep(limit, min(), max(), stepSize()));
    },
    decrementToMin: () => {
      const limit = min();
      if (limit !== undefined) setNumberValue(limit);
    },
  };
}

// ---------------------------------------------------------------------------
// Spin button
// ---------------------------------------------------------------------------

export interface SpinButtonOptions {
  isDisabled?: MaybeAccessor<boolean | undefined>;
  isReadOnly?: MaybeAccessor<boolean | undefined>;
  value?: MaybeAccessor<number | undefined>;
  minValue?: MaybeAccessor<number | undefined>;
  maxValue?: MaybeAccessor<number | undefined>;
  /** What the value MEANS, for assistive technology. */
  textValue?: MaybeAccessor<string | undefined>;
  onIncrement?: () => void;
  onDecrement?: () => void;
  onIncrementToMax?: () => void;
  onDecrementToMin?: () => void;
  onIncrementPage?: () => void;
  onDecrementPage?: () => void;
}

export interface SpinButtonResult {
  spinButtonProps: DOMProps;
  /** Options for {@link button}, not props for an element. */
  incrementButtonProps: DOMProps;
  decrementButtonProps: DOMProps;
}

/** How long a held stepper button waits before it starts repeating. */
const REPEAT_DELAY = 400;
const REPEAT_INTERVAL = 60;

/**
 * The keys and the press-and-hold that step a value.
 *
 * Holding a stepper button repeats, as the platform's own does; the repeat is
 * cancelled by a `pointercancel`, so a touch that turns into a scroll does not
 * leave the value running away.
 */
export function spinButton(options: SpinButtonOptions): SpinButtonResult {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let announced = false;

  const stop = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  const repeat = (act: () => void, guard: () => boolean, delay: number): void => {
    stop();
    timer = setTimeout(() => {
      if (!guard()) return;
      act();
      repeat(act, guard, REPEAT_INTERVAL);
    }, delay);
  };

  const belowMax = (): boolean => {
    const limit = access(options.maxValue);
    const value = access(options.value);
    return limit === undefined || value === undefined || Number.isNaN(value) || value < limit;
  };

  const aboveMin = (): boolean => {
    const limit = access(options.minValue);
    const value = access(options.value);
    return limit === undefined || value === undefined || Number.isNaN(value) || value > limit;
  };

  const enabled = (): boolean =>
    access(options.isDisabled) !== true && access(options.isReadOnly) !== true;

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!enabled()) return;
    switch (event.key) {
      case "PageUp":
        event.preventDefault();
        (options.onIncrementPage ?? options.onIncrement)?.();
        return;
      case "PageDown":
        event.preventDefault();
        (options.onDecrementPage ?? options.onDecrement)?.();
        return;
      case "ArrowUp":
        event.preventDefault();
        options.onIncrement?.();
        return;
      case "ArrowDown":
        event.preventDefault();
        options.onDecrement?.();
        return;
      case "Home":
        if (options.onDecrementToMin === undefined) return;
        event.preventDefault();
        options.onDecrementToMin();
        return;
      case "End":
        if (options.onIncrementToMax === undefined) return;
        event.preventDefault();
        options.onIncrementToMax();
        return;
      default:
        return;
    }
  };

  if (!isServer) {
    // Announced assertively, because the input carries no spin button role to
    // announce it for us. `clearAnnouncer` first, so holding a stepper does
    // not queue up thirty values to read out in turn.
    effect(() => {
      const text = access(options.textValue) ?? String(access(options.value) ?? "");
      // A hyphen-minus between a currency symbol and a number is read as a
      // hyphen and swallowed; the real minus sign is announced.
      const spoken = text === "" ? "Empty" : text.replace("-", "−");
      if (!announced) {
        announced = true;
        return;
      }
      clearAnnouncer("assertive");
      announce(spoken, "assertive");
    });
  }

  /**
   * One step now, then a repeat while it is held.
   *
   * Touch is the exception: nothing happens until the finger lifts, because a
   * touch that turns into a scroll must not have changed the value on the way
   * past.
   */
  const stepper = (
    act: () => void,
    guard: () => boolean,
  ): {
    onPressStart: (event: { pointerType: string }) => void;
    onPressEnd: (event: { pointerType: string }) => void;
  } => {
    let held = false;
    let spun = false;
    return {
      onPressStart: (event) => {
        stop();
        spun = false;
        held = event.pointerType === "touch";
        if (!enabled()) return;
        if (!held) act();
        repeat(
          () => {
            spun = true;
            act();
          },
          guard,
          REPEAT_DELAY,
        );
      },
      onPressEnd: () => {
        stop();
        if (held && !spun && enabled()) act();
        held = false;
      },
    };
  };

  return {
    spinButtonProps: { onKeyDown },
    incrementButtonProps: stepper(() => options.onIncrement?.(), belowMax),
    decrementButtonProps: stepper(() => options.onDecrement?.(), aboveMin),
  };
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export interface NumberFieldOptions extends Omit<
  TextFieldOptions,
  "value" | "defaultValue" | "onChange" | "type" | "validate"
> {
  /**
   * What the page thinks of the NUMBER, checked as it changes.
   *
   * The number rather than the typed text: a validator handed "1.2e" while
   * someone is still typing has nothing useful to say.
   */
  validate?: ValidateFunction<number>;
  inputRef: ElementRef<HTMLInputElement>;
  formatOptions?: MaybeAccessor<Intl.NumberFormatOptions | undefined>;
  minValue?: MaybeAccessor<number | undefined>;
  maxValue?: MaybeAccessor<number | undefined>;
  /** Stop the scroll wheel changing the value. @default false */
  isWheelDisabled?: MaybeAccessor<boolean | undefined>;
  incrementAriaLabel?: MaybeAccessor<string | undefined>;
  decrementAriaLabel?: MaybeAccessor<string | undefined>;
  /** The field's visible label, for naming the stepper buttons. */
  label?: MaybeAccessor<string | undefined>;
}

export interface NumberFieldResult {
  labelProps: DOMProps;
  /** What is wrong with the value, and whether the user is being told. */
  validation: FormValidationState;
  errors: Accessor<string[]>;
  isInvalid: Accessor<boolean>;
  /** For the element wrapping the input and its steppers. */
  groupProps: DOMProps;
  inputProps: DOMProps;
  /** Options for {@link button}, not props for an element. */
  incrementButtonProps: DOMProps;
  decrementButtonProps: DOMProps;
  descriptionProps: DOMProps;
  errorMessageProps: DOMProps;
}

export function numberField(
  options: NumberFieldOptions,
  state: NumberFieldState,
): NumberFieldResult {
  const inputId = id();
  const format = numberFormatter(access(options.formatOptions));

  const isDisabled = (): boolean => access(options.isDisabled) === true;
  const isReadOnly = (): boolean => access(options.isReadOnly) === true;

  // Never `currencySign: "accounting"`: the value would be spoken as
  // parentheses rather than as a negative number.
  const spoken = numberFormatter({ ...access(options.formatOptions), currencySign: undefined });
  const textValue = (): string =>
    Number.isNaN(state.numberValue()) ? "" : spoken().format(state.numberValue());

  const { spinButtonProps, incrementButtonProps, decrementButtonProps } = spinButton({
    isDisabled: options.isDisabled,
    isReadOnly: options.isReadOnly,
    value: state.numberValue,
    minValue: options.minValue,
    maxValue: options.maxValue,
    textValue,
    onIncrement: () => state.increment(),
    onDecrement: () => state.decrement(),
    onIncrementToMax: () => state.incrementToMax(),
    onDecrementToMin: () => state.decrementToMin(),
  });

  const { focusWithinProps, isFocusWithin } = focusWithin({ isDisabled: options.isDisabled });

  scrollWheel({
    ref: options.inputRef,
    isDisabled: () =>
      access(options.isWheelDisabled) === true || isDisabled() || isReadOnly() || !isFocusWithin(),
    onScroll: (delta) => {
      // A trackpad scrolls in both directions at once. Mostly sideways is the
      // user scrolling the page, not adjusting this field.
      if (Math.abs(delta.deltaY) <= Math.abs(delta.deltaX)) return;
      if (delta.deltaY > 0) state.increment();
      else state.decrement();
    },
  });

  /**
   * Which software keyboard a touch device offers.
   *
   * `numeric` has no minus and no decimal point on iOS, so a field that can
   * hold either has to ask for something wider — and the answers differ
   * between iOS and Android.
   */
  const inputMode = (): string => {
    const resolved = format().resolvedOptions();
    const hasDecimals = (resolved.maximumFractionDigits ?? 0) > 0;
    const hasNegative = state.minValue() === undefined || (state.minValue() as number) < 0;
    if (hasNegative) return "text";
    if (hasDecimals) return "decimal";
    return "numeric";
  };

  const {
    labelProps,
    inputProps: fieldProps,
    descriptionProps,
    errorMessageProps,
    validation,
    errors,
    isInvalid,
  } = textField(
    {
      ...options,
      id: inputId,
      type: "text",
      // The caller validates the NUMBER; `textField` validates a string, so
      // the typed text is ignored and the parsed value is handed over instead.
      validate:
        options.validate === undefined
          ? undefined
          : () => (options.validate as ValidateFunction<number>)(state.numberValue()),
      value: state.inputValue,
      // Rejected keystrokes never reach the state, so a field that cannot hold
      // a letter never shows one.
      onChange: (value) => {
        if (state.validate(value)) state.setInputValue(value);
      },
      autoComplete: "off",
    },
    options.inputRef,
  );

  formReset(options.inputRef, state.defaultNumberValue, (value) => state.setNumberValue(value));

  const onBlur = (): void => {
    state.commit();
    validation.commitValidation();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Enter") return;
    // Not prevented: a number field inside a form still submits it, with the
    // committed value rather than the typed one.
    state.commit();
  };

  const onPaste = (event: ClipboardEvent): void => {
    const input = event.target as HTMLInputElement;
    // Only a paste over the WHOLE field: anything else would need the new
    // string worked out from where the selection was, and a partial paste is
    // handled by the ordinary input path.
    if ((input.selectionEnd ?? -1) - (input.selectionStart ?? 0) !== input.value.length) return;
    event.preventDefault();
    state.commit(event.clipboardData?.getData("text/plain")?.trim() ?? "");
  };

  /** Focus the INPUT, not the button: a stepper is not a place to stand. */
  const onButtonPressStart = (event: PressEvent): void => {
    const input = access(options.inputRef) as HTMLInputElement | null;
    if (input === null) return;
    if (input.ownerDocument.activeElement === input) return;
    // Touch and screen readers keep focus on the button, so the software
    // keyboard does not appear and the reader's cursor does not jump.
    if (event.pointerType === "mouse") input.focus();
  };

  const fieldLabel = (): string => access(options.label) ?? access(options["aria-label"]) ?? "";

  return {
    labelProps,
    descriptionProps,
    errorMessageProps,
    validation,
    errors,
    isInvalid,
    groupProps: mergeProps(focusWithinProps, {
      role: "group",
      "aria-disabled": () => isDisabled() || undefined,
    }),
    inputProps: mergeProps(spinButtonProps, fieldProps, {
      onKeyDown,
      onBlur,
      onPaste,
      // No `role`: a `spinbutton` role makes VoiceOver refuse to put its
      // cursor in the field at all, and the value is announced by hand
      // instead.
      inputmode: inputMode,
      autocorrect: "off",
      spellcheck: "false",
    }),
    incrementButtonProps: mergeProps(incrementButtonProps, {
      "aria-label": () => access(options.incrementAriaLabel) ?? `Increase ${fieldLabel()}`.trim(),
      "aria-controls": inputId,
      excludeFromTabOrder: true,
      preventFocusOnPress: true,
      isDisabled: () => !state.canIncrement(),
      onPressStart: onButtonPressStart,
    }),
    decrementButtonProps: mergeProps(decrementButtonProps, {
      "aria-label": () => access(options.decrementAriaLabel) ?? `Decrease ${fieldLabel()}`.trim(),
      "aria-controls": inputId,
      excludeFromTabOrder: true,
      preventFocusOnPress: true,
      isDisabled: () => !state.canDecrement(),
      onPressStart: onButtonPressStart,
    }),
  };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

interface NumberFieldContextValue {
  state: NumberFieldState;
}

const NumberFieldContext = context<NumberFieldContextValue | null>(null);

export function useNumberField(): NumberFieldContextValue {
  const value = getContext(NumberFieldContext);
  if (value === null || value === undefined) {
    throw new Error("This must be rendered inside a NumberField.");
  }
  return value;
}

export interface NumberFieldComponentProps extends StyleProps {
  label?: string;
  description?: Child;
  errorMessage?: Child;
  value?: number | null;
  defaultValue?: number | null;
  minValue?: number;
  maxValue?: number;
  step?: number;
  formatOptions?: Intl.NumberFormatOptions;
  placeholder?: string;
  isDisabled?: boolean;
  isReadOnly?: boolean;
  isRequired?: boolean;
  isInvalid?: boolean;
  /** What the page thinks of the number, checked as it changes. */
  validate?: ValidateFunction<number>;
  /** @default "aria" */
  validationBehavior?: ValidationBehavior;
  isWheelDisabled?: boolean;
  name?: string;
  form?: string;
  autoFocus?: boolean;
  incrementAriaLabel?: string;
  decrementAriaLabel?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  ref?: RefTarget<HTMLInputElement>;
  onChange?: (value: number) => void;
}

/**
 * ```tsx
 * <NumberField label="Quantity" defaultValue={1} minValue={0} onChange={(n) => qty.set(n)} />
 * <NumberField label="Price" formatOptions={{ style: "currency", currency: "GBP" }} />
 * ```
 */
export function NumberField(props: Incoming<NumberFieldComponentProps>) {
  const inputRef = makeRef<HTMLInputElement>();
  const incrementRef = makeRef<HTMLButtonElement>();
  const decrementRef = makeRef<HTMLButtonElement>();

  const state = numberFieldState({
    value: () => props.value?.(),
    defaultValue: () => props.defaultValue?.(),
    minValue: () => props.minValue?.(),
    maxValue: () => props.maxValue?.(),
    step: () => props.step?.(),
    formatOptions: () => props.formatOptions?.(),
    isDisabled: () => props.isDisabled?.(),
    isReadOnly: () => props.isReadOnly?.(),
    onChange: (value) => props.onChange?.()?.(value),
  });

  const {
    labelProps,
    groupProps,
    inputProps,
    incrementButtonProps,
    decrementButtonProps,
    descriptionProps,
    errorMessageProps,
    errors,
    isInvalid,
  } = numberField(
    {
      inputRef,
      label: () => props.label?.(),
      name: () => props.name?.(),
      form: () => props.form?.(),
      validate: callback<[number], string | string[] | true | null | undefined>(props.validate),
      validationBehavior: () => props.validationBehavior?.(),
      minValue: () => props.minValue?.(),
      maxValue: () => props.maxValue?.(),
      formatOptions: () => props.formatOptions?.(),
      placeholder: () => props.placeholder?.(),
      isDisabled: () => props.isDisabled?.(),
      isReadOnly: () => props.isReadOnly?.(),
      isRequired: () => props.isRequired?.(),
      isInvalid: () => props.isInvalid?.(),
      isWheelDisabled: () => props.isWheelDisabled?.(),
      autoFocus: () => props.autoFocus?.(),
      incrementAriaLabel: () => props.incrementAriaLabel?.(),
      decrementAriaLabel: () => props.decrementAriaLabel?.(),
      "aria-label": () => props["aria-label"]?.(),
      "aria-labelledby": () => props["aria-labelledby"]?.(),
    },
    state,
  );

  const increment = button(incrementButtonProps, incrementRef);
  const decrement = button(decrementButtonProps, decrementRef);
  const { focusProps, isFocusVisible } = focusRing();
  const { hoverProps, isHovered } = hover({ isDisabled: () => props.isDisabled?.() });

  const owner = getOwner();
  if (owner !== null) install(owner, NumberFieldContext, () => ({ state }));

  const elementProps = mergeProps(groupProps, hoverProps, styleProps(props), {
    "data-hovered": isHovered,
    "data-disabled": () => props.isDisabled?.() === true,
    "data-invalid": isInvalid,
    "data-testid": () => props["data-testid"]?.(),
  });

  const inputElementProps = mergeProps(inputProps, focusProps, {
    name: () => props.name?.(),
    form: () => props.form?.(),
    "data-focus-visible": isFocusVisible,
  });

  return (
    <>
      <label {...labelProps}>{props.label}</label>
      <div {...elementProps}>
        <button
          {...decrement.buttonProps}
          type="button"
          data-pressed={decrement.isPressed}
          ref={decrementRef.set}
        >
          <span aria-hidden="true">−</span>
        </button>
        <input {...inputElementProps} ref={mergeRefs(inputRef.set, props.ref?.())} />
        <button
          {...increment.buttonProps}
          type="button"
          data-pressed={increment.isPressed}
          ref={incrementRef.set}
        >
          <span aria-hidden="true">+</span>
        </button>
      </div>
      <span {...descriptionProps}>{props.description}</span>
      <span {...errorMessageProps}>
        {() => {
          const given = props.errorMessage?.();
          if (given !== undefined && given !== null && given !== "") return given;
          const found = errors();
          return found.length === 0 ? null : found.join(" ");
        }}
      </span>
    </>
  );
}
