import { CalendarDate } from "@barqjs/aria/date";
import { provideLocale } from "@barqjs/aria/i18n";
import { createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Calendar, DirectionProvider } from "@barqjs/ui";

const today = new CalendarDate(2026, 6, 12);

const calendar = css`
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  --cell-size: calc(var(--spacing) * 9);
`;

export default function CalendarRtl() {
  provideLocale("ar-EG");
  const [date, setDate] = createSignal<CalendarDate | null>(today);

  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl" lang="ar-EG">
        <Calendar
          mode="single"
          aria-label="التاريخ"
          today={today}
          selected={date()}
          onSelect={setDate}
          class={calendar}
          captionLayout="dropdown"
        />
      </div>
    </DirectionProvider>
  );
}
