import { MAX_ZOOM, MIN_ZOOM } from "@excalidraw/common";

import { clamp, round } from "@excalidraw/math";

import type { NormalizedZoomValue } from "../types.ts";

export function getNormalizedZoom(zoom: number): NormalizedZoomValue {
  return clamp(round(zoom, 6), MIN_ZOOM, MAX_ZOOM) as NormalizedZoomValue;
}

export function getNormalizedGridSize(gridStep: number) {
  return clamp(Math.round(gridStep), 1, 100);
}

export function getNormalizedGridStep(gridStep: number) {
  return clamp(Math.round(gridStep), 1, 100);
}
