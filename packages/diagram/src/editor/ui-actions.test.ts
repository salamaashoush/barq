/**
 * The actions the UI drives: the properties panel's, flip, copy and paste
 * styles, the bound text actions, the polygon toggle, the canvas toggles,
 * links, and the context menu that offers them.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { CODES, KEYS, ROUNDNESS } from "@excalidraw/common";
import { newTextElement } from "@excalidraw/element";
import { pointFrom } from "@excalidraw/math";

import {
  actionBindText,
  actionUnbindText,
  actionWrapTextInContainer,
} from "./actions/bound-text.ts";
import {
  actionChangeProjectName,
  actionChangeViewBackgroundColor,
  actionClearCanvas,
} from "./actions/canvas.ts";
import { actionTogglePolygon } from "./actions/linear-editor.ts";
import { actionCopyElementLink, actionLinkToElement } from "./actions/link.ts";
import {
  actionChangeArrowType,
  actionChangeArrowhead,
  actionChangeBackgroundColor,
  actionChangeFillStyle,
  actionChangeFreedrawMode,
  actionChangeOpacity,
  actionChangeRoundness,
  actionChangeSloppiness,
  actionChangeStrokeColor,
  actionChangeStrokeStyle,
  actionChangeStrokeWidth,
  getFormValue,
} from "./actions/properties.ts";
import {
  actionToggleArrowBinding,
  actionToggleMidpointSnapping,
  actionToggleMinimap,
  actionToggleShapeSwitch,
  actionToggleShowHints,
  actionToggleTheme,
} from "./actions/toggles.ts";
import { CONTEXT_MENU_SEPARATOR, type ContextMenuItem } from "./context-menu.ts";
import { EDITOR_UI_ATTRIBUTE } from "./editor.ts";
import { API, Keyboard, h, mouse, renderEditor, unmountEditors } from "./test-editor.ts";

import type { LocalPoint } from "@excalidraw/math";
import type {
  ExcalidrawArrowElement,
  ExcalidrawLineElement,
  ExcalidrawTextElement,
} from "@excalidraw/element/types";

afterEach(unmountEditors);

const rect = (id: string, x = 0, y = 0, size = 100) =>
  API.createElement({ id, x, y, width: size, height: size });

const filled = (id: string, x = 0, y = 0, size = 100) =>
  API.createElement({ id, x, y, width: size, height: size, backgroundColor: "#ffc9c9" });

const element = (id: string) => h().scene.getElement(id)!;

const selectIds = (...ids: string[]) =>
  API.setSelectedElements(ids.map((id) => h().scene.getNonDeletedElement(id)!));

const menuNames = (): string[] =>
  ((h().state.contextMenu?.items ?? []) as ContextMenuItem[]).map((item) =>
    item === CONTEXT_MENU_SEPARATOR ? "|" : item.name,
  );

const enabledMenuNames = (): string[] =>
  ((h().state.contextMenu?.items ?? []) as ContextMenuItem[])
    .filter(
      (item): item is Exclude<ContextMenuItem, typeof CONTEXT_MENU_SEPARATOR> =>
        item !== CONTEXT_MENU_SEPARATOR && h().actionManager.isActionEnabled(item),
    )
    .map((item) => item.name);

describe("properties", () => {
  test("stroke and background colours reach the selection and the defaults", () => {
    renderEditor();
    API.loadElements([rect("A"), rect("B", 200)]);
    selectIds("A");
    API.executeAction(actionChangeStrokeColor, { color: "#e03131" });
    API.executeAction(actionChangeBackgroundColor, { color: "#a5d8ff" });
    expect([element("A").strokeColor, element("A").backgroundColor]).toEqual([
      "#e03131",
      "#a5d8ff",
    ]);
    expect(element("B").strokeColor).toBe("#1e1e1e");
    expect([h().state.currentItemStrokeColor, h().state.currentItemBackgroundColor]).toEqual([
      "#e03131",
      "#a5d8ff",
    ]);
    Keyboard.undo();
    expect(element("A").backgroundColor).toBe("transparent");
  });

  test("a background closes a line that can close into a polygon", () => {
    renderEditor();
    const line = API.createElement({
      type: "line",
      id: "L",
      points: [
        pointFrom<LocalPoint>(0, 0),
        pointFrom<LocalPoint>(100, 0),
        pointFrom<LocalPoint>(100, 100),
        pointFrom<LocalPoint>(0, 0),
      ],
    });
    API.loadElements([line]);
    selectIds("L");
    API.executeAction(actionChangeBackgroundColor, { color: "#ffc9c9" });
    const closed = element("L") as ExcalidrawLineElement;
    expect([closed.backgroundColor, closed.polygon]).toEqual(["#ffc9c9", true]);
  });

  test("fill, width, style, sloppiness, opacity and edges change the selection", () => {
    renderEditor();
    API.loadElements([rect("A")]);
    selectIds("A");
    API.executeAction(actionChangeFillStyle, "cross-hatch");
    API.executeAction(actionChangeStrokeWidth, "bold");
    API.executeAction(actionChangeStrokeStyle, "dashed");
    API.executeAction(actionChangeSloppiness, 2);
    API.executeAction(actionChangeOpacity, 40);
    API.executeAction(actionChangeRoundness, "round");
    const a = element("A");
    expect([a.fillStyle, a.strokeWidth, a.strokeStyle, a.roughness, a.opacity]).toEqual([
      "cross-hatch",
      4,
      "dashed",
      2,
      40,
    ]);
    expect(a.roundness?.type).toBe(ROUNDNESS.ADAPTIVE_RADIUS);
    expect(h().state.currentItemStrokeWidthKey).toBe("bold");
    expect(h().history.undoStack).toHaveLength(6);
  });

  test("with nothing selected they set what the next element is drawn with", () => {
    renderEditor();
    API.executeAction(actionChangeStrokeStyle, "dotted");
    API.executeAction(actionChangeSloppiness, 0);
    mouse.downAt(10, 10);
    mouse.moveTo(60, 60);
    mouse.upAt(60, 60);
    expect(h().state.activeTool.type).toBe("selection");
    Keyboard.keyPress("r");
    mouse.downAt(10, 10);
    mouse.moveTo(80, 80);
    mouse.upAt(80, 80);
    const drawn = h().scene.getNonDeletedElements().at(-1)!;
    expect([drawn.strokeStyle, drawn.roughness]).toEqual(["dotted", 0]);
  });

  test("the panel reads the selection's common value, or nothing when they differ", () => {
    renderEditor();
    API.loadElements([rect("A"), rect("B", 200)]);
    selectIds("A", "B");
    const strokeStyle = () =>
      getFormValue(
        h().scene.getElementsIncludingDeleted(),
        h(),
        (each) => each.strokeStyle,
        true,
        (hasSelection) => (hasSelection ? null : h().state.currentItemStrokeStyle),
      );
    expect(strokeStyle()).toBe("solid");
    selectIds("A");
    API.executeAction(actionChangeStrokeStyle, "dashed");
    selectIds("A", "B");
    expect(strokeStyle()).toBeNull();
  });

  test("a freehand stroke takes the pen's pressure or a constant width", () => {
    renderEditor();
    const stroke = API.createElement({ type: "freedraw", id: "F" });
    API.loadElements([stroke]);
    selectIds("F");
    API.executeAction(actionChangeFreedrawMode, "variable");
    const freedraw = element("F") as unknown as { strokeOptions?: { variability: string } };
    expect(freedraw.strokeOptions?.variability).toBe("variable");
    expect(h().state.currentItemStrokeVariability).toBe("variable");
  });

  test("arrowheads and the arrow's type", () => {
    renderEditor();
    API.loadElements([API.createElement({ type: "arrow", id: "R", width: 200, height: 100 })]);
    selectIds("R");
    API.executeAction(actionChangeArrowhead, { position: "start", type: "circle" });
    API.executeAction(actionChangeArrowhead, { position: "end", type: null });
    let arrow = element("R") as ExcalidrawArrowElement;
    expect([arrow.startArrowhead, arrow.endArrowhead]).toEqual(["circle", null]);
    API.executeAction(actionChangeArrowType, "elbow");
    arrow = element("R") as ExcalidrawArrowElement;
    expect(arrow.elbowed).toBe(true);
    expect(arrow.points.length).toBeGreaterThan(2);
    API.executeAction(actionChangeArrowType, "round");
    arrow = element("R") as ExcalidrawArrowElement;
    expect([arrow.elbowed, arrow.roundness?.type]).toEqual([false, ROUNDNESS.PROPORTIONAL_RADIUS]);
    expect(h().state.currentItemArrowType).toBe("round");
  });
});

describe("flip", () => {
  test("Shift+H and Shift+V mirror the selection in place", () => {
    renderEditor();
    API.loadElements([
      API.createElement({ type: "arrow", id: "R", x: 0, y: 0, width: 200, height: 100 }),
    ]);
    selectIds("R");
    Keyboard.withModifierKeys({ shift: true }, () => Keyboard.codePress(CODES.H));
    let arrow = element("R") as ExcalidrawArrowElement;
    expect(arrow.points.at(-1)![0]).toBeLessThan(0);
    expect([Math.round(arrow.x), Math.round(arrow.y)]).toEqual([200, 0]);
    Keyboard.withModifierKeys({ shift: true }, () => Keyboard.codePress(CODES.V));
    arrow = element("R") as ExcalidrawArrowElement;
    expect(arrow.points.at(-1)![1]).toBeLessThan(0);
  });
});

describe("styles", () => {
  test("Ctrl+Alt+C copies the selected element's styles and Ctrl+Alt+V pastes them", () => {
    renderEditor();
    API.loadElements([rect("A"), rect("B", 200)]);
    selectIds("A");
    API.executeAction(actionChangeStrokeColor, { color: "#2f9e44" });
    API.executeAction(actionChangeFillStyle, "solid");
    API.executeAction(actionChangeBackgroundColor, { color: "#b2f2bb" });
    Keyboard.withModifierKeys({ ctrl: true, alt: true }, () => Keyboard.codePress(CODES.C));
    expect(h().state.toast?.message).toEqual({ key: "toast.copyStyles" });
    selectIds("B");
    Keyboard.withModifierKeys({ ctrl: true, alt: true }, () => Keyboard.codePress(CODES.V));
    const b = element("B");
    expect([b.strokeColor, b.backgroundColor, b.fillStyle]).toEqual([
      "#2f9e44",
      "#b2f2bb",
      "solid",
    ]);
  });
});

describe("bound text", () => {
  const free = (id: string, x: number, y: number) => ({
    ...newTextElement({ x, y, text: "label" }),
    id,
  });

  test("binds a text to a shape, unbinds it, and wraps a free text in a rectangle", () => {
    renderEditor();
    API.loadElements([rect("A", 0, 0, 200), free("T", 300, 300)]);
    selectIds("A", "T");
    expect(h().actionManager.isActionEnabled(actionBindText)).toBe(true);
    API.executeAction(actionBindText);
    expect((element("T") as ExcalidrawTextElement).containerId).toBe("A");
    expect(element("A").boundElements).toEqual([{ type: "text", id: "T" }]);
    expect(Object.keys(h().state.selectedElementIds)).toEqual(["A"]);

    expect(h().actionManager.isActionEnabled(actionUnbindText)).toBe(true);
    API.executeAction(actionUnbindText);
    expect((element("T") as ExcalidrawTextElement).containerId).toBeNull();
    expect(element("A").boundElements).toEqual([]);

    selectIds("T");
    API.executeAction(actionWrapTextInContainer);
    const text = element("T") as ExcalidrawTextElement;
    const container = h().scene.getElement(text.containerId!)!;
    expect(container.type).toBe("rectangle");
    expect(h().state.selectedElementIds).toEqual({ [container.id]: true });
    const order = h()
      .scene.getNonDeletedElements()
      .map((each) => each.id);
    expect(order.indexOf(container.id)).toBe(order.indexOf("T") - 1);
  });
});

describe("polygon", () => {
  test("toggles a closed line between a polygon and a line", () => {
    renderEditor();
    API.loadElements([
      API.createElement({
        type: "line",
        id: "L",
        points: [
          pointFrom<LocalPoint>(0, 0),
          pointFrom<LocalPoint>(100, 0),
          pointFrom<LocalPoint>(100, 100),
          pointFrom<LocalPoint>(0, 0),
        ],
      }),
    ]);
    selectIds("L");
    expect(h().actionManager.isActionEnabled(actionTogglePolygon)).toBe(true);
    API.executeAction(actionTogglePolygon);
    expect((element("L") as ExcalidrawLineElement).polygon).toBe(true);
    API.executeAction(actionTogglePolygon);
    expect((element("L") as ExcalidrawLineElement).polygon).toBe(false);
  });
});

describe("canvas toggles", () => {
  test("arrow binding, midpoint snapping, hints and the minimap toggle", () => {
    renderEditor();
    API.executeAction(actionToggleArrowBinding);
    expect([h().state.bindingPreference, h().state.isBindingEnabled]).toEqual(["disabled", false]);
    expect(actionToggleArrowBinding.checked?.(h().state)).toBe(false);
    API.executeAction(actionToggleMidpointSnapping);
    expect(h().state.isMidpointSnappingEnabled).toBe(false);
    API.executeAction(actionToggleShowHints);
    expect(h().state.showHints).toBe(false);
    API.executeAction(actionToggleMinimap);
    expect(h().state.minimapEnabled).toBe(true);
  });

  test("Alt+Z, Alt+R, Alt+/ and Alt+Shift+D toggle zen mode, view mode, stats and the theme", () => {
    renderEditor();
    Keyboard.withModifierKeys({ alt: true }, () => Keyboard.keyPress("z"));
    expect(h().state.zenModeEnabled).toBe(true);
    Keyboard.withModifierKeys({ alt: true }, () => Keyboard.codePress(CODES.SLASH));
    expect(h().state.stats.open).toBe(true);
    Keyboard.withModifierKeys({ alt: true, shift: true }, () => Keyboard.codePress(CODES.D));
    expect(h().state.theme).toBe("dark");
    Keyboard.withModifierKeys({ alt: true }, () => Keyboard.codePress(CODES.R));
    expect(h().state.viewModeEnabled).toBe(true);
    // the toggles that work in view mode still do
    Keyboard.withModifierKeys({ alt: true }, () => Keyboard.codePress(CODES.R));
    expect(h().state.viewModeEnabled).toBe(false);
  });

  test("the host's theme is its own: the toggle calls back instead", () => {
    const asked: string[] = [];
    renderEditor({ host: { onThemeChange: (theme) => asked.push(theme) } });
    API.executeAction(actionToggleTheme);
    expect(asked).toEqual(["dark"]);
    expect(h().state.theme).toBe("light");
  });

  test("a mode the host controls has no toggle", () => {
    renderEditor({ host: { viewModeControlled: true, zenModeControlled: true } });
    mouse.contextMenuAt(500, 500);
    expect(menuNames()).toContain("viewMode");
    expect(enabledMenuNames()).not.toContain("viewMode");
    expect(enabledMenuNames()).not.toContain("zenMode");
  });

  test("the canvas background, clearing it, and its name", () => {
    renderEditor();
    API.loadElements([rect("A")]);
    API.executeAction(actionChangeViewBackgroundColor, { viewBackgroundColor: "#fff9db" });
    API.executeAction(actionChangeProjectName, "Plan");
    expect([h().state.viewBackgroundColor, h().state.name]).toEqual(["#fff9db", "Plan"]);
    API.executeAction(actionClearCanvas);
    expect(h().scene.getNonDeletedElements()).toEqual([]);
    expect(h().state.viewBackgroundColor).toBe("#ffffff");
    Keyboard.undo();
    expect(
      h()
        .scene.getNonDeletedElements()
        .map((each) => each.id),
    ).toEqual(["A"]);
  });

  test("the UI options turn the canvas actions off", () => {
    renderEditor({
      host: {
        UIOptions: {
          canvasActions: {
            changeViewBackgroundColor: false,
            clearCanvas: false,
            export: false,
            loadScene: false,
            saveToActiveFile: false,
            toggleTheme: false,
            saveAsImage: false,
          },
          tools: { image: true },
        },
      },
    });
    for (const action of [actionClearCanvas, actionChangeViewBackgroundColor, actionToggleTheme]) {
      expect(h().actionManager.isActionEnabled(action as never)).toBe(false);
    }
  });
});

describe("links", () => {
  test("Ctrl+K opens the link editor, and the element link editor waits for a target", () => {
    renderEditor();
    API.loadElements([rect("A")]);
    selectIds("A");
    Keyboard.withModifierKeys({ ctrl: true }, () => Keyboard.keyPress("k"));
    expect(h().state.showHyperlinkPopup).toBe("editor");
    API.executeAction(actionLinkToElement);
    expect(h().state.openDialog).toEqual({ name: "elementLinkSelector", sourceElementId: "A" });
  });

  test("copies a link to the element, through the host's generator", async () => {
    const written: string[] = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text: string) => void written.push(text) },
    });
    renderEditor({
      host: { generateLinkForSelection: (id, type) => `https://example.com/#${type}=${id}` },
    });
    API.loadElements([rect("A")]);
    selectIds("A");
    API.executeAction(actionCopyElementLink);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(written).toEqual(["https://example.com/#element=A"]);
    expect(h().state.toast?.message).toEqual({ key: "toast.elementLinkCopied" });
  });
});

describe("context menu", () => {
  test("a right click on the canvas opens the canvas menu", () => {
    renderEditor();
    mouse.contextMenuAt(500, 500);
    expect(h().state.contextMenu).toMatchObject({ top: 500, left: 500 });
    expect(menuNames().slice(0, 7)).toEqual([
      "paste",
      "|",
      "copyAsPng",
      "copyAsSvg",
      "copyText",
      "|",
      "selectAll",
    ]);
    expect(menuNames()).toContain("stats");
  });

  test("on an element it selects the element and offers the element's entries", () => {
    renderEditor();
    API.loadElements([filled("A", 100, 100)]);
    mouse.contextMenuAt(150, 150, "release");
    expect(h().state.selectedElementIds).toEqual({ A: true });
    const names = enabledMenuNames();
    for (const name of [
      "cut",
      "copy",
      "copyStyles",
      "flipHorizontal",
      "hyperlink",
      "duplicateSelection",
      "toggleElementLock",
      "deleteSelectedElements",
    ]) {
      expect(names).toContain(name);
    }
    expect(names).not.toContain("group");
    mouse.downAt(600, 600);
    expect(h().state.contextMenu).toBeNull();
  });

  test("a multi-selection offers grouping; view mode only copying", () => {
    renderEditor();
    API.loadElements([rect("A", 100, 100), rect("B", 300, 100)]);
    selectIds("A", "B");
    mouse.contextMenuAt(150, 150);
    expect(enabledMenuNames()).toContain("group");
    h().batch(() => h().setState({ contextMenu: null, viewModeEnabled: true }));
    mouse.contextMenuAt(700, 700);
    expect(menuNames()).toEqual([
      "copyAsPng",
      "copyAsSvg",
      "gridMode",
      "zenMode",
      "viewMode",
      "minimap",
      "stats",
    ]);
  });

  test("a right-button drag pans and opens no menu", () => {
    renderEditor();
    const { scrollX } = h().state;
    mouse.downAt(500, 500, 2);
    h().interactiveCanvas.dispatchEvent(
      new MouseEvent("contextmenu", { clientX: 500, clientY: 500, button: 2, bubbles: true }),
    );
    mouse.moveTo(560, 500);
    mouse.upAt(560, 500, 2);
    expect(h().state.scrollX).toBe(scrollX + 60);
    expect(h().state.contextMenu).toBeNull();
  });

  test("the menu key opens it at the selection", () => {
    renderEditor();
    API.loadElements([rect("A", 100, 100)]);
    selectIds("A");
    h().container.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    expect(h().state.contextMenu).toMatchObject({ top: 150, left: 150 });
    expect(menuNames()).toContain("deleteSelectedElements");
  });
});

describe("the UI's own keys", () => {
  test("keys a focused control moves with stay with it; shortcuts still reach the editor", () => {
    renderEditor();
    API.loadElements([rect("A", 100, 100)]);
    selectIds("A");
    const toolbar = document.createElement("div");
    toolbar.setAttribute(EDITOR_UI_ATTRIBUTE, "");
    const button = document.createElement("button");
    toolbar.append(button);
    h().container.append(toolbar);
    Keyboard.keyPress(KEYS.ARROW_RIGHT, button);
    expect(element("A").x).toBe(100);
    Keyboard.keyPress(KEYS.ENTER, button);
    expect(h().state.editingTextElement).toBeNull();
    Keyboard.keyPress("r", button);
    expect(h().state.activeTool.type).toBe("rectangle");
  });
});

describe("shape switch", () => {
  test("is offered for convertible shapes and opens its panel", () => {
    renderEditor();
    API.loadElements([rect("A")]);
    selectIds("A");
    expect(h().actionManager.isActionEnabled(actionToggleShapeSwitch)).toBe(true);
    API.executeAction(actionToggleShapeSwitch);
    expect(h().state.openPopup).toBe("convertElementType");
  });
});

describe("command palette and help", () => {
  test("Ctrl+/ and Ctrl+Shift+P open the palette, ? the help", () => {
    renderEditor();
    Keyboard.withModifierKeys({ ctrl: true }, () => Keyboard.keyPress("/"));
    expect(h().state.openDialog).toEqual({ name: "commandPalette" });
    Keyboard.withModifierKeys({ ctrl: true, shift: true }, () => Keyboard.keyPress("P"));
    expect(h().state.openDialog).toBeNull();
    Keyboard.keyPress("?");
    expect(h().state.openDialog).toEqual({ name: "help" });
  });
});
