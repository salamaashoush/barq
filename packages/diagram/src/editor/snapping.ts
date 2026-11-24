import type { ExcalidrawElement } from "@excalidraw/element/types";

import type { SnapLine } from "../types.ts";

/** How far a drag, resize or new element moves to land on other elements, and the lines that show it. */
export interface Snap {
  snapOffset: { x: number; y: number };
  snapLines: SnapLine[];
}

const NO_SNAP: Snap = { snapOffset: { x: 0, y: 0 }, snapLines: [] };

/**
 * Snapping to other elements, Excalidraw's `snapping.ts`. The editor has no
 * object snapping, so every drag lands where the pointer (and the grid) put
 * it; the grid itself snaps through `getGridPoint`.
 */
export const snapDraggedElements = (
  _originalElements: readonly ExcalidrawElement[],
  _dragOffset: { x: number; y: number },
): Snap => NO_SNAP;

export const snapResizingElements = (
  _originalElements: readonly ExcalidrawElement[],
  _dragOffset: { x: number; y: number },
): Snap => NO_SNAP;

export const snapNewElement = (
  _newElement: ExcalidrawElement,
  _dragOffset: { x: number; y: number },
): Snap => NO_SNAP;
