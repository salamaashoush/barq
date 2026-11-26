import { createSignal } from "@barqjs/core";
import { CalendarFeed, SettingsSection, Stack } from "@barqjs/arc";

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function token(): string {
  return Math.random().toString(36).slice(2, 12);
}

export default function CalendarFeedExample() {
  const [shifts, setShifts] = createSignal(
    "https://status.example.com/feeds/on-call/salama/7f3k2m9q1x.ics",
  );
  return (
    <Stack gap={6}>
      <SettingsSection
        heading="Your shifts in a calendar"
        description="Subscribe once and your on-call shifts stay up to date in your own calendar."
      >
        <CalendarFeed
          url={shifts()}
          name="Acme on-call"
          onReset={async () => {
            await wait(600);
            const next = `https://status.example.com/feeds/on-call/salama/${token()}.ics`;
            setShifts(next);
            return next;
          }}
        />
      </SettingsSection>
      <SettingsSection
        heading="School calendar"
        description="A private link, shown once when it is made. Make a new one to see it."
      >
        <CalendarFeed
          shownOnce
          name="Acme Academy"
          existing={{ createdAt: "2026-09-01T08:00:00Z", lastReadAt: "2026-11-25T06:12:00Z" }}
          onReset={async () => {
            await wait(600);
            return `https://school.example.com/feeds/acme/${token()}.ics`;
          }}
        />
      </SettingsSection>
      <SettingsSection heading="Holidays" description="No link yet.">
        <CalendarFeed
          shownOnce
          onReset={async () => {
            await wait(600);
            return `https://school.example.com/feeds/holidays/${token()}.ics`;
          }}
        />
      </SettingsSection>
    </Stack>
  );
}
