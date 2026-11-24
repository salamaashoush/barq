/**
 * The editor's layouts by its size, as Excalidraw's form factors: a phone's
 * bottom toolbar and properties sheet with touch-sized targets, a tablet's
 * compact properties, and pen mode once a pen has drawn.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ariaViolations, screen, user, within } from "@barqjs/testing";

import { canvas, mountEditor, rectangle, select, settle, setupUITests } from "./test-ui.tsx";

import type { DiagramEditorApi } from "../index.ts";

setupUITests();

let size = { width: 390, height: 760 };
let coarse = false;
const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  HTMLElement.prototype.getBoundingClientRect = function () {
    return {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: size.width,
      bottom: size.height,
      ...size,
    } as DOMRect;
  };
  window.matchMedia = (query: string) =>
    ({
      matches: coarse && query.includes("pointer: coarse"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }) as MediaQueryList;
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  size = { width: 390, height: 760 };
  coarse = false;
});

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

/** The work a library update and its drawings start, settled. */
const drain = async () => {
  for (let round = 0; round < 4; round++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await settle();
  }
};

const element = (api: DiagramEditorApi, id: string) =>
  api.getSceneElements().find((each) => each.id === id)!;

describe("phone", () => {
  test("a narrow, touched editor puts the toolbar at the bottom and its targets at a finger's size", async () => {
    coarse = true;
    const { region } = await mountEditor({ height: 760 });
    const ui = region.querySelector<HTMLElement>("[data-testid=editor-ui]")!;
    expect(ui.getAttribute("data-form-factor")).toBe("phone");
    expect(ui.hasAttribute("data-touch")).toBe(true);
    expect(screen.queryByTestId("toolbar")).toBeNull();
    const bottom = screen.getByTestId("phone-bottom-bar");
    const toolbar = within(bottom).getByTestId("phone-toolbar");
    for (const tool of ["hand", "selection", "freedraw", "eraser", "rectangle", "arrow", "text"]) {
      expect(within(toolbar).getByTestId(`toolbar-${tool}`)).toBeDefined();
    }
    expect(
      within(screen.getByTestId("phone-top-bar")).getByTestId("main-menu-trigger"),
    ).toBeDefined();
    expect(screen.queryByTestId("zoom-actions")).toBeNull();
    expect(ariaViolations(bottom)).toEqual([]);
  });

  test("a shape picked from the extra tools takes the shapes' slot", async () => {
    const { api } = await mountEditor({ height: 760 });
    await user.click(screen.getByTestId("toolbar-extra-tools"));
    await settle();
    await user.click(screen.getByTestId("toolbar-diamond"));
    await settle();
    expect(api.getAppState().activeTool.type).toBe("diamond");
    expect(
      within(screen.getByTestId("phone-toolbar")).getByTestId("toolbar-diamond"),
    ).toBeDefined();
    expect(
      within(screen.getByTestId("phone-toolbar")).queryByTestId("toolbar-rectangle"),
    ).toBeNull();
  });

  test("the selection's properties open in a sheet from the bottom, and undo is beside them", async () => {
    const { api } = await mountEditor({
      height: 760,
      initialData: { elements: [rectangle("A", 50, 50)] },
    });
    expect(screen.queryByTestId("phone-properties")).toBeNull();
    await select(api, "A");
    await user.click(screen.getByTestId("phone-properties"));
    await settle();
    const sheet = screen.getByTestId("phone-properties-drawer");
    const panel = within(sheet).getByTestId("properties-panel");
    await user.click(within(panel).getByRole("radio", { name: "Bold" }));
    await settle();
    expect(element(api, "A").strokeWidth).toBe(4);

    await user.keyboard("{Escape}");
    await settle();
    await user.click(screen.getByTestId("phone-undo"));
    await settle();
    expect(element(api, "A").strokeWidth).toBe(2);
  });

  test("the library and the search open in a sheet over the editor, which closes", async () => {
    const { api } = await mountEditor({ height: 760 });
    await user.click(screen.getByTestId("sidebar-trigger"));
    await drain();
    expect(api.getAppState().openSidebar).toEqual({ name: "default", tab: "library" });
    const sheet = screen.getByTestId("default-sidebar");
    expect(sheet.getAttribute("data-slot")).toBe("sheet-content");
    expect(sheet.getAttribute("data-side")).toBe("right");
    expect(sheet.contains(screen.getByRole("dialog", { name: "Library" }))).toBe(true);
    expect(screen.getByTestId("editor-ui").contains(sheet)).toBe(false);
    expect(within(sheet).queryByTestId("sidebar-dock")).toBeNull();
    expect(within(sheet).getByText("No items added yet...")).toBeDefined();
    expect(ariaViolations(sheet)).toEqual([]);

    await user.click(within(sheet).getByTestId("sidebar-tab-search"));
    await drain();
    expect(api.getAppState().openSidebar).toEqual({ name: "default", tab: "search" });
    expect(within(sheet).getByRole("searchbox", { name: "Find on canvas" })).toBeDefined();

    await user.click(within(sheet).getByTestId("sidebar-close"));
    await drain();
    expect(api.getAppState().openSidebar).toBeNull();
    expect(screen.queryByTestId("default-sidebar")).toBeNull();

    await user.click(screen.getByTestId("sidebar-trigger"));
    await drain();
    expect(screen.getByRole("dialog", { name: "Library" })).toBeDefined();
    await user.keyboard("{Escape}");
    await drain();
    expect(api.getAppState().openSidebar).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Library" })).toBeNull();
  });

  test("inserting a library item from the sheet closes it", async () => {
    const { api } = await mountEditor({
      height: 760,
      initialData: {
        libraryItems: [
          { id: "a", status: "unpublished", created: 1, elements: [rectangle("a-shape", 0, 0)] },
        ],
      },
    });
    await drain();
    await user.click(screen.getByTestId("sidebar-trigger"));
    await drain();
    const sheet = screen.getByRole("dialog", { name: "Library" });
    await user.click(within(sheet).getByRole("button", { name: "Library item 1" }));
    await drain();
    expect(api.getSceneElements()).toHaveLength(1);
    expect(api.getAppState().openSidebar).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Library" })).toBeNull();
  });

  test("UIOptions.getFormFactor decides the layout for the host", async () => {
    size = { width: 1280, height: 800 };
    const { region } = await mountEditor({ UIOptions: { getFormFactor: () => "phone" } });
    expect(region.querySelector("[data-testid=editor-ui]")?.getAttribute("data-form-factor")).toBe(
      "phone",
    );
    expect(screen.getByTestId("phone-toolbar")).toBeDefined();
  });
});

describe("tablet", () => {
  const tablet = async (elements: unknown[]) => {
    size = { width: 1024, height: 768 };
    return mountEditor({ height: 768, initialData: { elements: elements as never } });
  };
  const column = () => screen.getByTestId("compact-properties");
  const buttons = () =>
    [...column().querySelectorAll<HTMLElement>("button")].map(
      (button) => button.getAttribute("data-testid") ?? "",
    );

  test("the properties are a column of buttons at the top start, by what the selection takes", async () => {
    const { api } = await tablet([
      rectangle("A", 50, 50),
      rectangle("L", 300, 50, {
        type: "arrow",
        width: 100,
        height: 0,
        points: [
          [0, 0],
          [100, 0],
        ],
      }),
      { type: "text", id: "T", x: 50, y: 300, text: "Hello" },
      rectangle("F", 300, 300, {
        type: "freedraw",
        width: 10,
        height: 10,
        points: [
          [0, 0],
          [10, 10],
        ],
      }),
    ]);
    expect(screen.getByTestId("toolbar")).toBeDefined();
    expect(screen.queryByTestId("properties-panel")).toBeNull();

    await select(api, "A");
    expect(buttons()).toEqual([
      "elementStroke-picker-trigger",
      "elementBackground-picker-trigger",
      "compact-strokeStyles",
      "duplicateSelection",
      "deleteSelectedElements",
      "compact-otherProperties",
    ]);
    expect(ariaViolations(column())).toEqual([]);

    await select(api, "L");
    expect(buttons()).toEqual([
      "elementStroke-picker-trigger",
      "compact-strokeStyles",
      "compact-arrowProperties",
      "toggleLinearEditor",
      "duplicateSelection",
      "deleteSelectedElements",
      "compact-otherProperties",
    ]);

    await select(api, "T");
    expect(buttons()).toEqual([
      "elementStroke-picker-trigger",
      "compact-strokeStyles",
      "font-family-show-fonts",
      "compact-textProperties",
      "duplicateSelection",
      "deleteSelectedElements",
      "compact-otherProperties",
    ]);

    await select(api, "F");
    expect(buttons()).toContain("compact-pressure");
    const variability = () =>
      (element(api, "F") as { strokeOptions?: { variability?: string } }).strokeOptions
        ?.variability;
    const before = variability();
    await user.click(screen.getByTestId("compact-pressure"));
    await settle();
    expect(variability()).toBe(before === "variable" ? "constant" : "variable");
    await user.click(screen.getByTestId("compact-pressure"));
    await settle();
    expect(variability()).toBe(before);
  });

  test("each button opens its own section, one at a time", async () => {
    const { api } = await tablet([
      rectangle("A", 50, 50),
      rectangle("L", 300, 50, {
        type: "arrow",
        width: 100,
        height: 0,
        points: [
          [0, 0],
          [100, 0],
        ],
      }),
      { type: "text", id: "T", x: 50, y: 300, text: "Hello" },
    ]);
    await select(api, "A");
    await user.click(screen.getByTestId("compact-strokeStyles"));
    await settle();
    expect(api.getAppState().openPopup).toBe("compactStrokeStyles");
    let popover = screen.getByTestId("compactStrokeStyles-popover");
    expect(within(popover).getByTestId("fill-style")).toBeDefined();
    expect(within(popover).getByTestId("sloppiness")).toBeDefined();
    await user.click(within(popover).getByRole("radio", { name: "Bold" }));
    await settle();
    expect(element(api, "A").strokeWidth).toBe(4);

    await user.click(screen.getByTestId("elementStroke-picker-trigger"));
    await settle();
    expect(api.getAppState().openPopup).toBe("elementStroke");
    expect(screen.queryByTestId("compactStrokeStyles-popover")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Color picker" })).toBeDefined();

    await user.click(screen.getByTestId("compact-otherProperties"));
    await settle();
    expect(api.getAppState().openPopup).toBe("compactOtherProperties");
    expect(screen.queryByRole("dialog", { name: "Color picker" })).toBeNull();
    popover = screen.getByTestId("compactOtherProperties-popover");
    expect(within(popover).getByRole("group", { name: "Layers" })).toBeDefined();
    expect(within(popover).getByRole("button", { name: "Group selection" })).toBeDefined();
    expect(within(popover).queryByRole("button", { name: "Duplicate" })).toBeNull();

    await select(api, "L");
    await user.click(screen.getByTestId("compact-arrowProperties"));
    await settle();
    popover = screen.getByTestId("compactArrowProperties-popover");
    expect(within(popover).getByRole("group", { name: "Arrowheads" })).toBeDefined();
    await user.click(within(popover).getByRole("radio", { name: "Elbow arrow" }));
    await settle();
    expect((element(api, "L") as { elbowed?: boolean }).elbowed).toBe(true);

    await select(api, "T");
    await user.click(screen.getByTestId("compact-textProperties"));
    await settle();
    expect(api.getAppState().openPopup).toBe("compactTextProperties");
    expect(screen.queryByTestId("compactArrowProperties-popover")).toBeNull();
    popover = screen.getByTestId("compactTextProperties-popover");
    await user.click(within(popover).getByRole("radio", { name: "Large" }));
    await settle();
    expect((element(api, "T") as { fontSize?: number }).fontSize).toBe(28);
    expect(within(popover).getByTestId("text-align")).toBeDefined();
  });

  test("the column is reached by Tab, Enter opens a section and Escape closes it", async () => {
    const { api } = await tablet([rectangle("A", 50, 50)]);
    await select(api, "A");
    const styles = screen.getByTestId("compact-strokeStyles");
    screen.getByTestId("elementBackground-picker-trigger").focus();
    await user.tab();
    expect(document.activeElement?.getAttribute("data-testid")).toBe("compact-strokeStyles");
    await user.keyboard("{Enter}");
    await settle();
    expect(api.getAppState().openPopup).toBe("compactStrokeStyles");
    const popover = screen.getByTestId("compactStrokeStyles-popover");
    expect(popover.contains(document.activeElement)).toBe(true);
    await user.keyboard("{Escape}");
    await settle();
    await frame();
    await frame();
    expect(api.getAppState().openPopup).toBeNull();
    expect(screen.queryByTestId("compactStrokeStyles-popover")).toBeNull();
    expect(document.activeElement === styles).toBe(true);
    await user.tab();
    expect(document.activeElement === screen.getByTestId("duplicateSelection")).toBe(true);
  });
});

describe("pen mode", () => {
  test("a pen turns pen mode on and shows its toggle, which turns it off", async () => {
    size = { width: 1280, height: 800 };
    const { api, region } = await mountEditor();
    expect(screen.queryByTestId("pen-mode")).toBeNull();
    canvas(region).dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerId: 3,
        pointerType: "pen",
        clientX: 300,
        clientY: 300,
        button: 0,
        buttons: 1,
        bubbles: true,
      }),
    );
    canvas(region).dispatchEvent(
      new PointerEvent("pointerup", {
        pointerId: 3,
        pointerType: "pen",
        clientX: 300,
        clientY: 300,
        bubbles: true,
      }),
    );
    await settle();
    expect(api.getAppState().penDetected).toBe(true);
    const toggle = screen.getByTestId("pen-mode");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    await user.click(toggle);
    await settle();
    expect(api.getAppState().penMode).toBe(false);
  });
});
