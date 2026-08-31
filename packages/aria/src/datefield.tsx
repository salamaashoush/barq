/**
 * A date field: one segment per part, in the locale's own order.
 *
 * Not `<input type="date">`, which cannot be styled, cannot be given a range
 * the browser will respect consistently, and shows the format the OS chose
 * rather than the one the page is in. And not a text box either: "03/04/2024"
 * is the 3rd of April in London and the 4th of March in New York, and a field
 * that asks the user to guess which will get both.
 *
 * So each part is its own segment, ordered and separated by
 * `Intl.DateTimeFormat.formatToParts`, and each is a spin button:
 *
 * - **Typing fills the segment and moves on.** Typing 4 in a month segment
 *   means April and jumps to the day, because no month starts with 4 that
 *   isn't 4. Typing 1 waits, because 1, 10, 11 and 12 all begin with it.
 * - **The arrows cycle within the segment.** December plus one is January of
 *   the SAME year: the user is editing the month, not the date.
 * - **An empty field is a PLACEHOLDER, not a value.** It shows a shape to fill
 *   in, and the field has no value at all until every segment is filled — a
 *   half-typed date is not a date, and reporting one would submit it.
 */

import {
  type Accessor,
  type Child,
  For,
  computed,
  context,
  effect,
  getContext,
  getOwner,
  type Incoming,
  isServer,
  provide,
  signal,
} from "@barqjs/core";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import {
  CalendarDate,
  CalendarDateTime,
  Time,
  getDaysInMonth,
  today,
  toCalendarDate,
  type DateValue,
} from "./date.ts";
import { focusRing } from "./focus.ts";
import { dateFormatter, useLocale } from "./i18n.ts";
import { hover } from "./interactions/hover.ts";
import type { ElementRef } from "./interactions/press.ts";
import { field, type FieldOptions } from "./label.ts";
import {
  fieldValidation,
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

// ---------------------------------------------------------------------------
// Segments
// ---------------------------------------------------------------------------

export type SegmentType =
  | "year"
  | "month"
  | "day"
  | "hour"
  | "minute"
  | "second"
  | "dayPeriod"
  | "literal";

export interface DateSegment {
  type: SegmentType;
  /** What it shows: the value, or the placeholder standing in for it. */
  text: string;
  value?: number;
  minValue?: number;
  maxValue?: number;
  /** Nothing has been typed here yet. */
  isPlaceholder: boolean;
  /** A separator is not a segment the user can stand in. */
  isEditable: boolean;
}

/** How much of a date the field asks for. */
export type Granularity = "day" | "hour" | "minute" | "second";

function segmentsFor(granularity: Granularity): SegmentType[] {
  const base: SegmentType[] = ["year", "month", "day"];
  if (granularity === "day") return base;
  if (granularity === "hour") return [...base, "hour", "dayPeriod"];
  if (granularity === "minute") return [...base, "hour", "minute", "dayPeriod"];
  return [...base, "hour", "minute", "second", "dayPeriod"];
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface DateFieldStateOptions {
  value?: MaybeAccessor<DateValue | null | undefined>;
  defaultValue?: MaybeAccessor<DateValue | null | undefined>;
  /** What an empty field's segments count from. @default today */
  placeholderValue?: MaybeAccessor<DateValue | undefined>;
  minValue?: MaybeAccessor<DateValue | null | undefined>;
  maxValue?: MaybeAccessor<DateValue | null | undefined>;
  /** @default "day" */
  granularity?: MaybeAccessor<Granularity | undefined>;
  /** 12- or 24-hour. Defaults to what the locale does. */
  hourCycle?: MaybeAccessor<12 | 24 | undefined>;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  isReadOnly?: MaybeAccessor<boolean | undefined>;
  isRequired?: MaybeAccessor<boolean | undefined>;
  onChange?: (value: DateValue | null) => void;
}

export interface DateFieldState {
  value: Accessor<DateValue | null>;
  setValue(value: DateValue | null): void;
  /** The display value: the real one, or the placeholder standing in. */
  displayValue: Accessor<CalendarDateTime>;
  segments: Accessor<DateSegment[]>;
  granularity: Accessor<Granularity>;
  isDisabled: Accessor<boolean>;
  isReadOnly: Accessor<boolean>;
  isRequired: Accessor<boolean>;
  /** Every editable segment has been filled, so the field HAS a value. */
  isComplete: Accessor<boolean>;
  increment(type: SegmentType): void;
  decrement(type: SegmentType): void;
  incrementPage(type: SegmentType): void;
  decrementPage(type: SegmentType): void;
  setSegment(type: SegmentType, value: number): void;
  clearSegment(type: SegmentType): void;
  clear(): void;
  /** What a formatted value reads as, for a screen reader. */
  formatValue(options?: Intl.DateTimeFormatOptions): string;
  /** What `minValue` and `maxValue` make of the value, or `undefined`. */
  rangeValidation: Accessor<ValidationResult | undefined>;
}

const PAGE: Partial<Record<SegmentType, number>> = {
  year: 5,
  month: 3,
  day: 7,
  hour: 2,
  minute: 15,
  second: 15,
};

export function dateFieldState(options: DateFieldStateOptions): DateFieldState {
  const locale = useLocale();

  const granularity = (): Granularity => access(options.granularity) ?? "day";
  const isDisabled = (): boolean => access(options.isDisabled) === true;
  const isReadOnly = (): boolean => access(options.isReadOnly) === true;

  const [value, setValueRaw] = controllable<DateValue | null>(
    () => access(options.value),
    () => access(options.defaultValue) ?? null,
    options.onChange,
  );

  /** Which segments the user has actually filled in. */
  const filled = signal<Set<SegmentType>>(
    new Set(value() === null ? [] : segmentsFor(granularity())),
  );

  const placeholder = computed(() => {
    const given = access(options.placeholderValue);
    if (given !== undefined) {
      return given instanceof CalendarDateTime ? given : CalendarDateTime.from(given);
    }
    return CalendarDateTime.from(today(), new Time());
  });

  /**
   * What the segments are edited INTO while the field has no value yet.
   *
   * Typing a month into an empty field has to be remembered somewhere: the
   * value stays null until every segment is filled, and without this the
   * month would be written and immediately thrown away.
   */
  const draft = signal<CalendarDateTime>(placeholder());

  /** What the field SHOWS: the value if it has one, the draft if not. */
  const displayValue = computed(() => {
    const current = value();
    if (current !== null) {
      return current instanceof CalendarDateTime ? current : CalendarDateTime.from(current);
    }
    return draft();
  });

  const wanted = (): SegmentType[] => segmentsFor(granularity());

  const isComplete = (): boolean => {
    const marked = filled();
    return wanted().every((type) => type === "dayPeriod" || marked.has(type));
  };

  /**
   * The value written back, but only once the whole field is filled.
   *
   * A half-typed date is not a date. Reporting one would put the 1st of
   * whatever month happens to be showing into the form.
   */
  const commit = (next: CalendarDateTime, marked: Set<SegmentType>): void => {
    filled.set(marked);
    draft.set(next);
    const complete = wanted().every((type) => type === "dayPeriod" || marked.has(type));
    if (!complete) {
      if (value() !== null) setValueRaw(null);
      return;
    }
    setValueRaw(granularity() === "day" ? next.date : next);
  };

  const hourCycle = (): 12 | 24 => {
    const given = access(options.hourCycle);
    if (given !== undefined) return given;
    const parts = new Intl.DateTimeFormat(locale().locale, { hour: "numeric" }).formatToParts(
      new Date(2024, 0, 1, 13),
    );
    return parts.some((part) => part.type === "dayPeriod") ? 12 : 24;
  };

  const limitsFor = (type: SegmentType, at: CalendarDateTime): { min: number; max: number } => {
    switch (type) {
      case "year":
        return { min: 1, max: 9999 };
      case "month":
        return { min: 1, max: 12 };
      case "day":
        return { min: 1, max: getDaysInMonth(at.year, at.month) };
      case "hour":
        return hourCycle() === 12 ? { min: 1, max: 12 } : { min: 0, max: 23 };
      case "minute":
      case "second":
        return { min: 0, max: 59 };
      case "dayPeriod":
        return { min: 0, max: 12 };
      default:
        return { min: 0, max: 0 };
    }
  };

  const format = computed(() => {
    const parts: Intl.DateTimeFormatOptions = { year: "numeric", month: "2-digit", day: "2-digit" };
    const level = granularity();
    if (level !== "day") {
      parts.hour = "2-digit";
      parts.hour12 = hourCycle() === 12;
      if (level !== "hour") parts.minute = "2-digit";
      if (level === "second") parts.second = "2-digit";
    }
    return dateFormatter(parts)();
  });

  const segments = computed((): DateSegment[] => {
    const at = displayValue();
    const marked = filled();
    const parts = format().formatToParts(at.toDate());

    return parts
      .filter((part) =>
        ["year", "month", "day", "hour", "minute", "second", "dayPeriod", "literal"].includes(
          part.type,
        ),
      )
      .map((part): DateSegment => {
        const type = part.type as SegmentType;
        if (type === "literal") {
          return { type, text: part.value, isPlaceholder: false, isEditable: false };
        }

        const isPlaceholder = type !== "dayPeriod" && !marked.has(type);
        const limits = limitsFor(type, at);
        const numeric =
          type === "dayPeriod" ? (at.hour >= 12 ? 12 : 0) : Number.parseInt(part.value, 10);

        return {
          type,
          // A placeholder shows the SHAPE: "mm" is a month to fill in, and a
          // month that happens to read as today's is a value the user never
          // typed.
          text: isPlaceholder ? placeholderText(type, part.value.length) : part.value,
          value: isPlaceholder ? undefined : numeric,
          minValue: limits.min,
          maxValue: limits.max,
          isPlaceholder,
          isEditable: true,
        };
      });
  });

  const withSegment = (type: SegmentType, next: number): CalendarDateTime => {
    const at = displayValue();
    if (type === "dayPeriod") {
      const hour = at.hour % 12;
      return at.set({ hour: next >= 12 ? hour + 12 : hour });
    }
    return at.set({ [type]: next });
  };

  const step = (type: SegmentType, amount: number, page: boolean): void => {
    if (isDisabled() || isReadOnly() || type === "literal") return;

    const at = displayValue();
    const marked = new Set(filled());

    if (type === "dayPeriod") {
      // AM and PM are the only two, so either arrow flips it.
      const hour = at.hour;
      commit(at.set({ hour: hour >= 12 ? hour - 12 : hour + 12 }), marked);
      return;
    }

    marked.add(type);

    // From a placeholder, the first press takes the value as it stands rather
    // than stepping off it: the user asked for "this month", not "next".
    if (filled().has(type)) {
      const size = page ? (PAGE[type] ?? 1) : 1;
      commit(at.cycle(type, amount * size, { round: page }), marked);
      return;
    }
    commit(at, marked);
  };

  if (!isServer) {
    // A value arriving from OUTSIDE fills the field, and one taken away
    // empties it back to the placeholder.
    effect(() => {
      const current = value();
      if (current === null) return;
      draft.set(current instanceof CalendarDateTime ? current : CalendarDateTime.from(current));
      filled.set(new Set(wanted()));
    });
  }

  /**
   * What the RANGE makes of the value.
   *
   * A date field has no native control for the browser to check, so `minValue`
   * and `maxValue` would otherwise be documentation: the segments would accept
   * a date outside them and nothing would say so. This is the equivalent of
   * `rangeUnderflow` and `rangeOverflow` for a field the browser cannot see,
   * and it reaches the user through `formValidationState`'s builtin slot.
   */
  const rangeValidation = (): ValidationResult | undefined => {
    const current = value();
    if (current === null) return undefined;

    const min = access(options.minValue);
    const max = access(options.maxValue);
    const under = min !== null && min !== undefined && current.compare(min) < 0;
    const over = max !== null && max !== undefined && current.compare(max) > 0;
    if (!under && !over) return undefined;

    return {
      isInvalid: true,
      validationErrors: [
        under
          ? "The date is before the earliest one allowed."
          : "The date is after the latest one allowed.",
      ],
      validationDetails: {
        badInput: false,
        customError: false,
        patternMismatch: false,
        rangeOverflow: over,
        rangeUnderflow: under,
        stepMismatch: false,
        tooLong: false,
        tooShort: false,
        typeMismatch: false,
        valueMissing: false,
        valid: false,
      },
    };
  };

  return {
    value,
    rangeValidation,
    displayValue,
    segments,
    granularity,
    isDisabled,
    isReadOnly,
    isRequired: () => access(options.isRequired) === true,
    isComplete,
    setValue: (next) => {
      setValueRaw(next);
      filled.set(new Set(next === null ? [] : wanted()));
    },
    increment: (type) => step(type, 1, false),
    decrement: (type) => step(type, -1, false),
    incrementPage: (type) => step(type, 1, true),
    decrementPage: (type) => step(type, -1, true),
    setSegment: (type, next) => {
      if (isDisabled() || isReadOnly()) return;
      const marked = new Set(filled());
      marked.add(type);
      commit(withSegment(type, next), marked);
    },
    clearSegment: (type) => {
      if (isDisabled() || isReadOnly()) return;
      const marked = new Set(filled());
      marked.delete(type);
      commit(displayValue(), marked);
    },
    clear: () => {
      if (isDisabled() || isReadOnly()) return;
      filled.set(new Set());
      setValueRaw(null);
    },
    formatValue: (formatOptions) => {
      const current = value();
      if (current === null) return "";
      return dateFormatter(
        formatOptions ?? { dateStyle: granularity() === "day" ? "long" : "long" },
      )().format(toCalendarDate(current).toDate());
    },
  };
}

/** The shape a segment shows before anything is typed into it. */
function placeholderText(type: SegmentType, width: number): string {
  const letters: Record<string, string> = {
    year: "y",
    month: "m",
    day: "d",
    hour: "h",
    minute: "m",
    second: "s",
    dayPeriod: "AM",
  };
  if (type === "dayPeriod") return "AM";
  return (letters[type] ?? "-").repeat(Math.max(width, 2));
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export interface DateFieldOptions extends FieldOptions {
  ref: ElementRef;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  isReadOnly?: MaybeAccessor<boolean | undefined>;
  isRequired?: MaybeAccessor<boolean | undefined>;
  name?: MaybeAccessor<string | undefined>;
  /** What the page thinks of the date, checked as it changes. */
  validate?: ValidateFunction<DateValue | null>;
  /** @default "aria" */
  validationBehavior?: MaybeAccessor<ValidationBehavior | undefined>;
}

export interface DateFieldResult {
  labelProps: DOMProps;
  /** For the element holding the segments. */
  fieldProps: DOMProps;
  descriptionProps: DOMProps;
  errorMessageProps: DOMProps;
  /** For a hidden input carrying the value into a form. */
  inputProps: DOMProps;
  /** What is wrong with the date, and whether the user is being told. */
  validation: FormValidationState;
  errors: Accessor<string[]>;
  isInvalid: Accessor<boolean>;
}

export function dateField(options: DateFieldOptions, state: DateFieldState): DateFieldResult {
  const {
    state: validation,
    isInvalid,
    errors,
    errorMessage,
  } = fieldValidation<DateValue | null>({
    value: state.value,
    builtinValidation: state.rangeValidation,
    validate: options.validate,
    validationBehavior: options.validationBehavior,
    isInvalid: options.isInvalid,
    errorMessage: options.errorMessage,
    name: options.name,
  });

  const {
    labelProps,
    fieldProps: labelledProps,
    descriptionProps,
    errorMessageProps,
  } = field({ ...options, isInvalid, errorMessage, labelElementType: "span" });

  return {
    labelProps,
    descriptionProps,
    errorMessageProps,
    validation,
    errors,
    isInvalid,
    fieldProps: mergeProps(filterDOMProps(options, { labelable: true }), labelledProps, {
      // A group, because the segments are separate controls that together are
      // one field: `role="textbox"` would promise editing the whole string.
      role: "group",
      "aria-disabled": () => state.isDisabled() || undefined,
      "aria-invalid": () => isInvalid() || undefined,
      "aria-required": () => access(options.isRequired) === true || undefined,
      "aria-describedby": () => access(options["aria-describedby"]),
      // A date is committed segment by segment, so a blur is the first moment
      // the whole value is worth judging.
      onFocusOut: () => validation.commitValidation(),
    }),
    inputProps: {
      type: "hidden",
      name: () => access(options.name),
      value: () => state.value()?.toString() ?? "",
    },
  };
}

export interface DateSegmentOptions {
  segment: Accessor<DateSegment>;
  ref: ElementRef;
}

export interface DateSegmentResult {
  segmentProps: DOMProps;
}

export function dateSegment(options: DateSegmentOptions, state: DateFieldState): DateSegmentResult {
  const segment = (): DateSegment => options.segment();

  /**
   * What has been typed into this segment since focus arrived.
   *
   * Kept here rather than in the state, because it is not part of the value:
   * a segment left half typed shows what was typed and commits nothing more.
   */
  let entered = "";

  const isEditable = (): boolean =>
    segment().isEditable && !state.isDisabled() && !state.isReadOnly();

  const onKeyDown = (event: KeyboardEvent): void => {
    const current = segment();
    if (!current.isEditable) return;

    switch (event.key) {
      case "ArrowUp":
        event.preventDefault();
        if (isEditable()) state.increment(current.type);
        entered = "";
        return;
      case "ArrowDown":
        event.preventDefault();
        if (isEditable()) state.decrement(current.type);
        entered = "";
        return;
      case "PageUp":
        event.preventDefault();
        if (isEditable()) state.incrementPage(current.type);
        entered = "";
        return;
      case "PageDown":
        event.preventDefault();
        if (isEditable()) state.decrementPage(current.type);
        entered = "";
        return;
      case "Home":
        event.preventDefault();
        if (isEditable() && current.minValue !== undefined) {
          state.setSegment(current.type, current.minValue);
        }
        entered = "";
        return;
      case "End":
        event.preventDefault();
        if (isEditable() && current.maxValue !== undefined) {
          state.setSegment(current.type, current.maxValue);
        }
        entered = "";
        return;
      case "Backspace":
      case "Delete":
        event.preventDefault();
        if (isEditable()) state.clearSegment(current.type);
        entered = "";
        return;
      case "ArrowLeft":
      case "ArrowRight":
        // The caret is between SEGMENTS, so moving it is moving focus.
        event.preventDefault();
        moveFocus(event.key === "ArrowRight" ? 1 : -1);
        return;
      default:
        break;
    }

    if (!isEditable()) return;

    if (current.type === "dayPeriod") {
      const letter = event.key.toLowerCase();
      if (letter !== "a" && letter !== "p") return;
      event.preventDefault();
      const hour = state.displayValue().hour % 12;
      state.setSegment("hour", letter === "p" ? hour + 12 : hour);
      moveFocus(1);
      return;
    }

    if (!/^\d$/.test(event.key)) return;
    event.preventDefault();

    const max = current.maxValue ?? 9999;
    const typed = Number.parseInt(`${entered}${event.key}`, 10);

    if (typed > max) {
      // Too big with what came before, so this digit starts a fresh number.
      entered = event.key;
      const alone = Number.parseInt(event.key, 10);
      state.setSegment(current.type, Math.min(Math.max(alone, current.minValue ?? 0), max));
      return;
    }

    entered += event.key;
    state.setSegment(current.type, typed);

    // On to the next when no further digit could belong here: typing 4 into a
    // month means April, and waiting for a second digit that cannot come
    // would make every date twice the keystrokes.
    if (typed * 10 > max || entered.length >= String(max).length) {
      entered = "";
      moveFocus(1);
    }
  };

  /** The next or previous editable segment, in the DOM. */
  const moveFocus = (by: 1 | -1): void => {
    const element = access(options.ref) as HTMLElement | null;
    const container = element?.closest('[role="group"]');
    if (element === null || container === null || container === undefined) return;
    const all = [...container.querySelectorAll<HTMLElement>('[role="spinbutton"]')];
    const at = all.indexOf(element);
    const next = all[at + by];
    if (next !== undefined) next.focus();
  };

  const label = (): string => {
    const names: Record<string, string> = {
      year: "year",
      month: "month",
      day: "day",
      hour: "hour",
      minute: "minute",
      second: "second",
      dayPeriod: "AM/PM",
    };
    return names[segment().type] ?? segment().type;
  };

  return {
    segmentProps: {
      role: () => (segment().isEditable ? "spinbutton" : undefined),
      "aria-hidden": () => (segment().isEditable ? undefined : true),
      "aria-label": () => (segment().isEditable ? label() : undefined),
      "aria-valuenow": () => segment().value,
      "aria-valuemin": () => (segment().isEditable ? segment().minValue : undefined),
      "aria-valuemax": () => (segment().isEditable ? segment().maxValue : undefined),
      // What the number MEANS: an empty segment reads as "empty" rather than
      // as the placeholder letters.
      "aria-valuetext": () =>
        segment().isEditable ? (segment().isPlaceholder ? "Empty" : segment().text) : undefined,
      "aria-disabled": () => (state.isDisabled() ? true : undefined),
      "aria-readonly": () => (state.isReadOnly() ? true : undefined),
      contentEditable: false,
      inputMode: () => (segment().type === "dayPeriod" ? "text" : "numeric"),
      tabIndex: () => (segment().isEditable && !state.isDisabled() ? 0 : undefined),
      onKeyDown,
      onFocus: () => {
        entered = "";
      },
      onBlur: () => {
        entered = "";
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

interface DateFieldContextValue {
  state: DateFieldState;
}

const DateFieldContext = context<DateFieldContextValue | null>(null);

export function useDateField(): DateFieldContextValue {
  const value = getContext(DateFieldContext);
  if (value === null || value === undefined) {
    throw new Error("A DateSegment must be rendered inside a DateField.");
  }
  return value;
}

function DateFieldProvider(props: Incoming<{ value: DateFieldContextValue; children?: Child }>) {
  const owner = getOwner();
  if (owner === null) return <>{props.children}</>;
  return provide(
    owner,
    DateFieldContext,
    () => props.value(),
    () => props.children as unknown,
  ) as never;
}

export interface DateFieldComponentProps extends StyleProps {
  label?: Child;
  description?: Child;
  errorMessage?: Child;
  value?: DateValue | null;
  defaultValue?: DateValue | null;
  placeholderValue?: DateValue;
  minValue?: DateValue | null;
  maxValue?: DateValue | null;
  /** @default "day" */
  granularity?: Granularity;
  hourCycle?: 12 | 24;
  isDisabled?: boolean;
  isReadOnly?: boolean;
  isRequired?: boolean;
  isInvalid?: boolean;
  /** What the page thinks of the date, checked as it changes. */
  validate?: ValidateFunction<DateValue | null>;
  /** @default "aria" */
  validationBehavior?: ValidationBehavior;
  name?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  ref?: RefTarget<HTMLDivElement>;
  onChange?: (value: DateValue | null) => void;
}

/**
 * ```tsx
 * <DateField label="Departure" value={date()} onChange={date.set} />
 * <DateField label="Starts" granularity="minute" />
 * ```
 */
export function DateField(props: Incoming<DateFieldComponentProps>) {
  const domRef = makeRef<HTMLDivElement>();

  const state = dateFieldState({
    value: () => props.value?.(),
    defaultValue: () => props.defaultValue?.(),
    placeholderValue: () => props.placeholderValue?.(),
    minValue: () => props.minValue?.(),
    maxValue: () => props.maxValue?.(),
    granularity: () => props.granularity?.(),
    hourCycle: () => props.hourCycle?.(),
    isDisabled: () => props.isDisabled?.(),
    isReadOnly: () => props.isReadOnly?.(),
    isRequired: () => props.isRequired?.(),
    onChange: (value) => props.onChange?.()?.(value),
  });

  const {
    labelProps,
    fieldProps,
    descriptionProps,
    errorMessageProps,
    inputProps,
    errors,
    isInvalid,
  } = dateField(
    {
      ref: domRef,
      validate: callback<[DateValue | null], string | string[] | true | null | undefined>(
        props.validate,
      ),
      validationBehavior: () => props.validationBehavior?.(),
      label: () => props.label?.(),
      description: () => props.description?.(),
      errorMessage: () => props.errorMessage?.(),
      isDisabled: () => props.isDisabled?.(),
      isReadOnly: () => props.isReadOnly?.(),
      isRequired: () => props.isRequired?.(),
      isInvalid: () => props.isInvalid?.(),
      name: () => props.name?.(),
      "aria-label": () => props["aria-label"]?.(),
      "aria-labelledby": () => props["aria-labelledby"]?.(),
    },
    state,
  );

  const elementProps = mergeProps(
    fieldProps,
    filterDOMProps(fromProps(props), { global: true }),
    styleProps(props),
    {
      "data-disabled": () => props.isDisabled?.() === true,
      "data-invalid": isInvalid,
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  return (
    <DateFieldProvider value={{ state }}>
      <span {...labelProps}>{props.label}</span>
      <div {...elementProps} ref={mergeRefs(domRef.set, props.ref?.())}>
        {/* Keyed by INDEX, not by the segment: a new object every read would
            rebuild every element on every keystroke, and the one holding
            focus would be destroyed under the user. */}
        <For each={() => state.segments().map((_, at) => at)}>
          {(at: number) => <DateSegmentPart index={at} />}
        </For>
      </div>
      {() => (props.name?.() === undefined ? null : <input {...inputProps} />)}
      <span {...descriptionProps}>{props.description}</span>
      <span {...errorMessageProps}>
        {() => {
          const given = props.errorMessage?.();
          if (given !== undefined && given !== null && given !== "") return given;
          const found = errors();
          return found.length === 0 ? null : found.join(" ");
        }}
      </span>
    </DateFieldProvider>
  );
}

interface DateSegmentPartProps {
  index: number;
}

/** One segment. Its own component so it keeps its element as the value moves. */
function DateSegmentPart(props: Incoming<DateSegmentPartProps>) {
  const domRef = makeRef<HTMLDivElement>();
  const { state } = useDateField();
  const index = props.index();

  const segment = (): DateSegment =>
    state.segments()[index] ?? {
      type: "literal",
      text: "",
      isPlaceholder: false,
      isEditable: false,
    };

  const { segmentProps } = dateSegment({ segment, ref: domRef }, state);
  const { hoverProps, isHovered } = hover({ isDisabled: state.isDisabled });
  const { focusProps, isFocusVisible } = focusRing();

  const elementProps = mergeProps(segmentProps, hoverProps, focusProps, {
    "data-type": () => segment().type,
    "data-placeholder": () => segment().isPlaceholder,
    "data-focus-visible": isFocusVisible,
    "data-hovered": isHovered,
  });

  return (
    <div {...elementProps} ref={domRef.set}>
      {() => segment().text}
    </div>
  );
}

export interface TimeFieldComponentProps extends Omit<
  DateFieldComponentProps,
  "granularity" | "value" | "defaultValue" | "onChange" | "validate"
> {
  value?: Time | null;
  defaultValue?: Time | null;
  /** @default "minute" */
  granularity?: "hour" | "minute" | "second";
  /** What the page thinks of the TIME, not of the date standing behind it. */
  validate?: ValidateFunction<Time | null>;
  onChange?: (value: Time | null) => void;
}

/**
 * A time on its own.
 *
 * The same segments without the date ones, so a meeting time is a field the
 * user fills rather than a string they format.
 */
export function TimeField(props: Incoming<TimeFieldComponentProps>) {
  const day = today();

  return (
    <DateField
      label={props.label?.()}
      description={props.description?.()}
      errorMessage={props.errorMessage?.()}
      granularity={props.granularity?.() ?? "minute"}
      hourCycle={props.hourCycle?.()}
      isDisabled={props.isDisabled?.()}
      isReadOnly={props.isReadOnly?.()}
      isRequired={props.isRequired?.()}
      isInvalid={props.isInvalid?.()}
      validationBehavior={props.validationBehavior?.()}
      validate={(value: DateValue | null) => {
        const check = callback<[Time | null], string | string[] | true | null | undefined>(
          props.validate,
        );
        if (check === undefined) return null;
        return check(value === null ? null : (value as CalendarDateTime).time);
      }}
      aria-label={props["aria-label"]?.()}
      aria-labelledby={props["aria-labelledby"]?.()}
      class={props.class?.() ?? props.className?.()}
      data-testid={props["data-testid"]?.()}
      value={(() => {
        const time = props.value?.();
        if (time === undefined) return undefined;
        return time === null ? null : CalendarDateTime.from(day, time);
      })()}
      defaultValue={(() => {
        const time = props.defaultValue?.();
        if (time === undefined) return undefined;
        return time === null ? null : CalendarDateTime.from(day, time);
      })()}
      onChange={(value) => {
        props.onChange?.()?.(value === null ? null : (value as CalendarDateTime).time);
      }}
    />
  );
}

export { CalendarDate, CalendarDateTime, Time };
