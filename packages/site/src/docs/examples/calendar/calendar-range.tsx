import type { DateRange } from "@barqjs/aria/calendar";
import { CalendarDate } from "@barqjs/aria/date";
import { createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Calendar, Card, CardContent } from "@barqjs/ui";

const today = new CalendarDate(2026, 2, 20);
const earliest = new CalendarDate(1900, 1, 1);
const start = new CalendarDate(2026, 1, 12);

const card = css`
  margin-inline: auto;
  width: fit-content;
  padding: 0;
`;

const content = css`
  padding: 0;
`;

export default function CalendarRange() {
  const [dateRange, setDateRange] = createSignal<DateRange | null>({
    start,
    end: start.add({ days: 30 }),
  });

  return (
    <Card class={card}>
      <CardContent class={content}>
        <Calendar
          mode="range"
          aria-label="Date range"
          today={today}
          defaultMonth={start}
          selected={dateRange()}
          onSelect={setDateRange}
          numberOfMonths={2}
          disabled={(date: CalendarDate) => date.compare(today) > 0 || date.compare(earliest) < 0}
        />
      </CardContent>
    </Card>
  );
}
