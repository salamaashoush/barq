/**
 * Moving, resizing and rotating: by dragging the selection and its handles,
 * with the modifiers Excalidraw gives them, and by the arrow keys.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { KEYS } from "@excalidraw/common";

import { API, Keyboard, UI, h, mouse, renderEditor, unmountEditors } from "./test-editor.ts";

afterEach(unmountEditors);

const filled = (id: string, x: number, y: number, width = 100, height = width) =>
  API.createElement({ id, x, y, width, height, backgroundColor: "#ffc9c9" });

const position = (id: string) => {
  const element = h().scene.getElement(id)!;
  return [element.x, element.y];
};

const box = (id: string) => {
  const element = h().scene.getElement(id)!;
  return [element.x, element.y, element.width, element.height];
};

describe("moving", () => {
  test("dragging an element moves it, and is one undo step", () => {
    renderEditor();
    API.loadElements([filled("A", 0, 0)]);
    mouse.downAt(50, 50);
    mouse.moveTo(70, 60);
    mouse.moveTo(90, 80);
    mouse.upAt(90, 80);
    expect(position("A")).toEqual([40, 30]);
    expect(h().state.selectedElementsAreBeingDragged).toBe(false);
    Keyboard.undo();
    expect(position("A")).toEqual([0, 0]);
    Keyboard.redo();
    expect(position("A")).toEqual([40, 30]);
  });

  test("shift keeps the drag on one axis", () => {
    renderEditor();
    API.loadElements([filled("A", 0, 0)]);
    mouse.downAt(50, 50);
    Keyboard.withModifierKeys({ shift: true }, () => {
      mouse.moveTo(110, 60);
      mouse.upAt(110, 60);
    });
    expect(position("A")).toEqual([60, 0]);
  });

  test("on the grid, a drag lands on it", () => {
    renderEditor({ gridModeEnabled: true });
    API.loadElements([filled("A", 0, 0)]);
    mouse.downAt(50, 50);
    mouse.moveTo(63, 57);
    mouse.upAt(63, 57);
    expect(position("A")).toEqual([20, 0]);
  });

  test("dragging a selection moves all of it", () => {
    renderEditor();
    API.loadElements([filled("A", 0, 0), filled("B", 200, 0)]);
    mouse.clickAt(50, 50);
    Keyboard.withModifierKeys({ shift: true }, () => mouse.clickAt(250, 50));
    mouse.downAt(250, 50);
    mouse.moveTo(260, 70);
    mouse.upAt(260, 70);
    expect(position("A")).toEqual([10, 20]);
    expect(position("B")).toEqual([210, 20]);
  });

  test("alt-drag duplicates and drags the copy", () => {
    renderEditor();
    API.loadElements([filled("A", 0, 0)]);
    mouse.clickAt(50, 50);
    Keyboard.withModifierKeys({ alt: true }, () => {
      mouse.downAt(50, 50);
      mouse.moveTo(100, 100);
      mouse.moveTo(150, 150);
      mouse.upAt(150, 150);
    });
    const elements = h().scene.getNonDeletedElements();
    expect(elements).toHaveLength(2);
    expect(position("A")).toEqual([0, 0]);
    const copy = elements.find((element) => element.id !== "A")!;
    expect([copy.x, copy.y]).toEqual([100, 100]);
    expect(API.getSelectedElement().id).toBe(copy.id);
  });

  test("a locked element does not move", () => {
    renderEditor();
    API.loadElements([filled("A", 0, 0)]);
    mouse.clickAt(50, 50);
    Keyboard.withModifierKeys({ ctrl: true, shift: true }, () => Keyboard.keyPress("l"));
    mouse.downAt(50, 50);
    mouse.moveTo(80, 80);
    mouse.upAt(80, 80);
    expect(position("A")).toEqual([0, 0]);
  });
});

describe("arrow keys", () => {
  test("move the selection a pixel, five with shift, each press an undo step", () => {
    renderEditor();
    API.loadElements([filled("A", 0, 0)]);
    mouse.clickAt(50, 50);
    Keyboard.keyPress(KEYS.ARROW_RIGHT);
    Keyboard.keyPress(KEYS.ARROW_DOWN);
    expect(position("A")).toEqual([1, 1]);
    Keyboard.withModifierKeys({ shift: true }, () => Keyboard.keyPress(KEYS.ARROW_LEFT));
    expect(position("A")).toEqual([-4, 1]);
    Keyboard.undo();
    expect(position("A")).toEqual([1, 1]);
    Keyboard.undo();
    expect(position("A")).toEqual([1, 0]);
  });

  test("move by a grid cell on the grid", () => {
    renderEditor({ gridModeEnabled: true });
    API.loadElements([filled("A", 0, 0)]);
    mouse.clickAt(50, 50);
    Keyboard.keyPress(KEYS.ARROW_RIGHT);
    expect(position("A")).toEqual([20, 0]);
  });

  test("pan the viewport with nothing selected", () => {
    renderEditor();
    Keyboard.keyPress(KEYS.ARROW_RIGHT);
    expect(h().state.scrollX).toBeCloseTo(-102.4);
    Keyboard.withModifierKeys({ shift: true }, () => Keyboard.keyPress(KEYS.ARROW_DOWN));
    expect(h().state.scrollY).toBeCloseTo(-768);
  });
});

describe("resizing", () => {
  test("a corner handle resizes from the opposite corner", () => {
    renderEditor();
    const rect = filled("A", 0, 0);
    API.loadElements([rect]);
    UI.resize(rect, "se", [50, 20]);
    expect(box("A")).toEqual([0, 0, 150, 120]);
    UI.resize(API.getElement(rect), "nw", [10, 10]);
    expect(box("A")).toEqual([10, 10, 140, 110]);
  });

  test("a side handle resizes one dimension", () => {
    renderEditor();
    const rect = filled("A", 0, 0);
    API.loadElements([rect]);
    UI.resize(rect, "e", [30, 40]);
    expect(box("A")).toEqual([0, 0, 130, 100]);
  });

  test("shift keeps the aspect ratio", () => {
    renderEditor();
    const rect = filled("A", 0, 0, 100, 50);
    API.loadElements([rect]);
    UI.resize(rect, "se", [100, 10], { shift: true });
    const [, , width, height] = box("A");
    expect(width! / height!).toBeCloseTo(2);
    expect(width).toBe(200);
  });

  test("alt resizes from the centre", () => {
    renderEditor();
    const rect = filled("A", 0, 0);
    API.loadElements([rect]);
    UI.resize(rect, "se", [10, 20], { alt: true });
    const [x, y, width, height] = box("A");
    expect(x).toBeCloseTo(-10);
    expect(y).toBeCloseTo(-20);
    expect(width).toBeCloseTo(120);
    expect(height).toBeCloseTo(140);
  });

  test("a selection of several resizes together", () => {
    renderEditor();
    const a = filled("A", 0, 0);
    const b = filled("B", 200, 0);
    API.loadElements([a, b]);
    UI.resize([a, b], "se", [300, 0], { shift: true });
    expect(box("A")).toEqual([0, 0, 200, 200]);
    expect(box("B")).toEqual([400, 0, 200, 200]);
  });

  test("a resize is one undo step", () => {
    renderEditor();
    const rect = filled("A", 0, 0);
    API.loadElements([rect]);
    UI.resize(rect, "se", [50, 20]);
    Keyboard.undo();
    expect(box("A")).toEqual([0, 0, 100, 100]);
  });
});

describe("rotating", () => {
  test("the rotation handle turns the element around its centre", () => {
    renderEditor();
    const rect = filled("A", 0, 0);
    API.loadElements([rect]);
    UI.rotate(rect, [80, 70]);
    const element = h().scene.getElement("A")!;
    expect(element.angle).toBeGreaterThan(0);
    expect([element.x, element.y, element.width]).toEqual([0, 0, 100]);
  });

  test("shift turns by steps of 15 degrees", () => {
    renderEditor();
    const rect = filled("A", 0, 0);
    API.loadElements([rect]);
    UI.rotate(rect, [80, 70], { shift: true });
    const { angle } = h().scene.getElement("A")!;
    const step = Math.PI / 12;
    expect(angle / step).toBeCloseTo(Math.round(angle / step));
    expect(angle).toBeGreaterThan(0);
  });
});
