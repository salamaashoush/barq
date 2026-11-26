import { describe, expect, test } from "bun:test";
import { createSignal, type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user, within } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { Timeline, type TimelineEvent, type TimelineKind } from "./timeline.tsx";

const NOW = "2026-03-04T12:00:00.000Z";

const KINDS: Record<string, TimelineKind> = {
  opened: {
    label: "Opened",
    icon: <svg data-icon="opened" />,
    tone: "danger",
    verb: () => "opened the incident",
  },
  renamed: {
    label: "Renames",
    verb: (event) => `renamed it to ${String(event.description)}`,
    quiet: true,
  },
  comment: { label: "Comments", comment: true, verb: () => "commented" },
  resolved: { label: "Resolutions", tone: "success", verb: () => "resolved" },
};

const EVENTS: TimelineEvent[] = [
  { id: "1", kind: "resolved", actor: "Salama", time: "2026-03-04T11:00:00.000Z" },
  {
    id: "2",
    kind: "comment",
    actor: "Ana",
    time: "2026-03-04T09:30:00.000Z",
    description: "Rolled back the deploy.\nWatching it.",
  },
  {
    id: "3",
    kind: "renamed",
    actor: "Ben",
    time: "2026-03-03T18:00:00.000Z",
    description: "Checkout outage",
  },
  { id: "4", kind: "opened", time: "2026-03-01T08:00:00.000Z", isKey: true },
  { id: "5", kind: "page_failed", time: "2026-03-01T08:00:00.000Z" },
];

function all(name: string): HTMLElement[] {
  return [...document.querySelectorAll(`[data-slot="${name}"]`)] as HTMLElement[];
}

function titles(): string[] {
  return all("timeline-title").map((one) => one.textContent ?? "");
}

function Arabic(props: ParentProps) {
  provideLocale("ar-EG");
  return <div dir="rtl">{props.children}</div>;
}

describe("Timeline kinds", () => {
  test("an event takes its kind's verb, icon and tone; a quiet kind hides its detail", () => {
    render(() => <Timeline aria-label="Activity" now={NOW} kinds={KINDS} events={EVENTS} />);
    expect(titles()).toEqual([
      "resolved",
      "commented",
      "renamed it to Checkout outage",
      "opened the incident",
      "page failed",
    ]);
    const events = all("timeline-event");
    expect(events.map((one) => one.getAttribute("data-tone"))).toEqual([
      "success",
      "neutral",
      "neutral",
      "danger",
      "neutral",
    ]);
    expect(events[3]?.querySelector('[data-icon="opened"]')).not.toBeNull();
    expect(events[4]?.querySelector('[data-slot="timeline-dot"]')).not.toBeNull();
    expect(events[2]?.querySelector('[data-slot="timeline-description"]')).toBeNull();
    expect(screen.getByRole("list", { name: "Activity" }).tagName).toBe("OL");
  });

  test("a comment is a card among the events, its lines kept", async () => {
    render(() => <Timeline now={NOW} kinds={KINDS} events={EVENTS} />);
    const comment = all("timeline-comment");
    expect(comment).toHaveLength(1);
    expect(comment[0]?.textContent).toBe("Rolled back the deploy.\nWatching it.");
    expect(all("timeline-description")).toHaveLength(0);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("an event's action sits after its title", () => {
    render(() => (
      <Timeline
        events={[{ id: "1", title: "Check failed", action: <a href="/runs/1">View run</a> }]}
      />
    ));
    expect(
      screen.getByRole("link", { name: "View run" }).closest('[data-slot="timeline-action"]'),
    ).not.toBeNull();
  });
});

describe("Timeline by day", () => {
  test("a list per day under its heading, inside a group named by the timeline", async () => {
    render(() => (
      <Timeline
        aria-label="Incident timeline"
        groupByDay
        timeZone="UTC"
        now={NOW}
        kinds={KINDS}
        events={EVENTS}
      />
    ));
    const group = screen.getByRole("group", { name: "Incident timeline" });
    const headings = within(group).getAllByRole("heading");
    expect(headings.map((one) => one.textContent)).toEqual([
      "Today",
      "Yesterday",
      "Sunday, March 1",
    ]);
    expect(headings[0]?.tagName).toBe("H3");
    const today = within(group).getByRole("list", { name: "Today" });
    expect(within(today).getAllByRole("listitem")).toHaveLength(2);
    expect(within(group).getByRole("list", { name: "Sunday, March 1" }).children).toHaveLength(2);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a day heading can be another element, and the days follow the locale", () => {
    render(() => (
      <Arabic>
        <Timeline
          groupByDay
          timeZone="UTC"
          now={NOW}
          events={EVENTS.slice(3, 4)}
          renders={{ day: (part, content) => <h2 {...part.props}>{content}</h2> }}
        />
      </Arabic>
    ));
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.textContent).toContain("مارس");
    expect(heading.getAttribute("data-slot")).toBe("timeline-day");
  });
});

describe("Timeline filter", () => {
  test("the kinds present, in the registry's order, each a toggle that narrows the list", async () => {
    const changes: string[][] = [];
    render(() => (
      <Timeline
        now={NOW}
        kinds={KINDS}
        events={EVENTS}
        filterable
        onKindFilterChange={(kinds) => changes.push(kinds)}
      />
    ));
    const filter = screen.getByRole("group", { name: "Show only" });
    const kinds = within(filter).getAllByRole("button");
    expect(kinds.map((one) => one.textContent)).toEqual([
      "Opened",
      "Renames",
      "Comments",
      "Resolutions",
      "page failed",
    ]);
    user.click(within(filter).getByRole("button", { name: "Comments" }));
    await settle();
    expect(changes).toEqual([["comment"]]);
    expect(titles()).toEqual(["commented"]);
    expect(
      within(filter).getByRole("button", { name: "Comments" }).getAttribute("aria-pressed"),
    ).toBe("true");
    user.click(within(filter).getByRole("button", { name: "Opened" }));
    await settle();
    expect(titles()).toEqual(["commented", "opened the incident"]);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("controlled, and says when nothing is of the kinds chosen", async () => {
    const [kinds, setKinds] = createSignal<string[]>(["renamed"]);
    render(() => (
      <Timeline
        now={NOW}
        kinds={KINDS}
        events={EVENTS.slice(0, 2)}
        filterable
        kindFilter={kinds()}
        onKindFilterChange={setKinds}
      />
    ));
    expect(all("timeline-event")).toHaveLength(0);
    expect(all("timeline-empty")[0]?.textContent).toBe("No events of the kinds chosen.");
    setKinds([]);
    await settle();
    expect(all("timeline-event")).toHaveLength(2);
  });

  test("with no events, its own empty state", () => {
    render(() => <Timeline events={[]} empty="Nothing has happened yet." />);
    expect(all("timeline-empty")[0]?.textContent).toBe("Nothing has happened yet.");
  });
});

describe("Timeline key events", () => {
  test("a star toggles an event as key, its label saying which it is", async () => {
    const [events, setEvents] = createSignal(EVENTS.slice(3, 5));
    const heard: [string, boolean][] = [];
    render(() => (
      <Timeline
        now={NOW}
        kinds={KINDS}
        events={events()}
        onKeyChange={(id, isKey) => {
          heard.push([id, isKey]);
          setEvents(events().map((one) => (one.id === id ? { ...one, isKey } : one)));
        }}
      />
    ));
    const marked = screen.getByRole("button", { name: "Key event; unmark it" });
    expect(marked.getAttribute("aria-pressed")).toBe("true");
    const unmarked = screen.getByRole("button", { name: "Mark as a key event" });
    expect(unmarked.getAttribute("aria-pressed")).toBe("false");
    user.click(unmarked);
    await settle();
    expect(heard).toEqual([["5", true]]);
    expect(screen.getAllByRole("button", { name: "Key event; unmark it" })).toHaveLength(2);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("without a handler, only key events carry a star, read as words", () => {
    render(() => <Timeline now={NOW} kinds={KINDS} events={EVENTS.slice(3, 5)} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    const keys = all("timeline-key");
    expect(keys).toHaveLength(1);
    expect(keys[0]?.textContent).toBe("Key event");
  });
});

describe("Timeline pages", () => {
  test("Show more asks for the next page and holds while it loads", async () => {
    let asked = 0;
    const [loading, setLoading] = createSignal(false);
    render(() => (
      <Timeline
        events={EVENTS.slice(0, 1)}
        now={NOW}
        isLoadingMore={loading()}
        onLoadMore={() => {
          asked++;
          setLoading(true);
        }}
      />
    ));
    user.click(screen.getByRole("button", { name: "Show more" }));
    await settle();
    expect(asked).toBe(1);
    expect(
      all("timeline-more")[0]?.querySelector("button")?.getAttribute("aria-disabled") ??
        all("timeline-more")[0]?.querySelector("button")?.getAttribute("data-pending"),
    ).not.toBeNull();
  });
});

describe("an activity timeline hydrates", () => {
  test("what the server wrote", async () => {
    const result = await hydrates(`
      import { Timeline } from "<arc>";
      const KINDS = {
        comment: { label: "Comments", comment: true, verb: () => "commented" },
        resolved: { label: "Resolutions", tone: "success", verb: () => "resolved" },
      };
      export function Page() {
        return (
          <Timeline
            aria-label="Activity"
            groupByDay
            filterable
            timeZone="UTC"
            now="2026-03-04T12:00:00.000Z"
            kinds={KINDS}
            onKeyChange={() => {}}
            events={[
              { id: "1", kind: "resolved", actor: "Ana", time: "2026-03-04T11:00:00.000Z", isKey: true },
              { id: "2", kind: "comment", actor: "Ben", time: "2026-03-02T11:00:00.000Z", description: "Rolled back" },
            ]}
          />
        );
      }
    `);
    expect(result.container.querySelectorAll('[data-slot="timeline-day"]')).toHaveLength(2);
    expect(result.container.querySelector('[data-slot="timeline-comment"]')?.textContent).toBe(
      "Rolled back",
    );
    result.unmount();
  });
});
