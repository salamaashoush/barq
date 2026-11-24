/**
 * Touch input: a double tap writes text, a pinch keeps the selection it
 * started with, and a long press opens the context menu.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { TAP_TWICE_TIMEOUT, TOUCH_CTX_MENU_TIMEOUT } from "@excalidraw/common";
import { newEmbeddableElement } from "@excalidraw/element";

import { API, Pointer, h, mouse, renderEditor, unmountEditors } from "./test-editor.ts";

afterEach(unmountEditors);

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Sends a touch event at the interactive canvas with the fingers still down. */
const touch = (type: "touchstart" | "touchend" | "touchmove", fingers: [number, number][]) => {
  const canvas = h().interactiveCanvas;
  const touches = fingers.map(
    ([clientX, clientY], identifier) => new Touch({ identifier, target: canvas, clientX, clientY }),
  );
  canvas.dispatchEvent(new TouchEvent(type, { touches, bubbles: true, cancelable: true }));
};

/** A one-finger tap as a touch screen sends it: pointer and touch events interleaved. */
const tap = (finger: Pointer, x: number, y: number) => {
  finger.downAt(x, y);
  touch("touchstart", [[x, y]]);
  finger.upAt(x, y);
  touch("touchend", []);
};

describe("double tap", () => {
  test("a second tap near the first writes text there and clears the selection", () => {
    renderEditor();
    API.loadElements([API.createElement({ id: "A", x: 600, y: 600 })]);
    API.setSelectedElements([h().scene.getElement("A")!]);
    const finger = new Pointer("touch");
    tap(finger, 100, 100);
    tap(finger, 110, 120);
    expect(h().state.editingTextElement?.type).toBe("text");
    expect(h().state.selectedElementIds).toEqual({});
  });

  test("a second tap further than the threshold writes nothing, and starts no new pair", () => {
    renderEditor();
    const finger = new Pointer("touch");
    tap(finger, 100, 100);
    tap(finger, 100, 136);
    expect(h().state.editingTextElement).toBeNull();
    tap(finger, 100, 136);
    expect(h().state.editingTextElement).toBeNull();
    tap(finger, 100, 136);
    expect(h().state.editingTextElement?.type).toBe("text");
  });

  test("taps further apart in time than a double tap write nothing", async () => {
    renderEditor();
    const finger = new Pointer("touch");
    tap(finger, 100, 100);
    await wait(TAP_TWICE_TIMEOUT + 50);
    tap(finger, 100, 100);
    expect(h().state.editingTextElement).toBeNull();
  });

  test("a second touch with two fingers is a pinch, not a double tap", () => {
    renderEditor();
    tap(new Pointer("touch"), 100, 100);
    touch("touchstart", [
      [100, 100],
      [200, 100],
    ]);
    touch("touchend", []);
    expect(h().state.editingTextElement).toBeNull();
  });
});

describe("two fingers", () => {
  test("a pinch clears the selection and restores it when a finger lifts", () => {
    renderEditor();
    API.loadElements([API.createElement({ id: "A", x: 600, y: 600 })]);
    API.setSelectedElements([h().scene.getElement("A")!]);
    const first = new Pointer("touch", 1);
    const second = new Pointer("touch", 2);
    // the first finger lands on the canvas: the selection clears, and is kept
    first.downAt(100, 100);
    touch("touchstart", [[100, 100]]);
    expect(h().state.selectedElementIds).toEqual({});
    expect(h().state.previousSelectedElementIds).toEqual({ A: true });
    second.downAt(200, 100);
    touch("touchstart", [
      [100, 100],
      [200, 100],
    ]);
    expect(h().state.selectedElementIds).toEqual({});
    second.upAt(200, 100);
    touch("touchend", [[100, 100]]);
    expect(h().state.selectedElementIds).toEqual({ A: true });
    expect(h().state.previousSelectedElementIds).toEqual({});
  });

  test("a pinch begun on another element restores the selection from before it", () => {
    renderEditor();
    API.loadElements([
      API.createElement({ id: "A", x: 600, y: 600 }),
      API.createElement({ id: "B", x: 100, y: 100, backgroundColor: "#ffc9c9" }),
    ]);
    API.setSelectedElements([h().scene.getElement("A")!]);
    new Pointer("touch", 1).downAt(150, 150);
    touch("touchstart", [[150, 150]]);
    expect(h().state.selectedElementIds).toEqual({ B: true });
    new Pointer("touch", 2).downAt(300, 150);
    touch("touchstart", [
      [150, 150],
      [300, 150],
    ]);
    expect(h().state.selectedElementIds).toEqual({});
    touch("touchend", [[150, 150]]);
    expect(h().state.selectedElementIds).toEqual({ A: true });
  });

  test("a second finger deactivates an active embeddable", () => {
    renderEditor();
    const embed = newEmbeddableElement({
      type: "embeddable",
      x: 600,
      y: 600,
      width: 300,
      height: 150,
    });
    API.setElements([embed]);
    h().batch(() => h().setState({ activeEmbeddable: { element: embed, state: "active" } }));
    touch("touchstart", [[100, 100]]);
    touch("touchstart", [
      [100, 100],
      [200, 100],
    ]);
    expect(h().state.activeEmbeddable).toBeNull();
  });

  test("lifting the last finger ends the gesture", () => {
    renderEditor();
    const first = new Pointer("touch", 1);
    const second = new Pointer("touch", 2);
    first.downAt(400, 300);
    second.downAt(500, 300);
    touch("touchend", []);
    // the finger left from the ended gesture no longer pinches
    second.moveTo(600, 300);
    expect(h().state.zoom.value).toBeCloseTo(1);
  });
});

describe("long press", () => {
  test("a touch held still opens the context menu where it is", async () => {
    renderEditor();
    const finger = new Pointer("touch");
    finger.downAt(300, 200);
    touch("touchstart", [[300, 200]]);
    expect(h().state.contextMenu).toBeNull();
    await wait(TOUCH_CTX_MENU_TIMEOUT + 50);
    expect(h().state.contextMenu).toMatchObject({ top: 200, left: 300 });
  });

  test("a held touch on an element selects it and opens the element menu", async () => {
    renderEditor();
    API.loadElements([API.createElement({ id: "A", x: 100, y: 100, backgroundColor: "#ffc9c9" })]);
    new Pointer("touch").downAt(150, 150);
    await wait(TOUCH_CTX_MENU_TIMEOUT + 50);
    expect(h().state.selectedElementIds).toEqual({ A: true });
    expect(h().state.contextMenu?.items.length).toBeGreaterThan(0);
  });

  test("lifting the finger before the timeout opens no menu", async () => {
    renderEditor();
    const finger = new Pointer("touch");
    finger.downAt(300, 200);
    touch("touchstart", [[300, 200]]);
    finger.upAt(300, 200);
    touch("touchend", []);
    await wait(TOUCH_CTX_MENU_TIMEOUT + 50);
    expect(h().state.contextMenu).toBeNull();
  });

  test("a moving finger opens no menu", async () => {
    renderEditor();
    new Pointer("touch").downAt(300, 200);
    touch("touchstart", [[300, 200]]);
    touch("touchmove", [[320, 200]]);
    await wait(TOUCH_CTX_MENU_TIMEOUT + 50);
    expect(h().state.contextMenu).toBeNull();
  });

  test("a pinch opens no menu", async () => {
    renderEditor();
    new Pointer("touch", 1).downAt(300, 200);
    touch("touchstart", [[300, 200]]);
    new Pointer("touch", 2).downAt(400, 200);
    touch("touchstart", [
      [300, 200],
      [400, 200],
    ]);
    touch("touchmove", [
      [290, 200],
      [410, 200],
    ]);
    await wait(TOUCH_CTX_MENU_TIMEOUT + 50);
    expect(h().state.contextMenu).toBeNull();
  });

  test("a mouse held still opens no menu", async () => {
    renderEditor();
    mouse.downAt(300, 200);
    await wait(TOUCH_CTX_MENU_TIMEOUT + 50);
    expect(h().state.contextMenu).toBeNull();
  });

  test("a held touch with a drawing tool opens no menu", async () => {
    renderEditor();
    h().batch(() => h().setActiveTool({ type: "rectangle" }));
    new Pointer("touch").downAt(300, 200);
    await wait(TOUCH_CTX_MENU_TIMEOUT + 50);
    expect(h().state.contextMenu).toBeNull();
  });

  test("an unmounted editor opens no menu", async () => {
    renderEditor();
    const editor = h();
    new Pointer("touch").downAt(300, 200);
    unmountEditors();
    await wait(TOUCH_CTX_MENU_TIMEOUT + 50);
    expect(editor.state.contextMenu).toBeNull();
  });
});
