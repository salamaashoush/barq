import { CalendarDate } from "@barqjs/aria/date";
import { createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import { ChevronDown } from "@barqjs/lucide/icons/chevron-down";
import {
  Button,
  Calendar,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@barqjs/ui";

const group = css`
  margin-inline: auto;
  max-width: 20rem;
  flex-direction: row;
`;

const trigger = css`
  width: calc(var(--spacing) * 32);
  justify-content: space-between;
  font-weight: 400;
`;

const panel = css`
  width: auto;
  overflow: hidden;
  padding: 0;
`;

const narrow = css`
  width: calc(var(--spacing) * 32);
`;

const time = css`
  appearance: none;
  background-color: var(--background);

  &::-webkit-calendar-picker-indicator {
    display: none;
    appearance: none;
  }
`;

const long = (date: CalendarDate): string =>
  date.toDate().toLocaleDateString("en-US", { dateStyle: "long" });

export default function DatePickerTime() {
  const [open, setOpen] = createSignal(false);
  const [date, setDate] = createSignal<CalendarDate | null>(null);

  return (
    <FieldGroup class={group}>
      <Field>
        <FieldLabel for="date-picker-time-date">Date</FieldLabel>
        <Popover isOpen={open()} onOpenChange={setOpen}>
          <PopoverTrigger>
            <Button variant="outline" id="date-picker-time-date" class={trigger}>
              {() => {
                const picked = date();
                return picked === null ? "Select date" : long(picked);
              }}
              <ChevronDown />
            </Button>
          </PopoverTrigger>
          <PopoverContent class={panel} align="start">
            <Calendar
              mode="single"
              aria-label="Date"
              selected={date()}
              captionLayout="dropdown"
              defaultMonth={date() ?? undefined}
              onSelect={(next: CalendarDate | null) => {
                setDate(next);
                setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      </Field>
      <Field class={narrow}>
        <FieldLabel for="date-picker-time-time">Time</FieldLabel>
        <Input
          type="time"
          id="date-picker-time-time"
          step="1"
          defaultValue="10:30:00"
          class={time}
        />
      </Field>
    </FieldGroup>
  );
}
