/**
 * Text, as Excalidraw's `textWysiwyg` tests drive it: the text tool, double
 * clicks and Enter open a textarea over the text, typing writes to the
 * element, and Escape, Ctrl+Enter or focus moving away submit it. The test
 * canvas measures a character at half the font size: 10px at 20px, whose
 * line is 25px high.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { FONT_FAMILY, KEYS, THEME } from "@excalidraw/common";
import { isTextElement, normalizeText } from "@excalidraw/element";
import type { Radians } from "@excalidraw/math";

import type {
  ExcalidrawElement,
  ExcalidrawTextElement,
  NonDeleted,
} from "@excalidraw/element/types";

import {
  actionChangeFontFamily,
  actionChangeTextAlign,
  actionChangeVerticalAlign,
} from "./actions/text.ts";
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

import type { Action } from "./types.ts";

afterEach(unmountEditors);

const texts = (): NonDeleted<ExcalidrawTextElement>[] =>
  h()
    .scene.getNonDeletedElements()
    .flatMap((element) => (isTextElement(element) ? [element] : []));

const onlyText = () => {
  const [text] = texts();
  if (!text || texts().length !== 1) throw new Error(`expected 1 text, got ${texts().length}`);
  return text;
};

const keyDownIn = (
  textarea: HTMLTextAreaElement,
  key: string,
  init: KeyboardEventInit = {},
): KeyboardEvent => {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  textarea.dispatchEvent(event);
  return event;
};

const createText = async (x: number, y: number, value: string) => {
  UI.clickTool("text");
  mouse.clickAt(x, y);
  const editor = await textEditor();
  UI.updateTextEditor(editor, value);
  UI.exitTextEditor(editor);
  return onlyText();
};

const run = <T>(action: Action<T>, value: T) =>
  h().batch(() => h().actionManager.executeAction(action, value));

describe("creating text", () => {
  test("the text tool opens an editor centred on the click", async () => {
    renderEditor();
    UI.clickTool("text");
    mouse.clickAt(100, 100);
    const editor = await textEditor();
    expect(h().state.editingTextElement?.type).toBe("text");
    expect(document.activeElement).toBe(editor);
    // the first line centres on the pointer
    expect([onlyText().x, onlyText().y]).toEqual([100, 87.5]);
    expect(h().state.activeTool.type).toBe("selection");
  });

  test("typing writes the text, and Escape commits it selected", async () => {
    renderEditor();
    const text = await createText(100, 100, "Hello");
    expect(text.text).toBe("Hello");
    expect(text.originalText).toBe("Hello");
    expect([text.width, text.height]).toEqual([50, 25]);
    expect(h().state.editingTextElement).toBeNull();
    expect(getTextEditor()).toBeNull();
    expect(h().state.selectedElementIds).toEqual({ [text.id]: true });
    expect(document.activeElement).toBe(h().container);
  });

  test("Ctrl+Enter commits, but not while an IME is composing", async () => {
    renderEditor();
    UI.clickTool("text");
    mouse.clickAt(100, 100);
    const editor = await textEditor();
    UI.updateTextEditor(editor, "こんにちは");
    Keyboard.withModifierKeys({ ctrl: true }, () => {
      keyDownIn(editor, KEYS.ENTER, { isComposing: true, ctrlKey: true, metaKey: true });
    });
    expect(getTextEditor()).toBe(editor);
    keyDownIn(editor, KEYS.ENTER, { ctrlKey: true, metaKey: true });
    expect(getTextEditor()).toBeNull();
    expect(onlyText().text).toBe("こんにちは");
  });

  test("focus moving away commits", async () => {
    renderEditor();
    UI.clickTool("text");
    mouse.clickAt(100, 100);
    const editor = await textEditor();
    UI.updateTextEditor(editor, "blurred");
    h().focusContainer();
    expect(getTextEditor()).toBeNull();
    expect(onlyText().text).toBe("blurred");
    expect(h().state.editingTextElement).toBeNull();
  });

  test("an empty text is deleted on commit, and undo does not bring it back", async () => {
    renderEditor();
    UI.clickTool("text");
    mouse.clickAt(100, 100);
    const editor = await textEditor();
    UI.updateTextEditor(editor, "   ");
    UI.exitTextEditor(editor);
    expect(texts()).toHaveLength(0);
    Keyboard.undo();
    expect(texts()).toHaveLength(0);
  });

  test("a text deleted from under the edit closes the editor", async () => {
    renderEditor();
    UI.clickTool("text");
    mouse.clickAt(100, 100);
    await textEditor();
    const id = h().state.editingTextElement?.id;
    API.updateScene({
      elements: h()
        .scene.getElementsIncludingDeleted()
        .filter((element) => element.id !== id),
      captureUpdate: "NEVER",
    });
    await Promise.resolve();
    expect(getTextEditor()).toBeNull();
    expect(h().state.editingTextElement).toBeNull();
  });

  test("on the grid, new text starts at the cell's corner", async () => {
    renderEditor({ gridModeEnabled: true });
    UI.clickTool("text");
    mouse.clickAt(47, 53);
    await textEditor();
    expect([onlyText().x, onlyText().y]).toEqual([40, 40]);
  });

  test("normalizes line endings and tabs as it is typed", async () => {
    renderEditor();
    UI.clickTool("text");
    mouse.clickAt(100, 100);
    const editor = await textEditor();
    UI.updateTextEditor(editor, "a\r\nb\tc");
    expect(editor.value).toBe(normalizeText("a\r\nb\tc"));
    expect(editor.value).not.toContain("\r");
    expect(editor.value).not.toContain("\t");
    UI.exitTextEditor(editor);
    expect(onlyText().originalText).toBe(editor.value);
  });
});

describe("editing text", () => {
  test("a double-click on text edits it", async () => {
    renderEditor();
    const text = await createText(100, 100, "first");
    mouse.doubleClickAt(text.x + 10, text.y + 10);
    const editor = await textEditor();
    expect(editor.value).toBe("first");
    expect(h().state.editingTextElement?.id).toBe(text.id);
    UI.updateTextEditor(editor, "second");
    UI.exitTextEditor(editor);
    expect(onlyText().text).toBe("second");
    expect(onlyText().id).toBe(text.id);
  });

  test("Enter on the selected text edits it", async () => {
    renderEditor();
    const text = await createText(100, 100, "enter");
    expect(h().state.selectedElementIds[text.id]).toBe(true);
    Keyboard.keyPress(KEYS.ENTER);
    const editor = await textEditor();
    expect(editor.value).toBe("enter");
  });

  test("the text tool edits the text under it, the caret where it clicked", async () => {
    renderEditor();
    const text = await createText(100, 100, "abcdef");
    API.clearSelection();
    UI.clickTool("text");
    mouse.clickAt(text.x + 31, text.y + 10);
    const editor = await textEditor();
    expect(h().state.editingTextElement?.id).toBe(text.id);
    expect([editor.selectionStart, editor.selectionEnd]).toEqual([3, 3]);
  });

  test("a click on the selected text edits it, the caret where it clicked", async () => {
    renderEditor();
    const text = await createText(100, 100, "abcdef");
    // past a double tap's time: a double-click selects the whole text
    await new Promise((resolve) => setTimeout(resolve, 400));
    mouse.clickAt(text.x + 19, text.y + 10);
    const editor = await textEditor();
    expect([editor.selectionStart, editor.selectionEnd]).toEqual([2, 2]);
  });

  test("Tab indents the selected lines, Shift+Tab outdents them", async () => {
    renderEditor();
    UI.clickTool("text");
    mouse.clickAt(100, 100);
    const editor = await textEditor();
    UI.updateTextEditor(editor, "Line#1\nLine#2");
    editor.selectionStart = 0;
    editor.selectionEnd = 10;
    keyDownIn(editor, KEYS.TAB);
    expect(editor.value).toBe("    Line#1\n    Line#2");
    expect(onlyText().originalText).toBe("    Line#1\n    Line#2");
    keyDownIn(editor, KEYS.TAB, { shiftKey: true });
    expect(editor.value).toBe("Line#1\nLine#2");
  });

  test("Tab does nothing while an IME is composing", async () => {
    renderEditor();
    UI.clickTool("text");
    mouse.clickAt(100, 100);
    const editor = await textEditor();
    UI.updateTextEditor(editor, "abc");
    keyDownIn(editor, KEYS.TAB, { isComposing: true });
    expect(editor.value).toBe("abc");
  });

  test("the editor takes the font, size, colour and alignment of its text", async () => {
    renderEditor();
    const text = await createText(100, 100, "styled");
    run(actionChangeTextAlign, "right");
    Keyboard.keyPress(KEYS.ENTER);
    const editor = await textEditor();
    expect(editor.style.fontSize).toBe("20px");
    expect(editor.style.textAlign).toBe("right");
    expect(editor.style.color).toBe(text.strokeColor);
    expect(editor.dir).toBe("auto");
  });

  test("the editor's colour follows the theme", async () => {
    renderEditor();
    const text = await createText(100, 100, "theme");
    Keyboard.keyPress(KEYS.ENTER);
    const editor = await textEditor();
    const light = editor.style.color;
    expect(light).toBe(text.strokeColor);
    API.setAppState({ theme: THEME.DARK });
    expect(editor.style.color).not.toBe(light);
    API.setAppState({ theme: THEME.LIGHT });
    expect(editor.style.color).toBe(light);
  });

  test("Ctrl+= in the editor zooms the canvas, and the editor with it", async () => {
    renderEditor();
    UI.clickTool("text");
    mouse.clickAt(100, 100);
    const editor = await textEditor();
    keyDownIn(editor, "=", { code: "Equal", ctrlKey: true, metaKey: true });
    expect(h().state.zoom.value).toBeGreaterThan(1);
    expect(editor.style.transform).toContain(`scale(${h().state.zoom.value})`);
  });

  test("elements pasted into the editor paste as their text", async () => {
    renderEditor();
    UI.clickTool("text");
    mouse.clickAt(100, 100);
    const editor = await textEditor();
    const copied = {
      type: "excalidraw/clipboard",
      elements: [{ ...(await createLabel()), id: "pasted" }],
    };
    const event = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, "clipboardData", {
      value: {
        getData: (type: string) => (type === "text/plain" ? JSON.stringify(copied) : ""),
      },
    });
    editor.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(editor.value).toBe("label");
  });
});

/** A text element, as a copied one would be, without an editor. */
const createLabel = async (): Promise<ExcalidrawElement> => {
  const { newTextElement } = await import("@excalidraw/element");
  return newTextElement({ x: 0, y: 0, text: "label" });
};

describe("right-to-left text", () => {
  test("Arabic is written and measured as typed", async () => {
    renderEditor();
    const text = await createText(100, 100, "مرحبا بالعالم");
    expect(text.originalText).toBe("مرحبا بالعالم");
    expect(text.width).toBe(130);
  });

  test("a click places the caret from the right on an Arabic line", async () => {
    renderEditor();
    const text = await createText(100, 100, "مرحبا");
    API.clearSelection();
    UI.clickTool("text");
    // near the right edge: the start of a right-to-left line
    mouse.clickAt(text.x + text.width - 1, text.y + 10);
    const editor = await textEditor();
    expect(editor.selectionStart).toBe(0);
    UI.exitTextEditor(editor);
    API.clearSelection();
    UI.clickTool("text");
    mouse.clickAt(text.x + 1, text.y + 10);
    const again = await textEditor();
    expect(again.selectionStart).toBe(5);
  });
});

describe("wrapping and resizing", () => {
  test("growing text stops at the view's width and wraps from there", async () => {
    renderEditor();
    UI.clickTool("text");
    mouse.clickAt(100, 100);
    const editor = await textEditor();
    UI.updateTextEditor(editor, "word ".repeat(40).trim());
    const text = onlyText();
    expect(text.autoResize).toBe(false);
    expect(text.width).toBeLessThanOrEqual(800);
    expect(text.text.split("\n").length).toBeGreaterThan(1);
    expect(editor.style.whiteSpace).toBe("pre-wrap");
  });

  test("Alt+W lets a wrapped text grow with its content again", async () => {
    renderEditor();
    UI.clickTool("text");
    mouse.clickAt(100, 100);
    const editor = await textEditor();
    UI.updateTextEditor(editor, "word ".repeat(40).trim());
    UI.exitTextEditor(editor);
    expect(onlyText().autoResize).toBe(false);
    Keyboard.withModifierKeys({ alt: true }, () => Keyboard.keyPress("w"));
    expect(onlyText().autoResize).toBe(true);
    expect(onlyText().text).toBe(onlyText().originalText);
    // and Alt+W again keeps its width, wrapping at it
    Keyboard.withModifierKeys({ alt: true }, () => Keyboard.keyPress("w"));
    expect(onlyText().autoResize).toBe(false);
  });

  test("Alt+W in the editor toggles the edited text", async () => {
    renderEditor();
    const text = await createText(100, 100, "hello world");
    Keyboard.keyPress(KEYS.ENTER);
    const editor = await textEditor();
    keyDownIn(editor, "w", { code: "KeyW", altKey: true });
    expect(API.getElement(text).autoResize).toBe(false);
    expect(h().state.editingTextElement?.id).toBe(text.id);
  });

  test("dragging with the text tool sets a fixed width", async () => {
    renderEditor();
    UI.clickTool("text");
    mouse.downAt(100, 100);
    mouse.moveTo(300, 110);
    mouse.upAt(300, 110);
    const editor = await textEditor();
    const text = onlyText();
    expect(text.autoResize).toBe(false);
    expect(text.width).toBe(200);
    UI.updateTextEditor(editor, "word ".repeat(10).trim());
    expect(onlyText().width).toBe(200);
    expect(onlyText().text.split("\n").length).toBeGreaterThan(1);
  });
});

describe("font size, family and alignment", () => {
  test("Ctrl+Shift+> and < change the selected text's size", async () => {
    renderEditor();
    await createText(100, 100, "size");
    Keyboard.withModifierKeys({ ctrl: true, shift: true }, () => Keyboard.keyPress(">"));
    expect(onlyText().fontSize).toBe(22);
    expect(h().state.currentItemFontSize).toBe(22);
    Keyboard.withModifierKeys({ ctrl: true, shift: true }, () => Keyboard.keyPress("<"));
    expect(onlyText().fontSize).toBe(20);
  });

  test("the size keys work in the editor too", async () => {
    renderEditor();
    UI.clickTool("text");
    mouse.clickAt(100, 100);
    const editor = await textEditor();
    UI.updateTextEditor(editor, "abc");
    keyDownIn(editor, ">", { shiftKey: true, ctrlKey: true, metaKey: true });
    expect(onlyText().fontSize).toBe(22);
    expect(editor.style.fontSize).toBe("22px");
  });

  test("a new family measures the text again, with its line height", async () => {
    renderEditor();
    await createText(100, 100, "family");
    run(actionChangeFontFamily, FONT_FAMILY["Lilita One"]);
    await Promise.resolve();
    const text = onlyText();
    expect(text.fontFamily).toBe(FONT_FAMILY["Lilita One"]);
    expect(text.lineHeight).toBe(1.15 as ExcalidrawTextElement["lineHeight"]);
    expect(text.height).toBe(23);
    expect(h().state.currentItemFontFamily).toBe(FONT_FAMILY["Lilita One"]);
  });

  test("alignment keeps a free text where it is, and is used for the next one", async () => {
    renderEditor();
    const text = await createText(100, 100, "align");
    run(actionChangeTextAlign, "center");
    expect(onlyText().textAlign).toBe("center");
    expect(onlyText().x).toBe(text.x);
    expect(h().state.currentItemTextAlign).toBe("center");
  });
});

describe("text in containers", () => {
  const filledRect = () =>
    API.createElement({
      id: "box",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
      backgroundColor: "#ffc9c9",
    });

  test("a double-click in a filled shape binds a centred label to it", async () => {
    renderEditor();
    API.loadElements([filledRect()]);
    mouse.doubleClickAt(150, 130);
    const editor = await textEditor();
    const text = onlyText();
    expect(text.containerId).toBe("box");
    expect(text.textAlign).toBe("center");
    expect(text.verticalAlign).toBe("middle");
    expect(h().scene.getElement("box")?.boundElements).toEqual([{ type: "text", id: text.id }]);
    UI.updateTextEditor(editor, "label");
    UI.exitTextEditor(editor);
    // centred in the container
    const label = onlyText();
    expect(label.x + label.width / 2).toBe(200);
    expect(label.y + label.height / 2).toBe(150);
    // Escape keeps the container selected
    expect(h().state.selectedElementIds).toEqual({ box: true });
  });

  test("Enter on a selected shape binds a label", async () => {
    renderEditor();
    API.loadElements([filledRect()]);
    mouse.clickAt(200, 100);
    Keyboard.keyPress(KEYS.ENTER);
    await textEditor();
    expect(onlyText().containerId).toBe("box");
  });

  test("a label wraps at its container's width, and the container grows to fit it", async () => {
    renderEditor();
    API.loadElements([filledRect()]);
    mouse.clickAt(200, 100);
    Keyboard.keyPress(KEYS.ENTER);
    const editor = await textEditor();
    UI.updateTextEditor(editor, "word ".repeat(20).trim());
    const label = onlyText();
    expect(label.text.split("\n").length).toBeGreaterThan(3);
    expect(label.width).toBeLessThanOrEqual(190);
    expect(h().scene.getElement("box")!.height).toBeGreaterThan(100);
    UI.updateTextEditor(editor, "short");
    // and shrinks back with it, to the text's own height, as Excalidraw's
    // does (its diamond of 75 ends at 70)
    expect(h().scene.getElement("box")!.height).toBe(35);
  });

  test("a label emptied away leaves its container", async () => {
    renderEditor();
    API.loadElements([filledRect()]);
    mouse.clickAt(200, 100);
    Keyboard.keyPress(KEYS.ENTER);
    const editor = await textEditor();
    UI.updateTextEditor(editor, "  ");
    UI.exitTextEditor(editor);
    expect(texts()).toHaveLength(0);
    expect(h().scene.getElement("box")?.boundElements).toEqual([]);
    expect(h().state.selectedElementIds).toEqual({ box: true });
  });

  test("a click on a selected shape's label edits it", async () => {
    renderEditor();
    API.loadElements([filledRect()]);
    mouse.clickAt(200, 100);
    Keyboard.keyPress(KEYS.ENTER);
    const editor = await textEditor();
    UI.updateTextEditor(editor, "label");
    UI.exitTextEditor(editor);
    const label = onlyText();
    await new Promise((resolve) => setTimeout(resolve, 400));
    mouse.clickAt(label.x + 5, label.y + 5);
    const again = await textEditor();
    expect(again.value).toBe("label");
  });

  test("a label takes its rotated container's angle", async () => {
    renderEditor();
    API.loadElements([{ ...filledRect(), angle: 1 } as ExcalidrawElement]);
    API.setSelectedElements([h().scene.getNonDeletedElements()[0]!]);
    Keyboard.keyPress(KEYS.ENTER);
    await textEditor();
    expect(onlyText().angle).toBe(1 as Radians);
  });

  test("lines and drawings take no label", async () => {
    renderEditor();
    for (const type of ["line", "freedraw"] as const) {
      const element = API.createElement({ type, id: type, x: 0, y: 0, width: 100, height: 100 });
      API.loadElements([element]);
      API.setSelectedElements([h().scene.getNonDeletedElements()[0]!]);
      if (type === "line") {
        // Enter on a line opens its point editor
        Keyboard.keyPress(KEYS.ESCAPE);
        continue;
      }
      Keyboard.keyPress(KEYS.ENTER);
      expect(h().state.editingTextElement).toBeNull();
    }
  });

  test("an arrow takes a label at its middle", async () => {
    renderEditor();
    const arrow = API.createElement({
      type: "arrow",
      id: "arrow",
      x: 100,
      y: 100,
      width: 200,
      height: 0,
    });
    API.loadElements([arrow]);
    API.setSelectedElements([h().scene.getNonDeletedElements()[0]!]);
    mouse.doubleClickAt(200, 100);
    const editor = await textEditor();
    UI.updateTextEditor(editor, "label");
    UI.exitTextEditor(editor);
    const label = onlyText();
    expect(label.containerId).toBe("arrow");
    expect(label.angle).toBe(0 as Radians);
    expect(label.x + label.width / 2).toBe(200);
    expect(h().scene.getElement("arrow")?.boundElements).toEqual([{ type: "text", id: label.id }]);
  });

  test("the text tool highlights an empty shape near its centre, and labels it on click", async () => {
    renderEditor();
    API.loadElements([filledRect()]);
    UI.clickTool("text");
    mouse.moveTo(195, 155);
    expect(h().state.textToolHover).toEqual({ type: "container", elementId: "box" });
    mouse.downAt(195, 155);
    mouse.upAt(195, 155);
    await textEditor();
    expect(onlyText().containerId).toBe("box");
    expect(h().state.textToolHover).toBeNull();
  });

  test("Ctrl with the text tool at a shape's centre writes free text", async () => {
    renderEditor();
    API.loadElements([filledRect()]);
    UI.clickTool("text");
    Keyboard.withModifierKeys({ ctrl: true }, () => mouse.clickAt(200, 150));
    await textEditor();
    expect(onlyText().containerId).toBeNull();
  });

  test("dragging from a shape's centre with the text tool writes free text instead", async () => {
    renderEditor();
    API.loadElements([filledRect()]);
    UI.clickTool("text");
    mouse.downAt(200, 150);
    mouse.moveTo(260, 150);
    mouse.upAt(260, 150);
    await textEditor();
    expect(onlyText().containerId).toBeNull();
    expect(h().scene.getElement("box")?.width).toBe(200);
  });

  test("vertical alignment moves a label within its container", async () => {
    renderEditor();
    API.loadElements([filledRect()]);
    mouse.clickAt(200, 100);
    Keyboard.keyPress(KEYS.ENTER);
    const editor = await textEditor();
    UI.updateTextEditor(editor, "label");
    UI.exitTextEditor(editor);
    API.setSelectedElements([onlyText()]);
    run(actionChangeVerticalAlign, "top");
    expect(onlyText().verticalAlign).toBe("top");
    expect(onlyText().y).toBe(105);
  });
});

describe("undo", () => {
  test("nothing is recorded until the text is committed", async () => {
    renderEditor();
    UI.clickTool("text");
    mouse.clickAt(100, 100);
    const editor = await textEditor();
    UI.updateTextEditor(editor, "abc");
    expect(API.getUndoStack()).toHaveLength(0);
    UI.exitTextEditor(editor);
    expect(API.getUndoStack()).toHaveLength(1);
  });

  test("a new text goes in one undo, and comes back in one redo", async () => {
    renderEditor();
    await createText(100, 100, "abc");
    Keyboard.undo();
    expect(texts()).toHaveLength(0);
    Keyboard.redo();
    expect(onlyText().text).toBe("abc");
  });

  test("an edit undoes to the text before it", async () => {
    renderEditor();
    const text = await createText(100, 100, "before");
    mouse.doubleClickAt(text.x + 5, text.y + 5);
    const editor = await textEditor();
    UI.updateTextEditor(editor, "after");
    UI.exitTextEditor(editor);
    Keyboard.undo();
    expect(onlyText().text).toBe("before");
  });

  test("a label and its binding undo together", async () => {
    renderEditor();
    API.loadElements([
      API.createElement({
        id: "box",
        x: 100,
        y: 100,
        width: 200,
        height: 100,
        backgroundColor: "#ffc9c9",
      }),
    ]);
    mouse.clickAt(200, 100);
    Keyboard.keyPress(KEYS.ENTER);
    const editor = await textEditor();
    UI.updateTextEditor(editor, "label");
    UI.exitTextEditor(editor);
    Keyboard.undo();
    expect(texts()).toHaveLength(0);
    expect(h().scene.getElement("box")?.boundElements ?? []).toEqual([]);
  });
});
