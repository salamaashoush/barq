import { CalendarDate } from "@barqjs/aria/date";
import { provideLocale } from "@barqjs/aria/i18n";
import { createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import { ChevronDown } from "@barqjs/lucide/icons/chevron-down";
import {
  Button,
  Calendar,
  DirectionProvider,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@barqjs/ui";

const trigger = css`
  width: 212px;
  justify-content: space-between;
  text-align: start;
  font-weight: 400;

  &[data-empty="true"] {
    color: var(--muted-foreground);
  }
`;

const panel = css`
  width: auto;
  padding: 0;
`;

const long = (date: CalendarDate): string =>
  date.toDate().toLocaleDateString("ar-EG", { dateStyle: "long" });

export default function DatePickerRtl() {
  provideLocale("ar-EG");
  const [date, setDate] = createSignal<CalendarDate | null>(null);

  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl" lang="ar-EG">
        <Popover>
          <PopoverTrigger>
            <Button
              variant="outline"
              data-empty={date() === null ? "true" : "false"}
              class={trigger}
            >
              {() => {
                const picked = date();
                return picked === null ? <span>اختر تاريخًا</span> : long(picked);
              }}
              <ChevronDown />
            </Button>
          </PopoverTrigger>
          <PopoverContent class={panel} align="start" dir="rtl">
            <Calendar
              mode="single"
              aria-label="التاريخ"
              selected={date()}
              onSelect={setDate}
              defaultMonth={date() ?? undefined}
            />
          </PopoverContent>
        </Popover>
      </div>
    </DirectionProvider>
  );
}
