import { describe, expect, test } from "bun:test";
import { type ParentProps, createSignal } from "@barqjs/core";
import type { DateRange } from "@barqjs/aria/calendar";
import { getLocalTimeZone, today } from "@barqjs/aria/date";
import { provideLocale } from "@barqjs/aria/i18n";
import { Globe } from "@barqjs/lucide/icons/globe";
import { ariaViolations, render, screen, user, waitFor, within } from "@barqjs/testing";
import { renderRoute } from "@barqjs/testing/router";

import { hydrates, settle } from "../test-arc.ts";
import { type DataToolbarFilter, DataToolbar } from "./data-toolbar.tsx";

const ZONES = [
  "Africa/Cairo",
  "America/New_York",
  "Asia/Dubai",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Europe/Berlin",
  "Europe/London",
  "Pacific/Auckland",
].map((zone) => ({ value: zone, label: zone }));

function chip(name: RegExp | string): HTMLElement {
  return screen.getByRole("button", { name });
}

function Arabic(props: ParentProps) {
  provideLocale("ar-EG");
  return <div dir="rtl">{props.children}</div>;
}

describe("DataToolbar filter kinds", () => {
  test("a toggle filter is a pressed button while on", async () => {
    const seen: boolean[] = [];
    render(() => (
      <DataToolbar
        filters={[
          { kind: "toggle", id: "mine", label: "Started by me", onChange: (on) => seen.push(on) },
        ]}
      />
    ));
    const toggle = chip("Started by me");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    await user.click(toggle);
    await settle();
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(seen).toEqual([true]);
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await settle();
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(seen).toEqual([true, false]);
  });

  test("a long facet takes a field that narrows its options, each with its icon", async () => {
    const seen: string[][] = [];
    render(() => (
      <DataToolbar
        filters={[
          {
            id: "zone",
            label: "Time zone",
            multiple: false,
            options: ZONES.map((zone) => ({ ...zone, icon: Globe })),
            onChange: (value) => seen.push(value),
          },
        ]}
      />
    ));
    await user.click(chip("Time zone"));
    await settle();
    const field = await waitFor(() => screen.getByRole("combobox"));
    expect(screen.getAllByRole("option")).toHaveLength(8);
    await user.type(field, "europe/");
    await settle();
    const options = screen.getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual(["Europe/Berlin", "Europe/London"]);
    await user.click(options[1] as HTMLElement);
    await settle();
    expect(seen).toEqual([["Europe/London"]]);
    expect(chip(/^Time zone: Europe\/London/)).toBeDefined();
  });

  test("a short facet stays a menu, its options with their counts", async () => {
    render(() => (
      <DataToolbar
        filters={[
          {
            id: "kind",
            label: "Kind",
            options: [
              { value: "api", label: "API", count: 4 },
              { value: "browser", label: "Browser", count: 9 },
            ],
          },
        ]}
      />
    ));
    await user.click(chip("Kind"));
    await settle();
    const browser = await waitFor(() => screen.getByRole("menuitemcheckbox", { name: /^Browser/ }));
    expect(browser.textContent).toContain("9");
  });

  test("a date range from a preset, said on the chip, and Any time clears it", async () => {
    const seen: (DateRange | null)[] = [];
    render(() => (
      <DataToolbar
        filters={[
          { kind: "date-range", id: "when", label: "Date", onChange: (range) => seen.push(range) },
        ]}
      />
    ));
    await user.click(chip("Date"));
    await settle();
    await user.click(await waitFor(() => screen.getByRole("button", { name: "Last 7 days" })));
    await settle();
    const end = today(getLocalTimeZone());
    expect(seen[0]?.end.toString()).toBe(end.toString());
    expect(seen[0]?.start.toString()).toBe(end.subtract({ days: 6 }).toString());
    expect(chip("Date: Last 7 days")).toBeDefined();
    await user.click(chip("Date: Last 7 days"));
    await settle();
    await user.click(await waitFor(() => screen.getByRole("button", { name: "Any time" })));
    await settle();
    expect(seen.at(-1)).toBeNull();
    expect(chip("Date")).toBeDefined();
  });

  test("filters, a date range and a debounced search live in the address", async () => {
    function Sessions() {
      return (
        <DataToolbar
          search={{ label: "Search", param: "q", debounce: 30 }}
          filters={[
            { kind: "toggle", id: "mine", label: "Started by me", param: "mine" },
            { kind: "date-range", id: "when", label: "Date", param: "when" },
          ]}
        />
      );
    }
    const view = await renderRoute({
      routeTree: [{ path: "/sessions", component: Sessions }] as never,
      path: "/sessions?mine=1&when=2026-03-01/2026-03-07&tab=all",
    });
    await settle();
    expect(chip("Started by me").getAttribute("aria-pressed")).toBe("true");
    expect(chip(/^Date: /).textContent).toContain("Mar");

    const box = screen.getByRole<HTMLInputElement>("searchbox", { name: "Search" });
    await user.type(box, "eu");
    expect(box.value).toBe("eu");
    expect(view.state.search().has("q")).toBe(false);
    await waitFor(() => expect(view.state.search().get("q")).toBe("eu"));

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(view.state.search().has("when")).toBe(false));
    expect(view.state.search().has("mine")).toBe(false);
    expect(view.state.search().has("q")).toBe(false);
    expect(view.state.search().get("tab")).toBe("all");
    await waitFor(() => expect(box.value).toBe(""));
    view.unmount();
  });

  test("key=value chips from elsewhere, each removable by name", async () => {
    const removed: string[] = [];
    render(() => (
      <DataToolbar
        chips={[
          { id: "env", label: "env", value: "prod", onRemove: () => removed.push("env") },
          { id: "team", label: "team", value: "web" },
        ]}
      />
    ));
    await user.click(screen.getByRole("button", { name: "Remove env: prod" }));
    expect(removed).toEqual(["env"]);
    expect(screen.queryByRole("button", { name: "Remove team: web" })).toBeNull();
    expect(screen.getByText("team: web")).toBeDefined();
  });

  test("the period sits after the filters and Clear leaves it alone", () => {
    render(() => (
      <DataToolbar
        search={{ label: "Search", defaultValue: "x" }}
        period={<span data-testid="week">Week of 3 March</span>}
      />
    ));
    const period = document.querySelector('[data-slot="data-toolbar-period"]');
    expect(period?.textContent).toBe("Week of 3 March");
  });

  test("on a phone the filters are one button that opens them in a sheet", async () => {
    const [status, setStatus] = createSignal<string[]>(["open"]);
    function filters(): DataToolbarFilter[] {
      return [
        {
          id: "status",
          label: "Status",
          value: status(),
          onChange: setStatus,
          options: [
            { value: "open", label: "Open", group: "Active" },
            { value: "ack", label: "Acknowledged", group: "Active" },
            { value: "resolved", label: "Resolved", group: "Done" },
          ],
        },
        { kind: "toggle", id: "mine", label: "Mine" },
      ];
    }
    render(() => <DataToolbar filters={filters()} />);
    const trigger = screen.getByRole("button", { name: "Filters, 1 filter applied" });
    await user.click(trigger);
    await settle();
    const sheet = await waitFor(() => screen.getByRole("dialog", { name: "Filters" }));
    expect(within(sheet).getByRole("group", { name: "Active" })).toBeDefined();
    await user.click(within(sheet).getByLabelText("Resolved"));
    await settle();
    expect(status()).toEqual(["open", "resolved"]);
    await user.click(within(sheet).getByRole("switch", { name: "Mine" }));
    await settle();
    expect(screen.getByRole("button", { name: "Filters, 2 filters applied" })).toBeDefined();
    expect(await ariaViolations(sheet)).toEqual([]);
    await user.click(within(sheet).getByRole("button", { name: "Done" }));
    await settle();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  test("runs right to left", async () => {
    render(() => (
      <Arabic>
        <DataToolbar
          filters={[
            { kind: "toggle", id: "mine", label: "لي" },
            { id: "kind", label: "النوع", options: [{ value: "a", label: "أ" }] },
          ]}
        />
      </Arabic>
    ));
    expect(chip("لي")).toBeDefined();
    expect(chip("النوع")).toBeDefined();
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("hydrates every kind", async () => {
    const result = await hydrates(`
      import { DataToolbar } from "<arc>";
      export function Page() {
        return (
          <DataToolbar
            search={{ label: "Search", defaultValue: "disk" }}
            filters={[
              { id: "status", label: "Status", defaultValue: ["open"], options: [{ value: "open", label: "Open", count: 2 }] },
              { kind: "toggle", id: "mine", label: "Mine", defaultValue: true },
              { kind: "date-range", id: "when", label: "Date" },
            ]}
            chips={[{ id: "env", label: "env", value: "prod" }]}
            period={<span>This week</span>}
          />
        );
      }
    `);
    expect(result.container.textContent).toContain("env: prod");
    expect(result.container.querySelector('[aria-pressed="true"]')?.textContent).toBe("Mine");
    result.unmount();
  });
});
