import {
  COLOR_PALETTE,
  DEFAULT_ELEMENT_BACKGROUND_COLOR_PALETTE,
  DEFAULT_ELEMENT_BACKGROUND_PICKS,
  DEFAULT_ELEMENT_STROKE_COLOR_PALETTE,
  DEFAULT_ELEMENT_STROKE_PICKS,
  STICKY_NOTE_BACKGROUND_PICKS,
  STICKY_NOTE_STROKE_PICKS,
  arrayToMap,
} from "@excalidraw/common";
import {
  getColorTargetElement,
  getSelectedElements,
  hasBackground,
  hasStrokeColor,
  isStickyNoteBoundText,
  isStickyNoteElement,
  isTextElement,
  normalizeStickyNoteBackgroundColor,
  normalizeStickyNoteStrokeColor,
} from "@excalidraw/element";

import type { ColorPaletteCustom, ColorTuple } from "@excalidraw/common";
import type { ElementsMap, ExcalidrawElement } from "@excalidraw/element/types";

import type { AppState } from "../../types.ts";

export type ColorProperty = "strokeColor" | "backgroundColor";

/**
 * Sticky notes are a colour domain of their own, with their own defaults and
 * top picks and no transparent; a selection of both writes both defaults.
 */
export type ColorTargetKind = "regular" | "sticky" | "mixed";

export type ColorDefaultKey =
  | "currentItemStrokeColor"
  | "currentItemBackgroundColor"
  | "currentItemStickynoteStrokeColor"
  | "currentItemStickynoteBackgroundColor";

export type ColorTargetAppState = Pick<
  AppState,
  "selectedElementIds" | "editingTextElement" | "activeTool" | ColorDefaultKey
>;

export interface ColorTarget {
  kind: ColorTargetKind;
  property: ColorProperty;
  /** The current-item defaults a pick is written to. */
  appStateKeys: readonly ColorDefaultKey[];
  /** The default shown when no element is targeted. */
  currentValue: string;
  palette: ColorPaletteCustom;
  topPicks: ColorTuple;
  customizableTopPicks: keyof AppState["colorTopPicks"];
  excludedColors: readonly string[] | undefined;
}

const DEFAULT_KEYS: Record<ColorProperty, Record<"regular" | "sticky", ColorDefaultKey>> = {
  strokeColor: {
    regular: "currentItemStrokeColor",
    sticky: "currentItemStickynoteStrokeColor",
  },
  backgroundColor: {
    regular: "currentItemBackgroundColor",
    sticky: "currentItemStickynoteBackgroundColor",
  },
};

// hidden rather than taken out of the palette, so the other colours keep
// their keys
const STICKY_NOTE_EXCLUDED_COLORS: readonly string[] = [COLOR_PALETTE.transparent];

const isStickyNoteColorTarget = (element: ExcalidrawElement, elementsMap: ElementsMap) =>
  isStickyNoteElement(element) ||
  (isTextElement(element) && isStickyNoteBoundText(element, elementsMap));

/**
 * Who a stroke or background pick colours: the selected elements that take
 * the property (with their labels, for a stroke), and the text being edited
 * or, for a background, its note. With none, the active tool decides the
 * domain. Excalidraw's `resolveColorTarget`, resolved from the state the
 * action runs against.
 */
export const resolveColorTarget = (
  appState: ColorTargetAppState,
  elements: readonly ExcalidrawElement[],
  property: ColorProperty,
): ColorTarget => {
  const elementsMap = arrayToMap(elements);
  const supports = (element: ExcalidrawElement) =>
    property === "strokeColor" ? hasStrokeColor(element.type) : hasBackground(element.type);

  const targets: ExcalidrawElement[] = getSelectedElements(elements, appState, {
    includeBoundTextElement: property === "strokeColor",
  }).filter(supports);
  const editingText = appState.editingTextElement
    ? elementsMap.get(appState.editingTextElement.id)
    : undefined;
  const editing = editingText ? getColorTargetElement(editingText, property, elementsMap) : null;
  if (
    editing &&
    !editing.isDeleted &&
    supports(editing) &&
    !targets.some((element) => element.id === editing.id)
  ) {
    targets.push(editing);
  }

  let kind: ColorTargetKind;
  if (targets.length === 0) {
    kind = appState.activeTool.type === "stickynote" ? "sticky" : "regular";
  } else {
    const stickyCount = targets.filter((element) =>
      isStickyNoteColorTarget(element, elementsMap),
    ).length;
    kind = stickyCount === 0 ? "regular" : stickyCount === targets.length ? "sticky" : "mixed";
  }

  const keys = DEFAULT_KEYS[property];
  const isStroke = property === "strokeColor";

  return {
    kind,
    property,
    appStateKeys: kind === "mixed" ? [keys.regular, keys.sticky] : [keys[kind]],
    currentValue: appState[kind === "sticky" ? keys.sticky : keys.regular],
    palette: isStroke
      ? DEFAULT_ELEMENT_STROKE_COLOR_PALETTE
      : DEFAULT_ELEMENT_BACKGROUND_COLOR_PALETTE,
    topPicks:
      kind === "sticky"
        ? isStroke
          ? STICKY_NOTE_STROKE_PICKS
          : STICKY_NOTE_BACKGROUND_PICKS
        : isStroke
          ? DEFAULT_ELEMENT_STROKE_PICKS
          : DEFAULT_ELEMENT_BACKGROUND_PICKS,
    customizableTopPicks:
      kind === "sticky"
        ? isStroke
          ? "stickyNoteStroke"
          : "stickyNoteBackground"
        : isStroke
          ? "elementStroke"
          : "elementBackground",
    excludedColors: kind === "sticky" ? STICKY_NOTE_EXCLUDED_COLORS : undefined,
  };
};

/** The current-item defaults a picked colour sets. */
export const getColorTargetAppStateUpdates = (
  target: ColorTarget,
  color: string,
): Partial<AppState> => {
  const updates: Partial<AppState> = {};
  for (const key of target.appStateKeys) {
    updates[key] =
      key === "currentItemStickynoteStrokeColor"
        ? normalizeStickyNoteStrokeColor(color)
        : key === "currentItemStickynoteBackgroundColor"
          ? normalizeStickyNoteBackgroundColor(color)
          : color;
  }
  return updates;
};
