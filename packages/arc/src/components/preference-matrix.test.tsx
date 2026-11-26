import { describe, expect, test } from "bun:test";
import { type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { useArcForm } from "./form.tsx";
import {
  type PreferenceChannel,
  type PreferenceGroup,
  PreferenceMatrix,
  type Preferences,
} from "./preference-matrix.tsx";

const CHANNELS: readonly PreferenceChannel[] = [
  { id: "email", label: "Email" },
  { id: "push", label: "Push", unavailable: "Allow notifications in this browser first." },
  { id: "app", label: "In the app" },
];

const GROUPS: readonly PreferenceGroup[] = [
  {
    id: "work",
    label: "Work",
    kinds: [
      { id: "mention", label: "Mentions", description: "Someone names you." },
      { id: "assigned", label: "Assigned to you" },
    ],
  },
  {
    id: "account",
    label: "Account",
    kinds: [
      {
        id: "security",
        label: "Security alerts",
        locked: "Security alerts always reach you.",
        channels: ["email", "app"],
      },
    ],
  },
];

function box(name: string): HTMLElement {
  return screen.getByRole("checkbox", { name });
}

function isChecked(element: HTMLElement): boolean {
  return element.getAttribute("aria-checked") === "true" || (element as HTMLInputElement).checked;
}

describe("PreferenceMatrix", () => {
  test("a named table of kinds by channels, each control named by its kind and channel", async () => {
    const changes: Preferences[] = [];
    render(() => (
      <PreferenceMatrix
        label="Notifications"
        channels={CHANNELS}
        groups={GROUPS}
        defaultValue={{ mention: { email: true }, security: { email: true, app: true } }}
        onChange={(next: Preferences) => changes.push(next)}
      />
    ));
    expect(screen.getByRole("table", { name: "Notifications" })).toBeDefined();
    expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "Notification",
      "Email",
      "Push",
      "In the app",
    ]);
    expect(isChecked(box("Mentions: Email"))).toBe(true);
    await user.click(box("Assigned to you: In the app"));
    await settle();
    expect(changes.at(-1)?.assigned).toEqual({ app: true });
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a group's row sets every kind in it, and is mixed while they differ", async () => {
    let last: Preferences = {};
    render(() => (
      <PreferenceMatrix
        label="Notifications"
        channels={CHANNELS}
        groups={GROUPS}
        defaultValue={{ mention: { email: true } }}
        onChange={(next: Preferences) => (last = next)}
      />
    ));
    const all = box("All of Work: Email");
    expect(
      all.getAttribute("aria-checked") === "mixed" || all.hasAttribute("data-indeterminate"),
    ).toBe(true);
    await user.click(all);
    await settle();
    expect(last.mention?.email).toBe(true);
    expect(last.assigned?.email).toBe(true);
    expect(isChecked(box("Assigned to you: Email"))).toBe(true);
    await user.click(box("All of Work: Email"));
    await settle();
    expect(last.mention?.email).toBe(false);
    expect(last.assigned?.email).toBe(false);
    expect(screen.queryByRole("checkbox", { name: "All of Account: Email" })).toBeNull();
  });

  test("a channel that cannot be used says why, and its cells only turn off", async () => {
    render(() => (
      <PreferenceMatrix
        label="Notifications"
        channels={CHANNELS}
        groups={GROUPS}
        defaultValue={{ mention: { push: true } }}
      />
    ));
    const off = box("Assigned to you: Push");
    const on = box("Mentions: Push");
    const note = document.getElementById(off.getAttribute("aria-describedby") ?? "");
    expect(note?.textContent).toBe("Push: Allow notifications in this browser first.");
    function disabled(element: HTMLElement): boolean {
      return (
        element.hasAttribute("disabled") ||
        element.getAttribute("aria-disabled") === "true" ||
        element.closest("[data-disabled]") !== null
      );
    }
    expect(disabled(off)).toBe(true);
    expect(disabled(on)).toBe(false);
    await user.click(on);
    await settle();
    expect(isChecked(on)).toBe(false);
  });

  test("a locked kind says why it is fixed, and a kind offers only its channels", () => {
    render(() => <PreferenceMatrix label="Notifications" channels={CHANNELS} groups={GROUPS} />);
    expect(document.querySelector('[data-slot="preference-matrix-locked"]')?.textContent).toBe(
      "Security alerts always reach you.",
    );
    expect(screen.queryByRole("checkbox", { name: "Security alerts: Push" })).toBeNull();
    const email = box("Security alerts: Email");
    expect(email.hasAttribute("disabled") || email.closest("[data-disabled]") !== null).toBe(true);
  });

  test("a channel with options is a choice per cell, keeping a saved value it does not list", async () => {
    render(() => (
      <PreferenceMatrix
        label="Paging"
        channels={[
          {
            id: "email",
            label: "Email",
            options: [
              { value: "off", label: "Off" },
              { value: "0", label: "At once" },
              { value: "5", label: "After 5 minutes" },
            ],
          },
        ]}
        groups={[{ id: "urgent", label: "Urgent", kinds: [{ id: "urgent", label: "Urgent" }] }]}
        defaultValue={{ urgent: { email: "45" } }}
      />
    ));
    const choice = screen.getByRole("button", { name: /Urgent: Email/ });
    expect(choice.textContent).toContain("45");
  });

  test("inside a form field it is the form's, and it runs right to left", async () => {
    function Rtl(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    let read: () => Preferences = () => ({});
    render(() => {
      const form = useArcForm(() => ({
        defaultValues: { notify: { mention: { email: false } } },
      }));
      read = () => form.state.values.notify;
      return (
        <Rtl>
          <form.AppField name="notify">
            {() => <PreferenceMatrix label="Notifications" channels={CHANNELS} groups={GROUPS} />}
          </form.AppField>
        </Rtl>
      );
    });
    await settle();
    await user.click(box("Mentions: Email"));
    await settle();
    expect(read().mention?.email).toBe(true);
    expect(screen.getByRole("table").closest("[dir=rtl]")).not.toBeNull();
  });

  test("a server's table is hydrated in place", async () => {
    const result = await hydrates(`
      import { PreferenceMatrix } from "<arc>";
      export function Page() {
        return <PreferenceMatrix label="Notifications"
          channels={[{ id: "email", label: "Email" }]}
          groups={[{ id: "g", label: "Work", kinds: [{ id: "a", label: "Mentions" }, { id: "b", label: "Assigned" }] }]}
          defaultValue={{ a: { email: true } }} />;
      }
    `);
    expect(result.container.textContent).toContain("Mentions");
    result.unmount();
  });
});
