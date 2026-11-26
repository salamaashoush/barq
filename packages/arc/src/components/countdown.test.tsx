import { afterEach, describe, expect, test } from "bun:test";
import { type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen } from "@barqjs/testing";

import { hydrates, settle, wears } from "../test-arc.ts";
import { Countdown, countdownStyles } from "./countdown.tsx";

const DEADLINE = Date.parse("2026-03-01T10:00:00.000Z");
const realNow = Date.now;

afterEach(() => {
  Date.now = realNow;
});

function timer(): HTMLElement {
  return document.querySelector('[data-slot="countdown"]') as HTMLElement;
}

function said(): string[] {
  const region = document.querySelector("[data-barq-live-announcer]");
  return [...(region?.querySelectorAll('[role="log"] > div') ?? [])].map(
    (entry) => entry.textContent ?? "",
  );
}

async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 1100));
  await settle();
}

describe("Countdown", () => {
  test("a named timer counting down, toned at its thresholds, told politely as each passes", async () => {
    let now = DEADLINE - 65_000;
    Date.now = () => now;
    render(() => <Countdown to={DEADLINE} label="Time left" warnAt={120_000} dangerAt={60_000} />);
    await settle();
    const element = screen.getByRole("timer", { name: "Time left" });
    expect(element.textContent).toBe("01:05");
    expect(element.getAttribute("data-tone")).toBe("warning");
    expect(wears(element, countdownStyles({ tone: "warning" }).root)).toBe(true);
    expect(await ariaViolations(document.body)).toEqual([]);
    now = DEADLINE - 30_000;
    await tick();
    expect(timer().textContent).toBe("00:30");
    expect(timer().getAttribute("data-tone")).toBe("danger");
    expect(said()).toContain("30 seconds left");
  });

  test("at the deadline it says time is up, at once, and calls back once", async () => {
    let now = DEADLINE - 1000;
    Date.now = () => now;
    let expired = 0;
    render(() => <Countdown to={DEADLINE} onExpire={() => expired++} />);
    await settle();
    now = DEADLINE + 500;
    await tick();
    expect(timer().textContent).toBe("Time is up");
    expect(timer().hasAttribute("data-expired")).toBe(true);
    await tick();
    expect(expired).toBe(1);
    expect(said()).toContain("Time is up");
  });

  test("counts up from a start in words, in the locale and right to left", async () => {
    Date.now = () => DEADLINE + 90_000;
    function Arabic(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <>
        <Countdown from={DEADLINE} length="short" />
        <Arabic>
          <Countdown from={DEADLINE} class="mine" />
        </Arabic>
      </>
    ));
    await settle();
    const [english, arabic] = [...document.querySelectorAll('[data-slot="countdown"]')];
    expect(english?.textContent).toBe("1 min, 30 sec");
    expect(english?.getAttribute("data-tone")).toBe("neutral");
    expect(arabic?.textContent).toBe("٠١:٣٠");
    expect(arabic?.classList.contains("mine")).toBe(true);
  });

  test("a server's countdown, from the request's time or a dash, is hydrated in place", async () => {
    const result = await hydrates(`
      import { Countdown } from "<arc>";
      export function Page() {
        return (
          <p>
            <Countdown to="2099-03-01T10:05:00.000Z" now="2099-03-01T10:00:00.000Z" />
            <Countdown to="2099-03-01T10:05:00.000Z" live={false} />
          </p>
        );
      }
    `);
    expect(result.container.querySelectorAll('[role="timer"]')).toHaveLength(2);
    result.unmount();
  });
});
