import {
  ARROW_TYPE,
  ROUNDNESS,
  arrayToMap,
  getStrokeWidthByKey,
  invariant,
  isTransparent,
  randomInteger,
  reduceToCommonValue,
} from "@excalidraw/common";
import {
  CaptureUpdateAction,
  LinearElementEditor,
  bindBindingElement,
  calculateFixedPointForElbowArrowBinding,
  canBecomePolygon,
  getColorTargetElement,
  getColorUpdate,
  getNonDeletedElements,
  getSelectedElements,
  hasFillStyle,
  hasStrokeColor,
  isArrowElement,
  isElbowArrow,
  isLineElement,
  isLinearElement,
  isSomeElementSelected,
  isUsingAdaptiveRadius,
  newElementWith,
  syncStickyNoteInk,
  toggleLinePolygonState,
  updateElbowArrowPoints,
  updateElbowArrowRoute,
} from "@excalidraw/element";
import { pointFrom } from "@excalidraw/math";

import type { StrokeWidthKey } from "@excalidraw/common";
import type {
  Arrowhead,
  ExcalidrawBindableElement,
  ExcalidrawElement,
  ExcalidrawLinearElement,
  NonDeleted,
  NonDeletedExcalidrawElement,
  StrokeVariability,
} from "@excalidraw/element/types";
import type { LocalPoint, Radians } from "@excalidraw/math";

import type { AppState } from "../../types.ts";
import type { DiagramEditor } from "../editor.ts";
import { patchLinearEditor } from "../linear.ts";

import type { Action } from "../types.ts";
import { getColorTargetAppStateUpdates, resolveColorTarget } from "./color-targets.ts";
import { changeProperty } from "./text.ts";

type Primitive = string | number | boolean | bigint | symbol | null | undefined;

/**
 * What the panel shows for a property: the edited text's, the selection's
 * common value (or `defaultValue(true)` when they differ), or the default for
 * new elements. Excalidraw's `getFormValue`.
 */
export const getFormValue = <T extends Primitive>(
  elements: readonly ExcalidrawElement[],
  editor: Pick<DiagramEditor, "state" | "scene">,
  getValue: (element: ExcalidrawElement) => T,
  elementPredicate: true | ((element: ExcalidrawElement) => boolean),
  defaultValue: (isSomeElementSelected: boolean) => T,
): T => {
  const { editingTextElement } = editor.state;
  const editing = editingTextElement ? getValue(editingTextElement) : null;
  if (editing) {
    return editing;
  }
  if (!isSomeElementSelected(getNonDeletedElements(elements), editor.state)) {
    return defaultValue(false);
  }
  const selected = editor.scene.getSelectedElements(editor.state);
  const targets =
    elementPredicate === true ? selected : selected.filter((each) => elementPredicate(each));
  return reduceToCommonValue(targets, getValue) ?? defaultValue(true);
};

/** The elements a property change reaches: the edited text, the one being drawn, or the selection. */
export const getTargetElements = (
  elements: readonly NonDeletedExcalidrawElement[],
  appState: Pick<AppState, "selectedElementIds" | "editingTextElement" | "newElement">,
): readonly ExcalidrawElement[] =>
  appState.editingTextElement
    ? [appState.editingTextElement]
    : appState.newElement
      ? [appState.newElement]
      : getSelectedElements(elements, appState, { includeBoundTextElement: true });

export interface ColorChange extends Partial<AppState> {
  color?: string;
}

/** Colours the selection's strokes, a note's text and footer with them. */
export const actionChangeStrokeColor: Action<ColorChange> = {
  name: "changeStrokeColor",
  label: "labels.stroke",
  announcement: "Stroke colour changed",
  perform: (elements, appState, value) => {
    const { color, ...appStateUpdates } = value ?? {};
    if (color === undefined) {
      return {
        appState: { ...appState, ...appStateUpdates },
        captureUpdate: CaptureUpdateAction.EVENTUALLY,
      };
    }
    const target = resolveColorTarget(appState, elements, "strokeColor");
    const elementsMap = arrayToMap(elements);
    return {
      // a note and its label share one ink: the label's colour reaches the note
      elements: syncStickyNoteInk(
        changeProperty(
          elements,
          appState,
          (element) =>
            hasStrokeColor(element.type)
              ? newElementWith(element, getColorUpdate(element, "strokeColor", color, elementsMap))
              : element,
          true,
        ),
        elementsMap,
      ),
      appState: {
        ...appState,
        ...appStateUpdates,
        ...getColorTargetAppStateUpdates(target, color),
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
};

/**
 * Fills the selection; open lines that can close become polygons when the
 * fill is a colour. A background on a note's label fills the note.
 */
export const actionChangeBackgroundColor: Action<ColorChange> = {
  name: "changeBackgroundColor",
  label: "labels.changeBackground",
  announcement: "Background changed",
  perform: (elements, appState, value, editor) => {
    const { color, ...appStateUpdates } = value ?? {};
    if (color === undefined) {
      return {
        appState: { ...appState, ...appStateUpdates },
        captureUpdate: CaptureUpdateAction.EVENTUALLY,
      };
    }
    const target = resolveColorTarget(appState, elements, "backgroundColor");
    const elementsMap = arrayToMap(elements);
    const selectedElements = editor.scene.getSelectedElements(appState);
    const shouldEnablePolygon =
      !isTransparent(color) &&
      selectedElements.length > 0 &&
      selectedElements.every(
        (element) => isLineElement(element) && canBecomePolygon(element.points),
      );

    let nextElements: ExcalidrawElement[];
    if (shouldEnablePolygon) {
      const selectedElementsMap = arrayToMap(selectedElements);
      nextElements = elements.map((element) =>
        selectedElementsMap.has(element.id) && isLineElement(element)
          ? newElementWith(element, {
              backgroundColor: color,
              ...toggleLinePolygonState(element, true),
            })
          : element,
      );
    } else {
      nextElements = changeProperty(elements, appState, (element) =>
        getColorTargetElement(element, "backgroundColor", elementsMap) === element
          ? newElementWith(element, getColorUpdate(element, "backgroundColor", color, elementsMap))
          : element,
      );
      const editingText = appState.editingTextElement
        ? elementsMap.get(appState.editingTextElement.id)
        : undefined;
      const editingTarget = editingText
        ? getColorTargetElement(editingText, "backgroundColor", elementsMap)
        : undefined;
      if (editingTarget && editingTarget !== editingText) {
        nextElements = nextElements.map((element) =>
          element.id === editingTarget.id
            ? newElementWith(
                element,
                getColorUpdate(element, "backgroundColor", color, elementsMap),
              )
            : element,
        );
      }
    }
    return {
      elements: nextElements,
      appState: {
        ...appState,
        ...appStateUpdates,
        ...getColorTargetAppStateUpdates(target, color),
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
};

export const actionChangeFillStyle: Action<ExcalidrawElement["fillStyle"]> = {
  name: "changeFillStyle",
  label: "labels.fill",
  announcement: "Fill changed",
  perform: (elements, appState, value) => {
    invariant(value, "actionChangeFillStyle: a fill style is required");
    return {
      elements: changeProperty(elements, appState, (element) =>
        hasFillStyle(element.type) ? newElementWith(element, { fillStyle: value }) : element,
      ),
      appState: { ...appState, currentItemFillStyle: value },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
};

export const actionChangeStrokeWidth: Action<StrokeWidthKey> = {
  name: "changeStrokeWidth",
  label: "labels.strokeWidth",
  announcement: "Stroke width changed",
  perform: (elements, appState, value) => {
    invariant(value, "actionChangeStrokeWidth: a stroke width is required");
    return {
      elements: changeProperty(elements, appState, (element) =>
        newElementWith(element, { strokeWidth: getStrokeWidthByKey(element.type, value) }),
      ),
      appState: { ...appState, currentItemStrokeWidthKey: value },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
};

export const actionChangeSloppiness: Action<ExcalidrawElement["roughness"]> = {
  name: "changeSloppiness",
  label: "labels.sloppiness",
  announcement: "Sloppiness changed",
  perform: (elements, appState, value) => {
    invariant(value !== null, "actionChangeSloppiness: a roughness is required");
    return {
      elements: changeProperty(elements, appState, (element) =>
        newElementWith(element, { seed: randomInteger(), roughness: value }),
      ),
      appState: { ...appState, currentItemRoughness: value },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
};

/** A freehand stroke's width follows the pen's pressure, or not. */
export const actionChangeFreedrawMode: Action<StrokeVariability> = {
  name: "changeFreedrawMode",
  label: "labels.pressure",
  announcement: "Pressure changed",
  perform: (elements, appState, value) => {
    const variability = value || "constant";
    return {
      elements: changeProperty(elements, appState, (element) =>
        element.type === "freedraw"
          ? newElementWith(element, {
              strokeOptions: { ...element.strokeOptions, variability },
            })
          : element,
      ),
      appState: { ...appState, currentItemStrokeVariability: variability },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
};

export const actionChangeStrokeStyle: Action<ExcalidrawElement["strokeStyle"]> = {
  name: "changeStrokeStyle",
  label: "labels.strokeStyle",
  announcement: "Stroke style changed",
  perform: (elements, appState, value) => {
    invariant(value, "actionChangeStrokeStyle: a stroke style is required");
    return {
      elements: changeProperty(elements, appState, (element) =>
        newElementWith(element, { strokeStyle: value }),
      ),
      appState: { ...appState, currentItemStrokeStyle: value },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
};

export const actionChangeOpacity: Action<ExcalidrawElement["opacity"]> = {
  name: "changeOpacity",
  label: "labels.opacity",
  announcement: "",
  perform: (elements, appState, value) => {
    invariant(value !== null, "actionChangeOpacity: an opacity is required");
    return {
      elements: changeProperty(
        elements,
        appState,
        (element) => newElementWith(element, { opacity: value }),
        true,
      ),
      appState: { ...appState, currentItemOpacity: value },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
};

export const actionChangeRoundness: Action<"sharp" | "round"> = {
  name: "changeRoundness",
  announcement: "Edges changed",
  perform: (elements, appState, value) => {
    invariant(value, "actionChangeRoundness: sharp or round is required");
    return {
      elements: changeProperty(elements, appState, (element) =>
        isElbowArrow(element)
          ? element
          : newElementWith(element, {
              roundness:
                value === "round"
                  ? {
                      type: isUsingAdaptiveRadius(element.type)
                        ? ROUNDNESS.ADAPTIVE_RADIUS
                        : ROUNDNESS.PROPORTIONAL_RADIUS,
                    }
                  : null,
            }),
      ),
      appState: { ...appState, currentItemRoundness: value },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
};

export interface ArrowheadChange {
  position: "start" | "end";
  type: Arrowhead | null;
}

export const actionChangeArrowhead: Action<ArrowheadChange> = {
  name: "changeArrowhead",
  announcement: "Arrowhead changed",
  perform: (elements, appState, value, editor) => {
    invariant(value, "actionChangeArrowhead: a position and an arrowhead are required");
    const { position, type } = value;
    return {
      elements: changeProperty(elements, appState, (element) => {
        if (!isLinearElement(element)) {
          return element;
        }
        const changed: ExcalidrawLinearElement = newElementWith(
          element,
          position === "start" ? { startArrowhead: type } : { endArrowhead: type },
        );
        return isElbowArrow(changed)
          ? newElementWith(
              changed,
              updateElbowArrowRoute(changed, editor.scene.getNonDeletedElementsMap()),
            )
          : changed;
      }),
      appState: {
        ...appState,
        [position === "start" ? "currentItemStartArrowhead" : "currentItemEndArrowhead"]: type,
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
};

export type ArrowType = "sharp" | "round" | "elbow";

/** Sharp, curved or elbow: an elbow arrow is routed again between its bindings. */
export const actionChangeArrowType: Action<ArrowType> = {
  name: "changeArrowType",
  announcement: "Arrow type changed",
  perform: (elements, appState, value, editor) => {
    invariant(value, "actionChangeArrowType: an arrow type is required");
    let dismissLinearEditor = false;
    const newElements = changeProperty(elements, appState, (element) => {
      if (!isArrowElement(element)) {
        return element;
      }
      const elementsMap = editor.scene.getNonDeletedElementsMap();
      const startPoint = LinearElementEditor.getPointAtIndexGlobalCoordinates(
        element,
        0,
        elementsMap,
      );
      const endPoint = LinearElementEditor.getPointAtIndexGlobalCoordinates(
        element,
        -1,
        elementsMap,
      );
      const straightened = { ...element, x: startPoint[0], y: startPoint[1], angle: 0 as Radians };
      let next = newElementWith(element, {
        x: value === ARROW_TYPE.elbow ? startPoint[0] : element.x,
        y: value === ARROW_TYPE.elbow ? startPoint[1] : element.y,
        roundness: value === ARROW_TYPE.round ? { type: ROUNDNESS.PROPORTIONAL_RADIUS } : null,
        elbowed: value === ARROW_TYPE.elbow,
        angle: value === ARROW_TYPE.elbow ? (0 as Radians) : element.angle,
        points:
          value === ARROW_TYPE.elbow || element.elbowed
            ? [
                LinearElementEditor.pointFromAbsoluteCoords(straightened, startPoint, elementsMap),
                LinearElementEditor.pointFromAbsoluteCoords(straightened, endPoint, elementsMap),
              ]
            : element.points,
      });

      if (isElbowArrow(next)) {
        dismissLinearEditor = true;
        const elbow = next;
        const startElement = elbow.startBinding
          ? (elementsMap.get(elbow.startBinding.elementId) as ExcalidrawBindableElement | undefined)
          : undefined;
        const endElement = elbow.endBinding
          ? (elementsMap.get(elbow.endBinding.elementId) as ExcalidrawBindableElement | undefined)
          : undefined;
        const startBinding =
          startElement && elbow.startBinding
            ? {
                ...elbow.startBinding,
                ...calculateFixedPointForElbowArrowBinding(
                  elbow,
                  startElement,
                  "start",
                  elementsMap,
                  appState.zoom,
                  appState.isBindingEnabled,
                ),
              }
            : null;
        const endBinding =
          endElement && elbow.endBinding
            ? {
                ...elbow.endBinding,
                ...calculateFixedPointForElbowArrowBinding(
                  elbow,
                  endElement,
                  "end",
                  elementsMap,
                  appState.zoom,
                  appState.isBindingEnabled,
                ),
              }
            : null;
        const startGlobal = LinearElementEditor.getPointAtIndexGlobalCoordinates(
          elbow,
          0,
          elementsMap,
        );
        const endGlobal = LinearElementEditor.getPointAtIndexGlobalCoordinates(
          elbow,
          -1,
          elementsMap,
        );
        next = {
          ...elbow,
          fixedSegments: null,
          startBinding,
          endBinding,
          ...updateElbowArrowPoints({ ...elbow, fixedSegments: null }, elementsMap, {
            points: [startGlobal, endGlobal].map((point): LocalPoint =>
              pointFrom(point[0] - elbow.x, point[1] - elbow.y),
            ),
            startBinding,
            endBinding,
            fixedSegments: null,
          }),
        } as typeof next;
      } else {
        for (const [binding, end] of [
          [next.startBinding, "start"],
          [next.endBinding, "end"],
        ] as const) {
          const bound = binding
            ? (elementsMap.get(binding.elementId) as
                | NonDeleted<ExcalidrawBindableElement>
                | undefined)
            : undefined;
          if (bound) {
            bindBindingElement(
              next,
              bound,
              appState.bindMode === "inside" ? "inside" : "orbit",
              end,
              editor.scene,
              appState.zoom,
            );
          }
        }
      }
      return next;
    });

    let selectedLinearElement = appState.selectedLinearElement;
    const selectedId = selectedLinearElement?.elementId;
    const selected = selectedId ? newElements.find((element) => element.id === selectedId) : null;
    if (selected && isLinearElement(selected)) {
      selectedLinearElement = new LinearElementEditor(
        selected as NonDeleted<ExcalidrawLinearElement>,
        arrayToMap(elements),
      );
      if (dismissLinearEditor && selectedLinearElement.isEditing) {
        selectedLinearElement = patchLinearEditor(selectedLinearElement, { isEditing: false });
      }
    }
    return {
      elements: newElements,
      appState: { ...appState, currentItemArrowType: value, selectedLinearElement },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
};

export const propertyActions: readonly Action[] = [
  actionChangeStrokeColor as Action,
  actionChangeBackgroundColor as Action,
  actionChangeFillStyle as Action,
  actionChangeStrokeWidth as Action,
  actionChangeSloppiness as Action,
  actionChangeFreedrawMode as Action,
  actionChangeStrokeStyle as Action,
  actionChangeOpacity as Action,
  actionChangeRoundness as Action,
  actionChangeArrowhead as Action,
  actionChangeArrowType as Action,
];
