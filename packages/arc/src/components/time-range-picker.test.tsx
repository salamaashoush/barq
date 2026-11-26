import { describe, expect, test } from "bun:test";
import { type ParentProps, createSignal } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user, waitFor } from "@barqjs/testing";
import { renderRoute } from "@barqjs/testing/router";

import { hydrates, settle } from "../test-arc.ts";
import { ENGLISH } from "./messages.ts";
import {
  type TimeRange,
  TimeRangePicker,
  commonTimeRangePresets,
  parseTimeRange,
  resolveTimeRange,
} from "./time-range-picker.tsx";

const PRESETS = commonTimeRangePresets(ENGLISH);

function pressed(): string[] {
  return screen
    .getAllByRole("button")
    .filter((one) => one.getAttribute("aria-pressed") === "true")
    .map((one) => one.textContent ?? "");
}

describe("TimeRangePicker", () => {
  test("presets as one held segment, the first by default, in a named group", async () => {
    render(() => <TimeRangePicker />);
    expect(screen.getByRole("group", { name: "Time range" })).toBeDefined();
    expect(pressed()).toEqual(["Last hour"]);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("choosing a preset hands back the range, which resolves against the clock", async () => {
    const seen: TimeRange[] = [];
    render(() => <TimeRangePicker onChange={(range) => seen.push(range)} />);
    await user.click(screen.getByRole("button", { name: "Last 7 days" }));
    await settle();
    expect(seen).toEqual([{ preset: "7d" }]);
    const at = Date.parse("2026-11-24T09:00:00Z");
    expect(resolveTimeRange({ preset: "7d" }, PRESETS, at)).toEqual({
      start: new Date("2026-11-17T09:00:00Z"),
      end: new Date("2026-11-24T09:00:00Z"),
    });
  });

  test("Live is offered for a preset and pressed while on", async () => {
    const [live, setLive] = createSignal(false);
    render(() => <TimeRangePicker live={live()} onLiveChange={setLive} />);
    const toggle = screen.getByRole("button", { name: "Live" });
    await user.click(toggle);
    await settle();
    expect(live()).toBe(true);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(toggle.querySelector("[data-pulse]")).not.toBeNull();
  });

  test("Custom opens two fields that refuse an end before the start, and Apply holds them", async () => {
    const seen: TimeRange[] = [];
    render(() => (
      <TimeRangePicker
        timeZone="UTC"
        defaultValue={{ start: "2026-03-01T10:00:00.000Z", end: "2026-03-02T10:00:00.000Z" }}
        onChange={(range) => seen.push(range)}
        live={false}
      />
    ));
    expect(pressed()).toEqual([expect.stringContaining("Mar 1, 2026") as unknown as string]);
    expect(screen.queryByRole("button", { name: "Live" })).toBeNull();
    await user.click(screen.getByRole("button", { name: /Mar 1, 2026/ }));
    await settle();
    const dialog = await waitFor(() => screen.getByRole("dialog", { name: "Custom" }));
    const apply = screen.getByRole("button", { name: "Apply" });
    expect(dialog.querySelectorAll('[role="spinbutton"]').length).toBeGreaterThan(5);
    screen.getByRole("spinbutton", { name: "day, To" }).focus();
    await user.keyboard("{ArrowDown}");
    await settle();
    expect(screen.getByRole("alert").textContent).toBe("The end has to come after the start");
    expect(apply.getAttribute("aria-disabled") === "true" || apply.hasAttribute("disabled")).toBe(
      true,
    );
    await user.keyboard("{ArrowUp}{ArrowUp}");
    await settle();
    await user.click(apply);
    await settle();
    expect(seen).toEqual([{ start: "2026-03-01T10:00:00.000Z", end: "2026-03-03T10:00:00.000Z" }]);
  });

  test("in a search parameter: the default is left out and a bad value falls back", async () => {
    function Check() {
      return <TimeRangePicker param="window" />;
    }
    const view = await renderRoute({
      routeTree: [{ path: "/check", component: Check }] as never,
      path: "/check?window=1y&tab=runs",
    });
    await settle();
    expect(pressed()).toEqual(["Last hour"]);
    await user.click(screen.getByRole("button", { name: "Last 30 days" }));
    await waitFor(() => expect(view.state.search().get("window")).toBe("30d"));
    await user.click(screen.getByRole("button", { name: "Last hour" }));
    await waitFor(() => expect(view.state.search().has("window")).toBe(false));
    expect(view.state.search().get("tab")).toBe("runs");
    view.unmount();
  });

  test("a custom range reads back from the address, and a reversed one is refused", () => {
    expect(parseTimeRange("2026-03-01T10:00:00Z/2026-03-02T10:00:00Z", PRESETS)).toEqual({
      start: "2026-03-01T10:00:00.000Z",
      end: "2026-03-02T10:00:00.000Z",
    });
    expect(parseTimeRange("2026-03-02T10:00:00Z/2026-03-01T10:00:00Z", PRESETS)).toBeUndefined();
    expect(parseTimeRange("24h", PRESETS)).toEqual({ preset: "24h" });
  });

  test("runs right to left", async () => {
    function Arabic(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <TimeRangePicker />
      </Arabic>
    ));
    user.tab();
    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement?.textContent).toBe("Last 24 hours");
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { TimeRangePicker } from "<arc>";
      export function Page() {
        return <TimeRangePicker defaultValue={{ preset: "24h" }} live onLiveChange={() => {}} />;
      }
    `);
    expect(result.container.querySelector('[aria-pressed="true"]')?.textContent).toBe(
      "Last 24 hours",
    );
    result.unmount();
  });
});
