/**
 * The bucket fill tool, as Excalidraw's bucketFill tests: a click inside a
 * closed shape pours a strokeless polygon just above it, a click on that
 * fill restyles it, and the press alone changes nothing.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { COLOR_PALETTE, DEFAULT_ELEMENT_BACKGROUND_COLOR_INDEX, KEYS } from "@excalidraw/common";

import type { ExcalidrawLineElement } from "@excalidraw/element/types";

import { API, Keyboard, h, mouse, renderEditor, unmountEditors } from "./test-editor.ts";

afterEach(unmountEditors);

const elements = () => h().scene.getNonDeletedElements();

const withBox = () => {
  renderEditor();
  const box = API.createElement({
    type: "rectangle",
    id: "box",
    x: 100,
    y: 100,
    width: 200,
    height: 150,
    backgroundColor: "transparent",
  });
  API.setElements([box]);
  Keyboard.keyPress("b");
  expect(h().state.activeTool.type).toBe("bucketfill");
  // the bucket cursor, its paint in the colour it pours
  expect(h().interactiveCanvas.style.cursor).toContain(") 5 18, auto");
};

describe("bucket fill", () => {
  test("a click inside a shape fills it, above it, and the tool stays", () => {
    withBox();
    mouse.clickAt(200, 175);
    expect(elements()).toHaveLength(2);
    // under the box's outline: its own background is transparent
    const [fill, box] = elements() as [ExcalidrawLineElement, { id: string }];
    expect(box.id).toBe("box");
    expect(fill.type).toBe("line");
    expect(fill.polygon).toBe(true);
    expect(fill.strokeColor).toBe("transparent");
    // the shared background is transparent, which pours green
    expect(fill.backgroundColor).toBe(COLOR_PALETTE.green[DEFAULT_ELEMENT_BACKGROUND_COLOR_INDEX]);
    expect(fill.x).toBeCloseTo(100, 0);
    expect(fill.width).toBeCloseTo(200, 0);
    expect(h().state.activeTool.type).toBe("bucketfill");
    expect(h().state.selectedElementIds).toEqual({});
    expect(API.getUndoStack().length).toBe(1);
  });

  test("a click on its fill restyles it rather than stacking another", () => {
    withBox();
    mouse.clickAt(200, 175);
    API.setAppState({ currentItemBackgroundColor: "#ffc9c9" });
    mouse.clickAt(200, 175);
    expect(elements()).toHaveLength(2);
    expect(elements().find((element) => element.type === "line")?.backgroundColor).toBe("#ffc9c9");
  });

  test("the press alone pours nothing, and empty canvas stays quiet", () => {
    withBox();
    mouse.downAt(200, 175);
    expect(elements()).toHaveLength(1);
    mouse.upAt(200, 175);
    expect(elements()).toHaveLength(2);
    mouse.clickAt(700, 600);
    expect(elements()).toHaveLength(2);
    expect(h().state.toast).toBeNull();
  });

  test("a region it cannot close says so", () => {
    renderEditor();
    API.setElements([
      API.createElement({ type: "rectangle", id: "a", x: 100, y: 100, width: 1, height: 1 }),
    ]);
    h().api.setActiveTool({ type: "bucketfill" });
    mouse.clickAt(100.5, 100.5);
    expect(elements()).toHaveLength(1);
    expect(h().state.toast?.message).toEqual({ key: "bucketfill.noRegion" });
  });

  test("B again steps through the colours; Alt holds an eye dropper", () => {
    withBox();
    Keyboard.keyPress("b");
    const first = h().state.currentItemBackgroundColor;
    expect(first).not.toBe("transparent");
    Keyboard.keyPress("b");
    expect(h().state.currentItemBackgroundColor).not.toBe(first);
    Keyboard.keyDown(KEYS.ALT);
    const overlay = () => h().container.querySelector("[data-testid=eye-dropper-overlay]");
    expect(overlay()).not.toBeNull();
    Keyboard.keyUp(KEYS.ALT);
    expect(overlay()).toBeNull();
    expect(h().state.activeTool.type).toBe("bucketfill");
  });
});
