/**
 * Quick picks customised by dragging: a palette colour or a font dragged
 * onto a slot pins it there, a pick dragged onto another slot moves, a value
 * already pinned is not pinned twice, and the strip's context menu or the
 * tip's link resets them.
 */

import { describe, expect, test } from "bun:test";
import { screen, user, within } from "@barqjs/testing";

import { mountEditor, rectangle, select, settle, setupUITests } from "./test-ui.tsx";

import type { DiagramEditorApi } from "../index.ts";
import type { Coords } from "../types.ts";

setupUITests();

function element(api: DiagramEditorApi, id: string) {
  return api.getSceneElements().find((each) => each.id === id)!;
}

/** Gives each quick pick its own box, a row of 24px squares from x = 0. */
function layOutSlots(strip: Element) {
  for (const slot of strip.querySelectorAll<HTMLElement>("[data-top-pick-index]")) {
    const index = Number(slot.dataset.topPickIndex);
    const left = index * 30;
    slot.getBoundingClientRect = () =>
      ({
        left,
        right: left + 24,
        top: 0,
        bottom: 24,
        width: 24,
        height: 24,
        x: left,
        y: 0,
      }) as DOMRect;
  }
}

function slotCentre(index: number) {
  return { x: index * 30 + 12, y: 12 };
}

/** A press on `source`, held past the drag's time threshold, carried to `to` and let go. */
async function drag(source: Element, to: Coords) {
  function fire(target: EventTarget, type: string, x: number, y: number) {
    return target.dispatchEvent(
      new PointerEvent(type, {
        pointerId: 7,
        isPrimary: true,
        button: 0,
        clientX: x,
        clientY: y,
        bubbles: true,
        cancelable: true,
      }),
    );
  }
  fire(source, "pointerdown", 500, 500);
  await new Promise((resolve) => setTimeout(resolve, 120));
  fire(window, "pointermove", 520, 520);
  fire(window, "pointermove", to.x, to.y);
  await settle();
  fire(window, "pointerup", to.x, to.y);
  // the drag's own click would come in this task; a later one is a click again
  await new Promise((resolve) => setTimeout(resolve, 0));
  await settle();
}

function strokePicks() {
  return [
    ...screen.getByTestId("stroke-color").querySelectorAll<HTMLElement>("[data-top-pick-index]"),
  ].map((slot) => slot.dataset.testid?.replace("color-top-pick-", ""));
}

describe("colour top picks", () => {
  test("a palette colour dragged onto a slot pins it there, and is not picked", async () => {
    const { api } = await mountEditor({ initialData: { elements: [rectangle("A", 100, 100)] } });
    await select(api, "A");
    const before = element(api, "A").strokeColor;
    const strip = screen.getByRole("group", { name: "Stroke" });
    layOutSlots(strip);
    await user.click(screen.getByTestId("elementStroke-picker-trigger"));
    await settle();
    const dialog = screen.getByRole("dialog", { name: "Color picker" });
    const violet = within(dialog)
      .getAllByRole("button")
      .find((button) => button.getAttribute("data-testid")?.startsWith("color-#"))!;
    const color = violet.getAttribute("data-testid")!.replace("color-", "");
    await drag(violet, slotCentre(1));
    expect(api.getAppState().colorTopPicks.elementStroke?.[1]).toBe(color);
    expect(strokePicks()[1]).toBe(color);
    expect(element(api, "A").strokeColor).toBe(before);
  });

  test("a pick dragged onto another slot moves there; a pinned colour is not pinned twice", async () => {
    const { api } = await mountEditor({ initialData: { elements: [rectangle("A", 100, 100)] } });
    await select(api, "A");
    const original = strokePicks();
    layOutSlots(screen.getByRole("group", { name: "Stroke" }));
    const first = screen.getByTestId(`color-top-pick-${original[0]}`);
    await drag(first, slotCentre(2));
    expect(strokePicks()).toEqual([
      original[1],
      original[2],
      original[0],
      original[3],
      original[4],
    ]);

    layOutSlots(screen.getByRole("group", { name: "Stroke" }));
    await user.click(screen.getByTestId("elementStroke-picker-trigger"));
    await settle();
    const dialog = screen.getByRole("dialog", { name: "Color picker" });
    const pinned = within(dialog).getByTestId(`color-${original[0]}`);
    await drag(pinned, slotCentre(0));
    expect(strokePicks()).toEqual([
      original[1],
      original[2],
      original[0],
      original[3],
      original[4],
    ]);
  });

  test("the tip's reset and the strip's context menu bring the defaults back", async () => {
    const { api } = await mountEditor({ initialData: { elements: [rectangle("A", 100, 100)] } });
    await select(api, "A");
    const original = strokePicks();
    api.updateScene({
      appState: {
        colorTopPicks: {
          ...api.getAppState().colorTopPicks,
          elementStroke: ["#e03131", ...original.slice(1)] as string[],
        },
      },
    });
    await settle();
    expect(strokePicks()[0]).toBe("#e03131");
    await user.click(screen.getByTestId("elementStroke-picker-trigger"));
    await settle();
    expect(screen.getByTestId("top-picks-tip").textContent).toContain("drag any color");
    await user.click(screen.getByTestId("top-picks-reset"));
    await settle();
    expect(api.getAppState().colorTopPicks.elementStroke).toBeNull();
    expect(strokePicks()).toEqual(original);

    api.updateScene({
      appState: {
        colorTopPicks: {
          ...api.getAppState().colorTopPicks,
          elementStroke: ["#e03131", ...original.slice(1)] as string[],
        },
      },
    });
    await settle();
    screen
      .getByRole("group", { name: "Stroke" })
      .dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }),
      );
    await settle();
    await user.click(screen.getByTestId("top-picks-reset-menu"));
    await settle();
    expect(api.getAppState().colorTopPicks.elementStroke).toBeNull();
  });
});

describe("font top picks", () => {
  test("a font dragged from the list onto a slot replaces it", async () => {
    const { api } = await mountEditor({
      initialData: { elements: [{ type: "text", id: "T", x: 0, y: 0, text: "Hi" } as never] },
    });
    await select(api, "T");
    const strip = screen.getByRole("radiogroup", { name: "Font family" });
    layOutSlots(strip);
    await user.click(screen.getByTestId("font-family-show-fonts"));
    await settle();
    const lilita = screen.getByTestId("font-family-7").querySelector("span:last-of-type")!;
    await drag(lilita, slotCentre(2));
    expect(api.getAppState().fontTopPicks).toEqual([5, 6, 7]);
    expect(screen.getAllByTestId("font-family-pick-7").length).toBeGreaterThan(0);
  });
});
