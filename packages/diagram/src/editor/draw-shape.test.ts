/**
 * The autoshape tool, as Excalidraw's drawShape tests: a sketched stroke is
 * recognised as a shape when the pointer goes up, and an arrow sketched
 * between two shapes binds to both.
 */

import { afterEach, describe, expect, test } from "bun:test";

import type { ExcalidrawArrowElement } from "@excalidraw/element/types";

import { API, Keyboard, h, mouse, renderEditor, unmountEditors } from "./test-editor.ts";

afterEach(unmountEditors);

function elements() {
  return h().scene.getNonDeletedElements();
}

/** Moves the pressed pointer through `points`, a few steps between each. */
function strokeThrough(points: readonly (readonly [number, number])[]): void {
  const [first, ...rest] = points;
  if (!first) return;
  mouse.downAt(first[0], first[1]);
  let [px, py] = first;
  for (const [x, y] of rest) {
    for (let step = 1; step <= 8; step++) {
      mouse.moveTo(px + ((x - px) * step) / 8, py + ((y - py) * step) / 8);
    }
    [px, py] = [x, y];
  }
  mouse.upAt(px, py);
}

function segment(
  from: readonly [number, number],
  to: readonly [number, number],
  steps: number,
): [number, number][] {
  return Array.from({ length: steps + 1 }, (_, index) => [
    from[0] + ((to[0] - from[0]) * index) / steps,
    from[1] + ((to[1] - from[1]) * index) / steps,
  ]);
}

/** A V-headed arrow: the shaft, then both arms of the head drawn back from the tip. */
function arrowPath(x1: number, y1: number, x2: number, y2: number): [number, number][] {
  const tip: [number, number] = [x2, y2];
  const length = Math.hypot(x2 - x1, y2 - y1);
  const ux = (x2 - x1) / length;
  const uy = (y2 - y1) / length;
  const head = length * 0.3;
  const angle = Math.PI / 6;
  function arm(sign: number): [number, number] {
    return [
      x2 - head * (ux * Math.cos(angle) - sign * uy * Math.sin(angle)),
      y2 - head * (uy * Math.cos(angle) + sign * ux * Math.sin(angle)),
    ];
  }
  return [
    ...segment([x1, y1], tip, 20),
    ...segment(tip, arm(1), 8),
    ...segment(arm(1), tip, 8),
    ...segment(tip, arm(-1), 8),
  ];
}

function circle(cx: number, cy: number, r: number): [number, number][] {
  return Array.from({ length: 41 }, (_, index) => {
    const angle = (index / 40) * Math.PI * 2;
    return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
  });
}

describe("autoshape", () => {
  test("Shift+X picks it, and a sketched box becomes a rectangle", () => {
    renderEditor();
    Keyboard.withModifierKeys({ shift: true }, () => Keyboard.keyPress("X"));
    expect(h().state.activeTool.type).toBe("autoshape");
    strokeThrough([
      [100, 100],
      [300, 100],
      [300, 250],
      [100, 250],
      [100, 100],
    ]);
    expect(elements()).toHaveLength(1);
    const [rectangle] = elements();
    expect(rectangle?.type).toBe("rectangle");
    expect(rectangle?.x).toBeCloseTo(100, -1);
    expect(rectangle?.width).toBeCloseTo(200, -1);
    expect(rectangle?.height).toBeCloseTo(150, -1);
    // the tool stays, and selects nothing
    expect(h().state.activeTool.type).toBe("autoshape");
    expect(h().state.selectedElementIds).toEqual({});
    expect(h().state.newElement).toBeNull();
    expect(API.getUndoStack().length).toBe(1);
  });

  test("a sketched circle becomes an ellipse", () => {
    renderEditor();
    h().api.setActiveTool({ type: "autoshape" });
    strokeThrough(circle(400, 300, 120));
    const [ellipse] = elements();
    expect(ellipse?.type).toBe("ellipse");
    expect(ellipse?.width).toBeGreaterThan(180);
  });

  test("an arrow sketched from one shape to another binds to both", () => {
    renderEditor();
    const left = API.createElement({ type: "rectangle", id: "left", x: 50, y: 50, width: 100 });
    const right = API.createElement({ type: "rectangle", id: "right", x: 400, y: 300, width: 100 });
    API.setElements([left, right]);
    h().api.setActiveTool({ type: "autoshape" });
    strokeThrough(arrowPath(160, 160, 390, 290));
    const arrow = elements().find((element) => element.type === "arrow") as
      | ExcalidrawArrowElement
      | undefined;
    expect(arrow).toBeDefined();
    expect(arrow?.startBinding?.elementId).toBe("left");
    expect(arrow?.endBinding?.elementId).toBe("right");
  });

  test("a line from a shape into blank canvas becomes an arrow; one in the open stays a line", () => {
    renderEditor();
    const box = API.createElement({ type: "rectangle", id: "box", x: 50, y: 100, width: 150 });
    API.setElements([box]);
    h().api.setActiveTool({ type: "autoshape" });
    strokeThrough([
      [150, 175],
      [600, 180],
    ]);
    strokeThrough([
      [300, 500],
      [700, 510],
    ]);
    const types = elements()
      .map((element) => element.type)
      .toSorted();
    expect(types).toEqual(["arrow", "line", "rectangle"]);
  });

  test("switching tools mid-sketch commits it", () => {
    renderEditor();
    h().api.setActiveTool({ type: "autoshape" });
    mouse.downAt(100, 100);
    for (const [x, y] of [
      [200, 100],
      [300, 100],
      [300, 200],
      [200, 200],
      [100, 200],
      [100, 100],
    ] as const) {
      mouse.moveTo(x, y);
    }
    h().api.setActiveTool({ type: "selection" });
    expect(elements()).toHaveLength(1);
    expect(h().drawShape.hasPendingGesture()).toBe(false);
  });
});
