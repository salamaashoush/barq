/**
 * The editor's UI in a page: the toolbar, the properties panel, the menus
 * and the footer, driven by real events, each control's effect read back
 * from the scene.
 */

import { describe, expect, test } from "bun:test";
import { ariaViolations, screen, user, within } from "@barqjs/testing";

import { canvas, mountEditor, pointer, rectangle, select, settle } from "./test-ui.tsx";

describe("toolbar", () => {
  test("offers every tool with its key, and picking one hands the keyboard to the canvas", async () => {
    const { api, region } = await mountEditor();
    const toolbar = screen.getByRole("toolbar", { name: "Shapes" });
    for (const name of [
      "Hand (panning tool)",
      "Selection",
      "Rectangle",
      "Diamond",
      "Ellipse",
      "Arrow",
      "Line",
      "Draw",
      "Text",
      "Sticky note",
      "Eraser",
    ]) {
      expect(within(toolbar).getByRole("button", { name })).toBeDefined();
    }
    const rect = within(toolbar).getByRole("button", { name: "Rectangle" });
    expect(rect.getAttribute("title")).toBe("Rectangle — R or 2");
    expect(rect.getAttribute("aria-keyshortcuts")).toBe("R 2");
    await user.click(rect);
    await settle();
    expect(api.getAppState().activeTool.type).toBe("rectangle");
    expect(rect.getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement).toBe(region);

    // a key changes the tool, and the toolbar follows
    region.dispatchEvent(new KeyboardEvent("keydown", { key: "o", code: "KeyO", bubbles: true }));
    await settle();
    expect(
      within(toolbar).getByRole("button", { name: "Ellipse" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  test("the lock keeps the tool, and the extra tools are in a menu", async () => {
    const { api } = await mountEditor();
    const lock = screen.getByRole("button", { name: "Keep selected tool active after drawing" });
    await user.click(lock);
    await settle();
    expect(api.getAppState().activeTool.locked).toBe(true);
    expect(lock.getAttribute("aria-pressed")).toBe("true");

    await user.click(screen.getByRole("button", { name: "More tools" }));
    await settle();
    const menu = screen.getByRole("menu", { name: "More tools" });
    const items = within(menu)
      .getAllByRole("menuitem")
      .map((item) => item.textContent?.trim());
    expect(items).toEqual([
      "Insert image9",
      "Frame toolF",
      "Web Embed",
      "Draw to shapeShift+X",
      "Laser pointerK",
      "Bucket fillB",
      "Lasso selection",
      "Text to diagram",
      "Mermaid to Excalidraw",
      "Wireframe to code",
    ]);
    await user.click(within(menu).getByRole("menuitem", { name: /Frame tool/ }));
    await settle();
    expect(api.getAppState().activeTool.type).toBe("frame");
  });

  test("a sticky note dragged out of the toolbar lands where it is dropped", async () => {
    const { api, region } = await mountEditor();
    const button = screen.getByRole("button", { name: "Sticky note" });
    const original = document.elementFromPoint;
    document.elementFromPoint = () => canvas(region);
    try {
      pointer(button, "pointerdown", 500, 20);
      pointer(window as never, "pointermove", 520, 200);
      pointer(window as never, "pointermove", 400, 300);
      pointer(window as never, "pointerup", 400, 300);
      await settle();
    } finally {
      document.elementFromPoint = original;
    }
    const [note] = api.getSceneElements();
    expect(note?.type).toBe("stickynote");
    expect([note!.x + note!.width / 2, note!.y + note!.height / 2]).toEqual([400, 300]);
    // and opens for writing, as a sticky note drawn with the tool does
    await settle();
    const editing = api.getAppState().editingTextElement;
    expect(editing?.type === "text" && editing.containerId).toBe(note!.id);
    expect(api.getAppState().activeTool.type).toBe("selection");
  });
});

describe("properties panel", () => {
  test("appears for the selection and sets each property on it", async () => {
    const { api } = await mountEditor({
      initialData: { elements: [rectangle("A", 100, 100), rectangle("B", 300, 100)] },
    });
    expect(screen.queryByRole("region", { name: "Selected shape actions" })).toBeNull();
    await select(api, "A");
    const panel = screen.getByRole("region", { name: "Selected shape actions" });

    const width = within(panel).getByRole("radiogroup", { name: "Stroke width" });
    await user.click(within(width).getByRole("radio", { name: "Bold" }));
    await settle();
    expect(api.getSceneElements().find((each) => each.id === "A")?.strokeWidth).toBe(4);
    expect(
      within(width).getByRole("radio", { name: "Bold" }).getAttribute("aria-checked") ?? "",
    ).toBeDefined();

    await user.click(within(panel).getByRole("radio", { name: "Dashed" }));
    await user.click(within(panel).getByRole("radio", { name: "Cartoonist" }));
    await user.click(within(panel).getByRole("radio", { name: "Cross-hatch" }));
    await settle();
    const a = api.getSceneElements().find((each) => each.id === "A")!;
    expect([a.strokeStyle, a.roughness, a.fillStyle]).toEqual(["dashed", 2, "cross-hatch"]);

    const stroke = within(panel).getByRole("group", { name: "Stroke" });
    await user.click(within(stroke).getAllByRole("button")[2]!);
    await settle();
    expect(api.getSceneElements().find((each) => each.id === "A")?.strokeColor).not.toBe("#1e1e1e");

    await user.click(within(panel).getByRole("button", { name: /Delete/ }));
    await settle();
    expect(api.getSceneElements().map((each) => each.id)).toEqual(["B"]);
  });

  test("shows the selection's common value, none when they differ, and aligns several", async () => {
    const { api } = await mountEditor({
      initialData: {
        elements: [rectangle("A", 100, 100), rectangle("B", 300, 150, { strokeStyle: "dotted" })],
      },
    });
    await select(api, "A", "B");
    const panel = screen.getByRole("region", { name: "Selected shape actions" });
    const style = within(panel).getByRole("radiogroup", { name: "Stroke style" });
    expect(
      within(style)
        .getAllByRole("radio")
        .some((radio) => (radio as HTMLInputElement).checked),
    ).toBe(false);
    await user.click(within(panel).getByRole("button", { name: /Align top/ }));
    await settle();
    expect(api.getSceneElements().map((each) => each.y)).toEqual([100, 100]);
  });

  test("a drawing tool shows what it will draw with", async () => {
    const { region } = await mountEditor();
    region.dispatchEvent(new KeyboardEvent("keydown", { key: "a", code: "KeyA", bubbles: true }));
    await settle();
    const panel = screen.getByRole("region", { name: "Selected shape actions" });
    expect(within(panel).getByRole("radiogroup", { name: "Arrow type" })).toBeDefined();
    expect(within(panel).getAllByRole("button", { name: /Arrowheads/ })).toHaveLength(2);
  });
});

describe("context menu", () => {
  test("a right click on an element offers its actions, and runs the one chosen", async () => {
    const { api, region } = await mountEditor({
      initialData: { elements: [rectangle("A", 100, 100)] },
    });
    pointer(canvas(region), "pointerdown", 150, 150, 2);
    canvas(region).dispatchEvent(
      new MouseEvent("contextmenu", {
        clientX: 150,
        clientY: 150,
        button: 2,
        bubbles: true,
        cancelable: true,
      }),
    );
    pointer(canvas(region), "pointerup", 150, 150, 2);
    await settle();
    const menu = screen.getByTestId("context-menu");
    expect(within(menu).getByRole("menuitem", { name: /Copy styles/ })).toBeDefined();
    expect(document.activeElement?.getAttribute("role")).toMatch(/menuitem/);
    await user.click(within(menu).getByRole("menuitem", { name: /Delete/ }));
    await settle();
    expect(api.getSceneElements()).toEqual([]);
    expect(screen.queryByTestId("context-menu")).toBeNull();
  });

  test("the canvas menu ticks the toggles that are on", async () => {
    const { region } = await mountEditor();
    canvas(region).dispatchEvent(
      new MouseEvent("contextmenu", {
        clientX: 600,
        clientY: 400,
        button: 2,
        bubbles: true,
        cancelable: true,
      }),
    );
    await settle();
    const menu = screen.getByTestId("context-menu");
    const binding = within(menu).getByRole("menuitemcheckbox", { name: /Arrow binding/ });
    expect(binding.getAttribute("aria-checked")).toBe("true");
    expect(
      within(menu)
        .getByRole("menuitemcheckbox", { name: /Show grid|Toggle grid/ })
        .getAttribute("aria-checked"),
    ).toBe("false");
  });
});

describe("main menu and footer", () => {
  test("the menu toggles the theme and clears the canvas once confirmed", async () => {
    const { api } = await mountEditor({ initialData: { elements: [rectangle("A", 100, 100)] } });
    await user.click(screen.getByRole("button", { name: "Menu" }));
    await settle();
    await user.click(screen.getByRole("menuitem", { name: /Dark mode/ }));
    await settle();
    expect(api.getAppState().theme).toBe("dark");

    await user.click(screen.getByRole("button", { name: "Menu" }));
    await settle();
    await user.click(screen.getByRole("menuitem", { name: /Clear canvas/ }));
    await settle();
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain("This will clear the whole canvas");
    await user.click(within(dialog).getByRole("button", { name: "Confirm" }));
    await settle();
    expect(api.getSceneElements()).toEqual([]);
  });

  test("zoom, undo and redo", async () => {
    const { api } = await mountEditor({ initialData: { elements: [rectangle("A", 100, 100)] } });
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    await settle();
    expect(api.getAppState().zoom.value).toBeCloseTo(1.1);
    expect(screen.getByTestId("zoom-level").textContent).toBe("110%");
    await user.click(screen.getByTestId("zoom-level"));
    await settle();
    expect(Number(api.getAppState().zoom.value)).toBe(1);

    const undo = screen.getByRole<HTMLButtonElement>("button", { name: "Undo" });
    expect(undo.disabled).toBe(true);
    await select(api, "A");
    await user.click(screen.getByRole("button", { name: /Delete/ }));
    await settle();
    expect(undo.disabled).toBe(false);
    await user.click(undo);
    await settle();
    expect(api.getSceneElements()).toHaveLength(1);
  });
});

describe("accessibility", () => {
  test("every control is named, and the UI has no ARIA violations", async () => {
    const { api } = await mountEditor({ initialData: { elements: [rectangle("A", 100, 100)] } });
    await select(api, "A");
    expect(ariaViolations(document.body)).toEqual([]);
    for (const button of document.querySelectorAll("[data-testid=editor-ui] button")) {
      expect(button.getAttribute("aria-label") ?? button.textContent?.trim()).toBeTruthy();
    }
  });
});
