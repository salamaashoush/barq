import { afterEach, describe, expect, test } from "bun:test";
import { type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { SessionExpiryWarning } from "./session-expiry-warning.tsx";

const END = Date.parse("2026-03-01T10:00:00.000Z");
const realNow = Date.now;

afterEach(() => {
  Date.now = realNow;
});

describe("SessionExpiryWarning", () => {
  test("hidden while the end is far, then a warning with the time left and Keep alive", async () => {
    let now = END - 10 * 60_000;
    Date.now = () => now;
    const running = Promise.withResolvers<void>();
    let kept = 0;
    render(() => (
      <SessionExpiryWarning
        expiresAt={END}
        onExtend={() => {
          kept++;
          return running.promise;
        }}
      />
    ));
    await settle();
    expect(document.querySelector('[data-slot="inline-alert"]')).toBeNull();
    now = END - 125_000;
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await settle();
    const alert = screen.getByRole("status");
    expect(alert.getAttribute("data-tone")).toBe("warning");
    expect(alert.textContent).toContain("Your session ends in 02:05");
    expect(alert.textContent).toContain("Nothing is using it.");
    expect(await ariaViolations(document.body)).toEqual([]);
    const keep = screen.getByRole("button", { name: "Keep alive" });
    keep.focus();
    await user.keyboard("{Enter}");
    await settle();
    expect(kept).toBe(1);
    running.resolve();
  });

  test("at its time limit it offers Extend, and once ended says so and calls back", async () => {
    let now = END - 30_000;
    Date.now = () => now;
    let ended = 0;
    function Rtl(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Rtl>
        <SessionExpiryWarning
          expiresAt={END}
          reason="limit"
          onExtend={() => {}}
          onExpire={() => ended++}
          class="mine"
        />
      </Rtl>
    ));
    await settle();
    expect(screen.getByRole("button", { name: "Extend" })).toBeDefined();
    expect(document.querySelector('[data-slot="inline-alert"]')?.classList.contains("mine")).toBe(
      true,
    );
    now = END + 1000;
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await settle();
    expect(screen.getByRole("alert").textContent).toContain("Your session has ended");
    expect(ended).toBe(1);
  });

  test("a server's warning, measured from the request's time, is hydrated in place", async () => {
    const result = await hydrates(`
      import { SessionExpiryWarning } from "<arc>";
      export function Page() {
        return (
          <SessionExpiryWarning
            expiresAt={Date.now() + 120_000}
            now={Date.now()}
            onExtend={() => {}}
          />
        );
      }
    `);
    expect(result.container.textContent).toContain("Your session ends in");
    result.unmount();
  });
});
