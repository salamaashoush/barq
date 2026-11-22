/**
 * Drag and drop, for a pointer and without one.
 *
 * The platform's drag and drop is a mouse-and-touch API: nothing in it can be
 * operated from a keyboard or by a screen reader. So every drag here has two
 * engines behind one set of events. A native drag runs on `dragstart`,
 * `dragover` and `drop` with a `DataTransfer`; every other modality runs on the
 * drag manager, which starts a session on Enter (or a screen reader's click),
 * lets Tab walk between the registered drop targets, and drops on Enter. Both
 * report the same `dragstart`, `dropenter`, `drop` and `dragend` events, so a
 * caller writes its handlers once.
 *
 * A collection adds a layer on top: drop TARGETS inside it (before, on and
 * after each item, and the collection itself), navigated with the arrow keys
 * and resolved from a point by a delegate when the pointer is driving.
 */

export type {
  DirectoryDropItem,
  DragDropEvent,
  DragEndEvent,
  DraggableCollectionEndEvent,
  DraggableCollectionMoveEvent,
  DraggableCollectionProps,
  DraggableCollectionStartEvent,
  DragItem,
  DragMoveEvent,
  DragPreviewRenderer,
  DragStartEvent,
  DragType,
  DragTypes,
  DropActivateEvent,
  DropEnterEvent,
  DropEvent,
  DropExitEvent,
  DropItem,
  DropMoveEvent,
  DropOperation,
  DropPosition,
  DroppableCollectionActivateEvent,
  DroppableCollectionBaseProps,
  DroppableCollectionDropEvent,
  DroppableCollectionEnterEvent,
  DroppableCollectionExitEvent,
  DroppableCollectionInsertDropEvent,
  DroppableCollectionMoveEvent,
  DroppableCollectionOnItemDropEvent,
  DroppableCollectionProps,
  DroppableCollectionReorderEvent,
  DroppableCollectionRootDropEvent,
  DroppableCollectionUtilityOptions,
  DropTarget,
  DropTargetDelegate,
  FileDropItem,
  ItemDropTarget,
  RootDropTarget,
  TextDropItem,
} from "./types.ts";
export {
  CUSTOM_DRAG_TYPE,
  DataTransferTypes,
  DIRECTORY_DRAG_TYPE,
  GENERIC_TYPE,
  getTypes,
  isDirectoryDropItem,
  isFileDropItem,
  isInternalDropOperation,
  isTextDropItem,
  readFromDataTransfer,
  writeToDataTransfer,
} from "./data.ts";
export { dndStrings } from "./strings.ts";
export {
  beginDragging,
  type DragModality,
  dragModality,
  DragSession,
  dragSession,
  type DragTarget,
  getDragModality,
  isValidDropTarget,
  isVirtualDragging,
  type ManagedDropItem,
  type ManagedDropTarget,
  registerDropItem,
  registerDropTarget,
} from "./manager.ts";
export {
  type AutoScroll,
  autoScroll,
  drag,
  type DragOptions,
  type DragResult,
  drop,
  type DropOptions,
  type DropResult,
} from "./drag-drop.ts";
export { clipboard, type ClipboardOptions, type ClipboardResult } from "./clipboard.ts";
export {
  afterDropIndicatorTargets,
  type DropNavigationDirection,
  ListDropTargetDelegate,
  type ListDropTargetDelegateOptions,
  navigateDropTarget,
  nextSiblingNode,
  previousSiblingNode,
  TreeDropTargetDelegate,
  type TreeDropTargetState,
} from "./targets.ts";
export {
  draggableCollection,
  type DraggableCollectionOptions,
  type DraggableCollectionState,
  draggableCollectionState,
  type DraggableCollectionStateOptions,
  draggableItem,
  type DraggableItemOptions,
  type DraggableItemResult,
  dropIndicator,
  type DropIndicatorOptions,
  type DropIndicatorResult,
  type DropOperationEvent,
  droppableCollection,
  type DroppableCollectionOptions,
  type DroppableCollectionResult,
  type DroppableCollectionState,
  droppableCollectionState,
  type DroppableCollectionStateOptions,
  droppableItem,
  type DroppableItemOptions,
  type DroppableItemResult,
  isEqualDropTarget,
} from "./collection.ts";
