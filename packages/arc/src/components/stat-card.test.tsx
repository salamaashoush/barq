import { describe, expect, test } from "bun:test";
import { type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, fireEvent, render, screen } from "@barqjs/testing";

import { hydrates } from "../test-arc.ts";
import { StatCard } from "./stat-card.tsx";
import { StatGroup } from "./stat-group.tsx";

function card(): HTMLElement {
  return document.querySelector('[data-slot="stat-card"]') as HTMLElement;
}

describe("StatCard", () => {
  test("is a group named by its label, with the value, the change and what it is against", async () => {
    render(() => (
      <StatCard
        label="Active projects"
        value="1,280"
        delta={{ value: "+12%", tone: "success", direction: "up", label: "from last week" }}
      />
    ));
    const group = screen.getByRole("group", { name: "Active projects" });
    expect(group).toBe(card());
    expect(screen.getByText("1,280").getAttribute("data-slot")).toBe("stat-card-value");
    const change = card().querySelector('[data-slot="stat-card-delta"]') as HTMLElement;
    expect(change.textContent).toBe("+12%");
    expect(change.getAttribute("data-tone")).toBe("success");
    expect(change.getAttribute("data-direction")).toBe("up");
    expect(change.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByText("from last week")).toBeDefined();
    expect(card().querySelector('[data-slot="stat-card-trend"]')).toBeNull();
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("draws the trend as an image described in words", async () => {
    render(() => <StatCard label="Requests" value="128" trend={[90, 96, 101, 80, 128]} />);
    const image = screen.getByRole("img");
    expect(image.getAttribute("aria-label")).toBe(
      "Trend over 5 values, from 90 to 128; lowest 80, highest 128",
    );
    const [area, line] = [...image.querySelectorAll("path")];
    expect(line?.getAttribute("d")).toBe(
      "M0.00,24.17L25.00,20.67L50.00,17.75L75.00,30.00L100.00,2.00",
    );
    expect(area?.getAttribute("d")).toEndWith("L100,32L0,32Z");
    expect(image.getAttribute("class")).not.toBe("");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("takes a description of its own, and formats the numbers in the locale", () => {
    function Locale(props: ParentProps) {
      provideLocale("de-DE");
      return <>{props.children}</>;
    }
    render(() => (
      <Locale>
        <StatCard label="Revenue" value="12.500 €" trend={[1500, 2500]} />
        <StatCard label="Errors" value="0" trend={[3, 3, 3]} trendLabel="Flat all week" />
      </Locale>
    ));
    const [first, second] = screen.getAllByRole("img");
    expect(first?.getAttribute("aria-label")).toBe(
      "Trend over 2 values, from 1.500 to 2.500; lowest 1.500, highest 2.500",
    );
    expect(second?.getAttribute("aria-label")).toBe("Flat all week");
    expect(second?.querySelectorAll("path")[1]?.getAttribute("d")).toBe(
      "M0.00,16.00L50.00,16.00L100.00,16.00",
    );
  });

  test("leaves out what is not given, and a single value draws no line", () => {
    render(() => <StatCard label="Seats" value="4" trend={[4]} description="of 10" />);
    expect(card().querySelector('[data-slot="stat-card-delta"]')).toBeNull();
    expect(card().querySelector('[data-slot="stat-card-description"]')?.textContent).toBe("of 10");
    expect(screen.queryByRole("img")).toBeNull();
  });

  test("draws how full it is against its limit as a meter named by its label", async () => {
    render(() => (
      <StatCard
        label="Seats"
        value="38"
        meter={{ value: 38, max: 40, thresholds: [{ value: 36, tone: "warning" }] }}
        description="2 left"
        descriptionTone="warning"
      />
    ));
    const meter = screen.getByRole("meter", { name: "Seats" });
    expect(meter.getAttribute("aria-valuetext")).toBe("38 of 40");
    expect(card().querySelector('[data-slot="meter"]')?.getAttribute("data-tone")).toBe("warning");
    const description = card().querySelector('[data-slot="stat-card-description"]');
    expect(description?.getAttribute("data-tone")).toBe("warning");
    expect(description?.querySelector('[data-slot="stat-card-description-dot"]')).not.toBeNull();
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("tones its value only when it is wrong, and says a rating in words", () => {
    render(() => (
      <>
        <StatCard label="LCP" value="4.2 s" rating="poor" />
        <StatCard label="FCP" value="1.1 s" rating="good" />
        <StatCard label="Errors" value="12" valueTone="warning" />
      </>
    ));
    const values = [...document.querySelectorAll('[data-slot="stat-card-value"]')];
    expect(values.map((value) => value.getAttribute("data-tone"))).toEqual([
      "danger",
      null,
      "warning",
    ]);
    const ratings = [...document.querySelectorAll('[data-slot="metric-rating"], [data-rating]')];
    expect(ratings.map((rating) => rating.textContent)).toEqual(["Poor", "Good"]);
  });

  test("the whole card opens its link or presses, its label the name", async () => {
    let pressed = 0;
    render(() => (
      <>
        <StatCard label="Open incidents" value="3" href="/incidents" aside={<span>new</span>} />
        <StatCard label="Failing checks" value="2" onPress={() => pressed++} />
      </>
    ));
    const link = screen.getByRole("link", { name: "Open incidents" });
    expect(link.getAttribute("href")).toBe("/incidents");
    expect(link.getAttribute("data-slot")).toBe("stat-card-link");
    expect(document.querySelector('[data-slot="stat-card-aside"]')?.textContent).toBe("new");
    const button = screen.getByRole("button", { name: "Failing checks" });
    fireEvent.click(button);
    expect(pressed).toBe(1);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("while loading, shapes stand in for the number and the footer, and it is busy", () => {
    render(() => <StatCard label="Runs" value="12" description="today" loading />);
    expect(card().getAttribute("aria-busy")).toBe("true");
    expect(card().querySelector('[data-slot="stat-card-value"]')).toBeNull();
    expect(card().querySelector('[data-slot="stat-card-value-skeleton"]')).not.toBeNull();
    expect(card().querySelector('[data-slot="stat-card-footer-skeleton"]')).not.toBeNull();
    expect(screen.getByRole("group", { name: "Runs" })).toBe(card());
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { StatCard, StatGroup } from "<arc>";
      export function Page() {
        return (
          <>
            <StatCard label="Seats" value="38" meter={{ value: 38, max: 40 }} href="/seats" rating="fair" />
            <StatGroup stats={[{ label: "Runs", value: "12" }, { label: "Up", value: "99%" }, { label: "Down", value: "1" }]} />
          </>
        );
      }
    `);
    expect(result.container.querySelector('[data-slot="stat-card-link"]')).not.toBeNull();
    result.unmount();
  });
});

describe("StatGroup", () => {
  test("a card per stat in a strip whose rows fill, each loading while the group does", () => {
    render(() => (
      <StatGroup
        aria-label="This month"
        loading
        stats={[
          { label: "Runs", value: "12,480" },
          { label: "Failures", value: "37", loading: false },
          { label: "Uptime", value: "99.96%" },
        ]}
      />
    ));
    const group = screen.getByRole("region", { name: "This month" });
    const grid = group.querySelector('[data-slot="stat-group-grid"]') as HTMLElement;
    expect(grid.style.getPropertyValue("--arc-stat-columns")).toBe("3");
    const cards = [...group.querySelectorAll('[data-slot="stat-card"]')];
    expect(cards.map((one) => one.getAttribute("aria-busy"))).toEqual(["true", null, "true"]);
  });
});
