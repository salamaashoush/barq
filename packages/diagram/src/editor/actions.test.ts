/**
 * The editing actions by their keyboard shortcuts: delete, duplicate, the
 * stacking order, groups, locking, aligning and distributing, the grid and
 * the zoom.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { CODES, KEYS, isDarwin } from "@excalidraw/common";

import { actionAlignHorizontallyCentered } from "./actions/align.ts";
import { API, Keyboard, UI, h, mouse, renderEditor, unmountEditors } from "./test-editor.ts";

afterEach(unmountEditors);

const filled = (id: string, x: number, y = 0, width = 100, height = width) =>
  API.createElement({ id, x, y, width, height, backgroundColor: "#ffc9c9" });

const ids = () =>
  h()
    .scene.getNonDeletedElements()
    .map((element) => element.id);
const selectedIds = () =>
  API.getSelectedElements()
    .map((element) => element.id)
    .toSorted();
const at = (id: string): readonly [x: number, y: number] => {
  const element = h().scene.getElement(id)!;
  return [element.x, element.y];
};

const ctrl = (key: string, modifiers: { shift?: boolean; alt?: boolean } = {}) =>
  Keyboard.withModifierKeys({ ctrl: true, ...modifiers }, () => Keyboard.keyPress(key));

const ctrlCode = (code: string, modifiers: { shift?: boolean; alt?: boolean } = {}) =>
  Keyboard.withModifierKeys({ ctrl: true, ...modifiers }, () => Keyboard.codePress(code));

describe("delete", () => {
  test("Delete and Backspace remove the selection", () => {
    renderEditor();
    API.loadElements([filled("A", 0), filled("B", 200), filled("C", 400)]);
    mouse.clickAt(50, 50);
    Keyboard.keyPress(KEYS.DELETE);
    expect(ids()).toEqual(["B", "C"]);
    mouse.clickAt(250, 50);
    Keyboard.keyPress(KEYS.BACKSPACE);
    expect(ids()).toEqual(["C"]);
    expect(selectedIds()).toEqual([]);
  });

  test("deleting from inside a group selects what is left of it", () => {
    renderEditor();
    const a = filled("A", 0);
    const b = filled("B", 200);
    const c = filled("C", 400);
    API.loadElements([a, b, c]);
    UI.group([a, b, c]);
    mouse.doubleClickAt(50, 50);
    Keyboard.keyPress(KEYS.DELETE);
    expect(ids()).toEqual(["B", "C"]);
    expect(selectedIds()).toEqual(["B"]);
    expect(h().state.editingGroupId).not.toBeNull();
  });
});

describe("duplicate", () => {
  test("Ctrl+D copies the selection beside it and selects the copy", () => {
    renderEditor();
    API.loadElements([filled("A", 0)]);
    mouse.clickAt(50, 50);
    ctrl("d");
    expect(ids()).toHaveLength(2);
    const copy = h().scene.getNonDeletedElements()[1]!;
    expect([copy.x, copy.y]).toEqual([10, 10]);
    expect(selectedIds()).toEqual([copy.id]);
    Keyboard.undo();
    expect(ids()).toEqual(["A"]);
  });

  test("a duplicated group stays a group, of its own", () => {
    renderEditor();
    const a = filled("A", 0);
    const b = filled("B", 200);
    API.loadElements([a, b]);
    UI.group([a, b]);
    ctrl("d");
    const elements = h().scene.getNonDeletedElements();
    expect(elements).toHaveLength(4);
    const [, , copyA, copyB] = elements;
    expect(copyA!.groupIds).toHaveLength(1);
    expect(copyA!.groupIds).toEqual(copyB!.groupIds);
    expect(copyA!.groupIds).not.toEqual(API.getElement(a).groupIds);
  });
});

describe("stacking order", () => {
  test("Ctrl+[ and Ctrl+] step, and to the back and front", () => {
    renderEditor();
    API.loadElements([filled("A", 0), filled("B", 20), filled("C", 40)]);
    mouse.clickAt(5, 50);
    expect(selectedIds()).toEqual(["A"]);
    ctrlCode(CODES.BRACKET_RIGHT);
    expect(ids()).toEqual(["B", "A", "C"]);
    ctrlCode(CODES.BRACKET_RIGHT, isDarwin ? { alt: true } : { shift: true });
    expect(ids()).toEqual(["B", "C", "A"]);
    ctrlCode(CODES.BRACKET_LEFT);
    expect(ids()).toEqual(["B", "A", "C"]);
    ctrlCode(CODES.BRACKET_LEFT, isDarwin ? { alt: true } : { shift: true });
    expect(ids()).toEqual(["A", "B", "C"]);
  });
});

describe("groups", () => {
  test("Ctrl+G groups, Ctrl+Shift+G ungroups", () => {
    renderEditor();
    const a = filled("A", 0);
    const b = filled("B", 200);
    API.loadElements([a, b]);
    UI.group([a, b]);
    const [groupId] = API.getElement(a).groupIds;
    expect(groupId).toBeDefined();
    expect(API.getElement(b).groupIds).toEqual([groupId!]);
    expect(h().state.selectedGroupIds).toEqual({ [groupId!]: true });

    // the group is still selected
    ctrl("G", { shift: true });
    expect(API.getElement(a).groupIds).toEqual([]);
    expect(API.getElement(b).groupIds).toEqual([]);
    expect(selectedIds()).toEqual(["A", "B"]);
  });

  test("grouping inside the edited group nests", () => {
    renderEditor();
    const a = filled("A", 0);
    const b = filled("B", 200);
    const c = filled("C", 400);
    API.loadElements([a, b, c]);
    UI.group([a, b, c]);
    const [outer] = API.getElement(a).groupIds;
    mouse.doubleClickAt(50, 50);
    Keyboard.withModifierKeys({ shift: true }, () => mouse.clickAt(250, 50));
    ctrl("g");
    const groupIds = API.getElement(a).groupIds;
    expect(groupIds).toHaveLength(2);
    expect(groupIds[1]).toBe(outer);
    expect(API.getElement(c).groupIds).toEqual([outer!]);
  });
});

describe("lock", () => {
  test("Ctrl+Shift+L locks the selection, and with nothing selected unlocks all", () => {
    renderEditor();
    API.loadElements([filled("A", 0), filled("B", 200)]);
    mouse.clickAt(50, 50);
    ctrl("l", { shift: true });
    expect(h().scene.getElement("A")?.locked).toBe(true);
    expect(selectedIds()).toEqual([]);

    mouse.clickAt(50, 50);
    expect(selectedIds()).toEqual([]);

    ctrl("l", { shift: true });
    expect(h().scene.getElement("A")?.locked).toBe(false);
    expect(selectedIds()).toEqual(["A"]);
  });

  test("several elements lock together, as a unit", () => {
    renderEditor();
    API.loadElements([filled("A", 0), filled("B", 200)]);
    ctrl("a");
    ctrl("l", { shift: true });
    const a = h().scene.getElement("A")!;
    const b = h().scene.getElement("B")!;
    expect(a.locked && b.locked).toBe(true);
    expect(a.groupIds).toHaveLength(1);
    expect(a.groupIds).toEqual(b.groupIds);
    ctrl("l", { shift: true });
    expect(h().scene.getElement("A")?.groupIds).toEqual([]);
  });
});

describe("align and distribute", () => {
  const setup = () => {
    renderEditor();
    API.loadElements([filled("A", 0, 0, 100), filled("B", 200, 50, 50), filled("C", 300, 200, 60)]);
    ctrl("a");
  };

  test("Ctrl+Shift with an arrow aligns to that side", () => {
    setup();
    ctrl(KEYS.ARROW_UP, { shift: true });
    expect([at("A")[1], at("B")[1], at("C")[1]]).toEqual([0, 0, 0]);
    ctrl(KEYS.ARROW_RIGHT, { shift: true });
    expect([at("A")[0], at("B")[0], at("C")[0]]).toEqual([260, 310, 300]);
    ctrl(KEYS.ARROW_LEFT, { shift: true });
    expect([at("A")[0], at("B")[0], at("C")[0]]).toEqual([260, 260, 260]);
    ctrl(KEYS.ARROW_DOWN, { shift: true });
    expect([at("A")[1], at("B")[1], at("C")[1]]).toEqual([0, 50, 40]);
  });

  test("Alt+Shift+H and Alt+Shift+V centre", () => {
    setup();
    Keyboard.withModifierKeys({ alt: true, shift: true }, () => Keyboard.codePress(CODES.H));
    expect(at("A")[0] + 50).toBeCloseTo(at("B")[0] + 25);
    expect(at("C")[0] + 30).toBeCloseTo(at("B")[0] + 25);
    Keyboard.withModifierKeys({ alt: true, shift: true }, () => Keyboard.codePress(CODES.V));
    expect(at("A")[1] + 50).toBeCloseTo(at("C")[1] + 30);
  });

  test("Alt+H spaces evenly across", () => {
    setup();
    Keyboard.withModifierKeys({ alt: true }, () => Keyboard.codePress(CODES.H));
    // the gaps between A, B and C are equal
    const gapAB = at("B")[0] - (at("A")[0] + 100);
    const gapBC = at("C")[0] - (at("B")[0] + 50);
    expect(gapAB).toBeCloseTo(gapBC);
    expect([at("A")[0], at("C")[0]]).toEqual([0, 300]);
  });

  test("Alt+V spaces evenly down", () => {
    setup();
    Keyboard.withModifierKeys({ alt: true }, () => Keyboard.codePress(CODES.V));
    const gapAB = at("B")[1] - (at("A")[1] + 100);
    const gapBC = at("C")[1] - (at("B")[1] + 50);
    expect(gapAB).toBeCloseTo(gapBC);
  });

  test("aligning one element does nothing", () => {
    renderEditor();
    API.loadElements([filled("A", 0)]);
    mouse.clickAt(50, 50);
    const undo = API.getUndoStack().length;
    API.executeAction(actionAlignHorizontallyCentered);
    expect(API.getUndoStack()).toHaveLength(undo);
  });
});

describe("canvas", () => {
  test("Ctrl+' toggles the grid", () => {
    renderEditor();
    ctrlCode(CODES.QUOTE);
    expect(h().state.gridModeEnabled).toBe(true);
    ctrlCode(CODES.QUOTE);
    expect(h().state.gridModeEnabled).toBe(false);
  });

  test("Ctrl+= and Ctrl+- zoom around the middle, Ctrl+0 resets", () => {
    renderEditor();
    ctrlCode(CODES.EQUAL);
    expect(h().state.zoom.value).toBeCloseTo(1.1);
    ctrlCode(CODES.MINUS);
    ctrlCode(CODES.MINUS);
    expect(h().state.zoom.value).toBeCloseTo(0.9);
    ctrlCode(CODES.ZERO);
    expect(h().state.zoom.value).toBeCloseTo(1);
    expect(h().state.scrollX).toBeCloseTo(0);
  });

  test("Shift+1 fits the content", () => {
    renderEditor();
    API.loadElements([filled("A", 2000, 2000)]);
    Keyboard.withModifierKeys({ shift: true }, () => Keyboard.codePress(CODES.ONE));
    const { scrollX, scrollY, zoom, width, height } = h().state;
    // the element's centre is the viewport's
    expect((2050 + scrollX) * zoom.value).toBeCloseTo(width / 2);
    expect((2050 + scrollY) * zoom.value).toBeCloseTo(height / 2);
  });
});
