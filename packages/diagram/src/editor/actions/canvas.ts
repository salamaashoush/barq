import { CODES, KEYS, ZOOM_STEP } from "@excalidraw/common";
import { CaptureUpdateAction, getCommonBounds, getNonDeletedElements } from "@excalidraw/element";

import type { Bounds } from "@excalidraw/common";
import type { ExcalidrawElement } from "@excalidraw/element/types";

import { getNormalizedZoom } from "../../scene/normalize.ts";
import {
  constrainScrollState,
  getViewportForZoomWithScrollConstraints,
  zoomToFitBounds,
} from "../../viewport.ts";

import type { AppState } from "../../types.ts";
import type { Action, ActionResult } from "../types.ts";

/** Shows or hides the grid, which new and moved elements snap to. Ctrl or Cmd+'. */
export const actionToggleGridMode: Action = {
  name: "gridMode",
  label: "Grid toggled",
  viewMode: true,
  perform(_elements, appState) {
    return {
      appState: {
        ...appState,
        gridModeEnabled: !appState.gridModeEnabled,
        objectsSnapModeEnabled: false,
      },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    };
  },
  keyTest: (event) => event[KEYS.CTRL_OR_CMD] && event.code === CODES.QUOTE,
};

/** Where a zoom from the keyboard centres: the middle of the viewport. */
const viewportCentre = (appState: AppState) => ({
  viewportX: appState.width / 2 + appState.offsetLeft,
  viewportY: appState.height / 2 + appState.offsetTop,
});

const zoomTo = (appState: AppState, nextZoom: number): ActionResult => ({
  appState: {
    ...appState,
    ...getViewportForZoomWithScrollConstraints(
      { ...viewportCentre(appState), nextZoom: getNormalizedZoom(nextZoom) },
      appState,
    ),
  },
  captureUpdate: CaptureUpdateAction.EVENTUALLY,
});

/** Ctrl or Cmd (or Shift) with =. */
export const actionZoomIn: Action = {
  name: "zoomIn",
  label: "Zoomed in",
  viewMode: true,
  perform: (_elements, appState) => zoomTo(appState, appState.zoom.value + ZOOM_STEP),
  keyTest: (event) =>
    (event.code === CODES.EQUAL || event.code === CODES.NUM_ADD) &&
    (event[KEYS.CTRL_OR_CMD] || event.shiftKey),
};

/** Ctrl or Cmd (or Shift) with -. */
export const actionZoomOut: Action = {
  name: "zoomOut",
  label: "Zoomed out",
  viewMode: true,
  perform: (_elements, appState) => zoomTo(appState, appState.zoom.value - ZOOM_STEP),
  keyTest: (event) =>
    (event.code === CODES.MINUS || event.code === CODES.NUM_SUBTRACT) &&
    (event[KEYS.CTRL_OR_CMD] || event.shiftKey),
};

/** Back to 100%, or to a zoom lock's floor. Ctrl or Cmd (or Shift) with 0. */
export const actionResetZoom: Action = {
  name: "resetZoom",
  label: "Zoom reset",
  viewMode: true,
  perform: (_elements, appState) =>
    zoomTo(appState, appState.scrollConstraints?.lockZoom ? appState.scrollConstraints.zoom : 1),
  keyTest: (event) =>
    (event.code === CODES.ZERO || event.code === CODES.NUM_ZERO) &&
    (event[KEYS.CTRL_OR_CMD] || event.shiftKey),
};

const getScrollConstraintsBounds = (
  scrollConstraints: NonNullable<AppState["scrollConstraints"]>,
): Bounds => [
  scrollConstraints.x,
  scrollConstraints.y,
  scrollConstraints.x + scrollConstraints.width,
  scrollConstraints.y + scrollConstraints.height,
];

const fitTo = (bounds: Bounds, appState: AppState, fit: "scale-down" | "contain"): ActionResult => {
  const result = zoomToFitBounds({ bounds, appState, fit });
  return {
    ...result,
    // the fit must not escape a scroll or zoom lock
    appState: { ...result.appState, ...constrainScrollState(result.appState) },
    captureUpdate: CaptureUpdateAction.EVENTUALLY,
  };
};

const selectionBounds = (
  elements: Parameters<Action["perform"]>[0],
  appState: AppState,
  selected: readonly ExcalidrawElement[],
): Bounds =>
  selected.length
    ? getCommonBounds(selected)
    : appState.scrollConstraints
      ? getScrollConstraintsBounds(appState.scrollConstraints)
      : getCommonBounds(getNonDeletedElements(elements));

/** Fits every element, never past 100%. Shift+1. */
export const actionZoomToFit: Action = {
  name: "zoomToFit",
  label: "Zoomed to fit",
  viewMode: true,
  perform: (elements, appState) =>
    fitTo(
      appState.scrollConstraints
        ? getScrollConstraintsBounds(appState.scrollConstraints)
        : getCommonBounds(getNonDeletedElements(elements)),
      appState,
      "scale-down",
    ),
  keyTest: (event) =>
    event.code === CODES.ONE && event.shiftKey && !event.altKey && !event[KEYS.CTRL_OR_CMD],
};

/** Fits the selection (everything without one), never past 100%. Shift+2. */
export const actionZoomToFitSelectionInViewport: Action = {
  name: "zoomToFitSelectionInViewport",
  label: "Zoomed to selection",
  viewMode: true,
  perform: (elements, appState, _formData, app) =>
    fitTo(
      selectionBounds(elements, appState, app.scene.getSelectedElements(appState)),
      appState,
      "scale-down",
    ),
  keyTest: (event) =>
    event.code === CODES.TWO && event.shiftKey && !event.altKey && !event[KEYS.CTRL_OR_CMD],
};

/** Fits the selection (everything without one), filling the viewport. Shift+3. */
export const actionZoomToFitSelection: Action = {
  name: "zoomToFitSelection",
  label: "Zoomed to selection",
  viewMode: true,
  perform: (elements, appState, _formData, app) =>
    fitTo(
      selectionBounds(elements, appState, app.scene.getSelectedElements(appState)),
      appState,
      "contain",
    ),
  keyTest: (event) =>
    event.code === CODES.THREE && event.shiftKey && !event.altKey && !event[KEYS.CTRL_OR_CMD],
};
