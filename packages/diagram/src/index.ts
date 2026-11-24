/**
 * `@barqjs/diagram`: Excalidraw's scenes in barq. The element model is
 * `@excalidraw/element`; this package carries the rest of what Excalidraw's
 * React package does around it, without React: restoring and serializing
 * scenes, the canvas and SVG renderers, export, fonts, a read-only viewer and
 * an editor.
 */

export { DiagramViewer } from "./viewer.tsx";
export { DiagramEditor } from "./diagram-editor.tsx";
export type { DiagramEditorProps } from "./diagram-editor.tsx";
export { MainMenu } from "./ui/main-menu.tsx";
export { WelcomeScreen } from "./ui/welcome-screen.tsx";
export { useHandleLibrary } from "./ui/use-handle-library.ts";
export { handleLibrary, parseLibraryTokensFromUrl } from "./editor/library.ts";
export type {
  HandleLibraryOptions,
  LibraryAdapterSource,
  LibraryItemsSource,
  LibraryMigrationAdapter,
  LibraryPersistedData,
  LibraryPersistenceAdapter,
  LibraryUpdate,
} from "./editor/library.ts";
export type { RenderSlot } from "./ui/context.tsx";
export type { CanvasActions, ExportOpts as UIExportOpts, UIOptions } from "./editor/ui-options.ts";
export { defaultLang, isRTLLanguage, languages, loadLanguage, localeCodes } from "./i18n.ts";
export type { Language, TranslationKey } from "./i18n.ts";
export type {
  DiagramChangeListener,
  DiagramEditorApi,
  SceneData,
  TextEditRequest,
} from "./editor/editor.ts";
export type { DiagramViewerApi, DiagramViewerProps } from "./viewer.tsx";

export { SceneCanvas } from "./scene-canvas.ts";
export {
  PointerNavigation,
  fitToContent,
  keyboardNavigation,
  wheelNavigation,
  zoomAt,
} from "./navigation.ts";
export type { ViewportState } from "./navigation.ts";

export { exportToBlob, exportToCanvas, exportToSvg } from "./export.ts";
export {
  exportCanvas,
  exportToClipboard,
  loadFromJSON,
  saveAsJSON,
  saveLibraryAsJSON,
} from "./data/files.ts";
export {
  fileOpen,
  fileSave,
  isNativeFileSystemSupported,
  muteFSAbortError,
} from "./data/filesystem.ts";
export type { ExportOpts } from "./export.ts";
export { exportScene, getExportConfigFromAppState } from "./scene/export.ts";
export { decodeSvgBase64Payload, encodeSvgBase64Payload } from "./data/svg-payload.ts";
export type { ExportSceneConfig, ExportSceneData, ExportSceneOptions } from "./scene/export.ts";
export { exportToSvgString } from "./snapshot.ts";
export type { SvgStringOptions } from "./snapshot.ts";
export { createSvgDocument } from "./svg-document.ts";

export {
  restore,
  restoreAppState,
  restoreElement,
  restoreElements,
  restoreLibraryItems,
} from "./data/restore.ts";
export type { RestoredDataState } from "./data/restore.ts";
export {
  isValidExcalidrawData,
  isValidLibrary,
  serializeAsJSON,
  serializeLibraryAsJSON,
} from "./data/json.ts";
export {
  blobToArrayBuffer,
  canvasToBlob,
  dataURLToFile,
  generateIdFromFile,
  getDataURL,
  getMimeType,
  isSupportedImageFile,
  loadFromBlob,
  loadLibraryFromBlob,
  loadSceneOrLibraryFromBlob,
  normalizeFile,
  parseLibraryJSON,
} from "./data/blob.ts";
export {
  distributeLibraryItemsOnSquareGrid,
  getLibraryItemsHash,
  mergeLibraryItems,
  validateLibraryUrl,
} from "./data/library.ts";
export type {
  DiagramScene,
  ExportedDataState,
  ExportedLibraryData,
  ImportedDataState,
  ImportedLibraryData,
} from "./data/types.ts";

export {
  cleanAppStateForExport,
  clearAppStateForDatabase,
  clearAppStateForLocalStorage,
  getDefaultAppState,
} from "./app-state.ts";
export { getNormalizedZoom } from "./scene/normalize.ts";
export {
  centerScrollOn,
  constrainScrollState,
  getScrollToContentState,
  zoomToFitBounds,
} from "./viewport.ts";
export type { ViewportFit } from "./viewport.ts";

export { renderStaticScene } from "./renderer/static-scene.ts";
export { renderSceneToSvg } from "./renderer/static-svg-scene.ts";
export { renderInteractiveScene } from "./renderer/interactive-scene.ts";
export { Renderer } from "./scene/renderer.ts";
export { getScrollBars, isOverScrollBars } from "./scene/scrollbars.ts";
export type {
  InteractiveSceneApp,
  InteractiveSceneRenderConfig,
  RenderableElementsMap,
  SVGRenderConfig,
  StaticCanvasRenderConfig,
  StaticSceneRenderConfig,
} from "./scene/types.ts";

export { Fonts } from "./fonts/fonts.ts";
export { DEFAULT_FONT_ASSET_PATH, setFontAssetPath } from "./fonts/font-face.ts";
export type { FontFaceDescriptor } from "./fonts/font-face.ts";

export { CanvasError, ImageSceneDataError } from "./errors.ts";

export {
  convertToExcalidrawElements,
  getCommonBounds,
  getNonDeletedElements,
  getSceneVersion,
  getTextFromElements,
  hashElementsVersion,
  hashString,
  isInvisiblySmallElement,
  isLinearElement,
  newElementWith,
  bumpVersion,
} from "@excalidraw/element";
export type { ExcalidrawElementSkeleton } from "@excalidraw/element";
export { FONT_FAMILY, MIME_TYPES, THEME } from "@excalidraw/common";
export type {
  ExcalidrawElement,
  NonDeletedExcalidrawElement,
  Theme,
} from "@excalidraw/element/types";

export type {
  AppState,
  BinaryFileData,
  BinaryFiles,
  DataURL,
  LibraryItem,
  LibraryItems,
  NormalizedZoomValue,
  Zoom,
} from "./types.ts";
