import {
  actionBindText,
  actionUnbindText,
  actionWrapTextInContainer,
} from "./actions/bound-text.ts";
import { actionToggleGridMode, actionToggleObjectsSnapMode } from "./actions/canvas.ts";
import {
  actionCopy,
  actionCopyAsPng,
  actionCopyAsSvg,
  actionCopyText,
  actionCut,
  actionPaste,
  actionToggleCropEditor,
} from "./actions/clipboard.ts";
import { actionDeleteSelected } from "./actions/delete.ts";
import { actionDuplicateSelection } from "./actions/duplicate.ts";
import { actionFlipHorizontal, actionFlipVertical } from "./actions/flip.ts";
import {
  actionRemoveAllElementsFromFrame,
  actionSelectAllElementsInFrame,
  actionWrapSelectionInFrame,
} from "./actions/frame.ts";
import { actionGroup, actionUngroup } from "./actions/group.ts";
import { actionAddToLibrary } from "./actions/library.ts";
import { actionToggleLinearEditor } from "./actions/linear-editor.ts";
import { actionCopyElementLink, actionLink } from "./actions/link.ts";
import { actionToggleElementLock, actionUnlockAllElements } from "./actions/lock.ts";
import { actionSelectAll } from "./actions/select.ts";
import { actionCopyStyles, actionPasteStyles } from "./actions/styles.ts";
import { actionTextAutoResize } from "./actions/text.ts";
import {
  actionToggleArrowBinding,
  actionToggleMidpointSnapping,
  actionToggleMinimap,
  actionToggleStats,
  actionToggleViewMode,
  actionToggleZenMode,
} from "./actions/toggles.ts";
import {
  actionBringForward,
  actionBringToFront,
  actionSendBackward,
  actionSendToBack,
} from "./actions/zindex.ts";

import type { Action } from "./types.ts";

export const CONTEXT_MENU_SEPARATOR = "separator";

export type ContextMenuItem = typeof CONTEXT_MENU_SEPARATOR | Action;

/**
 * The context menu's entries, Excalidraw's for the canvas and for elements,
 * in its order. Entries whose predicate fails are left out where the menu
 * is drawn, and with them separators that would stand next to each other.
 */
export const getContextMenuItems = (
  type: "canvas" | "element",
  viewModeEnabled: boolean,
): readonly ContextMenuItem[] => {
  if (type === "canvas") {
    if (viewModeEnabled) {
      return [
        actionCopyAsPng,
        actionCopyAsSvg,
        actionToggleGridMode,
        actionToggleZenMode,
        actionToggleViewMode,
        actionToggleMinimap,
        actionToggleStats,
      ];
    }
    return [
      actionPaste,
      CONTEXT_MENU_SEPARATOR,
      actionCopyAsPng,
      actionCopyAsSvg,
      actionCopyText,
      CONTEXT_MENU_SEPARATOR,
      actionSelectAll,
      actionUnlockAllElements,
      CONTEXT_MENU_SEPARATOR,
      actionToggleGridMode,
      actionToggleObjectsSnapMode,
      actionToggleArrowBinding,
      actionToggleMidpointSnapping,
      actionToggleZenMode,
      actionToggleViewMode,
      actionToggleMinimap,
      actionToggleStats,
    ];
  }

  const copyEntries: readonly ContextMenuItem[] = [
    actionCopyAsPng,
    actionCopyAsSvg,
    actionCopyText,
  ];
  if (viewModeEnabled) {
    return [actionCopy as Action, ...copyEntries];
  }
  return [
    CONTEXT_MENU_SEPARATOR,
    actionCut as Action,
    actionCopy as Action,
    actionPaste,
    CONTEXT_MENU_SEPARATOR,
    actionSelectAllElementsInFrame,
    actionRemoveAllElementsFromFrame,
    actionWrapSelectionInFrame,
    CONTEXT_MENU_SEPARATOR,
    actionToggleCropEditor,
    CONTEXT_MENU_SEPARATOR,
    ...copyEntries,
    CONTEXT_MENU_SEPARATOR,
    actionCopyStyles,
    actionPasteStyles,
    CONTEXT_MENU_SEPARATOR,
    actionGroup,
    actionTextAutoResize as Action,
    actionUnbindText,
    actionBindText,
    actionWrapTextInContainer,
    actionUngroup,
    CONTEXT_MENU_SEPARATOR,
    actionAddToLibrary,
    actionSendBackward,
    actionBringForward,
    actionSendToBack,
    actionBringToFront,
    CONTEXT_MENU_SEPARATOR,
    actionFlipHorizontal,
    actionFlipVertical,
    CONTEXT_MENU_SEPARATOR,
    actionToggleLinearEditor,
    CONTEXT_MENU_SEPARATOR,
    actionLink,
    actionCopyElementLink,
    CONTEXT_MENU_SEPARATOR,
    actionDuplicateSelection,
    actionToggleElementLock,
    CONTEXT_MENU_SEPARATOR,
    actionDeleteSelected as Action,
  ];
};

/** Whether a value in `appState.contextMenu.items` is a menu entry. */
export const isContextMenuItem = (value: unknown): value is ContextMenuItem =>
  value === CONTEXT_MENU_SEPARATOR ||
  (typeof value === "object" && value !== null && "perform" in value && "name" in value);
