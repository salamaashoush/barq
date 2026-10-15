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
  overflow: hidden;
  padding: 0;
`;

export default function DatePickerDob() {
  const [open, setOpen] = createSignal(false);
  const [date, setDate] = createSignal<CalendarDate | null>(null);

  return (
    <Field class={field}>
      <FieldLabel for="date-picker-dob">Date of birth</FieldLabel>
      <Popover isOpen={open()} onOpenChange={setOpen}>
        <PopoverTrigger>
          <Button variant="outline" id="date-picker-dob" class={trigger}>
            {() => date()?.toDate().toLocaleDateString() ?? "Select date"}
          </Button>
        </PopoverTrigger>
        <PopoverContent class={panel} align="start">
          <Calendar
            mode="single"
            aria-label="Date of birth"
            selected={date()}
            defaultMonth={date() ?? undefined}
            captionLayout="dropdown"
            onSelect={(next: CalendarDate | null) => {
              setDate(next);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </Field>
  );
}
