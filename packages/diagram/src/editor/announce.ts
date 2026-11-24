import { getSelectedGroupIds } from "@excalidraw/element";

import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";

import type { AppState } from "../types.ts";

const ELEMENT_NAMES: Record<string, string> = {
  rectangle: "Rectangle",
  diamond: "Diamond",
  ellipse: "Ellipse",
  arrow: "Arrow",
  line: "Line",
  freedraw: "Drawing",
  text: "Text",
  image: "Image",
  frame: "Frame",
  magicframe: "Frame",
  embeddable: "Embed",
  iframe: "Embed",
  stickynote: "Sticky note",
};

const TOOL_NAMES: Record<string, string> = {
  ...ELEMENT_NAMES,
  selection: "Selection",
  hand: "Hand",
  freedraw: "Draw",
};

/** What the live region says when the tool changes. */
export const describeTool = (type: AppState["activeTool"]["type"]): string =>
  `${TOOL_NAMES[type] ?? type} tool`;

const describeElement = (element: NonDeletedExcalidrawElement): string => {
  const name = ELEMENT_NAMES[element.type] ?? element.type;
  return element.locked ? `${name}, locked` : name;
};

/** What the live region says when the selection changes. */
export const describeSelection = (
  selected: readonly NonDeletedExcalidrawElement[],
  state: Pick<AppState, "selectedGroupIds" | "editingGroupId">,
): string => {
  const [first] = selected;
  if (!first) {
    return "Nothing selected";
  }
  const groups = getSelectedGroupIds(state);
  if (groups.length === 1 && selected.every((element) => element.groupIds.includes(groups[0]!))) {
    return `Group of ${selected.length} selected`;
  }
  if (selected.length === 1) {
    return `${describeElement(first)} selected`;
  }
  return `${selected.length} elements selected`;
};
