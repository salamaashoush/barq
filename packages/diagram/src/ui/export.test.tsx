/**
 * Export, save and load: the image export dialog and its settings, the export
 * dialog, saving to a file and to the same file again, loading over the scene
 * once confirmed, and the host's `onExport`.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { ariaViolations, screen, user, within } from "@barqjs/testing";

import { loadFromBlob } from "../data/blob.ts";
import { serializeAsJSON } from "../data/json.ts";
import { mountEditor, rectangle, select, settle, setupUITests } from "./test-ui.tsx";

import type { DiagramEditorApi } from "../index.ts";

setupUITests();

type PickerWindow = Window & { showOpenFilePicker?: unknown; showSaveFilePicker?: unknown };
const view = window as PickerWindow;

afterEach(() => {
  delete view.showOpenFilePicker;
  delete view.showSaveFilePicker;
});

function memoryHandle(name: string, initial: Blob[] = []) {
  const written: Blob[] = [...initial];
  const handle = {
    kind: "file",
    name,
    written,
    getFile: async () => new File(written, name, { type: written[0]?.type ?? "" }),
    createWritable: async () => ({
      write: async (data: Blob) => {
        written.length = 0;
        written.push(data);
      },
      close: async () => {},
    }),
  };
  return handle as typeof handle & FileSystemFileHandle;
}

function usePickers(save: ReturnType<typeof memoryHandle>, open = save) {
  const calls = { save: 0, open: 0 };
  view.showSaveFilePicker = async () => {
    calls.save++;
    return save;
  };
  view.showOpenFilePicker = async () => {
    calls.open++;
    return [open];
  };
  return calls;
}

function key(target: Element, init: KeyboardEventInit) {
  return target.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }),
  );
}

const ctrl = navigator.platform.includes("Mac") ? { metaKey: true } : { ctrlKey: true };

/** Settles until `check` holds: a save or a load resolves over several tasks. */
async function until(check: () => boolean) {
  for (let round = 0; round < 40 && !check(); round++) {
    await settle();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  expect(check()).toBe(true);
}

async function openMenuItem(name: RegExp) {
  await user.click(screen.getByRole("button", { name: "Menu" }));
  await settle();
  await user.click(screen.getByRole("menuitem", { name }));
  await settle();
}

function ids(api: DiagramEditorApi) {
  return api.getSceneElements().map((element) => element.id);
}

describe("image export", () => {
  test("Ctrl+Shift+E previews the scene, its settings change the state, PNG saves it", async () => {
    const handle = memoryHandle("drawing.excalidraw.png");
    const calls = usePickers(handle);
    const { api, region } = await mountEditor({
      initialData: { elements: [rectangle("A", 100, 100), rectangle("B", 300, 100)] },
    });
    await select(api, "A");
    key(region, { key: "E", code: "KeyE", shiftKey: true, ...ctrl });
    await settle();
    expect(api.getAppState().openDialog).toEqual({ name: "imageExport" });
    const dialog = screen.getByRole("dialog", { name: "Export image" });
    await until(() => dialog.querySelector("[data-testid=image-export-preview] canvas") !== null);
    expect(ariaViolations(dialog)).toEqual([]);

    const onlySelected = within(dialog).getByRole("switch", { name: "Only selected" });
    expect(
      onlySelected.getAttribute("aria-checked") ?? (onlySelected as HTMLInputElement).checked,
    ).toBeTruthy();
    await user.click(within(dialog).getByRole("switch", { name: "Background" }));
    await settle();
    expect(api.getAppState().exportBackground).toBe(false);
    await user.click(within(dialog).getByRole("switch", { name: "Embed scene" }));
    await settle();
    expect(api.getAppState().exportEmbedScene).toBe(true);
    await user.click(within(dialog).getByRole("button", { name: "2×" }));
    await settle();
    expect(api.getAppState().exportScale).toBe(2);

    await user.click(within(dialog).getByRole("button", { name: "Export to PNG" }));
    await until(() => handle.written.length === 1);
    expect(calls.save).toBe(1);
    const restored = await loadFromBlob(handle.written[0]!, null, null);
    // only the selection was exported, its scene embedded
    expect(restored.elements.map((element) => element.id)).toEqual(["A"]);
    await until(() => api.getAppState().fileHandle === handle);
  });

  test("an empty canvas exports nothing, and says so", async () => {
    const handle = memoryHandle("drawing.png");
    const calls = usePickers(handle);
    const { api, region } = await mountEditor();
    key(region, { key: "E", code: "KeyE", shiftKey: true, ...ctrl });
    await settle();
    const dialog = screen.getByRole("dialog", { name: "Export image" });
    await user.click(within(dialog).getByRole("button", { name: "Export to SVG" }));
    await until(() => api.getAppState().errorMessage !== null);
    expect(api.getAppState().errorMessage).toEqual({ key: "alerts.cannotExportEmptyCanvas" });
    expect(calls.save).toBe(0);
  });

  test("the host turning image export off takes its entry and shortcut", async () => {
    const { api, region } = await mountEditor({
      initialData: { elements: [rectangle("A", 100, 100)] },
      UIOptions: { canvasActions: { saveAsImage: false } },
    });
    key(region, { key: "E", code: "KeyE", shiftKey: true, ...ctrl });
    await settle();
    expect(api.getAppState().openDialog).toBeNull();
    await user.click(screen.getByRole("button", { name: "Menu" }));
    await settle();
    expect(screen.queryByTestId("image-export-button")).toBeNull();
  });
});

interface IdRef {
  id: string;
}

describe("save and load", () => {
  test("the export dialog saves to a file, and Ctrl+S saves to it again", async () => {
    const handle = memoryHandle("drawing.excalidraw");
    const calls = usePickers(handle);
    const { api, region } = await mountEditor({
      initialData: { elements: [rectangle("A", 100, 100)] },
      name: "drawing",
    });
    expect(screen.queryByTestId("save-button")).toBeNull();
    await openMenuItem(/Save to\.\.\./);
    const dialog = screen.getByRole("dialog", { name: "Save to..." });
    await user.click(within(dialog).getByRole("button", { name: "Save to file" }));
    await until(() => api.getAppState().fileHandle === handle);
    expect(calls.save).toBe(1);
    expect(api.getAppState().openDialog).toBeNull();
    expect(JSON.parse(await handle.written[0]!.text()).elements[0].id).toBe("A");

    api.updateScene({ elements: [...api.getSceneElements(), rectangle("B", 300, 100)] });
    await settle();
    key(region, { key: "s", code: "KeyS", ...ctrl });
    let saved = { elements: [] as IdRef[] };
    for (let round = 0; round < 40 && saved.elements.length < 2; round++) {
      await settle();
      saved = JSON.parse(await handle.written[0]!.text());
    }
    expect(saved.elements.map((element) => element.id)).toEqual(["A", "B"]);
    expect(calls.save).toBe(1);
    expect(api.getAppState().toast?.message).toEqual({
      key: "toast.fileSavedToFilename",
      replacement: { filename: '"drawing.excalidraw"' },
    });

    await user.click(screen.getByRole("button", { name: "Menu" }));
    await settle();
    expect(screen.getByTestId("save-button")).toBeDefined();
  });

  test("loading over a scene asks first, replaces it, and undo brings it back", async () => {
    const file = memoryHandle("other.excalidraw", [
      new Blob([serializeAsJSON([rectangle("X", 0, 0)], {}, {}, "local")], {
        type: "application/vnd.excalidraw+json",
      }),
    ]);
    usePickers(file, file);
    const { api, region } = await mountEditor({
      initialData: { elements: [rectangle("A", 100, 100)] },
    });
    await openMenuItem(/Open/);
    const confirm = screen.getByRole("alertdialog");
    expect(confirm.textContent).toContain("replace your existing content");
    expect(confirm.querySelector("strong")?.textContent).toBe("replace your existing content");
    await user.click(within(confirm).getByRole("button", { name: "Load from file" }));
    await until(() => ids(api).join() === "X");
    expect(api.getAppState().fileHandle).toBe(file);

    key(region, { key: "z", code: "KeyZ", ...ctrl });
    await settle();
    expect(ids(api)).toEqual(["A"]);
  });

  test("a save waits for the host's onExport, showing its progress", async () => {
    const handle = memoryHandle("drawing.excalidraw");
    usePickers(handle);
    const seen: string[] = [];
    let release: () => void = () => {};
    const { api, region } = await mountEditor({
      initialData: { elements: [rectangle("A", 100, 100)] },
      onExport: async function* (type) {
        seen.push(type);
        yield { type: "progress", progress: 0.5 };
        await new Promise<void>((resolve) => (release = resolve));
        yield { type: "done" };
      },
    });
    key(region, { key: "S", code: "KeyS", shiftKey: true, ...ctrl });
    await until(() => api.getAppState().toast?.progress === 0.5);
    expect(seen).toEqual(["json"]);
    expect(handle.written).toHaveLength(0);
    release();
    await until(() => handle.written.length === 1);
    await until(() => api.getAppState().fileHandle === handle);
  });

  test("the host turning saving off takes its shortcut too", async () => {
    const handle = memoryHandle("drawing.excalidraw");
    const calls = usePickers(handle);
    const { region } = await mountEditor({
      initialData: { elements: [rectangle("A", 100, 100)] },
      UIOptions: { canvasActions: { saveToActiveFile: false, loadScene: false } },
    });
    key(region, { key: "s", code: "KeyS", ...ctrl });
    key(region, { key: "o", code: "KeyO", ...ctrl });
    await settle();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toEqual({ save: 0, open: 0 });
  });
});
