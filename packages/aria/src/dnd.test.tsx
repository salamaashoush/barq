import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { type Child, createRoot, createSignal, flush, Show } from "@barqjs/core";
import { ref as makeRef } from "@barqjs/primitives/refs";
import { render, screen, user } from "@barqjs/testing";
import { button } from "./button.tsx";
import { buildCollection, type Key, ListCollection } from "./collections.ts";
import {
  clipboard,
  type ClipboardOptions,
  CUSTOM_DRAG_TYPE,
  DataTransferTypes,
  DIRECTORY_DRAG_TYPE,
  drag,
  type DragOptions,
  dragSession,
  drop,
  type DragTypes,
  type DropEvent,
  type DropOperation,
  type DropOptions,
  type DropTarget,
  droppableCollectionState,
  GENERIC_TYPE,
  getTypes,
  isDirectoryDropItem,
  isFileDropItem,
  isTextDropItem,
  ListDropTargetDelegate,
  navigateDropTarget,
  TreeDropTargetDelegate,
  dndStrings,
  readFromDataTransfer,
  writeToDataTransfer,
} from "./dnd/index.ts";
import { StringFormatter } from "./i18n.ts";
import { clearAnnouncer } from "./live.ts";
import { isMac } from "./platform.ts";
import { ListKeyboardDelegate } from "./selection.ts";
import { type TreeCollection, treeState } from "./tree.tsx";
import {
  announcements,
  asDataTransfer,
  fireClipboard,
  fireDrag,
  MockDataTransfer,
  MockFileSystemDirectoryEntry,
  MockFileSystemFileEntry,
  nextFrame,
  restoreRects,
  stubRects,
} from "./test-dnd.ts";
import { mergeProps } from "./utils.ts";

function Draggable(props: {
  options?: Partial<DragOptions>;
  children?: Child;
  renderPreview?: (items: unknown) => void;
}) {
  const { dragProps, isDragging } = drag({
    getItems: () => [{ "text/plain": "hello world" }],
    ...props.options,
  });
  return (
    <div {...dragProps} role="button" tabIndex={0} data-dragging={String(isDragging())}>
      {props.children ?? "Drag me"}
    </div>
  );
}

function Droppable(props: { options?: Partial<DropOptions>; children?: Child }) {
  const domRef = makeRef<HTMLDivElement>();
  const { dropProps, isDropTarget } = drop({ ref: domRef, ...props.options });
  const { buttonProps } = button({ elementType: "div" }, domRef);
  return (
    <div
      {...mergeProps(dropProps, buttonProps)}
      ref={domRef.set}
      data-droptarget={String(isDropTarget())}
    >
      {props.children ?? "Drop here"}
    </div>
  );
}

const RECT = { left: 0, top: 0, right: 100, bottom: 50, x: 0, y: 0, width: 100, height: 50 };

function mockRects(): { mockRestore(): void } {
  return stubRects(() => ({
    ...RECT,
    toJSON: () => RECT,
  }));
}

async function textOf(event: DropEvent, type = "text/plain"): Promise<string> {
  const item = event.items[0];
  if (item === undefined || !isTextDropItem(item)) throw new Error("not a text item");
  return item.getText(type);
}

let rects: { mockRestore(): void };

beforeEach(() => {
  rects = mockRects();
  clearAnnouncer();
});

afterEach(async () => {
  if (dragSession() !== null) {
    user.keyDown("Escape");
    user.keyUp("Escape");
  }
  await nextFrame();
  rects.mockRestore();
  restoreRects();
});

describe("native drag and drop", () => {
  test("drags and drops", async () => {
    const onDragStart = mock();
    const onDragMove = mock();
    const onDragEnd = mock();
    const onDropEnter = mock();
    const onDropMove = mock();
    const onDrop = mock();
    render(() => (
      <>
        <Draggable options={{ onDragStart, onDragMove, onDragEnd }} />
        <Droppable options={{ onDropEnter, onDropMove, onDrop }} />
      </>
    ));

    const draggable = screen.getByText("Drag me");
    const droppable = screen.getByText("Drop here");
    expect(draggable.getAttribute("draggable")).toBe("true");
    expect(draggable.getAttribute("data-dragging")).toBe("false");
    expect(droppable.getAttribute("data-droptarget")).toBe("false");

    const dataTransfer = new MockDataTransfer();
    fireDrag(draggable, "dragstart", { dataTransfer, clientX: 0, clientY: 0 });
    expect(dataTransfer.dropEffect).toBe("none");
    expect(dataTransfer.effectAllowed).toBe("all");
    expect(dataTransfer.entries()).toEqual([{ type: "text/plain", data: "hello world" }]);
    expect(dataTransfer.dragImage).toBeUndefined();
    expect(onDragStart).toHaveBeenCalledWith({ type: "dragstart", x: 0, y: 0 });

    await nextFrame();
    expect(draggable.getAttribute("data-dragging")).toBe("true");

    fireDrag(draggable, "drag", { dataTransfer, clientX: 1, clientY: 1 });
    expect(onDragMove).toHaveBeenCalledWith({ type: "dragmove", x: 1, y: 1 });

    fireDrag(droppable, "dragenter", { dataTransfer, clientX: 1, clientY: 1 });
    expect(onDropEnter).toHaveBeenCalledWith({ type: "dropenter", x: 1, y: 1 });
    expect(dataTransfer.dropEffect).toBe("move");
    expect(droppable.getAttribute("data-droptarget")).toBe("true");

    fireDrag(droppable, "dragover", { dataTransfer, clientX: 2, clientY: 2 });
    expect(onDropMove).toHaveBeenCalledWith({ type: "dropmove", x: 2, y: 2 });

    fireDrag(droppable, "drop", { dataTransfer, clientX: 2, clientY: 2 });
    expect(onDrop).toHaveBeenCalledTimes(1);
    const event = onDrop.mock.calls[0]?.[0] as DropEvent;
    expect(event).toMatchObject({ type: "drop", x: 2, y: 2, dropOperation: "move" });
    expect(event.items).toHaveLength(1);
    expect(event.items[0]).toMatchObject({ kind: "text", types: new Set(["text/plain"]) });
    expect(await textOf(event)).toBe("hello world");
    expect(droppable.getAttribute("data-droptarget")).toBe("false");

    fireDrag(draggable, "dragend", { dataTransfer, clientX: 2, clientY: 2 });
    expect(onDragEnd).toHaveBeenCalledWith({
      type: "dragend",
      x: 2,
      y: 2,
      dropOperation: "move",
    });
    expect(draggable.getAttribute("data-dragging")).toBe("false");
  });

  test("a disabled drag is not draggable", () => {
    const onDragStart = mock();
    render(() => <Draggable options={{ isDisabled: true, onDragStart }} />);
    const draggable = screen.getByText("Drag me");
    expect(draggable.getAttribute("draggable")).toBe("false");

    const dataTransfer = new MockDataTransfer();
    fireDrag(draggable, "dragstart", { dataTransfer });
    expect(onDragStart).not.toHaveBeenCalled();
    expect(dataTransfer.entries()).toEqual([]);
  });

  test("a disabled drop target hears nothing", () => {
    const onDropEnter = mock();
    const onDrop = mock();
    render(() => (
      <>
        <Draggable />
        <Droppable options={{ isDisabled: true, onDropEnter, onDrop }} />
      </>
    ));
    const droppable = screen.getByText("Drop here");
    const dataTransfer = new MockDataTransfer();
    fireDrag(screen.getByText("Drag me"), "dragstart", { dataTransfer });
    fireDrag(droppable, "dragenter", { dataTransfer });
    fireDrag(droppable, "drop", { dataTransfer });
    expect(onDropEnter).not.toHaveBeenCalled();
    expect(onDrop).not.toHaveBeenCalled();
    expect(droppable.getAttribute("data-droptarget")).toBe("false");
    fireDrag(screen.getByText("Drag me"), "dragend", { dataTransfer });
  });

  test("onDragMove and onDropMove fire only when the drag moves", () => {
    const onDragMove = mock();
    const onDropMove = mock();
    render(() => (
      <>
        <Draggable options={{ onDragMove }} />
        <Droppable options={{ onDropMove }} />
      </>
    ));
    const draggable = screen.getByText("Drag me");
    const droppable = screen.getByText("Drop here");
    const dataTransfer = new MockDataTransfer();

    fireDrag(draggable, "dragstart", { dataTransfer, clientX: 1, clientY: 1 });
    fireDrag(draggable, "drag", { dataTransfer, clientX: 1, clientY: 1 });
    expect(onDragMove).not.toHaveBeenCalled();
    fireDrag(draggable, "drag", { dataTransfer, clientX: 2, clientY: 2 });
    expect(onDragMove).toHaveBeenCalledTimes(1);

    fireDrag(droppable, "dragenter", { dataTransfer, clientX: 1, clientY: 1 });
    fireDrag(droppable, "dragover", { dataTransfer, clientX: 1, clientY: 1 });
    expect(onDropMove).not.toHaveBeenCalled();
    fireDrag(droppable, "dragover", { dataTransfer, clientX: 3, clientY: 3 });
    expect(onDropMove).toHaveBeenCalledTimes(1);
    fireDrag(draggable, "dragend", { dataTransfer });
  });

  test("leaving the target fires onDropExit, and nested elements do not", () => {
    const onDropEnter = mock();
    const onDropExit = mock();
    render(() => (
      <>
        <Draggable />
        <Droppable options={{ onDropEnter, onDropExit }}>
          <span>inner</span>
        </Droppable>
      </>
    ));
    const droppable = screen.getByRole("button", { name: "inner" });
    const inner = screen.getByText("inner");
    const dataTransfer = new MockDataTransfer();
    fireDrag(screen.getByText("Drag me"), "dragstart", { dataTransfer });

    fireDrag(droppable, "dragenter", { dataTransfer });
    fireDrag(inner, "dragenter", { dataTransfer });
    fireDrag(droppable, "dragleave", { dataTransfer });
    expect(onDropEnter).toHaveBeenCalledTimes(1);
    expect(onDropExit).not.toHaveBeenCalled();

    fireDrag(inner, "dragleave", { dataTransfer });
    expect(onDropExit).toHaveBeenCalledTimes(1);
    expect(droppable.getAttribute("data-droptarget")).toBe("false");
    fireDrag(screen.getByText("Drag me"), "dragend", { dataTransfer });
  });

  test("a drag held over the target activates it", async () => {
    const onDropActivate = mock();
    render(() => (
      <>
        <Draggable />
        <Droppable options={{ onDropActivate }} />
      </>
    ));
    const droppable = screen.getByText("Drop here");
    const dataTransfer = new MockDataTransfer();
    fireDrag(screen.getByText("Drag me"), "dragstart", { dataTransfer });
    fireDrag(droppable, "dragenter", { dataTransfer, clientX: 1, clientY: 1 });
    fireDrag(droppable, "dragover", { dataTransfer, clientX: 2, clientY: 2 });
    expect(onDropActivate).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 850));
    expect(onDropActivate).toHaveBeenCalledWith({ type: "dropactivate", x: 2, y: 2 });
    fireDrag(screen.getByText("Drag me"), "dragend", { dataTransfer });
  });

  test("a nested draggable drags alone", () => {
    const outer = mock();
    const inner = mock();
    render(() => (
      <Draggable options={{ onDragStart: outer }}>
        <Draggable options={{ onDragStart: inner }}>Inner</Draggable>
      </Draggable>
    ));
    const dataTransfer = new MockDataTransfer();
    fireDrag(screen.getByText("Inner"), "dragstart", { dataTransfer });
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
    fireDrag(screen.getByText("Inner"), "dragend", { dataTransfer });
  });

  describe("drag data", () => {
    test("several items of one type are also written as JSON", async () => {
      const onDrop = mock();
      render(() => (
        <>
          <Draggable
            options={{
              getItems: () => [{ "text/plain": "salama" }, { "text/plain": "acme" }],
            }}
          />
          <Droppable options={{ onDrop }} />
        </>
      ));
      const dataTransfer = new MockDataTransfer();
      fireDrag(screen.getByText("Drag me"), "dragstart", { dataTransfer });
      expect(dataTransfer.entries()).toEqual([
        { type: "text/plain", data: "salama\nacme" },
        {
          type: CUSTOM_DRAG_TYPE,
          data: JSON.stringify([{ "text/plain": "salama" }, { "text/plain": "acme" }]),
        },
      ]);

      const droppable = screen.getByText("Drop here");
      fireDrag(droppable, "dragenter", { dataTransfer });
      fireDrag(droppable, "drop", { dataTransfer });
      const event = onDrop.mock.calls[0]?.[0] as DropEvent;
      expect(event.items).toHaveLength(2);
      const texts = await Promise.all(
        event.items.map((item) => (isTextDropItem(item) ? item.getText("text/plain") : "")),
      );
      expect(texts).toEqual(["salama", "acme"]);
      fireDrag(screen.getByText("Drag me"), "dragend", { dataTransfer });
    });

    test("one item in several types keeps them together", async () => {
      const onDrop = mock();
      render(() => (
        <>
          <Draggable
            options={{
              getItems: () => [{ "text/plain": "salama", "text/html": "<b>salama</b>" }],
            }}
          />
          <Droppable options={{ onDrop }} />
        </>
      ));
      const dataTransfer = new MockDataTransfer();
      fireDrag(screen.getByText("Drag me"), "dragstart", { dataTransfer });
      const droppable = screen.getByText("Drop here");
      fireDrag(droppable, "dragenter", { dataTransfer });
      fireDrag(droppable, "drop", { dataTransfer });
      const event = onDrop.mock.calls[0]?.[0] as DropEvent;
      expect(event.items).toHaveLength(1);
      expect(event.items[0]).toMatchObject({ types: new Set(["text/plain", "text/html"]) });
      expect(await textOf(event, "text/html")).toBe("<b>salama</b>");
      fireDrag(screen.getByText("Drag me"), "dragend", { dataTransfer });
    });

    test("files and directories are read from the drop", async () => {
      const onDrop = mock();
      render(() => <Droppable options={{ onDrop }} />);
      const droppable = screen.getByText("Drop here");
      const file = new File(["salama"], "salama.txt", { type: "text/plain" });
      const nested = new File(["acme"], "acme.csv", { type: "" });
      const dataTransfer = new MockDataTransfer();
      dataTransfer.items.add(file);
      dataTransfer.items.add(
        new MockFileSystemDirectoryEntry("reports", [new MockFileSystemFileEntry(nested)]),
      );

      fireDrag(droppable, "dragenter", { dataTransfer });
      fireDrag(droppable, "drop", { dataTransfer });
      const event = onDrop.mock.calls[0]?.[0] as DropEvent;
      expect(event.items).toHaveLength(2);

      const [first, second] = event.items;
      if (first === undefined || !isFileDropItem(first)) throw new Error("expected a file");
      expect(first).toMatchObject({ kind: "file", type: "text/plain", name: "salama.txt" });
      expect(await first.getText()).toBe("salama");

      if (second === undefined || !isDirectoryDropItem(second)) {
        throw new Error("expected a directory");
      }
      expect(second.name).toBe("reports");
      const entries = [];
      for await (const entry of second.getEntries()) entries.push(entry);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ kind: "file", name: "acme.csv", type: GENERIC_TYPE });
    });
  });

  describe("drop operations", () => {
    test("getDropOperation overrides the default", () => {
      const onDrop = mock();
      const onDragEnd = mock();
      render(() => (
        <>
          <Draggable options={{ onDragEnd }} />
          <Droppable options={{ onDrop, getDropOperation: () => "copy" }} />
        </>
      ));
      const droppable = screen.getByText("Drop here");
      const dataTransfer = new MockDataTransfer();
      fireDrag(screen.getByText("Drag me"), "dragstart", { dataTransfer });
      fireDrag(droppable, "dragenter", { dataTransfer });
      expect(dataTransfer.dropEffect).toBe("copy");
      fireDrag(droppable, "drop", { dataTransfer });
      expect(onDrop.mock.calls[0]?.[0]).toMatchObject({ dropOperation: "copy" });
      fireDrag(screen.getByText("Drag me"), "dragend", { dataTransfer });
      expect(onDragEnd.mock.calls[0]?.[0]).toMatchObject({ dropOperation: "copy" });
    });

    test("getAllowedDropOperations narrows what the drag offers", () => {
      const getDropOperation = mock(
        (_types: DragTypes, _allowed: DropOperation[]): DropOperation => "move",
      );
      render(() => (
        <>
          <Draggable options={{ getAllowedDropOperations: () => ["copy", "link"] }} />
          <Droppable options={{ getDropOperation }} />
        </>
      ));
      const dataTransfer = new MockDataTransfer();
      fireDrag(screen.getByText("Drag me"), "dragstart", { dataTransfer });
      expect(dataTransfer.effectAllowed).toBe("copyLink");

      const droppable = screen.getByText("Drop here");
      fireDrag(droppable, "dragenter", { dataTransfer });
      expect(getDropOperation.mock.calls[0]?.[1]).toEqual(["copy", "link"]);
      // "move" is not allowed, so nothing is.
      expect(dataTransfer.dropEffect).toBe("none");
      expect(droppable.getAttribute("data-droptarget")).toBe("false");
      fireDrag(screen.getByText("Drag me"), "dragend", { dataTransfer });
    });

    test("cancel refuses the drop", () => {
      const onDropEnter = mock();
      render(() => (
        <>
          <Draggable />
          <Droppable options={{ onDropEnter, getDropOperation: () => "cancel" }} />
        </>
      ));
      const droppable = screen.getByText("Drop here");
      const dataTransfer = new MockDataTransfer();
      fireDrag(screen.getByText("Drag me"), "dragstart", { dataTransfer });
      fireDrag(droppable, "dragenter", { dataTransfer });
      expect(dataTransfer.dropEffect).toBe("none");
      expect(onDropEnter).not.toHaveBeenCalled();
      fireDrag(screen.getByText("Drag me"), "dragend", { dataTransfer });
    });

    test("a modifier key narrows the operation", () => {
      render(() => (
        <>
          <Draggable />
          <Droppable />
        </>
      ));
      const droppable = screen.getByText("Drop here");
      const dataTransfer = new MockDataTransfer();
      fireDrag(screen.getByText("Drag me"), "dragstart", { dataTransfer });
      fireDrag(droppable, "dragenter", { dataTransfer, clientX: 1, clientY: 1 });
      expect(dataTransfer.dropEffect).toBe("move");

      // Alt is copy on macOS and link elsewhere.
      fireDrag(droppable, "dragover", { dataTransfer, clientX: 1, clientY: 1, altKey: true });
      expect(dataTransfer.dropEffect).toBe(isMac() ? "copy" : "link");
      fireDrag(screen.getByText("Drag me"), "dragend", { dataTransfer });
    });

    test("the types passed to getDropOperation leave out the multi-item JSON", () => {
      const getDropOperation = mock(
        (_types: DragTypes, _allowed: DropOperation[]): DropOperation => "move",
      );
      render(() => (
        <>
          <Draggable
            options={{ getItems: () => [{ "text/plain": "salama" }, { "text/plain": "acme" }] }}
          />
          <Droppable options={{ getDropOperation }} />
        </>
      ));
      const dataTransfer = new MockDataTransfer();
      fireDrag(screen.getByText("Drag me"), "dragstart", { dataTransfer });
      fireDrag(screen.getByText("Drop here"), "dragenter", { dataTransfer });
      const types = getDropOperation.mock.calls[0]?.[0];
      expect(types?.has("text/plain")).toBe(true);
      expect(types?.has(CUSTOM_DRAG_TYPE)).toBe(false);
      fireDrag(screen.getByText("Drag me"), "dragend", { dataTransfer });
    });
  });

  describe("drag preview", () => {
    function previewDraggable(
      result: { x?: number; y?: number },
      size = { width: 20, height: 21 },
    ) {
      const node = document.createElement("div");
      spyOn(node, "getBoundingClientRect").mockImplementation(() => ({
        ...RECT,
        ...size,
        toJSON: () => size,
      }));
      const preview = (
        _items: unknown,
        callback: (node: HTMLElement | null, x?: number, y?: number) => void,
      ): void => callback(node, result.x, result.y);
      render(() => <Draggable options={{ preview }} />);
      return node;
    }

    test("the preview is photographed under the pointer", () => {
      const node = previewDraggable({}, { width: 100, height: 50 });
      const dataTransfer = new MockDataTransfer();
      fireDrag(screen.getByText("Drag me"), "dragstart", { dataTransfer, clientX: 10, clientY: 5 });
      expect(dataTransfer.dragImage).toEqual({ node, x: 10, y: 5 });
      fireDrag(screen.getByText("Drag me"), "dragend", { dataTransfer });
    });

    test("a preview smaller than the grab point is centred, at an even height", () => {
      const node = previewDraggable({});
      const dataTransfer = new MockDataTransfer();
      fireDrag(screen.getByText("Drag me"), "dragstart", {
        dataTransfer,
        clientX: 30,
        clientY: 30,
      });
      expect(dataTransfer.dragImage).toEqual({ node, x: 10, y: 10.5 });
      expect(node.style.height).toBe("22px");
      fireDrag(screen.getByText("Drag me"), "dragend", { dataTransfer });
    });

    test("the preview's own offset wins, clamped to its bounds", () => {
      const node = previewDraggable({ x: 5, y: 50 });
      const dataTransfer = new MockDataTransfer();
      fireDrag(screen.getByText("Drag me"), "dragstart", { dataTransfer, clientX: 1, clientY: 1 });
      expect(dataTransfer.dragImage).toEqual({ node, x: 5, y: 21 });
      fireDrag(screen.getByText("Drag me"), "dragend", { dataTransfer });
    });
  });
});

describe("keyboard", () => {
  async function startDrag(draggable: HTMLElement): Promise<void> {
    user.focus(draggable);
    user.keyDown("Enter", { target: draggable });
    user.keyUp("Enter", { target: draggable });
    await nextFrame();
  }

  test("Enter starts, Tab moves between targets, Enter drops", async () => {
    const onDragStart = mock();
    const onDragEnd = mock();
    const onDropEnter = mock();
    const onDropExit = mock();
    const onDrop = mock();
    const onDropEnter2 = mock();
    const onDropExit2 = mock();
    const onDrop2 = mock();
    render(() => (
      <>
        <Draggable options={{ onDragStart, onDragEnd }} />
        <Droppable options={{ onDropEnter, onDropExit, onDrop }} />
        <Droppable
          options={{ onDropEnter: onDropEnter2, onDropExit: onDropExit2, onDrop: onDrop2 }}
        >
          Drop here 2
        </Droppable>
      </>
    ));

    const draggable = screen.getByText("Drag me");
    const droppable = screen.getByText("Drop here");
    const droppable2 = screen.getByText("Drop here 2");

    user.tab();
    expect(document.activeElement).toBe(draggable);
    const describedBy = draggable.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(describedBy)?.textContent).toBe(
      "Press Enter to start dragging.",
    );

    user.keyDown("Enter");
    user.keyUp("Enter");
    expect(draggable.getAttribute("data-dragging")).toBe("true");
    expect(onDragStart).toHaveBeenCalledWith({ type: "dragstart", x: 50, y: 25 });

    await nextFrame();
    expect(document.activeElement).toBe(droppable);
    const dropDescription = droppable.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(dropDescription)?.textContent).toBe(
      "Press Enter to drop. Press Escape to cancel drag.",
    );
    expect(announcements()).toContain(
      "Started dragging. Press Tab to navigate to a drop target, then press Enter to drop, or press Escape to cancel.",
    );
    expect(onDropEnter).toHaveBeenCalledWith({ type: "dropenter", x: 50, y: 25 });
    expect(onDropEnter2).not.toHaveBeenCalled();
    expect(droppable.getAttribute("data-droptarget")).toBe("true");

    user.tab();
    expect(document.activeElement).toBe(droppable2);
    expect(onDropExit).toHaveBeenCalledWith({ type: "dropexit", x: 50, y: 25 });
    expect(onDropEnter2).toHaveBeenCalledTimes(1);
    expect(droppable.getAttribute("data-droptarget")).toBe("false");
    expect(droppable2.getAttribute("data-droptarget")).toBe("true");

    user.keyDown("Enter");
    user.keyUp("Enter");
    expect(onDrop).not.toHaveBeenCalled();
    expect(onDrop2).toHaveBeenCalledTimes(1);
    const event = onDrop2.mock.calls[0]?.[0] as DropEvent;
    expect(event).toMatchObject({ type: "drop", x: 50, y: 25, dropOperation: "move" });
    expect(await textOf(event)).toBe("hello world");
    expect(announcements()).toContain("Drop complete.");
    expect(onDropExit2).toHaveBeenCalledTimes(1);
    expect(onDragEnd).toHaveBeenCalledWith({
      type: "dragend",
      x: 50,
      y: 25,
      dropOperation: "move",
    });
    expect(draggable.getAttribute("data-dragging")).toBe("false");
    expect(droppable2.getAttribute("data-droptarget")).toBe("false");
    expect(droppable2.hasAttribute("aria-describedby")).toBe(false);
    expect(dragSession()).toBeNull();
  });

  test("Shift+Tab moves backwards, skipping what is not a target", async () => {
    render(() => (
      <>
        <Draggable />
        <Droppable>1</Droppable>
        <input aria-label="not a target" />
        <Droppable>2</Droppable>
        <Droppable>3</Droppable>
      </>
    ));
    await startDrag(screen.getByText("Drag me"));
    expect(document.activeElement).toBe(screen.getByText("1"));
    user.tab();
    expect(document.activeElement).toBe(screen.getByText("2"));
    user.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByText("1"));
    user.tab({ shift: true });
    // Back on the source, from which Tab starts the round again.
    expect(document.activeElement).toBe(screen.getByText("Drag me"));
    user.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByText("3"));
  });

  test("Escape cancels", async () => {
    const onDragEnd = mock();
    const onDrop = mock();
    render(() => (
      <>
        <Draggable options={{ onDragEnd }} />
        <Droppable options={{ onDrop }} />
      </>
    ));
    const draggable = screen.getByText("Drag me");
    await startDrag(draggable);
    expect(document.activeElement).toBe(screen.getByText("Drop here"));

    user.keyDown("Escape");
    user.keyUp("Escape");
    expect(onDrop).not.toHaveBeenCalled();
    expect(onDragEnd).toHaveBeenCalledWith({
      type: "dragend",
      x: 50,
      y: 25,
      dropOperation: "cancel",
    });
    expect(document.activeElement).toBe(draggable);
    expect(announcements()).toContain("Drop canceled.");
  });

  test("Enter on the source cancels", async () => {
    const onDragEnd = mock();
    render(() => (
      <>
        <Draggable options={{ onDragEnd }} />
        <Droppable />
      </>
    ));
    const draggable = screen.getByText("Drag me");
    await startDrag(draggable);
    user.tab();
    expect(document.activeElement).toBe(draggable);
    const describedBy = draggable.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(describedBy)?.textContent).toBe(
      "Dragging. Press Enter to cancel drag.",
    );
    user.keyDown("Enter");
    user.keyUp("Enter");
    expect(onDragEnd.mock.calls[0]?.[0]).toMatchObject({ dropOperation: "cancel" });
  });

  test("a target whose operation is cancel is not offered", async () => {
    render(() => (
      <>
        <Draggable />
        <Droppable options={{ getDropOperation: () => "cancel" }}>1</Droppable>
        <Droppable>2</Droppable>
      </>
    ));
    await startDrag(screen.getByText("Drag me"));
    expect(document.activeElement).toBe(screen.getByText("2"));
    // Everything that is not the source or a target is out of reach.
    expect(screen.getByText("1").closest("[inert], [aria-hidden='true']")).not.toBeNull();
  });

  test("the operation follows getDropOperation and the allowed operations", async () => {
    const onDrop = mock();
    const onDragEnd = mock();
    render(() => (
      <>
        <Draggable options={{ onDragEnd, getAllowedDropOperations: () => ["copy", "link"] }} />
        <Droppable
          options={{ onDrop, getDropOperation: (_types, allowed) => allowed[1] ?? "cancel" }}
        />
      </>
    ));
    await startDrag(screen.getByText("Drag me"));
    user.keyDown("Enter");
    user.keyUp("Enter");
    expect(onDrop.mock.calls[0]?.[0]).toMatchObject({ dropOperation: "link" });
    expect(onDragEnd.mock.calls[0]?.[0]).toMatchObject({ dropOperation: "link" });
  });

  test("a target removed during the drag is let go", async () => {
    const [shown, setShown] = createSignal(true);
    render(() => (
      <>
        <Draggable />
        <Droppable>1</Droppable>
        <Show when={shown()}>
          <Droppable>2</Droppable>
        </Show>
      </>
    ));
    await startDrag(screen.getByText("Drag me"));
    user.tab();
    expect(document.activeElement).toBe(screen.getByText("2"));

    setShown(false);
    flush();
    expect(document.activeElement).toBe(screen.getByText("1"));
    user.tab();
    expect(document.activeElement).toBe(screen.getByText("Drag me"));
  });

  test("a disabled drag does not start from the keyboard", async () => {
    const onDragStart = mock();
    render(() => (
      <>
        <Draggable options={{ isDisabled: true, onDragStart }} />
        <Droppable />
      </>
    ));
    await startDrag(screen.getByText("Drag me"));
    expect(onDragStart).not.toHaveBeenCalled();
    expect(dragSession()).toBeNull();
  });

  test("a disabled drop target is not offered", async () => {
    render(() => (
      <>
        <Draggable />
        <Droppable options={{ isDisabled: true }}>1</Droppable>
        <Droppable>2</Droppable>
      </>
    ));
    await startDrag(screen.getByText("Drag me"));
    expect(document.activeElement).toBe(screen.getByText("2"));
  });
});

describe("screen reader", () => {
  test("a virtual click starts the drag and another drops it", async () => {
    const onDrop = mock();
    const onDragEnd = mock();
    render(() => (
      <>
        <Draggable options={{ onDragEnd }} />
        <Droppable options={{ onDrop }} />
      </>
    ));
    const draggable = screen.getByText("Drag me");
    user.virtualClick(draggable);
    expect(draggable.getAttribute("data-dragging")).toBe("true");
    await nextFrame();
    expect(announcements()).toContain(
      "Started dragging. Navigate to a drop target, then click or press Enter to drop.",
    );
    const droppable = screen.getByText("Drop here");
    const describedBy = droppable.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(describedBy)?.textContent).toBe("Click to drop.");

    user.virtualClick(droppable);
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDragEnd.mock.calls[0]?.[0]).toMatchObject({ dropOperation: "move" });
  });

  test("a virtual click on the source cancels", async () => {
    const onDragEnd = mock();
    render(() => (
      <>
        <Draggable options={{ onDragEnd }} />
        <Droppable />
      </>
    ));
    const draggable = screen.getByText("Drag me");
    user.virtualClick(draggable);
    await nextFrame();
    user.virtualClick(draggable);
    expect(onDragEnd.mock.calls[0]?.[0]).toMatchObject({ dropOperation: "cancel" });
  });

  test("a pointer click neither starts a drag nor drops one", async () => {
    const onDragStart = mock();
    const onDrop = mock();
    render(() => (
      <>
        <Draggable options={{ onDragStart }} />
        <Droppable options={{ onDrop }} />
      </>
    ));
    // Off centre: TalkBack presses the exact centre.
    user.click(screen.getByText("Drag me"), { clientX: 10, clientY: 10 });
    expect(onDragStart).not.toHaveBeenCalled();

    user.virtualClick(screen.getByText("Drag me"));
    await nextFrame();
    user.click(screen.getByText("Drop here"), { clientX: 10, clientY: 10 });
    expect(onDrop).not.toHaveBeenCalled();
  });

  test("focus wandering off a target is brought back", async () => {
    render(() => (
      <>
        <Draggable />
        <Droppable />
        <button type="button">elsewhere</button>
      </>
    ));
    const draggable = screen.getByText("Drag me");
    user.focus(draggable);
    user.keyDown("Enter", { target: draggable });
    user.keyUp("Enter", { target: draggable });
    await nextFrame();
    const droppable = screen.getByText("Drop here");
    expect(document.activeElement).toBe(droppable);
    const elsewhere = screen.getByText("elsewhere");
    // Made inert by the drag; something that escaped it is still refused.
    expect(elsewhere.closest("[inert]")).not.toBeNull();
    elsewhere.inert = false;
    elsewhere.focus();
    flush();
    expect(document.activeElement).toBe(droppable);
  });
});

describe("clipboard", () => {
  function Copyable(props: { options?: ClipboardOptions }) {
    const { clipboardProps } = clipboard({
      getItems: () => [{ "text/plain": "hello world" }],
      ...props.options,
    });
    return (
      <div tabIndex={0} role="button" {...clipboardProps}>
        Copy
      </div>
    );
  }

  test("copies while focused", () => {
    const onCopy = mock();
    render(() => <Copyable options={{ onCopy }} />);
    const element = screen.getByRole("button");
    const data = new MockDataTransfer();

    expect(fireClipboard(element, "beforecopy", data)).toBe(true);
    fireClipboard(element, "copy", data);
    expect(onCopy).not.toHaveBeenCalled();

    user.focus(element);
    expect(fireClipboard(element, "beforecopy", data)).toBe(false);
    fireClipboard(element, "copy", data);
    expect(data.entries()).toEqual([{ type: "text/plain", data: "hello world" }]);
    expect(onCopy).toHaveBeenCalledTimes(1);
  });

  test("copies nothing without getItems", () => {
    const onCopy = mock();
    render(() => <Copyable options={{ getItems: undefined, onCopy }} />);
    const element = screen.getByRole("button");
    user.focus(element);
    const data = new MockDataTransfer();
    expect(fireClipboard(element, "beforecopy", data)).toBe(true);
    fireClipboard(element, "copy", data);
    expect(onCopy).not.toHaveBeenCalled();
  });

  test("cuts only with onCut, and says which action it was", () => {
    const onCut = mock();
    const getItems = mock((details: { action: "cut" | "copy" }) => [
      { "text/plain": details.action },
    ]);
    render(() => <Copyable options={{ onCut, getItems }} />);
    const element = screen.getByRole("button");
    user.focus(element);
    const data = new MockDataTransfer();
    expect(fireClipboard(element, "beforecut", data)).toBe(false);
    fireClipboard(element, "cut", data);
    expect(onCut).toHaveBeenCalledTimes(1);
    expect(data.entries()).toEqual([{ type: "text/plain", data: "cut" }]);

    const copied = new MockDataTransfer();
    fireClipboard(element, "copy", copied);
    expect(copied.entries()).toEqual([{ type: "text/plain", data: "copy" }]);
  });

  test("no cut without onCut", () => {
    render(() => <Copyable />);
    const element = screen.getByRole("button");
    user.focus(element);
    expect(fireClipboard(element, "beforecut", new MockDataTransfer())).toBe(true);
  });

  test("pastes while focused", async () => {
    const onPaste = mock();
    render(() => <Copyable options={{ onPaste }} />);
    const element = screen.getByRole("button");
    const data = new MockDataTransfer();
    data.items.add("salama", "text/plain");

    fireClipboard(element, "paste", data);
    expect(onPaste).not.toHaveBeenCalled();

    user.focus(element);
    expect(fireClipboard(element, "beforepaste", data)).toBe(false);
    fireClipboard(element, "paste", data);
    expect(onPaste).toHaveBeenCalledTimes(1);
    const items = onPaste.mock.calls[0]?.[0] as ReturnType<typeof readFromDataTransfer>;
    const item = items[0];
    if (item === undefined || !isTextDropItem(item)) throw new Error("expected text");
    expect(await item.getText("text/plain")).toBe("salama");
  });

  test("a disabled clipboard hears nothing", () => {
    const onPaste = mock();
    render(() => <Copyable options={{ onPaste, isDisabled: true }} />);
    const element = screen.getByRole("button");
    user.focus(element);
    const data = new MockDataTransfer();
    data.items.add("salama", "text/plain");
    expect(fireClipboard(element, "beforepaste", data)).toBe(true);
    fireClipboard(element, "paste", data);
    expect(onPaste).not.toHaveBeenCalled();
  });
});

describe("data transfer", () => {
  test("round-trips several items of several types", async () => {
    const data = new MockDataTransfer();
    writeToDataTransfer(asDataTransfer(data), [
      { "text/plain": "salama", "application/x-person": "1" },
      { "text/plain": "acme", "application/x-person": "2" },
    ]);
    expect(data.types).toEqual(["text/plain", "application/x-person", CUSTOM_DRAG_TYPE]);

    const items = readFromDataTransfer(asDataTransfer(data));
    expect(items).toHaveLength(2);
    const second = items[1];
    if (second === undefined || !isTextDropItem(second)) throw new Error("expected text");
    expect(await second.getText("application/x-person")).toBe("2");
  });

  test("types match by family, and Safari's bare Files matches anything", () => {
    const data = new MockDataTransfer();
    data.items.add(new File(["x"], "salama.png", { type: "image/png" }));
    const types = new DataTransferTypes(asDataTransfer(data));
    expect(types.has("image/png")).toBe(true);
    expect(types.has("image/*")).toBe(true);
    expect(types.has(["text/plain", "image/png"])).toBe(true);
    expect(types.has("text/plain")).toBe(false);

    const safari = { items: [], types: ["Files"] } as unknown as DataTransfer;
    expect(new DataTransferTypes(safari).has("text/plain")).toBe(true);

    const unknown = new MockDataTransfer();
    unknown.items.add(new MockFileSystemDirectoryEntry("acme", []));
    expect(new DataTransferTypes(asDataTransfer(unknown)).has(DIRECTORY_DRAG_TYPE)).toBe(true);
  });

  test("the types of keyboard items answer the same way", () => {
    const types = getTypes([{ "text/plain": "a" }, { "image/png": "b" }]);
    expect(types.has("image/*")).toBe(true);
    expect(types.has(["application/json", "text/plain"])).toBe(true);
    expect(types.has("application/json")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

const ITEMS = [
  { id: "a", name: "Salama" },
  { id: "b", name: "Acme" },
  { id: "c", name: "Example" },
];

function delegateFor(
  collection: ListCollection<unknown>,
  orientation: "horizontal" | "vertical" = "vertical",
  direction: "ltr" | "rtl" = "ltr",
): ListKeyboardDelegate {
  return new ListKeyboardDelegate({
    collection: () => collection,
    ref: null,
    disabledBehavior: () => "selection",
    orientation,
    direction,
  });
}

function walk(
  collection: ListCollection<unknown>,
  delegate: ListKeyboardDelegate,
  key: "up" | "down" | "left" | "right",
  rtl = false,
): DropTarget[] {
  const targets: DropTarget[] = [];
  let target: DropTarget | null = null;
  do {
    target = navigateDropTarget(delegate, collection, target, key, rtl);
    if (target !== null) targets.push(target);
  } while (target !== null);
  return targets;
}

const FORWARD: DropTarget[] = [
  { type: "root" },
  { type: "item", key: "a", dropPosition: "before" },
  { type: "item", key: "a", dropPosition: "on" },
  { type: "item", key: "b", dropPosition: "before" },
  { type: "item", key: "b", dropPosition: "on" },
  { type: "item", key: "c", dropPosition: "before" },
  { type: "item", key: "c", dropPosition: "on" },
  { type: "item", key: "c", dropPosition: "after" },
];

describe("drop target keyboard navigation", () => {
  const collection = buildCollection<unknown>(ITEMS);

  test("forward and backward, vertically", () => {
    const delegate = delegateFor(collection);
    expect(walk(collection, delegate, "down")).toEqual(FORWARD);
    expect(walk(collection, delegate, "up").toReversed()).toEqual(FORWARD);
  });

  test("horizontally, in both directions", () => {
    const ltr = delegateFor(collection, "horizontal", "ltr");
    expect(walk(collection, ltr, "right")).toEqual(FORWARD);
    expect(walk(collection, ltr, "left").toReversed()).toEqual(FORWARD);

    const rtl = delegateFor(collection, "horizontal", "rtl");
    expect(walk(collection, rtl, "left", true)).toEqual(FORWARD);
    expect(walk(collection, rtl, "right", true).toReversed()).toEqual(FORWARD);
  });

  test("the end of a section is its own place", () => {
    const sections = buildCollection<unknown>([
      { id: "people", name: "People", children: [{ id: "salama", name: "Salama" }] },
      { id: "companies", name: "Companies", children: [{ id: "acme", name: "Acme" }] },
    ]);
    const delegate = delegateFor(sections);
    expect(walk(sections, delegate, "down")).toEqual([
      { type: "root" },
      { type: "item", key: "salama", dropPosition: "before" },
      { type: "item", key: "salama", dropPosition: "on" },
      { type: "item", key: "acme", dropPosition: "before" },
      { type: "item", key: "acme", dropPosition: "on" },
      { type: "item", key: "acme", dropPosition: "after" },
    ]);
  });
});

describe("ListDropTargetDelegate", () => {
  function mountList(): HTMLElement {
    const container = document.createElement("div");
    for (const [index, item] of ITEMS.entries()) {
      const row = document.createElement("div");
      row.dataset.key = item.id;
      row.dataset.index = String(index);
      container.append(row);
    }
    document.body.append(container);
    return container;
  }

  test("finds before, on and after from a point", () => {
    rects.mockRestore();
    rects = stubRects(function (this: HTMLElement) {
      const index = this.dataset.index === undefined ? -1 : Number(this.dataset.index);
      const top = index < 0 ? 0 : index * 50;
      const height = index < 0 ? 150 : 50;
      const rect = {
        left: 0,
        right: 100,
        top,
        bottom: top + height,
        x: 0,
        y: top,
        width: 100,
        height,
      };
      return { ...rect, toJSON: () => rect };
    });

    const container = mountList();
    const collection = buildCollection<unknown>(ITEMS);
    const delegate = new ListDropTargetDelegate(() => collection, container);
    const any = (): boolean => true;
    const betweenOnly = (target: DropTarget): boolean =>
      target.type === "item" && target.dropPosition !== "on";

    expect(delegate.getDropTargetFromPoint(50, 25, any)).toEqual({
      type: "item",
      key: "a",
      dropPosition: "on",
    });
    expect(delegate.getDropTargetFromPoint(50, 52, any)).toEqual({
      type: "item",
      key: "b",
      dropPosition: "before",
    });
    expect(delegate.getDropTargetFromPoint(50, 98, any)).toEqual({
      type: "item",
      key: "b",
      dropPosition: "after",
    });
    expect(delegate.getDropTargetFromPoint(50, 70, betweenOnly)).toEqual({
      type: "item",
      key: "b",
      dropPosition: "before",
    });
    expect(delegate.getDropTargetFromPoint(50, 80, betweenOnly)).toEqual({
      type: "item",
      key: "b",
      dropPosition: "after",
    });
    expect(delegate.getDropTargetFromPoint(50, 400, any)).toEqual({
      type: "item",
      key: "c",
      dropPosition: "after",
    });
    container.remove();
  });

  test("an empty collection is the root", () => {
    const container = document.createElement("div");
    const delegate = new ListDropTargetDelegate(new ListCollection([]), container);
    expect(delegate.getDropTargetFromPoint(0, 0, () => true)).toEqual({ type: "root" });
  });
});

describe("droppableCollectionState", () => {
  function stateWith(
    options: Parameters<typeof droppableCollectionState>[0] extends infer O ? Partial<O> : never,
  ) {
    let state: ReturnType<typeof droppableCollectionState> | undefined;
    createRoot(() => {
      state = droppableCollectionState({
        collection: () => buildCollection<unknown>(ITEMS),
        selectionManager: () => {
          throw new Error("not needed");
        },
        ...options,
      });
    });
    if (state === undefined) throw new Error("no state");
    return state;
  }

  const types = getTypes([{ "text/plain": "salama" }]);
  const event = (target: DropTarget, isInternal: boolean, draggingKeys = new Set<Key>(["a"])) => ({
    target,
    types,
    allowedOperations: ["move", "copy"] as ("move" | "copy")[],
    isInternal,
    draggingKeys,
  });

  test("after one item and before the next are the same target", () => {
    const state = stateWith({ onReorder: () => {} });
    state.setTarget({ type: "item", key: "a", dropPosition: "after" });
    expect(state.isDropTarget({ type: "item", key: "b", dropPosition: "before" })).toBe(true);
    expect(state.isDropTarget({ type: "item", key: "b", dropPosition: "on" })).toBe(false);
    expect(state.isDropTarget({ type: "item", key: "c", dropPosition: "before" })).toBe(false);
  });

  test("each handler accepts only its own kind of drop", () => {
    const reorder = stateWith({ onReorder: () => {} });
    const between: DropTarget = { type: "item", key: "b", dropPosition: "before" };
    expect(reorder.getDropOperation(event(between, true))).toBe("move");
    expect(reorder.getDropOperation(event(between, false))).toBe("cancel");

    const insert = stateWith({ onInsert: () => {} });
    expect(insert.getDropOperation(event(between, false))).toBe("move");
    expect(insert.getDropOperation(event(between, true))).toBe("cancel");

    const root = stateWith({ onRootDrop: () => {} });
    expect(root.getDropOperation(event({ type: "root" }, false))).toBe("move");
    expect(root.getDropOperation(event({ type: "root" }, true))).toBe("cancel");

    const onItem = stateWith({ onItemDrop: () => {} });
    const onA: DropTarget = { type: "item", key: "a", dropPosition: "on" };
    const onB: DropTarget = { type: "item", key: "b", dropPosition: "on" };
    expect(onItem.getDropOperation(event(onB, true))).toBe("move");
    expect(onItem.getDropOperation(event(onA, true))).toBe("cancel");
  });

  test("acceptedDragTypes and getDropOperation decide", () => {
    const state = stateWith({
      onInsert: () => {},
      acceptedDragTypes: ["application/json"],
    });
    const between: DropTarget = { type: "item", key: "b", dropPosition: "before" };
    expect(state.getDropOperation(event(between, false))).toBe("cancel");

    const copying = stateWith({ onInsert: () => {}, getDropOperation: () => "copy" });
    expect(copying.getDropOperation(event(between, false))).toBe("copy");
  });
});

// ---------------------------------------------------------------------------
// Trees
// ---------------------------------------------------------------------------

interface Row {
  id: string;
  name: string;
  children?: Row[];
}

const ROWS: Row[] = [
  {
    id: "projects",
    name: "Projects",
    children: [
      { id: "project-1", name: "Project 1" },
      {
        id: "project-2",
        name: "Project 2",
        children: [
          { id: "project-2A", name: "Project 2A" },
          { id: "project-2B", name: "Project 2B" },
          { id: "project-2C", name: "Project 2C" },
        ],
      },
      { id: "project-3", name: "Project 3" },
      { id: "project-4", name: "Project 4" },
      {
        id: "project-5",
        name: "Project 5",
        children: [
          { id: "project-5A", name: "Project 5A" },
          { id: "project-5B", name: "Project 5B" },
          { id: "project-5C", name: "Project 5C" },
        ],
      },
    ],
  },
  {
    id: "reports",
    name: "Reports",
    children: [
      {
        id: "reports-1",
        name: "Reports 1",
        children: [
          {
            id: "reports-1A",
            name: "Reports 1A",
            children: [
              {
                id: "reports-1AB",
                name: "Reports 1AB",
                children: [{ id: "reports-1ABC", name: "Reports 1ABC" }],
              },
            ],
          },
          { id: "reports-1B", name: "Reports 1B" },
          { id: "reports-1C", name: "Reports 1C" },
        ],
      },
      { id: "reports-2", name: "Reports 2" },
    ],
  },
];

const EVERY_PARENT = [
  "projects",
  "project-2",
  "project-5",
  "reports",
  "reports-1",
  "reports-1A",
  "reports-1AB",
];

function treeOf(expanded: string[] = EVERY_PARENT): {
  collection: () => TreeCollection<unknown>;
  expandedKeys: () => Set<Key>;
} {
  let result: ReturnType<typeof treeOf> | undefined;
  createRoot(() => {
    const state = treeState<Row>({ items: ROWS, defaultExpandedKeys: expanded });
    result = {
      collection: () => state.collection(),
      expandedKeys: state.expandedKeys,
    };
  });
  if (result === undefined) throw new Error("no tree");
  return result;
}

const TREE_TARGETS: DropTarget[] = [
  { type: "root" },
  ...[
    ["projects", "before"],
    ["projects", "on"],
    ["project-1", "before"],
    ["project-1", "on"],
    ["project-2", "before"],
    ["project-2", "on"],
    ["project-2A", "before"],
    ["project-2A", "on"],
    ["project-2B", "before"],
    ["project-2B", "on"],
    ["project-2C", "before"],
    ["project-2C", "on"],
    ["project-2C", "after"],
    ["project-3", "before"],
    ["project-3", "on"],
    ["project-4", "before"],
    ["project-4", "on"],
    ["project-5", "before"],
    ["project-5", "on"],
    ["project-5A", "before"],
    ["project-5A", "on"],
    ["project-5B", "before"],
    ["project-5B", "on"],
    ["project-5C", "before"],
    ["project-5C", "on"],
    ["project-5C", "after"],
    ["project-5", "after"],
    ["reports", "before"],
    ["reports", "on"],
    ["reports-1", "before"],
    ["reports-1", "on"],
    ["reports-1A", "before"],
    ["reports-1A", "on"],
    ["reports-1AB", "before"],
    ["reports-1AB", "on"],
    ["reports-1ABC", "before"],
    ["reports-1ABC", "on"],
    ["reports-1ABC", "after"],
    ["reports-1AB", "after"],
    ["reports-1B", "before"],
    ["reports-1B", "on"],
    ["reports-1C", "before"],
    ["reports-1C", "on"],
    ["reports-1C", "after"],
    ["reports-2", "before"],
    ["reports-2", "on"],
    ["reports-2", "after"],
    ["reports", "after"],
  ].map(([key, dropPosition]) => ({ type: "item", key, dropPosition }) as DropTarget),
];

describe("drop target keyboard navigation in a tree", () => {
  const tree = treeOf();
  const collection = tree.collection();

  function walkTree(
    delegate: ListKeyboardDelegate,
    key: "up" | "down" | "left" | "right",
    rtl = false,
  ): DropTarget[] {
    const targets: DropTarget[] = [];
    let target: DropTarget | null = null;
    do {
      target = navigateDropTarget(delegate, collection, target, key, rtl);
      if (target !== null) targets.push(target);
    } while (target !== null);
    return targets;
  }

  const delegate = (orientation: "horizontal" | "vertical", direction: "ltr" | "rtl") =>
    new ListKeyboardDelegate({
      collection: () => collection,
      ref: null,
      disabledBehavior: () => "selection",
      orientation,
      direction,
    });

  test("forward and backward vertically, through every level", () => {
    expect(walkTree(delegate("vertical", "ltr"), "down")).toEqual(TREE_TARGETS);
    expect(walkTree(delegate("vertical", "ltr"), "up").toReversed()).toEqual(TREE_TARGETS);
  });

  test("horizontally, in both directions", () => {
    expect(walkTree(delegate("horizontal", "ltr"), "right")).toEqual(TREE_TARGETS);
    expect(walkTree(delegate("horizontal", "ltr"), "left").toReversed()).toEqual(TREE_TARGETS);
    expect(walkTree(delegate("horizontal", "rtl"), "left", true)).toEqual(TREE_TARGETS);
    expect(walkTree(delegate("horizontal", "rtl"), "right", true).toReversed()).toEqual(
      TREE_TARGETS,
    );
  });

  test("a collapsed row's children are not visited", () => {
    const closed = treeOf(["projects"]).collection();
    const targets: DropTarget[] = [];
    let target: DropTarget | null = null;
    const vertical = new ListKeyboardDelegate({
      collection: () => closed,
      ref: null,
      disabledBehavior: () => "selection",
    });
    do {
      target = navigateDropTarget(vertical, closed, target, "down");
      if (target !== null) targets.push(target);
    } while (target !== null);
    const keys = new Set(targets.flatMap((each) => (each.type === "item" ? [each.key] : [])));
    expect(keys.has("project-2")).toBe(true);
    expect(keys.has("project-2A")).toBe(false);
    expect(keys.has("reports-1")).toBe(false);
    expect(targets.at(-1)).toEqual({ type: "item", key: "reports", dropPosition: "after" });
  });
});

describe("TreeDropTargetDelegate", () => {
  /** A flat delegate that answers whatever the test last told it to. */
  function fixed(): { delegate: { getDropTargetFromPoint(): DropTarget }; answer: DropTarget } {
    const holder = {
      answer: { type: "root" } as DropTarget,
      delegate: { getDropTargetFromPoint: () => holder.answer },
    };
    return holder;
  }
  const any = (): boolean => true;

  test("before a row reads as after the row above it", () => {
    const base = fixed();
    const delegate = new TreeDropTargetDelegate(base.delegate, treeOf());
    base.answer = { type: "item", key: "project-2", dropPosition: "before" };
    expect(delegate.getDropTargetFromPoint(0, 0, any)).toEqual({
      type: "item",
      key: "project-1",
      dropPosition: "after",
    });
  });

  test("after an open parent reads as before its first child", () => {
    const base = fixed();
    const delegate = new TreeDropTargetDelegate(base.delegate, treeOf());
    base.answer = { type: "item", key: "project-2", dropPosition: "after" };
    expect(delegate.getDropTargetFromPoint(0, 0, any)).toEqual({
      type: "item",
      key: "project-2A",
      dropPosition: "before",
    });
  });

  test("the root and a drop on a row pass through", () => {
    const base = fixed();
    const delegate = new TreeDropTargetDelegate(base.delegate, treeOf());
    expect(delegate.getDropTargetFromPoint(0, 0, any)).toEqual({ type: "root" });
    base.answer = { type: "item", key: "reports", dropPosition: "on" };
    expect(delegate.getDropTargetFromPoint(0, 0, any)).toEqual(base.answer);
  });

  test("below the end of a branch, moving left walks out a level at a time", () => {
    const base = fixed();
    const delegate = new TreeDropTargetDelegate(base.delegate, treeOf());
    base.answer = { type: "item", key: "project-5C", dropPosition: "after" };
    const at = (x: number) => delegate.getDropTargetFromPoint(x, 500, any);
    expect(at(100)).toEqual({ type: "item", key: "project-5C", dropPosition: "after" });
    expect(at(80)).toEqual({ type: "item", key: "project-5", dropPosition: "after" });
    expect(at(60)).toEqual({ type: "item", key: "projects", dropPosition: "after" });
    // No further out than the top: Reports follows.
    expect(at(40)).toEqual({ type: "item", key: "projects", dropPosition: "after" });
    // Back in is measured from where the last switch happened, at 60.
    expect(at(55)).toEqual({ type: "item", key: "projects", dropPosition: "after" });
    expect(at(75)).toEqual({ type: "item", key: "project-5", dropPosition: "after" });
  });

  test("right to left, moving right walks out", () => {
    const base = fixed();
    const delegate = new TreeDropTargetDelegate(base.delegate, treeOf(), "rtl");
    base.answer = { type: "item", key: "project-5C", dropPosition: "after" };
    const at = (x: number) => delegate.getDropTargetFromPoint(x, 500, any);
    expect(at(100)).toEqual({ type: "item", key: "project-5C", dropPosition: "after" });
    expect(at(120)).toEqual({ type: "item", key: "project-5", dropPosition: "after" });
  });

  test("a level that refuses the drop is skipped", () => {
    const base = fixed();
    const delegate = new TreeDropTargetDelegate(base.delegate, treeOf());
    base.answer = { type: "item", key: "project-5C", dropPosition: "after" };
    const notProject5 = (target: DropTarget): boolean =>
      !(target.type === "item" && target.key === "project-5");
    expect(delegate.getDropTargetFromPoint(100, 500, notProject5)).toEqual(base.answer);
    expect(delegate.getDropTargetFromPoint(80, 500, notProject5)).toEqual({
      type: "item",
      key: "projects",
      dropPosition: "after",
    });
  });

  test("nothing valid falls back to the root", () => {
    const base = fixed();
    const delegate = new TreeDropTargetDelegate(base.delegate, treeOf());
    base.answer = { type: "item", key: "project-2", dropPosition: "after" };
    expect(delegate.getDropTargetFromPoint(0, 0, () => false)).toEqual({ type: "root" });
  });
});

describe("what drag and drop says, in the page's language", () => {
  test("every locale has every message, and a plural follows the locale's own rules", () => {
    const keys = Object.keys(dndStrings.forLocale("en-US"));
    for (const locale of ["ar-AE", "de-DE", "fr-FR", "ja-JP", "ru-RU", "zh-CN"]) {
      expect(Object.keys(dndStrings.forLocale(locale)).toSorted()).toEqual(keys.toSorted());
    }
    const german = new StringFormatter("de-DE", dndStrings);
    expect(german.format("dropCanceled")).not.toBe("Drop canceled.");
    expect(german.format("dragSelectedItems", { count: 1 })).not.toBe(
      german.format("dragSelectedItems", { count: 3 }),
    );
    expect(german.format("dragSelectedItems", { count: 3 })).toContain("3");
    expect(german.format("dropOnItem", { itemText: "salama" })).toContain("salama");
  });
});
