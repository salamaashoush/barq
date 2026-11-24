/**
 * The line editor: a line's or arrow's points dragged, added at a midpoint
 * and deleted, opened by Enter or a double-click and closed by Escape.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { KEYS } from "@excalidraw/common";
import { pointFrom } from "@excalidraw/math";

import type { ExcalidrawLinearElement } from "@excalidraw/element/types";
import type { LocalPoint } from "@excalidraw/math";

import { API, Keyboard, h, mouse, renderEditor, unmountEditors } from "./test-editor.ts";

afterEach(unmountEditors);

/** Points as plain pairs, to compare with literals. */
function plain(points: readonly (readonly [number, number])[] | undefined) {
  return (points ?? []).map(([x, y]) => [x, y]);
}

function line() {
  return h().scene.getElement("L") as ExcalidrawLinearElement;
}

function setup() {
  renderEditor();
  API.loadElements([
    API.createElement({
      id: "L",
      type: "line",
      x: 100,
      y: 100,
      width: 200,
      height: 0,
      points: [
        pointFrom<LocalPoint>(0, 0),
        pointFrom<LocalPoint>(100, 0),
        pointFrom<LocalPoint>(200, 0),
      ],
    }),
  ]);
  mouse.clickAt(150, 100);
  expect(API.getSelectedElement().id).toBe("L");
}

describe("line editor", () => {
  test("Enter opens it on a line, Escape closes it and keeps the line selected", () => {
    setup();
    Keyboard.keyPress(KEYS.ENTER);
    expect(h().state.selectedLinearElement?.isEditing).toBe(true);
    Keyboard.keyPress(KEYS.ESCAPE);
    expect(h().state.selectedLinearElement?.isEditing).toBe(false);
    expect(API.getSelectedElement().id).toBe("L");
  });

  test("a double-click opens it", () => {
    setup();
    mouse.doubleClickAt(150, 100);
    expect(h().state.selectedLinearElement?.isEditing).toBe(true);
  });

  test("a point drags, and the drag is one undo step", () => {
    setup();
    Keyboard.keyPress(KEYS.ENTER);
    mouse.downAt(200, 100);
    mouse.moveTo(200, 150);
    mouse.upAt(200, 150);
    expect(plain(line().points)[1]).toEqual([100, 50]);
    Keyboard.undo();
    expect(plain(line().points)[1]).toEqual([100, 0]);
  });

  test("dragging a midpoint adds a point there", () => {
    setup();
    Keyboard.keyPress(KEYS.ENTER);
    mouse.moveTo(150, 100);
    mouse.downAt(150, 100);
    mouse.moveTo(150, 140);
    mouse.upAt(150, 140);
    expect(line().points).toHaveLength(4);
    expect(plain(line().points)[1]).toEqual([50, 40]);
  });

  test("Delete removes the selected point", () => {
    setup();
    Keyboard.keyPress(KEYS.ENTER);
    mouse.clickAt(200, 100);
    expect(h().state.selectedLinearElement?.selectedPointsIndices).toEqual([1]);
    Keyboard.keyPress(KEYS.DELETE);
    expect(line().points).toHaveLength(2);
    expect(h().scene.getElement("L")?.isDeleted).toBe(false);
  });

  test("a click away closes it", () => {
    setup();
    Keyboard.keyPress(KEYS.ENTER);
    mouse.clickAt(700, 600);
    expect(h().state.selectedLinearElement?.isEditing ?? false).toBe(false);
  });

  test("Ctrl+Enter opens it on an arrow", () => {
    renderEditor();
    API.loadElements([
      API.createElement({
        id: "A",
        type: "arrow",
        x: 100,
        y: 100,
        width: 100,
        height: 0,
        points: [pointFrom<LocalPoint>(0, 0), pointFrom<LocalPoint>(100, 0)],
      }),
    ]);
    mouse.clickAt(150, 100);
    Keyboard.withModifierKeys({ ctrl: true }, () => Keyboard.keyPress(KEYS.ENTER));
    expect(h().state.selectedLinearElement?.isEditing).toBe(true);
  });
});
