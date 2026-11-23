import { getRenderEnvironment } from "@excalidraw/element/renderEnvironment";
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
import rough from "roughjs/bin/rough";

import { Fonts } from "./fonts/fonts.ts";
import { renderStaticScene } from "./renderer/static-scene.ts";
import { Renderer } from "./scene/renderer.ts";
import type { AppState, BinaryFiles, ImageCache } from "./types.ts";

/**
 * A scene drawn on a canvas at a viewport: the static layer of Excalidraw's
 * editor, without the editor. It owns the image cache for the scene's files
 * and loads the fonts its text uses, redrawing as either arrives.
 */
export class SceneCanvas {
  public readonly scene: Scene;
  public readonly imageCache: ImageCache = new Map();
  private readonly renderer: Renderer;
  private readonly fonts: Fonts;
  private readonly rc: ReturnType<typeof rough.canvas>;
  private files: BinaryFiles = {};
  private appState: AppState | null = null;
  private scale = 1;
  private readonly unsubscribe: () => void;

  public constructor(
    public readonly canvas: HTMLCanvasElement,
    elements: readonly ExcalidrawElement[] = [],
  ) {
    this.scene = new Scene(elements);
    this.renderer = new Renderer(this.scene);
    this.fonts = new Fonts(this.scene, canvas.ownerDocument);
    this.rc = rough.canvas(canvas);
    this.unsubscribe = this.scene.onUpdate(() => this.redraw());
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
      createImage: () => getRenderEnvironment().createImage(),
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

  public async loadFonts(): Promise<void> {
    const loaded = await this.fonts.loadSceneFonts();
    if (loaded.length > 0) this.fonts.onLoaded(loaded);
  }

  /** Draws the scene at `appState`'s viewport, `scale` device pixels per CSS pixel. */
  public render(appState: AppState, scale: number): void {
    this.appState = appState;
    this.scale = scale;
    const width = Math.max(1, Math.round(appState.width * scale));
    const height = Math.max(1, Math.round(appState.height * scale));
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    this.canvas.style.width = `${appState.width}px`;
    this.canvas.style.height = `${appState.height}px`;

    const { elementsMap, visibleElements } = this.renderer.getRenderableElements({
      zoom: appState.zoom,
      offsetLeft: appState.offsetLeft,
      offsetTop: appState.offsetTop,
      scrollX: appState.scrollX,
      scrollY: appState.scrollY,
      height: appState.height,
      width: appState.width,
      editingTextElement: null,
      newElement: null,
      selectedElements: [],
      selectedElementsAreBeingDragged: false,
      frameToHighlight: null,
    });

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
        renderGrid: false,
        renderLinks: false,
        isExporting: false,
        embedsValidationStatus: new Map(),
        elementsPendingErasure: new Set(),
        pendingFlowchartNodes: null,
        theme: appState.theme,
      },
    });
  }

  public destroy(): void {
    this.unsubscribe();
    this.renderer.destroy(this.canvas);
    this.scene.destroy();
  }

  private redraw(): void {
    if (this.appState !== null) this.render(this.appState, this.scale);
  }
}
