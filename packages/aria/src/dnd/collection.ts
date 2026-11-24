/**
 * Drag and drop for a collection: which items a drag carries, where among the
 * items a drop lands, and the indicators that stand for those places.
 */

import { type Accessor, createEffect, createSignal, untrack } from "@barqjs/core";
import { tryCleanup } from "@barqjs/primitives/utils";
import type { Collection, Key, SelectionManager } from "../collections.ts";
import { stringFormatter, useLocale } from "../i18n.ts";
import { description } from "../interactions/description.ts";
import { setInteractionModality } from "../interactions/modality.ts";
import type { ElementRef } from "../interactions/press.ts";
import type { KeyboardDelegate } from "../selection.ts";
import { access, type DOMProps, id, type MaybeAccessor, mergeProps } from "../utils.ts";
import {
  clearGlobalDnDState,
  DIRECTORY_DRAG_TYPE,
  dndState,
  getTypes,
  isInternalDropOperation,
  refElement,
  setDraggingCollectionRef,
  setDraggingKeys,
  setDropCollectionRef,
} from "./data.ts";
import { autoScroll, dragInteraction, dropBehaviour, virtualDrop } from "./drag-drop.ts";
import {
  type DragModality,
  dragSession,
  type DragTarget,
  registerDropItem,
  registerDropTarget,
} from "./manager.ts";
import { type DndMessage, dndStrings } from "./strings.ts";
import {
  type DropNavigationDirection,
  navigateDropTarget,
  nextSiblingNode,
  previousSiblingNode,
} from "./targets.ts";
import type {
  DragItem,
  DragMoveEvent,
  DragPreviewRenderer,
  DragStartEvent,
  DragType,
  DragTypes,
  DraggableCollectionEndEvent,
  DraggableCollectionProps,
  DropEvent,
  DropOperation,
  DropPosition,
  DroppableCollectionDropEvent,
  DroppableCollectionProps,
  DropTarget,
  DropTargetDelegate,
  ItemDropTarget,
} from "./types.ts";

// ---------------------------------------------------------------------------
// Draggable collection state
// ---------------------------------------------------------------------------

export interface DraggableCollectionStateOptions<T = unknown> extends DraggableCollectionProps<T> {
  collection: Accessor<Collection<unknown>>;
  selectionManager: Accessor<SelectionManager>;
  isDisabled?: MaybeAccessor<boolean | undefined>;
}

export interface DraggableCollectionState {
  collection: Accessor<Collection<unknown>>;
  selectionManager: Accessor<SelectionManager>;
  /** The key the drag started on. */
  draggedKey: Accessor<Key | null>;
  /** Every key being dragged: the one grabbed, and the selection when it was selected. */
  draggingKeys: Accessor<Set<Key>>;
  isDisabled: Accessor<boolean>;
  isDragging(key: Key): boolean;
  getKeysForDrag(key: Key): Set<Key>;
  getItems(key: Key): DragItem[];
  preview?: MaybeAccessor<DragPreviewRenderer | null | undefined>;
  getAllowedDropOperations?: () => DropOperation[];
  startDrag(key: Key, event: DragStartEvent): void;
  moveDrag(event: DragMoveEvent): void;
  endDrag(event: DraggableCollectionEndEvent): void;
}

/**
 * Which items a drag carries, and the events for it.
 *
 * Grabbing a selected item drags the whole selection; grabbing an unselected
 * one drags only it, as the macOS Finder does. A selected descendant of a
 * selected item is not dragged twice.
 */
export function draggableCollectionState<T = unknown>(
  options: DraggableCollectionStateOptions<T>,
): DraggableCollectionState {
  // The keys are read back by the same handler that set them, so the value
  // lives beside the signal that tells the view.
  let draggingKeysNow = new Set<Key>();
  let draggedKeyNow: Key | null = null;
  const [version, publish] = createSignal(0, { equals: false, ownedWrite: true });

  function getKeysForDrag(key: Key): Set<Key> {
    const manager = options.selectionManager();
    const collection = options.collection();
    const keys = new Set<Key>();
    if (!manager.isSelected(key)) {
      keys.add(key);
      return keys;
    }
    const selected = manager.selectedKeys;
    for (const current of selected) {
      const node = collection.getItem(current);
      if (node === null) continue;
      let isChild = false;
      let parentKey = node.parentKey;
      while (parentKey !== undefined) {
        if (selected.has(parentKey)) {
          isChild = true;
          break;
        }
        parentKey = collection.getItem(parentKey)?.parentKey;
      }
      if (!isChild) keys.add(current);
    }
    return keys;
  }

  return {
    collection: options.collection,
    selectionManager: options.selectionManager,
    draggedKey: () => {
      version();
      return draggedKeyNow;
    },
    draggingKeys: () => {
      version();
      return draggingKeysNow;
    },
    isDisabled: () => access(options.isDisabled) === true,
    isDragging(key) {
      version();
      return draggingKeysNow.has(key);
    },
    getKeysForDrag,
    getItems(key) {
      const keys = getKeysForDrag(key);
      const collection = options.collection();
      const items: T[] = [];
      for (const each of keys) {
        const value = collection.getItem(each)?.value;
        if (value !== null && value !== undefined) items.push(value as T);
      }
      return options.getItems(keys, items);
    },
    preview: options.preview,
    getAllowedDropOperations: options.getAllowedDropOperations,
    startDrag(key, event) {
      const keys = getKeysForDrag(key);
      draggingKeysNow = keys;
      draggedKeyNow = key;
      options.selectionManager().setFocused(false);
      publish(0);
      options.onDragStart?.({ ...event, keys });
    },
    moveDrag(event) {
      options.onDragMove?.({ ...event, keys: draggingKeysNow });
    },
    endDrag(event) {
      options.onDragEnd?.({ ...event, keys: draggingKeysNow, isInternal: event.isInternal });
      draggingKeysNow = new Set();
      draggedKeyNow = null;
      publish(0);
    },
  };
}

// ---------------------------------------------------------------------------
// Draggable collection and its items
// ---------------------------------------------------------------------------

const draggableCollectionRefs = new WeakMap<DraggableCollectionState, ElementRef>();

export type DraggableCollectionOptions = Record<string, never>;

/**
 * The collection a drag of its items starts from.
 *
 * Whether a drop is a reorder or an insert depends on whether it lands where
 * it started, so the collection's element is recorded for the drop to compare.
 */
export function draggableCollection(
  _options: DraggableCollectionOptions,
  state: DraggableCollectionState,
  ref: ElementRef,
): void {
  draggableCollectionRefs.set(state, ref);
}

export interface DraggableItemOptions {
  key: Key;
  /** Whether keyboard and screen reader drags start from a separate button. */
  hasDragButton?: boolean;
  /**
   * Whether the item has an action of its own on Enter and long press. Starting
   * a drag from the keyboard then takes Alt + Enter.
   */
  hasAction?: MaybeAccessor<boolean | undefined>;
}

export interface DraggableItemResult {
  dragProps: DOMProps;
  /** Options for `button()`, for the item's drag button. */
  dragButtonProps: DOMProps;
}

interface ItemMessages {
  selected: DndMessage;
  notSelected: DndMessage;
}

const ITEM_MESSAGES: Record<DragModality, ItemMessages> = {
  keyboard: { selected: "dragSelectedKeyboard", notSelected: "dragDescriptionKeyboard" },
  touch: { selected: "dragSelectedLongPress", notSelected: "dragDescriptionLongPress" },
  virtual: { selected: "dragDescriptionVirtual", notSelected: "dragDescriptionVirtual" },
};

type AccessibleHandlers = {
  onPointerDown: (event: PointerEvent) => void;
  onKeyDownCapture: (event: KeyboardEvent) => void;
  onKeyUpCapture: (event: KeyboardEvent) => void;
  onClick: (event: MouseEvent) => void;
};

/** One item of a draggable collection. */
export function draggableItem(
  options: DraggableItemOptions,
  state: DraggableCollectionState,
): DraggableItemResult {
  function isDisabled(): boolean {
    return state.isDisabled() || state.selectionManager().isDisabled(options.key);
  }
  function hasAction(): boolean {
    return access(options.hasAction) === true;
  }
  const hasDragButton = options.hasDragButton === true;

  const interaction = dragInteraction({
    getItems: () => state.getItems(options.key),
    preview: () => access(state.preview),
    getAllowedDropOperations: state.getAllowedDropOperations,
    hasDragButton,
    isDisabled,
    onDragStart(event) {
      state.startDrag(options.key, event);
      setDraggingKeys(state.draggingKeys());
      setDraggingCollectionRef(draggableCollectionRefs.get(state));
    },
    onDragMove: (event) => state.moveDrag(event),
    onDragEnd(event) {
      const isInternal = event.dropOperation === "cancel" ? false : isInternalDropOperation();
      state.endDrag({ ...event, keys: state.draggingKeys(), isInternal });
      clearGlobalDnDState();
    },
  });

  const strings = interaction.strings;
  function count(): number {
    return state.getKeysForDrag(options.key).size;
  }
  function isSelectedForDrag(): boolean {
    return count() > 1 && state.selectionManager().isSelected(options.key);
  }
  function describesItem(): boolean {
    return !hasDragButton && state.selectionManager().selectionMode !== "none";
  }

  function itemDescription(): string | undefined {
    if (isDisabled() || hasDragButton) return undefined;
    const currentModality = interaction.modality();
    // A long press selects an item that has an action, so it is not offered
    // as a drag.
    if (currentModality === "touch" && hasAction()) return undefined;
    if (!describesItem()) return interaction.message();
    const selected = isSelectedForDrag();
    let message = ITEM_MESSAGES[currentModality][selected ? "selected" : "notSelected"];
    if (hasAction() && currentModality === "keyboard") message = `${message}Alt` as DndMessage;
    return selected ? strings().format(message, { count: count() }) : strings().format(message);
  }

  function buttonLabel(): string | undefined {
    if (describesItem()) return undefined;
    if (isSelectedForDrag()) return strings().format("dragSelectedItems", { count: count() });
    const node = state.collection().getItem(options.key);
    return strings().format("dragItem", { itemText: node?.textValue ?? "" });
  }

  const accessible = interaction.accessibleProps as AccessibleHandlers;

  function gated<E extends Event>(handler: (event: E) => void) {
    return (event: E): void => {
      if (!isDisabled()) handler(event);
    };
  }

  // An action of its own on Enter means a drag starts on Alt + Enter.
  function withAlt(handler: (event: KeyboardEvent) => void) {
    return (event: KeyboardEvent) => {
      if (!hasAction() || event.altKey) handler(event);
    };
  }

  const dragProps = mergeProps(
    hasDragButton
      ? {}
      : {
          onPointerDown: accessible.onPointerDown,
          onKeyDownCapture: withAlt(accessible.onKeyDownCapture),
          onKeyUpCapture: withAlt(accessible.onKeyUpCapture),
          // With selection, a click selects: touch drags on a long press, and
          // NVDA and JAWS are in forms mode inside a collection anyway.
          onClick: (event: MouseEvent) => {
            if (!describesItem()) accessible.onClick(event);
          },
        },
    description(itemDescription),
    {
      draggable: () => (isDisabled() ? undefined : "true"),
      onDragStart: gated(interaction.nativeProps.onDragStart as (event: DragEvent) => void),
      onDrag: gated(interaction.nativeProps.onDrag as (event: DragEvent) => void),
      onDragEnd: interaction.nativeProps.onDragEnd,
    },
  );

  const buttonDescription = description(() =>
    hasDragButton && !isDisabled() ? interaction.message() : undefined,
  );

  return {
    dragProps,
    dragButtonProps: {
      ...buttonDescription,
      onPress: interaction.onPress,
      isDisabled,
      "aria-label": buttonLabel,
    },
  };
}

// ---------------------------------------------------------------------------
// Droppable collection state
// ---------------------------------------------------------------------------

export interface DropOperationEvent {
  target: DropTarget;
  types: DragTypes;
  allowedOperations: DropOperation[];
  isInternal: boolean;
  draggingKeys: Set<Key>;
}

export interface DroppableCollectionStateOptions extends DroppableCollectionProps {
  collection: Accessor<Collection<unknown>>;
  selectionManager: Accessor<SelectionManager>;
  isDisabled?: MaybeAccessor<boolean | undefined>;
}

export interface DroppableCollectionState {
  collection: Accessor<Collection<unknown>>;
  selectionManager: Accessor<SelectionManager>;
  /** Where a drop would land right now. */
  target: Accessor<DropTarget | null>;
  isDisabled: Accessor<boolean>;
  setTarget(target: DropTarget | null): void;
  /** Whether `target` is where a drop would land, counting "after A" and "before B" as one. */
  isDropTarget(target: DropTarget | null): boolean;
  getDropOperation(event: DropOperationEvent): DropOperation;
}

export function isEqualDropTarget(
  a: DropTarget | null | undefined,
  b: DropTarget | null | undefined,
): boolean {
  if (a === null || a === undefined) return b === null || b === undefined;
  if (a.type === "root") return b?.type === "root";
  return b?.type === "item" && b.key === a.key && b.dropPosition === a.dropPosition;
}

function isDraggingWithinParent(
  collection: Collection<unknown>,
  target: ItemDropTarget,
  draggingKeys: Set<Key>,
): boolean {
  const targetNode = collection.getItem(target.key);
  for (const key of draggingKeys) {
    if (collection.getItem(key)?.parentKey !== targetNode?.parentKey) return false;
  }
  return true;
}

/**
 * Where a drop on a collection would land, and whether it is accepted there.
 *
 * Without `getDropOperation`, a target is valid when some handler would act on
 * it: `onReorder` for between items of this collection, `onInsert` for between
 * items from elsewhere, `onItemDrop` for on an item, `onRootDrop` for on the
 * collection from elsewhere, `onMove` for anywhere from here, and `onDrop` for
 * anything at all.
 */
export function droppableCollectionState(
  options: DroppableCollectionStateOptions,
): DroppableCollectionState {
  let targetNow: DropTarget | null = null;
  const [version, publish] = createSignal(0, { equals: false, ownedWrite: true });
  function isDisabled(): boolean {
    return access(options.isDisabled) === true;
  }

  function oppositeTarget(target: ItemDropTarget): ItemDropTarget | null {
    const collection = options.collection();
    const node = collection.getItem(target.key);
    if (node === null) return null;
    if (target.dropPosition === "before") {
      const previous = previousSiblingNode(collection, node);
      return previous === null ? null : { type: "item", key: previous.key, dropPosition: "after" };
    }
    if (target.dropPosition === "after") {
      const next = nextSiblingNode(collection, node);
      return next === null ? null : { type: "item", key: next.key, dropPosition: "before" };
    }
    return null;
  }

  function defaultGetDropOperation(event: DropOperationEvent): DropOperation {
    const { target, types, allowedOperations, isInternal, draggingKeys } = event;
    if (isDisabled()) return "cancel";

    const accepted = options.acceptedDragTypes ?? "all";
    if (accepted !== "all" && !accepted.some((type) => types.has(type))) return "cancel";

    const isBetween =
      target.type === "item" &&
      (target.dropPosition === "before" || target.dropPosition === "after");
    const isValidInsert = options.onInsert !== undefined && isBetween && !isInternal;
    const isValidReorder =
      options.onReorder !== undefined &&
      isBetween &&
      isInternal &&
      isDraggingWithinParent(options.collection(), target, draggingKeys);
    const isItemDropAllowed =
      target.type !== "item" ||
      target.dropPosition !== "on" ||
      options.shouldAcceptItemDrop === undefined ||
      options.shouldAcceptItemDrop(target, types);
    const isValidMove = options.onMove !== undefined && target.type === "item" && isInternal;
    // A drop of a collection's own items on itself read as nothing happening.
    const isValidRootDrop =
      options.onRootDrop !== undefined && target.type === "root" && !isInternal;
    // A folder cannot be dropped into itself.
    const isValidOnItemDrop =
      options.onItemDrop !== undefined &&
      target.type === "item" &&
      target.dropPosition === "on" &&
      !(isInternal && draggingKeys.has(target.key)) &&
      isItemDropAllowed;

    if (
      options.onDrop !== undefined ||
      isValidInsert ||
      isValidReorder ||
      (isValidMove && isItemDropAllowed) ||
      isValidRootDrop ||
      isValidOnItemDrop
    ) {
      return options.getDropOperation !== undefined
        ? options.getDropOperation(target, types, allowedOperations)
        : (allowedOperations[0] ?? "cancel");
    }
    return "cancel";
  }

  const state: DroppableCollectionState = {
    collection: options.collection,
    selectionManager: options.selectionManager,
    isDisabled,
    target: () => {
      version();
      return targetNow;
    },
    setTarget(next) {
      if (state.isDropTarget(next)) return;
      const previous = targetNow;
      if (previous !== null) {
        options.onDropExit?.({ type: "dropexit", x: 0, y: 0, target: previous });
      }
      if (next !== null) {
        options.onDropEnter?.({ type: "dropenter", x: 0, y: 0, target: next });
      }
      targetNow = next;
      publish(0);
    },
    isDropTarget(dropTarget) {
      version();
      const target = targetNow;
      if (target === null || dropTarget === null) return false;
      if (isEqualDropTarget(dropTarget, target)) return true;
      // "After A" and "before B" are one place when B follows A.
      if (
        dropTarget.type === "item" &&
        target.type === "item" &&
        dropTarget.key !== target.key &&
        dropTarget.dropPosition !== target.dropPosition &&
        dropTarget.dropPosition !== "on" &&
        target.dropPosition !== "on"
      ) {
        return (
          isEqualDropTarget(oppositeTarget(dropTarget), target) ||
          isEqualDropTarget(dropTarget, oppositeTarget(target))
        );
      }
      return false;
    },
    getDropOperation(event) {
      const { target, isInternal, draggingKeys } = event;
      // Never onto itself, or into its own descendants.
      if (isInternal && target.type === "item" && draggingKeys.size > 0) {
        if (draggingKeys.has(target.key) && target.dropPosition === "on") return "cancel";
        const collection = options.collection();
        let current: Key | undefined = target.key;
        while (current !== undefined) {
          const parentKey: Key | undefined = collection.getItem(current)?.parentKey;
          if (parentKey !== undefined && draggingKeys.has(parentKey)) return "cancel";
          current = parentKey;
        }
      }
      return defaultGetDropOperation(event);
    },
  };

  return state;
}

interface DroppableRegistration {
  id: Accessor<string>;
  ref: ElementRef;
}

// ---------------------------------------------------------------------------
// Droppable collection
// ---------------------------------------------------------------------------

const droppableCollections = new WeakMap<DroppableCollectionState, DroppableRegistration>();

function droppableCollectionOf(state: DroppableCollectionState): DroppableRegistration {
  const entry = droppableCollections.get(state);
  if (entry === undefined)
    throw new Error("A droppable item must be inside a droppable collection.");
  return entry;
}

export interface DroppableCollectionOptions extends DroppableCollectionProps {
  /** Moves between drop targets with the arrow keys. */
  keyboardDelegate: KeyboardDelegate;
  /** Finds the drop target under the pointer. */
  dropTargetDelegate: DropTargetDelegate;
  /** Called for every key during a keyboard drag over the collection. */
  onKeyDown?: (event: KeyboardEvent) => void;
  /**
   * The key that takes focus for an item after a drop. A collection whose
   * items are not themselves focusable (a table, where focus is on cells)
   * names what is. @default the item's own key
   */
  focusKeyFor?: (key: Key) => Key;
}

export interface DroppableCollectionResult {
  collectionProps: DOMProps;
}

interface DroppingState {
  collection: Collection<unknown>;
  focusedKey: Key | null;
  selectedKeys: Set<Key>;
  target: DropTarget;
  draggingKeys: Set<Key>;
  isInternal: boolean;
  timeout: ReturnType<typeof setTimeout> | undefined;
}

interface ExpandableState {
  expandedKeys?: Set<Key>;
}

/**
 * The element of a droppable collection.
 *
 * After a drop, focus and selection follow what happened: inserted items are
 * selected and the first one focused, a reordered item keeps focus, and an
 * item dropped on is focused, each only when the user or the application has
 * not already moved them.
 */
export function droppableCollection(
  options: DroppableCollectionOptions,
  state: DroppableCollectionState,
  ref: ElementRef<HTMLElement>,
): DroppableCollectionResult {
  const locale = useLocale();
  const scroller = autoScroll(ref);
  let nextTarget: DropTarget | null = null;
  let dropOperation: DropOperation | null = null;

  async function defaultOnDrop(event: DroppableCollectionDropEvent): Promise<void> {
    const accepted = options.acceptedDragTypes ?? "all";
    const { draggingKeys } = dndState();
    const isInternal = isInternalDropOperation(ref);
    const { target, dropOperation: operation, items } = event;

    let filtered = items;
    if (accepted !== "all" || options.shouldAcceptItemDrop !== undefined) {
      filtered = items.filter((item) => {
        let itemTypes: Set<DragType>;
        if (item.kind === "directory") itemTypes = new Set<DragType>([DIRECTORY_DRAG_TYPE]);
        else itemTypes = item.kind === "file" ? new Set([item.type]) : item.types;

        const types: DragTypes = { has: (type) => hasAnyType(itemTypes, type) };
        if (accepted === "all" || accepted.some((type) => itemTypes.has(type))) {
          // An item may be stricter than the collection about what lands on it.
          if (
            target.type === "item" &&
            target.dropPosition === "on" &&
            options.shouldAcceptItemDrop !== undefined
          ) {
            return options.shouldAcceptItemDrop(target, types);
          }
          return true;
        }
        return false;
      });
    }

    if (filtered.length === 0) return;

    if (target.type === "root" && options.onRootDrop !== undefined) {
      await options.onRootDrop({ items: filtered, dropOperation: operation });
    }

    if (target.type === "item") {
      if (target.dropPosition === "on" && options.onItemDrop !== undefined) {
        await options.onItemDrop({ items: filtered, dropOperation: operation, isInternal, target });
      }
      if (options.onMove !== undefined && isInternal) {
        await options.onMove({ keys: draggingKeys, dropOperation: operation, target });
      }
      if (target.dropPosition !== "on") {
        if (!isInternal && options.onInsert !== undefined) {
          await options.onInsert({ items: filtered, dropOperation: operation, target });
        }
        if (isInternal && options.onReorder !== undefined) {
          await options.onReorder({ keys: draggingKeys, dropOperation: operation, target });
        }
      }
    }
  }

  let dropping: DroppingState | null = null;
  function focusKey(key: Key): Key {
    return options.focusKeyFor?.(key) ?? key;
  }

  function updateFocusAfterDrop(): void {
    if (dropping === null) return;
    const manager = state.selectionManager();
    const collection = state.collection();
    const {
      target,
      collection: previousCollection,
      selectedKeys: previousSelectedKeys,
      focusedKey: previousFocusedKey,
      isInternal,
      draggingKeys,
    } = dropping;
    const focusedParent =
      previousFocusedKey === null ? undefined : collection.getItem(previousFocusedKey)?.parentKey;

    if (
      collection.size > previousCollection.size &&
      manager.isSelectionEqual(previousSelectedKeys)
    ) {
      // Select what the drop inserted, so the user can see what happened.
      const newKeys = new Set<Key>();
      for (const key of collection.getKeys()) {
        const item = collection.getItem(key);
        if (item?.type === "item" && previousCollection.getItem(item.key) === null) {
          newKeys.add(item.key);
        }
      }
      manager.setSelectedKeys(newKeys);

      if (manager.focusedKey === previousFocusedKey) {
        let first: Key | null | undefined = newKeys.values().next().value;
        if (first !== undefined && first !== null) {
          const item = collection.getItem(first);
          const expanded = (collection as ExpandableState).expandedKeys;
          const isParentRowExpanded =
            expanded !== undefined && item?.parentKey !== undefined
              ? expanded.has(item.parentKey)
              : false;
          if (
            item !== null &&
            (item.type !== "item" ||
              (target.type === "item" && target.dropPosition === "on" && !isParentRowExpanded))
          ) {
            first = item.parentKey;
          }
          if (first !== undefined && first !== null) manager.setFocusedKey(focusKey(first));
          // With nothing selectable, the focus ring is the only sign of the drop.
          if (manager.selectionMode === "none") setInteractionModality("keyboard");
        }
      }
    } else if (
      previousFocusedKey !== null &&
      manager.focusedKey === previousFocusedKey &&
      isInternal &&
      target.type === "item" &&
      target.dropPosition !== "on" &&
      focusedParent !== undefined &&
      draggingKeys.has(focusedParent)
    ) {
      // A reordered row keeps focus on the row, not on a cell of it.
      manager.setFocusedKey(focusKey(focusedParent));
      setInteractionModality("keyboard");
    } else if (
      manager.focusedKey === previousFocusedKey &&
      target.type === "item" &&
      target.dropPosition === "on" &&
      collection.getItem(target.key) !== null
    ) {
      manager.setFocusedKey(focusKey(target.key));
      setInteractionModality("keyboard");
    } else if (manager.focusedKey !== null && !manager.isSelected(manager.focusedKey)) {
      setInteractionModality("keyboard");
    }

    manager.setFocused(true);
  }

  function onDrop(event: DropEvent, target: DropTarget): void {
    const manager = state.selectionManager();
    dropping = {
      timeout: undefined,
      focusedKey: manager.focusedKey,
      collection: state.collection(),
      selectedKeys: manager.selectedKeys,
      draggingKeys: dndState().draggingKeys,
      isInternal: isInternalDropOperation(ref),
      target,
    };

    const handler = options.onDrop ?? defaultOnDrop;
    void handler({
      type: "drop",
      x: event.x,
      y: event.y,
      target,
      items: event.items,
      dropOperation: event.dropOperation,
    });

    // Long enough for the data to be read and the collection to change; if it
    // changes sooner, the effect below gets there first.
    const current = dropping;
    current.timeout = setTimeout(() => {
      if (dropping !== current) return;
      updateFocusAfterDrop();
      dropping = null;
    }, 50);
  }

  tryCleanup(() => {
    if (dropping !== null) clearTimeout(dropping.timeout);
  });

  // Focus and selection are repaired once the change has landed. The repair
  // reads the selection, which is no dependency of this effect.
  createEffect(
    () => {
      const collection = state.collection();
      return dropping !== null && collection !== dropping.collection ? dropping : null;
    },
    (pending) => {
      if (pending === null) return;
      untrack(updateFocusAfterDrop);
    },
  );

  const { dropProps } = dropBehaviour(
    {
      ref,
      onDropEnter() {
        if (nextTarget !== null) state.setTarget(nextTarget);
      },
      onDropMove(event) {
        if (nextTarget !== null) state.setTarget(nextTarget);
        scroller.move(event.x, event.y);
      },
      getDropOperationForPoint(types, allowedOperations, x, y) {
        const { draggingKeys, dropCollectionRef } = dndState();
        const isInternal = isInternalDropOperation(ref);
        function isValid(target: DropTarget): boolean {
          return (
            state.getDropOperation({
              target,
              types,
              allowedOperations,
              isInternal,
              draggingKeys,
            }) !== "cancel"
          );
        }
        let target = options.dropTargetDelegate.getDropTargetFromPoint(x, y, isValid);
        if (target === null) {
          dropOperation = "cancel";
          nextTarget = null;
          return "cancel";
        }

        dropOperation = state.getDropOperation({
          target,
          types,
          allowedOperations,
          isInternal,
          draggingKeys,
        });

        // An item that refuses may sit in a collection that accepts.
        if (dropOperation === "cancel") {
          const root: DropTarget = { type: "root" };
          const rootOperation = state.getDropOperation({
            target: root,
            types,
            allowedOperations,
            isInternal,
            draggingKeys,
          });
          if (rootOperation !== "cancel") {
            target = root;
            dropOperation = rootOperation;
          }
        }

        // Only a valid target records the collection, because leaving one is
        // what clears it.
        if (dropOperation !== "cancel" && refElement(ref) !== refElement(dropCollectionRef)) {
          setDropCollectionRef(ref);
        }
        nextTarget = dropOperation === "cancel" ? null : target;
        return dropOperation;
      },
      onDropExit() {
        setDropCollectionRef(undefined);
        state.setTarget(null);
        scroller.stop();
      },
      onDropActivate(event) {
        const target = state.target();
        if (target?.type === "item") {
          options.onDropActivate?.({ type: "dropactivate", x: event.x, y: event.y, target });
        }
      },
      onDrop(event) {
        setDropCollectionRef(ref);
        const target = state.target();
        if (target !== null) onDrop(event, target);
        // A drag from outside any collection keeps nothing for a `dragend`.
        if (dndState().draggingCollectionRef === undefined) clearGlobalDnDState();
      },
    },
    false,
  );

  function isRTL(): boolean {
    return locale().direction === "rtl";
  }

  function getNextTarget(
    target: DropTarget | null | undefined,
    wrap = true,
    key: DropNavigationDirection = "down",
  ): DropTarget | null {
    return navigateDropTarget(
      options.keyboardDelegate,
      state.collection(),
      target,
      key,
      isRTL(),
      wrap,
    );
  }

  function getPreviousTarget(target: DropTarget | null | undefined, wrap = true) {
    return getNextTarget(target, wrap, "up");
  }

  function nextValidTarget(
    start: DropTarget | null | undefined,
    types: DragTypes,
    allowedDropOperations: DropOperation[],
    step: (target: DropTarget | null | undefined, wrap: boolean) => DropTarget | null,
    wrap = true,
  ): DropTarget | null {
    let seenRoot = 0;
    let operation: DropOperation;
    let target = start;
    const { draggingKeys } = dndState();
    const isInternal = isInternalDropOperation(ref);
    do {
      const candidate = step(target, wrap);
      if (candidate === null) return null;
      target = candidate;
      operation = state.getDropOperation({
        target: candidate,
        types,
        allowedOperations: allowedDropOperations,
        isInternal,
        draggingKeys,
      });
      if (candidate.type === "root") seenRoot++;
    } while (operation === "cancel" && !state.isDropTarget(target) && seenRoot < 2);

    return operation === "cancel" ? null : target;
  }

  function operationFor(target: DropTarget, types: DragTypes, allowed: DropOperation[]) {
    return state.getDropOperation({
      target,
      types,
      allowedOperations: allowed,
      isInternal: isInternalDropOperation(ref),
      draggingKeys: dndState().draggingKeys,
    });
  }

  function onKeyDown(event: KeyboardEvent, dragTarget: DragTarget): void {
    const delegate = options.keyboardDelegate;
    const types = getTypes(dragTarget.items);
    const allowed = dragTarget.allowedDropOperations;
    function along(key: DropNavigationDirection) {
      return (target: DropTarget | null | undefined, wrap: boolean): DropTarget | null =>
        getNextTarget(target, wrap, key);
    }

    switch (event.key) {
      case "ArrowDown":
        if (delegate.getKeyBelow !== undefined) {
          state.setTarget(nextValidTarget(state.target(), types, allowed, along("down")));
        }
        break;
      case "ArrowUp":
        if (delegate.getKeyAbove !== undefined) {
          state.setTarget(nextValidTarget(state.target(), types, allowed, along("up")));
        }
        break;
      case "ArrowLeft":
        if (delegate.getKeyLeftOf !== undefined) {
          state.setTarget(nextValidTarget(state.target(), types, allowed, along("left")));
        }
        break;
      case "ArrowRight":
        if (delegate.getKeyRightOf !== undefined) {
          state.setTarget(nextValidTarget(state.target(), types, allowed, along("right")));
        }
        break;
      case "Home":
        if (delegate.getFirstKey !== undefined) {
          state.setTarget(nextValidTarget(null, types, allowed, getNextTarget));
        }
        break;
      case "End":
        if (delegate.getLastKey !== undefined) {
          state.setTarget(nextValidTarget(null, types, allowed, getPreviousTarget));
        }
        break;
      case "PageDown": {
        if (delegate.getKeyPageBelow === undefined) break;
        let target = state.target();
        if (target === null) {
          target = nextValidTarget(null, types, allowed, getNextTarget);
        } else {
          // From the root, a page below the first item.
          let targetKey: Key | null | undefined = delegate.getFirstKey?.();
          if (target.type === "item") targetKey = target.key;
          let nextKey: Key | null = null;
          if (targetKey !== null && targetKey !== undefined) {
            nextKey = delegate.getKeyPageBelow(targetKey);
          }
          let dropPosition: DropPosition = target.type === "item" ? target.dropPosition : "after";

          // Off the end, or already on the last item: the last position there is.
          if (
            nextKey === null ||
            (target.type === "item" && target.key === delegate.getLastKey?.())
          ) {
            nextKey = delegate.getLastKey?.() ?? null;
            dropPosition = "after";
          }
          if (nextKey === null) break;
          target = { type: "item", key: nextKey, dropPosition };

          if (operationFor(target, types, allowed) === "cancel") {
            target =
              nextValidTarget(target, types, allowed, getNextTarget, false) ??
              nextValidTarget(target, types, allowed, getPreviousTarget, false);
          }
        }
        state.setTarget(target ?? state.target());
        break;
      }
      case "PageUp": {
        if (delegate.getKeyPageAbove === undefined) break;
        let target = state.target();
        if (target === null) {
          target = nextValidTarget(null, types, allowed, getPreviousTarget);
        } else if (target.type === "item") {
          // From the first item, the root; otherwise a page up.
          if (target.key === delegate.getFirstKey?.()) {
            target = { type: "root" };
          } else {
            let nextKey: Key | null | undefined = delegate.getKeyPageAbove(target.key);
            let dropPosition = target.dropPosition;
            if (nextKey === null) {
              nextKey = delegate.getFirstKey?.();
              dropPosition = "before";
            }
            if (nextKey === null || nextKey === undefined) break;
            target = { type: "item", key: nextKey, dropPosition };
          }

          if (operationFor(target, types, allowed) === "cancel") {
            target =
              nextValidTarget(target, types, allowed, getPreviousTarget, false) ??
              nextValidTarget(target, types, allowed, getNextTarget, false);
          }
        }
        state.setTarget(target ?? state.target());
        break;
      }
    }
    options.onKeyDown?.(event);
  }

  createEffect(
    () => refElement(ref) as HTMLElement | null,
    (element) => {
      if (element === null) return undefined;
      return registerDropTarget({
        element,
        preventFocusOnDrop: true,
        getDropOperation(types, allowedOperations) {
          const target = state.target();
          if (target !== null) return operationFor(target, types, allowedOperations);
          // Accepted if anything in it accepts.
          return nextValidTarget(null, types, allowedOperations, getNextTarget) === null
            ? "cancel"
            : "move";
        },
        onDropEnter(_event, dragTarget) {
          const types = getTypes(dragTarget.items);
          const manager = state.selectionManager();
          // Recorded for a droppable item asking whether the drag is internal.
          setDropCollectionRef(ref);

          // Entering, the default is after the focused item; with a selection,
          // after the last selected item, or before the first when the focus is
          // on the first (selecting upwards suggests moving upwards).
          let key: Key | null | undefined = manager.focusedKey;
          let dropPosition: DropPosition = "after";
          const item = key === null ? null : state.collection().getItem(key);
          if (item !== null && item.type !== "item" && item.parentKey !== undefined) {
            key = item.parentKey;
          }
          if (key !== null && key !== undefined && manager.isSelected(key)) {
            if (manager.selectedKeys.size > 1 && manager.firstSelectedKey === key) {
              dropPosition = "before";
            } else {
              key = manager.lastSelectedKey;
            }
          }

          let target: DropTarget | null = null;
          if (key !== null && key !== undefined) {
            target = { type: "item", key, dropPosition };
            if (operationFor(target, types, dragTarget.allowedDropOperations) === "cancel") {
              target =
                nextValidTarget(
                  target,
                  types,
                  dragTarget.allowedDropOperations,
                  getNextTarget,
                  false,
                ) ??
                nextValidTarget(
                  target,
                  types,
                  dragTarget.allowedDropOperations,
                  getPreviousTarget,
                  false,
                );
            }
          }
          target ??= nextValidTarget(null, types, dragTarget.allowedDropOperations, getNextTarget);
          state.setTarget(target);
        },
        onDropExit() {
          setDropCollectionRef(undefined);
          state.setTarget(null);
        },
        onDropTargetEnter(target) {
          state.setTarget(target);
        },
        onDropActivate(event, target) {
          if (target?.type === "item" && target.dropPosition === "on") {
            options.onDropActivate?.({ type: "dropactivate", x: event.x, y: event.y, target });
          }
        },
        onDrop(event, target) {
          setDropCollectionRef(ref);
          const current = state.target();
          if (current !== null) onDrop(event, target ?? current);
        },
        onKeyDown,
      });
    },
  );

  const collectionId = id();
  droppableCollections.set(state, { id: collectionId, ref });

  return {
    // No drop description on the collection itself: a drop on the whole
    // collection has an indicator that carries it.
    collectionProps: mergeProps(dropProps, { id: collectionId }),
  };
}

function hasAnyType(types: Set<DragType>, type: DragType | DragType[]): boolean {
  if (Array.isArray(type)) return type.some((one) => types.has(one));
  return types.has(type);
}

// ---------------------------------------------------------------------------
// Droppable items and drop indicators
// ---------------------------------------------------------------------------

export interface DroppableItemOptions {
  target: DropTarget;
  /** A button inside the target that opens it, for a tree's folders. */
  activateButtonRef?: ElementRef<HTMLElement>;
}

export interface DroppableItemResult {
  dropProps: DOMProps;
  isDropTarget: Accessor<boolean>;
}

/** One drop target inside a droppable collection: an item, or a position between two. */
export function droppableItem(
  options: DroppableItemOptions,
  state: DroppableCollectionState,
  ref: ElementRef<HTMLElement>,
): DroppableItemResult {
  const { ref: collectionRef } = droppableCollectionOf(state);
  const virtual = virtualDrop(true);

  createEffect(
    () => refElement(ref) as HTMLElement | null,
    (element) => {
      if (element === null) return undefined;
      return registerDropItem({
        element,
        target: options.target,
        getDropOperation: (types, allowedOperations) =>
          state.getDropOperation({
            target: options.target,
            types,
            allowedOperations,
            isInternal: isInternalDropOperation(collectionRef),
            draggingKeys: dndState().draggingKeys,
          }),
        activateButtonRef: options.activateButtonRef,
      });
    },
  );

  function isValidForSession(): boolean {
    const session = dragSession();
    if (session === null) return false;
    return (
      state.getDropOperation({
        target: options.target,
        types: getTypes(session.dragTarget.items),
        allowedOperations: session.dragTarget.allowedDropOperations,
        isInternal: isInternalDropOperation(collectionRef),
        draggingKeys: dndState().draggingKeys,
      }) !== "cancel"
    );
  }

  function isDropTarget(): boolean {
    return state.isDropTarget(options.target);
  }

  createEffect(
    () => (dragSession() !== null && isDropTarget() ? refElement(ref) : null),
    (element) => {
      if (element instanceof HTMLElement) element.focus();
    },
  );

  return {
    dropProps: {
      ...virtual,
      "aria-hidden": () => (dragSession() === null || isValidForSession() ? undefined : "true"),
    },
    isDropTarget,
  };
}

export interface DropIndicatorOptions {
  target: DropTarget;
  activateButtonRef?: ElementRef<HTMLElement>;
}

export interface DropIndicatorResult {
  dropIndicatorProps: DOMProps;
  isDropTarget: Accessor<boolean>;
  /**
   * Whether the indicator is hidden from sight and from assistive technology:
   * outside a drag, or not a valid target for this one. Leave it out of the
   * DOM entirely then, unless a pointer drag is over it.
   */
  isHidden: Accessor<boolean>;
}

/** A position between items (or the whole collection) as a drop target with a name. */
export function dropIndicator(
  options: DropIndicatorOptions,
  state: DroppableCollectionState,
  ref: ElementRef<HTMLElement>,
): DropIndicatorResult {
  const { target } = options;
  const strings = stringFormatter(dndStrings);
  const { dropProps } = droppableItem(options, state, ref);
  const indicatorId = id();
  const collection = droppableCollectionOf(state);

  function textOf(key: Key | null | undefined): string {
    return key === null || key === undefined
      ? ""
      : (state.collection().getItem(key)?.textValue ?? "");
  }

  function label(): string {
    const format = strings();
    if (target.type === "root") return format.format("dropOnRoot");
    if (target.dropPosition === "on") {
      return format.format("dropOnItem", { itemText: textOf(target.key) });
    }

    const current = state.collection();
    const node = current.getItem(target.key);
    let before: Key | null = null;
    let after: Key | null = null;
    if (target.dropPosition === "before") {
      const previous = node === null ? null : previousSiblingNode(current, node);
      before = previous?.type === "item" ? previous.key : null;
      after = target.key;
    } else {
      before = target.key;
      const next = node === null ? null : nextSiblingNode(current, node);
      after = next?.type === "item" ? next.key : null;
    }

    if (before !== null && after !== null) {
      return format.format("insertBetween", {
        beforeItemText: textOf(before),
        afterItemText: textOf(after),
      });
    }
    if (before !== null) return format.format("insertAfter", { itemText: textOf(before) });
    if (after !== null) return format.format("insertBefore", { itemText: textOf(after) });
    return "";
  }

  const itemHidden = dropProps["aria-hidden"] as Accessor<string | undefined>;
  function ariaHidden(): string | undefined {
    return dragSession() === null ? "true" : itemHidden();
  }
  function isDropTarget(): boolean {
    return state.isDropTarget(target);
  }

  return {
    dropIndicatorProps: {
      ...dropProps,
      id: indicatorId,
      "aria-roledescription": () => strings().format("dropIndicator"),
      "aria-label": label,
      "aria-labelledby": () => {
        if (target.type !== "root") return undefined;
        // A reference to an element named by aria-labelledby reads its whole
        // text, every item in it, so the names it points to are taken instead.
        const named = access(collection.ref)?.getAttribute("aria-labelledby");
        return `${indicatorId()} ${named ?? collection.id()}`;
      },
      "aria-hidden": ariaHidden,
      tabIndex: -1,
    },
    isDropTarget,
    isHidden: () => !isDropTarget() && ariaHidden() !== undefined,
  };
}
