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
  actionToggleObjectsSnapMode,
  actionZoomIn,
  actionZoomOut,
  actionZoomToFit,
  actionZoomToFitSelection,
  actionZoomToFitSelectionInViewport,
} from "./canvas.ts";
import {
  actionCopy,
  actionCopyAsPng,
  actionCopyAsSvg,
  actionCopyText,
  actionCut,
  actionPaste,
  actionToggleCropEditor,
} from "./clipboard.ts";
import { actionDeleteSelected } from "./delete.ts";
import { actionDuplicateSelection } from "./duplicate.ts";
import { actionFinalize } from "./finalize.ts";
import {
  actionRemoveAllElementsFromFrame,
  actionSelectAllElementsInFrame,
  actionUpdateFrameRendering,
  actionWrapSelectionInFrame,
} from "./frame.ts";
import { actionGroup, actionUngroup } from "./group.ts";
import { actionToggleLinearEditor } from "./linear-editor.ts";
import { actionToggleElementLock, actionUnlockAllElements } from "./lock.ts";
import { actionDeselect, actionSelectAll } from "./select.ts";
import {
  actionChangeFontFamily,
  actionChangeFontSize,
  actionChangeTextAlign,
  actionChangeVerticalAlign,
  actionDecreaseFontSize,
  actionIncreaseFontSize,
  actionTextAutoResize,
} from "./text.ts";
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
  actionToggleObjectsSnapMode,
  actionZoomIn as Action,
  actionZoomOut as Action,
  actionResetZoom as Action,
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
  actionChangeFontSize as Action,
  actionDecreaseFontSize,
  actionIncreaseFontSize,
  actionChangeFontFamily as Action,
  actionChangeTextAlign as Action,
  actionChangeVerticalAlign as Action,
  actionTextAutoResize as Action,
  actionSelectAllElementsInFrame,
  actionRemoveAllElementsFromFrame,
  actionUpdateFrameRendering,
  actionWrapSelectionInFrame,
  actionCopy as Action,
  actionCut as Action,
  actionPaste,
  actionCopyAsPng,
  actionCopyAsSvg,
  actionCopyText,
  actionToggleCropEditor,
];
