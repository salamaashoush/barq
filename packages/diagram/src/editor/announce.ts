import { getSelectedGroupIds } from "@excalidraw/element";

import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";

import type { LocalizedMessage, TranslationKey } from "../i18n.ts";
import type { AppState } from "../types.ts";

/**
 * What the live region says: the English, for a host that shows it as it is,
 * and the message to translate, for one that speaks the reader's language.
 */
export interface Announcement {
  text: string;
  message: LocalizedMessage;
}

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

function elementName(type: string): LocalizedMessage {
  return {
    key: `element.${type === "magicframe" ? "frame" : type}` as TranslationKey,
    fallback: ELEMENT_NAMES[type] ?? type,
  };
}

/** What the live region says when the tool changes. */
export function describeTool(type: AppState["activeTool"]["type"]): Announcement {
  const name = TOOL_NAMES[type] ?? type;
  return {
    text: `${name} tool`,
    message: {
      key: "editorA11y.toolActive",
      replacement: { tool: { key: `toolBar.${type}` as TranslationKey, fallback: name } },
    },
  };
}

/** What the live region says when the selection changes. */
export function describeSelection(
  selected: readonly NonDeletedExcalidrawElement[],
  state: Pick<AppState, "selectedGroupIds" | "editingGroupId">,
): Announcement {
  const [first] = selected;
  if (!first) {
    return { text: "Nothing selected", message: { key: "editorA11y.nothingSelected" } };
  }
  const groups = getSelectedGroupIds(state);
  if (groups.length === 1 && selected.every((element) => element.groupIds.includes(groups[0]!))) {
    return {
      text: `Group of ${selected.length} selected`,
      message: { key: "editorA11y.groupSelected", replacement: { count: selected.length } },
    };
  }
  if (selected.length === 1) {
    const name = ELEMENT_NAMES[first.type] ?? first.type;
    return first.locked
      ? {
          text: `${name}, locked selected`,
          message: {
            key: "editorA11y.lockedElementSelected",
            replacement: { element: elementName(first.type) },
          },
        }
      : {
          text: `${name} selected`,
          message: {
            key: "editorA11y.elementSelected",
            replacement: { element: elementName(first.type) },
          },
        };
  }
  return {
    text: `${selected.length} elements selected`,
    message: { key: "editorA11y.elementsSelected", replacement: { count: selected.length } },
  };
}

export const EDITING_GROUP: Announcement = {
  text: "Editing group",
  message: { key: "editorA11y.editingGroup" },
};

/** What an action's announcement says, translated by its name. */
export function actionAnnouncement(name: string, text: string): Announcement {
  return {
    text,
    message: { key: `editorA11y.announcements.${name}` as TranslationKey, fallback: text },
  };
}
