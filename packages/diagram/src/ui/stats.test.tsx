/**
 * The stats panel beyond its basic fields: the element's type, an image's
 * uncropped size while it is cropped, a group, several units edited each to
 * the value typed, the grid's step, folding sections and scrubbing a value
 * by dragging its label as one undo step.
 */

import { describe, expect, test } from "bun:test";
import { screen, within } from "@barqjs/testing";

import { mountEditor, rectangle, select, settle, setupUITests } from "./test-ui.tsx";

import type { DiagramEditorApi } from "../index.ts";

setupUITests();

const key = (target: Element, init: KeyboardEventInit) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));

const ctrl = navigator.platform.includes("Mac") ? { metaKey: true } : { ctrlKey: true };

const element = (api: DiagramEditorApi, id: string) =>
  api.getSceneElements().find((each) => each.id === id)!;

const openStats = async (region: HTMLElement) => {
  key(region, { key: "/", code: "Slash", altKey: true });
  await settle();
  return screen.getByRole("region", { name: "Canvas & Shape properties" });
};

const type = async (input: HTMLInputElement, value: string) => {
  input.value = value;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await settle();
};

describe("stats panel", () => {
  test("names the element's type, and a group of several", async () => {
    const { api, region } = await mountEditor({
      initialData: {
        elements: [
          rectangle("A", 100, 100, { groupIds: ["g"] }),
          rectangle("B", 300, 100, { groupIds: ["g"] }),
        ],
      },
    });
    const panel = await openStats(region);
    await select(api, "A");
    api.updateScene({ appState: { selectedGroupIds: {}, editingGroupId: "g" } });
    await settle();
    expect(within(panel).getByTestId("stats-element-type").textContent).toBe("Rectangle");
    await select(api, "A", "B");
    expect(within(panel).getByTestId("stats-group").textContent).toBe("Group");
  });

  test("several units each take the width and the x typed, mixed values show empty", async () => {
    const { api, region } = await mountEditor({
      initialData: {
        elements: [rectangle("A", 100, 100), rectangle("B", 300, 150, { width: 50 })],
      },
    });
    const panel = await openStats(region);
    await select(api, "A", "B");
    const width = within(panel).getByRole<HTMLInputElement>("spinbutton", { name: "Width" });
    const x = within(panel).getByRole<HTMLInputElement>("spinbutton", { name: "x" });
    expect(width.value).toBe("");
    expect(x.value).toBe("");
    await type(width, "80");
    expect(element(api, "A").width).toBe(80);
    expect(element(api, "B").width).toBe(80);
    await type(x, "20");
    expect(element(api, "A").x).toBe(20);
    expect(element(api, "B").x).toBe(20);
    expect(element(api, "B").y).toBe(150);
  });

  test("the grid's step is edited when the grid is on, and sections fold", async () => {
    const { api, region } = await mountEditor({ gridModeEnabled: true });
    const panel = await openStats(region);
    const step = within(panel).getByRole<HTMLInputElement>("spinbutton", { name: "Grid step" });
    expect(step.value).toBe("5");
    await type(step, "10");
    expect(api.getAppState().gridStep).toBe(10);

    within(panel).getByTestId("stats-general-toggle").click();
    await settle();
    expect(within(panel).queryByTestId("stats-shapes")).toBeNull();
    expect(within(panel).getByTestId("stats-general-toggle").getAttribute("aria-expanded")).toBe(
      "false",
    );
  });

  test("dragging a label scrubs the value, undone as one step", async () => {
    const { api, region } = await mountEditor({
      initialData: { elements: [rectangle("A", 100, 100)] },
    });
    const panel = await openStats(region);
    await select(api, "A");
    const label = within(panel).getByTestId("stats-x-scrub");
    const fire = (name: string, clientX: number) =>
      label.dispatchEvent(
        new PointerEvent(name, { pointerId: 1, clientX, clientY: 0, button: 0, bubbles: true }),
      );
    fire("pointerdown", 0);
    fire("pointermove", 20);
    await settle();
    expect(element(api, "A").x).toBe(110);
    fire("pointermove", 40);
    fire("pointerup", 40);
    await settle();
    expect(element(api, "A").x).toBe(120);
    key(region, { key: "z", code: "KeyZ", ...ctrl });
    await settle();
    expect(element(api, "A").x).toBe(100);
  });
});
