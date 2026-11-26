import { describe, expect, test } from "bun:test";
import { type ParentProps } from "@barqjs/core";
import { CalendarDate } from "@barqjs/aria/date";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user, waitFor, within } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import {
  type ChangeEntry,
  ChangeLog,
  type ChangeLogFilter,
  FieldChanges,
  matchesChangeLogFilter,
} from "./change-log.tsx";

const NOW = "2026-03-04T12:00:00.000Z";

const SALAMA = { id: "u1", name: "Salama Ashoush" };
const ANA = { id: "u2", name: "Ana Lima" };

const ENTRIES: ChangeEntry[] = [
  {
    id: "1",
    actor: SALAMA,
    action: "changed the plan",
    target: "Billing",
    time: "2026-03-04T09:30:00.000Z",
    reason: "Moved to annual billing",
    changes: [
      { field: "Plan", before: "Team", after: "Business" },
      { field: "Phone", before: null, after: "+20 100 123 4567", ltr: true },
    ],
  },
  {
    id: "2",
    actor: ANA,
    action: "removed a member",
    time: "2026-03-03T10:00:00.000Z",
    changes: [{ field: "Owner", before: "سلمى", after: null }],
  },
  { id: "3", action: "rotated the API key", time: "2026-02-20T10:00:00.000Z" },
];

function all(name: string): HTMLElement[] {
  return [...document.querySelectorAll(`[data-slot="${name}"]`)] as HTMLElement[];
}

function Arabic(props: ParentProps) {
  provideLocale("ar-EG");
  return <div dir="rtl">{props.children}</div>;
}

describe("FieldChanges", () => {
  test("each field from its old value to its new one, in words for a screen reader", async () => {
    render(() => <FieldChanges changes={ENTRIES[0]?.changes ?? []} />);
    const list = document.querySelector("dl") as HTMLElement;
    expect([...list.querySelectorAll("dt")].map((one) => one.textContent)).toEqual([
      "Plan",
      "Phone",
    ]);
    const plan = list.querySelectorAll("dd")[0] as HTMLElement;
    expect(plan.textContent).toBe("changed fromTeamtoBusiness");
    expect(
      plan.querySelector('[data-slot="field-changes-arrow"]')?.getAttribute("aria-hidden"),
    ).toBe("true");
    const before = all("field-changes-before");
    expect(before.map((one) => one.tagName)).toEqual(["BDI", "BDI"]);
    expect(before[1]?.textContent).toBe("Not set");
    expect(all("field-changes-after")[1]?.getAttribute("dir")).toBe("ltr");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a blank value is not struck out; a value in the other script keeps its direction", () => {
    render(() => (
      <Arabic>
        <FieldChanges changes={[{ field: "المالك", before: "Salma", after: "" }]} />
      </Arabic>
    ));
    const before = all("field-changes-before")[0] as HTMLElement;
    const after = all("field-changes-after")[0] as HTMLElement;
    expect(before.getAttribute("dir")).toBeNull();
    expect(before.textContent).toBe("Salma");
    expect(after.textContent).toBe("Not set");
    expect(after.className).not.toBe(before.className);
  });
});

describe("matchesChangeLogFilter", () => {
  test("by actor and by the day in a zone, ends included", () => {
    const entry = ENTRIES[0] as ChangeEntry;
    const none: ChangeLogFilter = { actors: [], range: null };
    expect(matchesChangeLogFilter(entry, none)).toBe(true);
    expect(matchesChangeLogFilter(entry, { ...none, actors: ["u2"] })).toBe(false);
    expect(matchesChangeLogFilter(entry, { ...none, actors: ["u1"] })).toBe(true);
    const day = { start: new CalendarDate(2026, 3, 4), end: new CalendarDate(2026, 3, 4) };
    expect(matchesChangeLogFilter(entry, { ...none, range: day }, "UTC")).toBe(true);
    const late = { ...entry, time: "2026-03-04T23:30:00.000Z" };
    expect(matchesChangeLogFilter(late, { ...none, range: day }, "UTC")).toBe(true);
    expect(matchesChangeLogFilter(late, { ...none, range: day }, "Africa/Cairo")).toBe(false);
    expect(matchesChangeLogFilter(ENTRIES[2] as ChangeEntry, { ...none, actors: ["u1"] })).toBe(
      false,
    );
  });
});

describe("ChangeLog", () => {
  test("entries by day, each its actor, action, target, reason and fields", async () => {
    render(() => <ChangeLog entries={ENTRIES} timeZone="UTC" now={NOW} />);
    const log = screen.getByRole("group", { name: "Changes" });
    expect(
      within(log)
        .getAllByRole("heading")
        .map((one) => one.textContent),
    ).toEqual(["Today", "Yesterday", "Friday, February 20"]);
    const titles = all("timeline-title").map((one) => one.textContent);
    expect(titles).toEqual(["changed the plan Billing", "removed a member", "rotated the API key"]);
    expect(all("change-log-actor").map((one) => one.textContent)).toEqual([
      "SASalama Ashoush",
      "ALAna Lima",
      "System",
    ]);
    expect(all("change-log-system")).toHaveLength(1);
    expect(all("change-log-reason")[0]?.textContent).toBe("Moved to annual billing");
    expect(all("field-changes")).toHaveLength(2);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("Who narrows to the people chosen and reports the filter", async () => {
    const heard: ChangeLogFilter[] = [];
    render(() => (
      <ChangeLog
        entries={ENTRIES}
        timeZone="UTC"
        now={NOW}
        onFilterChange={(filter) => heard.push(filter)}
      />
    ));
    user.click(screen.getByRole("button", { name: /^Who/ }));
    await settle();
    await waitFor(() =>
      expect(screen.getByRole("menuitemcheckbox", { name: /Ana Lima/ })).toBeDefined(),
    );
    user.click(screen.getByRole("menuitemcheckbox", { name: /Ana Lima/ }));
    await settle();
    expect(heard.at(-1)).toEqual({ actors: ["u2"], range: null });
    expect(all("timeline-title").map((one) => one.textContent)).toEqual(["removed a member"]);
  });

  test("manualFiltering shows the entries as given, and an empty log says so", async () => {
    render(() => (
      <ChangeLog
        entries={[]}
        manualFiltering
        filterable={false}
        filter={{ actors: ["u1"], range: null }}
      />
    ));
    expect(screen.queryByRole("button", { name: /^Who/ })).toBeNull();
    expect(all("timeline-empty")[0]?.textContent).toBe("Nothing has changed yet.");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("Show more asks for older changes", async () => {
    let asked = 0;
    render(() => (
      <ChangeLog
        entries={ENTRIES.slice(0, 1)}
        timeZone="UTC"
        now={NOW}
        onLoadMore={() => asked++}
      />
    ));
    user.click(screen.getByRole("button", { name: "Show more" }));
    await settle();
    expect(asked).toBe(1);
  });
});

describe("a change log hydrates", () => {
  test("what the server wrote", async () => {
    const result = await hydrates(`
      import { ChangeLog } from "<arc>";
      export function Page() {
        return (
          <ChangeLog
            timeZone="UTC"
            now="2026-03-04T12:00:00.000Z"
            entries={[
              {
                id: "1",
                actor: { id: "u1", name: "Salama Ashoush" },
                action: "changed the plan",
                time: "2026-03-04T09:30:00.000Z",
                reason: "Annual billing",
                changes: [{ field: "Plan", before: "Team", after: "Business" }],
              },
              { id: "2", action: "rotated the API key", time: "2026-03-01T10:00:00.000Z" },
            ]}
          />
        );
      }
    `);
    expect(result.container.querySelectorAll('[data-slot="field-changes-row"]')).toHaveLength(1);
    result.unmount();
  });
});
