import { CalendarDate } from "@barqjs/aria/date";
import { createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Calendar as CalendarIcon } from "@barqjs/lucide/icons/calendar";
import {
  Calendar,
  Field,
  FieldLabel,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  Popover,
  PopoverContent,
  PopoverTrigger,
  srOnly,
} from "@barqjs/ui";

const field = css`
  margin-inline: auto;
  width: calc(var(--spacing) * 48);
`;

const panel = css`
  width: auto;
  overflow: hidden;
  padding: 0;
`;

function formatDate(date: CalendarDate | null): string {
  if (date === null) return "";
  return date
    .toDate()
    .toLocaleDateString("en-US", { day: "2-digit", month: "long", year: "numeric" });
}

function parse(text: string): CalendarDate | null {
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return new CalendarDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export default function DatePickerInput() {
  const [open, setOpen] = createSignal(false);
  const [date, setDate] = createSignal<CalendarDate | null>(new CalendarDate(2025, 6, 1));
  const [month, setMonth] = createSignal<CalendarDate>(new CalendarDate(2025, 6, 1));
  const [value, setValue] = createSignal(formatDate(date()));

  return (
    <Field class={field}>
      <FieldLabel for="date-picker-input">Subscription Date</FieldLabel>
      <InputGroup>
        <InputGroupInput
          id="date-picker-input"
          value={value()}
          placeholder="June 01, 2025"
          onInput={(event: Event) => {
            const text = (event.currentTarget as HTMLInputElement).value;
            setValue(text);
            const next = parse(text);
            if (next !== null) {
              setDate(next);
              setMonth(next);
            }
          }}
          onKeyDown={(event: KeyboardEvent) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
            }
          }}
        />
        <InputGroupAddon align="inline-end">
          <Popover isOpen={open()} onOpenChange={setOpen}>
            <PopoverTrigger>
              <InputGroupButton variant="ghost" size="icon-xs" aria-label="Select date">
                <CalendarIcon />
                <span class={srOnly}>Select date</span>
              </InputGroupButton>
            </PopoverTrigger>
            <PopoverContent class={panel} align="end" alignOffset={-8} sideOffset={10}>
              <Calendar
                mode="single"
                aria-label="Subscription date"
                selected={date()}
                month={month()}
                onMonthChange={setMonth}
                onSelect={(next: CalendarDate | null) => {
                  setDate(next);
                  setValue(formatDate(next));
                  setOpen(false);
                }}
              />
            </PopoverContent>
          </Popover>
        </InputGroupAddon>
      </InputGroup>
    </Field>
  );
}
