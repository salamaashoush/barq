/**
 * Frames, as Excalidraw's frame tool and frame actions make them: a frame
 * takes in what it is drawn around or dragged into, moves and deletes with
 * its children, clips them, and shows its name over the canvas, which a
 * double-click or Enter edits.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { KEYS } from "@excalidraw/common";
import { newFrameElement } from "@excalidraw/element";

import type { ExcalidrawElement } from "@excalidraw/element/types";

import {
  actionRemoveAllElementsFromFrame,
  actionSelectAllElementsInFrame,
  actionUpdateFrameRendering,
  actionWrapSelectionInFrame,
} from "./actions/frame.ts";
import {
  API,
  Keyboard,
  getFrameName,
  h,
  mouse,
  renderEditor,
  unmountEditors,
} from "./test-editor.ts";

afterEach(unmountEditors);

const rect = (id: string, x: number, y: number, extra: Partial<ExcalidrawElement> = {}) =>
  ({
    ...API.createElement({ id, x, y, width: 50, height: 50, backgroundColor: "#ffc9c9" }),
    ...extra,
  }) as ExcalidrawElement;

const frame = (id: string, x: number, y: number, width = 300, height = 200) =>
  ({ ...newFrameElement({ x, y, width, height }), id }) as ExcalidrawElement;

const get = (id: string) => h().scene.getElement(id);

describe("the frame tool", () => {
  test("F draws a frame that takes in what it is drawn around", () => {
    renderEditor();
    API.loadElements([rect("a", 50, 50), rect("b", 500, 500)]);
    Keyboard.keyPress("f");
    expect(h().state.activeTool.type).toBe("frame");
    mouse.downAt(0, 0);
    mouse.moveTo(150, 150);
    mouse.moveTo(200, 200);
    mouse.upAt(200, 200);
    const drawn = h().scene.getNonDeletedFramesLikes()[0];
    expect(drawn?.type).toBe("frame");
    expect([drawn?.width, drawn?.height]).toEqual([200, 200]);
    expect(get("a")?.frameId).toBe(drawn!.id);
    expect(get("b")?.frameId).toBeNull();
    expect(h().state.selectedElementIds).toEqual({ [drawn!.id]: true });
  });

  test("an element dragged into a frame joins it, and out of it leaves", () => {
    renderEditor();
    API.loadElements([frame("f", 0, 0), rect("a", 400, 400)]);
    mouse.clickAt(425, 425);
    mouse.downAt(425, 425);
    mouse.moveTo(200, 200);
    mouse.moveTo(100, 100);
    mouse.upAt(100, 100);
    expect(get("a")?.frameId).toBe("f");
    mouse.downAt(100, 100);
    mouse.moveTo(300, 300);
    mouse.moveTo(500, 500);
    mouse.upAt(500, 500);
    expect(get("a")?.frameId).toBeNull();
  });

  test("a frame moves its children with it", () => {
    renderEditor();
    API.loadElements([frame("f", 0, 0), rect("a", 50, 50, { frameId: "f" })]);
    API.setSelectedElements([h().scene.getNonDeletedElements()[0]!]);
    Keyboard.keyPress(KEYS.ARROW_RIGHT);
    expect([get("f")?.x, get("a")?.x]).toEqual([1, 51]);
  });

  test("deleting a frame leaves its children, selected", () => {
    renderEditor();
    API.loadElements([frame("f", 0, 0), rect("a", 50, 50, { frameId: "f" }), rect("b", 500, 0)]);
    API.setSelectedElements([h().scene.getNonDeletedElements()[0]!]);
    Keyboard.keyPress(KEYS.DELETE);
    expect(
      h()
        .scene.getNonDeletedElements()
        .map((element) => element.id),
    ).toEqual(["a", "b"]);
    expect(get("a")?.frameId).toBeNull();
    expect(h().state.selectedElementIds).toEqual({ a: true });
  });

  test("a child is not hit where its frame clips it away", () => {
    renderEditor();
    API.loadElements([frame("f", 0, 0, 100, 100), rect("a", 80, 80, { frameId: "f" })]);
    expect(h().getElementAtPosition(90, 90)?.id).toBe("a");
    expect(h().getElementAtPosition(120, 120)).toBeNull();
  });
});

describe("frame names", () => {
  test("each frame's name is shown over the canvas, above the frame", () => {
    renderEditor();
    API.loadElements([
      frame("f", 100, 200),
      { ...frame("g", 600, 0), name: "Release" } as ExcalidrawElement,
    ]);
    h().render();
    expect(getFrameName("f")?.textContent).toBe("Frame");
    expect(getFrameName("g")?.textContent).toBe("Release");
    const style = getFrameName("f")!.style;
    expect(style.left).toBe("100px");
    // the name's bottom is FRAME_STYLE.nameOffsetY above the frame
    expect(style.bottom).toBe(`${768 + 3 - 200}px`);
    expect(style.maxWidth).toBe("300px");
  });

  test("a name follows the viewport, and hides with its frame out of view", () => {
    renderEditor();
    API.loadElements([frame("f", 100, 200)]);
    API.setAppState({ scrollX: 50 });
    h().render();
    expect(getFrameName("f")!.style.left).toBe("150px");
    API.setAppState({ scrollX: -5000 });
    h().render();
    expect(getFrameName("f")!.style.display).toBe("none");
  });

  test("Enter on a selected frame edits its name, trimmed when done", () => {
    renderEditor();
    API.loadElements([frame("f", 100, 200)]);
    API.setSelectedElements([h().scene.getNonDeletedElements()[0]!]);
    Keyboard.keyPress(KEYS.ENTER);
    expect(h().state.editingFrame).toBe("f");
    expect(getFrameName("f")?.dataset.editing).toBe("true");
    h().renameFrame("f", "  Launch  ");
    h().endFrameNameEdit();
    expect(h().state.editingFrame).toBeNull();
    expect((get("f") as { name?: string | null }).name).toBe("Launch");
    expect(getFrameName("f")?.textContent).toBe("Launch");
  });

  test("an emptied name goes back to the default title", () => {
    renderEditor();
    API.loadElements([{ ...frame("f", 100, 200), name: "Old" } as ExcalidrawElement]);
    getFrameName("f")!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(h().state.editingFrame).toBe("f");
    h().renameFrame("f", "   ");
    h().endFrameNameEdit();
    expect((get("f") as { name?: string | null }).name).toBeNull();
    expect(getFrameName("f")?.textContent).toBe("Frame");
  });

  test("a press on a name selects its frame", () => {
    renderEditor();
    API.loadElements([frame("f", 100, 200)]);
    h().render();
    // the DOM here lays nothing out: the name is 40 by 16
    getFrameName("f")!.getBoundingClientRect = () =>
      ({
        x: 100,
        y: 181,
        left: 100,
        top: 181,
        right: 140,
        bottom: 197,
        width: 40,
        height: 16,
      }) as DOMRect;
    getFrameName("f")!.dispatchEvent(
      new PointerEvent("pointerdown", {
        clientX: 110,
        clientY: 190,
        button: 0,
        buttons: 1,
        pointerId: 1,
        pointerType: "mouse",
        bubbles: true,
      }),
    );
    mouse.upAt(110, 190);
    expect(h().state.selectedElementIds).toEqual({ f: true });
  });

  test("no names while frames are not drawn", () => {
    renderEditor();
    API.loadElements([frame("f", 100, 200)]);
    expect(getFrameName("f")).not.toBeNull();
    h().batch(() => h().actionManager.executeAction(actionUpdateFrameRendering));
    expect(getFrameName("f")).toBeNull();
  });
});

describe("frame actions", () => {
  test("wrapping the selection frames it, with a margin; again unwraps it", () => {
    renderEditor();
    API.loadElements([rect("a", 100, 100), rect("b", 200, 100), rect("c", 600, 600)]);
    API.setSelectedElements(h().scene.getNonDeletedElements().slice(0, 2));
    h().batch(() => h().actionManager.executeAction(actionWrapSelectionInFrame));
    const [wrapper] = h().scene.getNonDeletedFramesLikes();
    expect([wrapper?.x, wrapper?.y, wrapper?.width, wrapper?.height]).toEqual([84, 84, 182, 82]);
    expect(get("a")?.frameId).toBe(wrapper!.id);
    expect(get("c")?.frameId).toBeNull();
    // a frame's children come right before it in the scene
    expect(
      h()
        .scene.getNonDeletedElements()
        .map((element) => element.id),
    ).toEqual(["a", "b", wrapper!.id, "c"]);

    API.setSelectedElements([get("a")!, get("b")!] as never);
    h().batch(() => h().actionManager.executeAction(actionWrapSelectionInFrame));
    expect(h().scene.getNonDeletedFramesLikes()).toHaveLength(0);
    expect(get("a")?.frameId).toBeNull();
    expect(h().state.selectedElementIds).toEqual({ a: true, b: true });
  });

  test("selecting a frame's children, and taking them out", () => {
    renderEditor();
    API.loadElements([
      frame("f", 0, 0),
      rect("a", 50, 50, { frameId: "f" }),
      rect("b", 150, 50, { frameId: "f" }),
    ]);
    API.setSelectedElements([h().scene.getNonDeletedElements()[0]!]);
    h().batch(() => h().actionManager.executeAction(actionSelectAllElementsInFrame));
    expect(h().state.selectedElementIds).toEqual({ a: true, b: true });
    API.setSelectedElements([h().scene.getNonDeletedElements()[0]!]);
    h().batch(() => h().actionManager.executeAction(actionRemoveAllElementsFromFrame));
    expect([get("a")?.frameId, get("b")?.frameId]).toEqual([null, null]);
  });
});
