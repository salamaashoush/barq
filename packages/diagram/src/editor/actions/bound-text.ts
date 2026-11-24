import {
  BOUND_TEXT_PADDING,
  ROUNDNESS,
  TEXT_ALIGN,
  VERTICAL_ALIGN,
  arrayToMap,
  isTransparent,
} from "@excalidraw/common";
import {
  CaptureUpdateAction,
  DEFAULT_BOUND_TEXT_LABEL_POSITION,
  computeBoundTextPosition,
  computeContainerDimensionForBoundText,
  getBoundTextElement,
  getNonDeletedElements,
  getOriginalContainerHeightFromCache,
  hasBoundTextElement,
  isArrowElement,
  isBoundToContainer,
  isStickyNoteElement,
  isTextBindableContainer,
  isTextElement,
  isUsingAdaptiveRadius,
  newElement,
  normalizeStickyNoteFontSize,
  redrawTextBoundingBox,
  resetOriginalContainerCache,
  syncMovedIndices,
  updateOriginalContainerCache,
  updateStickyNoteLayout,
} from "@excalidraw/element";

import type {
  ExcalidrawElement,
  ExcalidrawLinearElement,
  ExcalidrawTextContainer,
  ExcalidrawTextElement,
  ExcalidrawTextElementWithContainer,
  NonDeleted,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";
import type { Radians } from "@excalidraw/math";

import { getDefaultAppState } from "../../app-state.ts";
import { getSelectionStateForElements } from "../selection.ts";

import type { AppState } from "../../types.ts";
import type { DiagramEditor } from "../editor.ts";
import type { Action, ActionResult } from "../types.ts";

/**
 * Frees a container's text where it was drawn, at its width, the container
 * going back to the height it had before the text grew it.
 */
const unbindTextFromContainer = (
  container: ExcalidrawElement,
  boundTextElement: ExcalidrawTextElementWithContainer,
  editor: DiagramEditor,
): void => {
  const { scene } = editor;
  const originalContainerHeight = getOriginalContainerHeightFromCache(container.id);
  resetOriginalContainerCache(container.id);
  const { x, y } = computeBoundTextPosition(
    container,
    boundTextElement,
    scene.getNonDeletedElementsMap(),
  );
  scene.mutateElement<ExcalidrawTextElement>(boundTextElement, {
    containerId: null,
    autoResize: false,
    baseFontSize: null,
    x,
    y,
    labelPosition: null,
  });
  scene.mutateElement(container, {
    boundElements: container.boundElements?.filter((each) => each.id !== boundTextElement.id),
  });
  if (isStickyNoteElement(container)) {
    updateStickyNoteLayout(container, scene, { renderEnvironment: editor.renderEnvironment });
  } else if (originalContainerHeight) {
    scene.mutateElement(container, { height: originalContainerHeight });
  }
};

export const actionUnbindText: Action = {
  name: "unbindText",
  label: "labels.unbindText",
  announcement: "Text unbound",
  predicate: (_elements, appState, editor) =>
    editor.scene.getSelectedElements(appState).some((element) => hasBoundTextElement(element)),
  perform: (elements, appState, _formData, editor) => {
    const selectedElements = editor.scene.getSelectedElements(appState);
    const elementsMap = editor.scene.getNonDeletedElementsMap();
    const freed: NonDeletedExcalidrawElement[] = [];
    for (const element of selectedElements) {
      const boundText = getBoundTextElement(element, elementsMap);
      if (boundText) {
        freed.push(boundText);
        unbindTextFromContainer(element, boundText, editor);
      }
    }
    return {
      elements,
      appState: {
        ...appState,
        // the freed texts are selected with their former containers
        ...getSelectionStateForElements(
          [...selectedElements, ...freed],
          getNonDeletedElements(elements),
          appState,
        ),
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
};

/** A note and its label share one ink: the text's, unless it is transparent. */
const getStickyNoteInk = (textElement: ExcalidrawTextElement, container: ExcalidrawElement) =>
  isStickyNoteElement(container)
    ? isTransparent(textElement.strokeColor)
      ? container.strokeColor
      : textElement.strokeColor
    : null;

const pushTextAboveContainer = (
  elements: readonly ExcalidrawElement[],
  container: ExcalidrawElement,
  textElement: ExcalidrawTextElement,
): ExcalidrawElement[] => {
  const updated = elements.slice();
  updated.splice(
    updated.findIndex((each) => each.id === textElement.id),
    1,
  );
  updated.splice(updated.findIndex((each) => each.id === container.id) + 1, 0, textElement);
  syncMovedIndices(updated, arrayToMap([container, textElement]));
  return updated;
};

const pushContainerBelowText = (
  elements: readonly ExcalidrawElement[],
  container: ExcalidrawElement,
  textElement: ExcalidrawTextElement,
): ExcalidrawElement[] => {
  const updated = elements.slice();
  updated.splice(
    updated.findIndex((each) => each.id === container.id),
    1,
  );
  updated.splice(
    updated.findIndex((each) => each.id === textElement.id),
    0,
    container,
  );
  syncMovedIndices(updated, arrayToMap([container, textElement]));
  return updated;
};

const bindTextToContainer = (
  elements: readonly ExcalidrawElement[],
  appState: Readonly<AppState>,
  textElement: ExcalidrawTextElement,
  container: NonDeleted<ExcalidrawTextContainer>,
  editor: DiagramEditor,
): ActionResult => {
  const stickyInk = getStickyNoteInk(textElement, container);
  editor.scene.mutateElement(textElement, {
    containerId: container.id,
    verticalAlign: VERTICAL_ALIGN.MIDDLE,
    textAlign: TEXT_ALIGN.CENTER,
    autoResize: true,
    angle: (isArrowElement(container) ? 0 : container.angle) as Radians,
    labelPosition: isArrowElement(container) ? DEFAULT_BOUND_TEXT_LABEL_POSITION : null,
    ...(stickyInk
      ? {
          baseFontSize: normalizeStickyNoteFontSize(
            textElement.baseFontSize ?? textElement.fontSize,
          ),
          strokeColor: stickyInk,
        }
      : null),
  });
  editor.scene.mutateElement(container, {
    boundElements: (container.boundElements ?? []).concat({ type: "text", id: textElement.id }),
    ...(stickyInk ? { strokeColor: stickyInk } : null),
  });
  const originalContainerHeight = container.height;
  redrawTextBoundingBox(textElement, container, editor.scene, editor.renderEnvironment);
  // kept for unbinding, which gives the container its height back
  updateOriginalContainerCache(container.id, originalContainerHeight);

  const nextElements = pushTextAboveContainer(elements, container, textElement);
  return {
    elements: nextElements,
    appState: {
      ...appState,
      ...getSelectionStateForElements([container], getNonDeletedElements(nextElements), appState),
    },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  };
};

/** Makes a selected text the label of the selected shape or arrow, which has none. */
export const actionBindText: Action = {
  name: "bindText",
  label: "labels.bindText",
  announcement: "Text bound",
  predicate: (_elements, appState, editor) => {
    const selected = editor.scene.getSelectedElements(appState);
    const [first, second] = selected;
    if (selected.length !== 2 || !first || !second) {
      return false;
    }
    const hasText = isTextElement(first) || isTextElement(second);
    const container = isTextBindableContainer(first)
      ? first
      : isTextBindableContainer(second)
        ? second
        : null;
    return (
      hasText &&
      container !== null &&
      getBoundTextElement(container, editor.scene.getNonDeletedElementsMap()) === null
    );
  },
  perform: (elements, appState, _formData, editor) => {
    const [first, second] = editor.scene.getSelectedElements(appState);
    if (!first || !second) {
      return false;
    }
    const [textElement, container] =
      isTextElement(first) && isTextBindableContainer(second)
        ? [first, second]
        : [second as ExcalidrawTextElement, first as NonDeleted<ExcalidrawTextContainer>];
    return bindTextToContainer(elements, appState, textElement, container, editor);
  },
};

const wrapTextsInContainers = (
  elements: readonly ExcalidrawElement[],
  appState: Readonly<AppState>,
  textElements: readonly ExcalidrawTextElement[],
  editor: DiagramEditor,
): ActionResult => {
  let updated: readonly ExcalidrawElement[] = elements.slice();
  const containerIds: Record<string, true> = {};

  for (const textElement of textElements) {
    // a default rectangle, not the current item's style, in the text's colour
    const container = newElement({
      type: "rectangle",
      boundElements: [...(textElement.boundElements ?? []), { id: textElement.id, type: "text" }],
      angle: textElement.angle,
      strokeColor: textElement.strokeColor,
      roundness:
        getDefaultAppState().currentItemRoundness === "round"
          ? {
              type: isUsingAdaptiveRadius("rectangle")
                ? ROUNDNESS.ADAPTIVE_RADIUS
                : ROUNDNESS.PROPORTIONAL_RADIUS,
            }
          : null,
      x: textElement.x - BOUND_TEXT_PADDING,
      y: textElement.y - BOUND_TEXT_PADDING,
      width: computeContainerDimensionForBoundText(textElement.width, "rectangle"),
      height: computeContainerDimensionForBoundText(textElement.height, "rectangle"),
      groupIds: textElement.groupIds,
      frameId: textElement.frameId,
    });

    // arrows bound to the text are bound to its container instead
    if (textElement.boundElements?.length) {
      const arrowIds = new Set(
        textElement.boundElements.filter((each) => each.type === "arrow").map((each) => each.id),
      );
      for (const arrow of updated.filter((each) =>
        arrowIds.has(each.id),
      ) as ExcalidrawLinearElement[]) {
        const startBinding =
          arrow.startBinding?.elementId === textElement.id
            ? { ...arrow.startBinding, elementId: container.id }
            : arrow.startBinding;
        const endBinding =
          arrow.endBinding?.elementId === textElement.id
            ? { ...arrow.endBinding, elementId: container.id }
            : arrow.endBinding;
        if (startBinding || endBinding) {
          editor.scene.mutateElement(arrow, { startBinding, endBinding });
        }
      }
    }

    editor.scene.mutateElement(textElement, {
      containerId: container.id,
      verticalAlign: VERTICAL_ALIGN.MIDDLE,
      boundElements: null,
      textAlign: TEXT_ALIGN.CENTER,
      autoResize: true,
    });
    redrawTextBoundingBox(textElement, container, editor.scene, editor.renderEnvironment);
    updated = pushContainerBelowText([...updated, container], container, textElement);
    containerIds[container.id] = true;
  }

  return {
    elements: updated,
    appState: { ...appState, selectedElementIds: containerIds },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  };
};

/** Puts each selected free text in a rectangle of its own, as its label. */
export const actionWrapTextInContainer: Action = {
  name: "wrapTextInContainer",
  label: "labels.createContainerFromText",
  announcement: "Text wrapped in a container",
  predicate: (_elements, appState, editor) => {
    const selected = editor.scene.getSelectedElements(appState);
    return selected.some((element) => isTextElement(element) && !isBoundToContainer(element));
  },
  perform: (elements, appState, _formData, editor) =>
    wrapTextsInContainers(
      elements,
      appState,
      editor.scene
        .getSelectedElements(appState)
        .filter(
          (element): element is NonDeleted<ExcalidrawTextElement> =>
            isTextElement(element) && !isBoundToContainer(element),
        ),
      editor,
    ),
};
