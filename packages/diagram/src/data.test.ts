/**
 * Scenes in and out: Excalidraw's own exports (PNG and SVG with the scene
 * embedded, in both payload versions), a `.excalidraw` file, a library, and
 * a scene with an image, each loaded, serialized and loaded again.
 */

import { describe, expect, test } from "bun:test";
import { MIME_TYPES } from "@excalidraw/common";
import type { ExcalidrawElement } from "@excalidraw/element/types";

import {
  type BinaryFiles,
  type NormalizedZoomValue,
  exportToBlob,
  getDefaultAppState,
  loadFromBlob,
  loadLibraryFromBlob,
  loadSceneOrLibraryFromBlob,
  restore,
  serializeAsJSON,
  serializeLibraryAsJSON,
} from "./index.ts";
import { decodeTextChunk, encodeChunks, encodeTextChunk, extractChunks } from "./data/png.ts";

const FIXTURES = `${import.meta.dir}/fixtures`;

async function fixture(name: string, type: string): Promise<Blob> {
  return new Blob([await Bun.file(`${FIXTURES}/${name}`).arrayBuffer()], { type });
}

/** What an element is, without the fields a restore is free to renumber. */
function shape(element: ExcalidrawElement): Record<string, unknown> {
  const { version: _version, versionNonce: _nonce, updated: _updated, ...rest } = element;
  return rest;
}

describe("Excalidraw's own exports", () => {
  test.each([
    ["smiley_embedded_v2.png", MIME_TYPES.png],
    ["smiley_embedded_v2.svg", MIME_TYPES.svg],
    ["test_embedded_v1.png", MIME_TYPES.png],
    ["test_embedded_v1.svg", MIME_TYPES.svg],
  ])("%s loads with its scene", async (name, type) => {
    const scene = await loadFromBlob(await fixture(name, type), null, null);
    expect(scene.elements.length).toBeGreaterThan(0);
    expect(scene.elements.every((element) => typeof element.id === "string")).toBe(true);
    expect(scene.appState.viewBackgroundColor).toBeString();
    // The restored app state is whole: every key Excalidraw has, defaults filled in.
    for (const key of Object.keys(getDefaultAppState())) {
      expect(scene.appState).toHaveProperty(key);
    }
  });

  test.each([
    ["smiley_embedded_v2.png", MIME_TYPES.png],
    ["smiley_embedded_v2.svg", MIME_TYPES.svg],
  ])("%s carries its emoji text with its color", async (name, type) => {
    const scene = await loadFromBlob(await fixture(name, type), null, null);
    const text = scene.elements.find((element) => element.type === "text");
    expect(text).toMatchObject({ type: "text", text: "😀", strokeColor: "#c92a2a" });
  });

  test("an image without a scene says so", async () => {
    const plain = await fixture("deer.png", MIME_TYPES.png);
    await expect(loadFromBlob(plain, null, null)).rejects.toMatchObject({
      code: "IMAGE_NOT_CONTAINS_SCENE_DATA",
    });
  });
});

describe("a .excalidraw file", () => {
  test("round-trips through serializeAsJSON unchanged", async () => {
    const file = await fixture("release-flow.excalidraw", MIME_TYPES.excalidraw);
    const first = await loadFromBlob(file, null, null);
    expect(first.elements.map((element) => element.type)).toContain("frame");
    // A file keeps no name: Excalidraw's `name` is the editor's, not the scene's.
    expect(first.appState.name).toBeNull();

    const json = serializeAsJSON(first.elements, first.appState, first.files, "local");
    const parsed = JSON.parse(json) as { type: string; version: number; appState: object };
    expect(parsed.type).toBe("excalidraw");
    expect(parsed.version).toBe(2);
    // Only what a file keeps: no viewport, no selection, no theme.
    expect(Object.keys(parsed.appState).toSorted()).toEqual([
      "gridModeEnabled",
      "gridSize",
      "gridStep",
      "lockedMultiSelections",
      "viewBackgroundColor",
    ]);

    const second = await loadFromBlob(new Blob([json], { type: MIME_TYPES.json }), null, null);
    expect(second.elements.map(shape)).toEqual(first.elements.map(shape));
    expect(second.files).toEqual(first.files);
  });

  test("bindings, labels and frame membership survive", async () => {
    const { elements } = await loadFromBlob(
      await fixture("release-flow.excalidraw", MIME_TYPES.excalidraw),
      null,
      null,
    );
    const byId = new Map(elements.map((element) => [element.id, element]));
    const arrow = byId.get("go");
    expect(arrow).toMatchObject({ type: "arrow" });
    expect((arrow as { startBinding: { elementId: string } }).startBinding.elementId).toBe("start");
    expect((arrow as { endBinding: { elementId: string } }).endBinding.elementId).toBe("check");
    const label = elements.find(
      (element) => element.type === "text" && element.containerId === "start",
    );
    expect(label).toMatchObject({ text: "Start" });
    expect(byId.get("check")?.frameId).toBe("frame");
    const arabic = byId.get("arabic");
    expect(arabic).toMatchObject({ type: "text", text: "مرحبا بالعالم" });
  });

  test("an image element keeps its file, and a file only deleted elements use is dropped", async () => {
    const { elements, appState, files } = await loadFromBlob(
      await fixture("release-flow.excalidraw", MIME_TYPES.excalidraw),
      null,
      null,
    );
    const image = elements.find((element) => element.type === "image");
    const fileId = (image as { fileId: string }).fileId;
    expect(files[fileId]?.dataURL.startsWith("data:image/png;base64,")).toBe(true);

    const deleted = elements.map((element) =>
      element.type === "image" ? { ...element, isDeleted: true } : element,
    );
    const json = JSON.parse(serializeAsJSON(deleted, appState, files, "local")) as {
      files: BinaryFiles;
    };
    expect(json.files).toEqual({});
  });

  test("restore fills a partial scene the way Excalidraw's does", () => {
    const restored = restore(
      {
        elements: [{ id: "r", type: "rectangle", x: 1, y: 2, width: 30, height: 40 } as never],
        appState: { viewBackgroundColor: "#123456", zoom: 2 as never },
      },
      null,
      null,
    );
    const [rectangle] = restored.elements;
    expect(rectangle).toMatchObject({
      id: "r",
      type: "rectangle",
      strokeColor: "#1e1e1e",
      isDeleted: false,
      opacity: 100,
    });
    expect(rectangle?.index).toBeString();
    expect(restored.appState.viewBackgroundColor).toBe("#123456");
    expect(restored.appState.zoom).toEqual({ value: 2 as NormalizedZoomValue });
    expect(restored.files).toEqual({});
  });

  test("a scene file that is not one is refused", async () => {
    await expect(
      loadFromBlob(new Blob(['{"type":"something"}'], { type: MIME_TYPES.json }), null, null),
    ).rejects.toThrow("invalid file");
  });
});

describe("libraries", () => {
  test("Excalidraw's library fixture loads and serializes back", async () => {
    const blob = await fixture("fixture_library.excalidrawlib", MIME_TYPES.excalidrawlib);
    const items = await loadLibraryFromBlob(blob);
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]?.status).toBe("unpublished");
    const again = await loadLibraryFromBlob(
      new Blob([serializeLibraryAsJSON(items)], { type: MIME_TYPES.excalidrawlib }),
    );
    expect(again).toEqual(items);
  });

  test("a library is told apart from a scene", async () => {
    const loaded = await loadSceneOrLibraryFromBlob(
      await fixture("fixture_library.excalidrawlib", MIME_TYPES.excalidrawlib),
      null,
      null,
    );
    expect(loaded.type).toBe(MIME_TYPES.excalidrawlib);
  });
});

describe("PNG metadata", () => {
  test("tEXt chunks encode and decode with valid CRCs", () => {
    const png = encodeChunks([
      { name: "IHDR", data: new Uint8Array(13) },
      encodeTextChunk("application/vnd.excalidraw+json", '{"a":"é"}'),
      { name: "IEND", data: new Uint8Array(0) },
    ]);
    const chunks = extractChunks(png);
    expect(chunks.map((chunk) => chunk.name)).toEqual(["IHDR", "tEXt", "IEND"]);
    expect(decodeTextChunk(chunks[1]!.data)).toEqual({
      keyword: "application/vnd.excalidraw+json",
      text: '{"a":"é"}',
    });
    png[20] = png[20]! ^ 0xff;
    expect(() => extractChunks(png)).toThrow("CRC");
  });

  test("a PNG exported with the scene embedded opens as that scene", async () => {
    const source = await loadFromBlob(
      await fixture("release-flow.excalidraw", MIME_TYPES.excalidraw),
      null,
      null,
    );
    const png = await exportToBlob({
      elements: source.elements,
      appState: { ...source.appState, exportEmbedScene: true, exportBackground: false },
      files: source.files,
      mimeType: MIME_TYPES.png,
    });
    expect(png.type).toBe(MIME_TYPES.png);
    const reopened = await loadFromBlob(png, null, null);
    expect(reopened.elements.map(shape)).toEqual(source.elements.map(shape));
    expect(reopened.files).toEqual(source.files);
  });
});
