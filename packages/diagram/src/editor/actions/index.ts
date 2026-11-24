import {
  actionAlignBottom,
  actionAlignHorizontallyCentered,
  actionAlignLeft,
  actionAlignRight,
  actionAlignTop,
  actionAlignVerticallyCentered,
  actionDistributeHorizontally,
  actionDistributeVertically,
} from "./align.ts";
import {
  actionResetZoom,
  actionToggleGridMode,
  actionZoomIn,
  actionZoomOut,
  actionZoomToFit,
  actionZoomToFitSelection,
  actionZoomToFitSelectionInViewport,
} from "./canvas.ts";
import { actionDeleteSelected } from "./delete.ts";
import { actionDuplicateSelection } from "./duplicate.ts";
import { actionFinalize } from "./finalize.ts";
import { actionGroup, actionUngroup } from "./group.ts";
import { actionToggleLinearEditor } from "./linear-editor.ts";
import { actionToggleElementLock, actionUnlockAllElements } from "./lock.ts";
import { actionDeselect, actionSelectAll } from "./select.ts";
import {
  actionBringForward,
  actionBringToFront,
  actionSendBackward,
  actionSendToBack,
} from "./zindex.ts";

import type { Action } from "../types.ts";

export { createRedoAction, createUndoAction } from "./history.ts";

/** Every action but undo and redo, which are made for a history. */
export const editorActions: readonly Action[] = [
  actionAlignTop,
  actionAlignBottom,
  actionAlignLeft,
  actionAlignRight,
  actionAlignVerticallyCentered,
  actionAlignHorizontallyCentered,
  actionDistributeHorizontally,
  actionDistributeVertically,
  actionToggleGridMode,
  actionZoomIn,
  actionZoomOut,
  actionResetZoom,
  actionZoomToFit,
  actionZoomToFitSelection,
  actionZoomToFitSelectionInViewport,
  actionDeleteSelected as Action,
  actionDuplicateSelection,
  actionFinalize as Action,
  actionGroup,
  actionUngroup,
  actionToggleLinearEditor,
  actionToggleElementLock,
  actionUnlockAllElements,
  actionSelectAll,
  actionDeselect,
  actionSendBackward,
  actionBringForward,
  actionSendToBack,
  actionBringToFront,
];
