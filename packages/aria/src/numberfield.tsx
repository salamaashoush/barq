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
  cells,
  type Accessor,
  type Child,
  flush,
  createMemo,
  createContext,
  createEffect,
  getContext,
  getOwner,
  install,
  createSignal,
} from "@barqjs/core";
import { isServer } from "@barqjs/web";
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
  access,
  callback,
  clamp,
  controllable,
  type DOMProps,
  filterDOMProps,
  fromProps,
  id,
  type MaybeAccessor,
  mergeProps,
  snapValueToStep,
  type StyleProps,
  styleProps,
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

  const [inputValue, writeInputValue] = createSignal(asText(numberValue()));

  // What the LAST write produced, so a keystroke reads its own change back
  // rather than the value a controlled owner has not caught up with yet.
  let live = numberValue();

  if (!isServer) {
    // The number changing from OUTSIDE reformats the field. A change the field
    // made itself is already in it, as typed.
    createEffect(
      () => [numberValue(), asText(numberValue())] as const,
      ([value, text]) => {
        if (value === live) return;
        live = value;
        writeInputValue(text);
      },
    );
  }

  const parsed = createMemo(() => parser().parse(inputValue()));

  const setNumberValue = (value: number): void => {
    live = value;
    setNumberValueRaw(value);
    writeInputValue(asText(value));
  };

  const commit = (override?: string): void => {
    const text = override ?? inputValue();
    // A controlled owner has not taken the new value yet, so the field shows
    // what it holds now and `live` stays on it: when the owner does take the
    // value, the effect sees it arrive and reformats; when it refuses, the
    // field already shows what it kept.
    const isControlled = access(options.value) !== undefined;

    if (text.length === 0) {
      if (!isControlled) live = Number.NaN;
      setNumberValueRaw(Number.NaN);
      writeInputValue(isControlled ? asText(numberValue()) : "");
      return;
    }

    const value = override === undefined ? parsed() : parser().parse(override);
    if (Number.isNaN(value)) {
      // Not a number after all: the field goes back to what it holds rather
      // than keeping text that means nothing.
      writeInputValue(asText(numberValue()));
      return;
    }

    // Formatted and read back, so the value IS what the field will show: a
    // field displaying two decimal places holds two decimal places.
    const clamped = parser().parse(asText(snaps() ? snap(value) : value));
    if (!isControlled) live = clamped;
    setNumberValueRaw(clamped);
    writeInputValue(asText(isControlled ? numberValue() : clamped));
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
    setInputValue: (value) => writeInputValue(value),
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
  let focused = false;

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
    // not queue up thirty values to read out in turn. Only while the field or
    // one of its steppers has focus: a value set from elsewhere on the page
    // is not something the user is doing, and interrupts whatever they are.
    createEffect(
      () => [access(options.textValue), access(options.value)] as const,
      ([textValue, value]) => {
        if (!focused) return;
        const text = textValue ?? String(value ?? "");
        // A hyphen-minus between a currency symbol and a number is read as a
        // hyphen and swallowed; the real minus sign is announced.
        const spoken = text === "" ? "Empty" : text.replace("-", "−");
        clearAnnouncer("assertive");
        announce(spoken, "assertive");
      },
    );
  }

  const onFocus = (): void => {
    focused = true;
  };
  const onBlur = (): void => {
    focused = false;
  };

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
    onPressUp: (event: { pointerType: string }) => void;
    onPressEnd: (event: { pointerType: string }) => void;
    onFocus: () => void;
    onBlur: () => void;
  } => {
    let held = false;
    let spun = false;
    // A touch that ends without lifting the finger over the button (it moved
    // off to scroll, and the browser cancelled the pointer) is not a press.
    let lifted = false;
    return {
      onPressStart: (event) => {
        stop();
        spun = false;
        lifted = false;
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
      onPressUp: () => {
        lifted = true;
      },
      onPressEnd: () => {
        stop();
        if (held && lifted && !spun && enabled()) act();
        held = false;
        lifted = false;
      },
      onFocus,
      onBlur,
    };
  };

  return {
    spinButtonProps: { onKeyDown, onFocus, onBlur },
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
  step?: MaybeAccessor<number | undefined>;
  /**
   * What the state does with a value off the range or the step. Under
   * `"validate"` it is kept, and this marks the field invalid with the
   * browser's own message for it.
   *
   * @default "snap"
   */
  commitBehavior?: MaybeAccessor<"snap" | "validate" | undefined>;
  /** Stop the scroll wheel changing the value. @default false */
  isWheelDisabled?: MaybeAccessor<boolean | undefined>;
  incrementAriaLabel?: MaybeAccessor<string | undefined>;
  decrementAriaLabel?: MaybeAccessor<string | undefined>;
  /**
   * The field's visible label. Text also names the stepper buttons; markup
   * cannot, so they fall back to `aria-label`.
   */
  label?: MaybeAccessor<Child>;
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

  /**
   * What the browser would say about this number, when the state kept it off
   * the range or the step rather than snapping it.
   *
   * Asked of an `<input type="number">` that is never attached, so the
   * message is the browser's, in the browser's language. With no `step` any
   * value is on it: a field with decimals and no step holds 1.5 when snapping,
   * and must not call it invalid when validating.
   */
  const outOfRange = (value: number): string[] => {
    if (isServer || access(options.commitBehavior) !== "validate" || Number.isNaN(value)) {
      return [];
    }
    const probe = rangeProbe();
    const min = access(options.minValue);
    const max = access(options.maxValue);
    const size = access(options.step);
    probe.min = min === undefined || Number.isNaN(min) ? "" : String(min);
    probe.max = max === undefined || Number.isNaN(max) ? "" : String(max);
    probe.step = size === undefined || Number.isNaN(size) ? "any" : String(size);
    probe.value = String(value);
    return probe.validity.valid ? [] : [probe.validationMessage];
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
        options.validate === undefined && options.commitBehavior === undefined
          ? undefined
          : () => {
              const value = state.numberValue();
              const own = options.validate?.(value);
              const found = [
                ...(own === true || own === null || own === undefined ? [] : [own].flat()),
                ...outOfRange(value),
              ];
              return found.length === 0 ? null : found;
            },
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

  // What the validation is told is left to the text field, which commits it
  // only for an edit: tabbing through must not clear a server's error.
  const onBlur = (): void => state.commit();

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Enter" || isDisabled() || isReadOnly()) return;
    // Not prevented: a number field inside a form still submits it, with the
    // committed value rather than the typed one. The submit reads the form
    // as soon as this handler returns, so the commit is applied now rather
    // than at the next flush.
    state.commit();
    flush();
    validation.commitValidation();
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

  const fieldLabel = (): string => {
    const given = access(options.label);
    return (typeof given === "string" ? given : undefined) ?? access(options["aria-label"]) ?? "";
  };

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
      // The typed text is not the value. A form gets the number from a hidden
      // input of its own; the name stays on the options for server errors.
      name: () => undefined,
      form: () => undefined,
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

let probeInput: HTMLInputElement | null = null;

function rangeProbe(): HTMLInputElement {
  if (probeInput === null) {
    probeInput = document.createElement("input");
    probeInput.type = "number";
  }
  return probeInput;
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

interface NumberFieldContextValue {
  state: NumberFieldState;
}

const NumberFieldContext = createContext<NumberFieldContextValue | null>(null);

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
  /**
   * Whether committing snaps to the range and the step, or leaves the value
   * as typed and marks it invalid.
   *
   * @default "snap"
   */
  commitBehavior?: "snap" | "validate";
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
  /** On the `<input>`, which carries `data-slot="number-field-input"`. */
  inputClass?: string;
  /** On both stepper buttons, which carry `data-slot="number-field-decrement"` and `"number-field-increment"`. */
  stepperClass?: string;
  /** What the buttons show. Named by their labels either way. @default "+" and "−" */
  incrementIcon?: Child;
  decrementIcon?: Child;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  /** Read after the field's own description and error, for a label and help drawn elsewhere. */
  "aria-describedby"?: string;
  ref?: RefTarget<HTMLInputElement>;
  onChange?: (value: number) => void;
}

/**
 * ```tsx
 * <NumberField label="Quantity" defaultValue={1} minValue={0} onChange={(n) => qty.set(n)} />
 * <NumberField label="Price" formatOptions={{ style: "currency", currency: "GBP" }} />
 * ```
 */
export function NumberField(props: NumberFieldComponentProps) {
  const inputRef = makeRef<HTMLInputElement>();
  const incrementRef = makeRef<HTMLButtonElement>();
  const decrementRef = makeRef<HTMLButtonElement>();

  const state = numberFieldState({
    value: () => props.value,
    defaultValue: () => props.defaultValue,
    minValue: () => props.minValue,
    maxValue: () => props.maxValue,
    step: () => props.step,
    formatOptions: () => props.formatOptions,
    commitBehavior: () => props.commitBehavior,
    isDisabled: () => props.isDisabled,
    isReadOnly: () => props.isReadOnly,
    onChange: (value) => props.onChange?.(value),
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
      label: () => props.label,
      description: () => props.description,
      errorMessage: () => props.errorMessage,
      name: () => props.name,
      form: () => props.form,
      validate: callback<[number], string | string[] | true | null | undefined>(
        cells(props).validate,
      ),
      validationBehavior: () => props.validationBehavior,
      minValue: () => props.minValue,
      maxValue: () => props.maxValue,
      step: () => props.step,
      commitBehavior: () => props.commitBehavior,
      formatOptions: () => props.formatOptions,
      placeholder: () => props.placeholder,
      isDisabled: () => props.isDisabled,
      isReadOnly: () => props.isReadOnly,
      isRequired: () => props.isRequired,
      isInvalid: () => props.isInvalid,
      isWheelDisabled: () => props.isWheelDisabled,
      autoFocus: () => props.autoFocus,
      incrementAriaLabel: () => props.incrementAriaLabel,
      decrementAriaLabel: () => props.decrementAriaLabel,
      "aria-label": () => props["aria-label"],
      "aria-labelledby": () => props["aria-labelledby"],
      "aria-describedby": () => props["aria-describedby"],
    },
    state,
  );

  const increment = button(incrementButtonProps, incrementRef);
  const decrement = button(decrementButtonProps, decrementRef);
  const { focusProps, isFocusVisible } = focusRing();
  const { hoverProps, isHovered } = hover({ isDisabled: () => props.isDisabled });

  const owner = getOwner();
  if (owner !== null) install(owner, NumberFieldContext, () => ({ state }));

  const elementProps = mergeProps(
    groupProps,
    hoverProps,
    filterDOMProps(fromProps(cells(props)), { global: true }),
    styleProps(cells(props)),
    {
      "data-hovered": isHovered,
      "data-disabled": () => props.isDisabled === true,
      "data-readonly": () => props.isReadOnly === true,
      "data-required": () => props.isRequired === true,
      "data-invalid": isInvalid,
      "data-testid": () => props["data-testid"],
    },
  );

  const inputElementProps = mergeProps(inputProps, focusProps, {
    "data-focus-visible": isFocusVisible,
  });

  return (
    <>
      <label {...labelProps}>{props.label}</label>
      <div {...elementProps}>
        <button
          {...decrement.buttonProps}
          type="button"
          class={props.stepperClass}
          data-slot="number-field-decrement"
          data-pressed={decrement.isPressed}
          ref={decrementRef.set}
        >
          {props.decrementIcon ?? <span aria-hidden="true">−</span>}
        </button>
        <input
          {...inputElementProps}
          class={props.inputClass}
          data-slot="number-field-input"
          ref={mergeRefs(inputRef.set, props.ref)}
        />
        {() =>
          props.name === undefined ? null : (
            <input
              type="hidden"
              name={props.name}
              form={props.form}
              value={Number.isNaN(state.numberValue()) ? "" : String(state.numberValue())}
              disabled={props.isDisabled === true}
            />
          )
        }
        <button
          {...increment.buttonProps}
          type="button"
          class={props.stepperClass}
          data-slot="number-field-increment"
          data-pressed={increment.isPressed}
          ref={incrementRef.set}
        >
          {props.incrementIcon ?? <span aria-hidden="true">+</span>}
        </button>
      </div>
      <span {...descriptionProps}>{props.description}</span>
      <span {...errorMessageProps}>
        {() => {
          const given = props.errorMessage;
          if (given !== undefined && given !== null && given !== "") return given;
          const found = errors();
          return found.length === 0 ? null : found.join(" ");
        }}
      </span>
    </>
  );
}
