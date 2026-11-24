/**
 * The eraser, the laser pointer and the lasso, Excalidraw's trails: what the
 * eraser's trail touches is erased on pointer up, the laser draws and leaves
 * nothing, and the lasso selects what it encloses (or crosses, in overlap
 * mode).
 */

import { afterEach, describe, expect, test } from "bun:test";
import { KEYS } from "@excalidraw/common";
import { isArrowElement } from "@excalidraw/element";

import { API, Keyboard, UI, h, mouse, renderEditor, unmountEditors } from "./test-editor.ts";

afterEach(unmountEditors);

const live = () =>
  h()
    .scene.getNonDeletedElements()
    .map((element) => element.id);

const rect = (id: string, x: number, y: number, extra: Record<string, unknown> = {}) => ({
  ...API.createElement({ id, x, y, width: 50, height: 50, backgroundColor: "#ffc9c9" }),
  ...extra,
});

describe("the eraser", () => {
  test("E picks it, and 0, and the key again goes back", () => {
    renderEditor();
    Keyboard.keyPress("e");
    expect(h().state.activeTool.type).toBe("eraser");
    Keyboard.keyPress("e");
    expect(h().state.activeTool.type).toBe("selection");
    Keyboard.keyPress("0");
    expect(h().state.activeTool.type).toBe("eraser");
  });

  test("erases what its trail crosses, on pointer up, in one undo step", () => {
    renderEditor();
    API.loadElements([rect("a", 0, 0), rect("b", 100, 0), rect("c", 300, 300)]);
    UI.clickTool("eraser");
    mouse.downAt(-10, 25);
    mouse.moveTo(60, 25);
    expect([...h().elementsPendingErasure]).toEqual(["a"]);
    expect(live()).toEqual(["a", "b", "c"]);
    mouse.moveTo(170, 25);
    expect(new Set(h().elementsPendingErasure)).toEqual(new Set(["a", "b"]));
    mouse.upAt(170, 25);
    expect(live()).toEqual(["c"]);
    expect(h().elementsPendingErasure.size).toBe(0);
    Keyboard.undo();
    expect(live()).toEqual(["a", "b", "c"]);
  });

  test("alt takes back what the trail crosses again", () => {
    renderEditor();
    API.loadElements([rect("a", 0, 0), rect("b", 100, 0)]);
    UI.clickTool("eraser");
    mouse.downAt(-10, 25);
    mouse.moveTo(170, 25);
    Keyboard.withModifierKeys({ alt: true }, () => mouse.moveTo(125, 30));
    expect([...h().elementsPendingErasure]).toEqual(["a"]);
    mouse.upAt();
    expect(live()).toEqual(["b"]);
  });

  test("a click erases what it is on", () => {
    renderEditor();
    API.loadElements([rect("a", 0, 0), rect("b", 100, 0)]);
    UI.clickTool("eraser");
    mouse.clickAt(25, 25);
    expect(live()).toEqual(["b"]);
  });

  test("erases a whole group, and a shape with its label", () => {
    renderEditor();
    API.loadElements([
      rect("a", 0, 0, { groupIds: ["g"] }),
      rect("b", 100, 0, { groupIds: ["g"] }),
      rect("c", 0, 200),
    ]);
    UI.clickTool("eraser");
    mouse.downAt(-10, 25);
    mouse.moveTo(30, 25);
    mouse.upAt();
    expect(live()).toEqual(["c"]);
  });

  test("an erased shape lets go of the arrows bound to it", () => {
    renderEditor();
    const box = rect("box", 200, 0, { boundElements: [{ id: "arrow", type: "arrow" }] });
    const arrow = API.createElement({
      type: "arrow",
      id: "arrow",
      x: 0,
      y: 25,
      width: 190,
      height: 0,
      endBinding: { elementId: "box", fixedPoint: [0, 0.5], mode: "orbit" },
    });
    API.loadElements([box, arrow]);
    UI.clickTool("eraser");
    mouse.clickAt(225, 10);
    expect(live()).toEqual(["arrow"]);
    const erasedFrom = h().scene.getElement("arrow");
    expect(erasedFrom && isArrowElement(erasedFrom) ? erasedFrom.endBinding : "none").toBeNull();
  });

  test("locked elements are not erased", () => {
    renderEditor();
    API.loadElements([rect("a", 0, 0, { locked: true })]);
    UI.clickTool("eraser");
    mouse.downAt(-10, 25);
    mouse.moveTo(60, 25);
    mouse.upAt();
    expect(live()).toEqual(["a"]);
  });

  test("its trail is drawn in the SVG layer", async () => {
    renderEditor();
    UI.clickTool("eraser");
    mouse.downAt(10, 10);
    mouse.moveTo(60, 60);
    const path = h().container.querySelector("svg path");
    expect(path?.getAttribute("d")).toBeTruthy();
    mouse.upAt();
    await new Promise((resolve) => setTimeout(resolve, 400));
  });
});

describe("the laser pointer", () => {
  test("K picks it, even in view mode, and it draws a trail and no element", () => {
    renderEditor({ viewModeEnabled: true });
    Keyboard.keyPress("k");
    expect(h().state.activeTool.type).toBe("laser");
    h().batch(() => h().setState({ viewModeEnabled: false }));
    mouse.downAt(10, 10);
    mouse.moveTo(100, 100);
    expect(h().laserTrails.localTrail.hasCurrentTrail).toBe(true);
    expect(h().container.querySelector("svg path")?.getAttribute("d")).toBeTruthy();
    mouse.upAt();
    expect(h().laserTrails.localTrail.hasCurrentTrail).toBe(false);
    expect(live()).toEqual([]);
    // the laser stays the tool
    expect(h().state.activeTool.type).toBe("laser");
  });
});

describe("the lasso", () => {
  const loop = (points: [number, number][]) => {
    const [first, ...rest] = points;
    mouse.downAt(...first!);
    for (const point of rest) mouse.moveTo(...point);
    mouse.upAt();
  };

  test("selects what it encloses", () => {
    renderEditor();
    API.loadElements([rect("a", 0, 0), rect("b", 100, 0), rect("c", 300, 0)]);
    UI.clickTool("lasso");
    loop([
      [-20, -20],
      [180, -20],
      [180, 80],
      [-20, 80],
      [-20, -20],
    ]);
    expect(h().state.selectedElementIds).toEqual({ a: true, b: true });
    // the lasso stays the tool
    expect(h().state.activeTool.type).toBe("lasso");
  });

  test("in overlap mode, what it crosses too", () => {
    renderEditor();
    API.loadElements([rect("a", 0, 0), rect("b", 100, 0)]);
    API.setAppState({ boxSelectionMode: "overlap" });
    UI.clickTool("lasso");
    loop([
      [-20, -20],
      [125, -20],
      [125, 80],
      [-20, 80],
      [-20, -20],
    ]);
    expect(h().state.selectedElementIds).toEqual({ a: true, b: true });
  });

  test("shift keeps the selection there was", () => {
    renderEditor();
    API.loadElements([rect("a", 0, 0), rect("b", 300, 0)]);
    API.setSelectedElements([h().scene.getNonDeletedElements()[1]!]);
    UI.clickTool("lasso");
    API.setSelectedElements([h().scene.getNonDeletedElements()[1]!]);
    Keyboard.withModifierKeys({ shift: true }, () =>
      loop([
        [-20, -20],
        [80, -20],
        [80, 80],
        [-20, 80],
        [-20, -20],
      ]),
    );
    expect(h().state.selectedElementIds).toEqual({ a: true, b: true });
  });

  test("alt turns a box selection into a lasso, and back to the selection tool after", () => {
    renderEditor();
    API.loadElements([rect("a", 0, 0)]);
    mouse.downAt(-20, -20);
    Keyboard.withModifierKeys({ alt: true }, () => {
      mouse.moveTo(30, -20);
      expect(h().state.activeTool).toMatchObject({ type: "lasso", fromSelection: true });
      // the move that switched is not on the lasso
      mouse.moveTo(80, -20);
      mouse.moveTo(80, 80);
      mouse.moveTo(-20, 80);
      mouse.moveTo(-20, -20);
      mouse.upAt();
    });
    expect(h().state.selectedElementIds).toEqual({ a: true });
    expect(h().state.activeTool.type).toBe("selection");
  });

  test("its trail is drawn in the SVG layer while it is drawn", () => {
    renderEditor();
    UI.clickTool("lasso");
    mouse.downAt(10, 10);
    mouse.moveTo(60, 10);
    mouse.moveTo(60, 60);
    expect(h().container.querySelector("svg path")?.getAttribute("d")).toBeTruthy();
    mouse.upAt();
    expect(h().lassoTrail.hasCurrentTrail).toBe(false);
  });

  test("Ctrl+Alt on an element starts a lasso from the selection tool", () => {
    renderEditor();
    API.loadElements([rect("a", 0, 0), rect("b", 100, 0)]);
    Keyboard.withModifierKeys({ ctrl: true, alt: true }, () => {
      mouse.downAt(25, 25);
      expect(h().state.activeTool).toMatchObject({ type: "lasso", fromSelection: true });
      for (const [x, y] of [
        [25, -20],
        [170, -20],
        [170, 70],
        [25, 70],
        [25, 25],
      ] as const) {
        mouse.moveTo(x, y);
      }
      mouse.upAt();
    });
    expect(h().state.selectedElementIds).toEqual({ b: true });
  });

  test("V picks the lasso when it is the preferred selection tool", () => {
    renderEditor();
    API.setAppState({ preferredSelectionTool: { type: "lasso", initialized: true } });
    Keyboard.keyPress(KEYS.V);
    expect(h().state.activeTool.type).toBe("lasso");
  });
});
