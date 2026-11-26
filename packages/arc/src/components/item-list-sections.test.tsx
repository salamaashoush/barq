import { describe, expect, test } from "bun:test";
import { type ParentProps, flush } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user, within } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { List, ListItem, useDateSections } from "./item-list.tsx";

interface Work {
  id: string;
  title: string;
  due: string;
}

const NOW = "2026-11-24T09:00:00Z";

const WORK: Work[] = [
  { id: "a", title: "Essay draft", due: "2026-11-24T15:00:00Z" },
  { id: "b", title: "Lab report", due: "2026-11-24T23:30:00Z" },
  { id: "c", title: "Reading", due: "2026-11-23T08:00:00Z" },
  { id: "d", title: "Quiz", due: "2026-11-18T10:00:00Z" },
  { id: "e", title: "Old project", due: "2025-03-03T10:00:00Z" },
];

interface WorkListProps {
  by?: "day" | "month";
  timeZone?: string;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
}

function WorkList(props: WorkListProps) {
  const section = useDateSections({ by: props.by, timeZone: props.timeZone ?? "UTC", now: NOW });
  return (
    <List
      aria-label="Work"
      items={WORK}
      section={(work) => section(work.due)}
      onLoadMore={props.onLoadMore}
      isLoadingMore={props.isLoadingMore}
      loadMore="button"
    >
      {(work: Work) => <ListItem title={work.title} />}
    </List>
  );
}

function groups(): string[] {
  return screen.getAllByRole("rowgroup").map((group) => {
    const heading = group.querySelector('[role="rowheader"]');
    return heading?.textContent ?? "";
  });
}

describe("List sections", () => {
  test("rows grouped by day, each section named by its heading", async () => {
    render(() => <WorkList />);
    expect(groups()).toEqual([
      "Today",
      "Yesterday",
      "Wednesday, November 18",
      "Monday, March 3, 2025",
    ]);
    const today = screen.getAllByRole("rowgroup")[0] as HTMLElement;
    expect(today.getAttribute("aria-labelledby")).toBeTruthy();
    expect(
      within(today)
        .getAllByRole("row")
        .map((row) => row.textContent),
    ).toEqual(["Today", "Essay draft", "Lab report"]);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("the days fall in the zone given", () => {
    render(() => <WorkList timeZone="Asia/Tokyo" />);
    expect(groups()).toEqual([
      "Wednesday, November 25",
      "Yesterday",
      "Wednesday, November 18",
      "Monday, March 3, 2025",
    ]);
  });

  test("by month", () => {
    render(() => <WorkList by="month" />);
    expect(groups()).toEqual(["November 2026", "March 2025"]);
  });

  test("the keyboard walks the rows across sections and never stops on a heading", () => {
    render(() => <WorkList />);
    user.focus(screen.getByRole("grid"));
    expect(document.activeElement?.textContent).toBe("Essay draft");
    user.keyDown("ArrowDown");
    user.keyDown("ArrowDown");
    flush();
    expect(document.activeElement?.textContent).toBe("Reading");
  });

  test("Show more asks for older rows, and waits while they load", async () => {
    let asked = 0;
    render(() => <WorkList onLoadMore={() => (asked += 1)} />);
    await user.click(screen.getByRole("button", { name: "Show more" }));
    await settle();
    expect(asked).toBe(1);
  });

  test("headings in the reader's language", () => {
    function Arabic(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <WorkList by="month" />
      </Arabic>
    ));
    expect(groups()[0]).toContain("نوفمبر");
  });

  test("hydrates sections", async () => {
    const result = await hydrates(`
      import { List, ListItem, useDateSections } from "<arc>";
      const items = [{ id: "a", t: "A", due: "2026-11-24T10:00:00Z" }, { id: "b", t: "B", due: "2026-10-02T10:00:00Z" }];
      export function Page() {
        const section = useDateSections({ by: "month", timeZone: "UTC", now: "2026-11-24T12:00:00Z" });
        return (
          <List aria-label="Work" items={items} section={(item) => section(item.due)}>
            {(item) => <ListItem title={item.t} />}
          </List>
        );
      }
    `);
    expect(result.container.querySelectorAll('[role="rowgroup"]')).toHaveLength(2);
    result.unmount();
  });
});
