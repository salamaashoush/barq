/**
 * Drag and drop for a collection component.
 *
 * `dragAndDrop()` turns the caller's handlers into a hooks object, and a
 * collection that takes `dragAndDropHooks` calls those hooks with its own
 * state, element and keyboard delegate. The collection decides where things
 * go (a listbox draws an indicator as an option, a grid list as a row); the
 * hooks decide what dragging and dropping mean. A tree or a table consumes the
 * same object through {@link collectionDragAndDrop}.
 */

import {
  type Accessor,
  type Child,
  cells,
  createContext,
  createSignal,
  flush,
  getContext,
  getOwner,
  type Incoming,
  install,
  onCleanup,
  Show,
} from "@barqjs/core";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import { button, type ButtonOptions } from "./button.tsx";
import type { Collection, Key, SelectionManager } from "./collections.ts";
import { rowStyle, type VirtualizerValue } from "./virtualizer.tsx";
import { contains } from "./dom.ts";
import {
  draggableCollection,
  type DraggableCollectionState,
  type DraggableCollectionStateOptions,
  draggableCollectionState,
  draggableItem,
  type DraggableItemResult,
  type DragItem,
  type DraggableCollectionProps,
  type DragPreviewRenderer,
  dropIndicator,
  droppableCollection,
  type DroppableCollectionActivateEvent,
  type DroppableCollectionOptions,
  type DroppableCollectionProps,
  type DroppableCollectionResult,
  type DroppableCollectionState,
  type DroppableCollectionStateOptions,
  droppableCollectionState,
  droppableItem,
  type DropTarget,
  type DropTargetDelegate,
  type ItemDropTarget,
  isVirtualDragging,
  ListDropTargetDelegate,
} from "./dnd/index.ts";
import { focusRing } from "./focus.ts";
import { hover } from "./interactions/hover.ts";
import type { ElementRef } from "./interactions/press.ts";
import type { KeyboardDelegate } from "./selection.ts";
import {
  access,
  callback,
  chain,
  type DOMProps,
  filterDOMProps,
  fromProps,
  type MaybeAccessor,
  mergeProps,
  type StyleProps,
  styleProps,
} from "./utils.ts";

// ---------------------------------------------------------------------------
// The hooks object
// ---------------------------------------------------------------------------

/** What a drag preview renders: an element, or one with its offset under the pointer. */
export type DragPreviewContent = Child | { element: Child; x: number; y: number };

export interface DragAndDropOptions<T = unknown>
  extends Omit<DraggableCollectionProps<T>, "preview" | "getItems">, DroppableCollectionProps {
  /** What a drag of `keys` carries. Without it, the collection cannot be dragged from. */
  getItems?: (keys: Set<Key>, items: T[]) => DragItem[];
  /** What follows the pointer. Without it, the browser photographs the dragged element. */
  renderDragPreview?: (items: DragItem[]) => DragPreviewContent;
  /** One indicator, which should be a `<DropIndicator>`. @default `<DropIndicator target={target} />` */
  renderDropIndicator?: (target: DropTarget) => Child;
  /** Finds the drop target under the pointer. @default a `ListDropTargetDelegate` */
  dropTargetDelegate?: DropTargetDelegate;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  /**
   * Where a mouse or touch drag may start: anywhere on an item, or only on its
   * drag button, which leaves text fields inside an item usable. Keyboard and
   * screen reader drags are not affected.
   *
   * @default "item"
   */
  pointerDragSource?: "item" | "handle";
}

export interface DragAndDropHooks {
  draggableCollectionState?: (
    options: Omit<DraggableCollectionStateOptions, "getItems">,
  ) => DraggableCollectionState;
  draggableCollection?: typeof draggableCollection;
  draggableItem?: typeof draggableItem;
  DragPreview?: typeof DragPreview;
  renderDragPreview?: (items: DragItem[]) => DragPreviewContent;
  isVirtualDragging?: () => boolean;
  pointerDragSource?: "item" | "handle";
  droppableCollectionState?: (options: DroppableCollectionStateOptions) => DroppableCollectionState;
  droppableCollection?: (
    options: DroppableCollectionOptions,
    state: DroppableCollectionState,
    ref: ElementRef<HTMLElement>,
  ) => DroppableCollectionResult;
  droppableItem?: typeof droppableItem;
  dropIndicator?: typeof dropIndicator;
  renderDropIndicator?: (target: DropTarget) => Child;
  dropTargetDelegate?: DropTargetDelegate;
  ListDropTargetDelegate?: typeof ListDropTargetDelegate;
}

export interface DragAndDrop {
  dragAndDropHooks: DragAndDropHooks;
}

/**
 * Drag and drop for a collection, as hooks it calls.
 *
 * ```tsx
 * const { dragAndDropHooks } = dragAndDrop<Person>({
 *   getItems: (keys, people) => people.map((person) => ({ "text/plain": person.name })),
 *   onReorder: (event) => move(event.keys, event.target),
 * });
 * <ListBox aria-label="People" items={people()} dragAndDropHooks={dragAndDropHooks}>…</ListBox>
 * ```
 *
 * Draggable when `getItems` is given; droppable when any drop handler is.
 */
export function dragAndDrop<T = unknown>(options: DragAndDropOptions<T>): DragAndDrop {
  const hooks: DragAndDropHooks = {};
  const getItems = options.getItems;
  const isDroppable =
    options.onDrop !== undefined ||
    options.onInsert !== undefined ||
    options.onItemDrop !== undefined ||
    options.onReorder !== undefined ||
    options.onMove !== undefined ||
    options.onRootDrop !== undefined;

  if (getItems !== undefined) {
    hooks.draggableCollectionState = (props) =>
      draggableCollectionState<T>({
        ...(props as Omit<DraggableCollectionStateOptions<T>, "getItems">),
        isDisabled: options.isDisabled,
        onDragStart: options.onDragStart,
        onDragMove: options.onDragMove,
        onDragEnd: options.onDragEnd,
        getAllowedDropOperations: options.getAllowedDropOperations,
        getItems,
      });
    hooks.draggableCollection = draggableCollection;
    hooks.draggableItem = draggableItem;
    hooks.DragPreview = DragPreview;
    hooks.renderDragPreview = options.renderDragPreview;
    hooks.isVirtualDragging = isVirtualDragging;
    hooks.pointerDragSource = options.pointerDragSource ?? "item";
  }

  if (isDroppable) {
    hooks.droppableCollectionState = (props) => droppableCollectionState({ ...options, ...props });
    hooks.droppableItem = droppableItem;
    hooks.droppableCollection = (props, state, ref) =>
      droppableCollection(
        {
          ...options,
          ...props,
          // The collection's own response (a tree expanding the row) and the
          // caller's both happen.
          onDropActivate: chain(props.onDropActivate, options.onDropActivate),
        },
        state,
        ref,
      );
    hooks.dropIndicator = dropIndicator;
    hooks.renderDropIndicator = options.renderDropIndicator;
    hooks.dropTargetDelegate = options.dropTargetDelegate;
    hooks.ListDropTargetDelegate = ListDropTargetDelegate;
  }

  return { dragAndDropHooks: hooks };
}

// ---------------------------------------------------------------------------
// What a collection shares with its items
// ---------------------------------------------------------------------------

export interface DragAndDropContextValue {
  dragAndDropHooks?: DragAndDropHooks | undefined;
  dragState?: DraggableCollectionState | undefined;
  dropState?: DroppableCollectionState | undefined;
}

const DragAndDropContext = createContext<DragAndDropContextValue | null>(null);

/** The drag and drop state of the enclosing collection, if it has any. */
export function useDragAndDropContext(): DragAndDropContextValue {
  return getContext(DragAndDropContext) ?? {};
}

export interface DropIndicatorContextValue {
  /** Draws one indicator the way the enclosing collection's indicators look. */
  render: (props: Incoming<DropIndicatorProps>) => Child;
}

const DropIndicatorContext = createContext<DropIndicatorContextValue | null>(null);

/** Install how `<DropIndicator>` renders inside the calling component. */
export function provideDropIndicator(value: DropIndicatorContextValue): void {
  const owner = getOwner();
  if (owner !== null) install(owner, DropIndicatorContext, () => value);
}

export interface DropIndicatorProps extends StyleProps {
  /** The position the indicator stands for. */
  target: DropTarget;
  children?: Child;
}

/**
 * The mark between items where a drop would land.
 *
 * Rendered from a collection's `renderDropIndicator`, which is where `target`
 * comes from. The element is the collection's choice: an option in a listbox,
 * a row in a grid list. It carries `data-drop-target` while it is the target.
 */
export function DropIndicator(props: DropIndicatorProps) {
  const context = getContext(DropIndicatorContext);
  if (context === null || context === undefined) {
    throw new Error("A DropIndicator must be rendered by a droppable collection.");
  }
  return <>{context.render(cells(props))}</>;
}

// ---------------------------------------------------------------------------
// Drag preview
// ---------------------------------------------------------------------------

export interface DragPreviewProps {
  children: (items: DragItem[]) => DragPreviewContent;
  /** Receives the renderer `drag()` takes as its `preview`. */
  ref?: RefTarget<DragPreviewRenderer>;
}

interface PositionedPreview {
  element: Child;
  x: number;
  y: number;
}

interface HasX {
  x?: unknown;
}

interface HasY {
  y?: unknown;
}

function isPositioned(value: unknown): value is PositionedPreview {
  return (
    typeof value === "object" &&
    value !== null &&
    "element" in value &&
    typeof (value as HasX).x === "number" &&
    typeof (value as HasY).y === "number"
  );
}

interface PreviewOffset {
  x?: number;
  y?: number;
}

/**
 * What a native drag shows under the pointer.
 *
 * The browser photographs an element DURING `dragstart`, so the preview is
 * rendered and flushed synchronously inside that handler, handed over, and
 * removed a frame later once the photograph is taken.
 */
export function DragPreview(props: DragPreviewProps) {
  const container = makeRef<HTMLDivElement>();
  const [items, setItems] = createSignal<DragItem[] | null>(null, { ownedWrite: true });
  let offset: PreviewOffset = {};
  let frame: number | undefined;

  // Built where it is inserted rather than in a memo: what the caller renders
  // binds its own text and attributes, and those bindings have to belong to
  // the insertion that shows them.
  function content(): Child {
    const dragged = items();
    if (dragged === null) return null;
    // A render function written inline arrives as itself, one passed by name
    // as a Cell around it.
    const render = callback<[DragItem[]], DragPreviewContent>(cells(props).children);
    if (render === undefined) return null;
    const result = render(dragged);
    if (isPositioned(result)) {
      offset = { x: result.x, y: result.y };
      return result.element;
    }
    offset = {};
    return result;
  }

  const renderer: DragPreviewRenderer = (dragged, deliver) => {
    if (frame !== undefined) cancelAnimationFrame(frame);
    setItems(dragged);
    flush();
    deliver(container(), offset.x, offset.y);
    frame = requestAnimationFrame(() => {
      frame = undefined;
      setItems(null);
    });
  };

  mergeRefs(props.ref)(renderer);
  onCleanup(() => {
    if (frame !== undefined) cancelAnimationFrame(frame);
  });

  return (
    <Show when={items() !== null}>
      <div
        ref={container.set}
        style={{ "z-index": "-100", position: "fixed", top: "0", left: "-100000px" }}
      >
        {content()}
      </div>
    </Show>
  );
}

// ---------------------------------------------------------------------------
// The drag button
// ---------------------------------------------------------------------------

export interface DragButtonSlot {
  /** Options for `button()`: the press that starts a drag, its label and description. */
  options: DOMProps;
  /** What goes on the element itself: `draggable`, and the style that lets presses through. */
  elementProps: DOMProps;
  ref?: (element: Element | null) => void;
}

const DragButtonContext = createContext<DragButtonSlot | null>(null);

/** Offer a drag button's props to a `<DragButton>` rendered inside the calling component. */
export function provideDragButton(slot: DragButtonSlot): void {
  const owner = getOwner();
  if (owner !== null) install(owner, DragButtonContext, () => slot);
}

/** The drag button the enclosing item offers, if it is draggable. */
export function useDragButton(): DragButtonSlot | null {
  return getContext(DragButtonContext) ?? null;
}

export interface DragButtonProps extends StyleProps {
  children?: Child;
  "aria-label"?: string;
  ref?: RefTarget<HTMLButtonElement>;
}

/**
 * The button inside a draggable row that starts a keyboard or screen reader
 * drag. A row of a grid list holds controls of its own, so Enter on the row is
 * not available to start one.
 *
 * ```tsx
 * <GridListItem>
 *   <DragButton>≡</DragButton>
 *   {file.name}
 * </GridListItem>
 * ```
 */
export function DragButton(props: DragButtonProps) {
  const slot = useDragButton();
  if (slot === null) {
    throw new Error("A DragButton must be rendered inside a draggable collection item.");
  }

  const domRef = makeRef<HTMLButtonElement>();
  const own = fromProps(cells(props));
  const options = mergeProps(slot.options, {
    "aria-label": () =>
      props["aria-label"] ??
      access(slot.options["aria-label"] as MaybeAccessor<string | undefined>),
  }) as ButtonOptions;
  const { buttonProps, isPressed } = button(options, domRef);
  const { hoverProps, isHovered } = hover({ isDisabled: options.isDisabled });
  const { focusProps, isFocused, isFocusVisible } = focusRing();

  const elementProps = mergeProps(
    buttonProps,
    hoverProps,
    focusProps,
    filterDOMProps(own, { global: true }),
    slot.elementProps,
    styleProps(cells(props)),
    {
      "data-pressed": isPressed,
      "data-hovered": isHovered,
      "data-focused": isFocused,
      "data-focus-visible": isFocusVisible,
      "data-slot": () => props["data-slot"] ?? "drag",
    },
  );

  return (
    <button {...elementProps} ref={mergeRefs(domRef.set, slot.ref, props.ref)}>
      {props.children}
    </button>
  );
}

export interface DraggableItemSlotProps {
  /** Props for the item's element. */
  itemProps: DOMProps;
  /** The slot its `<DragButton>` reads. */
  dragButton: DragButtonSlot;
}

/**
 * Split a draggable item's props between the item and its drag button.
 *
 * With the default pointer source, a mouse or touch drag starts anywhere on
 * the item and the button lets presses through to it. With `"handle"`, only
 * the button is `draggable`, but the drag events stay on the item so the
 * preview is positioned against the whole item, as when dragging from it.
 */
export function draggableItemSlotProps(
  item: DraggableItemResult | null,
  hooks: DragAndDropHooks | undefined,
  dragButtonRef: Accessor<Element | null>,
  setDragButtonRef: (element: Element | null) => void,
): DraggableItemSlotProps {
  if (hooks?.pointerDragSource !== "handle") {
    return {
      itemProps: item?.dragProps ?? {},
      dragButton: {
        options: item?.dragButtonProps ?? {},
        elementProps: { style: { "pointer-events": "none" } },
        ref: setDragButtonRef,
      },
    };
  }

  const dragProps = item?.dragProps ?? {};
  const onDragStart = dragProps.onDragStart as ((event: DragEvent) => void) | undefined;
  const onDrag = dragProps.onDrag as ((event: DragEvent) => void) | undefined;
  const onDragEnd = dragProps.onDragEnd as ((event: DragEvent) => void) | undefined;
  function isFromDragButton(event: DragEvent): boolean {
    return contains(dragButtonRef(), event.target instanceof Node ? event.target : null);
  }

  return {
    itemProps: {
      onDragStart: (event: DragEvent) => {
        // Text or an image dragged from inside the item is not an item drag.
        if (!isFromDragButton(event) || onDragStart === undefined) return;
        onDragStart(event);
        // The browser would otherwise photograph only the button.
        if (!event.defaultPrevented && hooks.renderDragPreview === undefined) {
          const element = event.currentTarget as HTMLElement;
          const rect = element.getBoundingClientRect();
          event.dataTransfer?.setDragImage(element, event.clientX - rect.x, event.clientY - rect.y);
        }
      },
      onDrag: (event: DragEvent) => {
        if (isFromDragButton(event)) onDrag?.(event);
      },
      onDragEnd: (event: DragEvent) => {
        if (isFromDragButton(event)) onDragEnd?.(event);
      },
    },
    dragButton: {
      options: item?.dragButtonProps ?? {},
      elementProps: { draggable: dragProps.draggable },
      ref: setDragButtonRef,
    },
  };
}

// ---------------------------------------------------------------------------
// The collection side
// ---------------------------------------------------------------------------

export interface CollectionDragAndDropOptions {
  hooks: DragAndDropHooks | undefined;
  collection: Accessor<Collection<unknown>>;
  selectionManager: Accessor<SelectionManager>;
  ref: ElementRef<HTMLElement>;
  /** Moves between drop targets; it should reach disabled items too. */
  keyboardDelegate: KeyboardDelegate;
  layout?: MaybeAccessor<"stack" | "grid" | undefined>;
  orientation?: MaybeAccessor<"horizontal" | "vertical" | undefined>;
  direction?: MaybeAccessor<"ltr" | "rtl" | undefined>;
  /** Wraps the delegate that finds the target under the pointer, as a tree's does. */
  dropTargetDelegate?: (base: DropTargetDelegate) => DropTargetDelegate;
  /** A drag held over, or a keyboard activation of, a target in the collection. */
  onDropActivate?: (event: DroppableCollectionActivateEvent) => void;
  /** Every key of a keyboard drag over the collection, after the target has moved. */
  onKeyDown?: (event: KeyboardEvent) => void;
  /** What takes focus for an item after a drop, where items are not focusable themselves. */
  focusKeyFor?: (key: Key) => Key;
  /**
   * The virtualiser the collection is inside. Its layout then finds the target
   * under the pointer and places the indicators, since most rows a drop may
   * fall between are not in the document.
   */
  virtual?: VirtualizerValue | null;
}

/**
 * The delegate without Left and Right where they mean nothing.
 *
 * In a vertical list those keys are not a direction, and a delegate that
 * answers them anyway would walk the drop target with them; in a tree they
 * expand and collapse the row instead.
 */
function dropNavigation(
  delegate: KeyboardDelegate,
  layout: MaybeAccessor<"stack" | "grid" | undefined>,
  orientation: MaybeAccessor<"horizontal" | "vertical" | undefined>,
): KeyboardDelegate {
  function isVerticalStack(): boolean {
    return (
      (access(layout) ?? "stack") === "stack" && (access(orientation) ?? "vertical") === "vertical"
    );
  }
  function horizontal(
    method: ((key: Key) => Key | null) | undefined,
  ): ((key: Key) => Key | null) | undefined {
    return method === undefined || isVerticalStack() ? undefined : method;
  }
  return {
    getKeyBelow: delegate.getKeyBelow?.bind(delegate),
    getKeyAbove: delegate.getKeyAbove?.bind(delegate),
    getKeyPageBelow: delegate.getKeyPageBelow?.bind(delegate),
    getKeyPageAbove: delegate.getKeyPageAbove?.bind(delegate),
    getFirstKey: delegate.getFirstKey?.bind(delegate),
    getLastKey: delegate.getLastKey?.bind(delegate),
    getKeyForSearch: delegate.getKeyForSearch?.bind(delegate),
    get getKeyLeftOf() {
      return horizontal(delegate.getKeyLeftOf?.bind(delegate));
    },
    get getKeyRightOf() {
      return horizontal(delegate.getKeyRightOf?.bind(delegate));
    },
  };
}

export interface CollectionDragAndDrop {
  hooks: DragAndDropHooks | undefined;
  dragState: DraggableCollectionState | undefined;
  dropState: DroppableCollectionState | undefined;
  /** Spread on the collection's element. */
  collectionProps: DOMProps;
  /** Whether the collection itself is where a drop would land. */
  isRootDropTarget: Accessor<boolean>;
  /** The preview to render beside the collection, when the hooks render one. */
  preview: Child;
  /**
   * Whether the indicator for `target` should be in the DOM: while a keyboard
   * or screen reader drag is under way, or while it is the current target.
   */
  shouldRenderIndicator(target: ItemDropTarget): boolean;
  /** The caller's indicator for `target`, or the default one. */
  renderDropIndicator(target: ItemDropTarget): Child;
  /** Rows a virtualiser has to keep rendered: the one a drop is aimed at. */
  persistedKeys: Accessor<Key[]>;
}

/**
 * Where a virtualised collection draws the indicator for `target`, as a style.
 * Nothing outside a virtualiser, where the indicator sits in the flow between
 * the rows it separates.
 */
export function dropIndicatorStyle(
  virtual: VirtualizerValue | null,
  target: ItemDropTarget,
): Record<string, string> | undefined {
  const info = virtual?.layout.getDropTargetLayoutInfo?.(target) ?? null;
  return info === null ? undefined : rowStyle(info);
}

/**
 * Call a collection's drag and drop hooks, and share the result with its items.
 *
 * Called from the collection component's body. Provides the context
 * `useDragAndDropContext()` reads in each item.
 */
export function collectionDragAndDrop(
  options: CollectionDragAndDropOptions,
): CollectionDragAndDrop {
  const hooks = options.hooks;
  let dragState: DraggableCollectionState | undefined;
  let dropState: DroppableCollectionState | undefined;
  let collectionProps: DOMProps = {};
  let preview: Child = null;

  if (hooks?.draggableCollectionState !== undefined) {
    const previewRef = makeRef<DragPreviewRenderer>();
    dragState = hooks.draggableCollectionState({
      collection: options.collection,
      selectionManager: options.selectionManager,
      preview: hooks.renderDragPreview === undefined ? undefined : previewRef,
    });
    hooks.draggableCollection?.({}, dragState, options.ref);

    const PreviewComponent = hooks.DragPreview;
    const render = hooks.renderDragPreview;
    if (PreviewComponent !== undefined && render !== undefined) {
      preview = <PreviewComponent ref={previewRef.set}>{render}</PreviewComponent>;
    }
  }

  if (hooks?.droppableCollectionState !== undefined) {
    dropState = hooks.droppableCollectionState({
      collection: options.collection,
      selectionManager: options.selectionManager,
    });
    const Delegate = hooks.ListDropTargetDelegate ?? ListDropTargetDelegate;
    const placed = options.virtual?.layout;
    const base =
      hooks.dropTargetDelegate ??
      (placed?.getDropTargetFromPoint === undefined
        ? new Delegate(options.collection, options.ref, {
            layout: options.layout,
            orientation: options.orientation,
            direction: options.direction,
          })
        : {
            getDropTargetFromPoint: (x, y, isValid) =>
              placed.getDropTargetFromPoint?.(x, y, isValid) ?? null,
          });
    const result = hooks.droppableCollection?.(
      {
        keyboardDelegate: dropNavigation(
          options.keyboardDelegate,
          options.layout,
          options.orientation,
        ),
        dropTargetDelegate: options.dropTargetDelegate?.(base) ?? base,
        onDropActivate: options.onDropActivate,
        onKeyDown: options.onKeyDown,
        focusKeyFor: options.focusKeyFor,
      },
      dropState,
      options.ref,
    );
    collectionProps = result?.collectionProps ?? {};
  }

  const owner = getOwner();
  if (owner !== null) {
    const value: DragAndDropContextValue = { dragAndDropHooks: hooks, dragState, dropState };
    install(owner, DragAndDropContext, () => value);
  }

  const droppable = dropState;
  return {
    persistedKeys: () => {
      const target = droppable?.target() ?? null;
      return target !== null && target.type === "item" ? [target.key] : [];
    },
    hooks,
    dragState,
    dropState,
    collectionProps,
    preview,
    isRootDropTarget: () => droppable?.isDropTarget({ type: "root" }) ?? false,
    shouldRenderIndicator: (target) =>
      droppable !== undefined &&
      hooks?.dropIndicator !== undefined &&
      (hooks.isVirtualDragging?.() === true || droppable.isDropTarget(target)),
    renderDropIndicator: (target) =>
      hooks?.renderDropIndicator?.(target) ?? <DropIndicator target={target} />,
  };
}
