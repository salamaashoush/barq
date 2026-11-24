/** `drag()` and `drop()`: one element dragged, and one element dropped on. */

import { type Accessor, createEffect, createSignal } from "@barqjs/core";
import { tryCleanup } from "@barqjs/primitives/utils";
import { contains, isScrollable, ownerDocument, scrollParents } from "../dom.ts";
import { stringFormatter, type StringFormatter } from "../i18n.ts";
import { description } from "../interactions/description.ts";
import { globalListeners } from "../interactions/listeners.ts";
import { isVirtualClick, isVirtualPointerEvent } from "../interactions/modality.ts";
import type { ElementRef, PressEvent } from "../interactions/press.ts";
import { isIOS, isIPad, isMac, isWebKit } from "../platform.ts";
import { access, type DOMProps, type MaybeAccessor, mergeProps } from "../utils.ts";
import {
  ALL,
  ALLOWED_BITS,
  allowedOperation,
  COPY,
  dndState,
  type DropEffect,
  EFFECT_ALLOWED,
  EFFECT_TO_OPERATION,
  globalAllowedDropOperations,
  globalDropEffect,
  LINK,
  MOVE,
  NONE,
  OPERATION_BITS,
  OPERATION_TO_EFFECT,
  operationsToArray,
  readFromDataTransfer,
  DataTransferTypes,
  refElement,
  setGlobalAllowedDropOperations,
  setGlobalDndState,
  setGlobalDropEffect,
  writeToDataTransfer,
} from "./data.ts";
import {
  beginDragging,
  centre,
  type DragModality,
  dragModality,
  dragSession,
  registerDropTarget,
} from "./manager.ts";
import { type DndMessage, dndStrings } from "./strings.ts";
import type {
  DragEndEvent,
  DragItem,
  DragMoveEvent,
  DragPreviewRenderer,
  DragStartEvent,
  DragTypes,
  DropActivateEvent,
  DropEnterEvent,
  DropEvent,
  DropExitEvent,
  DropMoveEvent,
  DropOperation,
} from "./types.ts";

// ---------------------------------------------------------------------------
// drag
// ---------------------------------------------------------------------------

export interface DragOptions {
  onDragStart?: (event: DragStartEvent) => void;
  onDragMove?: (event: DragMoveEvent) => void;
  /** After a drop or a cancel. */
  onDragEnd?: (event: DragEndEvent) => void;
  getItems: () => DragItem[];
  /** Renders what follows the pointer. Without one, the browser photographs the element. */
  preview?: MaybeAccessor<DragPreviewRenderer | null | undefined>;
  /** @default every operation */
  getAllowedDropOperations?: () => DropOperation[];
  /**
   * Whether a separate button starts keyboard and screen reader drags. The
   * Enter and click handling then goes on `dragButtonProps`, not the element.
   */
  hasDragButton?: boolean;
  isDisabled?: MaybeAccessor<boolean | undefined>;
}

export interface DragResult {
  dragProps: DOMProps;
  /** Options for `button()`, for the drag button when there is one. */
  dragButtonProps: DOMProps;
  isDragging: Accessor<boolean>;
}

interface DragMessages {
  start: DndMessage;
  end: DndMessage;
}

const DRAG_MESSAGES: Record<DragModality, DragMessages> = {
  keyboard: { start: "dragDescriptionKeyboard", end: "endDragKeyboard" },
  touch: { start: "dragDescriptionTouch", end: "endDragTouch" },
  virtual: { start: "dragDescriptionVirtual", end: "endDragVirtual" },
};

export interface DragInteraction {
  /** `draggable` and the native drag events. */
  nativeProps: DOMProps;
  /** Enter, and a screen reader's click or long press, on the element itself. */
  accessibleProps: DOMProps;
  onPress: (event: PressEvent) => void;
  isDragging: Accessor<boolean>;
  message: Accessor<string>;
  strings: Accessor<StringFormatter<DndMessage>>;
  modality: Accessor<DragModality>;
}

export function dragInteraction(options: DragOptions): DragInteraction {
  const strings = stringFormatter(dndStrings);
  const currentModality = dragModality();
  function isDisabled(): boolean {
    return access(options.isDisabled) === true;
  }
  const listeners = globalListeners();

  const state = { x: 0, y: 0 };
  let draggingElement: Element | null = null;
  const [isDragging, setDraggingState] = createSignal(false, { ownedWrite: true });
  function setDragging(element: Element | null): void {
    draggingElement = element;
    setDraggingState(element !== null);
  }
  let modalityOnPointerDown: string | null = null;

  function allowedOperations(): DropOperation[] {
    return options.getAllowedDropOperations?.() ?? ["move", "copy", "link"];
  }

  function startDragging(target: HTMLElement): void {
    if (options.onDragStart !== undefined) {
      const { x, y } = centre(target);
      options.onDragStart({ type: "dragstart", x, y });
    }

    beginDragging(
      {
        element: target,
        items: options.getItems(),
        allowedDropOperations: allowedOperations(),
        onDragEnd(event) {
          setDragging(null);
          options.onDragEnd?.(event);
        },
      },
      strings,
    );

    setDragging(target);
  }

  function onDragStart(event: DragEvent): void {
    if (event.defaultPrevented || isDisabled()) return;
    // A draggable inside a draggable: only the innermost drags.
    event.stopPropagation();

    // A screen reader's long press arrives as a native drag; it becomes a
    // virtual one.
    if (modalityOnPointerDown === "virtual") {
      event.preventDefault();
      startDragging(event.target as HTMLElement);
      modalityOnPointerDown = null;
      return;
    }

    options.onDragStart?.({ type: "dragstart", x: event.clientX, y: event.clientY });

    const items = options.getItems();
    const dataTransfer = event.dataTransfer;
    if (dataTransfer === null) return;
    // Selected text on the page would otherwise ride along in some browsers.
    dataTransfer.clearData?.();
    writeToDataTransfer(dataTransfer, items);

    let allowed = ALL;
    if (options.getAllowedDropOperations !== undefined) {
      allowed = NONE;
      for (const operation of options.getAllowedDropOperations()) {
        allowed |= OPERATION_BITS[operation] ?? NONE;
      }
    }
    setGlobalAllowedDropOperations(allowed);
    dataTransfer.effectAllowed = EFFECT_ALLOWED[allowed] ?? "none";

    const renderer = access(options.preview);
    if (typeof renderer === "function") {
      const source = event.currentTarget as HTMLElement;
      renderer(items, (node, userX, userY) => {
        if (node === null) return;
        // Under the pointer where the element was grabbed, unless the preview
        // is too small for that, in which case centred.
        const size = node.getBoundingClientRect();
        const rect = source.getBoundingClientRect();
        let x = event.clientX - rect.x;
        let y = event.clientY - rect.y;
        if (x > size.width || y > size.height) {
          x = size.width / 2;
          y = size.height / 2;
        }
        if (typeof userX === "number" && typeof userY === "number") {
          x = userX;
          y = userY;
        }
        // Clamped here so the browser does not snap it after the first move.
        x = Math.max(0, Math.min(x, size.width));
        y = Math.max(0, Math.min(y, size.height));
        // An odd height blurs the preview on some displays.
        node.style.height = `${2 * Math.round(size.height / 2)}px`;
        dataTransfer.setDragImage(node, x, y);
      });
    }

    // A drag started here may only land on a `drop()` target, which is what
    // guarantees a keyboard alternative exists for wherever it lands.
    listeners.add(
      window,
      "drop",
      (dropEvent: Event) => {
        dropEvent.preventDefault();
        dropEvent.stopPropagation();
        console.warn(
          "A drag started with drag() may only be dropped on a target created with drop(), so that a keyboard and screen reader alternative exists.",
        );
      },
      { once: true },
    );

    state.x = event.clientX;
    state.y = event.clientY;

    // A frame later, so the browser photographs the element before its
    // dragging style lands.
    const target = event.target as Element;
    requestAnimationFrame(() => setDragging(target));
  }

  function onDrag(event: DragEvent): void {
    event.stopPropagation();
    if (event.clientX === state.x && event.clientY === state.y) return;
    options.onDragMove?.({ type: "dragmove", x: event.clientX, y: event.clientY });
    state.x = event.clientX;
    state.y = event.clientY;
  }

  function resetGlobals(): void {
    setGlobalAllowedDropOperations(NONE);
    setGlobalDropEffect(undefined);
  }

  function onDragEnd(event: DragEvent): void {
    event.stopPropagation();
    if (options.onDragEnd !== undefined) {
      // Chrome on Android always reports `none`, so the effect the drop target
      // settled on is used when there is one.
      // https://bugs.chromium.org/p/chromium/issues/detail?id=1353951
      const effect = globalDropEffect() ?? event.dataTransfer?.dropEffect ?? "none";
      options.onDragEnd({
        type: "dragend",
        x: event.clientX,
        y: event.clientY,
        dropOperation: EFFECT_TO_OPERATION[effect],
      });
    }
    setDragging(null);
    listeners.removeAll();
    resetGlobals();
  }

  // A dragged element removed by its own drop never receives `dragend`
  // (https://bugzilla.mozilla.org/show_bug.cgi?id=460801), so the drag is
  // ended here if the element did not survive.
  tryCleanup(() => {
    const element = draggingElement;
    if (element === null) return;
    queueMicrotask(() => {
      if (element.isConnected) return;
      options.onDragEnd?.({
        type: "dragend",
        x: 0,
        y: 0,
        dropOperation: EFFECT_TO_OPERATION[globalDropEffect() ?? "none"],
      });
      draggingElement = null;
      resetGlobals();
    });
  });

  function onPress(event: PressEvent): void {
    if (isDisabled()) return;
    if (event.pointerType !== "keyboard" && event.pointerType !== "virtual") return;
    startDragging(event.target as HTMLElement);
  }

  const accessibleProps: DOMProps = {
    onPointerDown(event: PointerEvent) {
      if (isDisabled()) return;
      if (isVirtualPointerEvent(event)) {
        modalityOnPointerDown = "virtual";
        return;
      }
      if (event.width < 1 && event.height < 1 && isIOS() && isWebKit()) {
        // VoiceOver on iOS.
        modalityOnPointerDown = "virtual";
        return;
      }
      const rect = (event.currentTarget as Element).getBoundingClientRect();
      const offsetX = event.clientX - rect.x;
      const offsetY = event.clientY - rect.y;
      // TalkBack presses the exact centre.
      if (Math.abs(offsetX - rect.width / 2) <= 0.5 && Math.abs(offsetY - rect.height / 2) <= 0.5) {
        modalityOnPointerDown = "virtual";
      } else {
        modalityOnPointerDown = event.pointerType;
      }
    },
    // Enter is taken in the capture phase so that selection does not also see it.
    onKeyDownCapture(event: KeyboardEvent) {
      if (isDisabled()) return;
      if (event.target === event.currentTarget && event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    onKeyUpCapture(event: KeyboardEvent) {
      if (isDisabled()) return;
      if (event.target === event.currentTarget && event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        startDragging(event.target as HTMLElement);
      }
    },
    // NVDA and JAWS in browse mode, and touch screen readers, send no keys.
    onClick(event: MouseEvent) {
      if (isDisabled()) return;
      if (isVirtualClick(event) || modalityOnPointerDown === "virtual") {
        event.preventDefault();
        event.stopPropagation();
        startDragging(event.target as HTMLElement);
      }
    },
  };

  const nativeProps: DOMProps = {
    draggable: () => (isDisabled() ? "false" : "true"),
    onDragStart,
    onDrag,
    onDragEnd,
  };

  return {
    nativeProps,
    accessibleProps,
    onPress,
    isDragging: () => !isDisabled() && isDragging(),
    message: () => {
      const messages = DRAG_MESSAGES[currentModality()];
      return strings().format(isDragging() ? messages.end : messages.start);
    },
    strings,
    modality: currentModality,
  };
}

/**
 * Make an element draggable, by pointer, keyboard and screen reader.
 *
 * ```tsx
 * const { dragProps, isDragging } = drag({
 *   getItems: () => [{ "text/plain": "salama" }],
 * });
 * <div {...dragProps} role="button" tabIndex={0} data-dragging={isDragging}>Drag me</div>
 * ```
 */
export function drag(options: DragOptions): DragResult {
  const interaction = dragInteraction(options);
  function isDisabled(): boolean {
    return access(options.isDisabled) === true;
  }
  const describedBy = description(() => (isDisabled() ? undefined : interaction.message()));

  const dragProps = mergeProps(
    options.hasDragButton === true ? {} : interaction.accessibleProps,
    options.hasDragButton === true ? {} : describedBy,
    interaction.nativeProps,
  );

  return {
    dragProps,
    dragButtonProps: {
      ...describedBy,
      onPress: interaction.onPress,
      isDisabled,
    },
    isDragging: interaction.isDragging,
  };
}

// ---------------------------------------------------------------------------
// drop
// ---------------------------------------------------------------------------

export interface DropOptions {
  ref: ElementRef<HTMLElement>;
  /** The operation a drop of `types` would perform. @default the first allowed */
  getDropOperation?: (types: DragTypes, allowedOperations: DropOperation[]) => DropOperation;
  /** As `getDropOperation`, for a point inside the target. Pointer drags only. */
  getDropOperationForPoint?: (
    types: DragTypes,
    allowedOperations: DropOperation[],
    x: number,
    y: number,
  ) => DropOperation;
  onDropEnter?: (event: DropEnterEvent) => void;
  onDropMove?: (event: DropMoveEvent) => void;
  /** A drag held over the target for a while, which typically opens it. */
  onDropActivate?: (event: DropActivateEvent) => void;
  onDropExit?: (event: DropExitEvent) => void;
  onDrop?: (event: DropEvent) => void;
  /** Whether a separate button is the target for keyboard and screen reader drops. */
  hasDropButton?: boolean;
  isDisabled?: MaybeAccessor<boolean | undefined>;
}

export interface DropResult {
  dropProps: DOMProps;
  isDropTarget: Accessor<boolean>;
  /** Options for `button()`, for the drop button when there is one. */
  dropButtonProps: DOMProps;
}

const DROP_ACTIVATE_TIMEOUT = 800;

const DROP_MESSAGES: Record<DragModality, DndMessage> = {
  keyboard: "dropDescriptionKeyboard",
  touch: "dropDescriptionTouch",
  virtual: "dropDescriptionVirtual",
};

/** The description a drop target carries while a drag is under way, and the click it needs. */
export function virtualDrop(describe: boolean): DOMProps {
  const strings = stringFormatter(dndStrings);
  const currentModality = dragModality();
  return {
    ...(describe
      ? description(() =>
          dragSession() === null ? undefined : strings().format(DROP_MESSAGES[currentModality()]),
        )
      : {}),
    // Mobile Safari only delivers a click to an element that has a click
    // listener of its own, and the drag manager reads clicks at the document.
    // Bubble-phase clicks are delegated to the root, so the listener that
    // lands on the element itself is the capturing one.
    // https://www.quirksmode.org/blog/archives/2010/09/click_event_del.html
    onClickCapture: acceptClick,
  };
}

function acceptClick(): void {
  // Present only so the element has a click listener; see `virtualDrop`.
}

function allowedOperationsOf(event: DragEvent): number {
  const effectAllowed = event.dataTransfer?.effectAllowed ?? "all";
  let allowed = ALLOWED_BITS[effectAllowed] ?? ALL;

  // WebKit reports `copyMove` on macOS and `all` on iOS whatever the drag
  // allowed (https://bugs.webkit.org/show_bug.cgi?id=178058), and Chrome on
  // Android always `copyMove`. A drag started on this page recorded what it
  // really allows.
  if (globalAllowedDropOperations() !== NONE) allowed &= globalAllowedDropOperations();

  // Chrome and Safari on macOS narrow `effectAllowed` for the modifier keys
  // themselves; Firefox and every Windows browser do not, so the narrowing is
  // done here with each platform's keys.
  let modifiers = NONE;
  if (isMac()) {
    if (event.altKey) modifiers |= COPY;
    // iPadOS never fires `drop` with a link effect.
    // https://bugs.webkit.org/show_bug.cgi?id=244701
    if (event.ctrlKey && !isIPad()) modifiers |= LINK;
    if (event.metaKey) modifiers |= MOVE;
  } else {
    if (event.altKey) modifiers |= LINK;
    if (event.shiftKey) modifiers |= MOVE;
    if (event.ctrlKey) modifiers |= COPY;
  }

  return modifiers !== NONE ? allowed & modifiers : allowed;
}

export function dropBehaviour(options: DropOptions, describe: boolean): DropResult {
  function isDisabled(): boolean {
    return access(options.isDisabled) === true;
  }
  const [isDropTarget, setDropTarget] = createSignal(false, { ownedWrite: true });
  const state = {
    x: 0,
    y: 0,
    dragOverElements: new Set<Element>(),
    dropEffect: "none" as DropEffect,
    allowedOperations: ALL,
    dropActivateTimer: undefined as ReturnType<typeof setTimeout> | undefined,
  };

  tryCleanup(() => clearTimeout(state.dropActivateTimer));

  function relative(event: DragEvent, x = event.clientX, y = event.clientY) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: x - rect.x, y: y - rect.y };
  }

  function fireDropEnter(event: DragEvent): void {
    setDropTarget(true);
    options.onDropEnter?.({ type: "dropenter", ...relative(event) });
  }

  function fireDropExit(event: DragEvent): void {
    setDropTarget(false);
    options.onDropExit?.({ type: "dropexit", ...relative(event) });
  }

  function operationForPoint(event: DragEvent, allowedBits: number, x: number, y: number) {
    const forPoint = options.getDropOperationForPoint;
    if (forPoint === undefined || event.dataTransfer === null) return null;
    const point = relative(event, x, y);
    return allowedOperation(
      allowedBits,
      forPoint(
        new DataTransferTypes(event.dataTransfer),
        operationsToArray(allowedBits),
        point.x,
        point.y,
      ),
    );
  }

  function onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (isDisabled() || event.dataTransfer === null) return;

    const allowedBits = allowedOperationsOf(event);
    if (
      event.clientX === state.x &&
      event.clientY === state.y &&
      allowedBits === state.allowedOperations
    ) {
      event.dataTransfer.dropEffect = state.dropEffect;
      return;
    }

    state.x = event.clientX;
    state.y = event.clientY;
    const previousEffect = state.dropEffect;

    // A modifier key pressed mid-drag changes what is allowed.
    if (allowedBits !== state.allowedOperations) {
      const allowed = operationsToArray(allowedBits);
      let operation: DropOperation = allowed[0] ?? "cancel";
      if (options.getDropOperation !== undefined) {
        operation = allowedOperation(
          allowedBits,
          options.getDropOperation(new DataTransferTypes(event.dataTransfer), allowed),
        );
      }
      state.dropEffect = OPERATION_TO_EFFECT[operation];
    }

    const forPoint = operationForPoint(event, allowedBits, state.x, state.y);
    if (forPoint !== null) state.dropEffect = OPERATION_TO_EFFECT[forPoint];

    state.allowedOperations = allowedBits;
    event.dataTransfer.dropEffect = state.dropEffect;

    if (state.dropEffect === "none" && previousEffect !== "none") fireDropExit(event);
    else if (state.dropEffect !== "none" && previousEffect === "none") fireDropEnter(event);

    if (options.onDropMove !== undefined && state.dropEffect !== "none") {
      options.onDropMove({ type: "dropmove", ...relative(event, state.x, state.y) });
    }

    clearTimeout(state.dropActivateTimer);
    const onDropActivate = options.onDropActivate;
    if (onDropActivate !== undefined && state.dropEffect !== "none") {
      const point = relative(event, state.x, state.y);
      state.dropActivateTimer = setTimeout(() => {
        onDropActivate({ type: "dropactivate", ...point });
      }, DROP_ACTIVATE_TIMEOUT);
    }
  }

  function onDragEnter(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (isDisabled() || event.dataTransfer === null) return;

    state.dragOverElements.add(event.target as Element);
    if (state.dragOverElements.size > 1) return;

    const allowedBits = allowedOperationsOf(event);
    const allowed = operationsToArray(allowedBits);
    let operation: DropOperation = allowed[0] ?? "cancel";
    if (options.getDropOperation !== undefined) {
      operation = allowedOperation(
        allowedBits,
        options.getDropOperation(new DataTransferTypes(event.dataTransfer), allowed),
      );
    }
    const forPoint = operationForPoint(event, allowedBits, event.clientX, event.clientY);
    if (forPoint !== null) operation = forPoint;

    state.x = event.clientX;
    state.y = event.clientY;
    state.allowedOperations = allowedBits;
    state.dropEffect = OPERATION_TO_EFFECT[operation];
    event.dataTransfer.dropEffect = state.dropEffect;

    if (operation !== "cancel") fireDropEnter(event);
  }

  function onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (isDisabled()) return;

    // `relatedTarget` would answer whether the drag is still inside, but
    // WebKit always reports null (https://bugs.webkit.org/show_bug.cgi?id=66547).
    // So every element entered is counted, and the target is left when the
    // count is empty. An element removed mid-drag (a drop indicator that
    // moved) never reports leaving, so those are dropped too.
    const target = event.target as Element;
    state.dragOverElements.delete(target);
    if (target === event.currentTarget) {
      for (const element of state.dragOverElements) {
        if (!contains(event.currentTarget as Element, element)) {
          state.dragOverElements.delete(element);
        }
      }
    }

    if (state.dragOverElements.size > 0) return;
    if (state.dropEffect !== "none") fireDropExit(event);
    clearTimeout(state.dropActivateTimer);
  }

  function onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (isDisabled()) return;

    // Kept for `dragend`, which Chrome on Android reports as `none`.
    setGlobalDropEffect(state.dropEffect);

    if (options.onDrop !== undefined) {
      options.onDrop({
        type: "drop",
        ...relative(event),
        items: readFromDataTransfer(event.dataTransfer),
        dropOperation: EFFECT_TO_OPERATION[state.dropEffect],
      });
    }

    const snapshot = { ...dndState() };
    state.dragOverElements.clear();
    fireDropExit(event);
    clearTimeout(state.dropActivateTimer);
    // A drag from outside any collection needs nothing kept for its `dragend`.
    // One from a collection does: its `dragend` asks whether the drop was
    // internal, and the exit above cleared the drop collection.
    if (snapshot.draggingCollectionRef === undefined) setGlobalDropEffect(undefined);
    else setGlobalDndState(snapshot);
  }

  createEffect(
    () => ({ element: refElement(options.ref) as HTMLElement | null, disabled: isDisabled() }),
    ({ element, disabled }) => {
      if (disabled || element === null) return undefined;
      return registerDropTarget({
        element,
        getDropOperation: (types, allowed) =>
          options.getDropOperation?.(types, allowed) ?? allowed[0] ?? "cancel",
        onDropEnter(event) {
          setDropTarget(true);
          options.onDropEnter?.(event);
        },
        onDropExit(event) {
          setDropTarget(false);
          options.onDropExit?.(event);
        },
        onDrop: (event) => options.onDrop?.(event),
        onDropActivate: (event) => options.onDropActivate?.(event),
      });
    },
  );

  const virtual = virtualDrop(describe);
  const hasDropButton = options.hasDropButton === true;

  return {
    dropProps: {
      ...(hasDropButton ? {} : virtual),
      onDragEnter,
      onDragOver,
      onDragLeave,
      onDrop,
    },
    dropButtonProps: { ...(hasDropButton ? virtual : {}), isDisabled },
    isDropTarget: () => !isDisabled() && isDropTarget(),
  };
}

/**
 * Make an element a drop target, by pointer, keyboard and screen reader.
 *
 * ```tsx
 * const domRef = ref<HTMLDivElement>();
 * const { dropProps, isDropTarget } = drop({ ref: domRef, onDrop: (e) => read(e.items) });
 * <div {...dropProps} ref={domRef.set} role="button" tabIndex={0} data-drop-target={isDropTarget} />
 * ```
 */
export function drop(options: DropOptions): DropResult {
  return dropBehaviour(options, true);
}

// ---------------------------------------------------------------------------
// Auto scroll
// ---------------------------------------------------------------------------

const AUTOSCROLL_AREA_SIZE = 20;

export interface AutoScroll {
  move(x: number, y: number): void;
  stop(): void;
}

/**
 * Scroll the element's scroll parent while a drag hovers near its edge.
 *
 * Every engine does this natively except WebKit on macOS.
 * https://bugs.webkit.org/show_bug.cgi?id=222636
 */
export function autoScroll(ref: ElementRef): AutoScroll {
  const state = {
    timer: undefined as number | undefined,
    dx: 0,
    dy: 0,
    scrollable: null as Element | null,
    x: true,
    y: true,
  };

  function resolve(): Element | null {
    const element = refElement(ref);
    if (element === null) return null;
    if (state.scrollable === null) {
      state.scrollable = isScrollable(element)
        ? element
        : (scrollParents(element.parentElement ?? element)[0] ??
          ownerDocument(element).scrollingElement ??
          ownerDocument(element).documentElement);
      const style = window.getComputedStyle(state.scrollable);
      state.x = /(auto|scroll)/.test(style.overflowX);
      state.y = /(auto|scroll)/.test(style.overflowY);
    }
    return state.scrollable;
  }

  function stop(): void {
    if (state.timer === undefined) return;
    cancelAnimationFrame(state.timer);
    state.timer = undefined;
  }

  tryCleanup(stop);

  function scroll(): void {
    const scrollable = state.scrollable;
    if (scrollable !== null) {
      if (state.x) scrollable.scrollLeft += state.dx;
      if (state.y) scrollable.scrollTop += state.dy;
    }
    if (state.timer !== undefined) state.timer = requestAnimationFrame(scroll);
  }

  return {
    move(x, y) {
      if (!isWebKit() || isIOS()) return;
      const scrollable = resolve();
      if (scrollable === null) return;

      const box = scrollable.getBoundingClientRect();
      const left = AUTOSCROLL_AREA_SIZE;
      const top = AUTOSCROLL_AREA_SIZE;
      const bottom = box.height - AUTOSCROLL_AREA_SIZE;
      const right = box.width - AUTOSCROLL_AREA_SIZE;
      if (x < left || x > right || y < top || y > bottom) {
        if (x < left) state.dx = x - left;
        else if (x > right) state.dx = x - right;
        if (y < top) state.dy = y - top;
        else if (y > bottom) state.dy = y - bottom;
        if (state.timer === undefined) state.timer = requestAnimationFrame(scroll);
      } else {
        stop();
      }
    },
    stop,
  };
}
