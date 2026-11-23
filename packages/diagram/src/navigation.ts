import { MIN_ZOOM, ZOOM_STEP } from "@excalidraw/common";
import { getCommonBounds, getNonDeletedElements } from "@excalidraw/element";
import type { ExcalidrawElement } from "@excalidraw/element/types";

import { resolveInputDevice } from "./app-state.ts";
import { getNormalizedZoom } from "./scene/normalize.ts";
import type { AppState, PointerCoords } from "./types.ts";
import {
  constrainScrollState,
  getViewportForZoomWithScrollConstraints,
  type ViewportFit,
  zoomToFitBounds,
} from "./viewport.ts";

/** The part of the app state navigation moves. */
export type ViewportState = Pick<AppState, "scrollX" | "scrollY" | "zoom">;

type NavigationState = Pick<
  AppState,
  | "scrollX"
  | "scrollY"
  | "zoom"
  | "width"
  | "height"
  | "offsetLeft"
  | "offsetTop"
  | "scrollConstraints"
  | "inputDevice"
>;

const WHEEL_BUTTON_MASK = 4;

/** Zooms around a point in viewport (client) coordinates. */
export function zoomAt(
  state: NavigationState,
  nextZoom: number,
  viewportX: number,
  viewportY: number,
): ViewportState {
  return getViewportForZoomWithScrollConstraints(
    { viewportX, viewportY, nextZoom: getNormalizedZoom(nextZoom) },
    state as AppState,
  );
}

function zoomAtCenter(state: NavigationState, nextZoom: number): ViewportState {
  return zoomAt(
    state,
    nextZoom,
    state.width / 2 + state.offsetLeft,
    state.height / 2 + state.offsetTop,
  );
}

/**
 * The viewport after a wheel event, or `null` when it moves nothing. Excalidraw's
 * mapping: ctrl or cmd (a trackpad pinch arrives that way) or a held wheel
 * button zooms around the pointer, a plain wheel pans on a trackpad and zooms
 * on a mouse, shift pans horizontally and ctrl or cmd with shift vertically.
 */
export function wheelNavigation(event: WheelEvent, state: NavigationState): ViewportState | null {
  const { deltaX, deltaY } = event;
  if (!deltaX && !deltaY) return null;
  const isWheelButtonHeld = (event.buttons & WHEEL_BUTTON_MASK) !== 0;
  const hasZoomModifier = event.metaKey || event.ctrlKey;
  const shouldZoom =
    deltaY !== 0 &&
    (isWheelButtonHeld ||
      (!event.shiftKey && (hasZoomModifier || resolveInputDevice(state.inputDevice) === "mouse")));
  if (shouldZoom) return zoomByWheel(state, deltaY, event.clientX, event.clientY);

  const { zoom, scrollX, scrollY } = state;
  if (event.shiftKey) {
    const delta = deltaY || deltaX;
    return constrain(state, {
      zoom,
      scrollX: hasZoomModifier ? scrollX : scrollX - delta / zoom.value,
      scrollY: hasZoomModifier ? scrollY - delta / zoom.value : scrollY,
    });
  }
  return constrain(state, {
    zoom,
    scrollX: scrollX - deltaX / zoom.value,
    scrollY: scrollY - deltaY / zoom.value,
  });
}

/** Excalidraw's wheel zoom: a capped step that grows the further in it already is. */
function zoomByWheel(
  state: NavigationState,
  deltaY: number,
  viewportX: number,
  viewportY: number,
): ViewportState | null {
  const sign = Math.sign(deltaY);
  const maxStep = ZOOM_STEP * 100;
  const absDelta = Math.abs(deltaY);
  const delta = absDelta > maxStep ? maxStep * sign : deltaY;
  let next = state.zoom.value - delta / 100;
  next += Math.log10(Math.max(1, state.zoom.value)) * -sign * Math.min(1, absDelta / 20);
  const minZoom = state.scrollConstraints?.lockZoom ? state.scrollConstraints.zoom : MIN_ZOOM;
  const nextZoom = getNormalizedZoom(Math.max(next, minZoom));
  if (nextZoom === state.zoom.value) return null;
  return zoomAt(state, nextZoom, viewportX, viewportY);
}

function constrain(state: NavigationState, viewport: ViewportState): ViewportState {
  return constrainScrollState({ ...(state as AppState), ...viewport });
}

/** The viewport that fits `elements`, centered. */
export function fitToContent(
  state: AppState,
  elements: readonly ExcalidrawElement[],
  fit: ViewportFit = "scale-down",
): ViewportState {
  const visible = getNonDeletedElements(elements);
  if (visible.length === 0) {
    return { scrollX: 0, scrollY: 0, zoom: state.zoom };
  }
  const { appState } = zoomToFitBounds({
    bounds: getCommonBounds(visible),
    appState: state,
    fit,
  });
  return { scrollX: appState.scrollX, scrollY: appState.scrollY, zoom: appState.zoom };
}

/**
 * The viewport after a key, or `null` for a key that is not navigation.
 * Excalidraw's shortcuts (ctrl, cmd or shift with `+`, `-` and `0`, shift+1
 * to fit, PageUp and PageDown with shift for horizontal) plus the arrow keys,
 * which pan by a tenth of the viewport and by a whole one with shift.
 */
export function keyboardNavigation(
  event: KeyboardEvent,
  state: AppState,
  elements: readonly ExcalidrawElement[],
): ViewportState | null {
  const modifier = event.ctrlKey || event.metaKey || event.shiftKey;
  const { code, key } = event;
  if ((code === "Equal" || code === "NumpadAdd" || key === "+") && (modifier || key === "+")) {
    return zoomAtCenter(state, state.zoom.value + ZOOM_STEP);
  }
  if ((code === "Minus" || code === "NumpadSubtract" || key === "-") && (modifier || key === "-")) {
    return zoomAtCenter(state, state.zoom.value - ZOOM_STEP);
  }
  if ((code === "Digit0" || code === "Numpad0") && modifier) {
    return zoomAtCenter(state, 1);
  }
  if (code === "Digit1" && event.shiftKey && !event.altKey && !(event.ctrlKey || event.metaKey)) {
    return fitToContent(state, elements);
  }
  const page = (size: number): number => (event.shiftKey ? size : size / 10) / state.zoom.value;
  const pan = (dx: number, dy: number): ViewportState =>
    constrain(state, {
      zoom: state.zoom,
      scrollX: state.scrollX + dx,
      scrollY: state.scrollY + dy,
    });
  switch (key) {
    case "ArrowLeft":
      return pan(page(state.width), 0);
    case "ArrowRight":
      return pan(-page(state.width), 0);
    case "ArrowUp":
      return pan(0, page(state.height));
    case "ArrowDown":
      return pan(0, -page(state.height));
    case "PageUp":
      return event.shiftKey
        ? pan(state.width / state.zoom.value, 0)
        : pan(0, state.height / state.zoom.value);
    case "PageDown":
      return event.shiftKey
        ? pan(-state.width / state.zoom.value, 0)
        : pan(0, -state.height / state.zoom.value);
    default:
      return null;
  }
}

interface Gesture {
  initialZoom: number;
  initialDistance: number;
  lastCenter: PointerCoords;
}

/**
 * Pointer panning and two-finger pinch, one pointer stream at a time. Feed it
 * the pointer events; each returns the viewport the gesture has moved to.
 */
export class PointerNavigation {
  private readonly pointers = new Map<number, PointerCoords>();
  private gesture: Gesture | null = null;
  private last: PointerCoords | null = null;

  public get active(): boolean {
    return this.pointers.size > 0;
  }

  public down(event: PointerEvent, state: NavigationState): void {
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.pointers.size === 2) {
      this.gesture = {
        initialZoom: state.zoom.value,
        initialDistance: distance(this.pointers),
        lastCenter: center(this.pointers),
      };
      this.last = null;
    } else if (this.pointers.size === 1) {
      this.last = { x: event.clientX, y: event.clientY };
    }
  }

  public move(event: PointerEvent, state: NavigationState): ViewportState | null {
    if (!this.pointers.has(event.pointerId)) return null;
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const gesture = this.gesture;
    if (gesture !== null && this.pointers.size >= 2) {
      const now = center(this.pointers);
      const scale =
        gesture.initialDistance === 0 ? 1 : distance(this.pointers) / gesture.initialDistance;
      const panned = {
        ...state,
        scrollX: state.scrollX + (now.x - gesture.lastCenter.x) / state.zoom.value,
        scrollY: state.scrollY + (now.y - gesture.lastCenter.y) / state.zoom.value,
      };
      gesture.lastCenter = now;
      return zoomAt(panned, gesture.initialZoom * scale, now.x, now.y);
    }
    const last = this.last;
    if (last === null) return null;
    this.last = { x: event.clientX, y: event.clientY };
    return constrain(state, {
      zoom: state.zoom,
      scrollX: state.scrollX + (event.clientX - last.x) / state.zoom.value,
      scrollY: state.scrollY + (event.clientY - last.y) / state.zoom.value,
    });
  }

  public up(event: PointerEvent): void {
    this.pointers.delete(event.pointerId);
    if (this.pointers.size < 2) this.gesture = null;
    const remaining = [...this.pointers.values()][0];
    this.last = remaining ?? null;
  }
}

function center(pointers: Map<number, PointerCoords>): PointerCoords {
  const all = [...pointers.values()];
  return {
    x: all.reduce((sum, each) => sum + each.x, 0) / all.length,
    y: all.reduce((sum, each) => sum + each.y, 0) / all.length,
  };
}

function distance(pointers: Map<number, PointerCoords>): number {
  const [a, b] = [...pointers.values()];
  return a === undefined || b === undefined ? 0 : Math.hypot(a.x - b.x, a.y - b.y);
}
