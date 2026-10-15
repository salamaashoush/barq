import { CalendarDate } from "@barqjs/aria/date";
import { createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import { ChevronDown } from "@barqjs/lucide/icons/chevron-down";
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
  width: calc(var(--spacing) * 72);
`;

const trigger = css`
  justify-content: flex-start;
  padding-inline: calc(var(--spacing) * 2.5);
  font-weight: 400;
`;

const end = css`
  margin-inline-start: auto;
`;

const panel = css`
  width: auto;
  padding: 0;
`;

const footer = css`
  display: flex;
  gap: calc(var(--spacing) * 2);
  border-top: 1px solid var(--border);
  padding: calc(var(--spacing) * 2);
`;

const full = css`
  width: 100%;
`;

const long = (date: CalendarDate): string =>
  date.toDate().toLocaleDateString("en-US", { dateStyle: "long" });

export default function DataPickerWithDropdowns() {
  const [date, setDate] = createSignal<CalendarDate | null>(null);
  const [open, setOpen] = createSignal(false);

  return (
    <Field class={field}>
      <Popover isOpen={open()} onOpenChange={setOpen}>
        <FieldLabel for="date-picker-with-dropdowns">Date</FieldLabel>
        <PopoverTrigger>
          <Button variant="outline" id="date-picker-with-dropdowns" class={trigger}>
            {() => {
              const picked = date();
              return picked === null ? <span>Pick a date</span> : long(picked);
            }}
            <ChevronDown class={end} />
          </Button>
        </PopoverTrigger>
        <PopoverContent class={panel} align="start">
          <Calendar
            mode="single"
            aria-label="Date"
            selected={date()}
            onSelect={setDate}
            captionLayout="dropdown"
          />
          <div class={footer}>
            <Button variant="outline" size="sm" class={full} onPress={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </Field>
  );
}
