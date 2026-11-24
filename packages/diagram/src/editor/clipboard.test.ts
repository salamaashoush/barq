/**
 * The clipboard and images, as Excalidraw's `clipboard` and `image` tests
 * drive them: copy and cut put the selection on the clipboard in
 * Excalidraw's format, a paste inserts elements, text or images at the
 * pointer, a drop inserts files, and an image is cropped in the crop editor.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { EXPORT_DATA_TYPES, KEYS, MIME_TYPES } from "@excalidraw/common";
import { isImageElement, isTextElement } from "@excalidraw/element";

import type { ExcalidrawElement, ExcalidrawImageElement, FileId } from "@excalidraw/element/types";

import { createPasteEvent } from "../clipboard.ts";
import { actionCopyAsPng, actionCopyAsSvg, actionCopyText } from "./actions/clipboard.ts";
import { API, Keyboard, h, mouse, renderEditor, unmountEditors } from "./test-editor.ts";

import type { BinaryFileData, DataURL } from "../types.ts";

afterEach(unmountEditors);

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20"/></svg>';

function rect(id: string, x: number, y: number, extra: Partial<ExcalidrawElement> = {}) {
  return {
    ...API.createElement({ id, x, y, width: 50, height: 50 }),
    ...extra,
  } as ExcalidrawElement;
}

function live() {
  return h().scene.getNonDeletedElements();
}

/** Waits for the async work a paste or drop starts (file reads, image decoding). */
async function settle(rounds = 6) {
  for (let index = 0; index < rounds; index++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function clipboardEvent(type: "copy" | "cut") {
  const event = new ClipboardEvent(type, {
    clipboardData: new DataTransfer(),
    bubbles: true,
    cancelable: true,
  });
  document.dispatchEvent(event);
  return event;
}

async function paste(types: Parameters<typeof createPasteEvent>[0]) {
  document.dispatchEvent(createPasteEvent(types));
  await settle();
}

function focusEditor() {
  return h().container.focus();
}

interface CopiedElements {
  type: string;
  elements: ExcalidrawElement[];
}

describe("copy and cut", () => {
  test("Ctrl+C copies the selection, with its label, in Excalidraw's format", () => {
    renderEditor();
    API.loadElements([rect("a", 0, 0), rect("b", 100, 0)]);
    API.setSelectedElements([live()[0]!]);
    focusEditor();
    const event = clipboardEvent("copy");
    expect(event.defaultPrevented).toBe(true);
    const copied = JSON.parse(
      event.clipboardData!.getData(MIME_TYPES.excalidrawClipboard),
    ) as CopiedElements;
    expect(copied.type).toBe(EXPORT_DATA_TYPES.excalidrawClipboard);
    expect(copied.elements.map((element) => element.id)).toEqual(["a"]);
    expect(event.clipboardData!.getData(MIME_TYPES.text)).toBe(
      event.clipboardData!.getData(MIME_TYPES.excalidrawClipboard),
    );
  });

  test("Ctrl+X copies the selection and deletes it, in one undo step", () => {
    renderEditor();
    API.loadElements([rect("a", 0, 0), rect("b", 100, 0)]);
    API.setSelectedElements([live()[0]!]);
    focusEditor();
    const event = clipboardEvent("cut");
    expect(event.clipboardData!.getData(MIME_TYPES.excalidrawClipboard)).toContain('"id":"a"');
    expect(live().map((element) => element.id)).toEqual(["b"]);
    Keyboard.undo();
    expect(live().map((element) => element.id)).toEqual(["a", "b"]);
  });

  test("a copy from a text field is the text field's", () => {
    renderEditor();
    API.loadElements([rect("a", 0, 0)]);
    API.setSelectedElements([live()[0]!]);
    const input = document.createElement("input");
    h().container.append(input);
    input.focus();
    const event = new ClipboardEvent("copy", { clipboardData: new DataTransfer(), bubbles: true });
    input.dispatchEvent(event);
    expect(event.clipboardData!.getData(MIME_TYPES.excalidrawClipboard)).toBe("");
  });
});

describe("paste", () => {
  test("copied elements paste at the pointer, with new ids, selected, undoable", async () => {
    renderEditor();
    API.loadElements([rect("a", 0, 0)]);
    API.setSelectedElements([live()[0]!]);
    focusEditor();
    const copied = clipboardEvent("copy").clipboardData!.getData(MIME_TYPES.excalidrawClipboard);
    mouse.moveTo(400, 300);
    await paste({ types: { [MIME_TYPES.text]: copied } });
    const pasted = live()[1];
    expect(live()).toHaveLength(2);
    expect(pasted?.id).not.toBe("a");
    // centred on the pointer
    expect([pasted?.x, pasted?.y]).toEqual([375, 275]);
    expect(h().state.selectedElementIds).toEqual({ [pasted!.id]: true });
    Keyboard.undo();
    expect(live()).toHaveLength(1);
  });

  test("elements pasted over a frame join it", async () => {
    renderEditor();
    const { newFrameElement } = await import("@excalidraw/element");
    API.loadElements([
      { ...newFrameElement({ x: 300, y: 200, width: 300, height: 300 }), id: "f" },
    ]);
    focusEditor();
    mouse.moveTo(450, 350);
    await paste({
      types: {
        [MIME_TYPES.text]: JSON.stringify({
          type: EXPORT_DATA_TYPES.excalidrawClipboard,
          elements: [rect("x", 0, 0)],
        }),
      },
    });
    // a frame's children come before it
    expect(live().find((element) => element.id !== "f")?.frameId).toBe("f");
  });

  test("text pastes as a text element per line, centred on the pointer", async () => {
    renderEditor();
    focusEditor();
    mouse.moveTo(400, 300);
    await paste({ types: { [MIME_TYPES.text]: "first\nsecond" } });
    const texts = live().filter(isTextElement);
    expect(texts.map((text) => text.text)).toEqual(["first", "second"]);
    expect(texts[0]!.x + texts[0]!.width / 2).toBe(400);
    expect(h().state.selectedElementIds).toEqual(
      Object.fromEntries(texts.map((text) => [text.id, true])),
    );
  });

  test("Ctrl+Shift+V pastes the text as one element", async () => {
    renderEditor();
    focusEditor();
    mouse.moveTo(400, 300);
    Keyboard.withModifierKeys({ ctrl: true, shift: true }, () => Keyboard.keyDown("v"));
    await paste({ types: { [MIME_TYPES.text]: "first\nsecond" } });
    const texts = live().filter(isTextElement);
    expect(texts.map((text) => text.text)).toEqual(["first\nsecond"]);
  });

  test("HTML with only text pastes as its plain text", async () => {
    renderEditor();
    focusEditor();
    await paste({
      types: { [MIME_TYPES.html]: "<p>hello <b>there</b></p>", [MIME_TYPES.text]: "hello there" },
    });
    expect(
      live()
        .filter(isTextElement)
        .map((text) => text.text),
    ).toEqual(["hello there"]);
  });

  test("SVG code pastes as an image, its file in the scene's files", async () => {
    renderEditor();
    focusEditor();
    mouse.moveTo(400, 300);
    await paste({ types: { [MIME_TYPES.text]: SVG } });
    const [image] = live();
    expect(image?.type).toBe("image");
    const fileId = (image as ExcalidrawImageElement).fileId!;
    expect(h().getFiles()[fileId]?.mimeType).toBe(MIME_TYPES.svg);
    // its own size, centred where the pointer was
    expect([image?.width, image?.height]).toEqual([40, 20]);
    expect([image!.x + image!.width / 2, image!.y + image!.height / 2]).toEqual([400, 300]);
    expect(h().imageCache.has(fileId)).toBe(true);
    expect(h().state.selectedElementIds).toEqual({ [image!.id]: true });
    Keyboard.undo();
    expect(live()).toHaveLength(0);
  });

  test("an image file pastes as an image", async () => {
    renderEditor();
    focusEditor();
    const file = new File([SVG], "shape.svg", { type: MIME_TYPES.svg });
    await paste({ files: [file] });
    expect(live().map((element) => element.type)).toEqual(["image"]);
  });

  test("nothing is pasted in view mode", async () => {
    renderEditor({ viewModeEnabled: true });
    focusEditor();
    await paste({ types: { [MIME_TYPES.text]: "text" } });
    expect(live()).toHaveLength(0);
  });
});

interface DropInit {
  clientX?: number;
  clientY?: number;
  shiftKey?: boolean;
}

describe("dropping files", () => {
  async function drop(files: File[], init: DropInit = {}) {
    const dataTransfer = new DataTransfer();
    for (const file of files) dataTransfer.items.add(file);
    const event = new DragEvent("drop", { bubbles: true, cancelable: true });
    // happy-dom's DragEvent drops these from its init
    Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
    Object.defineProperty(event, "clientX", { value: init.clientX ?? 0 });
    Object.defineProperty(event, "clientY", { value: init.clientY ?? 0 });
    Object.defineProperty(event, "shiftKey", { value: init.shiftKey ?? false });
    h().container.dispatchEvent(event);
    await settle();
    return event;
  }

  test("images dropped go where they are dropped, several on a grid", async () => {
    renderEditor();
    const event = await drop(
      [
        new File([SVG], "a.svg", { type: MIME_TYPES.svg }),
        new File([SVG.replace("40", "41")], "b.svg", { type: MIME_TYPES.svg }),
      ],
      { clientX: 300, clientY: 200 },
    );
    expect(event.defaultPrevented).toBe(true);
    const images = live().filter(isImageElement);
    expect(images).toHaveLength(2);
    expect(images[0]!.x).not.toBe(images[1]!.x);
  });

  test("a dropped scene file replaces the scene, undoably", async () => {
    renderEditor();
    API.loadElements([rect("old", 0, 0)]);
    const scene = JSON.stringify({
      type: "excalidraw",
      version: 2,
      source: "test",
      elements: [rect("new", 100, 100)],
      appState: {},
      files: {},
    });
    await drop([new File([scene], "drawing.excalidraw", { type: MIME_TYPES.excalidraw })]);
    expect(live().map((element) => element.id)).toEqual(["new"]);
    Keyboard.undo();
    expect(live().map((element) => element.id)).toEqual(["old"]);
  });

  test("with Shift, a dropped scene file is added where it is dropped", async () => {
    renderEditor();
    API.loadElements([rect("old", 0, 0)]);
    const scene = JSON.stringify({
      type: "excalidraw",
      version: 2,
      source: "test",
      elements: [rect("new", 100, 100)],
      appState: {},
      files: {},
    });
    await drop([new File([scene], "drawing.excalidraw", { type: MIME_TYPES.excalidraw })], {
      clientX: 500,
      clientY: 400,
      shiftKey: true,
    });
    expect(live()).toHaveLength(2);
    expect([live()[1]!.x + 25, live()[1]!.y + 25]).toEqual([500, 400]);
  });
});

describe("the image tool", () => {
  beforeEach(() => {
    HTMLInputElement.prototype.click = function click(this: HTMLInputElement) {
      if (this.type !== "file") return;
      Object.defineProperty(this, "files", {
        value: [new File([SVG], "picked.svg", { type: MIME_TYPES.svg })],
      });
      this.dispatchEvent(new Event("change"));
    };
  });

  test("9 opens a file picker, and the picked image goes in the middle of the view", async () => {
    renderEditor();
    Keyboard.keyPress("9");
    await settle();
    const [image] = live();
    expect(image?.type).toBe("image");
    expect([image!.x + image!.width / 2, image!.y + image!.height / 2]).toEqual([512, 384]);
    expect(h().state.activeTool.type).toBe("selection");
  });
});

describe("cropping", () => {
  async function loadImage() {
    const dataURL = `data:${MIME_TYPES.svg};base64,${btoa(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"></svg>',
    )}` as DataURL;
    const file: BinaryFileData = {
      id: "file" as FileId,
      mimeType: MIME_TYPES.svg,
      dataURL,
      created: 0,
    };
    API.updateScene({
      elements: [
        {
          ...API.createElement({ id: "img", x: 0, y: 0, width: 200, height: 100 }),
          type: "image",
          fileId: "file",
          status: "saved",
          scale: [1, 1],
          crop: null,
        } as unknown as ExcalidrawElement,
      ],
      captureUpdate: "NEVER",
    });
    h().addMissingFiles([file]);
    await h().loadImage(file.id);
  }

  test("Enter on an image opens the crop editor, and Escape closes it", async () => {
    renderEditor();
    await loadImage();
    API.setSelectedElements([live()[0]!]);
    Keyboard.keyPress(KEYS.ENTER);
    expect(h().state.croppingElementId).toBe("img");
    Keyboard.keyPress(KEYS.ESCAPE);
    expect(h().state.croppingElementId).toBeNull();
  });

  test("in the crop editor, a handle crops the image instead of resizing it", async () => {
    renderEditor();
    await loadImage();
    API.setSelectedElements([live()[0]!]);
    mouse.doubleClickAt(100, 50);
    expect(h().state.croppingElementId).toBe("img");
    // the east handle, 50 to the left
    const { getTransformHandles } = await import("@excalidraw/element");
    const handle = getTransformHandles(
      live()[0]!,
      h().state.zoom,
      h().scene.getNonDeletedElementsMap(),
      "mouse",
      {},
    ).e!;
    mouse.downAt(handle[0] + handle[2] / 2, handle[1] + handle[3] / 2);
    mouse.moveTo(handle[0] + handle[2] / 2 - 50, handle[1] + handle[3] / 2);
    mouse.upAt();
    const cropped = live()[0] as ExcalidrawImageElement;
    expect(cropped.width).toBe(150);
    expect(cropped.crop?.width).toBe(150);
    expect(h().state.croppingElementId).toBe("img");
    // a click elsewhere ends the crop
    mouse.clickAt(600, 600);
    expect(h().state.croppingElementId).toBeNull();
  });
});

describe("copy as an image, and as text", () => {
  test("Shift+Alt+C copies the selection as a PNG, and copying as SVG writes its markup", async () => {
    renderEditor();
    API.loadElements([rect("a", 0, 0)]);
    API.setSelectedElements([live()[0]!]);
    const written: unknown[] = [];
    const clipboard = {
      write: (items: unknown[]) => {
        written.push(...items);
        return Promise.resolve();
      },
      writeText: (text: string) => {
        written.push(text);
        return Promise.resolve();
      },
    };
    Object.defineProperty(navigator, "clipboard", { value: clipboard, configurable: true });
    globalThis.ClipboardItem ??= class {
      public constructor(public readonly items: Record<string, Blob | Promise<Blob>>) {}
    } as never;

    Keyboard.withModifierKeys({ shift: true, alt: true }, () => Keyboard.codePress("KeyC"));
    await settle();
    expect(written).toHaveLength(1);

    h().batch(() => h().actionManager.executeAction(actionCopyAsSvg));
    await settle();
    expect(String(written[1])).toStartWith("<svg");

    expect(actionCopyAsPng.name).toBe("copyAsPng");
  });

  test("copying text writes the selection's text", async () => {
    renderEditor();
    const { newTextElement } = await import("@excalidraw/element");
    API.loadElements([{ ...newTextElement({ x: 0, y: 0, text: "hello" }), id: "t" }]);
    API.setSelectedElements([live()[0]!]);
    let written = "";
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: (text: string) => {
          written = text;
          return Promise.resolve();
        },
      },
      configurable: true,
    });
    h().batch(() => h().actionManager.executeAction(actionCopyText));
    await settle();
    expect(written).toBe("hello");
  });
});
