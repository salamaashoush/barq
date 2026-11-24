/**
 * The imperative API under Excalidraw's names, the announcements the live
 * region reads, and the requests a text editor answers.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { KEYS } from "@excalidraw/common";
import { CaptureUpdateAction } from "@excalidraw/element";

import { API, Keyboard, UI, h, mouse, renderEditor, unmountEditors } from "./test-editor.ts";

import type { TextEditRequest } from "./editor.ts";
import type { ToolType } from "../types.ts";

afterEach(unmountEditors);

const rect = (id: string, x = 0) =>
  API.createElement({ id, x, y: 0, width: 100, height: 100, backgroundColor: "#ffc9c9" });

describe("api", () => {
  test("updateScene replaces the elements and merges the app state", () => {
    const { api } = renderEditor();
    api.updateScene({ elements: [rect("A")], appState: { viewBackgroundColor: "#fafafa" } });
    expect(api.getSceneElements().map((element) => element.id)).toEqual(["A"]);
    expect(api.getAppState().viewBackgroundColor).toBe("#fafafa");
  });

  test("updateScene with IMMEDIATELY is undoable, with NEVER not", () => {
    const { api } = renderEditor();
    api.updateScene({ elements: [rect("A")], captureUpdate: CaptureUpdateAction.NEVER });
    api.updateScene({
      elements: [rect("A"), rect("B", 200)],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    Keyboard.undo();
    expect(api.getSceneElements().map((element) => element.id)).toEqual(["A"]);
    Keyboard.undo();
    expect(api.getSceneElements().map((element) => element.id)).toEqual(["A"]);
  });

  test("deleted elements are kept, out of getSceneElements", () => {
    const { api } = renderEditor();
    api.updateScene({ elements: [rect("A"), { ...rect("B", 200), isDeleted: true }] });
    expect(api.getSceneElements()).toHaveLength(1);
    expect(api.getSceneElementsIncludingDeleted()).toHaveLength(2);
  });

  test("initialData opens the scene, its files included", () => {
    const { api } = renderEditor({
      initialData: {
        elements: [rect("A")],
        appState: { viewBackgroundColor: "#123456", gridModeEnabled: true },
        files: {},
      },
    });
    expect(api.getSceneElements()).toHaveLength(1);
    expect(api.getAppState().viewBackgroundColor).toBe("#123456");
    expect(api.getAppState().gridModeEnabled).toBe(true);
    expect(api.getFiles()).toEqual({});
  });

  test("setActiveTool switches tools, and refuses one the editor does not have", () => {
    const { api } = renderEditor();
    api.setActiveTool({ type: "ellipse" });
    expect(api.getAppState().activeTool.type).toBe("ellipse");
    const warn = console.warn;
    console.warn = () => {};
    try {
      api.setActiveTool({ type: "tape" as ToolType });
    } finally {
      console.warn = warn;
    }
    expect(api.getAppState().activeTool.type).toBe("ellipse");
  });

  test("scrollToContent centres the content", () => {
    const { api } = renderEditor();
    api.updateScene({ elements: [rect("A", 3000)] });
    api.scrollToContent();
    const { scrollX, zoom, width } = api.getAppState();
    expect((3050 + scrollX) * zoom.value).toBeCloseTo(width / 2);
  });

  test("onChange is called once per change, and unsubscribes", () => {
    const { api } = renderEditor();
    const calls: number[] = [];
    const off = api.onChange((elements) => calls.push(elements.length));
    UI.createElement("rectangle", { x: 0, width: 40 });
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.at(-1)).toBe(1);
    const count = calls.length;
    off();
    UI.createElement("rectangle", { x: 100, width: 40 });
    expect(calls).toHaveLength(count);
  });

  test("a drag calls onChange once per pointer move", () => {
    const { api } = renderEditor();
    api.updateScene({ elements: [rect("A")] });
    let calls = 0;
    api.onChange(() => calls++);
    mouse.downAt(50, 50);
    const atDown = calls;
    mouse.moveTo(60, 60);
    mouse.moveTo(70, 70);
    mouse.moveTo(80, 80);
    expect(calls - atDown).toBe(3);
    mouse.upAt(80, 80);
  });

  test("resetScene clears the scene and the history", () => {
    const { api } = renderEditor();
    UI.createElement("rectangle", { x: 0, width: 40 });
    api.resetScene();
    expect(api.getSceneElements()).toHaveLength(0);
    expect(API.getUndoStack()).toHaveLength(0);
  });
});

describe("announcements", () => {
  const listen = () => {
    const messages: string[] = [];
    h().onAnnounce((message) => messages.push(message));
    return messages;
  };

  test("tool changes", () => {
    renderEditor();
    const messages = listen();
    Keyboard.keyPress("r");
    Keyboard.keyPress("p");
    Keyboard.keyPress(KEYS.ESCAPE);
    expect(messages).toEqual(["Rectangle tool", "Draw tool", "Selection tool"]);
  });

  test("selection changes and actions", () => {
    renderEditor();
    API.loadElements([rect("A"), rect("B", 200)]);
    const messages = listen();
    mouse.clickAt(50, 50);
    expect(messages.at(-1)).toBe("Rectangle selected");
    Keyboard.withModifierKeys({ ctrl: true }, () => Keyboard.keyPress("a"));
    expect(messages).toContain("2 elements selected");
    Keyboard.withModifierKeys({ ctrl: true }, () => Keyboard.keyPress("g"));
    expect(messages).toContain("Grouped");
    Keyboard.keyPress(KEYS.ESCAPE);
    expect(messages.at(-1)).toBe("Nothing selected");
  });

  test("drawing announces the new element once, when it is done", () => {
    renderEditor();
    const messages = listen();
    UI.createElement("ellipse", { x: 0, width: 40 });
    expect(messages).toEqual(["Ellipse tool", "Selection tool", "Ellipse selected"]);
  });
});

describe("text editing requests", () => {
  test("a double-click on the canvas asks for a new text there", () => {
    renderEditor();
    const requests: TextEditRequest[] = [];
    h().onTextEditRequest((request) => requests.push(request));
    mouse.doubleClickAt(300, 200);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.element.type).toBe("text");
    expect(requests[0]?.element.x).toBe(300);
    expect([requests[0]?.sceneX, requests[0]?.sceneY]).toEqual([300, 200]);
  });

  test("Enter on a shape asks for its label", () => {
    renderEditor();
    API.loadElements([rect("A")]);
    const requests: TextEditRequest[] = [];
    h().onTextEditRequest((request) => requests.push(request));
    mouse.clickAt(50, 50);
    Keyboard.keyPress(KEYS.ENTER);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.element.containerId).toBe("A");
    expect([requests[0]?.sceneX, requests[0]?.sceneY]).toEqual([50, 50]);
  });

  test("without a text editor, nothing is created", () => {
    renderEditor({ textEditor: false });
    mouse.doubleClickAt(300, 200);
    expect(h().scene.getElementsIncludingDeleted()).toHaveLength(0);
    expect(h().state.editingTextElement).toBeNull();
  });
});
