/**
 * `<DiagramEditor>` in a page: an application region over three canvases,
 * driven by real pointer and keyboard events, announcing what changes, and
 * rendered on the server as an empty region that hydrates into the editor.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createSignal, flush, resetChildIds } from "@barqjs/core";
import { colorScheme } from "@barqjs/primitives/color-scheme";
import { hydrate, render } from "@barqjs/web";

import { type DiagramEditorApi, DiagramEditor } from "./index.ts";
import { ENTRY, compile, serve } from "./ssr-harness.ts";

const SIZE = { width: 800, height: 480 };
const originalRect = HTMLElement.prototype.getBoundingClientRect;
beforeEach(() => {
  HTMLElement.prototype.getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, right: SIZE.width, bottom: SIZE.height, ...SIZE }) as DOMRect;
});

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.body.innerHTML = "";
  HTMLElement.prototype.getBoundingClientRect = originalRect;
});

async function mount(
  view: (grab: (api: DiagramEditorApi) => void) => unknown,
): Promise<{ api: DiagramEditorApi; region: HTMLElement; status: HTMLElement }> {
  const container = document.createElement("div");
  document.body.append(container);
  let api: DiagramEditorApi | undefined;
  cleanups.push(render(() => view((given) => (api = given)) as never, container));
  flush();
  const region = container.querySelector<HTMLElement>("[role=application]");
  const status = container.querySelector<HTMLElement>("[role=status]");
  if (api === undefined || region === null || status === null) {
    throw new Error("the editor did not mount");
  }
  return { api, region, status };
}

const settle = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  flush();
};

const pointer = (canvas: Element, type: string, x: number, y: number) =>
  canvas.dispatchEvent(
    new PointerEvent(type, {
      pointerId: 1,
      pointerType: "mouse",
      clientX: x,
      clientY: y,
      button: type === "pointermove" ? -1 : 0,
      buttons: type === "pointerup" ? 0 : 1,
      bubbles: true,
      cancelable: true,
    }),
  );

const key = (target: Element, init: KeyboardEventInit) => {
  const down = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(down);
  target.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, cancelable: true, ...init }));
  return down;
};

describe("DiagramEditor", () => {
  test("is a named, described, focusable application over three hidden canvases", async () => {
    const { region } = await mount((grab) => <DiagramEditor label="Release plan" api={grab} />);
    expect(region.getAttribute("aria-roledescription")).toBe("diagram editor");
    expect(region.getAttribute("aria-label")).toBe("Release plan");
    expect(region.tabIndex).toBe(0);
    const canvases = region.querySelectorAll("canvas");
    expect(canvases).toHaveLength(3);
    for (const canvas of canvases) expect(canvas.getAttribute("aria-hidden")).toBe("true");
    const help = document.getElementById(region.getAttribute("aria-describedby") ?? "");
    expect(help?.textContent).toContain("Tab and Shift+Tab");
    expect(region.querySelector("[role=status]")?.getAttribute("aria-live")).toBe("polite");
  });

  test("draws with the pointer, selects, and announces it", async () => {
    const { api, region, status } = await mount((grab) => <DiagramEditor api={grab} />);
    const interactive = region.querySelectorAll("canvas")[2]!;
    key(region, { key: "r", code: "KeyR" });
    await settle();
    expect(status.textContent?.trim()).toBe("Rectangle tool");

    pointer(interactive, "pointerdown", 100, 100);
    pointer(interactive, "pointermove", 150, 140);
    pointer(interactive, "pointermove", 200, 180);
    pointer(interactive, "pointerup", 200, 180);
    await settle();

    const [rect] = api.getSceneElements();
    expect([rect?.type, rect?.x, rect?.y, rect?.width, rect?.height]).toEqual([
      "rectangle",
      100,
      100,
      100,
      80,
    ]);
    expect(api.getAppState().selectedElementIds).toEqual({ [rect!.id]: true });
    expect(status.textContent?.trim()).toBe("Rectangle selected");
  });

  test("writes text in a textarea it mounts over the canvas, and removes it after", async () => {
    const { api, region } = await mount((grab) => <DiagramEditor api={grab} />);
    key(region, { key: "t", code: "KeyT" });
    const interactive = region.querySelectorAll("canvas")[2]!;
    pointer(interactive, "pointerdown", 200, 100);
    pointer(interactive, "pointerup", 200, 100);
    await settle();
    await settle();
    const textarea = region.querySelector<HTMLTextAreaElement>("textarea");
    expect(textarea?.getAttribute("aria-label")).toBe("Text");
    expect(textarea?.dataset.type).toBe("wysiwyg");
    expect(document.activeElement).toBe(textarea);

    textarea!.value = "مرحبا world";
    textarea!.dispatchEvent(new Event("input", { bubbles: true }));
    expect(api.getSceneElements()[0]?.type).toBe("text");
    expect(api.getAppState().editingTextElement).not.toBeNull();

    key(textarea!, { key: "Escape", code: "Escape" });
    await settle();
    expect(region.querySelector("textarea")).toBeNull();
    const [text] = api.getSceneElements();
    expect(text?.type === "text" && text.originalText).toBe("مرحبا world");
    expect(api.getAppState().editingTextElement).toBeNull();
    expect(document.activeElement).toBe(region);
  });

  test("every change reaches onChange, and the keyboard edits and undoes", async () => {
    const changes: number[] = [];
    const { api, region, status } = await mount((grab) => (
      <DiagramEditor api={grab} onChange={(elements) => changes.push(elements.length)} />
    ));
    key(region, { key: "o", code: "KeyO" });
    key(region, { key: "Enter", code: "Enter" });
    expect(api.getSceneElements().map((element) => element.type)).toEqual(["ellipse"]);
    expect(changes.at(-1)).toBe(1);

    key(region, { key: "Delete", code: "Delete" });
    await settle();
    expect(status.textContent?.trim()).toBe("Deleted");
    expect(api.getSceneElements()).toHaveLength(0);

    const ctrl = navigator.platform.includes("Mac") ? { metaKey: true } : { ctrlKey: true };
    key(region, { key: "z", code: "KeyZ", ...ctrl });
    expect(api.getSceneElements()).toHaveLength(1);
    api.history.clear();
    key(region, { key: "z", code: "KeyZ", ...ctrl });
    expect(api.getSceneElements()).toHaveLength(1);
  });

  test("opens initialData, and follows theme, grid and view mode props", async () => {
    const [grid, setGrid] = createSignal(false);
    const [viewMode, setViewMode] = createSignal(false);
    let setScheme!: (choice: "light" | "dark") => void;
    function Page(props: { grab: (api: DiagramEditorApi) => void }) {
      const scheme = colorScheme({
        themes: ["light", "dark"],
        system: false,
        defaultChoice: "dark",
        key: "diagram-editor-test",
      });
      setScheme = scheme.set;
      return (
        <DiagramEditor
          api={props.grab}
          gridModeEnabled={grid()}
          viewModeEnabled={viewMode()}
          initialData={{
            elements: [{ type: "rectangle", id: "A", x: 0, y: 0, width: 50, height: 50 } as never],
          }}
        />
      );
    }
    const { api, region } = await mount((grab) => <Page grab={grab} />);
    expect(api.getSceneElements().map((element) => element.id)).toEqual(["A"]);
    expect(api.getAppState().theme).toBe("dark");
    expect(region.dataset.theme).toBe("dark");
    setScheme("light");
    flush();
    expect(api.getAppState().theme).toBe("light");

    setGrid(true);
    flush();
    expect(api.getAppState().gridModeEnabled).toBe(true);

    setViewMode(true);
    flush();
    expect(api.getAppState().viewModeEnabled).toBe(true);
    key(region, { key: "r", code: "KeyR" });
    expect(api.getAppState().activeTool.type).toBe("selection");
  });

  test("unmounting stops the editor", async () => {
    const { api, region } = await mount((grab) => <DiagramEditor api={grab} />);
    for (const cleanup of cleanups.splice(0)) cleanup();
    key(region, { key: "r", code: "KeyR" });
    expect(api.getAppState().activeTool.type).toBe("selection");
  });
});

test("the server renders the empty editor, and the browser hydrates it", async () => {
  const compiled = compile(
    `
import { DiagramEditor } from ${JSON.stringify(ENTRY)}

export const handle = { api: null }

export const page = () => () => (
  <main>
    <DiagramEditor label="Whiteboard" api={(api) => (handle.api = api)} />
    <footer>end</footer>
  </main>
)
`,
    "editor-empty",
  );
  const served = serve(compiled.ssr);
  const container = document.createElement("div");
  document.body.append(container);
  container.innerHTML = served.html;

  const region = container.querySelector<HTMLElement>("[role=application]");
  expect(region?.getAttribute("aria-label")).toBe("Whiteboard");
  expect(region?.querySelectorAll("canvas")).toHaveLength(3);
  expect(container.querySelector("[role=status]")?.textContent).toBe("");

  const module = (await import(`${compiled.dom}?${Math.random()}`)) as {
    page: () => () => unknown;
    handle: { api: DiagramEditorApi | null };
  };
  resetChildIds();
  cleanups.push(hydrate(module.page() as never, container));
  flush();
  expect(hydrate.report.recovered).toBe(false);
  expect(container.querySelector("[role=application]")).toBe(region);
  expect(module.handle.api?.getSceneElements()).toEqual([]);
  expect(container.querySelector("footer")?.textContent).toBe("end");
});
