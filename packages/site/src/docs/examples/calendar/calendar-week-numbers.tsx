import { CalendarDate } from "@barqjs/aria/date";
import { createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Calendar, Card, CardContent } from "@barqjs/ui";

const today = new CalendarDate(2026, 2, 1);

const card = css`
  margin-inline: auto;
  width: fit-content;
  padding: 0;
`;

const content = css`
  padding: 0;
`;

export default function CalendarWeekNumbers() {
  const [date, setDate] = createSignal<CalendarDate | null>(new CalendarDate(2026, 2, 3));

  return (
    <Card class={card}>
      <CardContent class={content}>
        <Calendar
          mode="single"
          aria-label="Date"
          today={today}
          defaultMonth={new CalendarDate(2026, 2, 3)}
          selected={date()}
          onSelect={setDate}
          showWeekNumber
        />
      </CardContent>
    </Card>
  );
}
