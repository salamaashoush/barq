import {
  arrayToMap,
  DEFAULT_IMAGE_OPTIONS,
  getGridPoint,
  IMAGE_MIME_TYPES,
  KEYS,
  MIME_TYPES,
  updateActiveTool,
  viewportCoordsToSceneCoords,
} from "@excalidraw/common";
import {
  CaptureUpdateAction,
  makeNextSelectedElementIds,
  newElementWith,
  newImageElement,
  normalizeSVG,
  positionElementsOnGrid,
} from "@excalidraw/element";
import { getRenderEnvironment } from "@excalidraw/element/renderEnvironment";

import type {
  ExcalidrawImageElement,
  FileId,
  InitializedExcalidrawImageElement,
  NonDeleted,
} from "@excalidraw/element/types";

import {
  generateIdFromFile,
  getDataURL,
  isSupportedImageFile,
  normalizeFile,
  SVGStringToFile,
} from "../data/blob.ts";
import { actionFinalize } from "./actions/finalize.ts";

import type { BinaryFileData } from "../types.ts";
import type { DiagramEditor } from "./editor.ts";

/** How inserted images are kept small: their longest side, and their size once resized. */
export interface ImageOptions {
  /** @default 1440 */
  maxWidthOrHeight: number;
  /** @default 4 MiB */
  maxFileSizeBytes: number;
}

const getImageFileDimensions = async (
  file: File,
  ownerWindow: Window & typeof globalThis,
): Promise<{ width: number; height: number }> => {
  const url = ownerWindow.URL;
  let objectURL: string | null = null;
  let imageSource: string;
  try {
    imageSource = url?.createObjectURL
      ? (objectURL = url.createObjectURL(file))
      : await getDataURL(file);
  } catch {
    objectURL = null;
    imageSource = await getDataURL(file);
  }
  return new Promise((resolve, reject) => {
    const image = getRenderEnvironment().createImage();
    const cleanup = () => {
      image.removeEventListener("load", onLoad);
      image.removeEventListener("error", onError);
      if (objectURL) {
        url.revokeObjectURL(objectURL);
      }
    };
    const onLoad = () => {
      cleanup();
      resolve({
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
      });
    };
    const onError = () => {
      cleanup();
      reject(new Error("the image could not be decoded"));
    };
    image.addEventListener("load", onLoad);
    image.addEventListener("error", onError);
    image.src = imageSource;
  });
};

/**
 * An image file no larger than `maxWidthOrHeight` on its longest side,
 * resized with pica (loaded only when one has to be); an SVG as it is.
 */
export const resizeImageFile = async (
  file: File,
  opts: { outputType?: typeof MIME_TYPES.jpg; maxWidthOrHeight: number },
  ownerWindow: Window & typeof globalThis = window,
): Promise<File> => {
  if (file.type === MIME_TYPES.svg) {
    return file;
  }
  if (!isSupportedImageFile(file)) {
    throw new Error("Error: unsupported file type", { cause: "UNSUPPORTED" });
  }
  if (!opts.outputType || opts.outputType === file.type) {
    const dimensions = await getImageFileDimensions(file, ownerWindow);
    if (Math.max(dimensions.width, dimensions.height) <= opts.maxWidthOrHeight) {
      return file;
    }
  }
  const [pica, imageBlobReduce] = await Promise.all([
    import("pica").then((module) => module.default),
    import("image-blob-reduce").then((module) => module.default),
  ]);
  const reduce = imageBlobReduce({ pica: pica({ features: ["js", "wasm"] }) });
  const { outputType } = opts;
  if (outputType) {
    reduce._create_blob = function (env) {
      return this.pica.toBlob(env.out_canvas, outputType, 0.8).then((blob) => {
        env.out_blob = blob;
        return env;
      });
    };
  }
  return new File(
    [await reduce.toBlob(file, { max: opts.maxWidthOrHeight, alpha: true })],
    file.name,
    { type: opts.outputType || file.type },
  );
};

/** Fetches an image from a URL, as pasted HTML's images are. */
export const imageURLToFile = async (imageUrl: string, filename = ""): Promise<File> => {
  let response: Response;
  try {
    response = await fetch(imageUrl);
  } catch {
    throw new Error("Error: failed to fetch image", { cause: "FETCH_ERROR" });
  }
  if (!response.ok) {
    throw new Error("Error: failed to fetch image", { cause: "FETCH_ERROR" });
  }
  const blob = await response.blob();
  if (blob.type && isSupportedImageFile(blob)) {
    return new File([blob], filename, { type: blob.type });
  }
  throw new Error("Error: unsupported file type", { cause: "UNSUPPORTED" });
};

/**
 * Images: inserted from files (a picker, a drop, a paste), placed on a grid
 * where there are several, sized to the view, and kept in the scene's files
 * and image cache. Excalidraw's image methods of `App`.
 */
export class EditorImages {
  public options: ImageOptions = { ...DEFAULT_IMAGE_OPTIONS };

  public constructor(private readonly app: DiagramEditor) {}

  /** A 100px placeholder centred on the point, in the frame there. */
  public newImagePlaceholder({
    sceneX,
    sceneY,
    addToFrameUnderCursor = true,
  }: {
    sceneX: number;
    sceneY: number;
    addToFrameUnderCursor?: boolean;
  }): NonDeleted<ExcalidrawImageElement> {
    const app = this.app;
    const [gridX, gridY] = getGridPoint(
      sceneX,
      sceneY,
      app.lastPointerDownEvent?.[KEYS.CTRL_OR_CMD] ? null : app.getEffectiveGridSize(),
    );
    const topLayerFrame = addToFrameUnderCursor
      ? app.getTopLayerFrameAtSceneCoords({ x: gridX, y: gridY })
      : null;
    const placeholderSize = 100 / app.state.zoom.value;
    return newImageElement({
      type: "image",
      strokeColor: app.state.currentItemStrokeColor,
      backgroundColor: app.state.currentItemBackgroundColor,
      fillStyle: app.state.currentItemFillStyle,
      strokeWidth: app.getCurrentItemStrokeWidth("image"),
      strokeStyle: app.state.currentItemStrokeStyle,
      roughness: app.state.currentItemRoughness,
      roundness: null,
      opacity: app.state.currentItemOpacity,
      locked: false,
      frameId: topLayerFrame ? topLayerFrame.id : null,
      x: gridX - placeholderSize / 2,
      y: gridY - placeholderSize / 2,
      width: placeholderSize,
      height: placeholderSize,
    });
  }

  /** At most half the view high (and as high as the image), the same centre as the placeholder. */
  private getImageNaturalDimensions(
    imageElement: ExcalidrawImageElement,
    imageHTML: HTMLImageElement,
  ) {
    const { state } = this.app;
    const minHeight = Math.max(state.height - 120, 160);
    const maxHeight = Math.min(minHeight, Math.floor(state.height * 0.5) / state.zoom.value);
    const height = Math.min(imageHTML.naturalHeight, maxHeight);
    const width = height * (imageHTML.naturalWidth / imageHTML.naturalHeight);
    return {
      x: imageElement.x + imageElement.width / 2 - width / 2,
      y: imageElement.y + imageElement.height / 2 - height / 2,
      width,
      height,
      crop: null,
    };
  }

  /** The placeholder as it is now (it may have moved meanwhile), with its file. */
  private getLatestInitializedImageElement(
    imagePlaceholder: ExcalidrawImageElement,
    fileId: FileId,
  ): NonDeleted<InitializedExcalidrawImageElement> {
    const latestImageElement = this.app.scene.getElement(imagePlaceholder.id) ?? imagePlaceholder;
    return newElementWith(latestImageElement as NonDeleted<InitializedExcalidrawImageElement>, {
      fileId,
    });
  }

  /** Reads the file in (resized, its id its digest) and sizes the placeholder to it. */
  private async initializeImage(
    placeholderImageElement: ExcalidrawImageElement,
    file: File,
  ): Promise<NonDeleted<InitializedExcalidrawImageElement>> {
    const app = this.app;
    let imageFile = file;
    if (!isSupportedImageFile(imageFile)) {
      throw new Error("Unsupported file type.");
    }
    const mimeType = imageFile.type as BinaryFileData["mimeType"];
    app.cursor.set("wait");

    if (mimeType === MIME_TYPES.svg) {
      try {
        imageFile = SVGStringToFile(normalizeSVG(await imageFile.text()), imageFile.name);
      } catch (error) {
        console.warn(error);
        throw new Error("Couldn't insert the SVG image.", { cause: error });
      }
    }

    // the id is the original's digest, before any resizing, so it is portable
    const fileId = await generateIdFromFile(imageFile);
    if (!fileId) {
      throw new Error("Couldn't insert the image.");
    }

    const existingFileData = app.getFiles()[fileId];
    if (!existingFileData?.dataURL) {
      try {
        imageFile = await resizeImageFile(
          imageFile,
          { maxWidthOrHeight: this.options.maxWidthOrHeight },
          app.ownerWindow,
        );
      } catch (error) {
        console.error("Error trying to resizing image file on insertion", error);
      }
      if (imageFile.size > this.options.maxFileSizeBytes) {
        throw new Error(
          `The file is too big. The maximum allowed size is ${Math.trunc(
            this.options.maxFileSizeBytes / 1024 / 1024,
          )}MB.`,
        );
      }
    }

    const dataURL = app.getFiles()[fileId]?.dataURL || (await getDataURL(imageFile));
    let initializedImageElement = this.getLatestInitializedImageElement(
      placeholderImageElement,
      fileId,
    );
    app.batch(() =>
      app.addMissingFiles([
        { mimeType, id: fileId, dataURL, created: Date.now(), lastRetrieved: Date.now() },
      ]),
    );
    const imageHTML = await app.loadImage(fileId);
    if (!imageHTML) {
      throw new Error("Image cache update resulted with an error.");
    }
    if (app.state.newElement?.id !== initializedImageElement.id) {
      initializedImageElement = this.getLatestInitializedImageElement(
        placeholderImageElement,
        fileId,
      );
      Object.assign(
        initializedImageElement,
        this.getImageNaturalDimensions(initializedImageElement, imageHTML),
      );
    }
    return initializedImageElement;
  }

  /**
   * Inserts the images at a scene point, on a grid when there are several,
   * selected and undoable as one; the ones that fail are dropped, with the
   * error in `errorMessage`.
   */
  public async insertImages(imageFiles: File[], sceneX: number, sceneY: number): Promise<void> {
    const app = this.app;
    const gridPadding = 50 / app.state.zoom.value;
    const placeholders = positionElementsOnGrid(
      imageFiles.map(() => this.newImagePlaceholder({ sceneX, sceneY })),
      sceneX,
      sceneY,
      gridPadding,
    );
    app.batch(() => app.insertNewElements(placeholders));

    const initialized = await Promise.all(
      placeholders.map(async (placeholder, index) => {
        try {
          const file = imageFiles[index];
          if (!file) throw new Error("Couldn't insert the image.");
          return await this.initializeImage(placeholder, await normalizeFile(file));
        } catch (error) {
          app.batch(() =>
            app.setState({
              errorMessage: error instanceof Error ? error.message : "Couldn't insert the image.",
            }),
          );
          const removed: ExcalidrawImageElement = placeholder;
          return newElementWith(removed, { isDeleted: true });
        }
      }),
    );
    if (app.isDestroyed) {
      return;
    }
    const initializedMap = arrayToMap(initialized);
    const positioned = positionElementsOnGrid(
      initialized.filter((element) => !element.isDeleted),
      sceneX,
      sceneY,
      gridPadding,
    );
    const positionedMap = arrayToMap(positioned);
    const nextElements = app.scene
      .getElementsIncludingDeleted()
      .map((element) => positionedMap.get(element.id) ?? initializedMap.get(element.id) ?? element);

    app.batch(() => {
      app.updateScene({
        appState: {
          selectedElementIds: makeNextSelectedElementIds(
            Object.fromEntries(positioned.map((element) => [element.id, true])),
            app.state,
          ),
        },
        elements: nextElements,
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      app.cursor.reset();
      app.afterNextCommit(() => app.actionManager.executeAction(actionFinalize));
    });
  }

  /**
   * The image tool: a file picker for images, inserted at the middle of the
   * view; cancelled, the tool goes back to selection.
   */
  public async openImagePicker(): Promise<void> {
    const app = this.app;
    const { x, y } = viewportCoordsToSceneCoords(
      {
        clientX: app.state.width / 2 + app.state.offsetLeft,
        clientY: app.state.height / 2 + app.state.offsetTop,
      },
      app.state,
    );
    const imageFiles = await pickFiles(app.ownerDocument, Object.values(IMAGE_MIME_TYPES));
    if (app.isDestroyed) {
      return;
    }
    if (imageFiles.length === 0) {
      app.batch(() => {
        app.setState(
          {
            newElement: null,
            activeTool: updateActiveTool(app.state, {
              type: app.state.preferredSelectionTool.type,
            }),
          },
          () => app.actionManager.executeAction(actionFinalize),
        );
        app.cursor.reset();
      });
      return;
    }
    await this.insertImages(imageFiles, x, y);
  }

  /** Whether any of the files is an image the editor takes. */
  public static hasImages(files: readonly File[]): boolean {
    return files.some((file) => isSupportedImageFile(file));
  }
}

/** Opens the browser's file picker for files of these types; an empty list when cancelled. */
const pickFiles = (ownerDocument: Document, accept: readonly string[]): Promise<File[]> =>
  new Promise((resolve) => {
    const input = ownerDocument.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = accept.join(",");
    input.style.display = "none";
    const done = (files: File[]) => {
      input.remove();
      resolve(files);
    };
    input.addEventListener("change", () => done([...(input.files ?? [])]), { once: true });
    input.addEventListener("cancel", () => done([]), { once: true });
    ownerDocument.body.append(input);
    input.click();
  });
