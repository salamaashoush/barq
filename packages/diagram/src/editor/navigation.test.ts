/**
 * Moving around the canvas while editing: space-drag, the middle button and
 * the hand tool pan; ctrl-wheel and a pinch zoom; the wheel and Page Up and
 * Page Down scroll.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { KEYS } from "@excalidraw/common";

import {
  API,
  Keyboard,
  Pointer,
  h,
  mouse,
  renderEditor,
  unmountEditors,
  wheel,
} from "./test-editor.ts";

afterEach(unmountEditors);

function scroll() {
  return [h().state.scrollX, h().state.scrollY];
}

describe("panning", () => {
  test("dragging with space held pans and draws nothing", () => {
    renderEditor();
    Keyboard.keyPress("r");
    Keyboard.keyDown(KEYS.SPACE);
    mouse.downAt(100, 100);
    mouse.moveTo(150, 130);
    mouse.upAt(150, 130);
    Keyboard.keyUp(KEYS.SPACE);
    expect(scroll()).toEqual([50, 30]);
    expect(h().scene.getNonDeletedElements()).toHaveLength(0);
  });

  test("dragging with the middle button pans", () => {
    renderEditor();
    API.loadElements([API.createElement({ id: "A", backgroundColor: "#ffc9c9" })]);
    mouse.downAt(50, 50, 1);
    mouse.moveTo(30, 20);
    mouse.upAt(30, 20, 1);
    expect(scroll()).toEqual([-20, -30]);
    expect(h().scene.getElement("A")?.x).toBe(0);
    expect(API.getSelectedElements()).toHaveLength(0);
  });

  test("the hand tool pans", () => {
    renderEditor();
    Keyboard.keyPress("h");
    mouse.downAt(0, 0);
    mouse.moveTo(10, 10);
    mouse.upAt(10, 10);
    expect(scroll()).toEqual([10, 10]);
  });

  test("the wheel scrolls", () => {
    renderEditor();
    wheel({ deltaX: 30, deltaY: 40 });
    expect(scroll()).toEqual([-30, -40]);
  });

  test("Page Down scrolls by a page, Shift+Page Down across", () => {
    renderEditor();
    Keyboard.keyPress(KEYS.PAGE_DOWN);
    expect(scroll()).toEqual([0, -768]);
    Keyboard.withModifierKeys({ shift: true }, () => Keyboard.keyPress(KEYS.PAGE_DOWN));
    expect(scroll()).toEqual([-1024, -768]);
  });
});

describe("zooming", () => {
  test("ctrl-wheel zooms around the pointer", () => {
    renderEditor();
    wheel({ deltaY: -10, ctrlKey: true, clientX: 200, clientY: 100 });
    const { zoom, scrollX, scrollY } = h().state;
    expect(zoom.value).toBeCloseTo(1.1);
    // the scene point under the pointer stays there
    expect(200 / zoom.value - scrollX).toBeCloseTo(200);
    expect(100 / zoom.value - scrollY).toBeCloseTo(100);
  });

  test("while the wheel zooms, elements draw from their cached bitmaps", async () => {
    renderEditor();
    wheel({ deltaY: -10, ctrlKey: true, clientX: 200, clientY: 100 });
    expect(h().state.shouldCacheIgnoreZoom).toBe(true);
    wheel({ deltaY: -10, ctrlKey: true, clientX: 200, clientY: 100 });
    // crisp again once the zoom has paused
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(h().state.shouldCacheIgnoreZoom).toBe(false);
    // a pan leaves them as they are
    wheel({ deltaX: 30, clientX: 200, clientY: 100 });
    expect(h().state.shouldCacheIgnoreZoom).toBe(false);
  });

  test("a two-finger pinch zooms and leaves the scene alone", () => {
    renderEditor();
    API.loadElements([API.createElement({ id: "A", x: 0, y: 0, backgroundColor: "#ffc9c9" })]);
    const first = new Pointer("touch", 1);
    const second = new Pointer("touch", 2);
    first.downAt(400, 300);
    second.downAt(500, 300);
    second.moveTo(600, 300);
    first.upAt(400, 300);
    second.upAt(600, 300);
    expect(h().state.zoom.value).toBeCloseTo(2);
    expect(h().scene.getElement("A")?.x).toBe(0);
  });
});
