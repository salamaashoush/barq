import { afterEach, describe, expect, test } from "bun:test";
import { type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { LifecycleNotice, RestoreButton } from "./lifecycle.tsx";

describe("RestoreButton", () => {
  test("says Restore, is named for its item, and is pending while it runs", async () => {
    const running = Promise.withResolvers<void>();
    let restored = 0;
    render(() => (
      <RestoreButton
        name="Homepage"
        onRestore={() => {
          restored++;
          return running.promise;
        }}
      />
    ));
    const button = screen.getByRole("button", { name: "Restore Homepage" });
    expect(button.textContent).toBe("Restore");
    button.focus();
    await user.keyboard("{Enter}");
    await settle();
    expect(restored).toBe(1);
    expect(
      button.getAttribute("aria-disabled") ?? button.getAttribute("data-pending"),
    ).not.toBeNull();
    running.resolve();
    await settle();
    expect(await ariaViolations(document.body)).toEqual([]);
  });
});

describe("LifecycleNotice", () => {
  const realNow = Date.now;
  afterEach(() => {
    Date.now = realNow;
  });

  test("an archived banner: who and when, what it means, and Restore by tap", async () => {
    let restored = 0;
    render(() => (
      <LifecycleNotice
        state="archived"
        at="2026-03-01T10:00:00.000Z"
        by="Ola"
        name="Checkout"
        timeZone="UTC"
        onRestore={() => restored++}
      />
    ));
    const banner = document.querySelector('[data-slot="banner"]') as HTMLElement;
    expect(banner.getAttribute("role")).toBe("status");
    expect(banner.textContent).toContain("Archived by Ola on Mar 1, 2026.");
    expect(banner.textContent).toContain("Its history stays; nothing in it runs or changes.");
    user.tap(screen.getByRole("button", { name: "Restore Checkout" }));
    await settle();
    expect(restored).toBe(1);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a deleted notice inline, with when it goes for good, and no Restore for a reader who may not", () => {
    Date.now = () => Date.parse("2026-03-01T10:00:00.000Z");
    render(() => (
      <LifecycleNotice
        state="deleted"
        placement="inline"
        at="2026-02-28T10:00:00.000Z"
        purgeAt="2026-03-31T10:00:00.000Z"
        name="Slack alerts"
        timeZone="UTC"
      />
    ));
    const alert = document.querySelector('[data-slot="inline-alert"]') as HTMLElement;
    expect(alert.textContent).toContain("Deleted on Feb 28, 2026.");
    expect(alert.textContent).toContain("It is removed for good");
    expect(alert.querySelector('[data-slot="relative-time-trigger"]')).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Restore/ })).toBeNull();
  });

  test("right to left, in the locale's words and digits", () => {
    function Arabic(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <LifecycleNotice
          state="archived"
          at="2026-03-01T10:00:00.000Z"
          name="مشروع"
          timeZone="UTC"
          onRestore={() => {}}
          class="mine"
        />
      </Arabic>
    ));
    const banner = document.querySelector('[data-slot="banner"]') as HTMLElement;
    expect(banner.classList.contains("mine")).toBe(true);
    expect(banner.textContent).toContain("٢٠٢٦");
  });

  test("a server's notice is hydrated in place", async () => {
    const result = await hydrates(`
      import { LifecycleNotice } from "<arc>";
      export function Page() {
        return (
          <LifecycleNotice
            state="archived"
            at="2026-03-01T10:00:00.000Z"
            name="Checkout"
            onRestore={() => {}}
          />
        );
      }
    `);
    expect(result.container.textContent).toContain("Archived on");
    result.unmount();
  });
});
