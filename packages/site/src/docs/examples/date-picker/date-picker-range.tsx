import type { DateRange } from "@barqjs/aria/calendar";
import { CalendarDate } from "@barqjs/aria/date";
import { createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Calendar as CalendarIcon } from "@barqjs/lucide/icons/calendar";
import {
  Button,
  Calendar,
  Field,
  FieldLabel,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@barqjs/ui";

const field = css`
  margin-inline: auto;
  width: calc(var(--spacing) * 60);
`;

const trigger = css`
  justify-content: flex-start;
  padding-inline: calc(var(--spacing) * 2.5);
  font-weight: 400;
`;

const panel = css`
  width: auto;
  padding: 0;
`;

const short = (date: CalendarDate): string =>
  date.toDate().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });

const from = new CalendarDate(new Date().getFullYear(), 1, 20);

export default function DatePickerRange() {
  const [date, setDate] = createSignal<DateRange | null>({
    start: from,
    end: from.add({ days: 20 }),
  });

  return (
    <Field class={field}>
      <FieldLabel for="date-picker-range">Date Picker Range</FieldLabel>
      <Popover>
        <PopoverTrigger>
          <Button variant="outline" id="date-picker-range" class={trigger}>
            <CalendarIcon />
            {() => {
              const range = date();
              return range === null ? (
                <span>Pick a date</span>
              ) : (
                `${short(range.start)} - ${short(range.end)}`
              );
            }}
          </Button>
        </PopoverTrigger>
        <PopoverContent class={panel} align="start">
          <Calendar
            mode="range"
            aria-label="Date range"
            defaultMonth={date()?.start}
            selected={date()}
            onSelect={setDate}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>
    </Field>
  );
}
