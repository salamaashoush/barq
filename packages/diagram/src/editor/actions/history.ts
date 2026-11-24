import { KEYS, arrayToMap, matchKey } from "@excalidraw/common";
import { CaptureUpdateAction, orderByFractionalIndex } from "@excalidraw/element";

import type { SceneElementsMap } from "@excalidraw/element/types";

import type { AppState } from "../../types.ts";
import type { History } from "../history.ts";
import type { Action, ActionResult } from "../types.ts";

const executeHistoryAction = (
  appState: Readonly<AppState>,
  updater: () => [SceneElementsMap, AppState] | void,
): ActionResult => {
  if (
    !appState.multiElement &&
    !appState.resizingElement &&
    !appState.editingTextElement &&
    !appState.newElement &&
    !appState.selectedElementsAreBeingDragged &&
    !appState.selectionElement
  ) {
    const result = updater();
    if (!result) {
      return { captureUpdate: CaptureUpdateAction.EVENTUALLY };
    }
    const [nextElementsMap, nextAppState] = result;
    return {
      appState: nextAppState,
      // the map may have been reordered meanwhile
      elements: orderByFractionalIndex(Array.from(nextElementsMap.values())),
      captureUpdate: CaptureUpdateAction.NEVER,
    };
  }
  return { captureUpdate: CaptureUpdateAction.EVENTUALLY };
};

/** Undoes the last change. Ctrl or Cmd+Z. */
export const createUndoAction = (history: History): Action => ({
  name: "undo",
  label: "Undone",
  perform: (elements, appState, _formData, app) =>
    executeHistoryAction(appState, () =>
      history.undo(arrayToMap(elements) as SceneElementsMap, appState, app.renderEnvironment),
    ),
  keyTest: (event) => event[KEYS.CTRL_OR_CMD] && matchKey(event, KEYS.Z) && !event.shiftKey,
});

/** Redoes what was undone. Ctrl or Cmd+Shift+Z, or Ctrl or Cmd+Y. */
export const createRedoAction = (history: History): Action => ({
  name: "redo",
  label: "Redone",
  perform: (elements, appState, _formData, app) =>
    executeHistoryAction(appState, () =>
      history.redo(arrayToMap(elements) as SceneElementsMap, appState, app.renderEnvironment),
    ),
  keyTest: (event) =>
    (event[KEYS.CTRL_OR_CMD] && event.shiftKey && matchKey(event, KEYS.Z)) ||
    (event[KEYS.CTRL_OR_CMD] && !event.shiftKey && matchKey(event, KEYS.Y)),
});
