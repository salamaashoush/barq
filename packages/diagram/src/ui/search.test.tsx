/**
 * The search: Ctrl+F and the main menu open it in the sidebar, what is typed
 * finds texts and frames' names, highlighted through `searchMatches`, and
 * Enter, Shift+Enter, the arrows and a click step through the matches.
 */

import { describe, expect, test } from "bun:test";
import { ariaViolations, screen, user, within } from "@barqjs/testing";

import { getMatchPreview, searchScene } from "../editor/search.ts";
import { mountEditor, settle, setupUITests } from "./test-ui.tsx";

import type { DiagramEditorApi } from "../index.ts";

setupUITests();

const key = (target: Element, init: KeyboardEventInit) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));

const ctrl = navigator.platform.includes("Mac") ? { metaKey: true } : { ctrlKey: true };

const text = (id: string, value: string, x: number, y: number) =>
  ({ type: "text", id, x, y, text: value, originalText: value, fontSize: 20 }) as never;

const frame = (id: string, name: string, x: number, y: number) =>
  ({ type: "frame", id, x, y, width: 300, height: 200, name }) as never;

const scene = () => ({
  elements: [
    text("t1", "the release plan", 100, 100),
    text("t2", "release notes", 100, 300),
    frame("f1", "Release frame", 400, 100),
    text("far", "release far away", 5000, 5000),
  ],
});

/** Types into the search and lets its pause pass. */
const search = async (input: HTMLElement, value: string) => {
  await user.type(input, value);
  await new Promise((resolve) => setTimeout(resolve, 400));
  await settle();
};

const matches = (api: DiagramEditorApi) => api.getAppState().searchMatches;

describe("search", () => {
  test("Ctrl+F opens it focused; matches are listed, frames first, and highlighted", async () => {
    const { api, region } = await mountEditor({ initialData: scene() });
    key(region, { key: "f", code: "KeyF", ...ctrl });
    await settle();
    expect(api.getAppState().openSidebar).toEqual({ name: "default", tab: "search" });
    const sidebar = screen.getByTestId("default-sidebar");
    const input = within(sidebar).getByRole("searchbox", { name: "Find on canvas" });
    expect(document.activeElement).toBe(input);
    expect(ariaViolations(sidebar)).toEqual([]);

    await search(input, "release");
    const results = within(sidebar).getAllByTestId("search-result");
    expect(results.map((result) => result.textContent?.replace(/\s+/g, " "))).toEqual([
      "Release frame",
      "the release plan",
      "release notes",
      "release far away",
    ]);
    expect(within(results[1]!).getByText("release").tagName).toBe("B");
    expect(within(sidebar).getByRole("list", { name: "Frames" })).toBeDefined();
    const state = matches(api);
    expect(state?.matches.map((match) => match.id)).toEqual(["f1", "t1", "t2", "far"]);
    // the first match in view is focused
    expect(state?.focusedId).toBe("f1");
    expect(within(sidebar).getByTestId("search-count").textContent).toBe("1 / 4 results");
    expect(ariaViolations(sidebar)).toEqual([]);
  });

  test("Enter steps forward, Shift+Enter back, a click jumps, and a far match is brought into view", async () => {
    const { api, region } = await mountEditor({ initialData: scene() });
    key(region, { key: "f", code: "KeyF", ...ctrl });
    await settle();
    const input = screen.getByRole("searchbox", { name: "Find on canvas" });
    await search(input, "release");
    key(input, { key: "Enter" });
    await settle();
    expect(matches(api)?.focusedId).toBe("t1");
    key(input, { key: "Enter", shiftKey: true });
    await settle();
    expect(matches(api)?.focusedId).toBe("f1");
    key(input, { key: "ArrowUp" });
    await settle();
    expect(matches(api)?.focusedId).toBe("far");
    expect(
      matches(api)
        ?.matches.filter((match) => match.focus)
        .map((match) => match.id),
    ).toEqual(["far"]);
    // the viewport moved to show it
    const { scrollX, zoom, width } = api.getAppState();
    expect(-scrollX).toBeGreaterThan(5000 - width / zoom.value);

    screen.getAllByTestId("search-result")[2]!.click();
    await settle();
    expect(matches(api)?.focusedId).toBe("t2");
    expect(screen.getByTestId("search-count").textContent).toBe("3 / 4 results");
  });

  test("nothing found says so; Escape closes it and clears the highlights", async () => {
    const { api, region } = await mountEditor({ initialData: scene() });
    key(region, { key: "f", code: "KeyF", ...ctrl });
    await settle();
    const input = screen.getByRole("searchbox", { name: "Find on canvas" });
    await search(input, "zebra");
    expect(screen.getByText("No matches found...")).toBeDefined();
    expect(matches(api)).toBeNull();
    await user.clear(input);
    await search(input, "notes");
    expect(matches(api)?.matches).toHaveLength(1);
    key(input, { key: "Escape" });
    await settle();
    expect(api.getAppState().openSidebar).toBeNull();
    expect(matches(api)).toBeNull();
  });

  test("the main menu's entry opens it", async () => {
    const { api } = await mountEditor({ initialData: scene() });
    await user.click(screen.getByTestId("main-menu-trigger"));
    await settle();
    await user.click(screen.getByTestId("search-menu-button"));
    await settle();
    expect(api.getAppState().openSidebar).toEqual({ name: "default", tab: "search" });
  });
});

describe("searchScene", () => {
  test("finds every match, case-insensitive, with the words around it", () => {
    const { matches: found } = searchScene("a", [text("t", "Banana and apple", 0, 0)] as never, {
      zoom: 1,
      visibleIds: new Set(),
    });
    expect(found.map((match) => match.index)).toEqual([1, 3, 5, 7, 11]);
    expect(found[0]?.matchedLines[0]?.width).toBeGreaterThan(0);
    const preview = getMatchPreview("one two three Four five six seven eight nine", 14, "four");
    expect(preview.previewText.replace(/\s+/g, " ")).toBe("two three Four five six seven eight");
    expect(
      preview.previewText.slice(preview.indexInSearchQuery, preview.indexInSearchQuery + 4),
    ).toBe("Four");
    expect(preview).toMatchObject({ moreBefore: true, moreAfter: true });
  });
});
