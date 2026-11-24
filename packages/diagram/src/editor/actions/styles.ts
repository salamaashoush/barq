import {
  CODES,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  DEFAULT_TEXT_ALIGN,
  KEYS,
  arrayToMap,
  getLineHeight,
} from "@excalidraw/common";
import {
  CaptureUpdateAction,
  canApplyRoundnessTypeToElement,
  getBaseFontSize,
  getBaseFontSizeUpdate,
  getBoundTextElement,
  getColorUpdate,
  getDefaultRoundnessTypeForElement,
  getSelectedElements,
  hasBoundTextElement,
  isArrowElement,
  isElbowArrow,
  isExcalidrawElement,
  isFrameLikeElement,
  isNonDeletedElement,
  isStickyNoteBoundText,
  isStickyNoteElement,
  isTextElement,
  newElementWith,
  normalizeStickyNote,
  redrawTextBoundingBox,
  relayoutStickyNotes,
  syncStickyNoteInk,
  updateBoundElements,
  updateElbowArrowRoute,
} from "@excalidraw/element";

import type { ExcalidrawElement, ExcalidrawTextElement } from "@excalidraw/element/types";

import type { LocalizedMessage } from "../../i18n.ts";
import type { Action } from "../types.ts";

// Shared by every editor on the page, as Excalidraw's is: styles copied in
// one paste into another.
let copiedStyles = "{}";

/** Copies the first selected element's styles, and its label's. Ctrl+Alt+C. */
export const actionCopyStyles: Action = {
  name: "copyStyles",
  label: "labels.copyStyles",
  announcement: "Styles copied",
  perform: (elements, appState, _formData, editor) => {
    const element = elements.find((each) => appState.selectedElementIds[each.id]);
    if (element) {
      const copied: (ExcalidrawElement | null)[] = [element];
      if (hasBoundTextElement(element)) {
        copied.push(getBoundTextElement(element, editor.scene.getNonDeletedElementsMap()));
      }
      copiedStyles = JSON.stringify(copied);
    }
    return {
      appState: {
        ...appState,
        toast: { message: { key: "toast.copyStyles" } satisfies LocalizedMessage },
      },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    };
  },
  keyTest: (event) => event[KEYS.CTRL_OR_CMD] && event.altKey && event.code === CODES.C,
};

/** Gives the selection the copied styles: a label takes the copied label's. Ctrl+Alt+V. */
export const actionPasteStyles: Action = {
  name: "pasteStyles",
  label: "labels.pasteStyles",
  announcement: "Styles pasted",
  perform: (elements, appState, _formData, editor) => {
    const copied = JSON.parse(copiedStyles) as unknown[];
    const [pastedElement, boundTextElement] = copied;
    if (!isExcalidrawElement(pastedElement)) {
      return { elements, captureUpdate: CaptureUpdateAction.EVENTUALLY };
    }

    const selectedElements = getSelectedElements(elements, appState, {
      includeBoundTextElement: true,
    });
    const selectedElementIds = new Set(selectedElements.map((element) => element.id));
    const elementsMap = arrayToMap(elements);
    // a sticky label is decided by the copy, whose note may be gone by now
    const copiedElementsMap = arrayToMap(copied.filter(isExcalidrawElement));

    const restyled = elements.map((element) => {
      if (!selectedElementIds.has(element.id)) {
        return element;
      }
      const source =
        isTextElement(element) && element.containerId
          ? (boundTextElement as ExcalidrawElement | null | undefined)
          : pastedElement;
      if (!source) {
        return element;
      }
      let next: ExcalidrawElement = newElementWith(element, {
        backgroundColor: source.backgroundColor,
        strokeWidth: source.strokeWidth,
        strokeColor: source.strokeColor,
        strokeStyle: source.strokeStyle,
        fillStyle: source.fillStyle,
        opacity: source.opacity,
        roughness: source.roughness,
        roundness: source.roundness
          ? canApplyRoundnessTypeToElement(source.roundness.type, element)
            ? source.roundness
            : getDefaultRoundnessTypeForElement(element)
          : null,
      });

      if (isTextElement(next)) {
        const sourceText = source as ExcalidrawTextElement;
        const fontSize =
          (isTextElement(source)
            ? getBaseFontSize(source, copiedElementsMap)
            : sourceText.fontSize) || DEFAULT_FONT_SIZE;
        const fontFamily = sourceText.fontFamily || DEFAULT_FONT_FAMILY;
        const containerId = next.containerId;
        const container = containerId
          ? (selectedElements.find((each) => each.id === containerId) ?? null)
          : null;
        const nextText = newElementWith(next, {
          ...getBaseFontSizeUpdate(next, fontSize, elementsMap),
          fontFamily,
          textAlign: sourceText.textAlign || DEFAULT_TEXT_ALIGN,
          lineHeight: sourceText.lineHeight || getLineHeight(fontFamily),
        });
        next = nextText;
        if (isStickyNoteBoundText(nextText, elementsMap)) {
          // the copied stroke may be transparent, a note's label never is
          next = newElementWith(
            nextText,
            getColorUpdate(nextText, "strokeColor", nextText.strokeColor, elementsMap),
          );
        } else {
          // a note's label is laid out with its note below
          redrawTextBoundingBox(nextText, container, editor.scene, editor.renderEnvironment);
        }
      }

      if (next.type === "arrow" && isArrowElement(source)) {
        next = newElementWith(next, {
          startArrowhead: source.startArrowhead,
          endArrowhead: source.endArrowhead,
        });
        if (isElbowArrow(next)) {
          next = newElementWith(
            next,
            updateElbowArrowRoute(next, editor.scene.getNonDeletedElementsMap()),
          );
        }
      }

      if (isFrameLikeElement(element)) {
        next = newElementWith(next, { roundness: null, backgroundColor: "transparent" });
      }
      if (isStickyNoteElement(next)) {
        next = normalizeStickyNote(next);
      }
      return next;
    });

    const nextElements = relayoutStickyNotes(
      syncStickyNoteInk(restyled, elementsMap),
      selectedElementIds,
      { prevElementsMap: elementsMap, renderEnvironment: editor.renderEnvironment },
    );

    // a restyled note may have grown or shrunk: its arrows follow
    for (const element of nextElements) {
      const prev = elementsMap.get(element.id);
      if (
        isStickyNoteElement(element) &&
        isNonDeletedElement(element) &&
        prev &&
        (prev.height !== element.height || prev.x !== element.x || prev.y !== element.y)
      ) {
        updateBoundElements(element, editor.scene, { renderEnvironment: editor.renderEnvironment });
      }
    }

    return { elements: nextElements, captureUpdate: CaptureUpdateAction.IMMEDIATELY };
  },
  keyTest: (event) => event[KEYS.CTRL_OR_CMD] && event.altKey && event.code === CODES.V,
};
