/**
 * The pickers' keys and the eye dropper: S, G and Shift+F open the pickers;
 * I, Shift+G and Shift+S pick off the canvas, a held pointer previewing and
 * Alt swapping stroke and background; in a picker Alt holds the eye dropper
 * open; the font list previews the hovered font and restores the selection
 * when it closes without a pick.
 */

import { describe, expect, test } from "bun:test";
import { removeDarkModeFilter } from "@excalidraw/common";
import { screen, user } from "@barqjs/testing";

import { mountEditor, pointer, rectangle, select, settle, setupUITests } from "./test-ui.tsx";

import type { DiagramEditorApi } from "../index.ts";

setupUITests();

function key(target: Element, init: KeyboardEventInit, type = "keydown") {
  return target.dispatchEvent(
    new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init }),
  );
}

const ctrl = navigator.platform.includes("Mac") ? { metaKey: true } : { ctrlKey: true };

function element(api: DiagramEditorApi, id: string) {
  return api.getSceneElements().find((each) => each.id === id)!;
}

function text(id: string, x: number, y: number) {
  return { type: "text", id, x, y, text: "Hello", fontFamily: 5 } as never;
}

describe("picker keys", () => {
  test("S and G open the colour pickers for the selection, Shift+F the font list", async () => {
    const { api, region } = await mountEditor({
      initialData: { elements: [rectangle("A", 100, 100), text("T", 300, 300)] },
    });
    key(region, { key: "s", code: "KeyS" });
    await settle();
    expect(api.getAppState().openPopup).toBeNull();

    await select(api, "A");
    key(region, { key: "s", code: "KeyS" });
    await settle();
    expect(api.getAppState().openPopup).toBe("elementStroke");
    expect(screen.getByRole("dialog", { name: "Color picker" })).toBeDefined();
    key(screen.getByRole("dialog", { name: "Color picker" }), { key: "Escape", code: "Escape" });
    await settle();

    key(region, { key: "g", code: "KeyG" });
    await settle();
    expect(api.getAppState().openPopup).toBe("elementBackground");
    key(screen.getByRole("dialog", { name: "Color picker" }), { key: "Escape", code: "Escape" });
    await settle();

    key(region, { key: "F", code: "KeyF", shiftKey: true });
    await settle();
    expect(api.getAppState().openPopup).toBeNull();
    await select(api, "T");
    key(region, { key: "F", code: "KeyF", shiftKey: true });
    await settle();
    expect(api.getAppState().openPopup).toBe("fontFamily");
    expect(screen.getByRole("combobox")).toBeDefined();
  });
});

describe("eye dropper", () => {
  test("I previews the background under a held pointer and applies it as one step", async () => {
    const { api, region } = await mountEditor({
      initialData: { elements: [rectangle("A", 100, 100, { backgroundColor: "#ffc9c9" })] },
    });
    await select(api, "A");
    key(region, { key: "i", code: "KeyI" });
    await settle();
    const overlay = screen.getByTestId("eye-dropper-overlay");
    pointer(overlay, "pointerdown", 500, 500);
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: 510, clientY: 510 }));
    await settle();
    expect(element(api, "A").backgroundColor).toBe("#000000");
    expect(screen.getByTestId("eye-dropper-overlay")).toBeDefined();
    pointer(overlay, "pointerup", 510, 510);
    await settle();
    expect(screen.queryByTestId("eye-dropper-overlay")).toBeNull();
    expect(element(api, "A").backgroundColor).toBe("#000000");
    expect(element(api, "A").strokeColor).toBe("#1e1e1e");

    key(region, { key: "z", code: "KeyZ", ...ctrl });
    await settle();
    expect(element(api, "A").backgroundColor).toBe("#ffc9c9");
  });

  test("Alt swaps the eye dropper to the other colour, and dark mode's filter comes off", async () => {
    const { api, region } = await mountEditor({
      theme: "dark",
      initialData: { elements: [rectangle("A", 100, 100)] },
    });
    await select(api, "A");
    key(region, { key: "S", code: "KeyS", shiftKey: true });
    await settle();
    const overlay = screen.getByTestId("eye-dropper-overlay");
    overlay.dispatchEvent(
      new PointerEvent("pointerup", { clientX: 10, clientY: 10, altKey: true, bubbles: true }),
    );
    await settle();
    // Shift+S picks the stroke; with Alt, the background
    expect(element(api, "A").backgroundColor).toBe(removeDarkModeFilter("#000000"));
    expect(element(api, "A").strokeColor).toBe("#1e1e1e");
  });

  test("in a picker, Alt holds the eye dropper open for picks until it is let go", async () => {
    const { api } = await mountEditor({ initialData: { elements: [rectangle("A", 100, 100)] } });
    await select(api, "A");
    await user.click(screen.getByTestId("elementStroke-picker-trigger"));
    await settle();
    key(screen.getByRole("dialog", { name: "Color picker" }), {
      key: "Alt",
      code: "AltLeft",
      altKey: true,
    });
    await settle();
    const overlay = screen.getByTestId("eye-dropper-overlay");
    overlay.dispatchEvent(
      new PointerEvent("pointerup", { clientX: 10, clientY: 10, altKey: true, bubbles: true }),
    );
    await settle();
    expect(element(api, "A").strokeColor).toBe("#000000");
    expect(screen.getByTestId("eye-dropper-overlay")).toBeDefined();
    key(document.body, { key: "Alt", code: "AltLeft" }, "keyup");
    await settle();
    expect(screen.queryByTestId("eye-dropper-overlay")).toBeNull();
  });
});

interface FontFamilyField {
  fontFamily: number;
}

describe("font preview", () => {
  test("the highlighted font previews on the text, and closing without a pick restores it", async () => {
    const { api } = await mountEditor({ initialData: { elements: [text("T", 300, 300)] } });
    await select(api, "T");
    await user.click(screen.getByTestId("font-family-show-fonts"));
    await settle();
    await user.type(screen.getByRole("combobox"), "Lilita");
    await settle();
    expect((element(api, "T") as FontFamilyField).fontFamily).toBe(7);
    const undoable = api.getAppState();
    expect(undoable.currentItemFontFamily).not.toBe(7);

    await user.keyboard("{Escape}");
    await settle();
    expect((element(api, "T") as FontFamilyField).fontFamily).toBe(5);

    await user.click(screen.getByTestId("font-family-show-fonts"));
    await settle();
    await user.type(screen.getByRole("combobox"), "Lilita");
    await user.keyboard("{Enter}");
    await settle();
    expect((element(api, "T") as FontFamilyField).fontFamily).toBe(7);
    expect(api.getAppState().currentItemFontFamily).toBe(7);
  });
});
