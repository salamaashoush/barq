import { FRAME_STYLE, getGridPoint } from "@excalidraw/common";
import {
  getCommonBounds,
  getElementsOverlappingFrame,
  isFrameLikeElement,
  newIframeElement,
  newMagicFrameElement,
} from "@excalidraw/element";

import type {
  ExcalidrawIframeElement,
  ExcalidrawMagicFrameElement,
  MagicGenerationData,
  NonDeleted,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

import type { LocalizedMessage } from "../i18n.ts";
import type { DiagramEditor } from "./editor.ts";

/** Excalidraw's `GenerateDiagramToCode`: the app's wireframe-to-code backend. */
export type GenerateDiagramToCode = (props: {
  frame: NonDeleted<ExcalidrawMagicFrameElement>;
  children: readonly NonDeletedExcalidrawElement[];
  /** Called with the reply so far, as it streams, to show it as it comes. */
  onPartial?: (html: string) => void;
}) => Promise<{ html: string }> | { html: string };

/** The app's `<DiagramToCodePlugin>`: without it the magic frame is not offered. */
export interface DiagramToCodeOptions {
  generate: GenerateDiagramToCode;
}

/** A generation as the UI shows it: Excalidraw's data, and the HTML streamed so far while pending. */
export type MagicGeneration = MagicGenerationData & { partial?: string };

const GAP = 30;
const WRAP_PADDING = 50;

/** The page a reply is, from its doctype to its closing tag when it has both. */
const pageOf = (html: string): string =>
  html.includes("<!DOCTYPE html>") && html.includes("</html>")
    ? html.slice(html.indexOf("<!DOCTYPE html>"), html.indexOf("</html>") + "</html>".length)
    : html;

/**
 * Excalidraw's magic frame ("wireframe to code"): a frame whose contents the
 * app's `diagramToCode` backend turns into HTML, shown in an iframe element
 * beside it. Pending generations live here only; a finished one, or its
 * error, is kept on the iframe element's `customData.generationData`, as
 * Excalidraw keeps it.
 */
export class MagicFrame {
  private readonly generations = new Map<string, MagicGeneration>();
  private version = 0;

  public constructor(private readonly app: DiagramEditor) {}

  /** Changes whenever a generation does, for the layer showing them. */
  public get generationVersion(): number {
    return this.version;
  }

  public getGeneration(element: ExcalidrawIframeElement): MagicGeneration | null {
    return this.generations.get(element.id) ?? element.customData?.generationData ?? null;
  }

  /**
   * The toolbar's entry: with nothing selected (or a selection already in a
   * frame) the tool, to draw a frame; with a selection, wraps it in a magic
   * frame and generates; with a magic frame selected, generates from it.
   */
  public onToolSelect(): void {
    const { app } = this;
    const selected = app.scene.getSelectedElements({
      selectedElementIds: app.state.selectedElementIds,
    });
    const [first] = selected;
    if (!first) {
      app.setActiveTool({ type: "magicframe" });
      return;
    }
    const selectedMagicFrame =
      selected.length === 1 && first.type === "magicframe"
        ? (first as NonDeleted<ExcalidrawMagicFrameElement>)
        : null;
    if (
      !selectedMagicFrame &&
      selected.some((element) => isFrameLikeElement(element) || element.frameId)
    ) {
      app.setActiveTool({ type: "magicframe" });
      return;
    }
    let frame = selectedMagicFrame;
    if (!frame) {
      const [minX, minY, maxX, maxY] = getCommonBounds(selected);
      frame = newMagicFrameElement({
        ...FRAME_STYLE,
        x: minX - WRAP_PADDING,
        y: minY - WRAP_PADDING,
        width: maxX - minX + WRAP_PADDING * 2,
        height: maxY - minY + WRAP_PADDING * 2,
        opacity: 100,
        locked: false,
      });
      app.insertNewElement(frame);
      for (const child of selected) {
        app.scene.mutateElement(child, { frameId: frame.id });
      }
      app.setState({ selectedElementIds: { [frame.id]: true } });
    }
    void this.generate(frame, "upstream");
  }

  /** Generates HTML from what the frame holds, into a new iframe element to its right. */
  public async generate(
    magicFrame: NonDeleted<ExcalidrawMagicFrameElement>,
    source: "button" | "upstream",
  ): Promise<void> {
    const { app } = this;
    const generateDiagramToCode = app.host.diagramToCode?.generate;
    if (!generateDiagramToCode || !app.host.aiEnabled) {
      app.setState({ errorMessage: { key: "magicFrame.noBackend" } satisfies LocalizedMessage });
      return;
    }
    const children = getElementsOverlappingFrame(
      app.scene.getNonDeletedElements(),
      magicFrame,
      app.scene.getNonDeletedElementsMap(),
    ).filter((element) => element.type !== "magicframe");
    if (children.length === 0) {
      if (source === "button") {
        app.setState({ errorMessage: { key: "magicFrame.emptyFrame" } satisfies LocalizedMessage });
      } else {
        app.setActiveTool({ type: "magicframe" });
      }
      return;
    }

    const [x, y] = getGridPoint(
      magicFrame.x + magicFrame.width + GAP,
      magicFrame.y,
      app.getEffectiveGridSize(),
    );
    const frameElement = newIframeElement({
      type: "iframe",
      x,
      y,
      strokeColor: "transparent",
      backgroundColor: "transparent",
      fillStyle: app.state.currentItemFillStyle,
      strokeWidth: app.getCurrentItemStrokeWidth("iframe"),
      strokeStyle: app.state.currentItemStrokeStyle,
      roughness: app.state.currentItemRoughness,
      roundness: null,
      opacity: app.state.currentItemOpacity,
      locked: false,
      width: magicFrame.width,
      height: magicFrame.height,
    });
    app.insertNewElement(frameElement);
    this.update(frameElement, { status: "pending" });
    app.setState({ selectedElementIds: { [frameElement.id]: true } });

    try {
      const { html } = await generateDiagramToCode({
        frame: magicFrame,
        children,
        onPartial: (partial) => {
          const current = this.generations.get(frameElement.id);
          const start = partial.search(/<!doctype html|<html[\s>]/i);
          if (current?.status !== "pending" || start === -1) return;
          this.update(frameElement, { status: "pending", partial: partial.slice(start) });
        },
      });
      if (!html.trim()) {
        this.update(frameElement, {
          status: "error",
          code: "ERR_OAI",
          message: "Nothing generated",
        });
        return;
      }
      this.update(frameElement, { status: "done", html: pageOf(html) });
    } catch (error) {
      this.update(frameElement, {
        status: "error",
        code: "ERR_OAI",
        message:
          error instanceof Error && error.message
            ? error.message
            : "Unknown error during generation",
      });
    }
  }

  private update(frameElement: ExcalidrawIframeElement, data: MagicGeneration): void {
    const { app } = this;
    if (app.isDestroyed) return;
    app.batch(() => {
      const element = app.scene.getElement(frameElement.id) ?? frameElement;
      // a pending generation stays out of the saved scene
      const { partial: _partial, ...kept } = data;
      app.scene.mutateElement(
        element,
        {
          customData: {
            generationData: data.status === "pending" ? undefined : kept,
          },
        },
        { informMutation: false, isDragging: false },
      );
      this.generations.set(frameElement.id, data);
      this.version++;
      app.scene.triggerUpdate();
    });
  }
}
