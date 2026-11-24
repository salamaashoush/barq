/**
 * Selecting: a click, shift-click, a box, groups and the group being edited,
 * alt-click cycling, and the keyboard's way through the elements.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { KEYS } from "@excalidraw/common";

import { API, Keyboard, UI, h, mouse, renderEditor, unmountEditors } from "./test-editor.ts";

afterEach(unmountEditors);

function selectedIds() {
  return API.getSelectedElements()
    .map((element) => element.id)
    .toSorted();
}

function threeRectangles() {
  const a = API.createElement({
    id: "A",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    backgroundColor: "#ffc9c9",
  });
  const b = API.createElement({
    id: "B",
    x: 200,
    y: 0,
    width: 100,
    height: 100,
    backgroundColor: "#ffc9c9",
  });
  const c = API.createElement({
    id: "C",
    x: 400,
    y: 0,
    width: 100,
    height: 100,
    backgroundColor: "#ffc9c9",
  });
  API.setElements([a, b, c]);
  return [a, b, c] as const;
}

describe("clicking", () => {
  test("a click selects, a click on empty canvas deselects", () => {
    renderEditor();
    threeRectangles();
    mouse.clickAt(50, 50);
    expect(selectedIds()).toEqual(["A"]);
    mouse.clickAt(250, 50);
    expect(selectedIds()).toEqual(["B"]);
    mouse.clickAt(700, 600);
    expect(selectedIds()).toEqual([]);
  });

  test("shift-click adds and removes", () => {
    renderEditor();
    threeRectangles();
    mouse.clickAt(50, 50);
    Keyboard.withModifierKeys({ shift: true }, () => {
      mouse.clickAt(250, 50);
      mouse.clickAt(450, 50);
    });
    expect(selectedIds()).toEqual(["A", "B", "C"]);
    Keyboard.withModifierKeys({ shift: true }, () => mouse.clickAt(250, 50));
    expect(selectedIds()).toEqual(["A", "C"]);
  });

  test("a transparent shape is hit on its outline only", () => {
    renderEditor();
    const outline = API.createElement({ id: "O", x: 0, y: 0, width: 100, height: 100 });
    API.setElements([outline]);
    mouse.clickAt(50, 50);
    expect(selectedIds()).toEqual([]);
    mouse.clickAt(0, 50);
    expect(selectedIds()).toEqual(["O"]);
  });

  test("a locked element is not selected by a click", () => {
    renderEditor();
    const locked = API.createElement({
      id: "L",
      x: 0,
      y: 0,
      backgroundColor: "#ffc9c9",
      locked: true,
    });
    API.setElements([locked]);
    mouse.clickAt(50, 50);
    expect(selectedIds()).toEqual([]);
    expect(h().state.activeLockedId).toBe("L");
  });

  test("alt-click cycles through the overlapping elements", () => {
    renderEditor();
    const bottom = API.createElement({ id: "bottom", x: 0, y: 0, backgroundColor: "#ffc9c9" });
    const top = API.createElement({ id: "top", x: 20, y: 20, backgroundColor: "#ffc9c9" });
    API.setElements([bottom, top]);
    mouse.clickAt(50, 50);
    expect(selectedIds()).toEqual(["top"]);
    Keyboard.withModifierKeys({ alt: true }, () => mouse.clickAt(50, 50));
    expect(selectedIds()).toEqual(["bottom"]);
    Keyboard.withModifierKeys({ alt: true }, () => mouse.clickAt(50, 50));
    expect(selectedIds()).toEqual(["top"]);
  });
});

describe("box selection", () => {
  test("shift adds a box, a box without shift replaces (Excalidraw's selection test)", () => {
    renderEditor();
    const rect1 = API.createElement({ x: 0, y: 0, width: 50, height: 50, backgroundColor: "red" });
    const rect2 = API.createElement({ x: 100, y: 0, width: 50, height: 50 });
    API.setElements([rect1, rect2]);

    mouse.downAt(175, -20);
    mouse.move(-1000, -1000);
    mouse.moveTo(85, 70);
    mouse.up();
    expect(selectedIds()).toEqual([rect2.id]);

    Keyboard.withModifierKeys({ shift: true }, () => {
      mouse.downAt(75, -20);
      mouse.move(-1000, -1000);
      mouse.moveTo(-15, 70);
      mouse.up();
    });
    expect(selectedIds()).toEqual([rect1.id, rect2.id].toSorted());
  });

  test("dragging on empty canvas selects what the box holds", () => {
    renderEditor();
    threeRectangles();
    // the first move starts the box, as in Excalidraw
    mouse.downAt(-10, -10);
    mouse.moveTo(-20, -20);
    mouse.moveTo(310, 110);
    expect(h().state.selectionElement).not.toBeNull();
    mouse.upAt(310, 110);
    expect(h().state.selectionElement).toBeNull();
    expect(selectedIds()).toEqual(["A", "B"]);
  });

  test("shift adds the box to the selection", () => {
    renderEditor();
    threeRectangles();
    mouse.clickAt(450, 50);
    Keyboard.withModifierKeys({ shift: true }, () => {
      mouse.downAt(-10, -10);
      mouse.moveTo(-20, -20);
      mouse.moveTo(110, 110);
      mouse.upAt(110, 110);
    });
    expect(selectedIds()).toEqual(["A", "C"]);
  });
});

describe("groups", () => {
  test("a click on a grouped element selects the group, a double-click enters it", () => {
    renderEditor();
    const [a, b] = threeRectangles();
    UI.group([a, b]);
    const groupId = API.getElement(a).groupIds[0]!;
    expect(h().state.selectedGroupIds).toEqual({ [groupId]: true });

    API.clearSelection();
    mouse.clickAt(50, 50);
    expect(selectedIds()).toEqual(["A", "B"]);
    expect(h().state.selectedGroupIds).toEqual({ [groupId]: true });

    mouse.doubleClickAt(250, 50);
    expect(h().state.editingGroupId).toBe(groupId);
    expect(selectedIds()).toEqual(["B"]);

    // within the edited group, a click selects one element
    mouse.clickAt(50, 50);
    expect(selectedIds()).toEqual(["A"]);
    expect(h().state.editingGroupId).toBe(groupId);

    // Escape steps out, selecting the group again
    Keyboard.keyPress(KEYS.ESCAPE);
    expect(h().state.editingGroupId).toBeNull();
    expect(selectedIds()).toEqual(["A", "B"]);
  });

  test("ctrl-click selects inside a group without entering it first", () => {
    renderEditor();
    const [a, b] = threeRectangles();
    UI.group([a, b]);
    API.clearSelection();
    Keyboard.withModifierKeys({ ctrl: true }, () => mouse.clickAt(250, 50));
    expect(selectedIds()).toEqual(["B"]);
  });

  test("a click outside the edited group leaves it", () => {
    renderEditor();
    const [a, b] = threeRectangles();
    UI.group([a, b]);
    mouse.doubleClickAt(50, 50);
    expect(h().state.editingGroupId).not.toBeNull();
    mouse.clickAt(450, 50);
    expect(h().state.editingGroupId).toBeNull();
    expect(selectedIds()).toEqual(["C"]);
  });
});

describe("keyboard", () => {
  test("Ctrl+A selects every unlocked element", () => {
    renderEditor();
    const [a, b] = threeRectangles();
    API.setElements([a, b, API.createElement({ id: "L", x: 600, locked: true })]);
    Keyboard.withModifierKeys({ ctrl: true }, () => Keyboard.keyPress("a"));
    expect(selectedIds()).toEqual(["A", "B"]);
  });

  test("Tab moves through the elements and then out of the editor", () => {
    renderEditor();
    threeRectangles();
    function tab() {
      return Keyboard.keyPress(KEYS.TAB);
    }
    expect(tab().defaultPrevented).toBe(true);
    expect(selectedIds()).toEqual(["A"]);
    tab();
    expect(selectedIds()).toEqual(["B"]);
    tab();
    expect(selectedIds()).toEqual(["C"]);
    // past the last: nothing selected, and the key is left to move focus on
    expect(tab().defaultPrevented).toBe(false);
    expect(selectedIds()).toEqual([]);
    Keyboard.withModifierKeys({ shift: true }, () => Keyboard.keyPress(KEYS.TAB));
    expect(selectedIds()).toEqual(["C"]);
  });

  test("Tab treats a group as one stop", () => {
    renderEditor();
    const [a, b] = threeRectangles();
    UI.group([a, b]);
    API.clearSelection();
    Keyboard.keyPress(KEYS.TAB);
    expect(selectedIds()).toEqual(["A", "B"]);
    Keyboard.keyPress(KEYS.TAB);
    expect(selectedIds()).toEqual(["C"]);
  });

  test("Escape deselects", () => {
    renderEditor();
    threeRectangles();
    mouse.clickAt(50, 50);
    Keyboard.keyPress(KEYS.ESCAPE);
    expect(selectedIds()).toEqual([]);
  });
});
