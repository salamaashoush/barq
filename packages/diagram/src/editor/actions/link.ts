import { ELEMENT_LINK_KEY, KEYS } from "@excalidraw/common";
import {
  CaptureUpdateAction,
  canCreateLinkFromElements,
  getLinkIdAndTypeFromSelection,
  getNonDeletedElements,
  getSelectedElements,
  isEmbeddableElement,
} from "@excalidraw/element";

import { copyTextToSystemClipboard } from "../../clipboard.ts";

import type { LocalizedMessage } from "../../i18n.ts";
import type { Action } from "../types.ts";

/** The page's address with `?element=<id>`, which Excalidraw scrolls to when it opens. */
function getElementLinkFromSelection(id: string): string {
  const link = new URL(window.location.href);
  link.searchParams.set(ELEMENT_LINK_KEY, id);
  return link.toString();
}

/** Opens the link editor over the selected element. Ctrl+K. */
export const actionLink: Action = {
  name: "hyperlink",
  label: (elements, appState) => {
    const [first] = getSelectedElements(getNonDeletedElements(elements), appState);
    return isEmbeddableElement(first)
      ? "labels.link.editEmbed"
      : first?.link
        ? "labels.link.edit"
        : "labels.link.create";
  },
  announcement: "",
  perform: (elements, appState) => {
    if (appState.showHyperlinkPopup === "editor") {
      return false;
    }
    return {
      elements,
      appState: { ...appState, showHyperlinkPopup: "editor", openMenu: null },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
  predicate: (elements, appState) => getSelectedElements(elements, appState).length === 1,
  keyTest: (event) => event[KEYS.CTRL_OR_CMD] && !event.shiftKey && event.key === KEYS.K,
};

/** Copies a link to the selected element or group, which the editor scrolls to when opened. */
export const actionCopyElementLink: Action = {
  name: "copyElementLink",
  label: "labels.copyElementLink",
  announcement: "Link copied",
  perform: async (elements, appState, _formData, editor) => {
    const idAndType = getLinkIdAndTypeFromSelection(
      getSelectedElements(elements, appState),
      appState,
    );
    if (!idAndType) {
      return false;
    }
    try {
      const generateLink = editor.host.generateLinkForSelection ?? getElementLinkFromSelection;
      await copyTextToSystemClipboard(generateLink(idAndType.id, idAndType.type));
    } catch (error) {
      console.error("DiagramEditor: the link could not be copied", error);
      return false;
    }
    return {
      appState: {
        toast: {
          message: { key: "toast.elementLinkCopied" } satisfies LocalizedMessage,
          closable: true,
        },
      },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    };
  },
  predicate: (elements, appState) =>
    canCreateLinkFromElements(getSelectedElements(elements, appState)),
};

/** Opens the element link editor: the next element clicked is the link's target. */
export const actionLinkToElement: Action = {
  name: "linkToElement",
  label: "labels.linkToElement",
  announcement: "",
  perform: (elements, appState) => {
    const selectedElements = getSelectedElements(elements, appState);
    const [source] = selectedElements;
    if (!source || selectedElements.length !== 1 || !canCreateLinkFromElements(selectedElements)) {
      return false;
    }
    return {
      appState: {
        ...appState,
        openDialog: { name: "elementLinkSelector", sourceElementId: source.id },
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
  predicate: (elements, appState) => {
    const selectedElements = getSelectedElements(elements, appState);
    return (
      appState.openDialog?.name !== "elementLinkSelector" &&
      selectedElements.length === 1 &&
      canCreateLinkFromElements(selectedElements)
    );
  },
};
