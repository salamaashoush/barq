import { CalendarDate, startOfMonth } from "@barqjs/aria/date";
import { createSignal, For } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Button, Calendar, Card, CardContent, CardFooter } from "@barqjs/ui";

const today = new CalendarDate(2026, 2, 10);

interface Preset {
  readonly label: string;
  readonly value: number;
}

const presets: readonly Preset[] = [
  { label: "Today", value: 0 },
  { label: "Tomorrow", value: 1 },
  { label: "In 3 days", value: 3 },
  { label: "In a week", value: 7 },
  { label: "In 2 weeks", value: 14 },
];

const card = css`
  margin-inline: auto;
  width: fit-content;
  max-width: 300px;
`;

const calendar = css`
  padding: 0;
  --cell-size: calc(var(--spacing) * 9.5);
`;

const footer = css`
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--spacing) * 2);
`;

const preset = css`
  flex: 1;
`;

export default function CalendarPresets() {
  const [date, setDate] = createSignal<CalendarDate | null>(new CalendarDate(2026, 2, 12));
  const [currentMonth, setCurrentMonth] = createSignal(startOfMonth(today));

  return (
    <Card class={card} size="sm">
      <CardContent>
        <Calendar
          mode="single"
          aria-label="Date"
          today={today}
          selected={date()}
          onSelect={setDate}
          month={currentMonth()}
          onMonthChange={setCurrentMonth}
          fixedWeeks
          class={calendar}
        />
      </CardContent>
      <CardFooter class={footer}>
        <For each={() => presets}>
          {(item: Preset) => (
            <Button
              variant="outline"
              size="sm"
              class={preset}
              onPress={() => {
                const newDate = today.add({ days: item.value });
                setDate(newDate);
                setCurrentMonth(startOfMonth(newDate));
              }}
            >
              {item.label}
            </Button>
          )}
        </For>
      </CardFooter>
    </Card>
  );
}
