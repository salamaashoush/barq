import { getRenderEnvironment } from "@excalidraw/element/renderEnvironment";
import type { RenderEnvironment } from "@excalidraw/element/renderEnvironment";
import {
  Scene,
  ShapeCache,
  isInitializedImageElement,
  updateImageCache,
} from "@excalidraw/element";
import type {
  ExcalidrawElement,
  FileId,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";
import type { RoughCanvas } from "roughjs/bin/canvas";
import rough from "roughjs";

import { Fonts } from "./fonts/fonts.ts";
import { renderStaticScene } from "./renderer/static-scene.ts";
import { Renderer } from "./scene/renderer.ts";
import type {
  AppState,
  BinaryFiles,
  ElementRenderOffsets,
  ElementRenderOverrides,
  EmbedsValidationStatus,
  ImageCache,
} from "./types.ts";

/**
 * `Scene`, answering an empty selection without walking the scene. Its own
 * cache holds one query, and the UI asks with and without bound text in
 * turn, so each panel and action predicate walked every element.
 */
class SelectionScene extends Scene {
  public override getSelectedElements(
    opts: Parameters<Scene["getSelectedElements"]>[0],
  ): NonDeletedExcalidrawElement[] {
    return hasSelectedIds(opts.selectedElementIds) ? super.getSelectedElements(opts) : [];
  }
}

export const hasSelectedIds = (selectedElementIds: Readonly<Record<string, boolean>>): boolean => {
  for (const id in selectedElementIds) if (selectedElementIds[id]) return true;
  return false;
};

/** What an editor draws beyond the scene: the selection, and the grid. */
export interface SceneCanvasFrame {
  selectedElements: readonly NonDeletedExcalidrawElement[];
  renderGrid: boolean;
  /** What the eraser has marked, drawn faded until it erases or lets go. */
  elementsPendingErasure?: ReadonlySet<NonDeletedExcalidrawElement["id"]>;
  /** The flowchart nodes a key press would add, drawn as a preview. */
  pendingFlowchartNodes?: NonDeletedExcalidrawElement[] | null;
  /** Which embeddables' links validated: the others are drawn as placeholders. */
  embedsValidationStatus?: EmbedsValidationStatus;
  /** The link icons in the elements' corners, which a click opens. */
  renderLinks?: boolean;
  /** The host's transient opacities and offsets, drawn without touching the document. */
  elementRenderOverrides?: ElementRenderOverrides;
  /** Their offsets alone: elements they move into the viewport are drawn, those moved out not. */
  elementRenderOffsets?: ElementRenderOffsets;
}

/** The elements a frame draws, which the editor's other layers draw from too. */
export type RenderableElements = ReturnType<Renderer["getRenderableElements"]>;

/**
 * A scene drawn on a canvas at a viewport: the static layer of Excalidraw's
 * editor. It owns the image cache for the scene's files and loads the fonts
 * its text uses, redrawing as either arrives, or asking its owner to through
 * `onInvalidate`, which an editor uses to draw once a frame.
 */
export class SceneCanvas {
  public readonly scene: Scene;
  public readonly imageCache: ImageCache = new Map();
  public readonly renderer: Renderer;
  public readonly fonts: Fonts;
  public readonly rc: RoughCanvas;
  /** Where canvases and images are made: the browser's unless the host gives one. */
  public renderEnvironment: RenderEnvironment | undefined;
  private files: BinaryFiles = {};
  private appState: AppState | null = null;
  private frame: SceneCanvasFrame | undefined;
  private scale = 1;
  private readonly unsubscribe: () => void;

  public constructor(
    public readonly canvas: HTMLCanvasElement,
    elements: readonly ExcalidrawElement[] = [],
    onInvalidate?: () => void,
  ) {
    this.scene = new SelectionScene(elements);
    this.renderer = new Renderer(this.scene);
    this.fonts = new Fonts(this.scene, canvas.ownerDocument);
    this.rc = rough.canvas(canvas);
    this.unsubscribe = this.scene.onUpdate(onInvalidate ?? (() => this.redraw()));
  }

  public get elements(): readonly NonDeletedExcalidrawElement[] {
    return this.scene.getNonDeletedElements();
  }

  /** Replaces the scene's elements, then loads the fonts their text needs. */
  public setElements(elements: readonly ExcalidrawElement[]): Promise<void> {
    this.scene.replaceAllElements(elements);
    return this.loadFonts();
  }

  /** Replaces the scene's files and decodes the images its elements show. */
  public async setFiles(files: BinaryFiles): Promise<void> {
    this.files = files;
    const fileIds = this.elements
      .filter(isInitializedImageElement)
      .map((element) => element.fileId)
      .filter(
        (id): id is FileId => id !== null && files[id] !== undefined && !this.imageCache.has(id),
      );
    if (fileIds.length === 0) return;
    const { updatedFiles } = await updateImageCache({
      fileIds,
      files: this.files,
      imageCache: this.imageCache,
      createImage: () => getRenderEnvironment(this.renderEnvironment).createImage(),
    });
    if (updatedFiles.size === 0) return;
    // An image element drawn before its file decoded is cached as its
    // placeholder; the cached shape has to go for the image to show.
    for (const element of this.elements) {
      if (isInitializedImageElement(element) && updatedFiles.has(element.fileId)) {
        ShapeCache.delete(element);
      }
    }
    this.scene.triggerUpdate();
  }

  /**
   * Decodes the files' images into the cache, whatever shows them: an image
   * being inserted is not in the scene with its file yet.
   */
  public async loadImages(
    fileIds: readonly FileId[],
    files: BinaryFiles,
  ): Promise<{ updatedFiles: Map<FileId, true>; erroredFiles: Map<FileId, true> }> {
    this.files = files;
    const result = await updateImageCache({
      fileIds: [...fileIds],
      files,
      imageCache: this.imageCache,
      createImage: () => getRenderEnvironment(this.renderEnvironment).createImage(),
    });
    if (result.updatedFiles.size > 0) {
      for (const element of this.elements) {
        if (isInitializedImageElement(element) && result.updatedFiles.has(element.fileId)) {
          ShapeCache.delete(element);
        }
      }
      this.scene.triggerUpdate();
    }
    return result;
  }

  public async loadFonts(): Promise<void> {
    const loaded = await this.fonts.loadSceneFonts();
    if (loaded.length > 0) this.fonts.onLoaded(loaded);
  }

  /**
   * Draws the scene at `appState`'s viewport, `scale` device pixels per CSS
   * pixel, and returns what it drew. An element being drawn out
   * (`appState.newElement`) is left to the editor's new-element layer.
   */
  public render(appState: AppState, scale: number, frame?: SceneCanvasFrame): RenderableElements {
    this.appState = appState;
    this.frame = frame;
    this.scale = scale;
    const width = Math.max(1, Math.round(appState.width * scale));
    const height = Math.max(1, Math.round(appState.height * scale));
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    const cssWidth = `${appState.width}px`;
    const cssHeight = `${appState.height}px`;
    if (this.canvas.style.width !== cssWidth) this.canvas.style.width = cssWidth;
    if (this.canvas.style.height !== cssHeight) this.canvas.style.height = cssHeight;

    const renderable = this.renderer.getRenderableElements({
      zoom: appState.zoom,
      offsetLeft: appState.offsetLeft,
      offsetTop: appState.offsetTop,
      scrollX: appState.scrollX,
      scrollY: appState.scrollY,
      height: appState.height,
      width: appState.width,
      editingTextElement: appState.editingTextElement,
      newElement: appState.newElement,
      selectedElements: frame?.selectedElements ?? [],
      selectedElementsAreBeingDragged: appState.selectedElementsAreBeingDragged,
      frameToHighlight: appState.frameToHighlight,
    });
    const { elementsMap } = renderable;
    const offsets = frame?.elementRenderOffsets;
    const visibleElements =
      offsets && offsets.size > 0
        ? this.renderer.getVisibleElementsWithRenderOffsets(
            renderable.visibleElements,
            elementsMap,
            appState,
            offsets,
          )
        : renderable.visibleElements;

    renderStaticScene({
      canvas: this.canvas,
      rc: this.rc,
      scale,
      elementsMap,
      allElementsMap: this.scene.getNonDeletedElementsMap(),
      visibleElements,
      appState,
      renderConfig: {
        canvasBackgroundColor: appState.viewBackgroundColor,
        scale,
        imageCache: this.imageCache,
        renderGrid: frame?.renderGrid ?? false,
        renderLinks: frame?.renderLinks ?? false,
        isExporting: false,
        embedsValidationStatus: frame?.embedsValidationStatus ?? new Map(),
        elementsPendingErasure: new Set(frame?.elementsPendingErasure),
        pendingFlowchartNodes: frame?.pendingFlowchartNodes ?? null,
        theme: appState.theme,
        elementRenderOverrides: frame?.elementRenderOverrides,
        renderEnvironment: this.renderEnvironment,
      },
    });
    return renderable;
  }

  public destroy(): void {
    this.unsubscribe();
    this.renderer.destroy(this.canvas);
    this.scene.destroy();
  }

  private redraw(): void {
    if (this.appState !== null) this.render(this.appState, this.scale, this.frame);
  }
}
