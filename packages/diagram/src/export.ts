import { MIME_TYPES } from "@excalidraw/common";
import { getNonDeletedElements } from "@excalidraw/element";
import type { ExcalidrawElement, ExcalidrawFrameLikeElement } from "@excalidraw/element/types";

import { cleanAppStateForExport, getDefaultAppState } from "./app-state.ts";
import {
  type ExportSceneConfig,
  type ExportSceneData,
  exportScene,
  getExportConfigFromAppState,
} from "./scene/export.ts";
import type { AppState, BinaryFiles } from "./types.ts";

/**
 * The options Excalidraw's `exportToCanvas`, `exportToBlob` and `exportToSvg`
 * take: the rendering settings ride on `appState` (`exportBackground`,
 * `exportWithDarkMode`, `exportScale`, `exportEmbedScene`, `frameRendering`,
 * `viewBackgroundColor`). `exportScene` is the same pipeline with an explicit
 * config.
 */
export interface ExportOpts {
  /** Deleted elements are left out. */
  elements: readonly ExcalidrawElement[];
  appState?: Partial<Omit<AppState, "offsetTop" | "offsetLeft">>;
  files: BinaryFiles | null;
  maxWidthOrHeight?: number;
  exportingFrame?: ExcalidrawFrameLikeElement | null;
  /**
   * The export's size from its size at scale 1, padding included. Only the
   * scale is honoured: the canvas is that size times the returned `scale`,
   * or the largest scale that fits the returned box when there is none.
   */
  getDimensions?: (
    width: number,
    height: number,
  ) => { width: number; height: number; scale?: number };
  /** @default 10 */
  exportPadding?: number;
}

function toScene(opts: ExportOpts): { data: ExportSceneData; config: ExportSceneConfig } {
  const appState = { ...getDefaultAppState(), ...opts.appState };
  const { getDimensions } = opts;
  const fromAppState = getExportConfigFromAppState(appState);
  return {
    data: {
      elements: getNonDeletedElements(opts.elements),
      appState: cleanAppStateForExport(appState),
      files: opts.files,
    },
    config: {
      ...fromAppState,
      ...(getDimensions === undefined
        ? {}
        : {
            scale: (width: number, height: number) => {
              const box = getDimensions(width, height);
              return box.scale ?? Math.min(box.width / width, box.height / height);
            },
          }),
      ...(opts.exportPadding === undefined ? {} : { padding: opts.exportPadding }),
      ...(opts.maxWidthOrHeight === undefined ? {} : { maxWidthOrHeight: opts.maxWidthOrHeight }),
      exportingFrame: (opts.exportingFrame ?? null) as ExportSceneConfig["exportingFrame"],
    },
  };
}

/** The scene drawn on a canvas, at `appState.exportScale`. */
export async function exportToCanvas(opts: ExportOpts): Promise<HTMLCanvasElement> {
  const { data, config } = toScene(opts);
  return exportScene({ type: "canvas", data, config });
}

/**
 * The scene as a PNG, or a JPEG when `mimeType` is `image/jpeg`. With
 * `appState.exportEmbedScene` the PNG carries the scene, and `loadFromBlob`
 * opens it again.
 */
export async function exportToBlob(
  opts: ExportOpts & { mimeType?: string; quality?: number },
): Promise<Blob> {
  const { data, config } = toScene(opts);
  if (opts.mimeType === MIME_TYPES.jpg) {
    return exportScene({
      type: "jpeg",
      data,
      config: { ...config, ...(opts.quality === undefined ? {} : { quality: opts.quality }) },
    });
  }
  return exportScene({
    type: "png",
    data,
    config: { ...config, embedScene: opts.appState?.exportEmbedScene ?? false },
  });
}

/**
 * The scene as an SVG element. Fonts are inlined unless `skipInliningFonts`;
 * with `appState.exportEmbedScene` the SVG carries the scene.
 */
export async function exportToSvg(
  opts: Omit<ExportOpts, "getDimensions"> & {
    renderEmbeddables?: boolean;
    skipInliningFonts?: true;
    reuseImages?: boolean;
  },
): Promise<SVGSVGElement> {
  const { data, config } = toScene(opts);
  return exportScene({
    type: "svg",
    data,
    config: {
      ...config,
      embedScene: opts.appState?.exportEmbedScene ?? false,
      ...(opts.renderEmbeddables === undefined
        ? {}
        : { renderEmbeddables: opts.renderEmbeddables }),
      ...(opts.skipInliningFonts === undefined
        ? {}
        : { skipInliningFonts: opts.skipInliningFonts }),
      ...(opts.reuseImages === undefined ? {} : { reuseImages: opts.reuseImages }),
    },
  });
}
