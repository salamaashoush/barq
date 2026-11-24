import {
  DEFAULT_TEXT_ALIGN,
  DEFAULT_VERTICAL_ALIGN,
  getFontString,
  getLineHeight,
  isWritableElement,
  viewportCoordsToSceneCoords,
} from "@excalidraw/common";
import {
  convertToExcalidrawElements,
  getCommonBounds,
  getLineHeightInPx,
  makeNextSelectedElementIds,
  measureText,
  newElementWith,
  newTextElement,
  normalizeText,
  wrapText,
} from "@excalidraw/element";

import type { ExcalidrawElementSkeleton } from "@excalidraw/element";
import type { ExcalidrawElement, ExcalidrawTextElement } from "@excalidraw/element/types";

import { parseClipboard, parseDataTransferEvent } from "../clipboard.ts";
import { SVGStringToFile } from "../data/blob.ts";
import { isMaybeMermaidDefinition, MERMAID_TO_EXCALIDRAW_CONFIG } from "../mermaid-detect.ts";
import { scrollBoundsIntoView } from "../viewport.ts";
import { actionCopy, actionCut } from "./actions/clipboard.ts";
import { imageURLToFile } from "./images.ts";

import type { ClipboardData, ParsedDataTransferFile, PastedMixedContent } from "../clipboard.ts";
import type { BinaryFiles, Offsets } from "../types.ts";
import type { DiagramEditor } from "./editor.ts";

/** A paste with Shift (Ctrl+Shift+V): text as one element, elements without formatting. */
let isPlainPasteFlag = false;
let plainPasteTimer = 0;

/**
 * The clipboard, Excalidraw's `AppClipboard`: cut and copy through their
 * actions, and paste, the data parsed and inserted as what it is: images or
 * SVG code, elements, a Mermaid definition, mixed HTML content, or text.
 */
export class EditorClipboard {
  public constructor(private readonly app: DiagramEditor) {}

  private isEditorActive(): boolean {
    return this.app.container.contains(this.app.ownerDocument.activeElement);
  }

  public onCut = (event: ClipboardEvent): void => {
    if (
      this.app.state.viewModeEnabled ||
      !this.isEditorActive() ||
      isWritableElement(event.target)
    ) {
      return;
    }
    this.app.batch(() => this.app.actionManager.executeAction(actionCut, event));
    event.preventDefault();
    event.stopPropagation();
  };

  public onCopy = (event: ClipboardEvent): void => {
    if (!this.isEditorActive() || isWritableElement(event.target)) {
      return;
    }
    this.app.batch(() => this.app.actionManager.executeAction(actionCopy, event));
    event.preventDefault();
    event.stopPropagation();
  };

  /** Ctrl+V: whether the paste that follows is plain, with Shift. */
  public onPasteShortcut = (event: KeyboardEvent): void => {
    isPlainPasteFlag = event.shiftKey;
    this.app.ownerWindow.clearTimeout(plainPasteTimer);
    // reset once the paste event has come
    plainPasteTimer = this.app.ownerWindow.setTimeout(() => {
      isPlainPasteFlag = false;
    }, 100);
  };

  /** Forgets a pending plain paste, as the editor goes. */
  public clearPlainPaste = (): void => {
    this.app.ownerWindow.clearTimeout(plainPasteTimer);
    plainPasteTimer = 0;
    isPlainPasteFlag = false;
  };

  public pasteFromClipboard = async (event: ClipboardEvent): Promise<void> => {
    const app = this.app;
    if (app.state.viewModeEnabled) {
      return;
    }
    const isPlainPaste = isPlainPasteFlag;
    const target = app.ownerDocument.activeElement;
    if (event.isTrusted && !this.isEditorActive()) {
      return;
    }
    if (event.isTrusted && isWritableElement(target)) {
      return;
    }
    // read in the event's own task: some browsers clear the data after it
    const dataTransferList = await parseDataTransferEvent(event);
    const filesList = dataTransferList.getFiles();
    const data = await parseClipboard(dataTransferList, isPlainPaste);
    if (app.isDestroyed) {
      return;
    }
    await this.insertClipboardContent(data, filesList, isPlainPaste);
    app.batch(() =>
      app.setActiveTool({ type: app.state.preferredSelectionTool.type }, { keepSelection: true }),
    );
    event.preventDefault();
  };

  private getPastePosition(): { x: number; y: number } {
    const { x, y } = this.app.lastViewportPosition;
    return viewportCoordsToSceneCoords({ clientX: x, clientY: y }, this.app.state);
  }

  private async insertClipboardContent(
    data: ClipboardData,
    dataTransferFiles: ParsedDataTransferFile[],
    isPlainPaste: boolean,
  ): Promise<void> {
    const app = this.app;
    const { x: sceneX, y: sceneY } = this.getPastePosition();

    if (data.errorMessage) {
      app.batch(() => app.setState({ errorMessage: data.errorMessage ?? null }));
      return;
    }

    if (dataTransferFiles.length === 0 && !isPlainPaste && data.mixedContent) {
      await this.addElementsFromMixedContentPaste(data.mixedContent, {
        isPlainPaste,
        sceneX,
        sceneY,
      });
      return;
    }

    // images, or SVG code
    const imageFiles = dataTransferFiles.map((file) => file.file);
    if (imageFiles.length === 0 && data.text && !isPlainPaste) {
      const trimmedText = data.text.trim();
      if (trimmedText.startsWith("<svg") && trimmedText.endsWith("</svg>")) {
        imageFiles.push(SVGStringToFile(trimmedText));
      }
    }
    if (imageFiles.length > 0) {
      await app.images.insertImages(imageFiles, sceneX, sceneY);
      return;
    }

    if (data.elements) {
      const elements: readonly ExcalidrawElement[] = data.programmaticAPI
        ? convertToExcalidrawElements(data.elements as ExcalidrawElementSkeleton[], {
            renderEnvironment: app.renderEnvironment,
          })
        : data.elements;
      app.batch(() =>
        app.addElementsFromPasteOrLibrary({
          elements,
          files: data.files ?? null,
          position: app.editorInterface.formFactor === "desktop" ? "cursor" : "center",
          retainSeed: isPlainPaste,
          preserveFrameChildrenOrder: true,
        }),
      );
      return;
    }

    if (!data.text) {
      return;
    }

    if (!isPlainPaste && isMaybeMermaidDefinition(data.text)) {
      try {
        // the converter is an optional peer: without it, the text pastes as text
        const api = await import("@excalidraw/mermaid-to-excalidraw");
        const { elements: skeletonElements, files = {} } = await api.parseMermaidToExcalidraw(
          data.text,
          MERMAID_TO_EXCALIDRAW_CONFIG,
        );
        const elements = convertToExcalidrawElements(skeletonElements, {
          regenerateIds: true,
          renderEnvironment: app.renderEnvironment,
        });
        app.batch(() =>
          app.addElementsFromPasteOrLibrary({
            elements,
            files: files as BinaryFiles,
            position: app.editorInterface.formFactor === "desktop" ? "cursor" : "center",
          }),
        );
        return;
      } catch (error) {
        console.warn(
          `parsing pasted text as mermaid definition failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    app.batch(() => this.addTextFromPaste(data.text ?? "", isPlainPaste));
  }

  private async addElementsFromMixedContentPaste(
    mixedContent: PastedMixedContent,
    { isPlainPaste, sceneX, sceneY }: { isPlainPaste: boolean; sceneX: number; sceneY: number },
  ): Promise<void> {
    if (!isPlainPaste && mixedContent.some((node) => node.type === "imageUrl")) {
      const imageURLs = mixedContent
        .filter((node) => node.type === "imageUrl")
        .map((node) => node.value);
      const responses = await Promise.all(
        imageURLs.map(async (url) => {
          try {
            return { file: await imageURLToFile(url) };
          } catch (error) {
            const cause = error instanceof Error ? error.cause : null;
            return {
              errorMessage:
                cause === "FETCH_ERROR"
                  ? "Couldn't fetch the image."
                  : cause === "UNSUPPORTED"
                    ? "Unsupported file type."
                    : error instanceof Error
                      ? error.message
                      : String(error),
            };
          }
        }),
      );
      const imageFiles = responses.flatMap((response) =>
        "file" in response && response.file ? [response.file] : [],
      );
      await this.app.images.insertImages(imageFiles, sceneX, sceneY);
      const failed = responses.find((response) => "errorMessage" in response);
      if (failed && "errorMessage" in failed) {
        this.app.batch(() => this.app.setState({ errorMessage: failed.errorMessage }));
      }
    } else {
      const textNodes = mixedContent.filter((node) => node.type === "text");
      if (textNodes.length) {
        this.app.batch(() =>
          this.addTextFromPaste(textNodes.map((node) => node.value).join("\n\n"), isPlainPaste),
        );
      }
    }
  }

  /**
   * Pasted text: a text element per line (one with Shift), centred on the
   * pointer, wrapped at the width typed text stops at; wrapped text is moved
   * into view.
   */
  private addTextFromPaste(text: string, isPlainPaste = false): void {
    const app = this.app;
    const { x, y } = this.getPastePosition();
    const textElementProps = {
      x,
      y,
      strokeColor: app.state.currentItemStrokeColor,
      backgroundColor: app.state.currentItemBackgroundColor,
      fillStyle: app.state.currentItemFillStyle,
      strokeWidth: app.getCurrentItemStrokeWidth("text"),
      strokeStyle: app.state.currentItemStrokeStyle,
      roundness: null,
      roughness: app.state.currentItemRoughness,
      opacity: app.state.currentItemOpacity,
      text,
      fontSize: app.state.currentItemFontSize,
      fontFamily: app.state.currentItemFontFamily,
      textAlign: DEFAULT_TEXT_ALIGN,
      verticalAlign: DEFAULT_VERTICAL_ALIGN,
      locked: false,
    };
    const fontString = getFontString({
      fontSize: textElementProps.fontSize,
      fontFamily: textElementProps.fontFamily,
    });
    const lineHeight = getLineHeight(textElementProps.fontFamily);
    const LINE_GAP = 10;
    const lines = isPlainPaste ? [text] : text.split("\n");

    const createTextElements = (maxTextWidth: number): ExcalidrawTextElement[] => {
      let currentY = y;
      return lines.reduce((acc: ExcalidrawTextElement[], line, index) => {
        const originalText = normalizeText(line).trim();
        if (originalText.length) {
          const topLayerFrame = app.getTopLayerFrameAtSceneCoords({ x, y: currentY });
          let metrics = measureText(originalText, fontString, lineHeight, app.renderEnvironment);
          const isTextUnwrapped = metrics.width > maxTextWidth;
          const lineText = isTextUnwrapped
            ? wrapText(originalText, fontString, maxTextWidth, app.renderEnvironment)
            : originalText;
          metrics = isTextUnwrapped
            ? measureText(lineText, fontString, lineHeight, app.renderEnvironment)
            : metrics;
          const element = newTextElement({
            ...textElementProps,
            x: x - metrics.width / 2,
            y: currentY - metrics.height / 2,
            text: lineText,
            originalText,
            lineHeight,
            autoResize: !isTextUnwrapped,
            frameId: topLayerFrame ? topLayerFrame.id : null,
            renderEnvironment: app.renderEnvironment,
          });
          acc.push(element);
          currentY += element.height + LINE_GAP;
        } else if (lines[index - 1]?.trim()) {
          // one empty line between paragraphs, however many there were
          currentY += getLineHeightInPx(textElementProps.fontSize, lineHeight) + LINE_GAP;
        }
        return acc;
      }, []);
    };

    // wrapped to fit the view, all of it is moved into view
    const pasteWithin = (offsets: Required<Offsets>): ExcalidrawTextElement[] => {
      const textElements = createTextElements(app.text.getMaxTextWidth(offsets));
      const scroll =
        textElements.length && textElements.some((element) => !element.autoResize)
          ? scrollBoundsIntoView({
              bounds: getCommonBounds(textElements),
              appState: app.state,
              offsets,
            })
          : null;
      if (!scroll) {
        return textElements;
      }
      const dx = (scroll.scrollX ?? app.state.scrollX) - app.state.scrollX;
      const dy = (scroll.scrollY ?? app.state.scrollY) - app.state.scrollY;
      return textElements.map((element) => {
        const nextX = element.x + dx;
        const nextY = element.y + dy;
        const topLayerFrame = app.getTopLayerFrameAtSceneCoords({
          x: nextX + element.width / 2,
          y: nextY + element.height / 2,
        });
        return newElementWith(element, {
          x: nextX,
          y: nextY,
          frameId: topLayerFrame ? topLayerFrame.id : null,
        });
      });
    };

    const textElements = pasteWithin(app.text.getTextViewportOffsets());
    if (textElements.length === 0) {
      return;
    }
    app.insertNewElements(textElements);
    app.store.scheduleCapture();
    app.setState({
      selectedElementIds: makeNextSelectedElementIds(
        Object.fromEntries(textElements.map((element) => [element.id, true])),
        app.state,
      ),
    });
  }
}
