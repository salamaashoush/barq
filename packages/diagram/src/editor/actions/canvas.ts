import { CODES, KEYS, ZOOM_STEP } from "@excalidraw/common";
import {
  CaptureUpdateAction,
  getCommonBounds,
  getNonDeletedElements,
  newElementWith,
} from "@excalidraw/element";

import type { Bounds } from "@excalidraw/common";
import type { ExcalidrawElement } from "@excalidraw/element/types";

import { getDefaultAppState } from "../../app-state.ts";
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
  label: "labels.toggleGrid",
  keywords: ["snap"],
  announcement: "Grid toggled",
  checked: (appState) => appState.gridModeEnabled,
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

/** Snaps moved, resized and new elements to the others, instead of the grid. Alt+S. */
export const actionToggleObjectsSnapMode: Action = {
  name: "objectsSnapMode",
  label: "buttons.objectsSnapMode",
  announcement: "Snapping to objects toggled",
  checked: (appState) => appState.objectsSnapModeEnabled,
  perform(_elements, appState) {
    return {
      appState: {
        ...appState,
        objectsSnapModeEnabled: !appState.objectsSnapModeEnabled,
        gridModeEnabled: false,
      },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    };
  },
  keyTest: (event) => !event[KEYS.CTRL_OR_CMD] && event.altKey && event.code === CODES.S,
};

/** Where a zoom from the keyboard centres: the middle of the viewport. */
function viewportCentre(appState: AppState) {
  return {
    viewportX: appState.width / 2 + appState.offsetLeft,
    viewportY: appState.height / 2 + appState.offsetTop,
  };
}

/** A point in client coordinates a zoom keeps where it is, as the text editor's caret. */
export interface ZoomAnchor {
  viewportX: number;
  viewportY: number;
}

function zoomTo(appState: AppState, nextZoom: number, anchor: ZoomAnchor | null): ActionResult {
  return {
    appState: {
      ...appState,
      ...getViewportForZoomWithScrollConstraints(
        { ...(anchor ?? viewportCentre(appState)), nextZoom: getNormalizedZoom(nextZoom) },
        appState,
      ),
    },
    captureUpdate: CaptureUpdateAction.EVENTUALLY,
  };
}

/** Ctrl or Cmd (or Shift) with =. */
export const actionZoomIn: Action<ZoomAnchor> = {
  name: "zoomIn",
  label: "buttons.zoomIn",
  announcement: "Zoomed in",
  viewMode: true,
  navigation: true,
  predicate: (_elements, _appState, app) => app.isNavigationEnabled(),
  perform: (_elements, appState, anchor, app) => {
    app.requestUnfollow();
    return zoomTo(appState, appState.zoom.value + ZOOM_STEP, anchor);
  },
  keyTest: (event) =>
    (event.code === CODES.EQUAL || event.code === CODES.NUM_ADD) &&
    (event[KEYS.CTRL_OR_CMD] || event.shiftKey),
};

/** Ctrl or Cmd (or Shift) with -. */
export const actionZoomOut: Action<ZoomAnchor> = {
  name: "zoomOut",
  label: "buttons.zoomOut",
  announcement: "Zoomed out",
  viewMode: true,
  navigation: true,
  predicate: (_elements, _appState, app) => app.isNavigationEnabled(),
  perform: (_elements, appState, anchor, app) => {
    app.requestUnfollow();
    return zoomTo(appState, appState.zoom.value - ZOOM_STEP, anchor);
  },
  keyTest: (event) =>
    (event.code === CODES.MINUS || event.code === CODES.NUM_SUBTRACT) &&
    (event[KEYS.CTRL_OR_CMD] || event.shiftKey),
};

/** Back to 100%, or to a zoom lock's floor. Ctrl or Cmd (or Shift) with 0. */
export const actionResetZoom: Action<ZoomAnchor> = {
  name: "resetZoom",
  label: "buttons.resetZoom",
  announcement: "Zoom reset",
  viewMode: true,
  navigation: true,
  predicate: (_elements, _appState, app) => app.isNavigationEnabled(),
  perform: (_elements, appState, anchor, app) => {
    app.requestUnfollow();
    return zoomTo(
      appState,
      appState.scrollConstraints?.lockZoom ? appState.scrollConstraints.zoom : 1,
      anchor,
    );
  },
  keyTest: (event) =>
    (event.code === CODES.ZERO || event.code === CODES.NUM_ZERO) &&
    (event[KEYS.CTRL_OR_CMD] || event.shiftKey),
};

function getScrollConstraintsBounds(
  scrollConstraints: NonNullable<AppState["scrollConstraints"]>,
): Bounds {
  return [
    scrollConstraints.x,
    scrollConstraints.y,
    scrollConstraints.x + scrollConstraints.width,
    scrollConstraints.y + scrollConstraints.height,
  ];
}

function fitTo(bounds: Bounds, appState: AppState, fit: "scale-down" | "contain"): ActionResult {
  const result = zoomToFitBounds({ bounds, appState, fit });
  return {
    ...result,
    // the fit must not escape a scroll or zoom lock
    appState: { ...result.appState, ...constrainScrollState(result.appState) },
    captureUpdate: CaptureUpdateAction.EVENTUALLY,
  };
}

function selectionBounds(
  elements: Parameters<Action["perform"]>[0],
  appState: AppState,
  selected: readonly ExcalidrawElement[],
): Bounds {
  return selected.length
    ? getCommonBounds(selected)
    : appState.scrollConstraints
      ? getScrollConstraintsBounds(appState.scrollConstraints)
      : getCommonBounds(getNonDeletedElements(elements));
}

/** Fits every element, never past 100%. Shift+1. */
export const actionZoomToFit: Action = {
  name: "zoomToFit",
  label: "helpDialog.zoomToFit",
  announcement: "Zoomed to fit",
  viewMode: true,
  navigation: true,
  predicate: (_elements, _appState, app) => app.isNavigationEnabled(),
  perform: (elements, appState, _formData, app) => {
    app.requestUnfollow();
    return fitTo(
      appState.scrollConstraints
        ? getScrollConstraintsBounds(appState.scrollConstraints)
        : getCommonBounds(getNonDeletedElements(elements)),
      appState,
      "scale-down",
    );
  },
  keyTest: (event) =>
    event.code === CODES.ONE && event.shiftKey && !event.altKey && !event[KEYS.CTRL_OR_CMD],
};

/** Fits the selection (everything without one), never past 100%. Shift+2. */
export const actionZoomToFitSelectionInViewport: Action = {
  name: "zoomToFitSelectionInViewport",
  label: "labels.zoomToFitViewport",
  announcement: "Zoomed to selection",
  viewMode: true,
  navigation: true,
  predicate: (_elements, _appState, app) => app.isNavigationEnabled(),
  perform: (elements, appState, _formData, app) => {
    app.requestUnfollow();
    return fitTo(
      selectionBounds(elements, appState, app.scene.getSelectedElements(appState)),
      appState,
      "scale-down",
    );
  },
  keyTest: (event) =>
    event.code === CODES.TWO && event.shiftKey && !event.altKey && !event[KEYS.CTRL_OR_CMD],
};

/** Fits the selection (everything without one), filling the viewport. Shift+3. */
export const actionZoomToFitSelection: Action = {
  name: "zoomToFitSelection",
  label: "helpDialog.zoomToSelection",
  announcement: "Zoomed to selection",
  viewMode: true,
  navigation: true,
  predicate: (_elements, _appState, app) => app.isNavigationEnabled(),
  perform: (elements, appState, _formData, app) => {
    app.requestUnfollow();
    return fitTo(
      selectionBounds(elements, appState, app.scene.getSelectedElements(appState)),
      appState,
      "contain",
    );
  },
  keyTest: (event) =>
    event.code === CODES.THREE && event.shiftKey && !event.altKey && !event[KEYS.CTRL_OR_CMD],
};

/** The canvas's colour, from the main menu's picker. */
export const actionChangeViewBackgroundColor: Action<Partial<AppState>> = {
  name: "changeViewBackgroundColor",
  label: "labels.canvasBackground",
  announcement: "",
  predicate: (_elements, appState, editor) =>
    editor.host.UIOptions.canvasActions.changeViewBackgroundColor && !appState.viewModeEnabled,
  perform: (_elements, appState, value) => ({
    appState: { ...appState, ...value },
    captureUpdate: value?.viewBackgroundColor
      ? CaptureUpdateAction.IMMEDIATELY
      : CaptureUpdateAction.EVENTUALLY,
  }),
};

/** Deletes every element and starts the state over, keeping the preferences. */
export const actionClearCanvas: Action = {
  name: "clearCanvas",
  label: "labels.clearCanvas",
  announcement: "Canvas cleared",
  predicate: (_elements, appState, editor) =>
    editor.host.UIOptions.canvasActions.clearCanvas &&
    !appState.viewModeEnabled &&
    appState.openDialog?.name !== "elementLinkSelector",
  perform: (elements, appState, _formData, editor) => {
    editor.imageCache.clear();
    return {
      elements: elements.map((element) => newElementWith(element, { isDeleted: true })),
      appState: {
        ...getDefaultAppState(),
        theme: appState.theme,
        penMode: appState.penMode,
        penDetected: appState.penDetected,
        exportBackground: appState.exportBackground,
        exportEmbedScene: appState.exportEmbedScene,
        gridSize: appState.gridSize,
        gridStep: appState.gridStep,
        gridModeEnabled: appState.gridModeEnabled,
        stats: appState.stats,
        colorTopPicks: appState.colorTopPicks,
        fontTopPicks: appState.fontTopPicks,
        width: appState.width,
        height: appState.height,
        offsetLeft: appState.offsetLeft,
        offsetTop: appState.offsetTop,
        viewModeEnabled: appState.viewModeEnabled,
        activeTool:
          appState.activeTool.type === "image"
            ? { ...appState.activeTool, type: appState.preferredSelectionTool.type }
            : appState.activeTool,
      },
      files: {},
      replaceFiles: true,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
};

/** The scene's name, which exports are named after. */
export const actionChangeProjectName: Action<string | null> = {
  name: "changeProjectName",
  label: "labels.fileTitle",
  announcement: "",
  perform: (_elements, appState, value) => ({
    appState: { ...appState, name: value },
    captureUpdate: CaptureUpdateAction.EVENTUALLY,
  }),
};
