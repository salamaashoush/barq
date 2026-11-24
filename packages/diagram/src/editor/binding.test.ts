/**
 * Arrows binding to shapes, through `@excalidraw/element`'s binding: drawn
 * between two shapes, an arrow binds both ends, follows the shapes as they
 * move, and lets go of a shape that is deleted.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { KEYS } from "@excalidraw/common";

import type { ExcalidrawArrowElement } from "@excalidraw/element/types";

import { API, Keyboard, h, mouse, renderEditor, unmountEditors } from "./test-editor.ts";

afterEach(unmountEditors);

const setup = () => {
  renderEditor();
  API.loadElements([
    API.createElement({ id: "A", x: 0, y: 0, width: 100, height: 100 }),
    API.createElement({ id: "B", x: 300, y: 0, width: 100, height: 100 }),
  ]);
};

const drawArrow = (from: [number, number], to: [number, number]) => {
  Keyboard.keyPress("a");
  mouse.downAt(...from);
  mouse.moveTo((from[0] + to[0]) / 2, (from[1] + to[1]) / 2);
  mouse.moveTo(...to);
  mouse.upAt(...to);
  const elements = h().scene.getNonDeletedElements();
  return elements[elements.length - 1] as ExcalidrawArrowElement;
};

const arrow = (id: string) => h().scene.getElement(id) as ExcalidrawArrowElement;

describe("binding", () => {
  test("an arrow drawn from one shape to another binds both ends", () => {
    setup();
    const drawn = drawArrow([50, 50], [350, 50]);
    const bound = arrow(drawn.id);
    expect(bound.startBinding?.elementId).toBe("A");
    expect(bound.endBinding?.elementId).toBe("B");
    expect(h().scene.getElement("A")?.boundElements).toEqual([{ id: drawn.id, type: "arrow" }]);
    expect(h().scene.getElement("B")?.boundElements).toEqual([{ id: drawn.id, type: "arrow" }]);
  });

  test("an arrow ending on empty canvas binds only its start", () => {
    setup();
    const drawn = drawArrow([50, 50], [200, 300]);
    expect(arrow(drawn.id).startBinding?.elementId).toBe("A");
    expect(arrow(drawn.id).endBinding).toBeNull();
  });

  test("the arrow follows a shape that moves", () => {
    setup();
    const drawn = drawArrow([50, 50], [350, 50]);
    const before = arrow(drawn.id);
    const endBefore = before.x + before.points[1]![0];

    Keyboard.keyPress(KEYS.ESCAPE);
    mouse.downAt(400, 50);
    mouse.moveTo(450, 50);
    mouse.moveTo(500, 50);
    mouse.upAt(500, 50);
    expect(h().scene.getElement("B")?.x).toBe(400);

    const after = arrow(drawn.id);
    expect(after.endBinding?.elementId).toBe("B");
    expect(after.x + after.points[after.points.length - 1]![0]).toBeCloseTo(endBefore + 100, 0);
  });

  test("the arrow follows a shape moved by the arrow keys", () => {
    setup();
    const drawn = drawArrow([50, 50], [350, 50]);
    Keyboard.keyPress(KEYS.ESCAPE);
    mouse.clickAt(400, 50);
    expect(API.getSelectedElement().id).toBe("B");
    const endBefore = arrow(drawn.id).x + arrow(drawn.id).points[1]![0];
    Keyboard.withModifierKeys({ shift: true }, () => Keyboard.keyPress(KEYS.ARROW_RIGHT));
    const after = arrow(drawn.id);
    expect(after.x + after.points[1]![0]).toBeCloseTo(endBefore + 5, 0);
    expect(after.endBinding?.elementId).toBe("B");
  });

  test("deleting a shape unbinds the arrow from it", () => {
    setup();
    const drawn = drawArrow([50, 50], [350, 50]);
    Keyboard.keyPress(KEYS.ESCAPE);
    mouse.clickAt(400, 50);
    Keyboard.keyPress(KEYS.DELETE);
    expect(h().scene.getElement("B")?.isDeleted).toBe(true);
    expect(arrow(drawn.id).endBinding).toBeNull();
    expect(arrow(drawn.id).startBinding?.elementId).toBe("A");
  });

  test("binding is undone with the arrow", () => {
    setup();
    drawArrow([50, 50], [350, 50]);
    Keyboard.undo();
    expect(h().scene.getNonDeletedElements()).toHaveLength(2);
    expect(h().scene.getElement("A")?.boundElements ?? []).toEqual([]);
    expect(h().scene.getElement("B")?.boundElements ?? []).toEqual([]);
  });

  test("hovering a shape with the arrow tool suggests it", () => {
    setup();
    Keyboard.keyPress("a");
    mouse.moveTo(102, 50);
    expect(h().state.suggestedBinding?.element.id).toBe("A");
  });
});
