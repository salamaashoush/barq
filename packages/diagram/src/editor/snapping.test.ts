/**
 * Snapping to other elements, Excalidraw's `snapping.ts`: with object
 * snapping on (or Ctrl held with it off), a drag, a resize and a new element
 * land on the corners, centres and equal gaps of the elements around them,
 * and the lines that show it are in `snapLines` until the pointer goes up.
 */

import { afterEach, describe, expect, test } from "bun:test";

import { API, Keyboard, UI, h, mouse, renderEditor, unmountEditors } from "./test-editor.ts";

afterEach(unmountEditors);

const setup = (objectsSnapModeEnabled = true) => {
  renderEditor();
  API.setAppState({ objectsSnapModeEnabled });
};

describe("dragging", () => {
  test("lands on another element's edge, and shows the line", () => {
    setup();
    const target = API.createElement({ x: 0, y: 0, width: 100, height: 100 });
    const moved = API.createElement({ x: 200, y: 200, width: 50, height: 50 });
    API.loadElements([target, moved]);
    API.setSelectedElements([moved]);

    // the left edge 3px right of the target's right edge
    mouse.downAt(225, 225);
    mouse.moveTo(128, 225);
    expect(h().state.snapLines.length).toBeGreaterThan(0);
    expect(API.getElement(moved).x).toBe(100);
    mouse.upAt(128, 225);

    expect(API.getElement(moved).x).toBe(100);
    expect(h().state.snapLines).toEqual([]);
  });

  test("does not snap with snapping off, and does with Ctrl held", () => {
    setup(false);
    const target = API.createElement({ x: 0, y: 0, width: 100, height: 100 });
    const moved = API.createElement({ x: 200, y: 200, width: 50, height: 50 });
    API.loadElements([target, moved]);
    API.setSelectedElements([moved]);

    mouse.downAt(225, 225);
    mouse.moveTo(128, 225);
    expect(API.getElement(moved).x).toBe(103);
    expect(h().state.snapLines).toEqual([]);
    Keyboard.withModifierKeys({ ctrl: true }, () => mouse.moveTo(128, 226));
    expect(API.getElement(moved).x).toBe(100);
    mouse.upAt();
  });

  test("Ctrl turns snapping off when it is on", () => {
    setup();
    const target = API.createElement({ x: 0, y: 0, width: 100, height: 100 });
    const moved = API.createElement({ x: 200, y: 200, width: 50, height: 50 });
    API.loadElements([target, moved]);
    API.setSelectedElements([moved]);

    mouse.downAt(225, 225);
    Keyboard.withModifierKeys({ ctrl: true }, () => {
      mouse.moveTo(128, 225);
      mouse.upAt(128, 225);
    });
    expect(API.getElement(moved).x).toBe(103);
  });

  test("lands in the middle of a gap between two elements", () => {
    setup();
    const left = API.createElement({ x: 0, y: 0, width: 100, height: 100 });
    const right = API.createElement({ x: 300, y: 0, width: 100, height: 100 });
    const moved = API.createElement({ x: 140, y: 300, width: 100, height: 100 });
    API.loadElements([left, right, moved]);
    API.setSelectedElements([moved]);

    // centred, the moved element's x is 150; drag to 146, 0 from the top
    mouse.downAt(190, 350);
    mouse.moveTo(196, 53);
    expect(API.getElement(moved).x).toBe(150);
    expect(h().state.snapLines.some((line) => line.type === "gap")).toBe(true);
    mouse.upAt();
  });
});

describe("resizing", () => {
  test("the dragged side lands on another element's edge", () => {
    setup();
    const target = API.createElement({ x: 200, y: 0, width: 100, height: 100 });
    const resized = API.createElement({ x: 0, y: 0, width: 100, height: 100 });
    API.loadElements([target, resized]);

    // the right side 4px short of the target's left edge
    UI.resize(resized, "e", [96, 0]);
    expect(API.getElement(resized).width).toBe(200);
  });
});

describe("drawing", () => {
  test("a new element's corner lands on another's", () => {
    setup();
    const target = API.createElement({ x: 0, y: 0, width: 100, height: 100 });
    API.loadElements([target]);

    UI.clickTool("rectangle");
    mouse.downAt(150, 150);
    mouse.moveTo(104, 196);
    // the lines are of the element as the last move left it
    mouse.moveTo(103, 197);
    const drawn = h().state.newElement;
    expect(drawn?.x).toBe(100);
    expect(h().state.snapLines.length).toBeGreaterThan(0);
    mouse.upAt();
    expect(h().state.snapLines).toEqual([]);
  });

  test("hovering with a shape tool shows where the shape would start", () => {
    setup();
    API.loadElements([API.createElement({ x: 0, y: 0, width: 100, height: 100 })]);
    UI.clickTool("rectangle");
    mouse.moveTo(103, 300);
    expect(h().state.snapLines.length).toBeGreaterThan(0);
    expect(h().state.originSnapOffset).toEqual({ x: -3, y: 0 });

    UI.clickTool("selection");
    expect(h().state.snapLines).toEqual([]);
    expect(h().state.originSnapOffset).toBeNull();
  });
});

describe("the mode", () => {
  test("Alt+S turns object snapping on, and the grid off", () => {
    renderEditor({ gridModeEnabled: true });
    Keyboard.withModifierKeys({ alt: true }, () => Keyboard.keyPress("s"));
    expect(h().state.objectsSnapModeEnabled).toBe(true);
    expect(h().state.gridModeEnabled).toBe(false);
    Keyboard.withModifierKeys({ alt: true }, () => Keyboard.keyPress("s"));
    expect(h().state.objectsSnapModeEnabled).toBe(false);
  });
});
