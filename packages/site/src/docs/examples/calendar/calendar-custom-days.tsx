import type { DateRange } from "@barqjs/aria/calendar";
import { CalendarDate, getDayOfWeek } from "@barqjs/aria/date";
import { createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Calendar, Card, CardContent, type CalendarDayModifiers } from "@barqjs/ui";

const today = new CalendarDate(2026, 12, 1);
const start = new CalendarDate(2026, 12, 8);
const monthName = new Intl.DateTimeFormat("en-US", { month: "long" });

const card = css`
  margin-inline: auto;
  width: fit-content;
  padding: 0;
`;

const content = css`
  padding: 0;
`;

const calendar = css`
  --cell-size: calc(var(--spacing) * 10);

  @media (width >= 48rem) {
    --cell-size: calc(var(--spacing) * 12);
  }
`;

function isWeekend(date: CalendarDate): boolean {
  const day = getDayOfWeek(date);
  return day === 0 || day === 6;
}

export default function CalendarCustomDays() {
  const [range, setRange] = createSignal<DateRange | null>({
    start,
    end: start.add({ days: 10 }),
  });

  return (
    <Card class={card}>
      <CardContent class={content}>
        <Calendar
          mode="range"
          aria-label="Stay"
          today={today}
          defaultMonth={start}
          selected={range()}
          onSelect={setRange}
          numberOfMonths={1}
          captionLayout="dropdown"
          class={calendar}
          formatters={{
            formatMonthDropdown: (date: CalendarDate) => monthName.format(date.toDate()),
          }}
          renderDay={(date: CalendarDate, modifiers: CalendarDayModifiers) => (
            <>
              {date.day}
              {modifiers.outside ? null : <span>{isWeekend(date) ? "$120" : "$100"}</span>}
            </>
          )}
        />
      </CardContent>
    </Card>
  );
}
