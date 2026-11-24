import { For, createMemo } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { Time, type TimeValue } from "@barqjs/aria/date";
import { TimeField as AriaTimeField } from "@barqjs/aria/datefield";
import { useLocale } from "@barqjs/aria/i18n";
import { Clock } from "@barqjs/lucide/icons/clock";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@barqjs/ui/select";

import { arcLayer as arc } from "../layer.ts";
import {
  type ArcFieldProps,
  type FieldSlots,
  type FieldValueProps,
  Frame,
  bindField,
  fieldStyles,
} from "../lib/field.tsx";
import { type Customisable, parts } from "../lib/parts.ts";
import { control, layout, space } from "../style/index.ts";
import { useArcMessages } from "./messages.ts";

/** Focus left the element for somewhere outside it: the field was blurred, not a segment. */
function leaving(event: FocusEvent, blur: () => void): void {
  const to = event.relatedTarget as Node | null;
  if (to === null || !(event.currentTarget as Element).contains(to)) blur();
}

export interface TimeFieldProps extends ArcFieldProps, FieldValueProps<Time | null> {
  /** The smallest unit typed. @default "minute" */
  granularity?: "hour" | "minute" | "second";
  /** 12 or 24 hours. @default the locale's */
  hourCycle?: 12 | 24;
  minValue?: Time | null;
  maxValue?: Time | null;
  /** What an empty field's segments count from. @default midnight */
  placeholderValue?: Time;
}

/**
 * A time of day, typed segment by segment in the locale's order and digits.
 * Held as a `Time`, or `null`.
 *
 * ```tsx
 * <TimeField label="Opens" value={opens()} onChange={setOpens} />
 * <form.AppField name="opens">{(field) => <field.TimeField label="Opens" />}</form.AppField>
 * ```
 */
export function TimeField(props: TimeFieldProps) {
  const of = bindField<Time | null>(props, null);
  return (
    <Frame
      of={of}
      label={props.label}
      description={props.description}
      field={props}
      labelledById
      slot="time-field"
    >
      <AriaTimeField
        class={arc(control.segmented, props.classes?.control)}
        data-slot="time-field-control"
        aria-labelledby={of.ids.label}
        aria-describedby={of.describedBy(props.description !== undefined)}
        value={of.value()}
        granularity={props.granularity ?? "minute"}
        hourCycle={props.hourCycle}
        minValue={props.minValue}
        maxValue={props.maxValue}
        placeholderValue={props.placeholderValue}
        name={of.name()}
        isDisabled={props.isDisabled}
        isRequired={props.isRequired}
        isInvalid={of.isInvalid()}
        onChange={(value: Time | null) => of.change(value)}
        onFocusOut={(event: FocusEvent) => leaving(event, of.blur)}
      />
    </Frame>
  );
}

export const timePickerStyles = variants({
  slots: {
    control: arc(control.segmented, { paddingInlineEnd: space.x0_5 }),
    segments: arc(layout.row, layout.grow, { gap: "1px" }),
    trigger: arc(control.boxedTrigger, { paddingInline: space.x1_5 }),
    list: arc({ maxHeight: "min(18rem, var(--available-height, 18rem))" }),
    option: arc({}),
  },
});

type PickerSlots = ReturnType<typeof timePickerStyles> & FieldSlots;

export interface TimePickerProps
  extends Omit<TimeFieldProps, "classes">, Customisable<PickerSlots> {
  /** Minutes between the times the list offers. @default 30 */
  step?: number;
  /** The times the list offers, in place of every `step` minutes. */
  times?: readonly Time[];
  /** Names the button that opens the list. @default the provider's `chooseTime`, "Choose a time" */
  chooseLabel?: string;
}

/** `09:30`, the key a listed time is chosen by. */
function keyOf(time: TimeValue): string {
  return `${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}`;
}

/** Every `step` minutes from `min` to `max`, both kept. */
export function timesBetween(step: number, min?: Time | null, max?: Time | null): Time[] {
  const first = (min?.hour ?? 0) * 60 + (min?.minute ?? 0);
  const last = max === null || max === undefined ? 24 * 60 - 1 : max.hour * 60 + max.minute;
  const out: Time[] = [];
  const by = Math.max(1, Math.round(step));
  for (let at = Math.ceil(first / by) * by; at <= last; at += by) {
    out.push(new Time(Math.floor(at / 60), at % 60));
  }
  return out;
}

/**
 * A time typed segment by segment, or picked from a list of times every
 * `step` minutes, which a phone reaches with one tap rather than four
 * segments.
 *
 * ```tsx
 * <TimePicker label="Starts" step={15} minValue={new Time(8)} maxValue={new Time(18)} />
 * ```
 *
 * The list is a listbox: the arrows move through it, typing a time jumps to
 * it, and the time held is the one checked. Each is written in the locale's
 * own clock, `2:30 PM` or `14:30`.
 */
export function TimePicker(props: TimePickerProps) {
  const messages = useArcMessages();
  const of = bindField<Time | null>(props, null);
  const locale = useLocale();
  const cycled = createMemo(
    () =>
      new Intl.DateTimeFormat(locale().locale, {
        hour: "numeric",
        minute: "2-digit",
        ...(props.hourCycle === undefined
          ? {}
          : { hourCycle: props.hourCycle === 12 ? "h12" : "h23" }),
      }),
  );
  const times = createMemo(
    (): readonly Time[] =>
      props.times ?? timesBetween(props.step ?? 30, props.minValue, props.maxValue),
  );
  function label(time: Time): string {
    return cycled().format(new Date(2000, 0, 1, time.hour, time.minute));
  }
  function chosen(): string | undefined {
    const value = of.value();
    return value === null || value === undefined ? undefined : keyOf(value);
  }
  function cls(): PickerSlots {
    return parts({ ...fieldStyles(), ...timePickerStyles() }, props.classes);
  }

  return (
    <Frame
      of={of}
      label={props.label}
      description={props.description}
      field={{ ...props, classes: props.classes }}
      labelledById
      slot="time-picker"
    >
      <div
        class={cls().control}
        data-slot="time-picker-control"
        data-invalid={of.isInvalid() ? "" : undefined}
        data-disabled={props.isDisabled === true ? "" : undefined}
        onFocusOut={(event: FocusEvent) => leaving(event, of.blur)}
      >
        <AriaTimeField
          class={cls().segments}
          data-slot="time-picker-segments"
          aria-labelledby={of.ids.label}
          aria-describedby={of.describedBy(props.description !== undefined)}
          value={of.value()}
          granularity={props.granularity ?? "minute"}
          hourCycle={props.hourCycle}
          minValue={props.minValue}
          maxValue={props.maxValue}
          placeholderValue={props.placeholderValue}
          name={of.name()}
          isDisabled={props.isDisabled}
          isRequired={props.isRequired}
          isInvalid={of.isInvalid()}
          onChange={(value: Time | null) => of.change(value)}
        />
        <Select
          value={chosen()}
          isDisabled={props.isDisabled}
          onValueChange={(key: string) => {
            const [hour, minute] = key.split(":").map(Number);
            of.change(new Time(hour ?? 0, minute ?? 0));
            of.blur();
          }}
        >
          <SelectTrigger
            class={cls().trigger}
            data-slot="time-picker-trigger"
            aria-label={props.chooseLabel ?? messages().chooseTime}
          >
            <Clock aria-hidden="true" />
          </SelectTrigger>
          <SelectContent
            class={cls().list}
            data-slot="time-picker-list"
            position="popper"
            placement="bottom end"
          >
            <For each={times()}>
              {(time: Time) => (
                <SelectItem class={cls().option} value={keyOf(time)} textValue={label(time)}>
                  {label(time)}
                </SelectItem>
              )}
            </For>
          </SelectContent>
        </Select>
      </div>
    </Frame>
  );
}
