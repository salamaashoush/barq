import { describe, expect, test } from "bun:test";
import { createSignal } from "@barqjs/core";
import { useLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user } from "@barqjs/testing";

import {
  type ReaderClock,
  clockLocale,
  parseReaderClock,
  serializeReaderClock,
} from "../lib/reader-clock.ts";
import { hydrates, settle } from "../test-arc.ts";
import { ClockPreference } from "./clock.tsx";
import { FormattedDate, FormattedNumber, Interval } from "./format.tsx";
import { ArcProvider } from "./provider.tsx";

const AT = "2026-01-05T13:35:00Z";

function LocaleTag() {
  const locale = useLocale();
  return <span data-testid="tag">{locale().locale}</span>;
}

describe("the reader clock", () => {
  test("is written into the locale tag's Unicode extension", () => {
    expect(clockLocale("en-US", { hours: 24 })).toBe("en-US-u-hc-h23");
    expect(clockLocale("en-GB", { hours: 12, weekStart: "sun" })).toBe("en-GB-u-fw-sun-hc-h12");
    expect(clockLocale("ar-EG", { weekStart: "sat" })).toBe("ar-EG-u-fw-sat");
    expect(clockLocale("en-US-u-fw-mon", { weekStart: "tue" })).toBe("en-US-u-fw-tue");
    expect(clockLocale("en-US", { hours: "auto", weekStart: "auto" })).toBe("en-US");
    expect(clockLocale("en-US", undefined)).toBe("en-US");
  });

  test("keeps in one cookie-safe string, anything unknown falling back", () => {
    const clock: ReaderClock = { zone: "America/New_York", hours: 24, weekStart: "mon" };
    expect(serializeReaderClock(clock)).toBe("America%2FNew_York.24.mon");
    expect(parseReaderClock(serializeReaderClock(clock))).toEqual(clock);
    expect(parseReaderClock("utc.13.someday")).toEqual({
      zone: "utc",
      hours: "auto",
      weekStart: "auto",
    });
    expect(parseReaderClock(undefined)).toEqual({
      zone: "local",
      hours: "auto",
      weekStart: "auto",
    });
  });

  test("ArcProvider's clock reaches every time below it, and follows a change", async () => {
    const [clock, setClock] = createSignal<ReaderClock>({ zone: "utc", hours: 24 });
    render(() => (
      <ArcProvider locale="en-US" clock={clock()} toaster={false} colorScheme={false}>
        <FormattedDate value={AT} options={{ timeStyle: "short" }} />
        <LocaleTag />
      </ArcProvider>
    ));
    await settle();
    const time = document.querySelector('[data-slot="formatted-date"]') as HTMLElement;
    expect(time.textContent).toBe("13:35");
    setClock({ zone: "Asia/Tokyo", hours: 12, weekStart: "mon" });
    await settle();
    expect(time.textContent).toBe("10:35 PM");
    expect(screen.getByTestId("tag").textContent).toBe("en-US-u-fw-mon-hc-h12");
  });

  test("before hydration a local clock writes in the zone the server was told of", async () => {
    const result = await hydrates(`
      import { ArcProvider, FormattedDate } from "<arc>";
      export function Page() {
        return <ArcProvider locale="en-US" clock={{ zone: "local", localZone: "Africa/Cairo", hours: 24 }} toaster={false} colorScheme={false}>
          <FormattedDate value="2026-01-05T13:35:00Z" options={{ timeStyle: "short" }} />
        </ArcProvider>;
      }
    `);
    expect(result.html).toContain("15:35");
    result.unmount();
  });
});

describe("ClockPreference", () => {
  test("cards for the zone and the clock, each with an example, that set the clock", async () => {
    const changes: ReaderClock[] = [];
    render(() => (
      <ArcProvider locale="en-US" toaster={false} colorScheme={false}>
        <ClockPreference
          defaultValue={{ zone: "local", hours: 12 }}
          parts={["zone", "hours", "weekStart"]}
          onChange={(next: ReaderClock) => changes.push(next)}
        />
      </ArcProvider>
    ));
    await settle();
    expect(screen.getByRole("radiogroup", { name: "Time zone" })).toBeDefined();
    const hours = screen.getByRole("radiogroup", { name: "Clock" });
    expect(hours.textContent).toContain("1:35 PM");
    expect(hours.textContent).toContain("13:35");
    expect(
      screen.getByRole("radio", { name: "12-hour" }).getAttribute("aria-checked") ?? "true",
    ).not.toBe("false");
    await user.click(screen.getByRole("radio", { name: "24-hour" }));
    await settle();
    expect(changes.at(-1)).toEqual({ zone: "local", hours: 24 });
    await user.click(screen.getByRole("radio", { name: "UTC" }));
    await settle();
    expect(changes.at(-1)).toEqual({ zone: "utc", hours: 24 });
    await user.click(screen.getByRole("radio", { name: "Monday" }));
    await settle();
    expect(changes.at(-1)?.weekStart).toBe("mon");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a server's control is hydrated in place", async () => {
    const result = await hydrates(`
      import { ClockPreference } from "<arc>";
      export function Page() {
        return <ClockPreference defaultValue={{ zone: "utc", hours: 24 }} />;
      }
    `);
    expect(result.container.textContent).toContain("24-hour");
    result.unmount();
  });
});

describe("the formatting sweep", () => {
  test("a date-only value is that day in every zone", () => {
    render(() => (
      <FormattedDate
        value="2026-11-26"
        timeZone="America/Los_Angeles"
        options={{ dateStyle: "long" }}
      />
    ));
    const time = document.querySelector('[data-slot="formatted-date"]') as HTMLElement;
    expect(time.textContent).toBe("November 26, 2026");
    expect(time.getAttribute("datetime")).toBe("2026-11-26");
  });

  test("a truncated percent never rounds up to a whole", () => {
    render(() => (
      <FormattedNumber
        value={0.99996}
        truncate
        options={{ style: "percent", maximumFractionDigits: 2 }}
      />
    ));
    expect(document.querySelector('[data-slot="formatted-number"]')?.textContent).toBe("99.99%");
  });

  test("an interval in words", () => {
    render(() => (
      <>
        <Interval value={300_000} />
        <Interval value={3_600_000} />
        <Interval value={86_400_000} />
        <Interval value={60_000} />
        <Interval value={5_400_000} />
      </>
    ));
    expect(
      [...document.querySelectorAll('[data-slot="interval"]')].map((one) => one.textContent),
    ).toEqual(["Every 5 minutes", "Hourly", "Daily", "Every minute", "Every 1 hour, 30 minutes"]);
  });
});
