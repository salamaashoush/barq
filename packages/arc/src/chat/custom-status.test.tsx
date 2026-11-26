import { describe, expect, test } from "bun:test";
import { type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user, waitFor, within } from "@barqjs/testing";

import type { CustomStatus } from "../components/presence.tsx";
import { hydrates } from "../test-arc.ts";
import { CustomStatusDialog, statusExpiry } from "./custom-status.tsx";

async function dialog(): Promise<HTMLElement> {
  return waitFor(() => screen.getByRole("dialog", { name: "Set a status" }));
}

describe("CustomStatusDialog", () => {
  test("a preset fills the emoji, the words and when it lapses; saving sends them", async () => {
    const saved: CustomStatus[] = [];
    render(() => (
      <CustomStatusDialog
        defaultOpen
        presets={[{ emoji: "📅", text: "In a meeting", clearAfter: "1h" }]}
        onSave={(status) => {
          saved.push(status);
        }}
      />
    ));
    const box = await dialog();
    const before = Date.now();
    await user.click(within(box).getByRole("button", { name: "In a meeting" }));
    expect(within(box).getByRole<HTMLInputElement>("textbox", { name: "Status" }).value).toBe(
      "In a meeting",
    );
    expect(box.querySelector('[data-slot="custom-status-emoji"]')?.textContent).toBe("📅");
    await user.click(within(box).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]?.emoji).toBe("📅");
    expect(saved[0]?.text).toBe("In a meeting");
    const lapse = new Date(saved[0]?.expiresAt ?? 0).getTime() - before;
    expect(lapse).toBeGreaterThan(59 * 60_000);
    expect(lapse).toBeLessThan(61 * 60_000);
  });

  test("saving with neither emoji nor words says what is missing", async () => {
    const saved: CustomStatus[] = [];
    render(() => <CustomStatusDialog defaultOpen onSave={(status) => void saved.push(status)} />);
    const box = await dialog();
    const text = within(box).getByRole("textbox", { name: "Status" });
    await user.click(within(box).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(text.getAttribute("aria-invalid")).toBe("true"));
    expect(box.textContent).toContain("Add an emoji or a few words.");
    expect(saved).toEqual([]);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("the status now is shown with a button that clears it and closes", async () => {
    let cleared = 0;
    let open = true;
    render(() => (
      <CustomStatusDialog
        defaultOpen
        status={{ emoji: "🌴", text: "On leave" }}
        onSave={() => {}}
        onClear={() => {
          cleared++;
        }}
        onOpenChange={(next) => {
          open = next;
        }}
      />
    ));
    const box = await dialog();
    expect(box.querySelector('[data-slot="custom-status-current"]')?.textContent).toContain(
      "On leave",
    );
    expect(within(box).getByRole<HTMLInputElement>("textbox", { name: "Status" }).value).toBe(
      "On leave",
    );
    await user.click(within(box).getByRole("button", { name: "Clear status" }));
    await waitFor(() => expect(cleared).toBe(1));
    await waitFor(() => expect(open).toBe(false));
  });

  test("lapses after so long, at the day's end, or at the week's", () => {
    const wednesday = new Date(2026, 10, 25, 10, 0, 0);
    expect(statusExpiry("never", wednesday)).toBeUndefined();
    expect(statusExpiry("30m", wednesday)?.getTime()).toBe(wednesday.getTime() + 30 * 60_000);
    const today = statusExpiry("today", wednesday);
    expect([today?.getDate(), today?.getHours(), today?.getMinutes()]).toEqual([25, 23, 59]);
    const week = statusExpiry("week", wednesday);
    expect([week?.getDay(), week?.getDate(), week?.getHours()]).toEqual([0, 29, 23]);
    const sunday = new Date(2026, 10, 29, 9, 0, 0);
    expect(statusExpiry("week", sunday)?.getDate()).toBe(29);
  });

  test("right to left, in the locale's words", async () => {
    function Arabic(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <CustomStatusDialog defaultOpen onSave={() => {}} />
      </Arabic>
    ));
    const box = await dialog();
    expect(
      within(box).getByRole("button", { name: "Choose an emoji for your status" }),
    ).toBeDefined();
  });

  test("hydrates its trigger as the server wrote it", async () => {
    const result = await hydrates(`
      import { CustomStatusDialog } from ${JSON.stringify(new URL("./index.ts", import.meta.url).pathname)};
      export function Page() {
        return <CustomStatusDialog trigger={<button type="button">Set a status</button>} onSave={() => {}} />;
      }
    `);
    expect(result.container.textContent).toContain("Set a status");
    result.unmount();
  });
});
