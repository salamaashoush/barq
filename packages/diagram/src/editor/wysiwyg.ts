import {
  applyDarkModeFilter,
  CODES,
  getFontFamilyString,
  getFontString,
  hasRTLChars,
  isRTL,
  KEYS,
  MIME_TYPES,
  POINTER_BUTTON,
  THEME,
  viewportCoordsToSceneCoords,
} from "@excalidraw/common";
import {
  bumpVersion,
  computeBoundTextPosition,
  computeContainerDimensionForBoundText,
  getBoundTextElement,
  getBoundTextElementId,
  getBoundTextMaxHeight,
  getBoundTextMaxWidth,
  getContainerElement,
  getLineHeightInPx,
  getLineWidth,
  getTextElementAngle,
  getTextFromElements,
  getTextWidth,
  getWrappedTextLines,
  isArrowElement,
  isBoundToContainer,
  isStickyNoteElement,
  isTextElement,
  LinearElementEditor,
  normalizeText,
  originalContainerCache,
  redrawTextBoundingBox,
  updateBoundElements,
  updateOriginalContainerCache,
  wrapText,
} from "@excalidraw/element";
import { clamp as clampNumber, pointFrom, pointRotateRads } from "@excalidraw/math";

import type {
  ExcalidrawTextContainer,
  ExcalidrawTextElement,
  ExcalidrawTextElementWithContainer,
  NonDeleted,
} from "@excalidraw/element/types";
import type { Radians } from "@excalidraw/math";

import {
  parseClipboard,
  parseDataTransferEvent,
  parseDataTransferEventMimeTypes,
} from "../clipboard.ts";
import { actionResetZoom, actionZoomIn, actionZoomOut } from "./actions/canvas.ts";
import {
  actionDecreaseFontSize,
  actionIncreaseFontSize,
  actionTextAutoResize,
  isTextAutoResizeShortcut,
} from "./actions/text.ts";

import type { ParsedDataTranferList } from "../clipboard.ts";
import type { ZoomAnchor } from "./actions/canvas.ts";
import type { DiagramEditor } from "./editor.ts";

/**
 * How much further than the browser's caret reveal the canvas pans, in screen
 * px: text typed past the viewport's edge comes back with room to spare.
 */
export const CARET_FOLLOW_PADDING = 5;

/**
 * Where the textarea goes: the transform that places its box (with a `0 0`
 * origin), and the box's width.
 *
 * Unless it wraps, the box is whole px wide, a fraction wider than its text:
 * the browser centres (or right-aligns) each line by an offset rounded to its
 * layout units, and with a fractional width that rounding would change as the
 * width does. The transform pins the text's anchor (the point its alignment
 * grows it away from) to its place on the canvas, then scales and rotates
 * about the same point of the box, so typing on one line leaves the others'
 * glyphs where they are.
 */
const getEditorPlacement = ({
  x,
  y,
  textWidth,
  textHeight,
  boxWidth,
  wraps,
  textAlign,
  angle,
  zoom,
  getViewportCoords,
}: {
  x: number;
  y: number;
  textWidth: number;
  textHeight: number;
  boxWidth: number;
  wraps: boolean;
  textAlign: ExcalidrawTextElement["textAlign"];
  angle: number;
  zoom: number;
  getViewportCoords: (x: number, y: number) => [number, number];
}) => {
  const editorWidth = wraps ? boxWidth : Math.ceil(boxWidth);
  const anchorRatio = textAlign === "center" ? 0.5 : textAlign === "right" ? 1 : 0;
  // the canvas rotates the text about its centre
  const [anchorX, anchorY] = pointRotateRads(
    pointFrom(x + textWidth * anchorRatio, y),
    pointFrom(x + textWidth / 2, y + textHeight / 2),
    angle as Radians,
  );
  const [viewportX, viewportY] = getViewportCoords(anchorX, anchorY);
  const degree = (180 * angle) / Math.PI;
  return {
    editorWidth,
    transform: `translate(${viewportX}px, ${viewportY}px) rotate(${degree}deg) scale(${zoom}) translate(${
      -editorWidth * anchorRatio
    }px, 0px)`,
  };
};

const getLineDirection = (text: string, offset: number): "rtl" | "ltr" => {
  const hardLineStart = text.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
  const hardLineEnd = text.indexOf("\n", offset);
  const hardLineText = text.slice(hardLineStart, hardLineEnd === -1 ? text.length : hardLineEnd);
  return isRTL(hardLineText) ? "rtl" : "ltr";
};

const getCaretBoundaryOffsets = (text: string): number[] => {
  const offsets = [0];
  let offset = 0;
  for (const char of Array.from(text)) {
    offset += char.length;
    offsets.push(offset);
  }
  return offsets;
};

interface NativeLineLayout {
  text: string;
  font: ReturnType<typeof getFontString>;
  lineHeightPx: number;
  direction: "ltr" | "rtl";
  ownerDocument: Document;
}

/**
 * Where the caret shows at each of `offsets` into a line, as the browser lays
 * it out bidirectionally: the x of each, and of the line's left edge. Null
 * where it cannot tell.
 */
const measureNativeLineCaretPositions = ({
  text,
  font,
  lineHeightPx,
  direction,
  ownerDocument,
  offsets,
}: NativeLineLayout & { offsets: readonly number[] }): {
  left: number;
  positions: number[];
} | null => {
  if (!text || typeof ownerDocument.createRange !== "function") {
    return null;
  }
  const mirror = ownerDocument.createElement("div");
  const textNode = ownerDocument.createTextNode(text);
  const range = ownerDocument.createRange();
  const positions: number[] = [];
  mirror.dir = direction;
  Object.assign(mirror.style, {
    position: "fixed",
    top: "0",
    left: "0",
    margin: "0",
    padding: "0",
    border: "0",
    opacity: "0",
    pointerEvents: "none",
    whiteSpace: "pre",
    font,
    lineHeight: `${lineHeightPx}px`,
  });
  mirror.append(textNode);
  ownerDocument.body.append(mirror);
  try {
    range.selectNodeContents(textNode);
    const { left } = range.getBoundingClientRect();
    for (const offset of offsets) {
      range.setStart(textNode, offset);
      range.setEnd(textNode, offset);
      const caretRect = range.getBoundingClientRect();
      if (!Number.isFinite(caretRect.left)) {
        return null;
      }
      positions.push(caretRect.left);
    }
    // a DOM that lays nothing out puts every caret at one place: no answer
    if (positions.length > 1 && positions.every((position) => position === positions[0])) {
      return null;
    }
    return { left, positions };
  } catch {
    return null;
  } finally {
    mirror.remove();
  }
};

const getLineCaretOffsetFromNativeLayout = ({
  targetX,
  ...layout
}: NativeLineLayout & { targetX: number }): number | null => {
  const offsets = getCaretBoundaryOffsets(layout.text);
  const positions = measureNativeLineCaretPositions({ ...layout, offsets })?.positions;
  if (!positions) {
    return null;
  }
  const leftEdge = Math.min(...positions);
  let closestOffset = offsets[0] ?? 0;
  let closestDistance = Infinity;
  for (let index = 0; index < offsets.length; index++) {
    const distance = Math.abs((positions[index] ?? 0) - leftEdge - targetX);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestOffset = offsets[index] ?? closestOffset;
    }
  }
  return closestOffset;
};

const getLineCaretXFromNativeLayout = ({
  offset,
  ...layout
}: NativeLineLayout & { offset: number }): number | null => {
  const measured = measureNativeLineCaretPositions({ ...layout, offsets: [offset] });
  const [position] = measured?.positions ?? [];
  return measured && position !== undefined ? position - measured.left : null;
};

/** Ends the edit, writing what was typed. */
export type SubmitHandler = () => void;

export interface TextWysiwygOptions {
  /** The editor only deals with `originalText`; `text` (wrapped) is derived from it. */
  onChange: (nextOriginalText: string) => void;
  onSubmit: (data: { viaKeyboard: boolean; nextOriginalText: string }) => void;
  /** A scene point in the coordinates of the box the textarea is in. */
  getViewportCoords: (x: number, y: number) => [number, number];
  element: ExcalidrawTextElement;
  /** The host's textarea, in a box over the canvas the editor clips it to. */
  textarea: HTMLTextAreaElement;
  editor: DiagramEditor;
  autoSelect?: boolean;
  initialCaretSceneCoords?: { x: number; y: number } | null;
  /** A range of `originalText` to select; takes precedence over the caret. */
  initialSelection?: { start: number; end: number } | null;
}

/**
 * Excalidraw's `textWysiwyg`: a textarea laid over the text being edited, in
 * its font, size, colour, alignment and rotation, at the canvas' zoom, that
 * writes every input back to the element. Escape and Ctrl+Enter submit, as
 * does focus moving elsewhere; Tab indents and Shift+Tab outdents. The host
 * makes the textarea and removes it once the edit ends; everything else is
 * set here.
 */
export const textWysiwyg = ({
  onChange,
  onSubmit,
  getViewportCoords,
  element,
  textarea: editable,
  editor,
  autoSelect = true,
  initialCaretSceneCoords = null,
  initialSelection = null,
}: TextWysiwygOptions): SubmitHandler => {
  const ownerDocument = editable.ownerDocument;
  const ownerWindow = ownerDocument.defaultView ?? window;
  // the box the textarea is in: the part of the canvas a caret is revealed in
  const editorBox = editable.parentElement;

  let currentTextLayout: {
    angle: Radians;
    font: ReturnType<typeof getFontString>;
    height: number;
    lineHeightPx: number;
    textAlign: ExcalidrawTextElement["textAlign"];
    width: number;
    x: number;
    y: number;
  } | null = null;

  const textPropertiesUpdated = (updatedTextElement: ExcalidrawTextElement): boolean => {
    if (!editable.style.fontFamily || !editable.style.fontSize) {
      return false;
    }
    const currentFont = editable.style.fontFamily.replace(/"/g, "");
    if (getFontFamilyString({ fontFamily: updatedTextElement.fontFamily }) !== currentFont) {
      return true;
    }
    return `${updatedTextElement.fontSize}px` !== editable.style.fontSize;
  };

  let lastTheme = editor.state.theme;
  let lastViewport = "";

  const updateWysiwygStyle = (): void => {
    lastTheme = editor.state.theme;
    const appState = editor.state;
    const updatedTextElement = editor.scene.getElement<NonDeleted<ExcalidrawTextElement>>(
      element.id,
    );
    if (!updatedTextElement || !isTextElement(updatedTextElement)) {
      return;
    }
    const { textAlign, verticalAlign } = updatedTextElement;
    const elementsMap = editor.scene.getNonDeletedElementsMap();
    let coordX = updatedTextElement.x;
    let coordY = updatedTextElement.y;
    const container = getContainerElement<
      NonDeleted<ExcalidrawTextElement>,
      NonDeleted<ExcalidrawTextContainer>
    >(updatedTextElement, elementsMap);
    let width = updatedTextElement.width;
    // unbound text is as high as it is
    let height = updatedTextElement.height;

    if (container && updatedTextElement.containerId) {
      const boundText = updatedTextElement as ExcalidrawTextElementWithContainer;
      if (isArrowElement(container)) {
        const boundTextCoords = LinearElementEditor.getBoundTextElementPosition(
          container,
          boundText,
          elementsMap,
        );
        coordX = boundTextCoords.x;
        coordY = boundTextCoords.y;
      }
      const maxHeight = getBoundTextMaxHeight(container, boundText);

      if (isStickyNoteElement(container)) {
        // the note's fit owns its height; the editor mirrors the label's place
        const { x, y } = computeBoundTextPosition(container, boundText, elementsMap);
        coordX = x;
        coordY = y;
      } else {
        const propertiesUpdated = textPropertiesUpdated(updatedTextElement);
        const originalContainerData = propertiesUpdated
          ? updateOriginalContainerCache(container.id, container.height)
          : (originalContainerCache[container.id] ??
            updateOriginalContainerCache(container.id, container.height));

        if (!isArrowElement(container) && height > maxHeight) {
          // the container grows with its text
          editor.scene.mutateElement(container, {
            height: computeContainerDimensionForBoundText(height, container.type),
          });
          updateBoundElements(container, editor.scene, {
            renderEnvironment: editor.renderEnvironment,
          });
          return;
        } else if (
          !isArrowElement(container) &&
          container.height > originalContainerData.height &&
          height < maxHeight
        ) {
          // and shrinks back, as far as its height before the edit
          editor.scene.mutateElement(container, {
            height: computeContainerDimensionForBoundText(height, container.type),
          });
          updateBoundElements(container, editor.scene, {
            renderEnvironment: editor.renderEnvironment,
          });
        } else {
          const { x, y } = computeBoundTextPosition(container, boundText, elementsMap);
          coordX = x;
          coordY = y;
        }
      }
    }
    const angle = getTextElementAngle(updatedTextElement, container);

    if (container) {
      width += 0.5;
    }
    // a 5% buffer, or the textarea jumps
    height *= 1.05;

    const font = getFontString(updatedTextElement);
    const { editorWidth, transform } = getEditorPlacement({
      x: coordX,
      y: coordY,
      textWidth: updatedTextElement.width,
      textHeight: updatedTextElement.height,
      boxWidth: width,
      wraps: !!container || !updatedTextElement.autoResize,
      textAlign,
      angle,
      zoom: appState.zoom.value,
      getViewportCoords,
    });

    // a free text that stopped growing at the viewport's width wraps from
    // then on, and so does its editor
    if (!updatedTextElement.autoResize && editable.style.whiteSpace !== "pre-wrap") {
      editable.style.whiteSpace = "pre-wrap";
      editable.style.wordBreak = "break-word";
    }
    // and no longer once it grows with its content again
    if (!container && updatedTextElement.autoResize && editable.style.whiteSpace !== "pre") {
      editable.style.whiteSpace = "pre";
      editable.style.wordBreak = "normal";
    }

    Object.assign(editable.style, {
      font,
      // after `font`, which resets it
      lineHeight: String(updatedTextElement.lineHeight),
      width: `${editorWidth}px`,
      height: `${height}px`,
      transformOrigin: "0 0",
      transform,
      textAlign,
      verticalAlign,
      color: applyDarkModeFilter(updatedTextElement.strokeColor, appState.theme === THEME.DARK),
      opacity: String(updatedTextElement.opacity / 100),
    });
    // a DOM without a CSS font parser (happy-dom) leaves the family unset
    // by the shorthand; the browser sets the same value
    editable.style.fontFamily = getFontFamilyString(updatedTextElement);
    editable.style.fontSize = `${updatedTextElement.fontSize}px`;
    currentTextLayout = {
      angle: angle as Radians,
      font,
      height: updatedTextElement.height,
      lineHeightPx: getLineHeightInPx(updatedTextElement.fontSize, updatedTextElement.lineHeight),
      textAlign,
      width: updatedTextElement.width,
      x: coordX,
      y: coordY,
    };
    // glyphs reaching past their lines: the box grows to its text rather
    // than scrolling it, which would shift the other lines
    if (editable.scrollHeight > editable.clientHeight) {
      editable.style.height = `${editable.scrollHeight}px`;
    }
    editable.scrollTop = 0;

    editor.scene.mutateElement(updatedTextElement, { x: coordX, y: coordY });
  };

  editable.dir = "auto";
  editable.tabIndex = 0;
  editable.dataset.type = "wysiwyg";
  // no line wrapping on Safari
  editable.wrap = "off";
  editable.spellcheck = false;

  let whiteSpace = "pre";
  let wordBreak = "normal";
  if (isBoundToContainer(element) || !element.autoResize) {
    whiteSpace = "pre-wrap";
    wordBreak = "break-word";
  }
  Object.assign(editable.style, {
    position: "absolute",
    // placed by its transform instead
    left: "0",
    top: "0",
    display: "inline-block",
    minHeight: "1em",
    backfaceVisibility: "hidden",
    margin: "0",
    padding: "0",
    border: "0",
    outline: "0",
    resize: "none",
    background: "transparent",
    overflow: "hidden",
    wordBreak,
    // `white-space: nowrap` does not stop wrapping on Firefox
    whiteSpace,
    overflowWrap: "break-word",
    boxSizing: "content-box",
  });
  editable.value = element.originalText;
  updateWysiwygStyle();

  const getCaretIndexFromInitialSceneCoords = (): number | null => {
    if (!initialCaretSceneCoords || !currentTextLayout) {
      return null;
    }
    const layout = currentTextLayout;
    const center = pointFrom(layout.x + layout.width / 2, layout.y + layout.height / 2);
    const [unrotatedX, unrotatedY] = pointRotateRads(
      pointFrom(initialCaretSceneCoords.x, initialCaretSceneCoords.y),
      center,
      (layout.angle * -1) as Radians,
    );
    const localX = unrotatedX - layout.x;
    const localY = unrotatedY - layout.y;
    const lines = getWrappedTextLines(
      editable.value,
      layout.font,
      whiteSpace === "pre-wrap" ? layout.width : Infinity,
      editor.renderEnvironment,
    );
    const lineIndex = Math.max(
      0,
      Math.min(lines.length - 1, Math.floor(localY / layout.lineHeightPx)),
    );
    const line = lines[lineIndex];
    if (!line) {
      return null;
    }
    if (!line.text) {
      return line.start;
    }
    const direction = getLineDirection(editable.value, line.start);
    const lineWidth = getLineWidth(line.text, layout.font, editor.renderEnvironment);
    const lineStartX =
      layout.textAlign === "center"
        ? (layout.width - lineWidth) / 2
        : layout.textAlign === "right"
          ? layout.width - lineWidth
          : 0;
    const relativeX = localX - lineStartX;
    const lineCaretOffset =
      getLineCaretOffsetFromNativeLayout({
        text: line.text,
        font: layout.font,
        lineHeightPx: layout.lineHeightPx,
        direction,
        targetX: relativeX,
        ownerDocument,
      }) ?? estimateCaretOffset(line.text, relativeX, lineWidth, direction);
    return line.start + lineCaretOffset;
  };

  /**
   * Without a layout to ask (a DOM that lays nothing out), the caret offset
   * closest to `x` by measured advances, mirrored on a right-to-left line.
   */
  const estimateCaretOffset = (
    text: string,
    x: number,
    lineWidth: number,
    direction: "ltr" | "rtl",
  ): number => {
    const layout = currentTextLayout;
    if (!layout) {
      return 0;
    }
    const target = direction === "rtl" ? lineWidth - x : x;
    const offsets = getCaretBoundaryOffsets(text);
    let closest = 0;
    let closestDistance = Infinity;
    for (const offset of offsets) {
      const distance = Math.abs(
        getLineWidth(text.slice(0, offset), layout.font, editor.renderEnvironment) - target,
      );
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = offset;
      }
    }
    return closest;
  };

  /** Where the caret is in the box's coordinates: the bounds of its line-high stroke. */
  const getCaretViewportBounds = () => {
    const layout = currentTextLayout;
    if (!layout) {
      return null;
    }
    const { value } = editable;
    const caret =
      editable.selectionDirection === "backward" ? editable.selectionStart : editable.selectionEnd;
    const lines = getWrappedTextLines(
      value,
      layout.font,
      editable.style.whiteSpace === "pre-wrap" ? layout.width : Infinity,
      editor.renderEnvironment,
    );
    // at a soft break, the caret shows at the start of the next line
    const lineIndex = Math.max(
      0,
      lines.findLastIndex((line) => line.start <= caret),
    );
    const line = lines[lineIndex];
    if (!line) {
      return null;
    }
    const lineWidth = getLineWidth(line.text, layout.font, editor.renderEnvironment);
    const lineStartX =
      layout.textAlign === "center"
        ? (layout.width - lineWidth) / 2
        : layout.textAlign === "right"
          ? layout.width - lineWidth
          : 0;
    const lineText = value.slice(line.start, line.end);
    const offset = Math.min(caret, line.end) - line.start;
    const widthBefore = getLineWidth(
      lineText.slice(0, offset),
      layout.font,
      editor.renderEnvironment,
    );
    // `dir="auto"` lays each paragraph out its first strong character's way
    const direction = getLineDirection(value, line.start);
    const nativeX = hasRTLChars(lineText)
      ? getLineCaretXFromNativeLayout({
          text: lineText,
          font: layout.font,
          lineHeightPx: layout.lineHeightPx,
          direction,
          ownerDocument,
          offset,
        })
      : null;
    const caretX =
      lineStartX + (nativeX ?? (direction === "rtl" ? lineWidth - widthBefore : widthBefore));
    const center = pointFrom(layout.x + layout.width / 2, layout.y + layout.height / 2);
    const [[x1, y1], [x2, y2]] = [lineIndex, lineIndex + 1].map((index) => {
      const [x, y] = pointRotateRads(
        pointFrom(layout.x + caretX, layout.y + index * layout.lineHeightPx),
        center,
        layout.angle,
      );
      return getViewportCoords(x, y);
    }) as [[number, number], [number, number]];
    return {
      left: Math.min(x1, x2),
      right: Math.max(x1, x2),
      top: Math.min(y1, y2),
      bottom: Math.max(y1, y2),
    };
  };

  /** A zoom from the keyboard keeps the caret (or the canvas' nearest point to it) where it is. */
  const getCaretZoomAnchor = (): ZoomAnchor | null => {
    const caret = getCaretViewportBounds();
    if (!caret) {
      return null;
    }
    const { width, height, offsetLeft, offsetTop } = editor.state;
    return {
      viewportX: clampNumber((caret.left + caret.right) / 2, 0, width) + offsetLeft,
      viewportY: clampNumber((caret.top + caret.bottom) / 2, 0, height) + offsetTop,
    };
  };

  let pendingInitialSelection =
    initialSelection ??
    (() => {
      const caretIndex = getCaretIndexFromInitialSceneCoords();
      return caretIndex === null ? null : { start: caretIndex, end: caretIndex };
    })();

  const insertAtSelection = (text: string): void => {
    const { selectionStart, selectionEnd, value } = editable;
    editable.value = value.slice(0, selectionStart) + text + value.slice(selectionEnd);
    const newPos = selectionStart + text.length;
    editable.selectionStart = editable.selectionEnd = newPos;
    editable.dispatchEvent(new ownerWindow.Event("input"));
  };

  const onPaste = async (event: ClipboardEvent): Promise<void> => {
    // the types are read in the event's task, to cancel it there
    const mimeTypes = parseDataTransferEventMimeTypes(event);
    let dataList: ParsedDataTranferList | null = null;

    // elements copied from a diagram paste as their text only
    if (mimeTypes.has(MIME_TYPES.excalidrawClipboard) || mimeTypes.has(MIME_TYPES.excalidraw)) {
      event.preventDefault();
      dataList = await parseDataTransferEvent(event);
      try {
        const parsed = await parseClipboard(dataList);
        if (parsed.elements) {
          const text = getTextFromElements(parsed.elements);
          if (text) {
            insertAtSelection(text);
          }
        }
        // elements without text paste nothing
        return;
      } catch {
        console.warn("DiagramEditor: the pasted elements could not be read");
      }
    }

    dataList = dataList ?? (await parseDataTransferEvent(event));
    const textItem = dataList.findByType(MIME_TYPES.text);
    if (!textItem) {
      return;
    }
    const text = normalizeText(textItem.value);
    if (!text) {
      return;
    }
    const container = getContainerElement(element, editor.scene.getNonDeletedElementsMap());
    if (container) {
      // the textarea widens to the pasted text before the input arrives
      const boundTextElement = getBoundTextElement(
        container,
        editor.scene.getNonDeletedElementsMap(),
      );
      const sticky = isStickyNoteElement(container) && boundTextElement;
      const font = getFontString({
        fontSize: sticky ? boundTextElement.fontSize : editor.state.currentItemFontSize,
        fontFamily: sticky ? boundTextElement.fontFamily : editor.state.currentItemFontFamily,
      });
      const maxWidth = getBoundTextMaxWidth(container, boundTextElement);
      const { selectionStart, selectionEnd, value } = editable;
      const nextText = value.slice(0, selectionStart) + text + value.slice(selectionEnd);
      const wrappedText = wrapText(nextText, font, maxWidth, editor.renderEnvironment);
      const width = Math.min(getTextWidth(wrappedText, font, editor.renderEnvironment), maxWidth);
      editable.style.width = `${width}px`;
    }
  };

  const onPasteEvent = (event: ClipboardEvent): void => void onPaste(event);

  const onInput = (): void => {
    followsScene = false;
    const normalized = normalizeText(editable.value);
    if (editable.value !== normalized) {
      const selectionStart = editable.selectionStart;
      editable.value = normalized;
      // the caret near where it was, not at the end
      editable.selectionStart = selectionStart;
      editable.selectionEnd = selectionStart;
    }
    editor.batch(() => onChange(editable.value));
  };

  const runAction = <T>(fn: () => T): T => editor.batch(fn);

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!event.shiftKey && actionZoomIn.keyTest?.(event, editor.state, [], editor)) {
      event.preventDefault();
      runAction(() => editor.actionManager.executeAction(actionZoomIn, getCaretZoomAnchor()));
      updateWysiwygStyle();
    } else if (!event.shiftKey && actionZoomOut.keyTest?.(event, editor.state, [], editor)) {
      event.preventDefault();
      runAction(() => editor.actionManager.executeAction(actionZoomOut, getCaretZoomAnchor()));
      updateWysiwygStyle();
    } else if (!event.shiftKey && actionResetZoom.keyTest?.(event, editor.state, [], editor)) {
      event.preventDefault();
      runAction(() => editor.actionManager.executeAction(actionResetZoom, getCaretZoomAnchor()));
      updateWysiwygStyle();
    } else if (isTextAutoResizeShortcut(event) && !isBoundToContainer(element)) {
      event.preventDefault();
      // not the canvas', which acts on the selection
      event.stopPropagation();
      const latest = editor.scene.getElement(element.id);
      runAction(() => editor.actionManager.executeAction(actionTextAutoResize, latest ?? null));
    } else if (actionDecreaseFontSize.keyTest?.(event, editor.state, [], editor)) {
      runAction(() => editor.actionManager.executeAction(actionDecreaseFontSize));
    } else if (actionIncreaseFontSize.keyTest?.(event, editor.state, [], editor)) {
      runAction(() => editor.actionManager.executeAction(actionIncreaseFontSize));
    } else if (event.key === KEYS.ESCAPE) {
      event.preventDefault();
      submittedViaKeyboard = true;
      handleSubmit();
    } else if (event.key === KEYS.ENTER && event[KEYS.CTRL_OR_CMD]) {
      event.preventDefault();
      // an IME candidate is being confirmed
      if (event.isComposing || event.keyCode === 229) {
        return;
      }
      submittedViaKeyboard = true;
      handleSubmit();
    } else if (
      event.key === KEYS.TAB ||
      (event[KEYS.CTRL_OR_CMD] &&
        (event.code === CODES.BRACKET_LEFT || event.code === CODES.BRACKET_RIGHT))
    ) {
      event.preventDefault();
      if (event.isComposing) {
        return;
      } else if (event.shiftKey || event.code === CODES.BRACKET_LEFT) {
        outdent();
      } else {
        indent();
      }
      // the input resizes the element
      editable.dispatchEvent(new ownerWindow.Event("input"));
    }
  };

  const TAB_SIZE = 4;
  const TAB = " ".repeat(TAB_SIZE);
  const RE_LEADING_TAB = new RegExp(`^ {1,${TAB_SIZE}}`);

  /** Where the selected lines start, last first. */
  const getSelectedLinesStartIndices = (): number[] => {
    const { selectionEnd, value } = editable;
    let { selectionStart } = editable;
    const startOffset = /[^\n]*$/.exec(value.slice(0, selectionStart))?.[0].length ?? 0;
    selectionStart -= startOffset;
    const selected = value.slice(selectionStart, selectionEnd);
    const lines = selected.split("\n");
    const starts: number[] = [];
    for (const index of lines.keys()) {
      const previous = starts[index - 1];
      starts.push(
        index === 0 || previous === undefined
          ? selectionStart
          : previous + (lines[index - 1]?.length ?? 0) + 1,
      );
    }
    return starts.toReversed();
  };

  const indent = (): void => {
    const { selectionStart, selectionEnd } = editable;
    const linesStartIndices = getSelectedLinesStartIndices();
    let value = editable.value;
    for (const startIndex of linesStartIndices) {
      value = `${value.slice(0, startIndex)}${TAB}${value.slice(startIndex)}`;
    }
    editable.value = value;
    editable.selectionStart = selectionStart + TAB_SIZE;
    editable.selectionEnd = selectionEnd + TAB_SIZE * linesStartIndices.length;
  };

  const outdent = (): void => {
    const { selectionStart, selectionEnd } = editable;
    const linesStartIndices = getSelectedLinesStartIndices();
    const removedTabs: number[] = [];
    let value = editable.value;
    for (const startIndex of linesStartIndices) {
      const tabMatch = RE_LEADING_TAB.exec(value.slice(startIndex, startIndex + TAB_SIZE));
      if (tabMatch) {
        value = `${value.slice(0, startIndex)}${value.slice(startIndex + tabMatch[0].length)}`;
        removedTabs.push(startIndex);
      }
    }
    editable.value = value;
    const lastRemoved = removedTabs[removedTabs.length - 1];
    if (lastRemoved !== undefined) {
      editable.selectionStart =
        selectionStart > lastRemoved
          ? Math.max(selectionStart - TAB_SIZE, lastRemoved)
          : selectionStart;
      editable.selectionEnd = Math.max(
        editable.selectionStart,
        selectionEnd - TAB_SIZE * removedTabs.length,
      );
    }
  };

  const stopEvent = (event: Event): void => {
    if (event.target instanceof ownerWindow.HTMLCanvasElement) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  // what submits says whether it was the keyboard, without a callback each
  let submittedViaKeyboard = false;
  const handleSubmit = (): void => {
    if (isDestroyed) {
      return;
    }
    isDestroyed = true;
    // before onSubmit: the editor taking focus back would blur the textarea
    // into submitting again
    cleanup();
    if (editor.isDestroyed) {
      return;
    }
    editor.batch(() => {
      const updateElement = editor.scene.getElement<ExcalidrawTextElement>(element.id);
      // deleted from under the edit: the edit still ends, and writes nothing
      const container =
        updateElement && !updateElement.isDeleted
          ? getContainerElement(updateElement, editor.scene.getNonDeletedElementsMap())
          : null;

      if (updateElement && container) {
        if (editable.value.trim()) {
          const boundTextElementId = getBoundTextElementId(container);
          if (!boundTextElementId || boundTextElementId !== element.id) {
            editor.scene.mutateElement(container, {
              boundElements: (container.boundElements ?? []).concat({
                type: "text",
                id: element.id,
              }),
            });
          } else if (isArrowElement(container)) {
            // a label may change the arrow's bounds: no stale cache
            bumpVersion(container);
          }
        } else {
          editor.scene.mutateElement(container, {
            boundElements: container.boundElements?.filter((bound) => bound.type !== "text"),
          });
        }
        redrawTextBoundingBox(updateElement, container, editor.scene, editor.renderEnvironment);
      }

      onSubmit({ viaKeyboard: submittedViaKeyboard, nextOriginalText: editable.value });
    });
  };

  // The textarea blurs too when the window does (switching tabs or apps): it
  // stays the active element then, and the edit goes on. Only focus moving
  // elsewhere in the document submits.
  // whether a blur submits: not while a press that keeps the edit is under way
  let blurSubmits = false;
  const onEditableBlur = (): void => {
    if (blurSubmits) {
      handleBlur();
    }
  };

  const handleBlur = (): void => {
    if (ownerDocument.activeElement !== editable) {
      handleSubmit();
      return;
    }
    // nobody types while the window is away
    followsScene = true;
  };

  // the window lost focus while submit was held for a press whose pointer up
  // may never come
  const onWindowBlur = (): void => {
    ownerWindow.removeEventListener("blur", onWindowBlur);
    ownerWindow.removeEventListener("pointerup", bindBlurEvent);
    blurSubmits = true;
    handleBlur();
  };

  const cleanup = (): void => {
    editor.cursor.reset();
    blurSubmits = false;
    editable.removeEventListener("input", onInput);
    editable.removeEventListener("keydown", onKeyDown);
    editable.removeEventListener("paste", onPasteEvent);
    editable.removeEventListener("pointerdown", stopPointerDown);
    editable.removeEventListener("blur", onEditableBlur);
    editable.removeEventListener("pointermove", onEditablePointerMove);
    observer?.disconnect();
    ownerWindow.removeEventListener("resize", updateWysiwygStyle);
    ownerWindow.removeEventListener("wheel", stopEvent, true);
    ownerWindow.removeEventListener("pointerdown", onPointerDown, { capture: true });
    ownerWindow.removeEventListener("pointerup", bindBlurEvent);
    ownerWindow.removeEventListener("blur", onWindowBlur);
    ownerWindow.removeEventListener("beforeunload", handleSubmit);
    if (pointerDownFrame !== null) {
      ownerWindow.cancelAnimationFrame(pointerDownFrame);
    }
    unbindUpdate();
    unsubOnChange();
    editorBox?.removeEventListener("scroll", onEditorBoxScroll);
  };

  const bindBlurEvent = (): void => {
    ownerWindow.removeEventListener("pointerup", bindBlurEvent);
    // deferred, so that the press that opened the editor does not blur it on
    // its pointer up
    ownerWindow.setTimeout(() => {
      if (isDestroyed) {
        return;
      }
      blurSubmits = true;
      // never let the focus scroll the box: the caret it has until the
      // initial one is placed (the end) would pan the canvas there
      editable.focus({ preventScroll: true });
      if (pendingInitialSelection) {
        editable.setSelectionRange(pendingInitialSelection.start, pendingInitialSelection.end);
        pendingInitialSelection = null;
      }
    });
  };

  const temporarilyDisableSubmit = (): void => {
    blurSubmits = false;
    ownerWindow.addEventListener("pointerup", bindBlurEvent);
    // the pointer up may not come (alt-tabbing away)
    ownerWindow.addEventListener("blur", onWindowBlur);
  };

  let pointerDownFrame: number | null = null;

  const onPointerDown = (event: PointerEvent): void => {
    const target = event.target;
    if (event.button === POINTER_BUTTON.WHEEL) {
      // before the pan, whose focus on the container would blur the editor
      temporarilyDisableSubmit();
      if (target instanceof ownerWindow.HTMLTextAreaElement) {
        event.preventDefault();
        editor.batch(() => editor.startPan(event));
      }
      return;
    }

    // alt-drag on the text being edited duplicates it, as on the canvas:
    // the edit ends keeping the text selected, and the canvas takes the press
    if (
      event.altKey &&
      !event[KEYS.CTRL_OR_CMD] &&
      event.button === POINTER_BUTTON.MAIN &&
      target === editable &&
      (editor.state.activeTool.type === "selection" || editor.state.activeTool.type === "lasso")
    ) {
      event.preventDefault();
      event.stopPropagation();
      submittedViaKeyboard = true;
      handleSubmit();
      editor.batch(() => editor.handOverTextEditorPress(event, element.id));
      return;
    }

    // the auto-resize toggle on the edited text's box unwraps it, the edit
    // going on
    if (
      event.button === POINTER_BUTTON.MAIN &&
      target instanceof ownerWindow.HTMLCanvasElement &&
      editor.batch(() =>
        editor.text.handleTextAutoResizeHandlePointerDown(
          editor.scene.getSelectedElements(editor.state),
          viewportCoordsToSceneCoords(event, editor.state),
          editor.scene.getElement(element.id),
        ),
      )
    ) {
      event.preventDefault();
      event.stopPropagation();
      temporarilyDisableSubmit();
      return;
    }

    // dragging a side of the edited text changes where it wraps, the edit
    // going on; a click there still submits
    if (
      event.button === POINTER_BUTTON.MAIN &&
      target instanceof ownerWindow.HTMLCanvasElement &&
      editor.batch(() => editor.text.resizeEditedTextOnPointerDown(event, handleSubmit))
    ) {
      event.preventDefault();
      event.stopPropagation();
      temporarilyDisableSubmit();
      return;
    }

    if (
      target instanceof ownerWindow.Element &&
      target.closest("[data-diagram-keeps-text-editing]") &&
      !(target instanceof ownerWindow.HTMLInputElement) &&
      !(target instanceof ownerWindow.HTMLTextAreaElement)
    ) {
      // a properties control of the host's: the edit goes on
      temporarilyDisableSubmit();
    } else if (target instanceof ownerWindow.HTMLCanvasElement) {
      // on touch the blur does not always come: a press on the canvas
      // submits too, a frame later, so that a locked tool's press does not
      // open the next text before the keyboard hides
      pointerDownFrame = ownerWindow.requestAnimationFrame(() => {
        pointerDownFrame = null;
        handleSubmit();
      });
    }
  };

  // the theme changes without the text
  const unsubOnChange = editor.onChange((_elements, appState) => {
    const viewport = `${appState.scrollX}|${appState.scrollY}|${appState.zoom.value}|${appState.offsetLeft}|${appState.offsetTop}`;
    if (appState.theme !== lastTheme || viewport !== lastViewport) {
      lastViewport = viewport;
      updateWysiwygStyle();
    }
  });

  // the edited element changing from elsewhere
  const unbindUpdate = editor.scene.onUpdate(() => {
    const latestElement = editor.scene.getElement(element.id);
    if (!latestElement || latestElement.isDeleted) {
      // gone under the edit (a sync, a host's update): so is the editor, once
      // the update under way is done, unless it brought the text back
      queueMicrotask(() => {
        const currentElement = editor.scene.getElement(element.id);
        if (!currentElement || currentElement.isDeleted) {
          handleSubmit();
        }
      });
      return;
    }
    // until the user types, the editor shows the scene's text; setting the
    // value fires no input, so nothing is written back
    if (followsScene && isTextElement(latestElement)) {
      const nextValue = normalizeText(latestElement.originalText);
      if (nextValue !== editable.value) {
        const { selectionStart, selectionEnd } = editable;
        editable.value = nextValue;
        editable.setSelectionRange(
          Math.min(selectionStart, nextValue.length),
          Math.min(selectionEnd, nextValue.length),
        );
      }
    }
    updateWysiwygStyle();
    if (!ownerDocument.activeElement?.closest("[data-diagram-keeps-text-editing]")) {
      editable.focus({ preventScroll: true });
    }
  });

  // The browser reveals an out-of-view caret by scrolling the box the
  // textarea is in, which would take the textarea off its text: the offset
  // goes to the canvas instead, with room to spare, and the box goes back.
  const onEditorBoxScroll = (): void => {
    if (!editorBox) {
      return;
    }
    const { scrollLeft, scrollTop } = editorBox;
    if (!scrollLeft && !scrollTop) {
      return;
    }
    editorBox.scrollLeft = 0;
    editorBox.scrollTop = 0;
    const panX = scrollLeft && scrollLeft + CARET_FOLLOW_PADDING;
    const panY = scrollTop && scrollTop + CARET_FOLLOW_PADDING;
    editor.batch(() =>
      editor.translateViewport((state) => ({
        scrollX: state.scrollX - panX / state.zoom.value,
        scrollY: state.scrollY - panY / state.zoom.value,
      })),
    );
  };
  editorBox?.addEventListener("scroll", onEditorBoxScroll);

  let isDestroyed = false;
  // whether the editor takes the scene's text when it changes from elsewhere;
  // typing makes the text the user's draft until it is submitted
  let followsScene = true;

  if (autoSelect && !pendingInitialSelection) {
    // focus follows in bindBlurEvent, after the press' own blur
    editable.select();
  }
  bindBlurEvent();

  // the canvas resizing moves the text
  let observer: ResizeObserver | null = null;
  if (typeof ownerWindow.ResizeObserver === "function") {
    observer = new ownerWindow.ResizeObserver(() => updateWysiwygStyle());
    observer.observe(editor.canvas);
  } else {
    ownerWindow.addEventListener("resize", updateWysiwygStyle);
  }

  const stopPointerDown = (event: PointerEvent): void => event.stopPropagation();
  editable.addEventListener("pointerdown", stopPointerDown);
  editable.addEventListener("paste", onPasteEvent);
  editable.addEventListener("input", onInput);
  editable.addEventListener("keydown", onKeyDown);
  editable.addEventListener("blur", onEditableBlur);
  // the cursor the canvas will have once the pointer leaves the textarea
  const onEditablePointerMove = (event: PointerEvent): void =>
    editor.text.primeCursorAroundEditedText(viewportCoordsToSceneCoords(event, editor.state));
  editable.addEventListener("pointermove", onEditablePointerMove);

  // a frame later, and in the capture phase: not the press that opened it
  ownerWindow.requestAnimationFrame(() => {
    if (!isDestroyed) {
      ownerWindow.addEventListener("pointerdown", onPointerDown, { capture: true });
    }
  });
  ownerWindow.addEventListener("beforeunload", handleSubmit);

  return handleSubmit;
};
