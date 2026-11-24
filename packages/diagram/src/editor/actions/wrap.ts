import { KEYS, matchKey } from "@excalidraw/common";
import {
  CaptureUpdateAction,
  fixBindingsAfterDeletion,
  getBoundTextElement,
  getNonDeletedElements,
  hasBoundTextElement,
  isArrowElement,
  isBoundToContainer,
  isFrameLikeElement,
  isTextBindableContainer,
  isTextElement,
  normalizeStickyNoteFontSize,
  redrawTextBoundingBox,
  updateBoundElements,
  updateOriginalContainerCache,
} from "@excalidraw/element";

import type {
  ExcalidrawArrowElement,
  ExcalidrawElement,
  ExcalidrawTextContainer,
  ExcalidrawTextElement,
  FixedPointBinding,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";
import type { Radians } from "@excalidraw/math";

import { getSelectionStateForElements } from "../selection.ts";
import {
  bindTextToContainer,
  getStickyNoteInk,
  pushContainerBelowText,
  pushTextAboveContainer,
  unbindTextFromContainer,
  wrapTextsInContainers,
} from "./bound-text.ts";
import { getFrameToUnwrap, unwrapFrame, wrapInFrame } from "./frame.ts";

import type { AppState } from "../../types.ts";
import type { DiagramEditor } from "../editor.ts";
import type { Action, ActionResult } from "../types.ts";

/** A container whose text an unwrap freed, and how the text sat in it. */
interface UnwrappedContainer {
  containerId: ExcalidrawTextContainer["id"];
  textId: ExcalidrawTextElement["id"];
  /** Whether the container went with it: one the previous wrap made. */
  isRemoved: boolean;
  baseFontSize: ExcalidrawTextElement["baseFontSize"];
  labelPosition: ExcalidrawTextElement["labelPosition"];
  autoResize: ExcalidrawTextElement["autoResize"];
  /**
   * The freed text as it landed: how far it has moved since (a freed text no
   * longer auto-resizes, so a size change does not move it) and whether it
   * was resized.
   */
  text: Pick<ExcalidrawTextElement, "x" | "y" | "fontSize">;
  /** The arrows bound to a removed container, as they were bound. */
  arrows: Pick<ExcalidrawArrowElement, "id" | "startBinding" | "endBinding">[];
}

/** What the last toggle did, to take back while the selection it left stands. */
interface LastWrap {
  selectedElementIds: AppState["selectedElementIds"];
  /** The containers it wrapped texts in, or brought back. */
  created?: ReadonlySet<ExcalidrawElement["id"]>;
  /** The containers it unwrapped. */
  unwrapped?: readonly UnwrappedContainer[];
}

const lastWraps = new WeakMap<DiagramEditor, LastWrap>();

function rebind(
  binding: FixedPointBinding | null,
  fromId: ExcalidrawElement["id"],
  toId: ExcalidrawElement["id"],
) {
  return binding?.elementId === fromId ? { ...binding, elementId: toId } : binding;
}

/**
 * Frees the containers' texts, the containers staying selected with them,
 * except the `created` ones, which go, their arrows moving onto the texts.
 */
function unwrap(
  editor: DiagramEditor,
  elements: readonly ExcalidrawElement[],
  appState: Readonly<AppState>,
  containers: readonly NonDeletedExcalidrawElement[],
  created: ReadonlySet<ExcalidrawElement["id"]> | undefined,
): ActionResult {
  const { scene } = editor;
  const elementsMap = scene.getNonDeletedElementsMap();
  const freed: NonDeletedExcalidrawElement[] = [];
  const removed: ExcalidrawElement[] = [];
  const unwrapped: UnwrappedContainer[] = [];

  for (const container of containers) {
    const text = getBoundTextElement(container, elementsMap);
    if (!text) continue;
    const isRemoved = created?.has(container.id) === true;
    const arrows = isRemoved
      ? (container.boundElements ?? []).flatMap(({ id }) => {
          const arrow = elementsMap.get(id);
          return arrow && isArrowElement(arrow) ? [arrow] : [];
        })
      : [];

    const { baseFontSize, labelPosition, autoResize } = text;
    unbindTextFromContainer(container, text, editor);
    unwrapped.push({
      containerId: container.id,
      textId: text.id,
      isRemoved,
      baseFontSize,
      labelPosition,
      autoResize,
      text: { x: text.x, y: text.y, fontSize: text.fontSize },
      arrows: arrows.map(({ id, startBinding, endBinding }) => ({ id, startBinding, endBinding })),
    });

    if (isRemoved) {
      if (arrows.length) {
        for (const arrow of arrows) {
          scene.mutateElement(arrow, {
            startBinding: rebind(arrow.startBinding, container.id, text.id),
            endBinding: rebind(arrow.endBinding, container.id, text.id),
          });
        }
        scene.mutateElement(text, {
          boundElements: [
            ...(text.boundElements ?? []),
            ...arrows.map(({ id }) => ({ id, type: "arrow" as const })),
          ],
        });
      }
      const removedContainer: ExcalidrawElement = container;
      scene.mutateElement(removedContainer, {
        isDeleted: true,
        boundElements: container.boundElements?.filter(
          ({ id }) => !arrows.some((arrow) => arrow.id === id),
        ),
      });
      updateBoundElements(text, scene, { renderEnvironment: editor.renderEnvironment });
      removed.push(container);
    } else {
      freed.push(container);
    }
    freed.push(text);
  }

  fixBindingsAfterDeletion(elements, removed);

  // an unwrapped arrow's line editor goes too
  const selection = getSelectionStateForElements(freed, getNonDeletedElements(elements), appState);
  lastWraps.set(editor, { selectedElementIds: selection.selectedElementIds, unwrapped });

  return {
    elements,
    appState: { ...appState, ...selection },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  };
}

interface UnwrappedPair {
  entry: UnwrappedContainer;
  text: ExcalidrawTextElement;
}

/**
 * Puts the unwrapped texts back into their containers as they sat in them,
 * the removed containers coming back with their arrows; `null` when any of
 * them is gone.
 */
function rewrap(
  editor: DiagramEditor,
  appState: Readonly<AppState>,
  unwrapped: readonly UnwrappedContainer[],
): ActionResult | null {
  const { scene } = editor;
  const allElementsMap = scene.getElementsMapIncludingDeleted();

  const pairs: UnwrappedPair[] = [];
  for (const entry of unwrapped) {
    const container = allElementsMap.get(entry.containerId);
    const text = allElementsMap.get(entry.textId);
    if (
      !container ||
      container.isDeleted !== entry.isRemoved ||
      !isTextBindableContainer(container) ||
      hasBoundTextElement(container) ||
      !text ||
      text.isDeleted ||
      !isTextElement(text) ||
      text.containerId
    ) {
      return null;
    }
    pairs.push({ entry, text });
  }

  for (const { entry } of pairs) {
    const container = allElementsMap.get(entry.containerId);
    if (entry.isRemoved && container) {
      scene.mutateElement(container, { isDeleted: false });
    }
  }
  // the restored containers resolve as bindings again
  scene.replaceAllElements(scene.getElementsIncludingDeleted());

  const elementsMap = scene.getNonDeletedElementsMap();
  const containers: NonDeletedExcalidrawElement[] = [];
  let nextElements: readonly ExcalidrawElement[] = scene.getElementsIncludingDeleted();

  for (const { entry, text } of pairs) {
    const container = elementsMap.get(entry.containerId);
    if (!container || !isTextBindableContainer(container)) continue;
    const arrowIds = new Set<ExcalidrawElement["id"]>();

    if (entry.isRemoved) {
      // the container comes back wherever its text went since
      scene.mutateElement(container, {
        frameId: text.frameId,
        x: container.x + text.x - entry.text.x,
        y: container.y + text.y - entry.text.y,
        angle: text.angle,
      });
      for (const { id, startBinding, endBinding } of entry.arrows) {
        const arrow = elementsMap.get(id);
        if (!arrow || !isArrowElement(arrow)) continue;
        const isStartOnText = arrow.startBinding?.elementId === text.id;
        const isEndOnText = arrow.endBinding?.elementId === text.id;
        if (isStartOnText || isEndOnText) {
          scene.mutateElement(arrow, {
            startBinding: isStartOnText ? startBinding : arrow.startBinding,
            endBinding: isEndOnText ? endBinding : arrow.endBinding,
          });
          arrowIds.add(id);
        }
      }
    }

    const stickyInk = getStickyNoteInk(text, container);
    scene.mutateElement(container, {
      boundElements: [
        ...(container.boundElements ?? []),
        { id: text.id, type: "text" as const },
        ...Array.from(arrowIds, (id) => ({ id, type: "arrow" as const })),
      ],
      ...(stickyInk ? { strokeColor: stickyInk } : null),
    });
    scene.mutateElement(text, {
      containerId: container.id,
      // a note's label keeps the size picked while it was out
      baseFontSize:
        entry.baseFontSize !== null && text.fontSize !== entry.text.fontSize
          ? normalizeStickyNoteFontSize(text.fontSize)
          : entry.baseFontSize,
      labelPosition: entry.labelPosition,
      autoResize: entry.autoResize,
      ...(stickyInk ? { strokeColor: stickyInk } : null),
      // a label carries no arrows of its own
      boundElements: null,
      angle: (isArrowElement(container) ? 0 : container.angle) as Radians,
    });
    // the height unbinding gives back
    const originalContainerHeight = container.height;
    redrawTextBoundingBox(text, container, scene, editor.renderEnvironment);
    updateOriginalContainerCache(container.id, originalContainerHeight);
    updateBoundElements(container, scene, { renderEnvironment: editor.renderEnvironment });
    // a removed container joins its text, which may have changed layers
    nextElements = entry.isRemoved
      ? pushContainerBelowText(nextElements, container, text)
      : pushTextAboveContainer(nextElements, container, text);
    containers.push(container);
  }

  const selection = getSelectionStateForElements(
    containers,
    getNonDeletedElements(nextElements),
    appState,
  );
  lastWraps.set(editor, {
    selectedElementIds: selection.selectedElementIds,
    // removed again by the next toggle
    created: new Set(
      unwrapped.filter((entry) => entry.isRemoved).map((entry) => entry.containerId),
    ),
  });

  return {
    elements: nextElements,
    appState: { ...appState, ...selection },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  };
}

/**
 * Wraps the selection in what fits it, or unwraps it, containers before
 * frames: a text and an empty container bind; texts (with labelled
 * containers) each get a container; labelled containers let their texts go;
 * a frame with its children, or all of a frame's children, lose the frame;
 * anything else is framed. While the selection it left stands, the next
 * toggle takes the containers it made or freed back. Excalidraw's `App.wrap`.
 */
export function toggleWrap(
  editor: DiagramEditor,
  elements: readonly ExcalidrawElement[],
  appState: Readonly<AppState>,
): ActionResult {
  const stored = lastWraps.get(editor);
  const last = stored?.selectedElementIds === appState.selectedElementIds ? stored : null;
  lastWraps.delete(editor);

  if (last?.unwrapped) {
    const rewrapped = rewrap(editor, appState, last.unwrapped);
    if (rewrapped) return rewrapped;
  }

  const selectedElements = editor.scene
    .getSelectedElements(appState)
    .filter((element) => !isBoundToContainer(element));
  const texts = selectedElements.filter(
    (element): element is NonDeletedExcalidrawElement & ExcalidrawTextElement =>
      isTextElement(element),
  );
  const labeledContainers = selectedElements.filter((element) => hasBoundTextElement(element));

  const [onlyText] = texts;
  if (selectedElements.length === 2 && texts.length === 1 && onlyText) {
    const container = selectedElements.find((element) => element !== onlyText);
    if (container && isTextBindableContainer(container) && !hasBoundTextElement(container)) {
      return bindTextToContainer(elements, appState, onlyText, container, editor);
    }
  }

  if (texts.length && texts.length + labeledContainers.length === selectedElements.length) {
    const result = wrapTextsInContainers(elements, appState, texts, editor);
    if (!result) return result;
    const created = Object.keys(result.appState?.selectedElementIds ?? {});
    // the labelled containers stay selected, to unwrap next with the new ones
    const selectedElementIds = Object.fromEntries(
      [...created, ...labeledContainers.map((element) => element.id)].map(
        (id) => [id, true] as const,
      ),
    );
    lastWraps.set(editor, { selectedElementIds, created: new Set(created) });
    return { ...result, appState: { ...result.appState, selectedElementIds } };
  }

  if (labeledContainers.length === selectedElements.length && labeledContainers.length > 0) {
    return unwrap(editor, elements, appState, labeledContainers, last?.created);
  }

  const frameToUnwrap = getFrameToUnwrap(selectedElements, editor.scene.getNonDeletedElementsMap());
  if (frameToUnwrap) {
    return unwrapFrame(elements, appState, frameToUnwrap, editor);
  }

  if (selectedElements.length && !selectedElements.some((element) => isFrameLikeElement(element))) {
    return wrapInFrame(elements, appState, selectedElements, editor);
  }

  return false;
}

/** Wraps the selection in a container or a frame, or unwraps it. W. */
export const actionToggleWrap: Action = {
  name: "toggleWrap",
  label: "labels.toggleWrap",
  announcement: "Wrapped",
  predicate: (_elements, appState, editor) => editor.scene.getSelectedElements(appState).length > 0,
  perform: (elements, appState, _value, editor) => toggleWrap(editor, elements, appState),
  keyTest: (event, appState, _elements, editor) =>
    !event[KEYS.CTRL_OR_CMD] &&
    !event.altKey &&
    !event.shiftKey &&
    matchKey(event, KEYS.W) &&
    editor.scene.getSelectedElements(appState).length > 0,
};
