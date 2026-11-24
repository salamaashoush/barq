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
    await mountEditor({
      mainMenu: () => (
        <>
          <MainMenu.DefaultItems.Help />
          <MainMenu.Item onSelect={() => picked.push("share")}>Share</MainMenu.Item>
        </>
      ),
      renderTopRightUI: () => <button type="button">Publish</button>,
    });
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
  });

  test("excalidrawAPI is the api under Excalidraw's name, and a promised scene opens", async () => {
    let given: DiagramEditorApi | undefined;
    render(() => (
      <DiagramEditor
        height={640}
        excalidrawAPI={(api) => (given = api)}
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
