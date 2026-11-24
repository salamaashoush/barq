/**
 * The welcome screen: over a scene that has never had an element, with the
 * selection tool, when the app asks for it; Excalidraw's defaults or the
 * app's own parts.
 */

import { describe, expect, test } from "bun:test";
import { ariaViolations, render, screen, user } from "@barqjs/testing";

import { DiagramEditor } from "../index.ts";

import { WelcomeScreen } from "./welcome-screen.tsx";
import { canvas, mountEditor, pointer, rectangle, settle, setupUITests } from "./test-ui.tsx";

setupUITests();

const key = (target: Element, init: KeyboardEventInit) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));

describe("welcome screen", () => {
  test("shows Excalidraw's heading, menu and hints over an empty scene", async () => {
    const { api } = await mountEditor({}, () => <WelcomeScreen />);
    const welcome = screen.getByTestId("welcome-screen");
    expect(screen.getByTestId("welcome-heading").textContent).toBe("Diagrams. Made. Simple.");
    expect(screen.getByTestId("welcome-load").textContent).toContain("Open");
    expect(screen.getByTestId("welcome-menu-hint").textContent).toContain("Export, preferences");
    expect(screen.getByTestId("welcome-toolbar-hint").textContent).toContain("Pick a tool");
    expect(screen.getByTestId("welcome-help-hint").textContent).toContain("Shortcuts & help");
    expect(ariaViolations(welcome)).toEqual([]);

    await user.click(screen.getByTestId("welcome-help"));
    await settle();
    expect(api.getAppState().openDialog).toEqual({ name: "help" });
  });

  test("a drawing tool hides it until the selection tool is back, and an element for good", async () => {
    const { api, region } = await mountEditor({}, () => <WelcomeScreen />);
    key(region, { key: "r", code: "KeyR" });
    await settle();
    expect(screen.queryByTestId("welcome-screen")).toBeNull();
    key(region, { key: "v", code: "KeyV" });
    await settle();
    expect(screen.getByTestId("welcome-screen")).toBeDefined();

    key(region, { key: "r", code: "KeyR" });
    await settle();
    const target = canvas(region);
    pointer(target, "pointerdown", 100, 100);
    pointer(target, "pointermove", 200, 200);
    pointer(target, "pointerup", 200, 200);
    await settle();
    expect(api.getSceneElements()).toHaveLength(1);
    // deleted, the element is still the scene's: the screen stays away
    key(region, { key: "Delete", code: "Delete" });
    key(region, { key: "v", code: "KeyV" });
    await settle();
    expect(api.getSceneElements()).toHaveLength(0);
    expect(screen.queryByTestId("welcome-screen")).toBeNull();
  });

  test("is off without a WelcomeScreen child", async () => {
    await mountEditor();
    expect(screen.queryByTestId("welcome-screen")).toBeNull();
  });

  test("a scene with elements shows none", async () => {
    await mountEditor({ initialData: { elements: [rectangle("A", 0, 0)] } }, () => (
      <WelcomeScreen />
    ));
    expect(screen.queryByTestId("welcome-screen")).toBeNull();
  });

  test("an app composes its own from the parts", async () => {
    render(() => (
      <DiagramEditor height={800}>
        <WelcomeScreen>
          <WelcomeScreen.Center>
            <WelcomeScreen.Center.Logo>Acme</WelcomeScreen.Center.Logo>
            <WelcomeScreen.Center.Heading>Sketch the release</WelcomeScreen.Center.Heading>
            <WelcomeScreen.Center.Menu>
              <WelcomeScreen.Center.MenuItemHelp />
              <WelcomeScreen.Center.MenuItemLink href="https://example.com/docs">
                Docs
              </WelcomeScreen.Center.MenuItemLink>
            </WelcomeScreen.Center.Menu>
          </WelcomeScreen.Center>
          <WelcomeScreen.Hints.ToolbarHint>Start here</WelcomeScreen.Hints.ToolbarHint>
        </WelcomeScreen>
      </DiagramEditor>
    ));
    await settle();
    expect(screen.getByTestId("welcome-heading").textContent).toBe("Sketch the release");
    expect(screen.getByText("Acme")).toBeDefined();
    expect(screen.getByRole("link", { name: "Docs" }).getAttribute("href")).toBe(
      "https://example.com/docs",
    );
    expect(screen.getByTestId("welcome-toolbar-hint").textContent).toContain("Start here");
    expect(screen.queryByTestId("welcome-menu-hint")).toBeNull();
    expect(screen.queryByTestId("welcome-load")).toBeNull();
  });
});
