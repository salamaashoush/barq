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
  type Accessor,
  type Child,
  context,
  getContext,
  getOwner,
  type Incoming,
  install,
} from "@barqjs/core";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import { button, type ButtonOptions } from "./button.tsx";
import { Calendar, RangeCalendar, type DateRange } from "./calendar.tsx";
import { CalendarDate, CalendarDateTime, toCalendarDate, today, type DateValue } from "./date.ts";
import { Popover } from "./dialog.tsx";
import { focusRing } from "./focus.ts";
import { hover } from "./interactions/hover.ts";
import type { ElementRef } from "./interactions/press.ts";
import { field, type FieldOptions } from "./label.ts";
import type { ValidateFunction, ValidationBehavior } from "./validation.ts";
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

export interface DatePickerStateOptions extends OverlayTriggerStateOptions {
  value?: MaybeAccessor<DateValue | null | undefined>;
  defaultValue?: MaybeAccessor<DateValue | null | undefined>;
  minValue?: MaybeAccessor<DateValue | null | undefined>;
  maxValue?: MaybeAccessor<DateValue | null | undefined>;
  /** @default "day" */
  granularity?: MaybeAccessor<Granularity | undefined>;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  isReadOnly?: MaybeAccessor<boolean | undefined>;
  onChange?: (value: DateValue | null) => void;
}

export interface DatePickerState extends OverlayTriggerState {
  value: Accessor<DateValue | null>;
  setValue(value: DateValue | null): void;
  /** The day part, for the calendar, which knows nothing about time. */
  dateValue: Accessor<CalendarDate | null>;
  setDateValue(date: CalendarDate | null): void;
  granularity: Accessor<Granularity>;
  isDisabled: Accessor<boolean>;
  isReadOnly: Accessor<boolean>;
}

export function datePickerState(options: DatePickerStateOptions): DatePickerState {
  const overlay = overlayTriggerState(options);

  const [value, setValue] = controllable<DateValue | null>(
    () => access(options.value),
    () => access(options.defaultValue) ?? null,
    options.onChange,
  );

  const granularity = (): Granularity => access(options.granularity) ?? "day";

  return {
    ...overlay,
    value,
    setValue,
    granularity,
    isDisabled: () => access(options.isDisabled) === true,
    isReadOnly: () => access(options.isReadOnly) === true,
    dateValue: () => {
      const current = value();
      return current === null ? null : toCalendarDate(current);
    },
    setDateValue: (date) => {
      if (date === null) {
        setValue(null);
        overlay.close();
        return;
      }
      // The time the field already holds is KEPT: choosing a day in the
      // calendar is choosing a day, not resetting the meeting to midnight.
      const current = value();
      const next =
        granularity() === "day"
          ? date
          : CalendarDateTime.from(
              date,
              current instanceof CalendarDateTime ? current.time : undefined,
            );
      setValue(next);
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
      "aria-label": "Calendar",
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
      "aria-label": "Choose a date",
    },
  };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

interface DatePickerContextValue {
  state: DatePickerState;
}

const DatePickerContext = context<DatePickerContextValue | null>(null);

export function useDatePicker(): DatePickerContextValue {
  const value = getContext(DatePickerContext);
  if (value === null || value === undefined) {
    throw new Error("This must be rendered inside a DatePicker.");
  }
  return value;
}

export interface DatePickerComponentProps extends StyleProps {
  label?: Child;
  description?: Child;
  errorMessage?: Child;
  value?: DateValue | null;
  defaultValue?: DateValue | null;
  placeholderValue?: DateValue;
  minValue?: DateValue | null;
  maxValue?: DateValue | null;
  isDateUnavailable?: (date: CalendarDate) => boolean;
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
  isOpen?: boolean;
  defaultOpen?: boolean;
  name?: string;
  /** @default "bottom start" */
  placement?: Placement;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  ref?: RefTarget<HTMLDivElement>;
  onChange?: (value: DateValue | null) => void;
  onOpenChange?: (isOpen: boolean) => void;
}

/**
 * ```tsx
 * <DatePicker label="Departure" value={date()} onChange={date.set} minValue={today()} />
 * ```
 */
export function DatePicker(props: Incoming<DatePickerComponentProps>) {
  const groupRef = makeRef<HTMLDivElement>();
  const triggerRef = makeRef<HTMLButtonElement>();

  const state = datePickerState({
    value: () => props.value?.(),
    defaultValue: () => props.defaultValue?.(),
    minValue: () => props.minValue?.(),
    maxValue: () => props.maxValue?.(),
    granularity: () => props.granularity?.(),
    isDisabled: () => props.isDisabled?.(),
    isReadOnly: () => props.isReadOnly?.(),
    isOpen: () => props.isOpen?.(),
    defaultOpen: () => props.defaultOpen?.(),
    onChange: (value) => props.onChange?.()?.(value),
    onOpenChange: (isOpen) => props.onOpenChange?.()?.(isOpen),
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
      label: () => props.label?.(),
      description: () => props.description?.(),
      errorMessage: () => props.errorMessage?.(),
      isDisabled: () => props.isDisabled?.(),
      isReadOnly: () => props.isReadOnly?.(),
      isRequired: () => props.isRequired?.(),
      isInvalid: () => props.isInvalid?.(),
      "aria-label": () => props["aria-label"]?.(),
      "aria-labelledby": () => props["aria-labelledby"]?.(),
    },
    state,
  );

  const trigger = button(buttonProps, triggerRef);
  const { hoverProps, isHovered } = hover({ isDisabled: () => props.isDisabled?.() });
  const { focusProps, isFocusVisible } = focusRing();

  const owner = getOwner();
  if (owner !== null) install(owner, DatePickerContext, () => ({ state }));

  const elementProps = mergeProps(
    groupProps,
    filterDOMProps(fromProps(props), { global: true }),
    styleProps(props),
    {
      "data-open": state.isOpen,
      "data-disabled": () => props.isDisabled?.() === true,
      "data-testid": () => props["data-testid"]?.(),
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
      <div {...elementProps} ref={mergeRefs(groupRef.set, props.ref?.())}>
        {/* Not labelled again: the group around it already carries the
            label, and naming both makes a screen reader say "Departure
            group, Departure group". The segments name themselves. */}
        <DateField
          value={state.value()}
          placeholderValue={props.placeholderValue?.()}
          minValue={props.minValue?.()}
          maxValue={props.maxValue?.()}
          granularity={props.granularity?.()}
          hourCycle={props.hourCycle?.()}
          isDisabled={props.isDisabled?.()}
          isReadOnly={props.isReadOnly?.()}
          isRequired={props.isRequired?.()}
          isInvalid={props.isInvalid?.()}
          validate={callback<[DateValue | null], string | string[] | true | null | undefined>(
            props.validate,
          )}
          validationBehavior={props.validationBehavior?.()}
          name={props.name?.()}
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
        placement={props.placement?.() ?? "bottom start"}
      >
        <div {...dialogProps}>
          <Calendar
            aria-label={String(calendarProps["aria-label"])}
            value={state.dateValue()}
            defaultFocusedValue={
              state.dateValue() ?? toCalendarDate(props.placeholderValue?.() ?? today())
            }
            minValue={props.minValue?.()}
            maxValue={props.maxValue?.()}
            isDateUnavailable={callback<[CalendarDate], boolean>(props.isDateUnavailable)}
            isDisabled={props.isDisabled?.()}
            isReadOnly={props.isReadOnly?.()}
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

export interface DateRangePickerComponentProps extends Omit<
  DatePickerComponentProps,
  "value" | "defaultValue" | "onChange" | "name"
> {
  value?: DateRange | null;
  defaultValue?: DateRange | null;
  startName?: string;
  endName?: string;
  onChange?: (value: DateRange | null) => void;
}

/**
 * Two fields and one calendar.
 *
 * The fields are separate controls — a start and an end are two dates, and one
 * field holding "3 Mar – 7 Mar" is a string nobody can edit a part of — but
 * they share the calendar, where the range is drawn in one gesture.
 */
export function DateRangePicker(props: Incoming<DateRangePickerComponentProps>) {
  const groupRef = makeRef<HTMLDivElement>();
  const triggerRef = makeRef<HTMLButtonElement>();

  const [value, setValue] = controllable<DateRange | null>(
    () => props.value?.(),
    () => props.defaultValue?.() ?? null,
    (next) => props.onChange?.()?.(next),
  );

  const overlay = overlayTriggerState({
    isOpen: () => props.isOpen?.(),
    defaultOpen: () => props.defaultOpen?.(),
    onOpenChange: (isOpen) => props.onOpenChange?.()?.(isOpen),
  });

  const labelId = id();
  const buttonId = id();
  const dialogId = id();

  const isDisabled = (): boolean => props.isDisabled?.() === true;

  const trigger = button(
    {
      id: buttonId,
      "aria-haspopup": "dialog",
      "aria-expanded": () => overlay.isOpen(),
      "aria-controls": () => (overlay.isOpen() ? dialogId() : undefined),
      "aria-label": "Calendar",
      "aria-labelledby": () => `${buttonId()} ${labelId()}`,
      isDisabled: () => isDisabled() || props.isReadOnly?.() === true,
      onPress: () => overlay.toggle(),
    } as ButtonOptions,
    triggerRef,
  );

  const { hoverProps, isHovered } = hover({ isDisabled });
  const { focusProps, isFocusVisible } = focusRing();

  /** One end changed. The other is kept, so the range is edited rather than reset. */
  const setEnd = (which: "start" | "end", date: DateValue | null): void => {
    const current = value();
    if (date === null) {
      setValue(null);
      return;
    }
    const day = toCalendarDate(date);
    const other = which === "start" ? current?.end : current?.start;
    if (other === undefined) {
      setValue({ start: day, end: day });
      return;
    }
    setValue(which === "start" ? { start: day, end: other } : { start: other, end: day });
  };

  const elementProps = mergeProps(
    filterDOMProps(fromProps(props), { global: true }),
    styleProps(props),
    {
      role: "group",
      "aria-labelledby": labelId,
      "aria-disabled": () => isDisabled() || undefined,
      "data-open": overlay.isOpen,
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  return (
    <>
      <span id={labelId}>{props.label}</span>
      <div {...elementProps} ref={mergeRefs(groupRef.set, props.ref?.())}>
        <DateField
          aria-label="Start date"
          value={value()?.start ?? null}
          placeholderValue={props.placeholderValue?.()}
          minValue={props.minValue?.()}
          maxValue={props.maxValue?.()}
          granularity={props.granularity?.()}
          isDisabled={props.isDisabled?.()}
          isReadOnly={props.isReadOnly?.()}
          name={props.startName?.()}
          onChange={(next) => setEnd("start", next)}
        />
        <span aria-hidden="true">–</span>
        <DateField
          aria-label="End date"
          value={value()?.end ?? null}
          placeholderValue={props.placeholderValue?.()}
          minValue={props.minValue?.()}
          maxValue={props.maxValue?.()}
          granularity={props.granularity?.()}
          isDisabled={props.isDisabled?.()}
          isReadOnly={props.isReadOnly?.()}
          name={props.endName?.()}
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
        placement={props.placement?.() ?? "bottom start"}
      >
        <div id={dialogId} role="dialog" aria-labelledby={labelId}>
          <RangeCalendar
            aria-label="Choose dates"
            value={value()}
            defaultFocusedValue={
              value()?.start ?? toCalendarDate(props.placeholderValue?.() ?? today())
            }
            minValue={props.minValue?.()}
            maxValue={props.maxValue?.()}
            isDateUnavailable={callback<[CalendarDate], boolean>(props.isDateUnavailable)}
            isDisabled={props.isDisabled?.()}
            isReadOnly={props.isReadOnly?.()}
            autoFocus
            onChange={(range) => {
              setValue(range);
              overlay.close();
            }}
          />
        </div>
      </Popover>
      <span>{props.description}</span>
    </>
  );
}
