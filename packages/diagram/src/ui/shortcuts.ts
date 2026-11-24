import { isDarwin } from "@excalidraw/common";

import type { Translate } from "../i18n.ts";

/** A shortcut written for the platform, in the language's names for the keys. Excalidraw's `getShortcutKey`. */
export const getShortcutKey = (shortcut: string, t: Translate, darwin = isDarwin): string =>
  shortcut
    .replace(/\b(Opt(?:ion)?|Alt)\b/i, darwin ? t("keys.option") : t("keys.alt"))
    .replace(/\bShift\b/i, t("keys.shift"))
    .replace(/\b(Enter|Return)\b/i, t("keys.enter"))
    .replace(/\b(Ctrl|Cmd|Command|CtrlOrCmd)\b/gi, darwin ? t("keys.cmd") : t("keys.ctrl"))
    .replace(/\b(Esc(?:ape)?)\b/i, t("keys.escape"))
    .replace(/\b(Space(?:bar)?)\b/i, t("keys.spacebar"))
    .replace(/\b(Del(?:ete)?)\b/i, t("keys.delete"));

const SHORTCUTS = {
  toggleTheme: ["Shift+Alt+D"],
  saveScene: ["CtrlOrCmd+S"],
  loadScene: ["CtrlOrCmd+O"],
  clearCanvas: ["CtrlOrCmd+Delete"],
  imageExport: ["CtrlOrCmd+Shift+E"],
  commandPalette: ["CtrlOrCmd+/", "CtrlOrCmd+Shift+P"],
  cut: ["CtrlOrCmd+X"],
  copy: ["CtrlOrCmd+C"],
  paste: ["CtrlOrCmd+V"],
  copyStyles: ["CtrlOrCmd+Alt+C"],
  pasteStyles: ["CtrlOrCmd+Alt+V"],
  selectAll: ["CtrlOrCmd+A"],
  deleteSelectedElements: ["Delete"],
  duplicateSelection: ["CtrlOrCmd+D"],
  sendBackward: ["CtrlOrCmd+["],
  bringForward: ["CtrlOrCmd+]"],
  sendToBack: [isDarwin ? "CtrlOrCmd+Alt+[" : "CtrlOrCmd+Shift+["],
  bringToFront: [isDarwin ? "CtrlOrCmd+Alt+]" : "CtrlOrCmd+Shift+]"],
  copyAsPng: ["Shift+Alt+C"],
  group: ["CtrlOrCmd+G"],
  ungroup: ["CtrlOrCmd+Shift+G"],
  gridMode: ["CtrlOrCmd+'"],
  zenMode: ["Alt+Z"],
  objectsSnapMode: ["Alt+S"],
  stats: ["Alt+/"],
  addToLibrary: [],
  flipHorizontal: ["Shift+H"],
  flipVertical: ["Shift+V"],
  viewMode: ["Alt+R"],
  hyperlink: ["CtrlOrCmd+K"],
  toggleElementLock: ["CtrlOrCmd+Shift+L"],
  resetZoom: ["CtrlOrCmd+0"],
  zoomOut: ["CtrlOrCmd+-"],
  zoomIn: ["CtrlOrCmd++"],
  zoomToFitSelection: ["Shift+3"],
  zoomToFit: ["Shift+1"],
  zoomToFitSelectionInViewport: ["Shift+2"],
  saveFileToDisk: ["CtrlOrCmd+S"],
  saveToActiveFile: ["CtrlOrCmd+S"],
  toggleShortcuts: ["?"],
  searchMenu: ["CtrlOrCmd+F"],
  wrapSelectionInFrame: [],
  toggleWrap: ["W"],
  autoResize: ["Alt+W"],
  toolLock: ["Q"],
  undo: ["CtrlOrCmd+Z"],
  redo: ["CtrlOrCmd+Shift+Z"],
} satisfies Record<string, readonly string[]>;

export type ShortcutName = keyof typeof SHORTCUTS;

export const isShortcutName = (name: string): name is ShortcutName =>
  Object.hasOwn(SHORTCUTS, name);

/** The shortcut of an action by its name, the first of several. Excalidraw's `getShortcutFromShortcutName`. */
export const getShortcutFromShortcutName = (
  name: ShortcutName,
  t: Translate,
  index = 0,
  darwin = isDarwin,
): string => {
  const shortcuts: readonly string[] = SHORTCUTS[name];
  const shortcut = shortcuts[index] ?? shortcuts[0];
  return shortcut === undefined ? "" : getShortcutKey(shortcut, t, darwin);
};
