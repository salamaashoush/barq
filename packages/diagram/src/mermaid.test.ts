/**
 * Mermaid through `@excalidraw/mermaid-to-excalidraw` and
 * `convertToExcalidrawElements`: shapes, labels and bound arrows that render
 * and serialize like any other scene.
 */

import { expect, test } from "bun:test";

import { exportToSvg, serializeAsJSON } from "./index.ts";
import { mermaidToExcalidraw } from "./mermaid.ts";

const FLOW = `flowchart LR
  A[Start] --> B{Ready?}
  B -->|Yes| C[Ship]
  B -->|No| D[مراجعة]`;

test("a flowchart becomes labelled shapes joined by bound arrows", async () => {
  const { elements, files } = await mermaidToExcalidraw(FLOW, {
    themeVariables: { fontSize: "16px" },
  });
  const types = elements.map((element) => element.type);
  expect(types.filter((type) => type === "arrow")).toHaveLength(3);
  expect(types).toContain("diamond");
  const labels = elements.flatMap((element) => (element.type === "text" ? [element.text] : []));
  for (const label of ["Start", "Ready?", "Ship", "مراجعة", "Yes", "No"]) {
    expect(labels).toContain(label);
  }
  const arrow = elements.find((element) => element.type === "arrow");
  expect(arrow).toMatchObject({ startBinding: expect.any(Object), endBinding: expect.any(Object) });
  expect(files).toEqual({});

  const svg = await exportToSvg({ elements, files, skipInliningFonts: true });
  expect(svg.querySelectorAll("text").length).toBe(labels.length);
  expect(JSON.parse(serializeAsJSON(elements, {}, files, "local")).elements).toHaveLength(
    elements.length,
  );
});

test("a definition that does not parse is refused", async () => {
  await expect(mermaidToExcalidraw("flowchart LR\n  A[[[ -->")).rejects.toThrow();
});
