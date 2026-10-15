import { CalendarDate } from "@barqjs/aria/date";
import { createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Calendar } from "@barqjs/ui";

const today = new CalendarDate(2026, 6, 12);

const calendar = css`
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
`;

export default function CalendarDemo() {
  const [date, setDate] = createSignal<CalendarDate | null>(today);

  return (
    <Calendar
      mode="single"
      aria-label="Date"
      today={today}
      selected={date()}
      onSelect={setDate}
      class={calendar}
      captionLayout="dropdown"
    />
  );
}
