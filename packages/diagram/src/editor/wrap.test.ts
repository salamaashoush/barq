/**
 * W, Excalidraw's `toggleWrap`: a text into a container, texts into new
 * containers and out again, labelled containers freed and wrapped back, and
 * other selections in and out of a frame.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { newTextElement } from "@excalidraw/element";

import { API, Keyboard, h, renderEditor, unmountEditors } from "./test-editor.ts";

import type { ExcalidrawTextElement } from "@excalidraw/element/types";

afterEach(unmountEditors);

const rect = (id: string, x = 0, y = 0, size = 100) =>
  API.createElement({ id, x, y, width: size, height: size });

const free = (id: string, x: number, y: number) => ({
  ...newTextElement({ x, y, text: "label" }),
  id,
});

const element = (id: string) => h().scene.getElement(id)!;
const text = (id: string) => element(id) as ExcalidrawTextElement;
const selected = () => Object.keys(h().state.selectedElementIds).toSorted();
const selectIds = (...ids: string[]) =>
  API.setSelectedElements(ids.map((id) => h().scene.getNonDeletedElement(id)!));

describe("toggleWrap", () => {
  test("binds a text to the empty container selected with it", () => {
    renderEditor();
    API.loadElements([rect("A", 0, 0, 200), free("T", 300, 300)]);
    selectIds("A", "T");
    Keyboard.keyPress("w");
    expect(text("T").containerId).toBe("A");
    expect(selected()).toEqual(["A"]);
  });

  test("wraps a free text in a new container, and the next W takes the container away", () => {
    renderEditor();
    API.loadElements([free("T", 300, 300)]);
    selectIds("T");
    Keyboard.keyPress("w");
    const containerId = text("T").containerId!;
    expect(element(containerId).type).toBe("rectangle");
    expect(selected()).toEqual([containerId]);

    Keyboard.keyPress("w");
    expect(text("T").containerId).toBeNull();
    expect(element(containerId).isDeleted).toBe(true);
    expect(selected()).toEqual(["T"]);
  });

  test("frees a label, keeping both selected, and the next W puts it back", () => {
    renderEditor();
    API.loadElements([rect("A", 0, 0, 200), free("T", 300, 300)]);
    selectIds("A", "T");
    Keyboard.keyPress("w");
    selectIds("A");

    Keyboard.keyPress("w");
    expect(text("T").containerId).toBeNull();
    expect(element("A").isDeleted).toBe(false);
    expect(selected()).toEqual(["A", "T"]);

    Keyboard.keyPress("w");
    expect(text("T").containerId).toBe("A");
    expect(selected()).toEqual(["A"]);
  });

  test("frames shapes, and unframes them again", () => {
    renderEditor();
    API.loadElements([rect("A", 0, 0), rect("B", 200, 0)]);
    selectIds("A", "B");
    Keyboard.keyPress("w");
    const frameId = element("A").frameId!;
    expect(element(frameId).type).toBe("frame");
    expect(element("B").frameId).toBe(frameId);

    selectIds(frameId);
    Keyboard.keyPress("w");
    expect(element(frameId).isDeleted).toBe(true);
    expect(element("A").frameId).toBeNull();
  });

  test("does nothing with nothing selected, and undoes as one step", () => {
    renderEditor();
    API.loadElements([free("T", 300, 300)]);
    Keyboard.keyPress("w");
    expect(text("T").containerId).toBeNull();
    selectIds("T");
    Keyboard.keyPress("w");
    expect(text("T").containerId).not.toBeNull();
    Keyboard.undo();
    expect(text("T").containerId).toBeNull();
  });
});
