/**
 * Opening and saving through the File System Access API, and through a file
 * input and a download without it; scenes and images round-tripped through
 * those files.
 */

import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { MIME_TYPES, SVG_DOCUMENT_PREAMBLE } from "@excalidraw/common";

import { getDefaultAppState } from "../app-state.ts";
import { convertToExcalidrawElements } from "../index.ts";
import { loadFromBlob } from "./blob.ts";
import { exportCanvas, loadFromJSON, saveAsJSON, saveLibraryAsJSON } from "./files.ts";
import { fileOpen, fileSave, isNativeFileSystemSupported } from "./filesystem.ts";

import type { AppState } from "../types.ts";

type PickerWindow = Window & {
  showOpenFilePicker?: unknown;
  showSaveFilePicker?: unknown;
};

const view = window as PickerWindow;

afterEach(() => {
  delete view.showOpenFilePicker;
  delete view.showSaveFilePicker;
});

/** A handle that keeps what is written to it, and reads it back as a file. */
function memoryHandle(name: string) {
  const written: Blob[] = [];
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

interface PickerCalls {
  save: unknown[];
  open: unknown[];
}

function usePickers(handle: ReturnType<typeof memoryHandle>) {
  const calls: PickerCalls = { save: [], open: [] };
  view.showSaveFilePicker = async (options: unknown) => {
    calls.save.push(options);
    return handle;
  };
  view.showOpenFilePicker = async (options: unknown) => {
    calls.open.push(options);
    return [handle];
  };
  return calls;
}

interface Download {
  name: string;
  href: string;
}

/** Captures the downloads the fallback starts. */
function captureDownloads() {
  const downloads: Download[] = [];
  const click = spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloads.push({ name: this.download, href: this.href });
  });
  return { downloads, restore: () => click.mockRestore() };
}

function scene() {
  return convertToExcalidrawElements([
    { type: "rectangle", x: 10, y: 20, width: 100, height: 50, id: "box" },
    { type: "text", x: 200, y: 20, text: "Hello", id: "label" },
  ]);
}

function appState(): AppState {
  return { ...getDefaultAppState(), name: "Release plan" } as AppState;
}

describe("filesystem", () => {
  test("without the API a save downloads the file and an open uses a file input", async () => {
    expect(isNativeFileSystemSupported()).toBe(false);
    const { downloads, restore } = captureDownloads();
    const handle = await fileSave(new Blob(["{}"], { type: MIME_TYPES.json }), {
      name: "drawing",
      extension: "excalidraw",
      description: "Excalidraw file",
    });
    restore();
    expect(handle).toBeNull();
    expect(downloads.map((download) => download.name)).toEqual(["drawing.excalidraw"]);
    expect(downloads[0]?.href.startsWith("blob:")).toBe(true);

    const click = spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (
      this: HTMLInputElement,
    ) {
      expect(this.type).toBe("file");
      expect(this.accept).toContain(".excalidrawlib");
      Object.defineProperty(this, "files", {
        value: [new File(["{}"], "shapes.excalidrawlib")],
      });
      this.dispatchEvent(new Event("change"));
    });
    const file = await fileOpen({ description: "Library", extensions: ["excalidrawlib"] });
    click.mockRestore();
    expect(file.name).toBe("shapes.excalidrawlib");
    expect(file.type).toBe(MIME_TYPES.excalidrawlib);
  });

  test("a cancelled file input rejects with an AbortError", async () => {
    const click = spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (
      this: HTMLInputElement,
    ) {
      this.dispatchEvent(new Event("cancel"));
    });
    const opened = fileOpen({ description: "Excalidraw files" });
    await expect(opened).rejects.toMatchObject({ name: "AbortError" });
    click.mockRestore();
  });

  test("with the API a save asks once for a file, then writes to its handle", async () => {
    const handle = memoryHandle("drawing.excalidraw");
    const calls = usePickers(handle);
    expect(isNativeFileSystemSupported()).toBe(true);
    const saved = await fileSave(new Blob(["one"]), {
      name: "drawing",
      extension: "excalidraw",
      description: "Excalidraw file",
    });
    expect(saved).toBe(handle);
    expect(calls.save).toEqual([
      {
        suggestedName: "drawing.excalidraw",
        types: [
          {
            description: "Excalidraw file",
            accept: { [MIME_TYPES.excalidraw]: [".excalidraw"] },
          },
        ],
      },
    ]);
    await fileSave(new Blob(["two"]), {
      name: "drawing",
      extension: "excalidraw",
      description: "Excalidraw file",
      fileHandle: handle,
    });
    expect(calls.save).toHaveLength(1);
    expect(await handle.written[0]?.text()).toBe("two");
  });
});

interface IdRef {
  id: string;
}

describe("scene files", () => {
  test("saveAsJSON writes the scene that loadFromJSON opens again, with its handle", async () => {
    const handle = memoryHandle("Release plan.excalidraw");
    usePickers(handle);
    const elements = scene();
    const { fileHandle } = await saveAsJSON({
      data: { elements, appState: appState(), files: {} },
      filename: "Release plan",
      fileHandle: null,
    });
    expect(fileHandle).toBe(handle);
    const json = JSON.parse(await handle.written[0]!.text());
    expect(json.type).toBe("excalidraw");
    expect(json.elements.map((element: IdRef) => element.id)).toEqual(
      elements.map((element) => element.id),
    );

    const loaded = await loadFromJSON(appState(), null);
    expect(loaded.elements.map((element) => element.id)).toEqual(
      elements.map((element) => element.id),
    );
    expect(loaded.appState.fileHandle).toBe(handle);
  });

  test("an image file handle is never overwritten with JSON", async () => {
    const image = memoryHandle("drawing.excalidraw.png");
    const fresh = memoryHandle("drawing.excalidraw");
    const calls = usePickers(fresh);
    const { fileHandle } = await saveAsJSON({
      data: { elements: scene(), appState: appState(), files: {} },
      filename: "drawing",
      fileHandle: image,
    });
    expect(fileHandle).toBe(fresh);
    expect(calls.save).toHaveLength(1);
    expect(image.written).toHaveLength(0);
  });

  test("the library saves as an .excalidrawlib file", async () => {
    const { downloads, restore } = captureDownloads();
    await saveLibraryAsJSON([]);
    restore();
    expect(downloads.map((download) => download.name)).toEqual(["library.excalidrawlib"]);
  });
});

interface SaveCall {
  suggestedName: string;
}

describe("image export", () => {
  test("a PNG with the scene embedded opens as the scene", async () => {
    const handle = memoryHandle("Release plan.excalidraw.png");
    const calls = usePickers(handle);
    const elements = scene();
    const saved = await exportCanvas(
      "png",
      elements,
      { ...appState(), exportEmbedScene: true },
      {},
      {
        exportingFrame: null,
      },
    );
    expect(saved).toBe(handle);
    expect((calls.save[0] as SaveCall).suggestedName).toBe("Release plan.excalidraw.png");
    const png = handle.written[0]!;
    expect(png.type).toBe("image/png");
    const restored = await loadFromBlob(png, null, null);
    expect(restored.elements.map((element) => element.id)).toEqual(
      elements.map((element) => element.id),
    );
  });

  test("an SVG starts with the document preamble, and carries the scene when asked", async () => {
    const plain = memoryHandle("drawing.svg");
    usePickers(plain);
    await exportCanvas(
      "svg",
      scene(),
      { ...appState(), exportEmbedScene: false },
      {},
      {
        exportingFrame: null,
      },
    );
    const markup = await plain.written[0]!.text();
    expect(markup.startsWith(SVG_DOCUMENT_PREAMBLE)).toBe(true);
    expect(markup).toContain("<svg");
    expect(markup).not.toContain("payload-type");

    const embedded = memoryHandle("drawing.excalidraw.svg");
    usePickers(embedded);
    await exportCanvas(
      "svg",
      scene(),
      { ...appState(), exportEmbedScene: true },
      {},
      {
        exportingFrame: null,
      },
    );
    const restored = await loadFromBlob(embedded.written[0]!, null, null);
    expect(restored.elements).toHaveLength(2);
  });

  test("an empty canvas is refused with a translatable error", async () => {
    await expect(
      exportCanvas("png", [], appState(), {}, { exportingFrame: null }),
    ).rejects.toMatchObject({ localized: { key: "alerts.cannotExportEmptyCanvas" } });
  });
});
