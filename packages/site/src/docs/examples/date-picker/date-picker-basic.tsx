import { CalendarDate } from "@barqjs/aria/date";
import { createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
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
  width: calc(var(--spacing) * 44);
`;

const trigger = css`
  justify-content: flex-start;
  font-weight: 400;
`;

const panel = css`
  width: auto;
  padding: 0;
`;

const long = (date: CalendarDate): string =>
  date.toDate().toLocaleDateString("en-US", { dateStyle: "long" });

export default function DatePickerBasic() {
  const [date, setDate] = createSignal<CalendarDate | null>(null);

  return (
    <Field class={field}>
      <FieldLabel for="date-picker-basic">Date</FieldLabel>
      <Popover>
        <PopoverTrigger>
          <Button variant="outline" id="date-picker-basic" class={trigger}>
            {() => {
              const picked = date();
              return picked === null ? <span>Pick a date</span> : long(picked);
            }}
          </Button>
        </PopoverTrigger>
        <PopoverContent class={panel} align="start">
          <Calendar
            mode="single"
            aria-label="Date"
            selected={date()}
            onSelect={setDate}
            defaultMonth={date() ?? undefined}
          />
        </PopoverContent>
      </Popover>
    </Field>
  );
}
