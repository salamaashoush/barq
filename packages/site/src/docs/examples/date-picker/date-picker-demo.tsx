import { CalendarDate } from "@barqjs/aria/date";
import { createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import { ChevronDown } from "@barqjs/lucide/icons/chevron-down";
import { Button, Calendar, Popover, PopoverContent, PopoverTrigger } from "@barqjs/ui";

const trigger = css`
  width: 212px;
  justify-content: space-between;
  text-align: start;
  font-weight: 400;

  &[data-empty="true"] {
    color: var(--muted-foreground);
  }
`;

const panel = css`
  width: auto;
  padding: 0;
`;

const long = (date: CalendarDate): string =>
  date.toDate().toLocaleDateString("en-US", { dateStyle: "long" });

export default function DatePickerDemo() {
  const [date, setDate] = createSignal<CalendarDate | null>(null);

  return (
    <Popover>
      <PopoverTrigger>
        <Button variant="outline" data-empty={date() === null ? "true" : "false"} class={trigger}>
          {() => {
            const picked = date();
            return picked === null ? <span>Pick a date</span> : long(picked);
          }}
          <ChevronDown />
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
  );
}
