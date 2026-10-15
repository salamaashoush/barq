import { describe, expect, test } from "bun:test";
import { createRoot, flush } from "@barqjs/core";

import {
  adjustLayoutByDelta,
  clampPanelSize,
  defaultLayout,
  type PanelConstraints,
  type PanelSize,
  parseSize,
  type SplitterPanelOptions,
  type SplitterState,
  type SplitterStateOptions,
  splitterState,
  type SplitterStorage,
  toPercentage,
  validateLayout,
} from "./splitter.ts";

const free: PanelConstraints = { minSize: 0, maxSize: 100, collapsedSize: 0, collapsible: false };
const panel = (over: Partial<PanelConstraints> = {}): PanelConstraints => ({ ...free, ...over });

describe("parseSize and toPercentage", () => {
  test("a bare number and a percent string are both percentages", () => {
    expect(parseSize(30)).toEqual({ value: 30, unit: "%" });
    expect(parseSize("30%")).toEqual({ value: 30, unit: "%" });
    expect(parseSize("12.5")).toEqual({ value: 12.5, unit: "%" });
    expect(parseSize(undefined)).toBeUndefined();
    expect(parseSize("wide")).toBeUndefined();
  });

  test("pixels are a share of the group, once the group has a size", () => {
    expect(toPercentage("200px", { groupPixels: 800 })).toBe(25);
    // Unmeasured, a pixel size says nothing yet rather than something wrong.
    expect(toPercentage("200px", { groupPixels: 0 })).toBeUndefined();
  });

  test("font and viewport units go through pixels", () => {
    expect(toPercentage("10rem", { groupPixels: 640, rootFontSize: 16 })).toBe(25);
    expect(toPercentage("10em", { groupPixels: 400, fontSize: 20 })).toBe(50);
    expect(toPercentage("50vw", { groupPixels: 500, viewportWidth: 1000 })).toBe(100);
    expect(toPercentage("25vh", { groupPixels: 400, viewportHeight: 800 })).toBe(50);
  });
});

describe("clampPanelSize", () => {
  test("holds a size between its limits", () => {
    const limits = panel({ minSize: 20, maxSize: 60 });
    expect(clampPanelSize(limits, 10)).toBe(20);
    expect(clampPanelSize(limits, 90)).toBe(60);
    expect(clampPanelSize(limits, 40)).toBe(40);
  });

  test("a collapsible panel snaps to whichever of collapsed and minimum is nearer", () => {
    const limits = panel({ minSize: 20, collapsedSize: 4, collapsible: true });
    expect(clampPanelSize(limits, 13)).toBe(20);
    expect(clampPanelSize(limits, 11)).toBe(4);
    expect(clampPanelSize(limits, -50)).toBe(4);
  });
});

describe("defaultLayout and validateLayout", () => {
  test("panels naming no size share what the named ones leave", () => {
    expect(defaultLayout([panel({ defaultSize: 50 }), panel(), panel()])).toEqual([50, 25, 25]);
    expect(defaultLayout([panel(), panel()])).toEqual([50, 50]);
  });

  test("sizes that do not add up are scaled until they do", () => {
    expect(validateLayout([30, 30], [panel(), panel()])).toEqual([50, 50]);
  });

  test("a size outside its limits gives the difference to the others", () => {
    const layout = validateLayout([5, 95], [panel({ minSize: 20 }), panel()]);
    expect(layout).toEqual([20, 80]);
  });

  test("a default below the snapping point starts collapsed", () => {
    const layout = validateLayout(
      [0, 100],
      [panel({ minSize: 15, collapsible: true, collapsedSize: 0 }), panel()],
    );
    expect(layout).toEqual([0, 100]);
  });
});

describe("adjustLayoutByDelta", () => {
  const move = (
    delta: number,
    initialLayout: number[],
    constraints: PanelConstraints[],
    pivot: readonly [number, number] = [0, 1],
    trigger: "keyboard" | "pointer" | "imperative" = "pointer",
  ): number[] =>
    adjustLayoutByDelta({
      delta,
      initialLayout,
      prevLayout: initialLayout,
      constraints,
      pivot,
      trigger,
    });

  test("moves one panel into its neighbour and keeps the total", () => {
    expect(move(10, [30, 70], [panel(), panel()])).toEqual([40, 60]);
    expect(move(-10, [30, 70], [panel(), panel()])).toEqual([20, 80]);
  });

  test("stops where either side's limit is", () => {
    expect(move(80, [30, 70], [panel({ maxSize: 50 }), panel()])).toEqual([50, 50]);
    expect(move(80, [30, 70], [panel(), panel({ minSize: 40 })])).toEqual([60, 40]);
    expect(move(-80, [30, 70], [panel({ minSize: 10 }), panel()])).toEqual([10, 90]);
  });

  test("a move the neighbour cannot absorb is passed on to the panel after it", () => {
    const limits = [panel(), panel({ minSize: 20 }), panel({ minSize: 10 })];
    expect(move(30, [40, 30, 30], limits)).toEqual([70, 20, 10]);
    // And no further than every panel on that side can give.
    expect(move(90, [40, 30, 30], limits)).toEqual([70, 20, 10]);
  });

  test("dragging through the halfway point collapses, and back out expands", () => {
    const limits = [panel({ minSize: 20, collapsible: true, collapsedSize: 0 }), panel()];
    expect(move(-8, [25, 75], limits)).toEqual([20, 80]);
    expect(move(-16, [25, 75], limits)).toEqual([0, 100]);
    expect(move(9, [0, 100], limits)).toEqual([0, 100]);
    expect(move(11, [0, 100], limits)).toEqual([20, 80]);
  });

  test("one key press at the minimum collapses, and one press out of collapse expands", () => {
    const limits = [panel({ minSize: 20, collapsible: true, collapsedSize: 0 }), panel()];
    expect(move(-1, [20, 80], limits, [0, 1], "keyboard")).toEqual([0, 100]);
    expect(move(1, [0, 100], limits, [0, 1], "keyboard")).toEqual([20, 80]);
  });

  test("the panel after the handle collapses the same way", () => {
    const limits = [panel(), panel({ minSize: 20, collapsible: true, collapsedSize: 5 })];
    expect(move(1, [80, 20], limits, [0, 1], "keyboard")).toEqual([95, 5]);
    expect(move(-1, [95, 5], limits, [0, 1], "keyboard")).toEqual([80, 20]);
  });

  test("a move that changes nothing returns the layout it was given", () => {
    const layout = [10, 90];
    const next = adjustLayoutByDelta({
      delta: -5,
      initialLayout: layout,
      prevLayout: layout,
      constraints: [panel({ minSize: 10 }), panel()],
      pivot: [0, 1],
      trigger: "pointer",
    });
    expect(next).toBe(layout);
  });
});

function memoryStorage(): SplitterStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (name) => data.get(name) ?? null,
    setItem: (name, value) => void data.set(name, value),
  };
}

interface Events {
  resized: [string, number, number | undefined][];
  collapsed: string[];
  expanded: string[];
}

function build(
  panels: Partial<SplitterPanelOptions>[],
  options: Partial<SplitterStateOptions> = {},
): { state: SplitterState; events: Events } {
  const events: Events = { resized: [], collapsed: [], expanded: [] };
  // Under a root, as a component would: the direction is read from the scope.
  const state = createRoot(() => {
    const made = splitterState({ ref: () => null, ...options });
    panels.forEach((each, index) => {
      const id = each.id ?? `p${String(index)}`;
      made.registerPanel({
        ref: () => null,
        onResize: (size: PanelSize, which: string, previous: PanelSize | undefined) =>
          events.resized.push([which, size.asPercentage, previous?.asPercentage]),
        onCollapse: () => events.collapsed.push(id),
        onExpand: () => events.expanded.push(id),
        ...each,
        id,
      });
      if (index < panels.length - 1) made.registerHandle(`h${String(index)}`, () => null);
    });
    return made;
  });
  flush();
  return { state, events };
}

describe("splitterState", () => {
  test("lays the panels out as they register", () => {
    const { state } = build([{ defaultSize: 30 }, {}, {}]);
    expect(state.panelIds()).toEqual(["p0", "p1", "p2"]);
    expect(state.layout()).toEqual([30, 35, 35]);
    expect(state.getLayout()).toEqual({ p0: 30, p1: 35, p2: 35 });
  });

  test("a handle divides the panels on either side of it", () => {
    const { state } = build([{}, {}, {}]);
    expect(state.panelsAround("h0")).toEqual(["p0", "p1"]);
    expect(state.panelsAround("h1")).toEqual(["p1", "p2"]);
    expect(state.panelsAround("nope")).toBeNull();
  });

  test("a keyboard step moves the handle and tells whoever is listening", () => {
    const seen: number[][] = [];
    const settled: number[][] = [];
    const { state, events } = build([{ defaultSize: 30 }, { defaultSize: 70 }], {
      onLayoutChange: (_, sizes) => seen.push(sizes),
      onLayoutChanged: (_, sizes) => settled.push(sizes),
    });
    state.resizeBy("h0", 5, "keyboard");
    flush();
    expect(state.layout()).toEqual([35, 65]);
    expect(seen).toEqual([[35, 65]]);
    expect(settled).toEqual([[35, 65]]);
    expect(events.resized).toEqual([
      ["p0", 35, 30],
      ["p1", 65, 70],
    ]);
  });

  test("a drag is measured from where it started, so it cannot drift", () => {
    const settled: number[][] = [];
    const { state } = build([{ defaultSize: 50 }, { defaultSize: 50, minSize: 30 }], {
      onLayoutChanged: (_, sizes) => settled.push(sizes),
    });
    state.startDrag("h0");
    state.dragBy("h0", 40);
    flush();
    expect(state.layout()).toEqual([70, 30]);
    // Coming back by the same distance lands where it began, although the
    // panel stopped twenty short on the way out.
    state.dragBy("h0", 0);
    flush();
    expect(state.layout()).toEqual([50, 50]);
    expect(state.draggingHandle()).toBe("h0");
    expect(settled).toEqual([]);

    state.dragBy("h0", 10);
    state.endDrag("h0");
    flush();
    expect(state.draggingHandle()).toBeNull();
    expect(settled).toEqual([[60, 40]]);
  });

  test("right to left turns a horizontal move round, and never a vertical one", () => {
    const rtl = build([{ defaultSize: 50 }, { defaultSize: 50 }], { direction: "rtl" });
    rtl.state.resizeBy("h0", 5, "keyboard");
    flush();
    expect(rtl.state.layout()).toEqual([45, 55]);

    const vertical = build([{ defaultSize: 50 }, { defaultSize: 50 }], {
      direction: "rtl",
      orientation: "vertical",
    });
    vertical.state.resizeBy("h0", 5, "keyboard");
    flush();
    expect(vertical.state.layout()).toEqual([55, 45]);
  });

  test("collapse and expand go to the collapsed size and back to where it was", () => {
    const { state, events } = build([
      { defaultSize: 35, minSize: 20, collapsible: true, collapsedSize: 5 },
      { defaultSize: 65 },
    ]);
    expect(state.isCollapsed("p0")).toBe(false);
    state.collapse("p0");
    flush();
    expect(state.layout()).toEqual([5, 95]);
    expect(state.isCollapsed("p0")).toBe(true);
    expect(events.collapsed).toEqual(["p0"]);

    state.expand("p0");
    flush();
    expect(state.layout()).toEqual([35, 65]);
    expect(events.expanded).toEqual(["p0"]);
  });

  test("the last panel collapses toward the panel before it", () => {
    const { state } = build([
      { defaultSize: 70 },
      { defaultSize: 30, minSize: 20, collapsible: true },
    ]);
    state.collapse("p1");
    flush();
    expect(state.layout()).toEqual([100, 0]);
    state.expand("p1", 25);
    flush();
    expect(state.layout()).toEqual([70, 30]);
  });

  test("a panel that is not collapsible ignores collapse", () => {
    const { state } = build([{ defaultSize: 40 }, { defaultSize: 60 }]);
    state.collapse("p0");
    flush();
    expect(state.layout()).toEqual([40, 60]);
  });

  test("the handle's Enter collapses the panel it controls and restores it", () => {
    const { state } = build([
      { defaultSize: 30, minSize: 20, collapsible: true },
      { defaultSize: 70 },
    ]);
    state.toggleCollapse("h0");
    flush();
    expect(state.layout()).toEqual([0, 100]);
    state.toggleCollapse("h0");
    flush();
    expect(state.layout()).toEqual([30, 70]);
  });

  test("Enter falls to the panel after the handle when only that one collapses", () => {
    const { state } = build([
      { defaultSize: 70 },
      { defaultSize: 30, minSize: 20, collapsible: true },
    ]);
    state.toggleCollapse("h0");
    flush();
    expect(state.layout()).toEqual([100, 0]);
  });

  test("resize sets one panel and clamps it", () => {
    const { state } = build([{ defaultSize: 30, maxSize: 60 }, { defaultSize: 70 }]);
    state.resize("p0", 45);
    flush();
    expect(state.getSize("p0").asPercentage).toBe(45);
    state.resize("p0", "90%");
    flush();
    expect(state.layout()).toEqual([60, 40]);
  });

  test("setLayout takes a list or a record, and validates it", () => {
    const { state } = build([{ minSize: 20 }, {}]);
    state.setLayout([10, 90]);
    flush();
    expect(state.layout()).toEqual([20, 80]);
    state.setLayout({ p0: 60, p1: 40 });
    flush();
    expect(state.layout()).toEqual([60, 40]);
  });

  test("a disabled group does not move from its handles", () => {
    const { state } = build([{ defaultSize: 30 }, { defaultSize: 70 }], { isDisabled: true });
    state.resizeBy("h0", 5, "keyboard");
    state.startDrag("h0");
    state.dragBy("h0", 20);
    flush();
    expect(state.layout()).toEqual([30, 70]);
    expect(state.draggingHandle()).toBeNull();
  });

  test("a panel that leaves gives its share back", () => {
    let remove = (): void => {};
    const state = createRoot(() => {
      const made = splitterState({ ref: () => null });
      made.registerPanel({ id: "a", ref: () => null, defaultSize: 20 });
      remove = made.registerPanel({ id: "b", ref: () => null, defaultSize: 30 });
      made.registerPanel({ id: "c", ref: () => null });
      return made;
    });
    flush();
    expect(state.layout()).toEqual([20, 30, 50]);
    remove();
    flush();
    expect(state.panelIds()).toEqual(["a", "c"]);
    expect(state.layout()).toEqual([20, 80]);
  });

  test("a default layout by id wins over the panels' own defaults", () => {
    const { state } = build([{ id: "nav", defaultSize: 50 }, { id: "main" }], {
      defaultLayout: { nav: 25, main: 75 },
    });
    expect(state.layout()).toEqual([25, 75]);
  });

  test("autoSaveId remembers the layout and the next group starts from it", () => {
    const storage = memoryStorage();
    const first = build([{ id: "nav", defaultSize: 30 }, { id: "main" }], {
      autoSaveId: "shell",
      storage,
    });
    first.state.resizeBy("h0", 12, "keyboard");
    flush();
    expect(storage.data.size).toBe(1);

    const second = build([{ id: "nav", defaultSize: 30 }, { id: "main" }], {
      autoSaveId: "shell",
      storage,
    });
    expect(second.state.layout()).toEqual([42, 58]);
  });

  test("a saved layout is kept per set of panels", () => {
    const storage = memoryStorage();
    const two = build([{ id: "nav", defaultSize: 30 }, { id: "main" }], {
      autoSaveId: "shell",
      storage,
    });
    two.state.resizeBy("h0", 10, "keyboard");
    flush();

    const three = build([{ id: "nav", defaultSize: 20 }, { id: "main" }, { id: "aside" }], {
      autoSaveId: "shell",
      storage,
    });
    expect(three.state.layout()).toEqual([20, 40, 40]);
  });

  test("a drag is saved once, when it ends", () => {
    const storage = memoryStorage();
    let writes = 0;
    const counting: SplitterStorage = {
      getItem: storage.getItem,
      setItem(name, value) {
        writes++;
        storage.setItem(name, value);
      },
    };
    const { state } = build([{ id: "nav" }, { id: "main" }], {
      autoSaveId: "shell",
      storage: counting,
    });
    state.startDrag("h0");
    state.dragBy("h0", 5);
    state.dragBy("h0", 10);
    flush();
    expect(writes).toBe(0);
    state.endDrag("h0");
    flush();
    expect(writes).toBe(1);
  });

  test("storage that throws or holds rubbish is ignored", () => {
    const broken: SplitterStorage = {
      getItem: () => "{not json",
      setItem() {
        throw new Error("quota");
      },
    };
    const { state } = build([{ id: "nav", defaultSize: 30 }, { id: "main" }], {
      autoSaveId: "shell",
      storage: broken,
    });
    expect(state.layout()).toEqual([30, 70]);
    state.resizeBy("h0", 5, "keyboard");
    flush();
    expect(state.layout()).toEqual([35, 65]);
  });

  test("the size a handle reports is the panel before it, with that panel's limits", () => {
    const { state } = build([{ defaultSize: 30, minSize: 10, maxSize: 80 }, { defaultSize: 70 }]);
    expect(state.constraintsOf("p0")).toEqual({
      minSize: 10,
      maxSize: 80,
      collapsedSize: 0,
      collapsible: false,
      defaultSize: 30,
    });
    expect(state.sizeOf("p0")).toBe(30);
  });
});
