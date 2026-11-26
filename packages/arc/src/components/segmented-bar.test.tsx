import { describe, expect, test } from "bun:test";
import { type ParentProps, createSignal } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { type BarSegment, SegmentedBar, TallyProgress } from "./segmented-bar.tsx";

const TIMING: BarSegment[] = [
  { key: "dns", label: "DNS", value: 20 },
  { key: "connect", label: "Connect", value: 30 },
  { key: "wait", label: "Waiting", value: 150, tone: "warning" },
];

function widths(root: ParentNode = document): string[] {
  return [...root.querySelectorAll('[data-slot="segmented-bar-segment"]')].map((segment) =>
    (segment as HTMLElement).style.getPropertyValue("inline-size"),
  );
}

describe("SegmentedBar", () => {
  test("splits the bar by each share, and its legend names and counts every segment", async () => {
    render(() => <SegmentedBar label="Request timing" segments={TIMING} caption="200 ms" />);
    const group = screen.getByRole("group", { name: "Request timing" });
    expect(widths()).toEqual(["10%", "15%", "75%"]);
    const track = group.querySelector('[data-slot="segmented-bar-track"]');
    expect(track?.getAttribute("aria-hidden")).toBe("true");
    const items = [...group.querySelectorAll('[data-slot="segmented-bar-item"]')];
    expect(items.map((item) => item.textContent)).toEqual(["DNS20", "Connect30", "Waiting150"]);
    const colours = [...group.querySelectorAll('[data-slot="segmented-bar-segment"]')].map((one) =>
      (one as HTMLElement).style.getPropertyValue("background-color"),
    );
    expect(colours).toEqual(["var(--chart-1)", "var(--chart-2)", "var(--warning)"]);
    expect(screen.getByText("200 ms")).toBeDefined();
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("with no legend, is an image whose name says every share", () => {
    render(() => (
      <SegmentedBar label="Outcomes" legend={false} total={10} segments={TIMING.slice(0, 1)} />
    ));
    const image = screen.getByRole("img");
    expect(image.getAttribute("aria-label")).toBe("Outcomes: DNS 20; 10 in all");
    expect(document.querySelector('[data-slot="segmented-bar-legend"]')).toBeNull();
  });

  test("draws a share of the whole in the legend, leaves the rest of a larger total empty, and skips empty segments", () => {
    render(() => (
      <SegmentedBar
        label="Storage"
        shares
        total={400}
        segments={[...TIMING, { key: "none", label: "Nothing", value: 0 }]}
      />
    ));
    expect(widths()).toEqual(["5%", "7.5%", "37.5%"]);
    const counts = [...document.querySelectorAll('[data-slot="segmented-bar-count"]')].map(
      (count) => count.textContent,
    );
    expect(counts).toEqual(["5%", "7.5%", "37.5%", "0%"]);
  });

  test("writes its counts in the locale", () => {
    function Arabic(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <SegmentedBar label="التوقيت" segments={TIMING} />
      </Arabic>
    ));
    expect(document.querySelector('[data-slot="segmented-bar-count"]')?.textContent).toBe("٢٠");
  });

  test("takes a class per part", () => {
    render(() => (
      <SegmentedBar
        label="Timing"
        segments={TIMING}
        class="mine"
        classes={{ track: "t", segment: "s", legend: "l", swatch: "w" }}
      />
    ));
    const root = document.querySelector('[data-slot="segmented-bar"]');
    expect(root?.classList.contains("mine")).toBe(true);
    expect(root?.querySelector('[data-slot="segmented-bar-track"]')?.classList.contains("t")).toBe(
      true,
    );
    expect(
      root?.querySelector('[data-slot="segmented-bar-segment"]')?.classList.contains("s"),
    ).toBe(true);
    expect(root?.querySelector('[data-slot="segmented-bar-legend"]')?.classList.contains("l")).toBe(
      true,
    );
    expect(root?.querySelector('[data-slot="segmented-bar-swatch"]')?.classList.contains("w")).toBe(
      true,
    );
  });
});

describe("TallyProgress", () => {
  test("is a progress bar reading how many finished of how many, filling by outcome", async () => {
    const [failed, setFailed] = createSignal(3);
    render(() => (
      <TallyProgress
        label="Tests finished"
        total={50}
        segments={[
          { key: "passed", label: "Passed", value: 40, tone: "success" },
          { key: "failed", label: "Failed", value: failed(), tone: "danger" },
        ]}
      />
    ));
    const bar = screen.getByRole("progressbar", { name: "Tests finished" });
    expect(bar.getAttribute("aria-valuenow")).toBe("43");
    expect(bar.getAttribute("aria-valuemax")).toBe("50");
    expect(bar.getAttribute("aria-valuetext")).toBe("43 of 50 finished");
    expect(widths()).toEqual(["80%", "6%"]);
    expect(screen.getByText("43 of 50 finished")).toBeDefined();
    setFailed(10);
    await settle();
    expect(bar.getAttribute("aria-valuetext")).toBe("All 50 finished");
    expect(
      document.querySelector('[data-slot="tally-progress"]')?.hasAttribute("data-complete"),
    ).toBe(true);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("takes a caption of its own and goes without a legend", () => {
    render(() => (
      <TallyProgress
        label="Rows imported"
        total={0}
        segments={[]}
        legend={false}
        caption="Nothing yet"
      />
    ));
    expect(screen.getByRole("progressbar").getAttribute("aria-valuetext")).toBe("Nothing yet");
    expect(document.querySelector('[data-slot="segmented-bar-legend"]')).toBeNull();
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { SegmentedBar, TallyProgress } from "<arc>";
      export function Page() {
        return (
          <>
            <SegmentedBar label="Timing" segments={[{ key: "a", label: "A", value: 1 }, { key: "b", label: "B", value: 3 }]} />
            <TallyProgress label="Tests" total={4} segments={[{ key: "p", label: "Passed", value: 2, tone: "success" }]} />
          </>
        );
      }
    `);
    expect(result.container.querySelectorAll('[data-slot="segmented-bar-segment"]')).toHaveLength(
      3,
    );
    result.unmount();
  });
});
