/**
 * The magic frame: the selection wrapped and turned into HTML by the app's
 * diagram-to-code backend, shown in a sandboxed iframe beside it, offered
 * only with that backend.
 */

import { describe, expect, test } from "bun:test";
import { screen } from "@barqjs/testing";

import { mountEditor, rectangle, select, settle, setupUITests } from "./test-ui.tsx";
import { DiagramToCodePlugin } from "../index.ts";

import type { ExcalidrawIframeElement } from "@excalidraw/element/types";
import type { DiagramEditorApi } from "../index.ts";
import type { GenerateDiagramToCode } from "../editor/magic-frame.ts";

setupUITests();

const PAGE = "<!DOCTYPE html><html><body><button>Buy</button></body></html>";

const pickMagicFrame = async () => {
  screen.getByTestId("toolbar-extra-tools").click();
  await settle();
  screen.getByTestId("toolbar-magicframe").click();
  await settle();
};

const iframeOf = (api: DiagramEditorApi) =>
  api.getSceneElements().find((element) => element.type === "iframe") as
    | ExcalidrawIframeElement
    | undefined;

describe("magic frame", () => {
  test("wraps the selection and shows the generated page beside it, streamed", async () => {
    let finish: (html: string) => void = () => {};
    let partial: (html: string) => void = () => {};
    const generate: GenerateDiagramToCode = ({ children, onPartial }) => {
      expect(children.map((child) => child.id).toSorted()).toEqual(["A", "B"]);
      partial = onPartial ?? partial;
      return new Promise((resolve) => {
        finish = (html) => resolve({ html });
      });
    };
    const { api } = await mountEditor(
      {
        initialData: { elements: [rectangle("A", 100, 100), rectangle("B", 300, 100)] },
      },
      () => <DiagramToCodePlugin generate={generate} />,
    );
    await select(api, "A", "B");
    await pickMagicFrame();
    const frame = api.getSceneElements().find((element) => element.type === "magicframe");
    expect(frame).toBeDefined();
    expect(api.getSceneElements().find((element) => element.id === "A")?.frameId).toBe(frame!.id);
    const iframe = iframeOf(api)!;
    expect(iframe.x).toBeGreaterThan(frame!.x + frame!.width);
    expect(iframe.customData?.generationData).toBeUndefined();
    let output = screen.getByTestId("magic-frame-output");
    expect(output.getAttribute("data-status")).toBe("pending");
    expect(output.textContent).toContain("Generating...");

    partial("Here it is: <!DOCTYPE html><html><body>Bu");
    await settle();
    expect(output.querySelector("iframe")?.getAttribute("srcdoc")).toBe(
      "<!DOCTYPE html><html><body>Bu",
    );

    finish(`Sure. ${PAGE} Enjoy.`);
    await settle();
    await settle();
    output = screen.getByTestId("magic-frame-output");
    expect(output.getAttribute("data-status")).toBe("done");
    const shown = output.querySelector("iframe")!;
    expect(shown.getAttribute("srcdoc")).toBe(PAGE);
    expect(shown.getAttribute("sandbox")).toBe("allow-scripts");
    expect(iframeOf(api)?.customData?.generationData).toEqual({ status: "done", html: PAGE });
    // the generated iframe is selected, and offers its source
    expect(screen.getByTestId("magic-frame-copy")).toBeDefined();
  });

  test("a failed generation shows its error; an empty frame says so", async () => {
    const { api } = await mountEditor(
      {
        initialData: {
          elements: [
            rectangle("A", 100, 100),
            { type: "magicframe", id: "M", x: 600, y: 300, width: 200, height: 200 } as never,
          ],
        },
      },
      () => (
        <DiagramToCodePlugin
          generate={({ frame }) => Promise.reject(new Error(`Backend down for ${frame.type}`))}
        />
      ),
    );
    await select(api, "A");
    await pickMagicFrame();
    await settle();
    const output = screen.getByTestId("magic-frame-output");
    expect(output.getAttribute("data-status")).toBe("error");
    expect(output.textContent).toContain("Backend down");

    await select(api, "M");
    screen.getByTestId("magic-frame-generate").click();
    await settle();
    expect(api.getAppState().errorMessage).toEqual({ key: "magicFrame.emptyFrame" });
  });

  test("without the backend it is not offered", async () => {
    await mountEditor();
    screen.getByTestId("toolbar-extra-tools").click();
    await settle();
    expect(screen.queryByTestId("toolbar-magicframe")).toBeNull();
  });

  test("aiEnabled false hides it even with a backend", async () => {
    await mountEditor({ aiEnabled: false }, () => (
      <DiagramToCodePlugin generate={({ children }) => ({ html: `${PAGE}${children.length}` })} />
    ));
    screen.getByTestId("toolbar-extra-tools").click();
    await settle();
    expect(screen.queryByTestId("toolbar-magicframe")).toBeNull();
  });
});
