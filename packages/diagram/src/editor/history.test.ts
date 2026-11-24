/**
 * Undo and redo through the store and its history: each user change is one
 * entry, undo and redo round-trip the scene and the selection, and the redo
 * stack goes once something new changes.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { CODES, KEYS } from "@excalidraw/common";

import { API, Keyboard, UI, h, mouse, renderEditor, unmountEditors } from "./test-editor.ts";

afterEach(unmountEditors);

function filled(id: string, x: number, y = 0) {
  return API.createElement({ id, x, y, width: 100, height: 100, backgroundColor: "#ffc9c9" });
}

function snapshot() {
  return h()
    .scene.getNonDeletedElements()
    .map(({ id, x, y, width, height, angle, groupIds, locked }) => ({
      id,
      x,
      y,
      width,
      height,
      angle,
      groupIds,
      locked,
    }));
}

function roundTrip(change: () => void) {
  const before = snapshot();
  change();
  const after = snapshot();
  expect(after).not.toEqual(before);
  Keyboard.undo();
  expect(snapshot()).toEqual(before);
  Keyboard.redo();
  expect(snapshot()).toEqual(after);
}

describe("round trips", () => {
  test("drawing", () => {
    renderEditor();
    roundTrip(() => UI.createElement("rectangle", { x: 10, width: 50 }));
    roundTrip(() => UI.createElement("arrow", { x: 100, width: 50 }));
    roundTrip(() => UI.createElement("freedraw", { x: 200, width: 50 }));
  });

  test("moving, resizing and rotating", () => {
    renderEditor();
    API.loadElements([filled("A", 0)]);
    roundTrip(() => {
      mouse.downAt(50, 50);
      mouse.moveTo(80, 90);
      mouse.upAt(80, 90);
    });
    roundTrip(() => UI.resize(h().scene.getElement("A")!, "se", [40, 40]));
    roundTrip(() => UI.rotate(h().scene.getElement("A")!, [100, 100]));
  });

  function ctrl(key: string, shift = false) {
    return Keyboard.withModifierKeys({ ctrl: true, shift }, () => Keyboard.keyPress(key));
  }

  function setup() {
    renderEditor();
    API.loadElements([filled("A", 0), filled("B", 200)]);
    mouse.clickAt(50, 50);
  }

  test("deleting", () => {
    setup();
    roundTrip(() => Keyboard.keyPress(KEYS.DELETE));
  });

  test("duplicating", () => {
    setup();
    roundTrip(() => ctrl("d"));
  });

  test("grouping", () => {
    setup();
    roundTrip(() => {
      ctrl("a");
      ctrl("g");
    });
  });

  test("restacking", () => {
    setup();
    function order() {
      return h()
        .scene.getNonDeletedElements()
        .map((element) => element.id);
    }
    Keyboard.withModifierKeys({ ctrl: true }, () => Keyboard.codePress(CODES.BRACKET_RIGHT));
    expect(order()).toEqual(["B", "A"]);
    Keyboard.undo();
    expect(order()).toEqual(["A", "B"]);
    Keyboard.redo();
    expect(order()).toEqual(["B", "A"]);
  });

  test("locking", () => {
    setup();
    roundTrip(() => ctrl("l", true));
  });
});

describe("the stacks", () => {
  test("undo restores the selection with the elements", () => {
    renderEditor();
    API.loadElements([filled("A", 0)]);
    mouse.clickAt(50, 50);
    Keyboard.keyPress(KEYS.DELETE);
    expect(API.getSelectedElements()).toHaveLength(0);
    Keyboard.undo();
    expect(API.getSelectedElements().map((element) => element.id)).toEqual(["A"]);
  });

  test("a new change clears what could be redone", () => {
    renderEditor();
    UI.createElement("rectangle", { x: 0, width: 50 });
    Keyboard.undo();
    expect(API.getRedoStack().length).toBeGreaterThan(0);
    UI.createElement("ellipse", { x: 100, width: 50 });
    expect(API.getRedoStack()).toHaveLength(0);
  });

  test("Ctrl+Y redoes too", () => {
    renderEditor();
    UI.createElement("rectangle", { x: 0, width: 50 });
    Keyboard.undo();
    expect(h().scene.getNonDeletedElements()).toHaveLength(0);
    Keyboard.withModifierKeys({ ctrl: true }, () => Keyboard.keyPress("y"));
    expect(h().scene.getNonDeletedElements()).toHaveLength(1);
  });

  test("history.clear empties both stacks", () => {
    renderEditor();
    UI.createElement("rectangle", { x: 0, width: 50 });
    UI.createElement("rectangle", { x: 100, width: 50 });
    Keyboard.undo();
    h().api.history.clear();
    expect(API.getUndoStack()).toHaveLength(0);
    expect(API.getRedoStack()).toHaveLength(0);
    Keyboard.undo();
    expect(h().scene.getNonDeletedElements()).toHaveLength(1);
  });

  test("loading a scene is not undoable", () => {
    renderEditor({
      initialData: { elements: [filled("A", 0)] },
    });
    Keyboard.undo();
    expect(h().scene.getNonDeletedElements()).toHaveLength(1);
    expect(API.getUndoStack()).toHaveLength(0);
  });

  test("undo waits while something is being drawn", () => {
    renderEditor();
    UI.createElement("rectangle", { x: 0, width: 50 });
    UI.clickTool("line");
    mouse.clickAt(200, 200);
    mouse.moveTo(250, 250);
    Keyboard.undo();
    expect(
      h()
        .scene.getNonDeletedElements()
        .map((element) => element.type),
    ).toEqual(["rectangle", "line"]);
  });
});
