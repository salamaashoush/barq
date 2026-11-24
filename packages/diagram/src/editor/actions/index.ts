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
import { actionBindText, actionUnbindText, actionWrapTextInContainer } from "./bound-text.ts";
import {
  actionChangeProjectName,
  actionChangeViewBackgroundColor,
  actionClearCanvas,
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
import {
  actionChangeExportBackground,
  actionChangeExportEmbedScene,
  actionChangeExportScale,
  actionExportWithDarkMode,
  actionLoadScene,
  actionSaveFileToDisk,
  actionSaveToActiveFile,
  actionToggleImageExport,
  actionToggleJSONExport,
} from "./export.ts";
import { actionToggleWrap } from "./wrap.ts";
import { actionFinalize } from "./finalize.ts";
import { actionFlipHorizontal, actionFlipVertical } from "./flip.ts";
import {
  actionRemoveAllElementsFromFrame,
  actionSelectAllElementsInFrame,
  actionUpdateFrameRendering,
  actionWrapSelectionInFrame,
} from "./frame.ts";
import { actionGroup, actionUngroup } from "./group.ts";
import { actionAddToLibrary } from "./library.ts";
import { actionTogglePolygon, actionToggleLinearEditor } from "./linear-editor.ts";
import { actionCopyElementLink, actionLink, actionLinkToElement } from "./link.ts";
import { actionToggleElementLock, actionUnlockAllElements } from "./lock.ts";
import { propertyActions } from "./properties.ts";
import { actionGoToCollaborator } from "./navigate.ts";
import { actionToggleSearchMenu } from "./search.ts";
import { actionDeselect, actionSelectAll } from "./select.ts";
import { actionCopyStyles, actionPasteStyles } from "./styles.ts";
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
  actionShortcuts,
  actionToggleArrowBinding,
  actionToggleCommandPalette,
  actionToggleMidpointSnapping,
  actionToggleMinimap,
  actionToggleShapeSwitch,
  actionToggleShowHints,
  actionToggleStats,
  actionToggleTheme,
  actionToggleViewMode,
  actionToggleZenMode,
} from "./toggles.ts";
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
  ...propertyActions,
  actionFlipHorizontal,
  actionFlipVertical,
  actionCopyStyles,
  actionPasteStyles,
  actionBindText,
  actionUnbindText,
  actionWrapTextInContainer,
  actionTogglePolygon,
  actionToggleArrowBinding,
  actionToggleMidpointSnapping,
  actionToggleZenMode,
  actionToggleViewMode,
  actionToggleStats,
  actionToggleMinimap,
  actionToggleShowHints,
  actionToggleTheme as Action,
  actionToggleShapeSwitch,
  actionShortcuts,
  actionToggleCommandPalette,
  actionChangeViewBackgroundColor as Action,
  actionClearCanvas,
  actionChangeProjectName as Action,
  actionLink,
  actionCopyElementLink,
  actionLinkToElement,
  actionToggleImageExport,
  actionToggleJSONExport,
  actionChangeExportScale as Action,
  actionChangeExportBackground as Action,
  actionChangeExportEmbedScene as Action,
  actionExportWithDarkMode as Action,
  actionSaveToActiveFile,
  actionSaveFileToDisk,
  actionLoadScene,
  actionToggleWrap,
  actionAddToLibrary,
  actionToggleSearchMenu,
  actionGoToCollaborator as Action,
];
