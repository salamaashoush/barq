import type {
  CaptureUpdateActionType,
  LinearElementEditor,
  ListMarkerAdvance,
  MaybeTransformHandleType,
  Store,
} from "@excalidraw/element";
import type {
  ExcalidrawElement,
  ExcalidrawTextElement,
  NonDeleted,
  OrderedExcalidrawElement,
} from "@excalidraw/element/types";

import type { isOverScrollBars } from "../scene/scrollbars.ts";
import type { DiagramEditor } from "./editor.ts";
import type { TranslationKey } from "../i18n.ts";
import type { AppState, BinaryFiles } from "../types.ts";

/**
 * What `@excalidraw/element` calls `app`: Excalidraw's whole `App` class by
 * type, of which the element package reads only the state, the scene, the
 * grid size and the last pointer position. The editor hands itself over as it.
 */
export type ElementApp = Parameters<typeof LinearElementEditor.handlePointerDown>[1];

/**
 * The pointer event `@excalidraw/element` types as React's: it reads only the
 * native event's fields, which a DOM `PointerEvent` has.
 */
export type ReactPointerEvent = Parameters<typeof LinearElementEditor.handlePointerDown>[0];

/** The pointer event `@excalidraw/element` types as React's canvas event. */
export type ReactCanvasPointerEvent = Parameters<
  typeof LinearElementEditor.handlePointerMoveInEditMode
>[0];

/** What `@excalidraw/element`'s `Store` is constructed with. */
export type StoreApp = ConstructorParameters<typeof Store>[0];

/** A pointer interaction, from its pointer down to its pointer up. Excalidraw's, key for key. */
export type PointerDownState = Readonly<{
  /** Where the pointer went down, in scene coordinates. */
  origin: Readonly<{ x: number; y: number }>;
  /** `origin` on the grid, when the grid is on. */
  originInGrid: Readonly<{ x: number; y: number }>;
  scrollbars: ReturnType<typeof isOverScrollBars>;
  lastCoords: { x: number; y: number };
  /** The elements as they were at pointer down. */
  originalElements: Map<string, NonDeleted<ExcalidrawElement>>;
  resize: {
    handleType: MaybeTransformHandleType;
    isResizing: boolean;
    offset: { x: number; y: number };
    arrowDirection: "origin" | "end";
    /** The selection's centre at pointer down, which rotation turns around. */
    center: { x: number; y: number };
  };
  hit: {
    element: NonDeleted<ExcalidrawElement> | null;
    allHitElements: NonDeleted<ExcalidrawElement>[];
    wasAddedToSelection: boolean;
    /** What an alt-click selects instead: the unit below the selected one. */
    cycleTarget: NonDeleted<ExcalidrawElement> | null;
    hasBeenDuplicated: boolean;
    advancedListMarkers: readonly ListMarkerAdvance[];
    editedTextId: ExcalidrawTextElement["id"] | null;
    hasHitCommonBoundingBoxOfSelectedElements: boolean;
    /** The pointer went down on the selected arrow's label. */
    arrowLabel: boolean;
  };
  withCmdOrCtrl: boolean;
  drag: {
    hasOccurred: boolean;
    offset: { x: number; y: number } | null;
    /** `origin`, until an alt-drag duplicates and restarts the drag from there. */
    origin: { x: number; y: number };
    lastOffset: { x: number; y: number };
    blockDragging: boolean;
  };
  eventListeners: {
    onMove: null | ((event: PointerEvent) => void);
    onUp: null | ((event: PointerEvent) => void);
    onKeyDown: null | ((event: KeyboardEvent) => void);
    onKeyUp: null | ((event: KeyboardEvent) => void);
  };
  boxSelection: {
    hasOccurred: boolean;
  };
}>;

/** What an action asks of the editor; `false` cancels it. */
export type ActionResult =
  | {
      elements?: readonly ExcalidrawElement[] | null;
      appState?: Partial<AppState> | null;
      files?: BinaryFiles | null;
      /** `files` replaces the scene's files rather than adding to them. */
      replaceFiles?: boolean;
      captureUpdate: CaptureUpdateActionType;
    }
  | false;

export type ActionName =
  | "sendBackward"
  | "bringForward"
  | "sendToBack"
  | "bringToFront"
  | "selectAll"
  | "gridMode"
  | "objectsSnapMode"
  | "copy"
  | "cut"
  | "paste"
  | "copyAsPng"
  | "copyAsSvg"
  | "copyText"
  | "cropEditor"
  | "selectAllElementsInFrame"
  | "removeAllElementsFromFrame"
  | "updateFrameRendering"
  | "wrapSelectionInFrame"
  | "changeFontSize"
  | "decreaseFontSize"
  | "increaseFontSize"
  | "changeFontFamily"
  | "changeTextAlign"
  | "changeVerticalAlign"
  | "autoResize"
  | "undo"
  | "redo"
  | "finalize"
  | "duplicateSelection"
  | "deleteSelectedElements"
  | "zoomIn"
  | "zoomOut"
  | "resetZoom"
  | "zoomToFit"
  | "zoomToFitSelection"
  | "zoomToFitSelectionInViewport"
  | "group"
  | "ungroup"
  | "alignTop"
  | "alignBottom"
  | "alignLeft"
  | "alignRight"
  | "alignVerticallyCentered"
  | "alignHorizontallyCentered"
  | "distributeHorizontally"
  | "distributeVertically"
  | "deselect"
  | "unlockAllElements"
  | "toggleElementLock"
  | "toggleLinearEditor"
  | "changeStrokeColor"
  | "changeBackgroundColor"
  | "changeFillStyle"
  | "changeStrokeWidth"
  | "changeSloppiness"
  | "changeFreedrawMode"
  | "changeStrokeStyle"
  | "changeOpacity"
  | "changeRoundness"
  | "changeArrowhead"
  | "changeArrowType"
  | "flipHorizontal"
  | "flipVertical"
  | "copyStyles"
  | "pasteStyles"
  | "bindText"
  | "unbindText"
  | "wrapTextInContainer"
  | "togglePolygon"
  | "arrowBinding"
  | "midpointSnapping"
  | "zenMode"
  | "viewMode"
  | "stats"
  | "minimap"
  | "showHints"
  | "toggleTheme"
  | "toggleShapeSwitch"
  | "toggleShortcuts"
  | "commandPalette"
  | "searchMenu"
  | "clearCanvas"
  | "changeViewBackgroundColor"
  | "changeProjectName"
  | "hyperlink"
  | "copyElementLink"
  | "linkToElement"
  | "addToLibrary"
  | "saveToActiveFile"
  | "saveFileToDisk"
  | "loadScene"
  | "imageExport"
  | "jsonExport"
  | "changeExportScale"
  | "changeExportBackground"
  | "changeExportEmbedScene"
  | "exportWithDarkMode";

/** What an action is called in a menu: a translation key, or one chosen from the state. */
export type ActionLabel =
  | TranslationKey
  | ((
      elements: readonly ExcalidrawElement[],
      appState: Readonly<AppState>,
      editor: DiagramEditor,
    ) => TranslationKey);

/**
 * An editing operation: Excalidraw's action, without its panel. `perform`
 * reads the scene and the state and returns what changes; the editor applies
 * it. `keyTest` is its keyboard shortcut.
 */
export interface Action<TData = unknown> {
  name: ActionName;
  /** Its name in menus and the command palette, Excalidraw's `label`. */
  label?: ActionLabel;
  /** More words the command palette finds it by. */
  keywords?: readonly string[];
  /** For a toggle, whether it is on. */
  checked?: (appState: Readonly<AppState>) => boolean;
  /** What the live region announces once the action has run; nothing when empty. */
  announcement: string;
  perform: (
    elements: readonly OrderedExcalidrawElement[],
    appState: Readonly<AppState>,
    formData: TData | null,
    editor: DiagramEditor,
  ) => ActionResult | Promise<ActionResult>;
  keyPriority?: number;
  keyTest?: (
    event: KeyboardEvent,
    appState: AppState,
    elements: readonly ExcalidrawElement[],
    editor: DiagramEditor,
  ) => boolean;
  predicate?: (
    elements: readonly ExcalidrawElement[],
    appState: AppState,
    editor: DiagramEditor,
  ) => boolean;
  /** Runs in view mode too. */
  viewMode?: boolean;
}
