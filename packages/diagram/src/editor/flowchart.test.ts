/**
 * Flowcharts from the keyboard, sticky notes, and list markers, as
 * Excalidraw's `flowchart`, `stickyNotes` and duplication tests drive them.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { DEFAULT_STICKY_NOTE_SIZE, KEYS } from "@excalidraw/common";
import { isArrowElement, isTextElement, newTextElement } from "@excalidraw/element";

import type { ExcalidrawElement } from "@excalidraw/element/types";

import {
  API,
  Keyboard,
  UI,
  getTextEditor,
  h,
  mouse,
  renderEditor,
  textEditor,
  unmountEditors,
} from "./test-editor.ts";

afterEach(unmountEditors);

function live() {
  return h().scene.getNonDeletedElements();
}

function rect(id: string, x: number, y: number) {
  return API.createElement({ id, x, y, width: 100, height: 60 }) as ExcalidrawElement;
}

describe("flowcharts", () => {
  test("Ctrl+→ previews a linked node, added when Ctrl is let go", () => {
    renderEditor();
    API.loadElements([rect("a", 100, 100)]);
    API.setSelectedElements([live()[0]!]);
    Keyboard.withModifierKeys({ ctrl: true }, () => Keyboard.keyDown(KEYS.ARROW_RIGHT));
    expect(h().flowchart.pendingNodes?.length).toBeGreaterThan(0);
    // the preview is not in the scene yet
    expect(live()).toHaveLength(1);
    Keyboard.keyUp(KEYS.ARROW_RIGHT);
    Keyboard.keyUp("Control");
    const added = live().slice(1);
    expect(added.map((element) => element.type).toSorted()).toEqual(["arrow", "rectangle"]);
    const node = added.find((element) => element.type === "rectangle")!;
    expect(node.x).toBeGreaterThan(200);
    expect(h().state.selectedElementIds).toEqual({ [node.id]: true });
    const arrow = added.find(isArrowElement);
    expect([arrow?.startBinding?.elementId, arrow?.endBinding?.elementId]).toEqual(["a", node.id]);
    Keyboard.undo();
    expect(live()).toHaveLength(1);
  });

  test("each press adds a node; Escape cancels them", () => {
    renderEditor();
    API.loadElements([rect("a", 100, 100)]);
    API.setSelectedElements([live()[0]!]);
    Keyboard.withModifierKeys({ ctrl: true }, () => {
      Keyboard.keyDown(KEYS.ARROW_DOWN);
      Keyboard.keyDown(KEYS.ARROW_DOWN);
    });
    const pendingNodes = h().flowchart.pendingNodes ?? [];
    expect(pendingNodes.filter((element) => element.type === "rectangle")).toHaveLength(2);
    Keyboard.withModifierKeys({ ctrl: true }, () => Keyboard.keyDown(KEYS.ESCAPE));
    expect(h().flowchart.isCreatingChart).toBe(false);
    Keyboard.keyUp("Control");
    expect(live()).toHaveLength(1);
  });

  test("Alt+→ moves the selection along the links", () => {
    renderEditor();
    API.loadElements([rect("a", 100, 100)]);
    API.setSelectedElements([live()[0]!]);
    Keyboard.withModifierKeys({ ctrl: true }, () => Keyboard.keyDown(KEYS.ARROW_RIGHT));
    Keyboard.keyUp("Control");
    const node = live().find((element) => element.type === "rectangle" && element.id !== "a")!;
    API.setSelectedElements([live()[0]!]);
    Keyboard.withModifierKeys({ alt: true }, () => Keyboard.keyDown(KEYS.ARROW_RIGHT));
    expect(h().state.selectedElementIds).toEqual({ [node.id]: true });
    Keyboard.keyUp("Alt");
  });
});

describe("sticky notes", () => {
  test("N and a click put a default note there, and write in it", async () => {
    renderEditor();
    Keyboard.keyPress("n");
    expect(h().state.activeTool.type).toBe("stickynote");
    mouse.clickAt(300, 300);
    const [note] = live();
    expect(note?.type).toBe("stickynote");
    expect([note?.width, note?.height]).toEqual([
      DEFAULT_STICKY_NOTE_SIZE,
      DEFAULT_STICKY_NOTE_SIZE,
    ]);
    expect(note!.x + note!.width / 2).toBe(300);
    const editor = await textEditor();
    expect(h().state.editingTextElement?.containerId).toBe(note!.id);
    UI.updateTextEditor(editor, "remember");
    UI.exitTextEditor(editor);
    const label = live().find(isTextElement);
    expect(label?.originalText).toBe("remember");
    // a note's text is its stroke colour
    expect(label?.strokeColor).toBe(note!.strokeColor);
  });

  test("a drag makes a square note, Shift a free one", async () => {
    renderEditor();
    UI.clickTool("stickynote");
    mouse.downAt(100, 100);
    mouse.moveTo(300, 200);
    mouse.upAt(300, 200);
    const [note] = live();
    expect(note?.width).toBe(note?.height);
    expect(note?.width).toBe(200);
    await textEditor();
    UI.exitTextEditor(getTextEditor()!);

    UI.clickTool("stickynote");
    Keyboard.withModifierKeys({ shift: true }, () => {
      mouse.downAt(500, 100);
      mouse.moveTo(800, 200);
      mouse.upAt(800, 200);
    });
    const free = live().find((element) => element.type === "stickynote" && element.id !== note!.id);
    expect(free?.width).toBe(300);
    expect(free?.height).toBe(100);
  });
});

describe("list markers", () => {
  function listText() {
    return { ...newTextElement({ x: 100, y: 100, text: "1. first" }), id: "item" };
  }

  test("Ctrl+D advances a duplicated item's marker, as an undo step of its own", () => {
    renderEditor();
    API.loadElements([listText()]);
    API.setSelectedElements([live()[0]!]);
    Keyboard.withModifierKeys({ ctrl: true }, () => Keyboard.keyPress("d"));
    const texts = live().filter(isTextElement);
    expect(texts.map((text) => text.originalText)).toEqual(["1. first", "2. first"]);
    Keyboard.undo();
    expect(
      live()
        .filter(isTextElement)
        .map((text) => text.originalText),
    ).toEqual(["1. first", "1. first"]);
    Keyboard.undo();
    expect(live()).toHaveLength(1);
  });

  test("an alt-drag advances the duplicate's marker, and edits the item's text", async () => {
    renderEditor();
    API.loadElements([listText()]);
    API.setSelectedElements([live()[0]!]);
    const text = live()[0]!;
    Keyboard.withModifierKeys({ alt: true }, () => {
      mouse.downAt(text.x + 5, text.y + 5);
      mouse.moveTo(text.x + 5, text.y + 80);
      mouse.moveTo(text.x + 5, text.y + 105);
      mouse.upAt();
    });
    const texts = live().filter(isTextElement);
    expect(texts.map((each) => each.originalText).toSorted()).toEqual(["1. first", "2. first"]);
    const editor = await textEditor();
    expect(editor.value).toBe("2. first");
    expect([editor.selectionStart, editor.selectionEnd]).toEqual([3, 8]);
  });
});
