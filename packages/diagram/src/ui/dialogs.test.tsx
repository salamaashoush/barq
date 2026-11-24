/**
 * The editor's dialogs: help, and the strings barq adds to Excalidraw's
 * locales (the palette's categories, the keyboard help) in another language.
 */

import { describe, expect, test } from "bun:test";
import { ariaViolations, screen, within } from "@barqjs/testing";

import { loadLanguage } from "../i18n.ts";
import { mountEditor, settle, setupUITests } from "./test-ui.tsx";

setupUITests();

const key = (target: Element, init: KeyboardEventInit) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));

const ctrl = navigator.platform.includes("Mac") ? { metaKey: true } : { ctrlKey: true };

describe("help dialog", () => {
  test("? opens every shortcut by section, and closing it clears openDialog", async () => {
    const { api, region } = await mountEditor();
    key(region, { key: "?", code: "Slash", shiftKey: true });
    await settle();
    expect(api.getAppState().openDialog).toEqual({ name: "help" });
    const dialog = screen.getByRole("dialog", { name: "Help" });
    const tools = within(dialog).getByRole("region", { name: "Tools" });
    const rectangle = within(tools).getByText("Rectangle").parentElement!;
    expect([...rectangle.querySelectorAll("kbd")].map((kbd) => kbd.textContent)).toEqual([
      "R",
      "2",
    ]);
    expect(within(dialog).getByRole("region", { name: "View" })).toBeDefined();
    const editor = within(dialog).getByRole("region", { name: "Editor" });
    expect(within(editor).getByText("Undo")).toBeDefined();
    expect(ariaViolations(dialog)).toEqual([]);
    within(dialog).getByRole("button", { name: "Close" }).click();
    await settle();
    expect(screen.queryByRole("dialog", { name: "Help" })).toBeNull();
    expect(api.getAppState().openDialog).toBeNull();
  });

  test("the main menu and the footer's help button open it", async () => {
    const { api } = await mountEditor();
    screen.getByTestId("help-icon").click();
    await settle();
    expect(api.getAppState().openDialog).toEqual({ name: "help" });
    expect(screen.getByRole("dialog", { name: "Help" })).toBeDefined();
  });
});

describe("barq's strings", () => {
  test("the palette's categories and the keyboard help are translated", async () => {
    await loadLanguage("ar-SA");
    const { region } = await mountEditor({ langCode: "ar-SA" });
    await settle();
    const help = document.getElementById(region.getAttribute("aria-describedby")!)!;
    expect(help.textContent).toContain("الأدوات");
    expect(region.getAttribute("aria-label")).toBe("محرر المخططات");
    key(region, { key: "/", code: "Slash", ...ctrl });
    await settle();
    const palette = screen.getByRole("dialog");
    expect(within(palette).getByText("المحرر")).toBeDefined();
    expect(within(palette).queryByText("Editor")).toBeNull();
  });

  test("the live region speaks the language: tools, selections and actions", async () => {
    await loadLanguage("ar-SA");
    const { region } = await mountEditor({
      langCode: "ar-SA",
      initialData: {
        elements: [{ type: "rectangle", id: "A", x: 0, y: 0, width: 50, height: 50 } as never],
      },
    });
    await settle();
    const live = region.querySelector("[role=status]")!;
    key(region, { key: "r", code: "KeyR" });
    await settle();
    expect(live.textContent?.trim()).toBe("أداة مستطيل");
    key(region, { key: "Escape", code: "Escape" });
    key(region, { key: "a", code: "KeyA", ...ctrl });
    await settle();
    expect(live.textContent?.trim()).toBe("مستطيل محدد");
    key(region, { key: "d", code: "KeyD", ...ctrl });
    await settle();
    expect(live.textContent?.trim()).toBe("نُسخ نسخة مكررة");
  });

  test("English is the fallback, key by key", async () => {
    const { region } = await mountEditor();
    const help = document.getElementById(region.getAttribute("aria-describedby")!)!;
    expect(help.textContent).toContain("Tools: V select");
    expect(help.textContent).toContain("? lists every shortcut");
    key(region, { key: "/", code: "Slash", ...ctrl });
    await settle();
    expect(within(screen.getByRole("dialog")).getByText("Editor")).toBeDefined();
  });
});
