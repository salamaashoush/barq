import { afterEach, describe, expect, test } from "bun:test";
import { type Child, DEV, createSignal } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render } from "@barqjs/testing";

import { hydrates, settle, wears } from "../test-arc.ts";
import {
  Bytes,
  Currency,
  Duration,
  FormattedDate,
  FormattedNumber,
  RelativeTime,
  durationParts,
  durationText,
  formattedStyles,
} from "./format.tsx";

function slot(name: string): HTMLElement {
  return document.querySelector(`[data-slot="${name}"]`) as HTMLElement;
}

function Locale(props: { tag: string; children?: Child }) {
  provideLocale(props.tag);
  return <>{props.children}</>;
}

const MOMENT = "2026-03-01T10:00:00.000Z";

describe("RelativeTime", () => {
  const realNow = Date.now;
  afterEach(() => {
    Date.now = realNow;
  });

  test("measures from the clock once hydrated, with the absolute moment in its title", async () => {
    Date.now = () => new Date(MOMENT).getTime() + 3 * 60_000;
    render(() => <RelativeTime value={MOMENT} timeZone="UTC" />);
    await settle();
    const time = slot("relative-time");
    expect(time.tagName).toBe("TIME");
    expect(time.textContent).toBe("3 minutes ago");
    expect(time.getAttribute("datetime")).toBe(MOMENT);
    expect(time.getAttribute("title")).toBe("March 1, 2026 at 10:00 AM");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("writes the future, and 'yesterday' rather than '1 day ago' unless asked", async () => {
    Date.now = () => new Date(MOMENT).getTime();
    render(() => (
      <>
        <RelativeTime value={new Date(MOMENT).getTime() + 2 * 86_400_000} />
        <RelativeTime value={new Date(MOMENT).getTime() - 86_400_000} />
        <RelativeTime value={new Date(MOMENT).getTime() - 86_400_000} wording="always" />
      </>
    ));
    await settle();
    const words = [...document.querySelectorAll('[data-slot="relative-time"]')].map(
      (one) => one.textContent,
    );
    expect(words).toEqual(["in 2 days", "yesterday", "1 day ago"]);
  });

  test("keeps itself current as time passes", async () => {
    let now = new Date(MOMENT).getTime() + 5000;
    Date.now = () => now;
    render(() => <RelativeTime value={MOMENT} />);
    await settle();
    expect(slot("relative-time").textContent).toBe("5 seconds ago");
    now += 2000;
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await settle();
    expect(slot("relative-time").textContent).toBe("7 seconds ago");
  });

  test("a value that changes reschedules the refresh, read where the effect tracks it", async () => {
    let now = new Date(MOMENT).getTime() + 5000;
    Date.now = () => now;
    const [value, setValue] = createSignal<number>(new Date(MOMENT).getTime());
    const capture = DEV.diagnostics.capture();
    render(() => <RelativeTime value={value()} />);
    await settle();
    expect(slot("relative-time").textContent).toBe("5 seconds ago");
    setValue(now - 50 * 60_000);
    await settle();
    expect(slot("relative-time").textContent).toBe("50 minutes ago");
    now += 1000;
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await settle();
    expect(slot("relative-time").textContent).toBe("50 minutes ago");
    const strict = capture.stop().filter((event) => event.code === "STRICT_READ_UNTRACKED");
    expect(strict).toEqual([]);
  });

  test("speaks the locale, and its words run right to left in Arabic", async () => {
    Date.now = () => new Date(MOMENT).getTime() + 2 * 3_600_000;
    render(() => (
      <Locale tag="ar-EG">
        <div dir="rtl">
          <RelativeTime value={MOMENT} length="short" />
        </div>
      </Locale>
    ));
    await settle();
    expect(slot("relative-time").textContent).toBe(
      new Intl.RelativeTimeFormat("ar-EG", { style: "short" }).format(-2, "hour"),
    );
  });

  test("the server and the hydrating page agree on `now`, or on the absolute date", async () => {
    const result = await hydrates(`
      import { RelativeTime } from "<arc>";
      export function Page() {
        return (
          <p>
            <RelativeTime value="${MOMENT}" now="2026-03-01T12:00:00.000Z" live={false} />
            <RelativeTime value="${MOMENT}" live={false} />
          </p>
        );
      }
    `);
    const [shared, plain] = [
      ...result.container.querySelectorAll('[data-slot="relative-time"]'),
    ] as HTMLElement[];
    expect(shared?.getAttribute("datetime")).toBe(MOMENT);
    expect(plain?.getAttribute("datetime")).toBe(MOMENT);
    result.unmount();
  });
});

describe("FormattedDate", () => {
  test("a time element in the locale and the zone it is given", async () => {
    render(() => (
      <>
        <FormattedDate value={MOMENT} timeZone="UTC" />
        <Locale tag="de-DE">
          <FormattedDate
            value={MOMENT}
            timeZone="Africa/Cairo"
            options={{ timeStyle: "short" }}
            classes={{ root: "r" }}
          />
        </Locale>
      </>
    ));
    await settle();
    const [one, two] = [
      ...document.querySelectorAll('[data-slot="formatted-date"]'),
    ] as HTMLElement[];
    expect(one?.textContent).toBe("Mar 1, 2026");
    expect(one?.getAttribute("datetime")).toBe(MOMENT);
    expect(two?.textContent).toBe("12:00");
    expect(two?.classList.contains("r")).toBe(true);
  });

  test("with no zone, the server and the hydrating page write UTC", async () => {
    const result = await hydrates(`
      import { FormattedDate } from "<arc>";
      export function Page() {
        return <p><FormattedDate value="${MOMENT}" options={{ dateStyle: "long" }} /></p>;
      }
    `);
    expect(result.container.querySelector("time")?.getAttribute("datetime")).toBe(MOMENT);
    result.unmount();
  });
});

describe("numbers", () => {
  test("FormattedNumber takes what Intl.NumberFormat takes, and lines up its figures", () => {
    render(() => (
      <>
        <FormattedNumber value={0.125} options={{ style: "percent", maximumFractionDigits: 1 }} />
        <Locale tag="ar-EG">
          <FormattedNumber value={18_400} options={{ notation: "compact" }} />
        </Locale>
      </>
    ));
    const [one, two] = [
      ...document.querySelectorAll('[data-slot="formatted-number"]'),
    ] as HTMLElement[];
    expect(one?.textContent).toBe("12.5%");
    expect(two?.textContent).toBe(
      new Intl.NumberFormat("ar-EG", { notation: "compact" }).format(18_400),
    );
    expect(wears(one, formattedStyles({ numeric: true }).root)).toBe(true);
  });

  test("Currency writes the amount in its currency, compact, signed or bracketed", () => {
    render(() => (
      <>
        <Currency value={1234.5} currency="USD" />
        <Currency value={-80} currency="EUR" accounting />
        <Currency value={18_400} currency="USD" compact />
        <Currency value={12} currency="USD" sign="exceptZero" />
      </>
    ));
    const words = [...document.querySelectorAll('[data-slot="currency"]')].map(
      (one) => one.textContent,
    );
    expect(words).toEqual(["$1,234.50", "(€80.00)", "$18K", "+$12.00"]);
  });

  test("Bytes and Duration write sizes and spans a person reads", () => {
    render(() => (
      <>
        <Bytes value={2_400_000} />
        <Duration value={3_909_000} />
        <Duration value={3_909_000} length="digital" />
        <Duration value={450} length="long" />
      </>
    ));
    expect(slot("bytes").textContent).toBe("2.4 MB");
    const spans = [...document.querySelectorAll('[data-slot="duration"]')].map(
      (one) => one.textContent,
    );
    expect(spans).toEqual(["1 hr, 5 min", "1:05:09", "450 milliseconds"]);
  });

  test("a span is cut to its largest units", () => {
    expect(durationParts(3_909_000)).toEqual({ hours: 1, minutes: 5 });
    expect(durationParts(3_909_000, 3)).toEqual({ hours: 1, minutes: 5, seconds: 9 });
    expect(durationParts(90_061_000, 1)).toEqual({ days: 1 });
    expect(durationParts(800)).toEqual({ milliseconds: 800 });
    expect(durationParts(0)).toEqual({ seconds: 0 });
  });

  test("no time at all is still written, as zero of the smallest unit", () => {
    expect(durationText(0, "en-US", { length: "long", units: 3 })).toBe("0 seconds");
    expect(durationText(0, "en-US")).toBe("0 sec");
    expect(durationText(400, "en-US", { length: "long" })).toBe("400 milliseconds");
  });

  test("updates with the value and takes a class", async () => {
    const [value, setValue] = createSignal(5);
    render(() => <FormattedNumber value={value()} class="mine" numeric={false} />);
    setValue(6);
    await settle();
    expect(slot("formatted-number").textContent).toBe("6");
    expect(slot("formatted-number").classList.contains("mine")).toBe(true);
    expect(wears(slot("formatted-number"), formattedStyles({ numeric: false }).root)).toBe(true);
  });

  test("hydrate what the server wrote", async () => {
    const result = await hydrates(`
      import { Bytes, Currency, Duration, FormattedNumber } from "<arc>";
      export function Page() {
        return (
          <p>
            <FormattedNumber value={1234} />
            <Currency value={5} currency="USD" />
            <Bytes value={1024} />
            <Duration value={65000} />
          </p>
        );
      }
    `);
    expect(result.container.textContent).toContain("1,234");
    expect(result.container.textContent).toContain("$5.00");
    result.unmount();
  });
});
