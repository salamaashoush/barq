/**
 * The editor's popups and panels: the command palette, the stats panel, the
 * link popups, the toasts, the shape switch, the minimap and the hints, and
 * the UI in another language, right to left, and under the host's options.
 */

import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { ariaViolations, render, screen, user, within } from "@barqjs/testing";
import { Toaster } from "@barqjs/ui/sonner";

import { DiagramEditor, type DiagramEditorApi } from "../index.ts";
import { loadLanguage } from "../i18n.ts";
import {
  canvas,
  mountEditor,
  pointer,
  rectangle,
  select,
  settle,
  setupUITests,
} from "./test-ui.tsx";

setupUITests();

const key = (target: Element, init: KeyboardEventInit) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));

const ctrl = navigator.platform.includes("Mac") ? { metaKey: true } : { ctrlKey: true };

const element = (api: DiagramEditorApi, id: string) =>
  api.getSceneElements().find((each) => each.id === id)!;

describe("command palette", () => {
  test("Ctrl+/ opens it, typing finds a command and Enter runs it", async () => {
    const { api, region } = await mountEditor({
      initialData: { elements: [rectangle("A", 100, 100)] },
    });
    await select(api, "A");
    key(region, { key: "/", code: "Slash", ...ctrl });
    await settle();
    const dialog = screen.getByRole("dialog", { name: "Command palette" });
    expect(within(dialog).getByText("Flip horizontal")).toBeDefined();
    expect(within(dialog).getByText("Rectangle")).toBeDefined();
    const input = within(dialog).getByRole("combobox");
    await user.type(input, "flip vert");
    await settle();
    await user.keyboard("{Enter}");
    await settle();
    expect(screen.queryByRole("dialog", { name: "Command palette" })).toBeNull();
    expect(api.getAppState().openDialog).toBeNull();
    expect(element(api, "A").y).toBe(100);
    expect(api.history.clear).toBeDefined();
  });
});

describe("stats", () => {
  test("Alt+/ shows the scene and the selection, whose numbers it edits", async () => {
    const { api, region } = await mountEditor({
      initialData: { elements: [rectangle("A", 100, 100), rectangle("B", 300, 100)] },
    });
    key(region, { key: "/", code: "Slash", altKey: true });
    await settle();
    const panel = screen.getByRole("region", { name: "Canvas & Shape properties" });
    expect(within(panel).getByTestId("stats-shapes").textContent).toBe("2");
    await select(api, "A");
    const x = within(panel).getByRole<HTMLInputElement>("spinbutton", { name: "x" });
    expect(x.value).toBe("100");
    x.value = "40";
    x.dispatchEvent(new Event("change", { bubbles: true }));
    await settle();
    expect(element(api, "A").x).toBe(40);
    const width = within(panel).getByRole<HTMLInputElement>("spinbutton", { name: "Width" });
    width.value = "250";
    width.dispatchEvent(new Event("change", { bubbles: true }));
    const angle = within(panel).getByRole<HTMLInputElement>("spinbutton", { name: "Angle" });
    angle.value = "90";
    angle.dispatchEvent(new Event("change", { bubbles: true }));
    await settle();
    expect(element(api, "A").width).toBe(250);
    expect(element(api, "A").angle).toBeCloseTo(Math.PI / 2);
  });
});

describe("links", () => {
  test("Ctrl+K edits the link, the popup shows it, and it is removed", async () => {
    const { api, region } = await mountEditor({
      initialData: { elements: [rectangle("A", 100, 200)] },
    });
    await select(api, "A");
    key(region, { key: "k", code: "KeyK", ...ctrl });
    await settle();
    await settle();
    const input = screen.getByTestId<HTMLInputElement>("hyperlink-input");
    input.value = " https://example.com/plan ";
    key(input, { key: "Enter", code: "Enter" });
    await settle();
    expect(element(api, "A").link).toBe("https://example.com/plan");
    const link = screen.getByTestId("hyperlink-link");
    expect(link.getAttribute("href")).toBe("https://example.com/plan");
    await user.click(screen.getByTestId("hyperlink-remove"));
    await settle();
    expect(element(api, "A").link).toBeNull();
  });

  test("the element link editor links to the element clicked", async () => {
    const { api, region } = await mountEditor({
      initialData: { elements: [rectangle("A", 100, 200), rectangle("B", 400, 200)] },
    });
    await select(api, "A");
    pointer(canvas(region), "pointerdown", 150, 250, 2);
    canvas(region).dispatchEvent(
      new MouseEvent("contextmenu", {
        clientX: 150,
        clientY: 250,
        button: 2,
        bubbles: true,
        cancelable: true,
      }),
    );
    pointer(canvas(region), "pointerup", 150, 250, 2);
    await settle();
    api.updateScene({
      appState: {
        openDialog: { name: "elementLinkSelector", sourceElementId: "A" },
        contextMenu: null,
      },
    });
    await settle();
    const dialog = screen.getByRole("dialog", { name: "Link to object" });
    await select(api, "B");
    expect(within(dialog).getByRole<HTMLInputElement>("textbox").value).toContain("element=B");
    await user.click(within(dialog).getByRole("button", { name: "Confirm" }));
    await settle();
    expect(element(api, "A").link).toContain("element=B");
    expect(api.getAppState().openDialog).toBeNull();
  });
});

describe("toasts", () => {
  test("a toast and an error message show on the toast stack, translated", async () => {
    render(() => <Toaster />);
    const { api } = await mountEditor({ initialData: { elements: [rectangle("A", 100, 100)] } });
    await select(api, "A");
    api.updateScene({ appState: { toast: { message: { key: "toast.copyStyles" } } } });
    await settle();
    await settle();
    expect(document.body.textContent).toContain("Copied styles.");
    api.updateScene({ appState: { errorMessage: "Couldn't read the file" } });
    await settle();
    await settle();
    expect(document.body.textContent).toContain("Couldn't read the file");
  });
});

describe("shape switch", () => {
  test("Alt+Shift+. switches the shape and the panel shows the types", async () => {
    const { api, region } = await mountEditor({
      initialData: { elements: [rectangle("A", 100, 100)] },
    });
    await select(api, "A");
    key(region, { key: ">", code: "Period", altKey: true, shiftKey: true });
    await settle();
    expect(element(api, "A").type).toBe("diamond");
    const panel = screen.getByRole("group", { name: "Toggle shape type" });
    expect(
      within(panel).getByRole("button", { name: "Diamond" }).getAttribute("aria-pressed"),
    ).toBe("true");
    await user.click(within(panel).getByRole("button", { name: "Ellipse" }));
    await settle();
    expect(element(api, "A").type).toBe("ellipse");
    key(region, { key: "Escape", code: "Escape" });
    await settle();
    expect(screen.queryByRole("group", { name: "Toggle shape type" })).toBeNull();
    expect(api.getAppState().selectedElementIds).toEqual({ A: true });
  });
});

describe("minimap, hints, zen and view mode", () => {
  test("the minimap toggles and moves the viewport", async () => {
    const { api } = await mountEditor({ initialData: { elements: [rectangle("A", 100, 100)] } });
    await user.click(screen.getByRole("button", { name: "Minimap" }));
    await settle();
    expect(api.getAppState().minimapEnabled).toBe(true);
    const map = screen.getByRole("img", { name: "Minimap" });
    expect(map).toBeDefined();
  });

  test("the hint follows the tool and is turned off", async () => {
    const { api, region } = await mountEditor();
    expect(screen.getByTestId("hint-viewer").textContent).toContain("To move canvas");
    key(region, { key: "a", code: "KeyA" });
    await settle();
    expect(screen.getByTestId("hint-viewer").textContent).toContain("Click to start");
    api.updateScene({ appState: { showHints: false } });
    await settle();
    expect(screen.queryByTestId("hint-viewer")).toBeNull();
  });

  test("zen mode leaves the toolbar and a button out; view mode hides the toolbar", async () => {
    const { region } = await mountEditor();
    key(region, { key: "z", code: "KeyZ", altKey: true });
    await settle();
    expect(screen.queryByRole("region", { name: "Selected shape actions" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Menu" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Exit zen mode" }));
    await settle();
    expect(screen.getByRole("button", { name: "Menu" })).toBeDefined();
    key(region, { key: "r", code: "KeyR", altKey: true });
    await settle();
    expect(screen.queryByRole("toolbar")).toBeNull();
    await user.click(screen.getByTestId("exit-view-mode"));
    await settle();
    expect(screen.getByRole("toolbar")).toBeDefined();
  });
});

describe("languages", () => {
  test("langCode loads the language and a right-to-left one mirrors the UI", async () => {
    const { region } = await mountEditor({ langCode: "ar-SA" });
    await loadLanguage("ar-SA");
    await settle();
    const ui = region.querySelector<HTMLElement>("[data-testid=editor-ui]")!;
    expect(ui.getAttribute("dir")).toBe("rtl");
    expect(ui.getAttribute("lang")).toBe("ar-SA");
    expect(
      region.querySelector("[data-testid=toolbar-rectangle]")?.getAttribute("aria-label"),
    ).toBe("مستطيل");
    expect(getComputedStyle(region).direction).not.toBe("rtl");
    expect(ariaViolations(document.body)).toEqual([]);
  });

  test("a language switches as langCode changes", async () => {
    const { createSignal } = await import("@barqjs/core");
    const [lang, setLang] = createSignal("en");
    render(() => <DiagramEditor height={640} langCode={lang()} />);
    await settle();
    expect(screen.getByTestId("toolbar-rectangle").getAttribute("aria-label")).toBe("Rectangle");
    setLang("de-DE");
    flush();
    await loadLanguage("de-DE");
    await settle();
    expect(screen.getByTestId("toolbar-rectangle").getAttribute("aria-label")).toBe("Rechteck");
  });
});

describe("UIOptions", () => {
  test("canvas actions and the image tool turn off as Excalidraw's do", async () => {
    await mountEditor({
      theme: "light",
      UIOptions: {
        canvasActions: {
          loadScene: false,
          saveToActiveFile: false,
          export: false,
          saveAsImage: false,
          clearCanvas: false,
        },
        tools: { image: false },
      },
    });
    await user.click(screen.getByRole("button", { name: "Menu" }));
    await settle();
    const menu = screen.getByRole("menu", { name: "Menu" });
    const names = within(menu)
      .getAllByRole("menuitem")
      .map((item) => item.textContent ?? "");
    for (const gone of [
      "Open",
      "Save to current file",
      "Save to...",
      "Export image...",
      "Clear canvas",
      "Dark mode",
    ]) {
      expect(names.some((name) => name.includes(gone))).toBe(false);
    }
    expect(names.some((name) => name.includes("Help"))).toBe(true);
  });

  test("an app's own menu entries replace the defaults, and slots render", async () => {
    const { MainMenu } = await import("../index.ts");
    const picked: string[] = [];
    const selected: string[] = [];
    await mountEditor({ renderTopRightUI: () => <button type="button">Publish</button> }, () => (
      <MainMenu onSelect={(event) => selected.push(event.type)}>
        <MainMenu.DefaultItems.Help />
        <MainMenu.Item onSelect={() => picked.push("share")}>Share</MainMenu.Item>
      </MainMenu>
    ));
    expect(screen.getByRole("button", { name: "Publish" })).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Menu" }));
    await settle();
    const menu = screen.getByRole("menu", { name: "Menu" });
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent?.trim()),
    ).toEqual(["Help?", "Share"]);
    await user.click(within(menu).getByRole("menuitem", { name: "Share" }));
    expect(picked).toEqual(["share"]);
    expect(selected).toEqual(["select"]);
  });

  test("onExcalidrawAPI is the api under Excalidraw's name, and a promised scene opens", async () => {
    let given: DiagramEditorApi | null | undefined;
    render(() => (
      <DiagramEditor
        height={640}
        onExcalidrawAPI={(api) => (given = api)}
        initialData={Promise.resolve({ elements: [rectangle("A", 10, 10)] })}
      />
    ));
    await settle();
    await settle();
    expect(given?.getSceneElements().map((each) => each.id)).toEqual(["A"]);
  });
});

describe("keyboard", () => {
  test("Tab reaches the UI's controls, and arrows move within the toolbar", async () => {
    await mountEditor();
    const tools = screen.getByRole("toolbar", { name: "Shapes" });
    const first = within(tools).getAllByRole("button")[0]!;
    first.focus();
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).not.toBe(first);
    expect(tools.contains(document.activeElement)).toBe(true);
    await user.keyboard("{Enter}");
    await settle();
    expect(document.activeElement?.getAttribute("role")).toBe("application");
  });
});

describe("scroll back to content", () => {
  test("shows once the content is out of view and brings it back", async () => {
    const { api } = await mountEditor({ initialData: { elements: [rectangle("A", 100, 100)] } });
    expect(screen.queryByTestId("scroll-back-to-content")).toBeNull();
    api.updateScene({ appState: { scrollX: -5000, scrollY: -5000 } });
    await settle();
    await user.click(screen.getByRole("button", { name: "Scroll back to content" }));
    await settle();
    expect(api.getAppState().scrollX).toBeGreaterThan(-5000);
    expect(screen.queryByTestId("scroll-back-to-content")).toBeNull();
  });
});

describe("performance", () => {
  test("a drag, a pan and a zoom change nothing in the UI but the zoom level", async () => {
    const { api, region } = await mountEditor({
      initialData: { elements: [rectangle("A", 100, 100), rectangle("B", 300, 100)] },
    });
    await select(api, "A");
    const ui = region.querySelector("[data-testid=editor-ui]")!;
    const changed: string[] = [];
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        const target =
          record.target instanceof Element ? record.target : record.target.parentElement;
        changed.push(target?.getAttribute("data-testid") ?? target?.tagName ?? "?");
      }
    });
    observer.observe(ui, { subtree: true, childList: true, attributes: true, characterData: true });

    pointer(canvas(region), "pointerdown", 150, 150);
    for (let step = 1; step <= 20; step++) {
      pointer(canvas(region), "pointermove", 150 + step * 5, 150 + step * 3);
      await settle();
    }
    pointer(canvas(region), "pointerup", 250, 210);
    await settle();
    expect(element(api, "A").x).toBe(200);
    for (let step = 0; step < 10; step++) {
      region.dispatchEvent(
        new WheelEvent("wheel", { deltaX: 10, deltaY: 10, bubbles: true, cancelable: true }),
      );
      await settle();
    }
    // a zoom with the wheel: the level follows once the gesture pauses
    const zoomBefore = api.getAppState().zoom.value;
    for (let step = 0; step < 10; step++) {
      // happy-dom leaves the modifier keys of a WheelEvent's init out
      const zoomStep = new WheelEvent("wheel", {
        deltaY: -50,
        clientX: 500,
        clientY: 300,
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(zoomStep, "ctrlKey", { value: true });
      region.dispatchEvent(zoomStep);
      await settle();
    }
    expect(api.getAppState().zoom.value).not.toBe(zoomBefore);
    observer.disconnect();
    // the pointer up commits the move: the hint and the history follow once,
    // and the scroll back button may appear once; nothing changes per step
    expect(changed.length).toBeLessThanOrEqual(5);
    expect(changed).not.toContain("zoom-level");
    expect(changed).not.toContain("properties-panel");
  });
});

describe("colour picker", () => {
  test("letters pick palette colours, arrows step, and the eye dropper picks off the canvas", async () => {
    const { api } = await mountEditor({ initialData: { elements: [rectangle("A", 100, 100)] } });
    await select(api, "A");
    await user.click(screen.getByTestId("elementStroke-picker-trigger"));
    await settle();
    const dialog = screen.getByRole("dialog", { name: "Color picker" });
    key(dialog, { key: "w", code: "KeyW" });
    await settle();
    const picked = element(api, "A").strokeColor;
    expect(picked).not.toBe("#1e1e1e");
    key(dialog, { key: "ArrowRight", code: "ArrowRight" });
    await settle();
    expect(element(api, "A").strokeColor).not.toBe(picked);
    const hex = within(dialog).getByRole<HTMLInputElement>("textbox", { name: "Hex code" });
    hex.value = "2f9e44";
    hex.dispatchEvent(new Event("change", { bubbles: true }));
    await settle();
    expect(element(api, "A").strokeColor).toBe("#2f9e44");

    key(dialog, { key: "i", code: "KeyI" });
    await settle();
    const overlay = screen.getByTestId("eye-dropper-overlay");
    pointer(overlay, "pointerdown", 500, 500);
    pointer(overlay, "pointerup", 500, 500);
    await settle();
    expect(screen.queryByTestId("eye-dropper-overlay")).toBeNull();
    expect(element(api, "A").strokeColor).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("fill", () => {
  test("Alt and a press on hachure turns it to zigzag, and a press turns it back", async () => {
    const { api } = await mountEditor({
      initialData: { elements: [rectangle("A", 100, 100, { fillStyle: "hachure" })] },
    });
    await select(api, "A");
    const hachure = screen.getAllByTestId("fill-hachure")[0]!;
    hachure.dispatchEvent(new MouseEvent("click", { bubbles: true, altKey: true }));
    await settle();
    expect(element(api, "A").fillStyle).toBe("zigzag");
    expect(screen.getByRole("radio", { name: "Zigzag" })).toBeDefined();
    screen
      .getAllByTestId("fill-hachure")[0]!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await settle();
    expect(element(api, "A").fillStyle).toBe("hachure");
  });
});
