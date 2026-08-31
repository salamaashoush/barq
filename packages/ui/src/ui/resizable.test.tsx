import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render } from "@barqjs/testing";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "./resizable.tsx";

function Two(props: {
  direction?: "horizontal" | "vertical";
  onLayout?: (sizes: number[]) => void;
}) {
  return (
    <ResizablePanelGroup direction={props.direction} onLayout={props.onLayout}>
      <ResizablePanel defaultSize={30}>left</ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={70}>right</ResizablePanel>
    </ResizablePanelGroup>
  );
}

const panels = (): HTMLElement[] => [
  ...document.querySelectorAll<HTMLElement>('[data-slot="resizable-panel"]'),
];
const handle = (): HTMLElement =>
  document.querySelector('[data-slot="resizable-handle"]') as HTMLElement;

/** The percentage out of `flex: 0 0 N%`. */
function sizeOf(panel: HTMLElement): number {
  return Number.parseFloat(panel.style.flex.split(" ").at(-1)?.replace("%", "") ?? "0");
}

describe("Resizable", () => {
  test("the orientation is an aria attribute, because the rules select on it", () => {
    // `aria-[orientation=vertical]:flex-col` is what turns the row into a
    // column, so this is the layout rather than a label for it.
    render(() => <Two />);
    const group = document.querySelector('[data-slot="resizable-panel-group"]');
    expect(group?.getAttribute("aria-orientation")).toBe("horizontal");
  });

  test("a vertical group says so", () => {
    render(() => <Two direction="vertical" />);
    expect(
      document
        .querySelector('[data-slot="resizable-panel-group"]')
        ?.getAttribute("aria-orientation"),
    ).toBe("vertical");
  });

  test("a panel's size is a flex-basis percentage, not a width", () => {
    // A width is ignored the moment the container is a flex row, and pixels
    // would drift as the container resized.
    render(() => <Two />);
    expect(sizeOf(panels()[0] as HTMLElement)).toBe(30);
    expect(sizeOf(panels()[1] as HTMLElement)).toBe(70);
  });

  test("panels naming no size share what is left", () => {
    render(() => (
      <ResizablePanelGroup>
        <ResizablePanel defaultSize={50}>a</ResizablePanel>
        <ResizableHandle />
        <ResizablePanel>b</ResizablePanel>
        <ResizableHandle />
        <ResizablePanel>c</ResizablePanel>
      </ResizablePanelGroup>
    ));
    const sizes = panels().map((each) => sizeOf(each));
    expect(sizes[0]).toBe(50);
    expect(sizes[1]).toBeCloseTo(25, 5);
    expect(sizes[2]).toBeCloseTo(25, 5);
    expect(sizes.reduce((sum, each) => sum + each, 0)).toBeCloseTo(100, 5);
  });

  test("the handle is a separator a keyboard can reach", () => {
    // A drag that only works with a pointer is a control half the people using
    // it cannot reach.
    render(() => <Two />);
    expect(handle().getAttribute("role")).toBe("separator");
    expect(handle().getAttribute("tabindex")).toBe("0");
    // Perpendicular to the group: a horizontal group has a vertical divider.
    expect(handle().getAttribute("aria-orientation")).toBe("vertical");
  });

  test("an arrow moves one panel into its neighbour, keeping the total", () => {
    const seen: number[][] = [];
    render(() => <Two onLayout={(sizes) => seen.push(sizes)} />);
    handle().dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    flush();
    expect(sizeOf(panels()[0] as HTMLElement)).toBe(31);
    expect(sizeOf(panels()[1] as HTMLElement)).toBe(69);
    expect(seen.at(-1)).toEqual([31, 69]);
  });

  test("the other arrow goes the other way", () => {
    render(() => <Two />);
    handle().dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    flush();
    expect(sizeOf(panels()[0] as HTMLElement)).toBe(29);
  });

  test("a vertical group listens to the up and down arrows instead", () => {
    render(() => <Two direction="vertical" />);
    handle().dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    flush();
    expect(sizeOf(panels()[0] as HTMLElement)).toBe(30);
    handle().dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    flush();
    expect(sizeOf(panels()[0] as HTMLElement)).toBe(31);
  });

  test("End goes as far as the LIMITS allow, not as far as it was asked", () => {
    // The pair's total is fixed, so a move the first panel would allow can
    // still be one the second will not.
    render(() => <Two />);
    handle().dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    flush();
    // The second panel's default minimum is 10, so the first stops at 90.
    expect(sizeOf(panels()[0] as HTMLElement)).toBe(90);
    expect(sizeOf(panels()[1] as HTMLElement)).toBe(10);
  });

  test("Home stops at the first panel's own minimum", () => {
    render(() => <Two />);
    handle().dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    flush();
    expect(sizeOf(panels()[0] as HTMLElement)).toBe(10);
    expect(sizeOf(panels()[1] as HTMLElement)).toBe(90);
  });

  test("a panel's own minimum is honoured over the default", () => {
    render(() => (
      <ResizablePanelGroup>
        <ResizablePanel defaultSize={50} minSize={40}>
          a
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={50}>b</ResizablePanel>
      </ResizablePanelGroup>
    ));
    handle().dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    flush();
    expect(sizeOf(panels()[0] as HTMLElement)).toBe(40);
    expect(sizeOf(panels()[1] as HTMLElement)).toBe(60);
  });

  test("the grip is opt-in, because a one-pixel line is hard to find", () => {
    render(() => (
      <ResizablePanelGroup>
        <ResizablePanel>a</ResizablePanel>
        <ResizableHandle />
        <ResizablePanel>b</ResizablePanel>
      </ResizablePanelGroup>
    ));
    expect(document.querySelector('[data-slot="resizable-handle-grip"]')).toBeNull();
  });

  test("a panel outside a group says what is wrong", () => {
    expect(() => render(() => <ResizablePanel>loose</ResizablePanel>)).toThrow(
      "inside a <ResizablePanelGroup>",
    );
  });
});
