import { CalendarDate } from "@barqjs/aria/date";
import { css } from "@barqjs/css";
import { DatePicker } from "@barqjs/ui";

const row = css`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: calc(var(--spacing) * 2);
`;

export default function DatePickerComponent() {
  return (
    <div class={row}>
      <DatePicker aria-label="Due date" />
      <DatePicker
        aria-label="Start date"
        defaultValue={new CalendarDate(2022, 1, 20)}
        presets={[
          { label: "Today", value: 0 },
          { label: "Tomorrow", value: 1 },
          { label: "In a week", value: 7 },
        ]}
      />
    </div>
  );
}
