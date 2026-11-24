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
  test("the properties fold into a button that opens them", async () => {
    size = { width: 1024, height: 768 };
    const { api } = await mountEditor({
      height: 768,
      initialData: { elements: [rectangle("A", 50, 50)] },
    });
    expect(screen.getByTestId("toolbar")).toBeDefined();
    await select(api, "A");
    expect(screen.queryByTestId("properties-panel")).toBeNull();
    await user.click(screen.getByTestId("compact-properties"));
    await settle();
    const panel = screen.getByTestId("properties-panel");
    await user.click(within(panel).getByRole("radio", { name: "Bold" }));
    await settle();
    expect(element(api, "A").strokeWidth).toBe(4);
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
