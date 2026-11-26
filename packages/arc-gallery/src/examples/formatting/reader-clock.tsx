import { type ParentProps, createSignal } from "@barqjs/core";
import { CalendarDate } from "@barqjs/aria/date";
import {
  Calendar,
  ClockPreference,
  DescriptionList,
  FormattedDate,
  FormattedNumber,
  Interval,
  type ReaderClock,
  RelativeTime,
  Stack,
  provideReaderClock,
} from "@barqjs/arc";

const INCIDENT = "2026-11-20T16:45:00Z";
const STARTED = "2026-11-26T07:05:00Z";

interface ClockedProps extends ParentProps {
  clock: ReaderClock;
}

function Clocked(props: ClockedProps) {
  const locale = provideReaderClock(() => props.clock);
  return (
    <div lang={locale.lang()} dir={locale.dir()}>
      <Stack gap={6}>{props.children}</Stack>
    </div>
  );
}

export default function ReaderClockExample() {
  const [clock, setClock] = createSignal<ReaderClock>({ zone: "local", hours: 12 });
  return (
    <Stack gap={6}>
      <ClockPreference value={clock()} onChange={setClock} parts={["zone", "hours", "weekStart"]} />
      <Clocked clock={clock()}>
        <DescriptionList
          columns={2}
          items={[
            {
              term: "Incident opened",
              details: (
                <FormattedDate
                  value={INCIDENT}
                  options={{ dateStyle: "medium", timeStyle: "short" }}
                />
              ),
            },
            { term: "Run started", details: <RelativeTime value={STARTED} exact /> },
            {
              term: "A calendar day, in every zone",
              details: <FormattedDate value="2026-11-26" options={{ dateStyle: "full" }} />,
            },
            {
              term: "Uptime, never rounded up",
              details: (
                <FormattedNumber
                  value={0.99996}
                  truncate
                  options={{ style: "percent", maximumFractionDigits: 2 }}
                />
              ),
            },
            { term: "Checks run", details: <Interval value={300_000} /> },
            { term: "Digest", details: <Interval value={86_400_000} /> },
            { term: "Backups", details: <Interval value={5_400_000} /> },
          ]}
        />
        <Calendar aria-label="November 2026" defaultFocusedValue={new CalendarDate(2026, 11, 1)} />
      </Clocked>
    </Stack>
  );
}
