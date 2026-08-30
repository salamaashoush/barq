/**
 * Dragging a value: a slider thumb, a colour area, a resize handle.
 *
 * Deltas rather than positions, and the same deltas from the arrow keys as
 * from a pointer, so the consumer writes the value update once and gets
 * keyboard support for free.
 *
 * `PointerEvent.movementX` would seem to be the answer and is not: it is
 * always zero in WebKit on macOS, and Chrome on Android scales it by the
 * device pixel ratio while Chrome on macOS does not. The difference between
 * successive `pageX` values is the only portable delta.
 */

import { ownerWindow, targetElement } from "../dom.ts";
import type { DOMProps } from "../utils.ts";
import { globalListeners } from "./listeners.ts";
import type { PointerType } from "./modality.ts";
import { disableTextSelection, restoreTextSelection } from "./text-selection.ts";

interface Modifiers {
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

export interface MoveStartEvent extends Modifiers {
  type: "movestart";
  pointerType: PointerType;
}

export interface MoveMoveEvent extends Modifiers {
  type: "move";
  pointerType: PointerType;
  deltaX: number;
  deltaY: number;
}

export interface MoveEndEvent extends Modifiers {
  type: "moveend";
  pointerType: PointerType;
}

export interface MoveOptions {
  onMoveStart?: (event: MoveStartEvent) => void;
  onMove?: (event: MoveMoveEvent) => void;
  onMoveEnd?: (event: MoveEndEvent) => void;
}

export interface MoveResult {
  moveProps: DOMProps;
}

function modifiers(event: Modifiers): Modifiers {
  return {
    shiftKey: event.shiftKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    altKey: event.altKey,
  };
}

/**
 * Move handling for one element.
 *
 * ```tsx
 * const { moveProps } = move({ onMove: (e) => value.update((v) => v + e.deltaX) });
 * <div {...moveProps} role="slider" tabIndex={0} />
 * ```
 */
export function move(options: MoveOptions): MoveResult {
  const listeners = globalListeners();
  const state = {
    didMove: false,
    last: null as { pageX: number; pageY: number } | null,
    id: null as number | null,
  };

  const start = (): void => {
    disableTextSelection();
    state.didMove = false;
  };

  const emit = (
    event: Modifiers,
    pointerType: PointerType,
    deltaX: number,
    deltaY: number,
  ): void => {
    if (deltaX === 0 && deltaY === 0) return;

    if (!state.didMove) {
      state.didMove = true;
      options.onMoveStart?.({ type: "movestart", pointerType, ...modifiers(event) });
    }
    options.onMove?.({ type: "move", pointerType, deltaX, deltaY, ...modifiers(event) });
  };

  const end = (event: Modifiers, pointerType: PointerType): void => {
    restoreTextSelection();
    if (state.didMove) options.onMoveEnd?.({ type: "moveend", pointerType, ...modifiers(event) });
  };

  const moveProps: DOMProps = {};

  if (typeof PointerEvent !== "undefined") {
    const onPointerMove = (raw: Event): void => {
      const event = raw as PointerEvent;
      if (event.pointerId !== state.id) return;
      const pointerType = (event.pointerType || "mouse") as PointerType;
      emit(
        event,
        pointerType,
        event.pageX - (state.last?.pageX ?? 0),
        event.pageY - (state.last?.pageY ?? 0),
      );
      state.last = { pageX: event.pageX, pageY: event.pageY };
    };

    const onPointerUp = (raw: Event): void => {
      const event = raw as PointerEvent;
      if (event.pointerId !== state.id) return;
      end(event, (event.pointerType || "mouse") as PointerType);
      state.id = null;
      listeners.removeAll();
    };

    moveProps.onPointerDown = (event: PointerEvent): void => {
      if (event.button !== 0 || state.id !== null) return;
      start();
      event.stopPropagation();
      event.preventDefault();
      state.last = { pageX: event.pageX, pageY: event.pageY };
      state.id = event.pointerId;

      const view = ownerWindow(targetElement(event));
      listeners.add(view, "pointermove", onPointerMove, false);
      listeners.add(view, "pointerup", onPointerUp, false);
      listeners.add(view, "pointercancel", onPointerUp, false);
    };
  } else {
    const onMouseMove = (raw: Event): void => {
      const event = raw as MouseEvent;
      if (event.button !== 0) return;
      emit(
        event,
        "mouse",
        event.pageX - (state.last?.pageX ?? 0),
        event.pageY - (state.last?.pageY ?? 0),
      );
      state.last = { pageX: event.pageX, pageY: event.pageY };
    };

    const onMouseUp = (raw: Event): void => {
      const event = raw as MouseEvent;
      if (event.button !== 0) return;
      end(event, "mouse");
      listeners.removeAll();
    };

    moveProps.onMouseDown = (event: MouseEvent): void => {
      if (event.button !== 0) return;
      start();
      event.stopPropagation();
      event.preventDefault();
      state.last = { pageX: event.pageX, pageY: event.pageY };

      const view = ownerWindow(targetElement(event));
      listeners.add(view, "mousemove", onMouseMove, false);
      listeners.add(view, "mouseup", onMouseUp, false);
    };

    const findTouch = (event: TouchEvent): Touch | undefined => {
      for (let i = 0; i < event.changedTouches.length; i++) {
        const touch = event.changedTouches[i];
        if (touch !== undefined && touch.identifier === state.id) return touch;
      }
      return undefined;
    };

    const onTouchMove = (raw: Event): void => {
      const event = raw as TouchEvent;
      const touch = findTouch(event);
      if (touch === undefined) return;
      emit(
        event,
        "touch",
        touch.pageX - (state.last?.pageX ?? 0),
        touch.pageY - (state.last?.pageY ?? 0),
      );
      state.last = { pageX: touch.pageX, pageY: touch.pageY };
    };

    const onTouchEnd = (raw: Event): void => {
      const event = raw as TouchEvent;
      if (findTouch(event) === undefined) return;
      end(event, "touch");
      state.id = null;
      listeners.removeAll();
    };

    moveProps.onTouchStart = (event: TouchEvent): void => {
      const touch = event.changedTouches[0];
      if (touch === undefined || state.id !== null) return;

      start();
      event.stopPropagation();
      event.preventDefault();
      state.last = { pageX: touch.pageX, pageY: touch.pageY };
      state.id = touch.identifier;

      const view = ownerWindow(targetElement(event));
      listeners.add(view, "touchmove", onTouchMove, false);
      listeners.add(view, "touchend", onTouchEnd, false);
      listeners.add(view, "touchcancel", onTouchEnd, false);
    };
  }

  const keyboardMove = (event: KeyboardEvent, deltaX: number, deltaY: number): void => {
    start();
    emit(event, "keyboard", deltaX, deltaY);
    end(event, "keyboard");
  };

  moveProps.onKeyDown = (event: KeyboardEvent): void => {
    switch (event.key) {
      case "Left":
      case "ArrowLeft":
        event.preventDefault();
        event.stopPropagation();
        keyboardMove(event, -1, 0);
        break;
      case "Right":
      case "ArrowRight":
        event.preventDefault();
        event.stopPropagation();
        keyboardMove(event, 1, 0);
        break;
      case "Up":
      case "ArrowUp":
        event.preventDefault();
        event.stopPropagation();
        keyboardMove(event, 0, -1);
        break;
      case "Down":
      case "ArrowDown":
        event.preventDefault();
        event.stopPropagation();
        keyboardMove(event, 0, 1);
        break;
      default:
        break;
    }
  };

  return { moveProps };
}
