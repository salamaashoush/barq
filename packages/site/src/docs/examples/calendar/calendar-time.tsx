import { CalendarDate } from "@barqjs/aria/date";
import { createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Clock2 } from "@barqjs/lucide/icons/clock-2";
import {
  Calendar,
  Card,
  CardContent,
  CardFooter,
  Field,
  FieldGroup,
  FieldLabel,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@barqjs/ui";

const today = new CalendarDate(2026, 6, 10);

const card = css`
  margin-inline: auto;
  width: fit-content;
`;

const calendar = css`
  padding: 0;
`;

const footer = css`
  background-color: var(--card);
`;

const time = css`
  appearance: none;

  &::-webkit-calendar-picker-indicator {
    display: none;
    appearance: none;
  }
`;

const clock = css`
  color: var(--muted-foreground);
`;

export default function CalendarTime() {
  const [date, setDate] = createSignal<CalendarDate | null>(new CalendarDate(2026, 6, 12));

  return (
    <Card size="sm" class={card}>
      <CardContent>
        <Calendar
          mode="single"
          aria-label="Date"
          today={today}
          selected={date()}
          onSelect={setDate}
          class={calendar}
        />
      </CardContent>
      <CardFooter class={footer}>
        <FieldGroup>
          <Field>
            <FieldLabel for="calendar-time-from">Start Time</FieldLabel>
            <InputGroup>
              <InputGroupInput
                id="calendar-time-from"
                type="time"
                step="1"
                defaultValue="10:30:00"
                class={time}
              />
              <InputGroupAddon>
                <Clock2 class={clock} />
              </InputGroupAddon>
            </InputGroup>
          </Field>
          <Field>
            <FieldLabel for="calendar-time-to">End Time</FieldLabel>
            <InputGroup>
              <InputGroupInput
                id="calendar-time-to"
                type="time"
                step="1"
                defaultValue="12:30:00"
                class={time}
              />
              <InputGroupAddon>
                <Clock2 class={clock} />
              </InputGroupAddon>
            </InputGroup>
          </Field>
        </FieldGroup>
      </CardFooter>
    </Card>
  );
}
