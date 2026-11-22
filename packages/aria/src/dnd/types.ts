/** The shapes every part of drag and drop speaks in. */

import type { Key } from "../collections.ts";
import type { MaybeAccessor } from "../utils.ts";

export type DropOperation = "copy" | "link" | "move" | "cancel";

/** One dragged thing, in every representation it offers: `{ "text/plain": "…" }`. */
export interface DragItem {
  [type: string]: string;
}

export interface DragDropEvent {
  /** Relative to the target for a drop event, to the viewport for a drag event. */
  x: number;
  y: number;
}

export interface DragStartEvent extends DragDropEvent {
  type: "dragstart";
}

export interface DragMoveEvent extends DragDropEvent {
  type: "dragmove";
}

export interface DragEndEvent extends DragDropEvent {
  type: "dragend";
  dropOperation: DropOperation;
}

export interface DropEnterEvent extends DragDropEvent {
  type: "dropenter";
}

export interface DropMoveEvent extends DragDropEvent {
  type: "dropmove";
}

export interface DropActivateEvent extends DragDropEvent {
  type: "dropactivate";
}

export interface DropExitEvent extends DragDropEvent {
  type: "dropexit";
}

export interface TextDropItem {
  kind: "text";
  types: Set<string>;
  getText(type: string): Promise<string>;
}

export interface FileDropItem {
  kind: "file";
  type: string;
  name: string;
  getFile(): Promise<File>;
  getText(): Promise<string>;
}

export interface DirectoryDropItem {
  kind: "directory";
  name: string;
  getEntries(): AsyncIterable<FileDropItem | DirectoryDropItem>;
}

export type DropItem = TextDropItem | FileDropItem | DirectoryDropItem;

export interface DropEvent extends DragDropEvent {
  type: "drop";
  dropOperation: DropOperation;
  items: DropItem[];
}

export type DropPosition = "on" | "before" | "after";

export interface RootDropTarget {
  type: "root";
}

export interface ItemDropTarget {
  type: "item";
  key: Key;
  dropPosition: DropPosition;
}

export type DropTarget = RootDropTarget | ItemDropTarget;

export interface DroppableCollectionEnterEvent extends DropEnterEvent {
  target: DropTarget;
}

export interface DroppableCollectionMoveEvent extends DropMoveEvent {
  target: DropTarget;
}

export interface DroppableCollectionActivateEvent extends DropActivateEvent {
  target: DropTarget;
}

export interface DroppableCollectionExitEvent extends DropExitEvent {
  target: DropTarget;
}

export interface DroppableCollectionDropEvent extends DropEvent {
  target: DropTarget;
}

export interface DroppableCollectionInsertDropEvent {
  items: DropItem[];
  dropOperation: DropOperation;
  target: ItemDropTarget;
}

export interface DroppableCollectionRootDropEvent {
  items: DropItem[];
  dropOperation: DropOperation;
}

export interface DroppableCollectionOnItemDropEvent {
  items: DropItem[];
  dropOperation: DropOperation;
  isInternal: boolean;
  target: ItemDropTarget;
}

export interface DroppableCollectionReorderEvent {
  keys: Set<Key>;
  dropOperation: DropOperation;
  target: ItemDropTarget;
}

export type DragType = string | symbol;

export interface DragTypes {
  /** Whether any of the dragged items offers `type`. `"image/*"` matches a family. */
  has(type: DragType | DragType[]): boolean;
}

export interface DropTargetDelegate {
  getDropTargetFromPoint(
    x: number,
    y: number,
    isValidDropTarget: (target: DropTarget) => boolean,
  ): DropTarget | null;
}

export interface DraggableCollectionStartEvent extends DragStartEvent {
  keys: Set<Key>;
}

export interface DraggableCollectionMoveEvent extends DragMoveEvent {
  keys: Set<Key>;
}

export interface DraggableCollectionEndEvent extends DragEndEvent {
  keys: Set<Key>;
  isInternal: boolean;
}

/**
 * Renders the preview for a drag, then hands its element back so the browser
 * can photograph it. `x` and `y` override where it sits under the pointer.
 */
export type DragPreviewRenderer = (
  items: DragItem[],
  callback: (node: HTMLElement | null, x?: number, y?: number) => void,
) => void;

export interface DroppableCollectionUtilityOptions {
  /** @default "all" */
  acceptedDragTypes?: "all" | DragType[];
  /** Items from elsewhere, dropped between two items. */
  onInsert?: (event: DroppableCollectionInsertDropEvent) => void | Promise<void>;
  /** Items from elsewhere, dropped on the collection itself. */
  onRootDrop?: (event: DroppableCollectionRootDropEvent) => void | Promise<void>;
  /** Items dropped ON an item, from anywhere. */
  onItemDrop?: (event: DroppableCollectionOnItemDropEvent) => void | Promise<void>;
  /** Items of this collection, dropped between two of its items at the same level. */
  onReorder?: (event: DroppableCollectionReorderEvent) => void | Promise<void>;
  /** Items of this collection, dropped anywhere in it. */
  onMove?: (event: DroppableCollectionReorderEvent) => void | Promise<void>;
  /** Whether an item accepts a drop on itself, on top of `acceptedDragTypes`. */
  shouldAcceptItemDrop?: (target: ItemDropTarget, types: DragTypes) => boolean;
}

export interface DroppableCollectionBaseProps {
  onDropEnter?: (event: DroppableCollectionEnterEvent) => void;
  onDropActivate?: (event: DroppableCollectionActivateEvent) => void;
  onDropExit?: (event: DroppableCollectionExitEvent) => void;
  /** Every drop, before the utility handlers interpret it. Replaces them when given. */
  onDrop?: (event: DroppableCollectionDropEvent) => void | Promise<void>;
  getDropOperation?: (
    target: DropTarget,
    types: DragTypes,
    allowedOperations: DropOperation[],
  ) => DropOperation;
}

export interface DroppableCollectionProps
  extends DroppableCollectionUtilityOptions, DroppableCollectionBaseProps {}

export interface DraggableCollectionProps<T = unknown> {
  onDragStart?: (event: DraggableCollectionStartEvent) => void;
  onDragMove?: (event: DraggableCollectionMoveEvent) => void;
  onDragEnd?: (event: DraggableCollectionEndEvent) => void;
  /** What a drag of `keys` carries. `items` are the values those keys were built from. */
  getItems: (keys: Set<Key>, items: T[]) => DragItem[];
  preview?: MaybeAccessor<DragPreviewRenderer | null | undefined>;
  getAllowedDropOperations?: () => DropOperation[];
}
