import {
  arrayToMap,
  getFontFamilyString,
  getFontString,
  getLineHeight,
  invariant,
  KEYS,
  matchKey,
} from "@excalidraw/common";
import {
  CaptureUpdateAction,
  getBaseFontSize,
  getBaseFontSizeUpdate,
  getElementBounds,
  getSelectedElements,
  getTextAnchorRatios,
  isBoundToContainer,
  isExcalidrawElement,
  isNonDeletedElement,
  isStickyNoteElement,
  isTextElement,
  measureText,
  newElementWith,
  normalizeStickyNote,
  redrawTextBoundingBox,
  updateBoundElements,
  wrapText,
} from "@excalidraw/element";
import { pointFrom, pointRotateRads } from "@excalidraw/math";

import type {
  ExcalidrawElement,
  ExcalidrawTextElement,
  FontFamilyValues,
  NonDeletedExcalidrawElement,
  TextAlign,
  VerticalAlign,
} from "@excalidraw/element/types";
import type { GlobalPoint } from "@excalidraw/math";

import type { AppState } from "../../types.ts";
import type { DiagramEditor } from "../editor.ts";
import type { Action, ActionResult } from "../types.ts";

const FONT_SIZE_RELATIVE_INCREASE_STEP = 0.1;

/**
 * The elements with `callback` applied to the selected ones and the text being
 * edited, sticky notes kept valid. Excalidraw's `changeProperty`.
 */
export const changeProperty = (
  elements: readonly ExcalidrawElement[],
  appState: AppState,
  callback: (element: NonDeletedExcalidrawElement) => ExcalidrawElement,
  includeBoundText = false,
): ExcalidrawElement[] => {
  const selectedElementIds = arrayToMap(
    getSelectedElements(elements, appState, { includeBoundTextElement: includeBoundText }),
  );
  return elements.map((element) => {
    if (selectedElementIds.get(element.id) || element.id === appState.editingTextElement?.id) {
      const nextElement = callback(element as NonDeletedExcalidrawElement);
      return isStickyNoteElement(nextElement) ? normalizeStickyNote(nextElement) : nextElement;
    }
    return element;
  });
};

/** A free text keeps the point its alignment pins, and its vertical centre, as its font resizes. */
const offsetElementAfterFontResize = (
  prevElement: ExcalidrawTextElement,
  nextElement: ExcalidrawTextElement,
  editor: DiagramEditor,
): ExcalidrawTextElement => {
  if (isBoundToContainer(nextElement) || !nextElement.autoResize) {
    return nextElement;
  }
  return editor.scene.mutateElement(nextElement, {
    x:
      prevElement.textAlign === "left"
        ? prevElement.x
        : prevElement.x +
          (prevElement.width - nextElement.width) / (prevElement.textAlign === "center" ? 2 : 1),
    y: prevElement.y + (prevElement.height - nextElement.height) / 2,
  });
};

const changeFontSize = (
  elements: readonly ExcalidrawElement[],
  appState: AppState,
  editor: DiagramEditor,
  getNewFontSize: (element: ExcalidrawTextElement) => number,
  fallbackValue?: ExcalidrawTextElement["fontSize"],
): ActionResult => {
  const newFontSizes = new Set<number>();
  const elementsMap = editor.scene.getNonDeletedElementsMap();

  const updatedElements = changeProperty(
    elements,
    appState,
    (oldElement) => {
      if (!isTextElement(oldElement)) {
        return oldElement;
      }
      const newFontSize = getNewFontSize(oldElement);
      newFontSizes.add(newFontSize);
      const container = editor.scene.getContainerElement(oldElement);
      const newElement: ExcalidrawTextElement = newElementWith(
        oldElement,
        getBaseFontSizeUpdate(oldElement, newFontSize, elementsMap),
      );
      redrawTextBoundingBox(newElement, container, editor.scene, editor.renderEnvironment);
      return offsetElementAfterFontResize(oldElement, newElement, editor);
    },
    true,
  );

  for (const element of getSelectedElements(elements, appState, {
    includeBoundTextElement: true,
  })) {
    if (isTextElement(element)) {
      updateBoundElements(element, editor.scene, {
        renderEnvironment: editor.renderEnvironment,
      });
    }
  }

  const [only] = newFontSizes;
  return {
    elements: updatedElements,
    appState: {
      ...appState,
      currentItemFontSize:
        newFontSizes.size === 1 && only !== undefined
          ? only
          : (fallbackValue ?? appState.currentItemFontSize),
    },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  };
};

/** Sets the font size of the selected text, and of text drawn next. */
export const actionChangeFontSize: Action<ExcalidrawTextElement["fontSize"]> = {
  name: "changeFontSize",
  label: "labels.fontSize",
  announcement: "Font size changed",
  perform: (elements, appState, value, editor) =>
    changeFontSize(
      elements,
      appState,
      editor,
      () => {
        invariant(value, "actionChangeFontSize: Expected a font size value");
        return value;
      },
      value ?? undefined,
    ),
};

/** Ctrl or Cmd+Shift+`<` (or `,`). */
export const actionDecreaseFontSize: Action = {
  name: "decreaseFontSize",
  label: "labels.decreaseFontSize",
  announcement: "Font size decreased",
  perform: (elements, appState, _value, editor) =>
    changeFontSize(elements, appState, editor, (element) =>
      Math.round(
        (1 / (1 + FONT_SIZE_RELATIVE_INCREASE_STEP)) *
          getBaseFontSize(element, editor.scene.getNonDeletedElementsMap()),
      ),
    ),
  keyTest: (event) =>
    event[KEYS.CTRL_OR_CMD] &&
    event.shiftKey &&
    (event.key === KEYS.CHEVRON_LEFT || event.key === KEYS.COMMA),
};

/** Ctrl or Cmd+Shift+`>` (or `.`). */
export const actionIncreaseFontSize: Action = {
  name: "increaseFontSize",
  label: "labels.increaseFontSize",
  announcement: "Font size increased",
  perform: (elements, appState, _value, editor) =>
    changeFontSize(elements, appState, editor, (element) =>
      Math.round(
        getBaseFontSize(element, editor.scene.getNonDeletedElementsMap()) *
          (1 + FONT_SIZE_RELATIVE_INCREASE_STEP),
      ),
    ),
  keyTest: (event) =>
    event[KEYS.CTRL_OR_CMD] &&
    event.shiftKey &&
    (event.key === KEYS.CHEVRON_RIGHT || event.key === KEYS.PERIOD),
};

/**
 * Sets the font family of the selected text, and of text drawn next; the text
 * is measured again once the family's faces for its characters have loaded.
 */
/**
 * What the font picker sends: a family picked, or one hovered to preview on
 * the selection (`cachedElements` holding the selection as it was when the
 * picker opened, which `resetAll` puts back), and the picker's state.
 */
export type ChangeFontFamilyData = Partial<
  Pick<
    AppState,
    "openPopup" | "currentItemFontFamily" | "currentHoveredFontFamily" | "fontTopPicks"
  >
> & {
  cachedElements?: ReadonlyMap<string, ExcalidrawElement>;
  resetAll?: true;
  resetContainers?: true;
};

/** Past these, a hovered font is not drawn on the selection: the redraw would lag the pointer. */
const HOVER_PREVIEW_MAX_TEXTS = 200;
const HOVER_PREVIEW_MAX_CHARS = 5000;

const tooMuchToPreview = (elements: readonly ExcalidrawElement[], appState: AppState): boolean => {
  const texts = getSelectedElements(elements, appState, { includeBoundTextElement: true }).filter(
    isTextElement,
  );
  if (texts.length > HOVER_PREVIEW_MAX_TEXTS) return true;
  let chars = 0;
  for (const text of texts) {
    chars += text.originalText.length;
    if (chars > HOVER_PREVIEW_MAX_CHARS) return true;
  }
  return false;
};

/**
 * The font family: of the selected text, and of text drawn next. A hovered
 * family previews on the selection without an undo step, and the selection
 * goes back as it was when the picker closes without a pick.
 */
export const actionChangeFontFamily: Action<FontFamilyValues | ChangeFontFamilyData> = {
  name: "changeFontFamily",
  label: "labels.fontFamily",
  announcement: "Font changed",
  perform: (elements, appState, value, editor) => {
    invariant(value, "actionChangeFontFamily: value must be defined");
    const data: ChangeFontFamilyData =
      typeof value === "number" ? { currentItemFontFamily: value } : value;
    const { cachedElements, resetAll, resetContainers, ...nextAppState } = data;

    if (resetAll) {
      return {
        elements: changeProperty(
          elements,
          appState,
          (element) => {
            const cached = cachedElements?.get(element.id);
            return cached
              ? newElementWith(element, { ...cached } as Partial<typeof element>)
              : element;
          },
          true,
        ),
        appState: { ...appState, ...nextAppState },
        captureUpdate: CaptureUpdateAction.NEVER,
      };
    }

    const { currentItemFontFamily, currentHoveredFontFamily } = data;
    const nextFontFamily = currentItemFontFamily ?? currentHoveredFontFamily ?? null;
    const picked = currentItemFontFamily !== undefined && currentItemFontFamily !== null;
    const result = {
      appState: { ...appState, ...nextAppState },
      captureUpdate: picked ? CaptureUpdateAction.IMMEDIATELY : CaptureUpdateAction.EVENTUALLY,
    };
    if (nextFontFamily === null || (!picked && tooMuchToPreview(elements, appState))) {
      return result;
    }

    const changed: ExcalidrawTextElement[] = [];
    const nextElements = changeProperty(
      elements,
      appState,
      (oldElement) => {
        if (!isTextElement(oldElement) || (!picked && oldElement.fontFamily === nextFontFamily)) {
          return oldElement;
        }
        const newElement: ExcalidrawTextElement = newElementWith(oldElement, {
          fontFamily: nextFontFamily,
          lineHeight: getLineHeight(nextFontFamily),
        });
        if (resetContainers && oldElement.containerId) {
          // the container back as it was, for the preview to grow it from there
          const cachedContainer = cachedElements?.get(oldElement.containerId);
          const container = editor.scene.getContainerElement(oldElement);
          if (cachedContainer && container) {
            editor.scene.mutateElement(container, { ...cachedContainer });
          }
        }
        changed.push(newElement);
        return newElement;
      },
      true,
    );

    const redraw = () => {
      for (const element of changed) {
        const latest = editor.scene.getElement(element.id);
        if (latest && isTextElement(latest)) {
          redrawTextBoundingBox(
            latest,
            editor.scene.getContainerElement(latest),
            editor.scene,
            editor.renderEnvironment,
          );
        }
      }
    };
    const fontSet = editor.ownerDocument.fonts as FontFaceSet | undefined;
    const fontString = `10px ${getFontFamilyString({ fontFamily: nextFontFamily })}`;
    const chars = [...new Set(changed.flatMap((element) => Array.from(element.originalText)))].join(
      "",
    );
    if (fontSet === undefined || fontSet.check(fontString, chars)) {
      // the elements are the scene's once the result is applied
      editor.afterNextCommit(redraw);
    } else {
      void fontSet.load(fontString, chars).then((fontFaces) => {
        editor.batch(() => {
          redraw();
          editor.fonts.onLoaded(fontFaces);
        });
      });
    }

    return {
      ...result,
      elements: nextElements,
      appState: {
        ...result.appState,
        currentItemFontFamily: picked ? nextFontFamily : appState.currentItemFontFamily,
      },
    };
  },
};

/** Left, centre or right: the selected text, and text drawn next. */
export const actionChangeTextAlign: Action<TextAlign> = {
  name: "changeTextAlign",
  announcement: "Text alignment changed",
  perform: (elements, appState, value, editor) => {
    invariant(value, "actionChangeTextAlign: value must be defined");
    return {
      elements: changeProperty(
        elements,
        appState,
        (oldElement) => {
          if (!isTextElement(oldElement)) {
            return oldElement;
          }
          const newElement: ExcalidrawTextElement = newElementWith(oldElement, {
            textAlign: value,
          });
          redrawTextBoundingBox(
            newElement,
            editor.scene.getContainerElement(oldElement),
            editor.scene,
            editor.renderEnvironment,
          );
          return newElement;
        },
        true,
      ),
      appState: { ...appState, currentItemTextAlign: value },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
};

/** Top, middle or bottom: a label in its container. */
export const actionChangeVerticalAlign: Action<VerticalAlign> = {
  name: "changeVerticalAlign",
  announcement: "Vertical alignment changed",
  perform: (elements, appState, value, editor) => {
    invariant(value, "actionChangeVerticalAlign: value must be defined");
    return {
      elements: changeProperty(
        elements,
        appState,
        (oldElement) => {
          if (!isTextElement(oldElement)) {
            return oldElement;
          }
          const newElement: ExcalidrawTextElement = newElementWith(oldElement, {
            verticalAlign: value,
          });
          redrawTextBoundingBox(
            newElement,
            editor.scene.getContainerElement(oldElement),
            editor.scene,
            editor.renderEnvironment,
          );
          return newElement;
        },
        true,
      ),
      appState: { ...appState },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
};

/** The selected free texts (a label follows its container). */
const getSelectedFreeTexts = (
  elements: readonly ExcalidrawElement[],
  appState: Readonly<AppState>,
) =>
  getSelectedElements(elements, appState).filter(
    (element) => isTextElement(element) && !isBoundToContainer(element),
  );

/**
 * Room past its text for a text made to keep its width: one exactly as wide
 * as its longest line is on the verge of wrapping, and a browser's editor can
 * lay the line out a hair wider than it measures here.
 */
const KEPT_TEXT_WIDTH_SLACK = 1;

const toggleTextAutoResize = (
  text: ExcalidrawTextElement,
  autoResize: boolean,
  editor: DiagramEditor,
): ExcalidrawTextElement => {
  const font = getFontString(text);
  const width = autoResize
    ? null
    : Math.min(
        text.width + KEPT_TEXT_WIDTH_SLACK,
        editor.text.getMaxTextWidth(
          editor.text.getTextViewportOffsets(
            getElementBounds(text, editor.scene.getNonDeletedElementsMap()),
          ),
        ),
      );
  const nextText =
    width === null
      ? text.originalText
      : wrapText(text.originalText, font, width, editor.renderEnvironment);
  const metrics = measureText(nextText, font, text.lineHeight, editor.renderEnvironment);
  const nextWidth = width ?? metrics.width;

  // the point the alignment pins stays where it is on the canvas, the box
  // turning about its centre
  const anchor = getTextAnchorRatios(text);
  const getAnchorOffset = (boxWidth: number, boxHeight: number) =>
    pointRotateRads(
      pointFrom<GlobalPoint>(boxWidth * (anchor.x - 0.5), boxHeight * (anchor.y - 0.5)),
      pointFrom<GlobalPoint>(0, 0),
      text.angle,
    );
  const [offsetX, offsetY] = getAnchorOffset(text.width, text.height);
  const [nextOffsetX, nextOffsetY] = getAnchorOffset(nextWidth, metrics.height);

  return newElementWith(text, {
    autoResize,
    width: nextWidth,
    height: metrics.height,
    x: text.x + (text.width - nextWidth) / 2 + offsetX - nextOffsetX,
    y: text.y + (text.height - metrics.height) / 2 + offsetY - nextOffsetY,
    text: nextText,
  });
};

/** Alt+W, in the canvas and in the text editor. */
export const isTextAutoResizeShortcut = (event: KeyboardEvent): boolean =>
  event.altKey && !event[KEYS.CTRL_OR_CMD] && !event.shiftKey && matchKey(event, KEYS.W);

/**
 * Toggles auto-resizing of the given text (the one being edited), or else of
 * the selected free texts: on if any of them wraps, else off.
 */
export const actionTextAutoResize: Action<ExcalidrawElement> = {
  name: "autoResize",
  label: "labels.autoResize",
  announcement: "Text resizing toggled",
  predicate: (elements, appState) => {
    const selectedElements = getSelectedElements(elements, appState);
    const [only] = selectedElements;
    return selectedElements.length === 1 && !!only && isTextElement(only) && !only.autoResize;
  },
  perform: (elements, appState, targetElement, editor) => {
    const targetIds = new Set(
      (isExcalidrawElement(targetElement) &&
      isTextElement(targetElement) &&
      !isBoundToContainer(targetElement)
        ? [targetElement]
        : getSelectedFreeTexts(elements, appState)
      ).map((element) => element.id),
    );
    const targets = elements.flatMap((element) =>
      targetIds.has(element.id) && isTextElement(element) ? [element] : [],
    );
    if (targets.length === 0) {
      return false;
    }

    const autoResize = targets.some((text) => !text.autoResize);
    const toggled = new Map(
      targets
        .filter((text) => text.autoResize !== autoResize)
        .map((text) => [text.id, toggleTextAutoResize(text, autoResize, editor)]),
    );
    for (const text of toggled.values()) {
      if (isNonDeletedElement(text)) {
        updateBoundElements(text, editor.scene, {
          changedElements: new Map([[text.id, text]]),
          renderEnvironment: editor.renderEnvironment,
        });
      }
    }
    return {
      appState,
      elements: elements.map((element) => toggled.get(element.id) ?? element),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
  keyTest: (event, appState, elements) =>
    isTextAutoResizeShortcut(event) && getSelectedFreeTexts(elements, appState).length > 0,
};
