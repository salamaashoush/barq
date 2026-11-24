/**
 * The drag manager: drags driven by a keyboard or a screen reader.
 *
 * The platform's drag and drop cannot be operated without a pointer, so these
 * drags run here instead: a session that starts on Enter or a screen reader's
 * click, walks the registered drop targets with Tab, and drops on Enter.
 */

import { type Accessor, createSignal } from "@barqjs/core";
import { activeElement, contains } from "../dom.ts";
import type { StringFormatter } from "../i18n.ts";
import {
  getInteractionModality,
  isVirtualClick,
  isVirtualPointerEvent,
  modality,
} from "../interactions/modality.ts";
import type { ElementRef } from "../interactions/press.ts";
import { announce } from "../live.ts";
import { ariaHideOutside } from "../overlays.ts";
import type { Point } from "../virtualizer.tsx";
import { getTypes, refElement } from "./data.ts";
import type { DndMessage } from "./strings.ts";
import type {
  DragEndEvent,
  DragItem,
  DragTypes,
  DropActivateEvent,
  DropEnterEvent,
  DropEvent,
  DropExitEvent,
  DropItem,
  DropOperation,
  DropTarget,
} from "./types.ts";

// ---------------------------------------------------------------------------
// Modality
// ---------------------------------------------------------------------------

export type DragModality = "keyboard" | "touch" | "virtual";

function mapModality(value: string | null): DragModality {
  let next = value ?? "virtual";
  if (next === "pointer") next = "virtual";
  if (
    next === "virtual" &&
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches
  ) {
    next = "touch";
  }
  return next as DragModality;
}

/** How a drag that does not use a mouse is being driven, right now. */
export function getDragModality(): DragModality {
  return mapModality(getInteractionModality());
}

/** {@link getDragModality}, as a signal. */
export function dragModality(): Accessor<DragModality> {
  const current = modality();
  return () => mapModality(current());
}

// ---------------------------------------------------------------------------
// The drag manager: drags driven by a keyboard or a screen reader
// ---------------------------------------------------------------------------

export interface DragTarget {
  element: HTMLElement;
  items: DragItem[];
  allowedDropOperations: DropOperation[];
  onDragEnd?: (event: DragEndEvent) => void;
}

export interface ManagedDropTarget {
  element: HTMLElement;
  /** Leave focus where the target put it after a drop, rather than re-announcing it. */
  preventFocusOnDrop?: boolean;
  getDropOperation?: (types: DragTypes, allowedOperations: DropOperation[]) => DropOperation;
  onDropEnter?: (event: DropEnterEvent, drag: DragTarget) => void;
  onDropExit?: (event: DropExitEvent) => void;
  onDropTargetEnter?: (target: DropTarget | null) => void;
  onDropActivate?: (event: DropActivateEvent, target: DropTarget | null) => void;
  onDrop?: (event: DropEvent, target: DropTarget | null) => void;
  onKeyDown?: (event: KeyboardEvent, drag: DragTarget) => void;
  activateButtonRef?: ElementRef<HTMLElement>;
}

export interface ManagedDropItem {
  element: HTMLElement;
  target: DropTarget;
  getDropOperation?: (types: DragTypes, allowedOperations: DropOperation[]) => DropOperation;
  activateButtonRef?: ElementRef<HTMLElement>;
}

const dropTargets = new Map<Element, ManagedDropTarget>();
const dropItems = new Map<Element, ManagedDropItem>();
let currentSession: DragSession | null = null;
// Published beside the plain variable: the manager acts on the session in the
// same handler that started it, before any flush has delivered the signal.
const [sessionVersion, publishSession] = createSignal(0, { equals: false, ownedWrite: true });

/** Make an element a place a keyboard or screen reader drag can be dropped. */
export function registerDropTarget(target: ManagedDropTarget): () => void {
  dropTargets.set(target.element, target);
  currentSession?.updateValidDropTargets();
  return () => {
    dropTargets.delete(target.element);
    currentSession?.updateValidDropTargets();
  };
}

/** Make an element inside a drop target one of its finer targets: between, or on, an item. */
export function registerDropItem(item: ManagedDropItem): () => void {
  dropItems.set(item.element, item);
  return () => {
    dropItems.delete(item.element);
  };
}

/** Start a drag that the keyboard or a screen reader will finish. */
export function beginDragging(target: DragTarget, strings: Accessor<StringFormatter>): void {
  if (currentSession !== null) throw new Error("Cannot begin dragging while already dragging");

  currentSession = new DragSession(target, strings);
  // A frame later, so the keyup that started the drag is not also read as the
  // first key of the session.
  requestAnimationFrame(() => {
    if (currentSession === null) return;
    currentSession.setup();
    if (getDragModality() === "keyboard") currentSession.next();
  });
  publishSession(0);
}

/** The drag the keyboard or a screen reader is performing, if any. */
export function dragSession(): DragSession | null {
  sessionVersion();
  return currentSession;
}

/** Whether a keyboard or screen reader drag is in progress. Reactive. */
export function isVirtualDragging(): boolean {
  return dragSession() !== null;
}

function endDragging(): void {
  currentSession = null;
  publishSession(0);
}

/** Whether `element` is, or is inside, a registered drop target. */
export function isValidDropTarget(element: Element): boolean {
  for (const target of dropTargets.keys()) {
    if (contains(target, element)) return true;
  }
  return false;
}

const CANCELED_EVENTS = [
  "pointerdown",
  "pointermove",
  "pointerenter",
  "pointerleave",
  "pointerover",
  "pointerout",
  "pointerup",
  "mousedown",
  "mousemove",
  "mouseenter",
  "mouseleave",
  "mouseover",
  "mouseout",
  "mouseup",
  "touchstart",
  "touchmove",
  "touchend",
  "focusin",
  "focusout",
];

const CLICK_EVENTS = new Set(["pointerup", "mouseup", "touchend"]);

const STARTED_MESSAGES: Record<DragModality, DndMessage> = {
  keyboard: "dragStartedKeyboard",
  touch: "dragStartedTouch",
  virtual: "dragStartedVirtual",
};

const HIDDEN_SELECTOR = '[aria-hidden="true"], [inert]';

export function centre(element: Element): Point {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/**
 * One drag without a pointer, from start to drop or cancel.
 *
 * While it runs, the page is reduced to the drag source and the valid drop
 * targets: everything else is made inert, pointer and focus events elsewhere
 * are swallowed, and focus that wanders off is brought back.
 */
export class DragSession {
  dragTarget: DragTarget;
  validDropTargets: ManagedDropTarget[] = [];
  currentDropTarget: ManagedDropTarget | null = null;
  currentDropItem: ManagedDropItem | null = null;
  dropOperation: DropOperation | null = null;
  #mutationObserver: MutationObserver | null = null;
  #restoreAriaHidden: (() => void) | null = null;
  #strings: Accessor<StringFormatter>;
  #isVirtualClick = false;
  #initialFocused = false;

  constructor(target: DragTarget, strings: Accessor<StringFormatter>) {
    this.dragTarget = target;
    this.#strings = strings;
  }

  setup(): void {
    document.addEventListener("keydown", this.onKeyDown, true);
    document.addEventListener("keyup", this.onKeyUp, true);
    window.addEventListener("focus", this.onFocus, true);
    window.addEventListener("blur", this.onBlur, true);
    document.addEventListener("click", this.onClick, true);
    document.addEventListener("pointerdown", this.onPointerDown, true);
    for (const event of CANCELED_EVENTS) {
      document.addEventListener(event, this.cancelEvent, true);
    }

    this.#mutationObserver = new MutationObserver(() => this.updateValidDropTargets());
    this.updateValidDropTargets();

    announce(this.#strings().format(STARTED_MESSAGES[getDragModality()]));
  }

  teardown(): void {
    document.removeEventListener("keydown", this.onKeyDown, true);
    document.removeEventListener("keyup", this.onKeyUp, true);
    window.removeEventListener("focus", this.onFocus, true);
    window.removeEventListener("blur", this.onBlur, true);
    document.removeEventListener("click", this.onClick, true);
    document.removeEventListener("pointerdown", this.onPointerDown, true);
    for (const event of CANCELED_EVENTS) {
      document.removeEventListener(event, this.cancelEvent, true);
    }

    this.#mutationObserver?.disconnect();
    this.#mutationObserver = null;
    this.#restoreAriaHidden?.();
    this.#restoreAriaHidden = null;
  }

  onKeyDown = (event: KeyboardEvent): void => {
    this.cancelEvent(event);

    if (event.key === "Escape") {
      this.cancel();
      return;
    }

    if (event.key === "Tab" && !(event.metaKey || event.altKey || event.ctrlKey)) {
      if (event.shiftKey) this.previous();
      else this.next();
    }

    this.currentDropTarget?.onKeyDown?.(event, this.dragTarget);
  };

  onKeyUp = (event: KeyboardEvent): void => {
    this.cancelEvent(event);

    if (event.key !== "Enter") return;
    const target = event.target instanceof Node ? event.target : null;
    if (event.altKey || contains(this.#activateButton(), target)) {
      this.activate(this.currentDropTarget, this.currentDropItem);
    } else {
      this.drop();
    }
  };

  #activateButton(): HTMLElement | null {
    return (refElement(this.currentDropItem?.activateButtonRef) ??
      refElement(this.currentDropTarget?.activateButtonRef)) as HTMLElement | null;
  }

  onFocus = (event: FocusEvent): void => {
    const target = event.target;
    if (target !== null && target === this.#activateButton()) {
      this.cancelEvent(event);
      return;
    }

    // Focus goes nowhere but back to the source and to the drop targets.
    if (target !== this.dragTarget.element) this.cancelEvent(event);

    // The window or the document taking focus is dealt with by `onBlur`.
    if (!(target instanceof HTMLElement) || target === this.dragTarget.element) return;

    const dropTarget =
      this.validDropTargets.find((candidate) => candidate.element === target) ??
      this.validDropTargets.find((candidate) => contains(candidate.element, target));

    if (dropTarget === undefined) {
      if (this.currentDropTarget !== null) this.currentDropTarget.element.focus();
      else this.dragTarget.element.focus();
      return;
    }

    this.setCurrentDropTarget(dropTarget, dropItems.get(target));
  };

  onBlur = (event: FocusEvent): void => {
    const activateButton = this.#activateButton();
    if (activateButton !== null && event.relatedTarget === activateButton) {
      this.cancelEvent(event);
      return;
    }

    if (event.target !== this.dragTarget.element) this.cancelEvent(event);

    // Focus leaving for nothing, or for the window itself: put it back.
    if (event.relatedTarget === null || !(event.relatedTarget instanceof HTMLElement)) {
      if (this.currentDropTarget !== null) this.currentDropTarget.element.focus();
      else this.dragTarget.element.focus();
    }
  };

  onClick = (event: MouseEvent): void => {
    this.cancelEvent(event);
    if (!isVirtualClick(event) && !this.#isVirtualClick) return;

    const target = event.target instanceof HTMLElement ? event.target : null;
    const item = [...dropItems.values()].find(
      (candidate) =>
        candidate.element === target || contains(refElement(candidate.activateButtonRef), target),
    );
    const dropTarget = this.validDropTargets.find((candidate) =>
      contains(candidate.element, target),
    );
    const activateButton =
      refElement(item?.activateButtonRef) ?? refElement(dropTarget?.activateButtonRef);
    if (dropTarget !== undefined && contains(activateButton, target)) {
      this.activate(dropTarget, item);
      return;
    }

    if (target === this.dragTarget.element) {
      this.cancel();
      return;
    }

    if (dropTarget !== undefined) {
      this.setCurrentDropTarget(dropTarget, item);
      this.drop(item);
    }
  };

  onPointerDown = (event: PointerEvent): void => {
    // TalkBack's double tap reports `detail` 1 on its click, so whether it is
    // virtual has to be read here, before the click arrives.
    this.cancelEvent(event);
    this.#isVirtualClick = isVirtualPointerEvent(event);
  };

  cancelEvent = (event: Event): void => {
    // The source and the activate button keep their focus events, or their
    // focus rings would never update.
    if (
      (event.type === "focusin" || event.type === "focusout") &&
      (event.target === this.dragTarget.element || event.target === this.#activateButton())
    ) {
      return;
    }

    // A cancelled pointerup, mouseup or touchend cancels the click after it.
    if (!CLICK_EVENTS.has(event.type)) event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };

  updateValidDropTargets(): void {
    if (this.#mutationObserver === null) return;

    this.#mutationObserver.disconnect();
    this.#restoreAriaHidden?.();
    this.#restoreAriaHidden = null;

    this.validDropTargets = findValidDropTargets(this.dragTarget);

    // Start from the target nearest the source, so Tab goes where the eye does.
    if (this.validDropTargets.length > 0) {
      const nearest = this.#findNearestDropTarget();
      this.validDropTargets = [
        ...this.validDropTargets.slice(nearest),
        ...this.validDropTargets.slice(0, nearest),
      ];
    }

    if (
      this.currentDropTarget !== null &&
      !this.validDropTargets.includes(this.currentDropTarget)
    ) {
      this.setCurrentDropTarget(this.validDropTargets[0] ?? null);
    }

    const types = getTypes(this.dragTarget.items);
    const validDropItems = [...dropItems.values()].filter(
      (item) =>
        item.getDropOperation === undefined ||
        item.getDropOperation(types, this.dragTarget.allowedDropOperations) !== "cancel",
    );

    // A target that holds valid items stays hidden around them: only the
    // items inside it are revealed.
    const visibleDropTargets = this.validDropTargets.filter(
      (target) => !validDropItems.some((item) => contains(target.element, item.element)),
    );

    function withButton(element: HTMLElement, button: ElementRef | undefined): Element[] {
      const activate = refElement(button);
      return activate === null ? [element] : [element, activate];
    }

    this.#restoreAriaHidden = ariaHideOutside(
      [
        this.dragTarget.element,
        ...validDropItems.flatMap((item) => withButton(item.element, item.activateButtonRef)),
        ...visibleDropTargets.flatMap((target) =>
          withButton(target.element, target.activateButtonRef),
        ),
      ],
      { shouldUseInert: true },
    );

    this.#mutationObserver.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-hidden", "inert"],
    });
  }

  next(): void {
    if (this.currentDropTarget === null) {
      this.setCurrentDropTarget(this.validDropTargets[0] ?? null);
      return;
    }

    const index = this.validDropTargets.indexOf(this.currentDropTarget);
    if (index < 0) {
      this.setCurrentDropTarget(this.validDropTargets[0] ?? null);
      return;
    }

    // Past the last target, back to the source, which is how a keyboard with
    // no Escape key (an iPad's) cancels.
    if (index === this.validDropTargets.length - 1) {
      if (this.dragTarget.element.closest(HIDDEN_SELECTOR) === null) {
        this.setCurrentDropTarget(null);
        this.dragTarget.element.focus();
      } else {
        this.setCurrentDropTarget(this.validDropTargets[0] ?? null);
      }
    } else {
      this.setCurrentDropTarget(this.validDropTargets[index + 1] ?? null);
    }
  }

  previous(): void {
    const last = this.validDropTargets[this.validDropTargets.length - 1] ?? null;
    if (this.currentDropTarget === null) {
      this.setCurrentDropTarget(last);
      return;
    }

    const index = this.validDropTargets.indexOf(this.currentDropTarget);
    if (index < 0) {
      this.setCurrentDropTarget(last);
      return;
    }

    if (index === 0) {
      if (this.dragTarget.element.closest(HIDDEN_SELECTOR) === null) {
        this.setCurrentDropTarget(null);
        this.dragTarget.element.focus();
      } else {
        this.setCurrentDropTarget(last);
      }
    } else {
      this.setCurrentDropTarget(this.validDropTargets[index - 1] ?? null);
    }
  }

  /** The target containing the source wins; otherwise the closest by top-left corner. */
  #findNearestDropTarget(): number {
    const source = this.dragTarget.element.getBoundingClientRect();
    let minDistance = Infinity;
    let nearest = -1;
    let ancestor = -1;
    for (let i = 0; i < this.validDropTargets.length; i++) {
      const target = this.validDropTargets[i] as ManagedDropTarget;
      if (ancestor < 0 && contains(target.element, this.dragTarget.element)) ancestor = i;
      const rect = target.element.getBoundingClientRect();
      const dx = rect.left - source.left;
      const dy = rect.top - source.top;
      const distance = dx * dx + dy * dy;
      if (distance < minDistance) {
        minDistance = distance;
        nearest = i;
      }
    }
    return ancestor >= 0 ? ancestor : nearest;
  }

  setCurrentDropTarget(dropTarget: ManagedDropTarget | null, item?: ManagedDropItem): void {
    if (dropTarget !== this.currentDropTarget) {
      if (this.currentDropTarget?.onDropExit !== undefined) {
        const { x, y } = centre(this.currentDropTarget.element);
        this.currentDropTarget.onDropExit({ type: "dropexit", x, y });
      }

      this.currentDropTarget = dropTarget;

      if (dropTarget !== null) {
        if (dropTarget.onDropEnter !== undefined) {
          const { x, y } = centre(dropTarget.element);
          dropTarget.onDropEnter({ type: "dropenter", x, y }, this.dragTarget);
        }
        if (item === undefined) dropTarget.element.focus();
      }
    }

    if (item !== undefined && item !== this.currentDropItem) {
      this.currentDropTarget?.onDropTargetEnter?.(item.target);
      item.element.focus();
      this.currentDropItem = item;

      // The first target is announced politely, after the assertive "started
      // dragging", which would otherwise talk over it.
      if (!this.#initialFocused) {
        const label = item.element.getAttribute("aria-label");
        if (label !== null && label !== "") announce(label, "polite");
        this.#initialFocused = true;
      }
    }
  }

  end(): void {
    this.teardown();
    endDragging();

    if (this.dragTarget.onDragEnd !== undefined) {
      const target =
        this.currentDropTarget !== null && this.dropOperation !== "cancel"
          ? this.currentDropTarget
          : this.dragTarget;
      const { x, y } = centre(target.element);
      this.dragTarget.onDragEnd({
        type: "dragend",
        x,
        y,
        dropOperation: this.dropOperation ?? "cancel",
      });
    }

    // Focus events were swallowed during the drag, so whatever holds focus now
    // never heard it arrive. A collection repairs its own focus after a drop.
    if (this.currentDropTarget !== null && this.currentDropTarget.preventFocusOnDrop !== true) {
      activeElement()?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    }

    this.setCurrentDropTarget(null);
  }

  cancel(): void {
    this.setCurrentDropTarget(null);
    this.end();
    if (this.dragTarget.element.closest(HIDDEN_SELECTOR) === null) {
      this.dragTarget.element.focus();
    }
    activeElement()?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    announce(this.#strings().format("dropCanceled"));
  }

  drop(item?: ManagedDropItem): void {
    const target = this.currentDropTarget;
    if (target === null) {
      this.cancel();
      return;
    }

    const types = getTypes(this.dragTarget.items);
    if (item?.getDropOperation !== undefined) {
      this.dropOperation = item.getDropOperation(types, this.dragTarget.allowedDropOperations);
    } else if (target.getDropOperation !== undefined) {
      this.dropOperation = target.getDropOperation(types, this.dragTarget.allowedDropOperations);
    } else {
      this.dropOperation = this.dragTarget.allowedDropOperations[0] ?? "cancel";
    }

    if (target.onDrop !== undefined) {
      const items: DropItem[] = this.dragTarget.items.map((dragged) => ({
        kind: "text",
        types: new Set(Object.keys(dragged)),
        getText: (type: string) => Promise.resolve(dragged[type] as string),
      }));
      const { x, y } = centre(target.element);
      target.onDrop(
        { type: "drop", x, y, items, dropOperation: this.dropOperation },
        item?.target ?? null,
      );
    }

    this.end();
    announce(this.#strings().format("dropComplete"));
  }

  activate(
    dropTarget: ManagedDropTarget | null,
    dropItem: ManagedDropItem | null | undefined,
  ): void {
    if (dropTarget?.onDropActivate === undefined) return;
    const { x, y } = centre(dropTarget.element);
    dropTarget.onDropActivate({ type: "dropactivate", x, y }, dropItem?.target ?? null);
  }
}

function findValidDropTargets(dragTarget: DragTarget): ManagedDropTarget[] {
  const types = getTypes(dragTarget.items);
  return [...dropTargets.values()].filter((target) => {
    if (target.element.closest(HIDDEN_SELECTOR) !== null) return false;
    if (target.getDropOperation === undefined) return true;
    return target.getDropOperation(types, dragTarget.allowedDropOperations) !== "cancel";
  });
}
