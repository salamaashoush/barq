import { CalendarDate } from "@barqjs/aria/date";
import { DateRangePicker } from "@barqjs/ui";

export default function DateRangePickerExample() {
  return (
    <DateRangePicker
      aria-label="Stay"
      defaultValue={{
        start: new CalendarDate(2022, 1, 20),
        end: new CalendarDate(2022, 2, 9),
      }}
    />
  );
}
