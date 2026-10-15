import { describe, expect, test } from "bun:test";
import { Show, createSignal, flush } from "@barqjs/core";
import { render, user } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";

import { DirectionProvider } from "./direction.tsx";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  type ResizableGroupHandle,
  type ResizablePanelHandle,
  type ResizablePanelSize,
  type ResizableStorage,
} from "./resizable.tsx";

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

const handles = (): HTMLElement[] => [
  ...document.querySelectorAll<HTMLElement>('[data-slot="resizable-handle"]'),
];
const groups = (): HTMLElement[] => [
  ...document.querySelectorAll<HTMLElement>('[data-slot="resizable-panel-group"]'),
];
const layoutNow = (): number[] => panels().map((each) => sizeOf(each));

/** happy-dom measures nothing, so the group's extent is declared. */
function measured(element: HTMLElement, width: number, height: number): void {
  element.getBoundingClientRect = () => ({ width, height }) as DOMRect;
}

function press(key: string, target: HTMLElement = handle(), init: KeyboardEventInit = {}): void {
  user.focus(target);
  user.keyDown(key, init);
  flush();
}

function memory(): ResizableStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (name) => data.get(name) ?? null,
    setItem: (name, value) => void data.set(name, value),
  };
}

describe("Resizable group", () => {
  test("orientation is the same prop as direction, under upstream's name", () => {
    render(() => (
      <ResizablePanelGroup orientation="vertical">
        <ResizablePanel defaultSize="25%">a</ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize="75%">b</ResizablePanel>
      </ResizablePanelGroup>
    ));
    const group = groups()[0] as HTMLElement;
    expect(group.getAttribute("aria-orientation")).toBe("vertical");
    expect(group.getAttribute("data-orientation")).toBe("vertical");
    expect(group.getAttribute("data-panel-group-direction")).toBe("vertical");
    expect(handle().getAttribute("aria-orientation")).toBe("horizontal");
    // A percentage string is a size too, which is how upstream writes them.
    expect(layoutNow()).toEqual([25, 75]);
    press("ArrowDown");
    expect(layoutNow()).toEqual([26, 74]);
  });

  test("the separator says how big the panel it controls is, and between what", () => {
    render(() => (
      <ResizablePanelGroup>
        <ResizablePanel id="nav" defaultSize={30} minSize={15} maxSize={60}>
          a
        </ResizablePanel>
        <ResizableHandle aria-label="Resize navigation" />
        <ResizablePanel defaultSize={70}>b</ResizablePanel>
      </ResizablePanelGroup>
    ));
    expect(handle().getAttribute("aria-valuenow")).toBe("30");
    expect(handle().getAttribute("aria-valuemin")).toBe("15");
    expect(handle().getAttribute("aria-valuemax")).toBe("60");
    expect(handle().getAttribute("aria-controls")).toBe("nav");
    expect(handle().getAttribute("aria-label")).toBe("Resize navigation");
    expect(panels()[0]?.id).toBe("nav");
    expect(panels()[0]?.getAttribute("data-panel-size")).toBe("30");

    press("ArrowRight");
    expect(handle().getAttribute("aria-valuenow")).toBe("31");
  });

  test("a panel given no id gets one, so the separator still has something to control", () => {
    render(() => <Two />);
    const controlled = handle().getAttribute("aria-controls");
    expect(controlled).not.toBeNull();
    expect(panels()[0]?.id).toBe(controlled ?? "");
  });

  test("the arrows of the other axis are left to the page", () => {
    render(() => <Two />);
    user.focus(handle());
    expect(user.keyDown("ArrowDown")).toBe(true);
    expect(user.keyDown("ArrowRight")).toBe(false);
  });

  test("keyboardResizeBy sets how far one arrow goes", () => {
    render(() => (
      <ResizablePanelGroup keyboardResizeBy={5}>
        <ResizablePanel defaultSize={30}>a</ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={70}>b</ResizablePanel>
      </ResizablePanelGroup>
    ));
    press("ArrowRight");
    expect(layoutNow()).toEqual([35, 65]);
  });

  test("right to left turns the horizontal arrows round", () => {
    render(() => (
      <ResizablePanelGroup dir="rtl">
        <ResizablePanel defaultSize={30}>a</ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={70}>b</ResizablePanel>
      </ResizablePanelGroup>
    ));
    expect(groups()[0]?.getAttribute("dir")).toBe("rtl");
    // The first panel is on the right, so moving the divider right shrinks it.
    press("ArrowRight");
    expect(layoutNow()).toEqual([29, 71]);
    // Home is the controlled panel's minimum whichever side that is on.
    press("Home");
    expect(layoutNow()).toEqual([10, 90]);
  });

  test("the direction declared around it is read too", () => {
    render(() => (
      <DirectionProvider dir="rtl">
        <Two />
      </DirectionProvider>
    ));
    press("ArrowLeft");
    expect(layoutNow()).toEqual([31, 69]);
  });

  test("a move the neighbour cannot take carries into the panel after it", () => {
    render(() => (
      <ResizablePanelGroup>
        <ResizablePanel defaultSize={40}>a</ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={30} minSize={20}>
          b
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={30}>c</ResizablePanel>
      </ResizablePanelGroup>
    ));
    press("End", handles()[0]);
    expect(layoutNow()).toEqual([70, 20, 10]);
  });

  test("F6 moves between the handles, and Shift+F6 back", () => {
    render(() => (
      <ResizablePanelGroup>
        <ResizablePanel>a</ResizablePanel>
        <ResizableHandle />
        <ResizablePanel>b</ResizablePanel>
        <ResizableHandle />
        <ResizablePanel>c</ResizablePanel>
      </ResizablePanelGroup>
    ));
    press("F6", handles()[0]);
    expect(document.activeElement).toBe(handles()[1] as HTMLElement);
    user.keyDown("F6");
    expect(document.activeElement).toBe(handles()[0] as HTMLElement);
    user.keyDown("F6", { shiftKey: true });
    expect(document.activeElement).toBe(handles()[1] as HTMLElement);
  });

  test("onLayoutChange names the panels, and onLayout keeps its list", () => {
    const named: Record<string, number>[] = [];
    const listed: number[][] = [];
    render(() => (
      <ResizablePanelGroup
        onLayoutChange={(layout) => named.push(layout)}
        onLayout={(sizes) => listed.push(sizes)}
      >
        <ResizablePanel id="nav" defaultSize={30}>
          a
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel id="main" defaultSize={70}>
          b
        </ResizablePanel>
      </ResizablePanelGroup>
    ));
    press("ArrowRight");
    expect(named).toEqual([{ nav: 31, main: 69 }]);
    expect(listed).toEqual([[31, 69]]);
  });

  test("a disabled group cannot be moved, and its handles leave the tab order", () => {
    render(() => (
      <ResizablePanelGroup disabled>
        <ResizablePanel defaultSize={30}>a</ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={70}>b</ResizablePanel>
      </ResizablePanelGroup>
    ));
    expect(handle().getAttribute("aria-disabled")).toBe("true");
    expect(handle().hasAttribute("tabindex")).toBe(false);
    expect(handle().hasAttribute("data-disabled")).toBe(true);
    handle().dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    flush();
    expect(layoutNow()).toEqual([30, 70]);
  });

  test("one handle can be disabled on its own", () => {
    render(() => (
      <ResizablePanelGroup>
        <ResizablePanel defaultSize={30}>a</ResizablePanel>
        <ResizableHandle disabled />
        <ResizablePanel defaultSize={70}>b</ResizablePanel>
      </ResizablePanelGroup>
    ));
    expect(handle().getAttribute("aria-disabled")).toBe("true");
    expect(handle().getAttribute("data-separator")).toBe("disabled");
  });

  test("a limit written in pixels is a share of the measured group", () => {
    render(() => (
      <ResizablePanelGroup>
        <ResizablePanel defaultSize={50} minSize="200px">
          a
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={50}>b</ResizablePanel>
      </ResizablePanelGroup>
    ));
    measured(groups()[0] as HTMLElement, 1000, 400);
    press("Home");
    expect(layoutNow()).toEqual([20, 80]);
  });

  test("a panel that appears later lands where it sits in the document", () => {
    const [aside, setAside] = createSignal(false);
    render(() => (
      <ResizablePanelGroup>
        <ResizablePanel id="nav" defaultSize={20}>
          a
        </ResizablePanel>
        <ResizableHandle />
        <Show when={aside()}>
          <ResizablePanel id="aside" defaultSize={30}>
            b
          </ResizablePanel>
          <ResizableHandle />
        </Show>
        <ResizablePanel id="main">c</ResizablePanel>
      </ResizablePanelGroup>
    ));
    expect(layoutNow()).toEqual([20, 80]);

    setAside(true);
    flush();
    expect(panels().map((each) => each.id)).toEqual(["nav", "aside", "main"]);
    expect(layoutNow()).toEqual([20, 30, 50]);
    expect(handles()[0]?.getAttribute("aria-controls")).toBe("nav");
    expect(handles()[1]?.getAttribute("aria-controls")).toBe("aside");

    setAside(false);
    flush();
    expect(layoutNow()).toEqual([20, 80]);
  });

  test("a nested group resizes its own panels and leaves the outer ones alone", () => {
    render(() => (
      <ResizablePanelGroup orientation="horizontal">
        <ResizablePanel id="one" defaultSize="50%">
          One
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel id="rest" defaultSize="50%">
          <ResizablePanelGroup orientation="vertical">
            <ResizablePanel id="two" defaultSize="25%">
              Two
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel id="three" defaultSize="75%">
              Three
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>
    ));
    const size = (id: string): number => sizeOf(document.getElementById(id) as HTMLElement);
    expect(handles()[1]?.getAttribute("aria-controls")).toBe("two");
    expect(handles()[1]?.getAttribute("aria-orientation")).toBe("horizontal");

    press("ArrowDown", handles()[1]);
    expect([size("two"), size("three")]).toEqual([26, 74]);
    expect([size("one"), size("rest")]).toEqual([50, 50]);

    press("ArrowRight", handles()[0]);
    expect([size("one"), size("rest")]).toEqual([51, 49]);
    expect([size("two"), size("three")]).toEqual([26, 74]);
  });
});

describe("Resizable drag", () => {
  function Dragged(props: {
    orientation?: "horizontal" | "vertical";
    dir?: "rtl";
    onLayout?: (sizes: number[]) => void;
    onLayoutChanged?: (layout: Record<string, number>) => void;
    onDragging?: (dragging: boolean) => void;
  }) {
    return (
      <ResizablePanelGroup
        orientation={props.orientation}
        dir={props.dir}
        onLayout={props.onLayout}
        onLayoutChanged={props.onLayoutChanged}
      >
        <ResizablePanel id="a" defaultSize={30}>
          a
        </ResizablePanel>
        <ResizableHandle onDragging={props.onDragging} />
        <ResizablePanel id="b" defaultSize={70} minSize={40}>
          b
        </ResizablePanel>
      </ResizablePanelGroup>
    );
  }

  test("the pointer moves the divider by its share of the group", () => {
    const dragging: boolean[] = [];
    const settled: Record<string, number>[] = [];
    render(() => (
      <Dragged
        onDragging={(now) => dragging.push(now)}
        onLayoutChanged={(layout) => settled.push(layout)}
      />
    ));
    measured(groups()[0] as HTMLElement, 1000, 400);
    expect(handle().getAttribute("data-separator")).toBe("inactive");

    user.pointerDown(handle(), { clientX: 300, clientY: 10 });
    flush();
    expect(handle().getAttribute("data-separator")).toBe("active");
    expect(handle().getAttribute("data-resize-handle-state")).toBe("drag");
    expect(dragging).toEqual([true]);

    user.pointerMove(handle(), { clientX: 400, clientY: 300 });
    flush();
    expect(layoutNow()).toEqual([40, 60]);
    expect(settled).toEqual([]);

    user.pointerUp(handle(), { clientX: 400, clientY: 300 });
    flush();
    expect(handle().getAttribute("data-separator")).toBe("inactive");
    expect(dragging).toEqual([true, false]);
    expect(settled).toEqual([{ a: 40, b: 60 }]);

    // Released: the pointer moving on moves nothing.
    user.pointerMove(handle(), { clientX: 500, clientY: 300 });
    flush();
    expect(layoutNow()).toEqual([40, 60]);
  });

  test("a drag past a limit comes back with the pointer, not from where it stuck", () => {
    render(() => <Dragged />);
    measured(groups()[0] as HTMLElement, 1000, 400);
    user.pointerDown(handle(), { clientX: 300 });
    user.pointerMove(handle(), { clientX: 900 });
    flush();
    expect(layoutNow()).toEqual([60, 40]);
    user.pointerMove(handle(), { clientX: 350 });
    flush();
    expect(layoutNow()).toEqual([35, 65]);
    user.pointerUp(handle(), { clientX: 350 });
  });

  test("a vertical group reads the pointer's other axis", () => {
    render(() => <Dragged orientation="vertical" />);
    measured(groups()[0] as HTMLElement, 1000, 400);
    user.pointerDown(handle(), { clientX: 0, clientY: 120 });
    user.pointerMove(handle(), { clientX: 500, clientY: 160 });
    flush();
    expect(layoutNow()).toEqual([40, 60]);
    user.pointerUp(handle(), { clientX: 500, clientY: 160 });
  });

  test("right to left, dragging right shrinks the first panel", () => {
    render(() => <Dragged dir="rtl" />);
    measured(groups()[0] as HTMLElement, 1000, 400);
    user.pointerDown(handle(), { clientX: 700 });
    user.pointerMove(handle(), { clientX: 800 });
    flush();
    expect(layoutNow()).toEqual([20, 80]);
    user.pointerUp(handle(), { clientX: 800 });
  });

  test("hovering the handle is a state a style can read", () => {
    render(() => <Dragged />);
    user.hover(handle());
    flush();
    expect(handle().getAttribute("data-separator")).toBe("hover");
    user.unhover(handle());
    flush();
    expect(handle().getAttribute("data-separator")).toBe("inactive");
  });

  test("the handle does not scroll or select under a touch", () => {
    render(() => <Dragged />);
    const rules = rulesFor(handle().className);
    expect(rules).toContain("touch-action: none");
    expect(rules).toContain("cursor: col-resize");
    expect(rules).toContain('[aria-orientation="horizontal"]{cursor: row-resize');
    expect(rules).not.toContain("left:");
  });
});

describe("Resizable collapsing", () => {
  function Collapsing(props: {
    panelRef?: (handle: ResizablePanelHandle | null) => void;
    groupRef?: (handle: ResizableGroupHandle | null) => void;
    onCollapse?: () => void;
    onExpand?: () => void;
    onResize?: (size: ResizablePanelSize, id: string) => void;
    autoSaveId?: string;
    storage?: ResizableStorage;
  }) {
    return (
      <ResizablePanelGroup
        groupRef={props.groupRef}
        autoSaveId={props.autoSaveId}
        storage={props.storage}
      >
        <ResizablePanel
          id="nav"
          defaultSize={30}
          minSize={20}
          collapsible
          collapsedSize={4}
          panelRef={props.panelRef}
          onCollapse={props.onCollapse}
          onExpand={props.onExpand}
          onResize={props.onResize}
        >
          nav
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel id="main" defaultSize={70}>
          main
        </ResizablePanel>
      </ResizablePanelGroup>
    );
  }

  test("Enter collapses the panel the handle controls, and Enter again restores it", () => {
    const seen: string[] = [];
    render(() => (
      <Collapsing onCollapse={() => seen.push("collapse")} onExpand={() => seen.push("expand")} />
    ));
    const nav = panels()[0] as HTMLElement;
    expect(nav.getAttribute("data-panel-collapsible")).toBe("true");
    expect(nav.hasAttribute("data-collapsed")).toBe(false);

    press("ArrowRight");
    press("Enter");
    expect(layoutNow()).toEqual([4, 96]);
    expect(nav.hasAttribute("data-collapsed")).toBe(true);
    expect(handle().getAttribute("aria-valuenow")).toBe("4");
    expect(handle().getAttribute("aria-valuemin")).toBe("4");

    press("Enter");
    expect(layoutNow()).toEqual([31, 69]);
    expect(nav.hasAttribute("data-collapsed")).toBe(false);
    expect(seen).toEqual(["collapse", "expand"]);
  });

  test("an arrow at the minimum collapses, and an arrow out of collapse expands", () => {
    render(() => <Collapsing />);
    press("Home");
    expect(layoutNow()).toEqual([4, 96]);
    press("ArrowRight");
    expect(layoutNow()).toEqual([20, 80]);
    press("ArrowLeft");
    expect(layoutNow()).toEqual([4, 96]);
  });

  test("a drag snaps at the halfway point rather than resting between", () => {
    render(() => <Collapsing />);
    measured(groups()[0] as HTMLElement, 1000, 400);
    user.pointerDown(handle(), { clientX: 300 });
    user.pointerMove(handle(), { clientX: 150 });
    flush();
    expect(layoutNow()).toEqual([20, 80]);
    user.pointerMove(handle(), { clientX: 110 });
    flush();
    expect(layoutNow()).toEqual([4, 96]);
    user.pointerMove(handle(), { clientX: 130 });
    flush();
    expect(layoutNow()).toEqual([20, 80]);
    user.pointerUp(handle(), { clientX: 130 });
  });

  test("the panel's handle collapses, expands, resizes and reports", () => {
    let held: ResizablePanelHandle | null = null;
    const resized: [string, number][] = [];
    render(() => (
      <Collapsing
        panelRef={(next) => {
          held = next;
        }}
        onResize={(size, id) => resized.push([id, size.asPercentage])}
      />
    ));
    measured(groups()[0] as HTMLElement, 1000, 400);
    const nav = held as unknown as ResizablePanelHandle;
    expect(nav.getId()).toBe("nav");
    expect(nav.getSize()).toEqual({ asPercentage: 30, inPixels: 300 });
    expect(nav.isCollapsed()).toBe(false);
    expect(nav.isExpanded()).toBe(true);

    nav.collapse();
    flush();
    expect(layoutNow()).toEqual([4, 96]);
    expect(nav.isCollapsed()).toBe(true);

    nav.expand();
    flush();
    expect(layoutNow()).toEqual([30, 70]);

    nav.resize(45);
    flush();
    expect(layoutNow()).toEqual([45, 55]);
    nav.resize("250px");
    flush();
    expect(layoutNow()).toEqual([25, 75]);
    expect(resized).toEqual([
      ["nav", 4],
      ["nav", 30],
      ["nav", 45],
      ["nav", 25],
    ]);
  });

  test("the group's handle reads and sets the whole layout", () => {
    let held: ResizableGroupHandle | null = null;
    render(() => (
      <Collapsing
        groupRef={(next) => {
          held = next;
        }}
      />
    ));
    const group = held as unknown as ResizableGroupHandle;
    expect(group.getLayout()).toEqual({ nav: 30, main: 70 });
    group.setLayout({ nav: 40, main: 60 });
    flush();
    expect(layoutNow()).toEqual([40, 60]);
    group.setLayout([25, 75]);
    flush();
    expect(layoutNow()).toEqual([25, 75]);
  });

  test("autoSaveId brings the layout back the next time the group is built", () => {
    const storage = memory();
    const first = render(() => <Collapsing autoSaveId="shell" storage={storage} />);
    press("ArrowRight");
    press("ArrowRight");
    expect(layoutNow()).toEqual([32, 68]);
    first.unmount();

    render(() => <Collapsing autoSaveId="shell" storage={storage} />);
    expect(layoutNow()).toEqual([32, 68]);
  });

  test("a collapsed layout is remembered with where it expands back to", () => {
    const storage = memory();
    const first = render(() => <Collapsing autoSaveId="shell" storage={storage} />);
    press("ArrowRight");
    press("Enter");
    first.unmount();

    render(() => <Collapsing autoSaveId="shell" storage={storage} />);
    expect(layoutNow()).toEqual([4, 96]);
    press("Enter");
    expect(layoutNow()).toEqual([31, 69]);
  });
});
