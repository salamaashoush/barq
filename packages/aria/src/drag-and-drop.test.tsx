import { describe, expect, test } from "bun:test";
import { createRoot, flush } from "@barqjs/core";
import { render } from "@barqjs/testing";
import { buildCollection, type Key, listState } from "./collections.ts";
import type { DragPreviewRenderer } from "./dnd/index.ts";
import {
  collectionDragAndDrop,
  dragAndDrop,
  DragPreview,
  DropIndicator,
} from "./drag-and-drop.tsx";
import { ListKeyboardDelegate } from "./selection.ts";
import { nextFrame } from "./test-dnd.ts";

describe("dragAndDrop", () => {
  test("getItems makes a collection draggable, and nothing more", () => {
    const { dragAndDropHooks } = dragAndDrop({ getItems: () => [] });
    expect(dragAndDropHooks.draggableCollectionState).toBeFunction();
    expect(dragAndDropHooks.draggableItem).toBeFunction();
    expect(dragAndDropHooks.isVirtualDragging).toBeFunction();
    expect(dragAndDropHooks.pointerDragSource).toBe("item");
    expect(dragAndDropHooks.droppableCollectionState).toBeUndefined();
    expect(dragAndDropHooks.dropIndicator).toBeUndefined();
  });

  test("any drop handler makes it droppable, and nothing more", () => {
    for (const handler of [
      "onDrop",
      "onInsert",
      "onItemDrop",
      "onReorder",
      "onMove",
      "onRootDrop",
    ] as const) {
      const { dragAndDropHooks } = dragAndDrop({ [handler]: () => {} });
      expect(dragAndDropHooks.droppableCollectionState).toBeFunction();
      expect(dragAndDropHooks.droppableCollection).toBeFunction();
      expect(dragAndDropHooks.dropIndicator).toBeFunction();
      expect(dragAndDropHooks.ListDropTargetDelegate).toBeFunction();
      expect(dragAndDropHooks.draggableCollectionState).toBeUndefined();
    }
  });

  test("the hooks carry the caller's options into the collection's state", () => {
    function getItems(keys: Set<Key>) {
      return [...keys].map((key) => ({ "text/plain": String(key) }));
    }
    const { dragAndDropHooks } = dragAndDrop({
      getItems,
      onReorder: () => {},
      isDisabled: true,
      pointerDragSource: "handle",
    });
    expect(dragAndDropHooks.pointerDragSource).toBe("handle");

    createRoot((dispose) => {
      const state = listState({ items: [{ id: "salama" }, { id: "acme" }] });
      const result = collectionDragAndDrop({
        hooks: dragAndDropHooks,
        collection: state.collection,
        selectionManager: state.selectionManager,
        ref: null,
        keyboardDelegate: new ListKeyboardDelegate({ collection: state.collection, ref: null }),
      });
      expect(result.dragState?.getItems("acme")).toEqual([{ "text/plain": "acme" }]);
      expect(result.dragState?.isDisabled()).toBe(true);
      expect(result.dropState?.isDisabled()).toBe(true);
      expect(result.preview).toBeNull();
      expect(result.isRootDropTarget()).toBe(false);
      dispose();
    });
  });

  test("a collection without hooks has no state", () => {
    createRoot((dispose) => {
      const collection = buildCollection<unknown>([]);
      const result = collectionDragAndDrop({
        hooks: undefined,
        collection: () => collection,
        selectionManager: () => {
          throw new Error("not read");
        },
        ref: null,
        keyboardDelegate: new ListKeyboardDelegate({ collection: () => collection, ref: null }),
      });
      expect(result.dragState).toBeUndefined();
      expect(result.dropState).toBeUndefined();
      expect(result.shouldRenderIndicator({ type: "item", key: "x", dropPosition: "on" })).toBe(
        false,
      );
      dispose();
    });
  });
});

describe("DropIndicator", () => {
  test("is refused outside a droppable collection", () => {
    expect(() => render(() => <DropIndicator target={{ type: "root" }} />)).toThrow(
      "A DropIndicator must be rendered by a droppable collection.",
    );
  });
});

interface Photograph {
  node: HTMLElement | null;
  x?: number;
  y?: number;
}

describe("DragPreview", () => {
  test("renders synchronously for the photograph, and leaves a frame later", async () => {
    let renderer: DragPreviewRenderer | null = null;
    const { container } = render(() => (
      <DragPreview
        ref={(value) => {
          renderer = value;
        }}
      >
        {(items) => <span>{items.length} items</span>}
      </DragPreview>
    ));
    expect(container.textContent).toBe("");

    let photographed: Photograph | null = null;
    (renderer as DragPreviewRenderer | null)?.(
      [{ "text/plain": "salama" }, { "text/plain": "acme" }],
      (node, x, y) => {
        photographed = { node, x, y };
      },
    );
    const shot = photographed as Photograph | null;
    expect(shot?.node?.textContent).toBe("2 items");
    expect(shot?.node?.style.position).toBe("fixed");
    expect(shot?.x).toBeUndefined();

    await nextFrame();
    flush();
    expect(container.textContent).toBe("");
  });

  test("a positioned result supplies the offset", () => {
    let renderer: DragPreviewRenderer | null = null;
    render(() => (
      <DragPreview
        ref={(value) => {
          renderer = value;
        }}
      >
        {(items) => ({ element: <span>{items.length} for salama</span>, x: 4, y: 8 })}
      </DragPreview>
    ));
    let offset: number[] = [];
    (renderer as DragPreviewRenderer | null)?.([], (node, x, y) => {
      offset = [x ?? -1, y ?? -1];
      expect(node?.textContent).toBe("0 for salama");
    });
    expect(offset).toEqual([4, 8]);
  });
});
