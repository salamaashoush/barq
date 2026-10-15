import { afterEach, describe, expect, test } from "bun:test";
import { provideDirection } from "@barqjs/aria/i18n";
import { createSignal, flush, type Child, type Incoming } from "@barqjs/core";
import { cleanup, expectNoAriaViolations, render, screen } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";

import { Progress, ProgressLabel, ProgressValue } from "./progress.tsx";

afterEach(cleanup);

const slot = (name: string): HTMLElement =>
  document.querySelector(`[data-slot="${name}"]`) as HTMLElement;

function Mirrored(props: Incoming<{ children?: Child }>) {
  provideDirection("rtl");
  return <div dir="rtl">{props.children}</div>;
}

describe("Progress", () => {
  test("max is the top of the range, and the fill is measured against it", () => {
    render(() => <Progress value={2} max={4} label="Steps" />);
    const bar = screen.getByRole("progressbar", { name: "Steps" });
    expect(bar.getAttribute("aria-valuemax")).toBe("4");
    expect(slot("progress-indicator").style.transform).toBe("translateX(-50%)");
  });

  test("the root and the fill say loading, complete or indeterminate", () => {
    const [value, setValue] = createSignal(30);
    const [unknown, setUnknown] = createSignal(false);
    render(() => <Progress value={value()} isIndeterminate={unknown()} label="Upload" />);
    for (const name of ["progress", "progress-indicator"]) {
      expect(slot(name).getAttribute("data-state"), name).toBe("loading");
      expect(slot(name).getAttribute("data-value"), name).toBe("30");
      expect(slot(name).getAttribute("data-max"), name).toBe("100");
    }
    setValue(100);
    flush();
    expect(slot("progress").getAttribute("data-state")).toBe("complete");
    expect(slot("progress-indicator").getAttribute("data-state")).toBe("complete");

    setUnknown(true);
    flush();
    expect(slot("progress").getAttribute("data-state")).toBe("indeterminate");
    expect(slot("progress").hasAttribute("data-value")).toBe(false);
  });

  test("getValueLabel decides what a screen reader says for the value", () => {
    render(() => (
      <Progress
        value={2}
        max={4}
        label="Steps"
        getValueLabel={(value, max) => `${String(value)} of ${String(max)}`}
      />
    ));
    expect(screen.getByRole("progressbar").getAttribute("aria-valuetext")).toBe("2 of 4");
  });

  test("right to left, the fill grows from the right", () => {
    render(() => (
      <Mirrored>
        <Progress value={25} label="Upload" />
      </Mirrored>
    ));
    expect(slot("progress-indicator").style.transform).toBe("translateX(75%)");
  });
});

describe("Progress, with its parts written out", () => {
  function Upload(props: Incoming<{ value?: number; isIndeterminate?: boolean }>) {
    return (
      <Progress value={props.value?.() ?? 40} isIndeterminate={props.isIndeterminate?.()}>
        <ProgressLabel>Upload</ProgressLabel>
        <ProgressValue />
      </Progress>
    );
  }

  test("the label names the bar", () => {
    render(() => <Upload />);
    const bar = screen.getByRole("progressbar", { name: "Upload" });
    expect(bar.getAttribute("data-slot")).toBe("progress");
    expect(bar.getAttribute("aria-labelledby")).toBe(slot("progress-label").id);
  });

  test("the track is its own element, after the label and the value, holding the fill", () => {
    render(() => <Upload />);
    const root = slot("progress");
    expect([...root.children].map((child) => child.getAttribute("data-slot"))).toEqual([
      "progress-label",
      "progress-value",
      "progress-track",
    ]);
    expect(slot("progress-track").firstElementChild).toBe(slot("progress-indicator"));
    expect(slot("progress-indicator").style.transform).toBe("translateX(-60%)");
    // The root lays the label and value out in a row above a full-width track,
    // so it cannot also be the pill that clips the fill.
    expect(rulesFor(root.className)).toContain("flex-wrap: wrap");
    expect(rulesFor(root.className)).not.toContain("overflow-x: hidden");
    expect(rulesFor(slot("progress-track").className)).toContain("overflow-x: hidden");
  });

  test("the value is the formatted percentage, pushed to the end of the row", () => {
    render(() => <Upload />);
    expect(slot("progress-value").textContent).toBe("40%");
    const rules = rulesFor(slot("progress-value").className);
    expect(rules).toContain("margin-inline-start: auto");
    expect(rules).toContain("font-variant-numeric: tabular-nums");
  });

  test("an indeterminate bar shows no value", () => {
    render(() => <Upload isIndeterminate />);
    expect(slot("progress-value").textContent).toBe("");
  });

  test("the value can be written by the caller from the number", () => {
    render(() => (
      <Progress value={3} max={12}>
        <ProgressLabel>Files</ProgressLabel>
        <ProgressValue>
          {(formatted: string | null, value: number | null) =>
            `${String(value)} of 12 (${String(formatted)})`
          }
        </ProgressValue>
      </Progress>
    ));
    expect(slot("progress-value").textContent).toBe("3 of 12 (25%)");
  });

  test("has no ARIA violations", () => {
    const { container } = render(() => <Upload />);
    expectNoAriaViolations(container);
  });

  test("a part outside a progress bar says what is wrong", () => {
    expect(() => render(() => <ProgressValue />)).toThrow("inside a <Progress>");
  });
});
