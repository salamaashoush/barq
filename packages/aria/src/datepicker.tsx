/**
 * A date picker: a date field, and a calendar behind a button.
 *
 * Both halves matter and neither is optional. The field is how anyone who
 * knows the date enters it — typing 03072024 is three seconds and reaching
 * into a calendar for a date six months out is thirty. The calendar is how
 * anyone who is choosing rather than recalling does it, and it is the only way
 * to see which days are available.
 *
 * So the field is the control, and the calendar is a popover the button opens:
 *
 * - **The button is not a Tab stop of its own** in the sense that matters: it
 *   is one, but it sits after the segments, so tabbing through a form goes
 *   month, day, year, calendar, next field.
 * - **Choosing a date closes the popover** and puts the value in the field,
 *   because the calendar exists to answer one question.
 * - **`aria-haspopup="dialog"`,** not `menu` or `listbox`: what opens is a
 *   dialog holding a grid, and saying otherwise makes a screen reader promise
 *   the wrong keys.
 */

import {
  cells,
  type Accessor,
  type CallSite,
  type Child,
  createContext,
  getContext,
  getOwner,
  install,
} from "@barqjs/core";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import { button } from "./button.tsx";
import { Calendar, type DateRange, RangeCalendar } from "./calendar.tsx";
import {
  type Calendar as CalendarSystem,
  type CalendarIdentifier,
  type DateValue,
  type MappedDateValue,
  Time,
  toCalendarDateTime,
  type TimeValue,
} from "./date.ts";
import { StringDictionary, stringFormatter } from "./i18n.ts";
import { Popover } from "./dialog.tsx";
import { focusRing } from "./focus.ts";
import { hover } from "./interactions/hover.ts";
import type { ElementRef } from "./interactions/press.ts";
import { field, type FieldOptions } from "./label.ts";
import {
  fieldValidation,
  type ValidateFunction,
  type ValidationBehavior,
  type ValidationResult,
} from "./validation.ts";
import {
  overlayTriggerState,
  type OverlayTriggerState,
  type OverlayTriggerStateOptions,
  type Placement,
} from "./overlays.ts";
import { DateField, type Granularity } from "./datefield.tsx";
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

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface DatePickerStateOptions<
  T extends DateValue = DateValue,
> extends OverlayTriggerStateOptions {
  value?: MaybeAccessor<T | null | undefined>;
  defaultValue?: MaybeAccessor<T | null | undefined>;
  /** What an empty picker counts from, and the time a chosen day takes. */
  placeholderValue?: MaybeAccessor<DateValue | null | undefined>;
  minValue?: MaybeAccessor<DateValue | null | undefined>;
  maxValue?: MaybeAccessor<DateValue | null | undefined>;
  /** Defaults to `"minute"` for a value with a time and `"day"` for one without. */
  granularity?: MaybeAccessor<Granularity | undefined>;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  isReadOnly?: MaybeAccessor<boolean | undefined>;
  onChange?: (value: NoInfer<MappedDateValue<T>> | null) => void;
}

export interface DatePickerState extends OverlayTriggerState {
  value: Accessor<DateValue | null>;
  setValue(value: DateValue | null): void;
  /**
   * A day chosen in the calendar. It arrives with the time and zone the value
   * already had, and a picker with a time gives a day without one the
   * placeholder's, or midnight.
   */
  setDateValue(date: DateValue | null): void;
  granularity: Accessor<Granularity>;
  isDisabled: Accessor<boolean>;
  isReadOnly: Accessor<boolean>;
}

/**
 * A day from the calendar as a value of the picker's granularity.
 *
 * The calendar keeps the time a value had, so only a day chosen while there
 * was none needs one: the placeholder's, zone and all, or midnight.
 */
function withTime(
  date: DateValue,
  granularity: Granularity,
  placeholder: DateValue | null | undefined,
): DateValue {
  if (granularity === "day" || "hour" in date) return date;
  const time: TimeValue =
    placeholder !== null && placeholder !== undefined && "hour" in placeholder
      ? placeholder
      : new Time();
  if ("timeZone" in time) {
    return time.set({ era: date.era, year: date.year, month: date.month, day: date.day });
  }
  return toCalendarDateTime(date, time);
}

/** What a value or its stand-in says the granularity is, when the caller did not. */
function defaultGranularity(model: DateValue | null | undefined): Granularity {
  return model !== null && model !== undefined && "minute" in model ? "minute" : "day";
}

export function datePickerState<T extends DateValue = DateValue>(
  options: DatePickerStateOptions<T>,
): DatePickerState {
  const overlay = overlayTriggerState(options);

  const [value, setValue] = controllable<DateValue | null>(
    () => access(options.value),
    () => access(options.defaultValue) ?? null,
    (next) => options.onChange?.(next as MappedDateValue<T> | null),
  );

  const granularity = (): Granularity =>
    access(options.granularity) ?? defaultGranularity(value() ?? access(options.placeholderValue));

  return {
    ...overlay,
    value,
    setValue,
    granularity,
    isDisabled: () => access(options.isDisabled) === true,
    isReadOnly: () => access(options.isReadOnly) === true,
    setDateValue: (date) => {
      if (date === null) {
        setValue(null);
        overlay.close();
        return;
      }
      setValue(
        withTime(
          date,
          granularity(),
          access(options.defaultValue) ?? access(options.placeholderValue),
        ),
      );
      overlay.close();
    },
  };
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export interface DatePickerOptions extends FieldOptions {
  ref: ElementRef;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  isReadOnly?: MaybeAccessor<boolean | undefined>;
  isRequired?: MaybeAccessor<boolean | undefined>;
}

export interface DatePickerResult {
  labelProps: DOMProps;
  /** For the element holding the field and the button. */
  groupProps: DOMProps;
  fieldProps: DOMProps;
  /** Options for {@link button}, not props for an element. */
  buttonProps: DOMProps;
  dialogProps: DOMProps;
  calendarProps: DOMProps;
  descriptionProps: DOMProps;
  errorMessageProps: DOMProps;
}

export function datePicker(options: DatePickerOptions, state: DatePickerState): DatePickerResult {
  const groupId = id();
  const buttonId = id();
  const dialogId = id();
  const messages = stringFormatter(PICKER_STRINGS);

  const {
    labelProps,
    fieldProps: labelledProps,
    descriptionProps,
    errorMessageProps,
  } = field({ ...options, labelElementType: "span" });

  return {
    descriptionProps,
    errorMessageProps,
    labelProps: mergeProps(labelProps, {
      // A `<span>` label cannot wrap the control, so clicking it has to move
      // focus by hand — to the first SEGMENT, which is where typing goes.
      onClick: () => {
        if (state.isDisabled()) return;
        const group = access(options.ref) as HTMLElement | null;
        group?.querySelector<HTMLElement>('[role="spinbutton"]')?.focus();
      },
    }),
    groupProps: mergeProps(filterDOMProps(options, { labelable: true }), labelledProps, {
      role: "group",
      id: groupId,
      "aria-disabled": () => state.isDisabled() || undefined,
      onKeyDown: (event: KeyboardEvent) =>
        opensOnAltArrow(event, state, state.isDisabled() || state.isReadOnly()),
    }),
    fieldProps: {
      "aria-labelledby": () => access(labelProps.id as MaybeAccessor<string | undefined>),
    },
    buttonProps: {
      id: buttonId,
      // What opens is a dialog holding a grid. `menu` would promise the arrow
      // keys move between menu items.
      "aria-haspopup": "dialog",
      "aria-expanded": () => state.isOpen(),
      "aria-controls": () => (state.isOpen() ? dialogId() : undefined),
      // Named by ITSELF and by the field, so it is announced as "Calendar,
      // Departure" rather than as one of a page of identical buttons.
      "aria-label": () => messages().format("calendar"),
      "aria-labelledby": () =>
        `${buttonId()} ${access(labelProps.id as MaybeAccessor<string | undefined>) ?? groupId()}`,
      isDisabled: () => state.isDisabled() || state.isReadOnly(),
      onPress: () => state.toggle(),
    },
    dialogProps: {
      id: dialogId,
      role: "dialog",
      "aria-labelledby": () =>
        access(labelProps.id as MaybeAccessor<string | undefined>) ?? groupId(),
    },
    calendarProps: {
      "aria-label": () => messages().format("calendar"),
    },
  };
}

/**
 * Alt with an arrow opens the calendar, from anywhere in the field.
 *
 * The segments leave a modified arrow alone, so it reaches the group whichever
 * segment holds focus.
 */
function opensOnAltArrow(
  event: KeyboardEvent,
  overlay: Pick<OverlayTriggerState, "isOpen" | "setOpen">,
  isBlocked = false,
): void {
  if (!event.altKey || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
  if (isBlocked || overlay.isOpen()) return;
  event.preventDefault();
  event.stopPropagation();
  overlay.setOpen(true);
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

interface DatePickerContextValue {
  state: DatePickerState;
}

const DatePickerContext = createContext<DatePickerContextValue | null>(null);

export function useDatePicker(): DatePickerContextValue {
  const value = getContext(DatePickerContext);
  if (value === null || value === undefined) {
    throw new Error("This must be rendered inside a DatePicker.");
  }
  return value;
}

export interface DatePickerComponentProps<T extends DateValue = DateValue> extends StyleProps {
  label?: Child;
  description?: Child;
  errorMessage?: Child;
  value?: T | null;
  defaultValue?: T | null;
  placeholderValue?: DateValue | null;
  minValue?: DateValue | null;
  maxValue?: DateValue | null;
  isDateUnavailable?: (date: DateValue) => boolean;
  /** Defaults to `"minute"` for a value with a time and `"day"` for one without. */
  granularity?: Granularity;
  hourCycle?: 12 | 24;
  /** Leave a zoned value's zone out of the segments. @default false */
  hideTimeZone?: boolean;
  /** Builds the calendar system the locale names. @default createCalendar */
  createCalendar?: (identifier: CalendarIdentifier) => CalendarSystem;
  isDisabled?: boolean;
  isReadOnly?: boolean;
  isRequired?: boolean;
  isInvalid?: boolean;
  /** What the page thinks of the date, checked as it changes. */
  validate?: ValidateFunction<NoInfer<MappedDateValue<T>> | null>;
  /** @default "aria" */
  validationBehavior?: ValidationBehavior;
  isOpen?: boolean;
  defaultOpen?: boolean;
  name?: string;
  /** @default "bottom start" */
  placement?: Placement;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  ref?: RefTarget<HTMLDivElement>;
  onChange?: (value: NoInfer<MappedDateValue<T>> | null) => void;
  onOpenChange?: (isOpen: boolean) => void;
}

/**
 * ```tsx
 * <DatePicker label="Departure" value={date()} onChange={date.set}
 *             minValue={today(getLocalTimeZone())} />
 * ```
 */
// Declared as its own call site, so JSX infers `T` from the value written
// there: through the mapped type that widens Cells back to values, a type
// parameter standing alone in a prop is not inferred.
export function DatePicker<T extends DateValue = DateValue>(
  props: DatePickerComponentProps<T> & CallSite<DatePickerComponentProps<T>>,
) {
  const groupRef = makeRef<HTMLDivElement>();
  const triggerRef = makeRef<HTMLButtonElement>();
  const createCalendar = callback<[CalendarIdentifier], CalendarSystem>(
    cells(props).createCalendar,
  );
  const isDateUnavailable = callback<[DateValue], boolean>(cells(props).isDateUnavailable);
  const validate = callback<
    [MappedDateValue<T> | null],
    string | string[] | true | null | undefined
  >(cells(props).validate);

  const state = datePickerState<T>({
    value: () => props.value,
    defaultValue: () => props.defaultValue,
    placeholderValue: () => props.placeholderValue,
    minValue: () => props.minValue,
    maxValue: () => props.maxValue,
    granularity: () => props.granularity,
    isDisabled: () => props.isDisabled,
    isReadOnly: () => props.isReadOnly,
    isOpen: () => props.isOpen,
    defaultOpen: () => props.defaultOpen,
    onChange: (value) => props.onChange?.(value),
    onOpenChange: (isOpen) => props.onOpenChange?.(isOpen),
  });

  const {
    labelProps,
    groupProps,
    buttonProps,
    dialogProps,
    calendarProps,
    descriptionProps,
    errorMessageProps,
  } = datePicker(
    {
      ref: groupRef,
      label: () => props.label,
      description: () => props.description,
      errorMessage: () => props.errorMessage,
      isDisabled: () => props.isDisabled,
      isReadOnly: () => props.isReadOnly,
      isRequired: () => props.isRequired,
      isInvalid: () => props.isInvalid,
      "aria-label": () => props["aria-label"],
      "aria-labelledby": () => props["aria-labelledby"],
    },
    state,
  );

  const trigger = button(buttonProps, triggerRef);
  const { hoverProps, isHovered } = hover({ isDisabled: () => props.isDisabled });
  const { focusProps, isFocusVisible } = focusRing();

  const owner = getOwner();
  if (owner !== null) install(owner, DatePickerContext, () => ({ state }));

  const elementProps = mergeProps(
    groupProps,
    filterDOMProps(fromProps(cells(props)), { global: true }),
    styleProps(cells(props)),
    {
      "data-open": state.isOpen,
      "data-disabled": () => props.isDisabled === true,
      "data-testid": () => props["data-testid"],
    },
  );

  const triggerElementProps = mergeProps(trigger.buttonProps, hoverProps, focusProps, {
    id: buttonProps.id,
    "data-hovered": isHovered,
    "data-focus-visible": isFocusVisible,
    "data-pressed": trigger.isPressed,
  });

  return (
    <>
      <span {...labelProps}>{props.label}</span>
      <div {...elementProps} ref={mergeRefs(groupRef.set, props.ref)}>
        {/* Not labelled again: the group around it already carries the
            label, and naming both makes a screen reader say "Departure
            group, Departure group". The segments name themselves. */}
        <DateField
          value={state.value()}
          placeholderValue={props.placeholderValue}
          minValue={props.minValue}
          maxValue={props.maxValue}
          isDateUnavailable={isDateUnavailable}
          granularity={state.granularity()}
          hourCycle={props.hourCycle}
          hideTimeZone={props.hideTimeZone}
          createCalendar={createCalendar}
          isDisabled={props.isDisabled}
          isReadOnly={props.isReadOnly}
          isRequired={props.isRequired}
          isInvalid={props.isInvalid}
          validate={
            validate === undefined
              ? undefined
              : (value: DateValue | null) => validate(value as MappedDateValue<T> | null)
          }
          validationBehavior={props.validationBehavior}
          name={props.name}
          onChange={(value) => state.setValue(value)}
        />
        <button {...triggerElementProps} type="button" ref={triggerRef.set}>
          <span aria-hidden="true">📅</span>
        </button>
      </div>
      <Popover
        triggerRef={triggerRef}
        isOpen={state.isOpen()}
        onOpenChange={state.setOpen}
        placement={props.placement ?? "bottom start"}
      >
        <div {...dialogProps}>
          <Calendar
            aria-label={access(calendarProps["aria-label"] as MaybeAccessor<string>)}
            value={state.value()}
            defaultFocusedValue={state.value() ?? props.placeholderValue ?? undefined}
            minValue={props.minValue}
            maxValue={props.maxValue}
            isDateUnavailable={isDateUnavailable}
            createCalendar={createCalendar}
            isDisabled={props.isDisabled}
            isReadOnly={props.isReadOnly}
            autoFocus
            onChange={(date) => state.setDateValue(date)}
          />
        </div>
      </Popover>
      <span {...descriptionProps}>{props.description}</span>
      <span {...errorMessageProps}>{props.errorMessage}</span>
    </>
  );
}

// ---------------------------------------------------------------------------
// A range of days
// ---------------------------------------------------------------------------

export interface DateRangePickerComponentProps<T extends DateValue = DateValue> extends Omit<
  DatePickerComponentProps<T>,
  "value" | "defaultValue" | "onChange" | "name" | "validate"
> {
  value?: DateRange<T> | null;
  defaultValue?: DateRange<T> | null;
  startName?: string;
  endName?: string;
  /** What the page thinks of the RANGE, checked as it changes. */
  validate?: ValidateFunction<NoInfer<DateRange<MappedDateValue<T>>> | null>;
  onChange?: (value: NoInfer<DateRange<MappedDateValue<T>>> | null) => void;
}

/** A range whose end comes before its start, which no stay or booking can be. */
function reversedRange(
  range: DateRange<DateValue> | null,
  message: () => string,
): ValidationResult | undefined {
  if (range === null || range.end.compare(range.start) >= 0) return undefined;
  return {
    isInvalid: true,
    validationErrors: [message()],
    validationDetails: {
      badInput: false,
      customError: false,
      patternMismatch: false,
      rangeOverflow: true,
      rangeUnderflow: true,
      stepMismatch: false,
      tooLong: false,
      tooShort: false,
      typeMismatch: false,
      valueMissing: false,
      valid: false,
    },
  };
}

/**
 * Two fields and one calendar.
 *
 * The fields are separate controls — a start and an end are two dates, and one
 * field holding "3 Mar – 7 Mar" is a string nobody can edit a part of — but
 * they share the calendar, where the range is drawn in one gesture. What is
 * wrong with the range as a whole, an end before its start, is said once, by
 * the group, rather than by either field.
 */
export function DateRangePicker<T extends DateValue = DateValue>(
  props: DateRangePickerComponentProps<T> & CallSite<DateRangePickerComponentProps<T>>,
) {
  const groupRef = makeRef<HTMLDivElement>();
  const triggerRef = makeRef<HTMLButtonElement>();
  const messages = stringFormatter(PICKER_STRINGS);
  const createCalendar = callback<[CalendarIdentifier], CalendarSystem>(
    cells(props).createCalendar,
  );
  const isDateUnavailable = callback<[DateValue], boolean>(cells(props).isDateUnavailable);

  const [value, setValue] = controllable<DateRange<DateValue> | null>(
    () => props.value,
    () => props.defaultValue ?? null,
    (next) => props.onChange?.(next as DateRange<MappedDateValue<T>> | null),
  );
  const granularity = (): Granularity =>
    props.granularity ?? defaultGranularity(value()?.start ?? props.placeholderValue);

  const overlay = overlayTriggerState({
    isOpen: () => props.isOpen,
    defaultOpen: () => props.defaultOpen,
    onOpenChange: (isOpen) => props.onOpenChange?.(isOpen),
  });

  const buttonId = id();
  const dialogId = id();

  const isDisabled = (): boolean => props.isDisabled === true;

  const check = callback<
    [DateRange<MappedDateValue<T>> | null],
    string | string[] | true | null | undefined
  >(cells(props).validate);
  const { isInvalid, errors, errorMessage } = fieldValidation<DateRange<DateValue> | null>({
    value,
    builtinValidation: () => reversedRange(value(), () => messages().format("rangeReversed")),
    validate:
      check === undefined
        ? undefined
        : (range) => check(range as DateRange<MappedDateValue<T>> | null),
    validationBehavior: () => props.validationBehavior,
    isInvalid: () => props.isInvalid,
    errorMessage: () => props.errorMessage,
  });

  const {
    labelProps,
    fieldProps: labelledProps,
    descriptionProps,
    errorMessageProps,
  } = field({
    label: () => props.label,
    description: () => props.description,
    errorMessage,
    isInvalid,
    "aria-label": () => props["aria-label"],
    "aria-labelledby": () => props["aria-labelledby"],
    labelElementType: "span",
  });
  const labelId = (): string | undefined =>
    access(labelProps.id as MaybeAccessor<string | undefined>);

  const trigger = button(
    {
      id: buttonId,
      "aria-haspopup": "dialog",
      "aria-expanded": () => overlay.isOpen(),
      "aria-controls": () => (overlay.isOpen() ? dialogId() : undefined),
      "aria-label": () => messages().format("calendar"),
      "aria-labelledby": () => `${buttonId()} ${labelId() ?? ""}`.trim(),
      isDisabled: () => isDisabled() || props.isReadOnly === true,
      onPress: () => overlay.toggle(),
    },
    triggerRef,
  );

  const { hoverProps, isHovered } = hover({ isDisabled });
  const { focusProps, isFocusVisible } = focusRing();

  /**
   * One end changed. The other is kept, so the range is edited rather than
   * reset, and each end keeps the time typed into it.
   */
  const setEnd = (which: "start" | "end", date: DateValue | null): void => {
    const current = value();
    if (date === null) {
      setValue(null);
      return;
    }
    const other = which === "start" ? current?.end : current?.start;
    if (other === undefined) {
      setValue({ start: date, end: date });
      return;
    }
    setValue(which === "start" ? { start: date, end: other } : { start: other, end: date });
  };

  /**
   * A range drawn in the calendar. Its ends keep the times they already held,
   * which the calendar sees to; one drawn while there was none takes the
   * placeholder's time.
   */
  const fromCalendar = (range: DateRange<DateValue> | null): DateRange<DateValue> | null => {
    if (range === null) return null;
    const placeholder = props.defaultValue?.start ?? props.placeholderValue;
    return {
      start: withTime(range.start, granularity(), placeholder),
      end: withTime(range.end, granularity(), placeholder),
    };
  };

  const elementProps = mergeProps(
    labelledProps,
    filterDOMProps(fromProps(cells(props)), { global: true }),
    styleProps(cells(props)),
    {
      role: "group",
      "aria-disabled": () => isDisabled() || undefined,
      "aria-invalid": () => isInvalid() || undefined,
      "data-open": overlay.isOpen,
      "data-invalid": isInvalid,
      "data-testid": () => props["data-testid"],
      onKeyDown: (event: KeyboardEvent) =>
        opensOnAltArrow(event, overlay, isDisabled() || props.isReadOnly === true),
    },
  );

  return (
    <>
      <span {...labelProps}>{props.label}</span>
      <div {...elementProps} ref={mergeRefs(groupRef.set, props.ref)}>
        <DateField
          aria-label={messages().format("startDate")}
          value={value()?.start ?? null}
          placeholderValue={props.placeholderValue}
          minValue={props.minValue}
          maxValue={props.maxValue}
          isDateUnavailable={isDateUnavailable}
          granularity={granularity()}
          hourCycle={props.hourCycle}
          hideTimeZone={props.hideTimeZone}
          createCalendar={createCalendar}
          isDisabled={props.isDisabled}
          isReadOnly={props.isReadOnly}
          isRequired={props.isRequired}
          isInvalid={isInvalid() || undefined}
          validationBehavior={props.validationBehavior}
          name={props.startName}
          onChange={(next) => setEnd("start", next)}
        />
        <span aria-hidden="true">–</span>
        <DateField
          aria-label={messages().format("endDate")}
          value={value()?.end ?? null}
          placeholderValue={props.placeholderValue}
          minValue={props.minValue}
          maxValue={props.maxValue}
          isDateUnavailable={isDateUnavailable}
          granularity={granularity()}
          hourCycle={props.hourCycle}
          hideTimeZone={props.hideTimeZone}
          createCalendar={createCalendar}
          isDisabled={props.isDisabled}
          isReadOnly={props.isReadOnly}
          isRequired={props.isRequired}
          isInvalid={isInvalid() || undefined}
          validationBehavior={props.validationBehavior}
          name={props.endName}
          onChange={(next) => setEnd("end", next)}
        />
        <button
          {...mergeProps(trigger.buttonProps, hoverProps, focusProps, {
            id: buttonId,
            "data-hovered": isHovered,
            "data-focus-visible": isFocusVisible,
          })}
          type="button"
          ref={triggerRef.set}
        >
          <span aria-hidden="true">📅</span>
        </button>
      </div>
      <Popover
        triggerRef={triggerRef}
        isOpen={overlay.isOpen()}
        onOpenChange={overlay.setOpen}
        placement={props.placement ?? "bottom start"}
      >
        <div
          id={dialogId}
          role="dialog"
          aria-labelledby={`${buttonId()} ${labelId() ?? ""}`.trim()}
        >
          <RangeCalendar
            aria-label={messages().format("calendar")}
            value={value()}
            defaultFocusedValue={value()?.start ?? props.placeholderValue ?? undefined}
            minValue={props.minValue}
            maxValue={props.maxValue}
            isDateUnavailable={isDateUnavailable}
            createCalendar={createCalendar}
            isDisabled={props.isDisabled}
            isReadOnly={props.isReadOnly}
            autoFocus
            onChange={(range) => {
              setValue(fromCalendar(range));
              overlay.close();
            }}
          />
        </div>
      </Popover>
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

// ---------------------------------------------------------------------------
// Strings
// ---------------------------------------------------------------------------

type PickerKey = "calendar" | "startDate" | "endDate" | "rangeReversed";

const PICKER_STRINGS = new StringDictionary<PickerKey>({
  "en-US": {
    calendar: "Calendar",
    startDate: "Start date",
    endDate: "End date",
    rangeReversed: "The start date is after the end date.",
  },
  "ar-AE": {
    calendar: "التقويم",
    startDate: "تاريخ البدء",
    endDate: "تاريخ الانتهاء",
    rangeReversed: "تاريخ البدء يجب أن يكون قبل تاريخ الانتهاء.",
  },
  "bg-BG": {
    calendar: "Календар",
    startDate: "Начална дата",
    endDate: "Крайна дата",
    rangeReversed: "Началната дата трябва да е преди крайната.",
  },
  "cs-CZ": {
    calendar: "Kalendář",
    startDate: "Počáteční datum",
    endDate: "Konečné datum",
    rangeReversed: "Datum zahájení musí předcházet datu ukončení.",
  },
  "da-DK": {
    calendar: "Kalender",
    startDate: "Startdato",
    endDate: "Slutdato",
    rangeReversed: "Startdatoen skal være før slutdatoen.",
  },
  "de-DE": {
    calendar: "Kalender",
    startDate: "Startdatum",
    endDate: "Enddatum",
    rangeReversed: "Das Startdatum muss vor dem Enddatum liegen.",
  },
  "el-GR": {
    calendar: "Ημερολόγιο",
    startDate: "Ημερομηνία έναρξης",
    endDate: "Ημερομηνία λήξης",
    rangeReversed: "Η ημερομηνία έναρξης πρέπει να είναι πριν από την ημερομηνία λήξης.",
  },
  "es-ES": {
    calendar: "Calendario",
    startDate: "Fecha de inicio",
    endDate: "Fecha final",
    rangeReversed: "La fecha de inicio debe ser anterior a la fecha de finalización.",
  },
  "et-EE": {
    calendar: "Kalender",
    startDate: "Alguskuupäev",
    endDate: "Lõppkuupäev",
    rangeReversed: "Alguskuupäev peab olema enne lõppkuupäeva.",
  },
  "fi-FI": {
    calendar: "Kalenteri",
    startDate: "Alkamispäivä",
    endDate: "Päättymispäivä",
    rangeReversed: "Aloituspäivän on oltava ennen lopetuspäivää.",
  },
  "fr-FR": {
    calendar: "Calendrier",
    startDate: "Date de début",
    endDate: "Date de fin",
    rangeReversed: "La date de début doit être antérieure à la date de fin.",
  },
  "he-IL": {
    calendar: "לוח שנה",
    startDate: "תאריך התחלה",
    endDate: "תאריך סיום",
    rangeReversed: "תאריך ההתחלה חייב להיות לפני תאריך הסיום.",
  },
  "hr-HR": {
    calendar: "Kalendar",
    startDate: "Datum početka",
    endDate: "Datum završetka",
    rangeReversed: "Datum početka mora biti prije datuma završetka.",
  },
  "hu-HU": {
    calendar: "Naptár",
    startDate: "Kezdő dátum",
    endDate: "Befejező dátum",
    rangeReversed: "A kezdő dátumnak a befejező dátumnál korábbinak kell lennie.",
  },
  "it-IT": {
    calendar: "Calendario",
    startDate: "Data iniziale",
    endDate: "Data finale",
    rangeReversed: "La data di inizio deve essere antecedente alla data di fine.",
  },
  "ja-JP": {
    calendar: "カレンダー",
    startDate: "開始日",
    endDate: "終了日",
    rangeReversed: "開始日は終了日より前にする必要があります。",
  },
  "ko-KR": {
    calendar: "달력",
    startDate: "시작일",
    endDate: "종료일",
    rangeReversed: "시작일은 종료일 이전이어야 합니다.",
  },
  "lt-LT": {
    calendar: "Kalendorius",
    startDate: "Pradžios data",
    endDate: "Pabaigos data",
    rangeReversed: "Pradžios data turi būti ankstesnė nei pabaigos data.",
  },
  "lv-LV": {
    calendar: "Kalendārs",
    startDate: "Sākuma datums",
    endDate: "Beigu datums",
    rangeReversed: "Sākuma datumam ir jābūt pirms beigu datuma.",
  },
  "nb-NO": {
    calendar: "Kalender",
    startDate: "Startdato",
    endDate: "Sluttdato",
    rangeReversed: "Startdatoen må være før sluttdatoen.",
  },
  "nl-NL": {
    calendar: "Kalender",
    startDate: "Startdatum",
    endDate: "Einddatum",
    rangeReversed: "De startdatum moet voor de einddatum liggen.",
  },
  "pl-PL": {
    calendar: "Kalendarz",
    startDate: "Data początkowa",
    endDate: "Data końcowa",
    rangeReversed: "Data rozpoczęcia musi być wcześniejsza niż data zakończenia.",
  },
  "pt-BR": {
    calendar: "Calendário",
    startDate: "Data inicial",
    endDate: "Data final",
    rangeReversed: "A data inicial deve ser anterior à data final.",
  },
  "pt-PT": {
    calendar: "Calendário",
    startDate: "Data de Início",
    endDate: "Data de Término",
    rangeReversed: "A data de início deve ser anterior à data de fim.",
  },
  "ro-RO": {
    calendar: "Calendar",
    startDate: "Dată început",
    endDate: "Dată final",
    rangeReversed: "Data de început trebuie să fie anterioară datei de sfârșit.",
  },
  "ru-RU": {
    calendar: "Календарь",
    startDate: "Дата начала",
    endDate: "Дата окончания",
    rangeReversed: "Дата начала должна предшествовать дате окончания.",
  },
  "sk-SK": {
    calendar: "Kalendár",
    startDate: "Dátum začatia",
    endDate: "Dátum ukončenia",
    rangeReversed: "Dátum začiatku musí byť skorší ako dátum konca.",
  },
  "sl-SI": {
    calendar: "Koledar",
    startDate: "Datum začetka",
    endDate: "Datum konca",
    rangeReversed: "Začetni datum mora biti pred končnim datumom.",
  },
  "sr-SP": {
    calendar: "Kalendar",
    startDate: "Datum početka",
    endDate: "Datum završetka",
    rangeReversed: "Datum početka mora biti pre datuma završetka.",
  },
  "sv-SE": {
    calendar: "Kalender",
    startDate: "Startdatum",
    endDate: "Slutdatum",
    rangeReversed: "Startdatumet måste vara före slutdatumet.",
  },
  "tr-TR": {
    calendar: "Takvim",
    startDate: "Başlangıç Tarihi",
    endDate: "Bitiş Tarihi",
    rangeReversed: "Başlangıç tarihi bitiş tarihinden önce olmalıdır.",
  },
  "uk-UA": {
    calendar: "Календар",
    startDate: "Дата початку",
    endDate: "Дата завершення",
    rangeReversed: "Дата початку має передувати даті завершення.",
  },
  "zh-CN": {
    calendar: "日历",
    startDate: "开始日期",
    endDate: "结束日期",
    rangeReversed: "开始日期必须早于结束日期。",
  },
  "zh-TW": {
    calendar: "日曆",
    startDate: "開始日期",
    endDate: "結束日期",
    rangeReversed: "開始日期必須在結束日期之前。",
  },
});
