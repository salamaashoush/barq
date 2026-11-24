import { describe, expect, test } from "bun:test";
import { type Child } from "@barqjs/core";
import { collectCss } from "@barqjs/css";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user, within } from "@barqjs/testing";

import { hydrates, settle, wears } from "../test-arc.ts";
import { AvatarStack, avatarStackStyles, initials } from "./avatar-stack.tsx";
import { DescriptionList, descriptionListStyles } from "./description-list.tsx";
import { StatGroup, statGroupStyles } from "./stat-group.tsx";
import { Timeline, timelineStyles } from "./timeline.tsx";

function slot(name: string): HTMLElement {
  return document.querySelector(`[data-slot="${name}"]`) as HTMLElement;
}

function all(name: string): HTMLElement[] {
  return [...document.querySelectorAll(`[data-slot="${name}"]`)] as HTMLElement[];
}

function Arabic(props: { children?: Child }) {
  provideLocale("ar-EG");
  return <div dir="rtl">{props.children}</div>;
}

function classesReach(pairs: readonly (readonly [string, string])[]): void {
  for (const [name, cls] of pairs) expect(slot(name).classList.contains(cls)).toBe(true);
}

describe("AvatarStack", () => {
  const PEOPLE = [
    { name: "Salama Ashoush", presence: "online" as const },
    { name: "Ana Lima", src: "/ana.png" },
    { name: "Ben", presence: "dnd" as const },
    { name: "Chen Wu" },
    { name: "Dina Saad" },
  ];

  test("a list named by its people, the rest counted", async () => {
    render(() => <AvatarStack people={PEOPLE} max={3} />);
    const list = screen.getByRole("list", {
      name: "Salama Ashoush, Ana Lima, Ben, and 2 more",
    });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(items[0]?.textContent).toContain("Salama Ashoush, Online");
    expect(items[2]?.textContent).toContain("Ben, Do not disturb");
    expect(slot("avatar-stack-count").textContent).toContain("+2");
    expect(slot("avatar-stack-count").textContent).toContain("2 more");
    expect(all("avatar-stack-presence").map((one) => one.getAttribute("data-presence"))).toEqual([
      "online",
      "dnd",
    ]);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("falls back to initials", () => {
    expect(initials("Salama Ashoush")).toBe("SA");
    expect(initials("ana")).toBe("A");
    expect(initials("  mary  jo  smith ")).toBe("MS");
    render(() => <AvatarStack people={[{ name: "Chen Wu" }]} />);
    expect(document.querySelector('[data-slot="avatar-fallback"]')?.textContent).toBe("CW");
  });

  test("its words and digits follow the locale, and its parts take classes", () => {
    render(() => (
      <Arabic>
        <AvatarStack
          people={PEOPLE}
          max={1}
          class="mine"
          classes={{ root: "r", avatar: "a", presence: "p", count: "c", hint: "h" }}
        />
      </Arabic>
    ));
    expect(slot("avatar-stack-count").textContent).toContain("+٤");
    classesReach([
      ["avatar-stack", "r"],
      ["avatar-stack-avatar", "a"],
      ["avatar-stack-presence", "p"],
      ["avatar-stack-count", "c"],
      ["avatar-stack-name", "h"],
    ]);
    expect(slot("avatar-stack").classList.contains("mine")).toBe(true);
    expect(wears(slot("avatar-stack"), avatarStackStyles().root)).toBe(true);
  });
});

describe("Timeline", () => {
  const NOW = "2026-03-01T12:00:00.000Z";

  test("an ordered list of events with their times and tones", async () => {
    render(() => (
      <Timeline
        aria-label="Activity"
        now={NOW}
        events={[
          { id: "1", title: "Deployed v2.4", time: "2026-03-01T11:00:00.000Z", tone: "success" },
          {
            id: "2",
            title: "Check failed",
            time: "2026-03-01T09:00:00.000Z",
            tone: "danger",
            description: "Timed out",
            actor: <span>Ana</span>,
          },
        ]}
      />
    ));
    const list = screen.getByRole("list", { name: "Activity" });
    expect(list.tagName).toBe("OL");
    const events = within(list).getAllByRole("listitem");
    expect(events.map((one) => one.getAttribute("data-tone"))).toEqual(["success", "danger"]);
    expect(events[1]?.textContent).toContain("Timed out");
    expect(slot("timeline-rail").getAttribute("aria-hidden")).toBe("true");
    const time = events[0]?.querySelector("time");
    expect(time?.getAttribute("datetime")).toBe("2026-03-01T11:00:00.000Z");
    expect(time?.getAttribute("title")).not.toBeNull();
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("absolute times, compact density, a class per part", async () => {
    render(() => (
      <Timeline
        timeFormat="absolute"
        density="compact"
        events={[
          { id: "1", title: "Opened", time: NOW, icon: <svg />, actor: "Ana", description: "x" },
        ]}
        classes={{
          root: "r",
          event: "e",
          rail: "ra",
          marker: "m",
          line: "l",
          body: "b",
          heading: "h",
          actor: "a",
          title: "t",
          description: "d",
        }}
      />
    ));
    await settle();
    expect(slot("formatted-date")).not.toBeNull();
    expect(wears(slot("timeline-event"), timelineStyles({ density: "compact" }).event)).toBe(true);
    classesReach([
      ["timeline", "r"],
      ["timeline-event", "e"],
      ["timeline-rail", "ra"],
      ["timeline-marker", "m"],
      ["timeline-line", "l"],
      ["timeline-body", "b"],
      ["timeline-heading", "h"],
      ["timeline-actor", "a"],
      ["timeline-title", "t"],
      ["timeline-description", "d"],
    ]);
  });

  test("runs right to left on logical edges", () => {
    render(() => (
      <Arabic>
        <Timeline events={[{ id: "1", title: "فتح" }]} />
      </Arabic>
    ));
    expect(slot("timeline-title").textContent).toBe("فتح");
    expect(collectCss()).toContain("margin-inline-start:auto");
  });
});

describe("DescriptionList", () => {
  test("a dl of named values, each pair in a div, with an action", async () => {
    let changed = 0;
    render(() => (
      <DescriptionList
        items={[
          {
            term: "Plan",
            details: "Team",
            action: (
              <button type="button" onClick={() => changed++}>
                Change
              </button>
            ),
          },
          { term: "Seats", details: "12" },
        ]}
      />
    ));
    const list = slot("description-list");
    expect(list.tagName).toBe("DL");
    expect(all("description-list-row").map((one) => one.tagName)).toEqual(["DIV", "DIV"]);
    expect(all("description-list-term").map((one) => one.textContent)).toEqual(["Plan", "Seats"]);
    user.tab();
    await user.keyboard("{Enter}");
    expect(changed).toBe(1);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("beside from the container's sm step, above below it, and columns when wide", () => {
    render(() => (
      <DescriptionList
        items={[{ term: "A", details: "1" }]}
        columns={2}
        align="end"
        divided={false}
      />
    ));
    const sheet = collectCss();
    expect(sheet).toMatch(
      /@container \(width >= 24rem\)\{[^}]*\{grid-template-columns:minmax\(8rem, 1fr\)/,
    );
    expect(wears(slot("description-list"), descriptionListStyles({ columns: 2 }).root)).toBe(true);
    expect(
      wears(slot("description-list-details"), descriptionListStyles({ align: "end" }).details),
    ).toBe(true);
  });

  test("takes renders, a class per part, and right to left", () => {
    render(() => (
      <Arabic>
        <DescriptionList
          class="mine"
          items={[{ term: "الخطة", details: "فريق", action: <span>x</span> }]}
          classes={{ root: "r", row: "w", term: "t", details: "d", action: "a" }}
          renders={{
            term: (part, content) => (
              <dt {...part.props} ref={part.ref} data-rendered="">
                {content}
              </dt>
            ),
          }}
        />
      </Arabic>
    ));
    expect(slot("description-list-term").hasAttribute("data-rendered")).toBe(true);
    classesReach([
      ["description-list", "r"],
      ["description-list-row", "w"],
      ["description-list-term", "t"],
      ["description-list-details", "d"],
      ["description-list-action", "a"],
    ]);
    expect(slot("description-list").classList.contains("mine")).toBe(true);
  });
});

describe("StatGroup", () => {
  test("stat cards in a joined strip, named as a group", async () => {
    render(() => (
      <StatGroup
        aria-label="This month"
        stats={[
          { label: "Runs", value: "12,480" },
          { label: "Failures", value: "37" },
          { label: "Uptime", value: "99.96%" },
        ]}
      />
    ));
    const region = screen.getByRole("region", { name: "This month" });
    expect(within(region).getAllByRole("group")).toHaveLength(3);
    expect(slot("stat-group-grid").getAttribute("style")).toContain("--arc-stat-columns: 3");
    expect(wears(slot("stat-card"), statGroupStyles({ variant: "joined" }).stat)).toBe(true);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("two across a narrow container, then three, then its columns", () => {
    render(() => (
      <StatGroup
        variant="separate"
        columns={4}
        stats={[{ label: "A", value: "1" }]}
        classes={{ root: "r", grid: "g", stat: "s" }}
      />
    ));
    const sheet = collectCss();
    expect(sheet).toContain("grid-template-columns:repeat(2, minmax(0, 1fr))");
    expect(sheet).toMatch(
      /@container \(width >= 48rem\)\{[^}]*grid-template-columns:repeat\(var\(--arc-stat-columns\)/,
    );
    expect(slot("stat-group-grid").getAttribute("style")).toContain("--arc-stat-columns: 4");
    classesReach([
      ["stat-group", "r"],
      ["stat-group-grid", "g"],
      ["stat-card", "s"],
    ]);
  });
});

describe("data display hydrates", () => {
  test("what the server wrote", async () => {
    const result = await hydrates(`
      import { AvatarStack, DescriptionList, StatGroup, Timeline } from "<arc>";
      export function Page() {
        return (
          <main>
            <AvatarStack people={[{ name: "Ana Lima", presence: "online" }, { name: "Ben" }]} max={1} />
            <Timeline now="2026-03-01T12:00:00.000Z" events={[{ id: "1", title: "Opened", time: "2026-03-01T11:00:00.000Z" }]} />
            <DescriptionList items={[{ term: "Plan", details: "Team" }]} />
            <StatGroup stats={[{ label: "Runs", value: "12" }, { label: "Fails", value: "1" }]} />
          </main>
        );
      }
    `);
    expect(result.container.querySelector("dt")?.textContent).toBe("Plan");
    expect(
      result.container.querySelector('[data-slot="avatar-stack-count"]')?.textContent,
    ).toContain("+1");
    result.unmount();
  });
});
