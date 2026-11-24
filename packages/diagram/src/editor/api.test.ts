/**
 * The imperative API under Excalidraw's names, the announcements the live
 * region reads, and the requests a text editor answers.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { KEYS } from "@excalidraw/common";
import { CaptureUpdateAction, StoreDelta } from "@excalidraw/element";

import { API, Keyboard, UI, h, mouse, renderEditor, unmountEditors } from "./test-editor.ts";
import { createPasteEvent } from "../clipboard.ts";
import { getScrollBars } from "../scene/scrollbars.ts";

import { DiagramEditor, type TextEditRequest } from "./editor.ts";
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

describe("the rest of Excalidraw's imperative API", () => {
  test("isDestroyed turns true once the editor is gone, and its getters throw", () => {
    const editor = renderEditor();
    const { api } = editor;
    expect(api.isDestroyed).toBe(false);
    editor.destroy();
    expect(api.isDestroyed).toBe(true);
    expect(() => api.getAppState()).toThrow(/isDestroyed/);
    expect(() => api.getSceneElements()).toThrow(/isDestroyed/);
    expect(() => api.onStateChange("theme")).toThrow(/isDestroyed/);
  });

  test("onEvent replays mount and initialize, and hears unmount", async () => {
    const editor = renderEditor();
    const { api } = editor;
    const heard: string[] = [];
    api.onEvent("editor:mount", ({ excalidrawAPI, container }) => {
      expect(excalidrawAPI).toBe(api);
      expect(container).toBe(editor.container);
      heard.push("mount");
    });
    await expect(api.onEvent("editor:initialize")).resolves.toBe(api);
    api.onEvent("editor:unmount", () => heard.push("unmount"));
    await Promise.resolve();
    editor.destroy();
    expect(heard).toEqual(["mount", "unmount"]);
  });

  test("applyDeltas applies an increment's delta to copies, leaving the scene", () => {
    const { api } = renderEditor();
    api.updateScene({ elements: [rect("A")], captureUpdate: CaptureUpdateAction.NEVER });
    const deltas: Parameters<typeof api.applyDeltas>[0] = [];
    api.onIncrement((increment) => {
      if ("delta" in increment) deltas.push(increment.delta);
    });
    api.updateScene({
      elements: [{ ...rect("A"), x: 300, version: 5 }],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    expect(deltas).toHaveLength(1);
    const before = api.getSceneElementsMapIncludingDeleted().get("A");
    const [elements, appState, changed] = api.applyDeltas(
      deltas.map((delta) => StoreDelta.inverse(delta)),
    );
    expect(changed).toBe(true);
    expect(elements.get("A")?.x).toBe(0);
    expect(appState).not.toBe(api.getAppState());
    expect(api.getSceneElementsMapIncludingDeleted().get("A")).toBe(before);
  });

  test("mutateElement changes an element in the scene and bumps its version", () => {
    const { api } = renderEditor();
    api.updateScene({ elements: [rect("A")] });
    const element = api.getSceneElements()[0]!;
    const { version } = element;
    api.mutateElement(element, { x: 42 });
    expect(api.getSceneElements()[0]?.x).toBe(42);
    expect(api.getSceneElements()[0]!.version).toBeGreaterThan(version);
  });

  test("getSceneElementsMapIncludingDeleted has the deleted elements too", () => {
    const { api } = renderEditor();
    api.updateScene({ elements: [rect("A"), { ...rect("B", 200), isDeleted: true }] });
    expect([...api.getSceneElementsMapIncludingDeleted().keys()]).toEqual(["A", "B"]);
  });

  test("selection selects with the group, adds, removes, clears, and skips locked ones", () => {
    const { api } = renderEditor();
    api.updateScene({
      elements: [
        { ...rect("A"), groupIds: ["g"] },
        { ...rect("B", 200), groupIds: ["g"] },
        rect("C", 400),
        { ...rect("D", 600), locked: true },
      ],
    });
    api.selection.select("A");
    expect(Object.keys(api.getAppState().selectedElementIds).toSorted()).toEqual(["A", "B"]);
    expect(api.getAppState().selectedGroupIds).toEqual({ g: true });
    api.selection.select("A", { deep: true });
    expect(Object.keys(api.getAppState().selectedElementIds)).toEqual(["A"]);
    api.selection.add(["C", "D"]);
    expect(Object.keys(api.getAppState().selectedElementIds).toSorted()).toEqual(["A", "C"]);
    api.selection.add("D", { includeLocked: true });
    expect(api.getAppState().selectedElementIds.D).toBe(true);
    api.selection.remove("C");
    expect(api.getAppState().selectedElementIds.C).toBeUndefined();
    api.selection.clear();
    expect(api.getAppState().selectedElementIds).toEqual({});
  });

  test("selection records the change for undo as captureUpdate says", () => {
    const { api } = renderEditor();
    api.updateScene({ elements: [rect("A")], captureUpdate: CaptureUpdateAction.NEVER });
    api.selection.select("A", { captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    expect(API.getUndoStack()).toHaveLength(1);
  });

  test("getName is the scene's name, the host's, or Untitled and the date", () => {
    const editor = renderEditor({ host: { name: "host-name" } });
    expect(editor.api.getName()).toBe("host-name");
    editor.api.updateScene({ appState: { name: "scene-name" } });
    expect(editor.api.getName()).toBe("scene-name");
    const bare = renderEditor();
    expect(bare.api.getName()).toMatch(/^Untitled-\d{4}-\d{2}-\d{2}-\d{4}/);
  });

  test("setViewport centres a target at once without animation", () => {
    const { api } = renderEditor();
    api.updateScene({ elements: [rect("A", 3000)] });
    api.setViewport({ target: "A", fit: "none", animation: false });
    const { scrollX, zoom, width } = api.getAppState();
    expect(Math.round(width / 2 / zoom.value - scrollX)).toBe(3050);
  });

  test("setViewport fits a box, a rect and elements, with static offsets", () => {
    const { api } = renderEditor();
    api.updateScene({ elements: [rect("A")] });
    api.setViewport({ target: [0, 0, 2048, 1536], fit: "contain", animation: false });
    expect(api.getAppState().zoom.value).toBeCloseTo(0.5);
    api.setViewport({
      target: { x: 0, y: 0, width: 512, height: 384 },
      fit: "contain",
      animation: false,
    });
    expect(api.getAppState().zoom.value).toBeCloseTo(2);
    api.setViewport({
      target: api.getSceneElements(),
      fit: "contain",
      offsets: { left: 524 },
      animation: false,
    });
    const { scrollX, zoom } = api.getAppState();
    // the element's centre is in the middle of what the offset leaves
    expect((50 + scrollX) * zoom.value).toBeCloseTo(524 + 250);
  });

  test("setViewport locks the scroll to the target, and null lifts the lock", () => {
    const { api } = renderEditor();
    api.updateScene({ elements: [rect("A")] });
    api.setViewport({
      target: [0, 0, 400, 300],
      lock: { scroll: true, zoom: true, overscroll: false },
      animation: false,
    });
    const constraints = api.getAppState().scrollConstraints;
    expect(constraints).toMatchObject({ x: 0, y: 0, width: 400, height: 300, lockScroll: true });
    expect(constraints?.overscroll).toBe(0);
    const { scrollX } = api.getAppState();
    // a pan is held to the box
    h().translateViewport((state) => ({ scrollX: state.scrollX + 5000 }));
    expect(api.getAppState().scrollX).toBe(scrollX);
    api.setViewport(null);
    expect(api.getAppState().scrollConstraints).toBeNull();
  });

  test("setViewport animates to its target", async () => {
    const { api } = renderEditor();
    api.updateScene({ elements: [rect("A", 3000)] });
    api.setViewport({ target: "A", fit: "none", animation: { duration: 50 } });
    expect(Math.round(512 - api.getAppState().scrollX)).not.toBe(3050);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(Math.round(512 - api.getAppState().scrollX)).toBe(3050);
    expect(api.getAppState().shouldCacheIgnoreZoom).toBe(false);
  });

  test("setViewport to a link whose element is gone says so", () => {
    const { api } = renderEditor();
    const page = window.location.href;
    const { happyDOM } = window as unknown as { happyDOM: { setURL(url: string): void } };
    happyDOM.setURL("https://example.com/board");
    try {
      api.setViewport({ target: "https://example.com/board?element=missing", animation: false });
    } finally {
      happyDOM.setURL(page);
    }
    expect(api.getAppState().toast?.message).toEqual({ key: "elementLink.notFound" });
  });

  test("getViewportOffsets measures the UI marked over the canvas, padded", () => {
    const { api } = renderEditor();
    const toolbar = document.createElement("div");
    toolbar.dataset.viewportUi = "top";
    toolbar.getBoundingClientRect = () =>
      ({ top: 10, bottom: 60, left: 300, right: 700, width: 400, height: 50 }) as DOMRect;
    const panel = document.createElement("div");
    panel.dataset.viewportUi = "side";
    panel.dataset.viewportUiName = "stylesPanel";
    panel.getBoundingClientRect = () =>
      ({ top: 80, bottom: 400, left: 12, right: 212, width: 200, height: 320 }) as DOMRect;
    h().container.append(toolbar, panel);
    expect(api.getViewportOffsets()).toEqual({ top: 84, right: 24, bottom: 24, left: 236 });
    expect(api.getViewportOffsets({ padding: 0, bottom: 7 })).toEqual({
      top: 60,
      right: 0,
      bottom: 7,
      left: 212,
    });
    panel.remove();
    // the hidden panel's room is kept, as last measured
    expect(api.getViewportOffsets({ padding: 0, reserve: { stylesPanel: true } }).left).toBe(212);
  });

  test("setElementRenderOverrides copies and clamps a snapshot, rejects non-finite ones, and changes nothing else", () => {
    const editor = renderEditor();
    const { api } = editor;
    api.updateScene({ elements: [rect("A")] });
    let changes = 0;
    api.onChange(() => changes++);
    const snapshot = new Map([["A", { opacity: 250, offset: { x: 10, y: 5 } }]]);
    api.setElementRenderOverrides(snapshot);
    snapshot.set("A", { opacity: 1, offset: { x: 0, y: 0 } });
    expect(editor.renderOverrides.overrides.get("A")).toEqual({
      opacity: 100,
      offset: { x: 10, y: 5 },
    });
    expect(editor.renderOverrides.offsets.get("A")).toEqual({ x: 10, y: 5 });
    expect(() => api.setElementRenderOverrides(new Map([["A", { opacity: Number.NaN }]]))).toThrow(
      TypeError,
    );
    expect(editor.renderOverrides.overrides.get("A")?.opacity).toBe(100);
    api.setElementRenderOverrides(null);
    expect(editor.renderOverrides.overrides.size).toBe(0);
    expect(changes).toBe(0);
    expect(api.getSceneElements()[0]?.x).toBe(0);
  });

  test("registerAction adds an action its key runs", () => {
    const { api } = renderEditor();
    let ran = 0;
    api.registerAction({
      name: "custom" as never,
      label: "buttons.close",
      announcement: "",
      perform: () => {
        ran++;
        return false;
      },
      keyTest: (event) => event.key === "§",
    });
    Keyboard.keyPress("§");
    expect(ran).toBe(1);
  });

  test("setToast, setCursor and resetCursor", () => {
    const editor = renderEditor();
    const { api } = editor;
    api.setToast({ message: "Saved", closable: true });
    expect(api.getAppState().toast).toEqual({ message: "Saved", closable: true });
    api.setCursor("crosshair");
    expect(editor.interactiveCanvas.style.cursor).toBe("crosshair");
    api.resetCursor();
    expect(editor.interactiveCanvas.style.cursor).not.toBe("crosshair");
  });

  test("toggleSidebar opens a sidebar on a tab, closes it again, and force decides", () => {
    const { api } = renderEditor();
    expect(api.toggleSidebar({ name: "default", tab: "library" })).toBe(true);
    expect(api.getAppState().openSidebar).toEqual({ name: "default", tab: "library" });
    expect(api.toggleSidebar({ name: "default", tab: "library" })).toBe(false);
    expect(api.getAppState().openSidebar).toBeNull();
    expect(api.toggleSidebar({ name: "custom", force: true })).toBe(true);
    expect(api.toggleSidebar({ name: "custom", force: true })).toBe(true);
    expect(api.toggleSidebar({ name: "custom", force: false })).toBe(false);
  });

  test("getEditorInterface and updateFrameRendering", () => {
    const { api } = renderEditor();
    expect(api.getEditorInterface().formFactor).toBe("desktop");
    api.updateFrameRendering({ clip: false });
    expect(api.getAppState().frameRendering).toEqual({
      enabled: true,
      clip: false,
      name: true,
      outline: true,
    });
    api.updateFrameRendering((previous) => ({ enabled: !previous.enabled }));
    expect(api.getAppState().frameRendering.enabled).toBe(false);
  });

  test("onIncrement hears durable and ephemeral increments", () => {
    const { api } = renderEditor();
    const types: string[] = [];
    const off = api.onIncrement((increment) => types.push(increment.type));
    UI.createElement("rectangle", { x: 0, width: 40 });
    expect(types).toContain("durable");
    api.updateScene({ appState: { viewBackgroundColor: "#eeeeee" } });
    expect(types).toContain("ephemeral");
    off();
    const count = types.length;
    UI.createElement("rectangle", { x: 200, width: 40 });
    expect(types).toHaveLength(count);
  });

  test("onPointerDown and onPointerUp hear a press with the tool and its state", () => {
    const { api } = renderEditor();
    const heard: string[] = [];
    api.onPointerDown((tool, state, event) => {
      heard.push(`down:${tool.type}:${state.origin.x}:${event.type}`);
    });
    api.onPointerUp((tool, state, event) => {
      heard.push(`up:${tool.type}:${state.origin.x}:${event.type}`);
    });
    api.setActiveTool({ type: "rectangle" });
    mouse.downAt(100, 100);
    mouse.moveTo(200, 200);
    mouse.upAt(200, 200);
    expect(heard).toEqual(["down:rectangle:100:pointerdown", "up:rectangle:100:pointerup"]);
  });

  test("onStateChange follows a key, keys, a selector and a predicate", async () => {
    const { api } = renderEditor();
    const heard: unknown[] = [];
    api.onStateChange("viewBackgroundColor", (value) => heard.push(value));
    api.onStateChange(["gridModeEnabled", "zenModeEnabled"], (state) =>
      heard.push(`${state.gridModeEnabled}/${state.zenModeEnabled}`),
    );
    api.onStateChange(
      (state) => state.zoom.value > 1,
      (zoomed) => heard.push(`zoomed:${zoomed}`),
      { once: true },
    );
    const next = api.onStateChange("theme");
    api.updateScene({ appState: { viewBackgroundColor: "#123456" } });
    api.updateScene({ appState: { gridModeEnabled: true } });
    api.updateScene({ appState: { zoom: { value: 2 as never } } });
    api.updateScene({ appState: { zoom: { value: 1 as never } } });
    api.updateScene({ appState: { theme: "dark" } });
    await expect(next).resolves.toBe("dark");
    expect(heard).toEqual(["#123456", "true/false", "zoomed:true"]);
    // a predicate that already holds is called at once, in a microtask
    const held: string[] = [];
    api.onStateChange({
      predicate: (state) => state.theme === "dark",
      callback: (state) => held.push(state.theme),
      once: true,
    });
    await Promise.resolve();
    expect(held).toEqual(["dark"]);
    await expect(api.onStateChange({ predicate: (state) => state.gridModeEnabled })).resolves.toBe(
      api.getAppState(),
    );
  });
});

describe("the host's options", () => {
  test("interaction false takes no input but the API's, and is view mode", () => {
    const { api } = renderEditor({ host: { interaction: false } });
    expect(api.getAppState().viewModeEnabled).toBe(true);
    Keyboard.keyPress("r");
    expect(api.getAppState().activeTool.type).toBe("selection");
    const { scrollX } = api.getAppState();
    mouse.downAt(100, 100);
    mouse.moveTo(300, 300);
    mouse.upAt(300, 300);
    expect(api.getAppState().scrollX).toBe(scrollX);
    const wheelEvent = new WheelEvent("wheel", { deltaY: 100, cancelable: true, bubbles: true });
    h().container.dispatchEvent(wheelEvent);
    expect(wheelEvent.defaultPrevented).toBe(false);
    expect(api.getAppState().scrollY).toBe(0);
    api.updateScene({ elements: [rect("A")] });
    expect(api.getSceneElements()).toHaveLength(1);
  });

  test("interaction navigation pans and zooms, nothing else", () => {
    const { api } = renderEditor({ host: { interaction: { enabled: { navigation: true } } } });
    mouse.downAt(100, 100);
    mouse.moveTo(150, 120);
    mouse.upAt(150, 120);
    expect(api.getAppState().scrollX).toBe(50);
    Keyboard.withModifierKeys({ ctrl: true }, () => Keyboard.codePress("Equal"));
    expect(api.getAppState().zoom.value).toBeGreaterThan(1);
    Keyboard.keyPress("r");
    expect(api.getAppState().activeTool.type).toBe("selection");
  });

  test("interaction tools.laser keeps the laser driven, and nothing else switches", () => {
    const editor = renderEditor({
      host: { interaction: { enabled: { tools: { laser: true } } } },
    });
    const { api } = editor;
    api.setActiveTool({ type: "rectangle" });
    expect(api.getAppState().activeTool.type).toBe("selection");
    api.setActiveTool({ type: "laser" });
    expect(api.getAppState().activeTool.type).toBe("laser");
    const pointers: string[] = [];
    api.onPointerUpdate(({ pointer, button }) => pointers.push(`${pointer.tool}:${button}`));
    mouse.downAt(100, 100);
    mouse.moveTo(150, 150);
    mouse.upAt(150, 150);
    expect(pointers).toContain("laser:down");
    // handing interaction back to none ends the laser
    editor.setHost({ interaction: false });
    expect(api.getAppState().activeTool.type).toBe("selection");
  });

  test("interaction links opens a link with a click, onLinkOpen deciding", () => {
    const opened: string[] = [];
    const editor = renderEditor({
      host: {
        interaction: { enabled: { links: true } },
        onLinkOpen: (element, event) => {
          opened.push(element.link ?? "");
          event.preventDefault();
        },
      },
    });
    editor.api.updateScene({ elements: [{ ...rect("A"), link: "https://example.com/page" }] });
    mouse.moveTo(50, 50);
    mouse.clickAt(50, 50);
    expect(opened).toEqual(["https://example.com/page"]);
  });

  test("a click on a link icon opens it in a new tab unless onLinkOpen prevents it", () => {
    const editor = renderEditor({ viewModeEnabled: true });
    editor.api.updateScene({ elements: [{ ...rect("A"), link: "https://example.com/" }] });
    const targets: string[] = [];
    const open = editor.ownerWindow.open;
    editor.ownerWindow.open = ((_url?: string, target?: string) => {
      targets.push(target ?? "");
      return null;
    }) as typeof window.open;
    try {
      mouse.moveTo(50, 50);
      mouse.clickAt(50, 50);
    } finally {
      editor.ownerWindow.open = open;
    }
    expect(targets).toEqual(["_blank"]);
  });

  test("the editor goes back to the viewModeEnabled prop once interactive again", () => {
    const editor = renderEditor({ host: { interaction: false, viewModeEnabled: false } });
    expect(editor.state.viewModeEnabled).toBe(true);
    editor.setHost({ interaction: true });
    expect(editor.state.viewModeEnabled).toBe(false);
  });

  test("activeTool forces a tool: the user and the API cannot switch from it", () => {
    const editor = renderEditor({ host: { activeTool: { type: "rectangle" } } });
    const { api } = editor;
    expect(api.getAppState().activeTool.type).toBe("rectangle");
    const warn = console.warn;
    console.warn = () => {};
    try {
      api.setActiveTool({ type: "ellipse" });
      Keyboard.keyPress("o");
    } finally {
      console.warn = warn;
    }
    expect(api.getAppState().activeTool.type).toBe("rectangle");
    // it stays after drawing, and what it draws is not selected
    UI.createElement("rectangle", { x: 0, width: 40 });
    expect(api.getAppState().activeTool.type).toBe("rectangle");
    expect(api.getAppState().activeTool.locked).toBe(false);
    editor.setHost({ activeTool: { type: "diamond" } });
    expect(api.getAppState().activeTool.type).toBe("diamond");
  });

  test("onPaste returning false keeps the paste from the editor", async () => {
    const seen: unknown[] = [];
    renderEditor({
      host: {
        onPaste: (data) => {
          seen.push(data.text);
          return false;
        },
      },
    });
    h().container.focus();
    document.dispatchEvent(createPasteEvent({ types: { "text/plain": "hello" } }));
    for (let round = 0; round < 6; round++) await new Promise((resolve) => setTimeout(resolve, 0));
    expect(seen).toEqual(["hello"]);
    expect(h().scene.getNonDeletedElements()).toHaveLength(0);
  });

  test("onDuplicate sees Ctrl+D's duplicates, changes them and can cancel", () => {
    const calls: number[] = [];
    let veto = false;
    const { api } = renderEditor({
      host: {
        onDuplicate: (next, prev, data) => {
          calls.push(next.length - prev.length);
          if (veto) return false;
          const [duplicateId] = data.duplicateElements.keys();
          return next.map((element) =>
            element.id === duplicateId ? { ...element, strokeColor: "#ff0000" } : element,
          );
        },
      },
    });
    api.updateScene({ elements: [rect("A")] });
    api.selection.select("A");
    Keyboard.withModifierKeys({ ctrl: true }, () => Keyboard.keyPress("d"));
    expect(calls).toEqual([1]);
    const [, duplicate] = api.getSceneElements();
    expect(duplicate?.strokeColor).toBe("#ff0000");
    veto = true;
    Keyboard.withModifierKeys({ ctrl: true }, () => Keyboard.keyPress("d"));
    expect(api.getSceneElements()).toHaveLength(2);
  });

  test("onDuplicate cancelling an alt-drag drags the originals instead", () => {
    const { api } = renderEditor({ host: { onDuplicate: () => false } });
    api.updateScene({ elements: [rect("A")] });
    Keyboard.withModifierKeys({ alt: true }, () => {
      mouse.downAt(50, 50);
      mouse.moveTo(250, 50);
      mouse.upAt(250, 50);
    });
    expect(api.getSceneElements().map((element) => [element.id, element.x])).toEqual([["A", 200]]);
  });

  test("onPointerDown and onPointerUp are the host's too", () => {
    const heard: string[] = [];
    const { api } = renderEditor({
      host: {
        onPointerDown: (tool) => heard.push(`down:${tool.type}`),
        onPointerUp: (tool) => heard.push(`up:${tool.type}`),
      },
    });
    api.setActiveTool({ type: "ellipse" });
    mouse.downAt(10, 10);
    mouse.upAt(60, 60);
    expect(heard).toEqual(["down:ellipse", "up:ellipse"]);
  });

  test("handleKeyboardGlobally takes the keys pressed anywhere in the page", () => {
    const { api } = renderEditor({ host: { handleKeyboardGlobally: true } });
    Keyboard.keyPress("r", document.body);
    expect(api.getAppState().activeTool.type).toBe("rectangle");
    // and once from the editor itself
    let ran = 0;
    api.onStateChange("activeTool", () => ran++);
    Keyboard.keyPress("o");
    expect(ran).toBe(1);
  });

  test("without handleKeyboardGlobally the page's keys are its own", () => {
    const { api } = renderEditor();
    Keyboard.keyPress("r", document.body);
    expect(api.getAppState().activeTool.type).toBe("selection");
  });

  test("detectScroll false leaves the offsets when the page scrolls", async () => {
    const editor = renderEditor({ host: { detectScroll: false } });
    editor.container.getBoundingClientRect = () =>
      ({
        x: 0,
        y: -40,
        left: 0,
        top: -40,
        right: 1024,
        bottom: 728,
        width: 1024,
        height: 768,
      }) as DOMRect;
    document.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(editor.state.offsetTop).toBe(0);
    editor.setHost({ detectScroll: true });
    document.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(editor.state.offsetTop).toBe(-40);
  });

  test("a container built outside the page waits for it, then follows the page's scroll", async () => {
    // A host's ref hands its container over before the container is inserted,
    // while it still belongs to the inert document it was cloned from.
    const inert = document.implementation.createHTMLDocument("");
    inert.body.innerHTML =
      "<div><canvas></canvas><canvas></canvas><canvas></canvas><svg></svg></div>";
    const container = inert.body.firstElementChild as HTMLDivElement;
    expect(container.ownerDocument).not.toBe(document);
    let top = 0;
    container.getBoundingClientRect = () =>
      (container.isConnected
        ? { x: 0, y: top, left: 0, top, right: 1024, bottom: 768 + top, width: 1024, height: 768 }
        : { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }) as DOMRect;
    const [canvas, newElementCanvas, interactiveCanvas] = container.querySelectorAll("canvas");
    const editor = new DiagramEditor({
      container,
      canvas: canvas as HTMLCanvasElement,
      newElementCanvas: newElementCanvas as HTMLCanvasElement,
      interactiveCanvas: interactiveCanvas as HTMLCanvasElement,
      svgLayer: container.querySelector("svg"),
      initialData: { elements: [rect("A", 3000)], appState: {}, files: {} },
      host: { detectScroll: true },
    });
    const sizes: number[] = [];
    editor.api.onEvent("editor:initialize", (api) => sizes.push(api.getAppState().width));
    expect(sizes).toEqual([]);
    document.body.append(container);
    await Promise.resolve();
    expect(sizes).toEqual([1024]);
    expect(editor.api.getSceneElements().map((element) => element.id)).toEqual(["A"]);

    top = -40;
    document.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(editor.state.offsetTop).toBe(-40);
    editor.destroy();
    container.remove();
  });

  test("initialState.viewport opens the scene at its target", () => {
    const { api } = renderEditor({
      initialData: { elements: [rect("A", 3000)], appState: {}, files: {} },
      initialState: { viewport: { target: "A", fit: "none" } },
    });
    const { scrollX, zoom, width } = api.getAppState();
    expect(Math.round(width / 2 / zoom.value - scrollX)).toBe(3050);
  });

  test("objectsSnapModeEnabled starts with snapping to objects", () => {
    const { api } = renderEditor({ objectsSnapModeEnabled: true });
    expect(api.getAppState().objectsSnapModeEnabled).toBe(true);
  });

  test("generateIdForFile names an inserted image's file", async () => {
    renderEditor({ host: { generateIdForFile: () => "my-file-id" } });
    h().container.focus();
    const file = new File(
      ['<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"/>'],
      "shape.svg",
      { type: "image/svg+xml" },
    );
    document.dispatchEvent(createPasteEvent({ files: [file] }));
    for (let round = 0; round < 8; round++) await new Promise((resolve) => setTimeout(resolve, 0));
    expect(Object.keys(h().getFiles())).toEqual(["my-file-id"]);
  });

  test("ownerDocument and renderEnvironment are the editor's", () => {
    let canvases = 0;
    const renderEnvironment = {
      createCanvas: () => {
        canvases++;
        return document.createElement("canvas");
      },
      createImage: () => new Image(),
    };
    const editor = renderEditor({ ownerDocument: document, renderEnvironment });
    expect(editor.ownerDocument).toBe(document);
    expect(editor.renderEnvironment).toBe(renderEnvironment);
    editor.api.updateScene({ elements: [{ ...rect("A"), link: "https://example.com/" }] });
    editor.render();
    expect(canvases).toBeGreaterThan(0);
  });

  test("renderScrollbars draws scrollbars, which a drag scrolls", () => {
    const editor = renderEditor({ host: { renderScrollbars: true } });
    editor.api.updateScene({ elements: [rect("A", 5000)] });
    editor.render();
    const { scrollX } = editor.state;
    // the horizontal bar runs along the bottom edge
    const bar = getScrollBars(
      editor.scene.getNonDeletedElementsMap() as never,
      editor.state.width,
      editor.state.height,
      editor.state,
    ).horizontal;
    expect(bar).not.toBeNull();
    mouse.downAt(bar!.x + bar!.width / 2, bar!.y + bar!.height / 2);
    mouse.moveTo(bar!.x + bar!.width / 2 + 50, bar!.y + bar!.height / 2);
    mouse.upAt(bar!.x + bar!.width / 2 + 50, bar!.y + bar!.height / 2);
    expect(editor.state.scrollX).not.toBe(scrollX);
  });
});
