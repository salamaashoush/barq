/**
 * The dialogs that generate elements: pasted spreadsheet cells as charts.
 */

import { describe, expect, test } from "bun:test";
import { ariaViolations, screen, within } from "@barqjs/testing";

import { createPasteEvent } from "../clipboard.ts";
import { mountEditor, settle, setupUITests } from "./test-ui.tsx";

setupUITests();

async function paste(region: HTMLElement, text: string) {
  region.focus();
  document.dispatchEvent(createPasteEvent({ types: { "text/plain": text } }));
  for (let round = 0; round < 6; round++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  await settle();
}

interface TextContent {
  text: string;
}

describe("pasted spreadsheets", () => {
  test("CSV cells open the chart dialog, and a bar chart is inserted", async () => {
    const { api, region } = await mountEditor();
    await paste(region, "Month,Sales\nJan,10\nFeb,20\nMar,15");
    expect(api.getAppState().openDialog?.name).toBe("charts");
    const dialog = screen.getByRole("dialog", { name: "Paste charts" });
    expect(within(dialog).getByRole("button", { name: "Bar chart" })).toBeDefined();
    expect(within(dialog).getByRole("button", { name: "Line chart" })).toBeDefined();
    expect(within(dialog).getByRole("button", { name: "Radar chart" })).toBeDefined();
    expect(within(dialog).getByRole("button", { name: "Plain text" })).toBeDefined();
    expect(ariaViolations(dialog)).toEqual([]);
    within(dialog).getByRole("button", { name: "Bar chart" }).click();
    await settle();
    expect(api.getAppState().openDialog).toBeNull();
    const elements = api.getSceneElements();
    // three bars, the axes and the labels, grouped as one chart
    const bars = elements.filter(
      (element) => element.type === "rectangle" && element.backgroundColor !== "transparent",
    );
    expect(bars).toHaveLength(3);
    const texts = elements.filter((element) => element.type === "text");
    const labels: string[] = texts.map((text) => (text as TextContent).text);
    for (const label of ["Sales", "Jan", "Feb", "Mar"]) expect(labels).toContain(label);
    expect(new Set(elements.map((element) => element.groupIds.join())).size).toBe(1);
  });

  test("tab-separated cells with two series offer only what fits; plain text pastes text", async () => {
    const { api, region } = await mountEditor();
    await paste(region, "Item\tA\tB\nx\t1\t2\ny\t3\t4");
    const dialog = screen.getByRole("dialog", { name: "Paste charts" });
    // two rows: no radar
    expect(within(dialog).queryByRole("button", { name: "Radar chart" })).toBeNull();
    within(dialog).getByRole("button", { name: "Plain text" }).click();
    await settle();
    const [text] = api.getSceneElements();
    expect(text?.type).toBe("text");
  });

  test("text that is not a spreadsheet pastes as text", async () => {
    const { api, region } = await mountEditor();
    await paste(region, "hello world");
    expect(api.getAppState().openDialog).toBeNull();
    expect(api.getSceneElements()[0]?.type).toBe("text");
  });
});
