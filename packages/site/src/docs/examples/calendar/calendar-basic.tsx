import { CalendarDate } from "@barqjs/aria/date";
import { css } from "@barqjs/css";
import { Calendar } from "@barqjs/ui";

const today = new CalendarDate(2026, 6, 12);

const calendar = css`
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
`;

export default function CalendarBasic() {
  return <Calendar mode="single" aria-label="Date" today={today} class={calendar} />;
}
