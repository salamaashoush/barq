import { FONT_FAMILY, FRAME_STYLE, getFontString, getLineHeight } from "@excalidraw/common";
import {
  getDefaultFrameName,
  isFrameLikeElement,
  isTextElement,
  measureText,
  newTextElement,
} from "@excalidraw/element";

import type { RenderEnvironment } from "@excalidraw/element";
import type {
  ExcalidrawFrameLikeElement,
  ExcalidrawTextElement,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

import type { SearchMatch } from "../types.ts";

export interface MatchPreview {
  indexInSearchQuery: number;
  previewText: string;
  moreBefore: boolean;
  moreAfter: boolean;
}

/** One match of the search on the canvas, Excalidraw's `SearchMatchItem`. */
export interface SearchMatchItem {
  element: ExcalidrawTextElement | ExcalidrawFrameLikeElement;
  searchQuery: string;
  /** Where the match starts in the element's text. */
  index: number;
  preview: MatchPreview;
  matchedLines: SearchMatch["matchedLines"];
}

/** The words around a match, as the search's result list shows them. */
export function getMatchPreview(
  text: string,
  index: number,
  searchQuery: string,
): SearchMatchItem["preview"] {
  const WORDS_BEFORE = 2;
  const WORDS_AFTER = 5;
  const MAX_ALLOWED_CHARS = 20;

  const substrBeforeQuery = text.slice(0, index);
  const wordsBeforeQuery = substrBeforeQuery.split(/\s+/);
  const isQueryCompleteBefore = substrBeforeQuery.endsWith(" ");
  const startWordIndex =
    wordsBeforeQuery.length - WORDS_BEFORE - 1 - (isQueryCompleteBefore ? 0 : 1);
  let wordsBeforeAsString =
    wordsBeforeQuery.slice(startWordIndex <= 0 ? 0 : startWordIndex).join(" ") +
    (isQueryCompleteBefore ? " " : "");
  wordsBeforeAsString =
    wordsBeforeAsString.length > MAX_ALLOWED_CHARS
      ? wordsBeforeAsString.slice(-MAX_ALLOWED_CHARS)
      : wordsBeforeAsString;

  const substrAfterQuery = text.slice(index + searchQuery.length);
  const wordsAfter = substrAfterQuery.split(/\s+/);
  const isQueryCompleteAfter = !substrAfterQuery.startsWith(" ");
  const numberOfWordsToTake = isQueryCompleteAfter ? WORDS_AFTER + 1 : WORDS_AFTER;
  const wordsAfterAsString =
    (isQueryCompleteAfter ? "" : " ") + wordsAfter.slice(0, numberOfWordsToTake).join(" ");

  return {
    indexInSearchQuery: wordsBeforeAsString.length,
    // the match as written, which the query may differ from in case
    previewText:
      wordsBeforeAsString + text.slice(index, index + searchQuery.length) + wordsAfterAsString,
    moreBefore: startWordIndex > 0,
    moreAfter: wordsAfter.length > numberOfWordsToTake,
  };
}

/** The wrapped text with the spaces wrapping took out put back, so its offsets match the original's. */
function normalizeWrappedText(wrappedText: string, originalText: string): string {
  const wrappedLines = wrappedText.split("\n");
  const normalizedLines: string[] = [];
  let originalIndex = 0;
  for (let i = 0; i < wrappedLines.length; i++) {
    let currentLine = wrappedLines[i] ?? "";
    const nextLine = wrappedLines[i + 1];
    if (nextLine) {
      const nextLineIndexInOriginal = originalText.indexOf(nextLine, originalIndex);
      if (nextLineIndexInOriginal > currentLine.length + originalIndex) {
        currentLine += " ".repeat(nextLineIndexInOriginal - (currentLine.length + originalIndex));
      }
    }
    normalizedLines.push(currentLine);
    originalIndex += currentLine.length;
  }
  return normalizedLines.join("\n");
}

interface LineIndexRange {
  line: string;
  startIndex: number;
  endIndex: number;
  lineNumber: number;
}

/** Where a match in a text element sits, line by line, from the element's corner. */
function getMatchedLines(
  textElement: ExcalidrawTextElement,
  searchQuery: string,
  index: number,
  renderEnvironment?: RenderEnvironment,
): SearchMatch["matchedLines"] {
  const lines = normalizeWrappedText(textElement.text, textElement.originalText).split("\n");
  const lineIndexRanges: LineIndexRange[] = [];
  let currentIndex = 0;
  let lineNumber = 0;
  for (const line of lines) {
    const startIndex = currentIndex;
    const endIndex = startIndex + line.length - 1;
    lineIndexRanges.push({ line, startIndex, endIndex, lineNumber });
    currentIndex = endIndex + 1;
    lineNumber++;
  }

  let startIndex = index;
  let remainingQuery = textElement.originalText.slice(index, index + searchQuery.length);
  const matchedLines: SearchMatch["matchedLines"][number][] = [];
  const font = getFontString(textElement);

  for (const range of lineIndexRanges) {
    if (remainingQuery === "") break;
    if (startIndex >= range.startIndex && startIndex <= range.endIndex) {
      const matchCapacity = range.endIndex + 1 - startIndex;
      const textToStart = range.line.slice(0, startIndex - range.startIndex);
      const matchedWord = remainingQuery.slice(0, matchCapacity);
      remainingQuery = remainingQuery.slice(matchCapacity);

      const offset = measureText(textToStart, font, textElement.lineHeight, renderEnvironment);
      // the empty string measures wider than nothing
      if (textToStart === "") {
        offset.width = 0;
      }
      if (textElement.textAlign !== "left" && range.line.length > 0) {
        const lineLength = measureText(range.line, font, textElement.lineHeight, renderEnvironment);
        offset.width +=
          textElement.textAlign === "center"
            ? (textElement.width - lineLength.width) / 2
            : textElement.width - lineLength.width;
      }
      const { width, height } = measureText(
        matchedWord,
        font,
        textElement.lineHeight,
        renderEnvironment,
      );
      matchedLines.push({
        offsetX: offset.width,
        offsetY: range.lineNumber * offset.height,
        width,
        height,
        showOnCanvas: true,
      });
      startIndex += matchCapacity;
    }
  }
  return matchedLines;
}

/** Where a match in a frame's name sits, above the frame, at the zoom it is drawn at. */
function getMatchInFrame(
  frame: ExcalidrawFrameLikeElement,
  searchQuery: string,
  index: number,
  zoomValue: number,
  renderEnvironment?: RenderEnvironment,
): SearchMatch["matchedLines"] {
  const text = frame.name ?? getDefaultFrameName(frame);
  const matchedText = text.slice(index, index + searchQuery.length);
  const prefixText = text.slice(0, index);
  const font = getFontString({
    fontSize: FRAME_STYLE.nameFontSize,
    fontFamily: FONT_FAMILY.Assistant,
  });
  const lineHeight = getLineHeight(FONT_FAMILY.Assistant);
  const offset = measureText(prefixText, font, lineHeight, renderEnvironment);
  if (prefixText === "") {
    offset.width = 0;
  }
  const matchedMetrics = measureText(matchedText, font, lineHeight, renderEnvironment);
  const offsetX = offset.width;
  const width = matchedMetrics.width;
  return [
    {
      offsetX,
      offsetY: -offset.height - FRAME_STYLE.strokeWidth,
      width,
      height: matchedMetrics.height,
      showOnCanvas: offsetX + width <= frame.width * zoomValue,
    },
  ];
}

function escapeSpecialCharacters(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
}

export interface SearchSceneOptions {
  zoom: number;
  visibleIds: ReadonlySet<string>;
  renderEnvironment?: RenderEnvironment;
}

export interface SearchSceneResult {
  matches: SearchMatchItem[];
  focusIndex: number | null;
}

/**
 * Every match of `searchQuery` on the canvas, case-insensitive: frames' names
 * first, then texts, each top to bottom. `focusIndex` is the first match in
 * view, which the search starts from.
 */
export function searchScene(
  searchQuery: string,
  elements: readonly NonDeletedExcalidrawElement[],
  opts: SearchSceneOptions,
): SearchSceneResult {
  if (!searchQuery) {
    return { matches: [], focusIndex: null };
  }
  const texts = elements.filter(isTextElement).toSorted((a, b) => a.y - b.y);
  const frames = elements.filter(isFrameLikeElement).toSorted((a, b) => a.y - b.y);
  const regex = new RegExp(escapeSpecialCharacters(searchQuery), "gi");

  const textMatches: SearchMatchItem[] = [];
  for (const textElement of texts) {
    const text = textElement.originalText;
    for (const match of text.matchAll(regex)) {
      const matchedLines = getMatchedLines(
        textElement,
        searchQuery,
        match.index,
        opts.renderEnvironment,
      );
      if (matchedLines.length > 0) {
        textMatches.push({
          element: textElement,
          searchQuery,
          preview: getMatchPreview(text, match.index, searchQuery),
          index: match.index,
          matchedLines,
        });
      }
    }
  }

  const frameMatches: SearchMatchItem[] = [];
  for (const frame of frames) {
    const name = frame.name ?? getDefaultFrameName(frame);
    for (const match of name.matchAll(regex)) {
      const matchedLines = getMatchInFrame(
        frame,
        searchQuery,
        match.index,
        opts.zoom,
        opts.renderEnvironment,
      );
      if (matchedLines.length > 0) {
        frameMatches.push({
          element: frame,
          searchQuery,
          preview: getMatchPreview(name, match.index, searchQuery),
          index: match.index,
          matchedLines,
        });
      }
    }
  }

  const matches = [...frameMatches, ...textMatches];
  const focusIndex = matches.findIndex((match) => opts.visibleIds.has(match.element.id));
  return { matches, focusIndex };
}

/** The match as a text element of its own, to bring into view. */
export function matchAsElement(match: SearchMatchItem): ExcalidrawTextElement {
  const [line] = match.matchedLines;
  return newTextElement({
    text: match.searchQuery,
    x: match.element.x + (line?.offsetX ?? 0),
    y: match.element.y + (line?.offsetY ?? 0),
    width: line?.width,
    height: line?.height,
    fontSize: isFrameLikeElement(match.element) ? FRAME_STYLE.nameFontSize : match.element.fontSize,
    fontFamily: isFrameLikeElement(match.element)
      ? FONT_FAMILY.Assistant
      : match.element.fontFamily,
  });
}
