import { describe, expect, test } from "bun:test";
import { type Child } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen } from "@barqjs/testing";

import { StatCard } from "./stat-card.tsx";

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
    function Locale(props: { children?: Child }) {
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
});
