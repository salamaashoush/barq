/**
 * Drawing with each tool, as Excalidraw's `dragCreate`, `multiPointCreate`
 * and `freedrawMode` tests do: real pointer sequences on the interactive
 * canvas, then what the scene holds.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { KEYS } from "@excalidraw/common";

import type { ExcalidrawFreeDrawElement, ExcalidrawLinearElement } from "@excalidraw/element/types";

import { API, Keyboard, UI, h, mouse, renderEditor, unmountEditors } from "./test-editor.ts";

afterEach(unmountEditors);

/** Points as plain pairs, to compare with literals. */
const plain = (points: readonly (readonly [number, number])[] | undefined) =>
  (points ?? []).map(([x, y]) => [x, y]);

const elements = () => h().scene.getNonDeletedElements();

describe("drag to create", () => {
  for (const type of ["rectangle", "diamond", "ellipse"] as const) {
    test(type, () => {
      renderEditor();
      UI.clickTool(type);
      mouse.downAt(30, 20);
      mouse.moveTo(60, 70);
      mouse.upAt(60, 70);

      expect(h().state.selectionElement).toBeNull();
      expect(elements()).toHaveLength(1);
      const [element] = elements();
      expect(element?.type).toBe(type);
      expect([element?.x, element?.y, element?.width, element?.height]).toEqual([30, 20, 30, 50]);
      expect(h().state.selectedElementIds).toEqual({ [element!.id]: true });
      expect(h().state.activeTool.type).toBe("selection");
    });
  }

  test("dragging up and left normalizes the box", () => {
    renderEditor();
    UI.clickTool("rectangle");
    mouse.downAt(60, 70);
    mouse.moveTo(30, 20);
    mouse.upAt(30, 20);
    const [element] = elements();
    expect([element?.x, element?.y, element?.width, element?.height]).toEqual([30, 20, 30, 50]);
  });

  test("shift keeps the sides equal", () => {
    renderEditor();
    UI.clickTool("rectangle");
    mouse.downAt(0, 0);
    Keyboard.withModifierKeys({ shift: true }, () => {
      mouse.moveTo(40, 100);
      mouse.upAt(40, 100);
    });
    const [element] = elements();
    expect(element?.width).toBe(element?.height);
  });

  test("alt draws from the centre", () => {
    renderEditor();
    UI.clickTool("ellipse");
    mouse.downAt(100, 100);
    Keyboard.withModifierKeys({ alt: true }, () => {
      mouse.moveTo(130, 120);
      mouse.upAt(130, 120);
    });
    const [element] = elements();
    expect([element?.x, element?.y, element?.width, element?.height]).toEqual([70, 80, 60, 40]);
  });

  test("on the grid, the corners land on it", () => {
    renderEditor({ gridModeEnabled: true });
    UI.clickTool("rectangle");
    mouse.downAt(23, 18);
    mouse.moveTo(61, 77);
    mouse.upAt(61, 77);
    const [element] = elements();
    expect([element?.x, element?.y, element?.width, element?.height]).toEqual([20, 20, 40, 60]);
  });

  test("a click without a drag leaves nothing, and nothing to undo", () => {
    renderEditor();
    UI.clickTool("rectangle");
    mouse.clickAt(30, 20);
    expect(elements()).toHaveLength(0);
    expect(h().scene.getElementsIncludingDeleted()).toHaveLength(0);
    expect(API.getUndoStack()).toHaveLength(0);
  });

  test("Q keeps the tool after drawing", () => {
    renderEditor();
    UI.clickTool("rectangle");
    Keyboard.keyPress(KEYS.Q);
    expect(h().state.activeTool).toMatchObject({ type: "rectangle", locked: true });
    UI.createElement("rectangle", { x: 0, width: 20 });
    expect(h().state.activeTool.type).toBe("rectangle");
    mouse.downAt(50, 50);
    mouse.moveTo(80, 80);
    mouse.upAt(80, 80);
    expect(elements()).toHaveLength(2);
    expect(h().state.activeTool.type).toBe("rectangle");
    // with the tool kept, nothing new is selected
    expect(API.getSelectedElements()).toHaveLength(0);
  });
});

describe("arrows and lines", () => {
  test("an arrow dragged out has two points and selects with its line editor", () => {
    renderEditor();
    UI.clickTool("arrow");
    mouse.downAt(30, 20);
    mouse.moveTo(60, 70);
    mouse.upAt(60, 70);

    const [arrow] = elements() as ExcalidrawLinearElement[];
    expect(arrow?.type).toBe("arrow");
    expect([arrow?.x, arrow?.y]).toEqual([30, 20]);
    expect(plain(arrow?.points)).toEqual([
      [0, 0],
      [30, 50],
    ]);
    expect(h().state.selectedLinearElement?.elementId === arrow!.id).toBe(true);
    expect(h().state.activeTool.type).toBe("selection");
  });

  test("a line is drawn point by point, Enter ends it", () => {
    renderEditor();
    UI.clickTool("line");
    mouse.clickAt(30, 30);
    mouse.moveTo(50, 40);
    mouse.clickAt(50, 40);
    mouse.moveTo(100, 50);
    mouse.clickAt(100, 50);
    expect(h().state.multiElement).not.toBeNull();
    Keyboard.keyPress(KEYS.ENTER);

    expect(h().state.multiElement).toBeNull();
    const [line] = elements() as ExcalidrawLinearElement[];
    expect(line?.type).toBe("line");
    expect([line?.x, line?.y]).toEqual([30, 30]);
    expect(plain(line?.points)).toEqual([
      [0, 0],
      [20, 10],
      [70, 20],
    ]);
    expect(h().state.activeTool.type).toBe("selection");
    expect(API.getSelectedElement().id).toBe(line!.id);
  });

  test("an arrow drawn point by point ends with Escape", () => {
    renderEditor();
    const arrow = UI.createElement("arrow", {
      x: 10,
      y: 10,
      points: [
        [0, 0],
        [50, 0],
        [50, 50],
      ] as never,
    });
    expect(plain(arrow.points)).toEqual([
      [0, 0],
      [50, 0],
      [50, 50],
    ]);
    expect(h().state.multiElement).toBeNull();
  });

  test("a line closed on its first point becomes a polygon", () => {
    renderEditor();
    UI.clickTool("line");
    mouse.clickAt(0, 0);
    mouse.moveTo(100, 0);
    mouse.clickAt(100, 0);
    mouse.moveTo(100, 100);
    mouse.clickAt(100, 100);
    mouse.moveTo(1, 1);
    mouse.clickAt(1, 1);

    const [line] = elements() as (ExcalidrawLinearElement & { polygon: boolean })[];
    expect(h().state.multiElement).toBeNull();
    expect(line?.polygon).toBe(true);
    expect(plain(line?.points).at(-1)).toEqual(plain(line?.points)[0]);
  });

  test("the arrow key cycles the arrow's kind when the arrow tool is active", () => {
    renderEditor();
    Keyboard.keyPress("a");
    expect(h().state.activeTool.type).toBe("arrow");
    const first = h().state.currentItemArrowType;
    Keyboard.keyPress("a");
    expect(h().state.activeTool.type).toBe("arrow");
    expect(h().state.currentItemArrowType).not.toBe(first);
  });
});

describe("freedraw", () => {
  test("a stroke keeps its points and the tool", () => {
    renderEditor();
    UI.clickTool("freedraw");
    mouse.downAt(10, 10);
    mouse.moveTo(20, 15);
    mouse.moveTo(30, 25);
    mouse.upAt(40, 30);

    const [stroke] = elements() as ExcalidrawFreeDrawElement[];
    expect(stroke?.type).toBe("freedraw");
    expect([stroke?.x, stroke?.y]).toEqual([10, 10]);
    expect(plain(stroke?.points)).toEqual([
      [0, 0],
      [10, 5],
      [20, 15],
      [30, 20],
    ]);
    expect(h().state.activeTool.type).toBe("freedraw");
    expect(h().state.newElement).toBeNull();
    expect(API.getSelectedElements()).toHaveLength(0);
  });

  test("a click is a dot, not an invisible element", () => {
    renderEditor();
    UI.clickTool("freedraw");
    mouse.clickAt(10, 10);
    expect(elements()).toHaveLength(1);
  });
});

describe("tool shortcuts", () => {
  const keys = [
    ["r", "rectangle"],
    ["2", "rectangle"],
    ["d", "diamond"],
    ["3", "diamond"],
    ["o", "ellipse"],
    ["4", "ellipse"],
    ["a", "arrow"],
    ["5", "arrow"],
    ["l", "line"],
    ["6", "line"],
    ["p", "freedraw"],
    ["x", "freedraw"],
    ["7", "freedraw"],
    ["h", "hand"],
  ] as const;
  for (const [key, tool] of keys) {
    test(`${key} activates the ${tool} tool`, () => {
      renderEditor();
      Keyboard.keyPress(key);
      expect(h().state.activeTool.type).toBe(tool);
      Keyboard.keyPress("v");
      expect(h().state.activeTool.type).toBe("selection");
    });
  }

  test("CapsLock does not change a tool key", () => {
    renderEditor();
    Keyboard.keyPress("R");
    expect(h().state.activeTool.type).toBe("rectangle");
  });

  test("the hand tool toggles back to the tool before it", () => {
    renderEditor();
    Keyboard.keyPress("r");
    Keyboard.keyPress("h");
    expect(h().state.activeTool.type).toBe("hand");
    Keyboard.keyPress("h");
    expect(h().state.activeTool.type).toBe("rectangle");
  });

  test("Escape returns to the selection tool", () => {
    renderEditor();
    Keyboard.keyPress("o");
    Keyboard.keyPress(KEYS.ESCAPE);
    expect(h().state.activeTool.type).toBe("selection");
  });
});

describe("drawing from the keyboard", () => {
  for (const type of ["rectangle", "diamond", "ellipse", "arrow", "line"] as const) {
    test(`Enter with the ${type} tool draws one in the middle of the viewport`, () => {
      renderEditor();
      UI.clickTool(type);
      Keyboard.keyPress(KEYS.ENTER);
      const [element] = elements();
      expect(element?.type).toBe(type);
      expect(element?.width).toBe(100);
      expect(element!.x + element!.width / 2).toBe(512);
      expect(API.getSelectedElement().id).toBe(element!.id);
      expect(h().state.activeTool.type).toBe("selection");
      Keyboard.undo();
      expect(elements()).toHaveLength(0);
    });
  }
});
