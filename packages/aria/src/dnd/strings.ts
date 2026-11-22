/** What drag and drop says, to a screen reader and in descriptions. */

import { StringDictionary, type StringFormatter } from "../i18n.ts";

export type DndMessage =
  | "dragItem"
  | "dragSelectedItems"
  | "dragDescriptionKeyboard"
  | "dragDescriptionKeyboardAlt"
  | "dragDescriptionTouch"
  | "dragDescriptionVirtual"
  | "dragDescriptionLongPress"
  | "dragSelectedKeyboard"
  | "dragSelectedKeyboardAlt"
  | "dragSelectedLongPress"
  | "dragStartedKeyboard"
  | "dragStartedTouch"
  | "dragStartedVirtual"
  | "endDragKeyboard"
  | "endDragTouch"
  | "endDragVirtual"
  | "dropDescriptionKeyboard"
  | "dropDescriptionTouch"
  | "dropDescriptionVirtual"
  | "dropCanceled"
  | "dropComplete"
  | "dropIndicator"
  | "dropOnRoot"
  | "dropOnItem"
  | "insertBefore"
  | "insertBetween"
  | "insertAfter";

function selectedItems(count: number, format: StringFormatter): string {
  return format.plural(count, {
    one: () => `${format.number(count)} selected item`,
    other: () => `${format.number(count)} selected items`,
  });
}

function text(value: string | number | boolean | undefined): string {
  return value === undefined ? "" : String(value);
}

export const dndStrings: StringDictionary<DndMessage> = new StringDictionary<DndMessage>({
  "en-US": {
    dragItem: (v) => `Drag ${text(v?.itemText)}`,
    dragSelectedItems: (v, f) => `Drag ${selectedItems(Number(v?.count), f)}`,
    dragDescriptionKeyboard: "Press Enter to start dragging.",
    dragDescriptionKeyboardAlt: "Press Alt + Enter to start dragging.",
    dragDescriptionTouch: "Double tap to start dragging.",
    dragDescriptionVirtual: "Click to start dragging.",
    dragDescriptionLongPress: "Long press to start dragging.",
    dragSelectedKeyboard: (v, f) => `Press Enter to drag ${selectedItems(Number(v?.count), f)}.`,
    dragSelectedKeyboardAlt: (v, f) =>
      `Press Alt + Enter to drag ${selectedItems(Number(v?.count), f)}.`,
    dragSelectedLongPress: (v, f) => `Long press to drag ${selectedItems(Number(v?.count), f)}.`,
    dragStartedKeyboard:
      "Started dragging. Press Tab to navigate to a drop target, then press Enter to drop, or press Escape to cancel.",
    dragStartedTouch: "Started dragging. Navigate to a drop target, then double tap to drop.",
    dragStartedVirtual:
      "Started dragging. Navigate to a drop target, then click or press Enter to drop.",
    endDragKeyboard: "Dragging. Press Enter to cancel drag.",
    endDragTouch: "Dragging. Double tap to cancel drag.",
    endDragVirtual: "Dragging. Click to cancel drag.",
    dropDescriptionKeyboard: "Press Enter to drop. Press Escape to cancel drag.",
    dropDescriptionTouch: "Double tap to drop.",
    dropDescriptionVirtual: "Click to drop.",
    dropCanceled: "Drop canceled.",
    dropComplete: "Drop complete.",
    dropIndicator: "drop indicator",
    dropOnRoot: "Drop on",
    dropOnItem: (v) => `Drop on ${text(v?.itemText)}`,
    insertBefore: (v) => `Insert before ${text(v?.itemText)}`,
    insertBetween: (v) => `Insert between ${text(v?.beforeItemText)} and ${text(v?.afterItemText)}`,
    insertAfter: (v) => `Insert after ${text(v?.itemText)}`,
  },
});
