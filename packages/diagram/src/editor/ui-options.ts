import type { EditorInterface } from "@excalidraw/common";
import type { OnDuplicateData } from "@excalidraw/element";
import type {
  ExcalidrawElement,
  NonDeletedExcalidrawElement,
  Theme,
} from "@excalidraw/element/types";

import type { ClipboardData } from "../clipboard.ts";

import type {
  AppState,
  BinaryFiles,
  ForcedActiveTool,
  InteractionConfig,
  OnUserFollowedPayload,
  PointerUpdatePayload,
  UIConfig,
  UIControl,
  UserToFollow,
  Zoom,
} from "../types.ts";
import type { OnExport } from "./actions/export.ts";
import type { PointerDownState } from "./types.ts";
import type { DiagramToCodeOptions } from "./magic-frame.ts";
import type { EmbeddableSandbox, ValidateEmbeddable } from "./embeds.ts";

/** What the export dialog offers, Excalidraw's `ExportOpts`. */
export interface ExportOpts {
  saveFileToDisk?: boolean;
  onExportToBackend?: (
    exportedElements: readonly NonDeletedExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
  ) => void;
  /** More cards in the export dialog, beside saving to disk: what the UI renders there. */
  renderCustomUI?: (
    exportedElements: readonly NonDeletedExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
  ) => unknown;
}

/** The canvas actions the menus offer, each on unless turned off. Excalidraw's `CanvasActions`. */
export interface CanvasActions {
  changeViewBackgroundColor?: boolean;
  clearCanvas?: boolean;
  export?: false | ExportOpts;
  loadScene?: boolean;
  saveToActiveFile?: boolean;
  /**
   * On when the theme is the editor's own (no `theme` prop) or the host
   * listens for the change (`onThemeChange`); off otherwise.
   */
  toggleTheme?: boolean | null;
  saveAsImage?: boolean;
}

export interface ToolOptions {
  image?: boolean;
}

/** Excalidraw's `UIOptions`, as an app passes it. */
export interface UIOptions {
  canvasActions?: CanvasActions;
  tools?: ToolOptions;
  dockedSidebarBreakpoint?: number;
  /** Decides the layout from the editor's size: a phone's, a tablet's (compact) or a desktop's. */
  getFormFactor?: (editorWidth: number, editorHeight: number) => EditorInterface["formFactor"];
}

export type ResolvedCanvasActions = {
  changeViewBackgroundColor: boolean;
  clearCanvas: boolean;
  export: false | ExportOpts;
  loadScene: boolean;
  saveToActiveFile: boolean;
  toggleTheme: boolean;
  saveAsImage: boolean;
};

export interface ResolvedTools {
  image: boolean;
}

/** `UIOptions` with every default filled in. */
export interface ResolvedUIOptions {
  canvasActions: ResolvedCanvasActions;
  tools: ResolvedTools;
  dockedSidebarBreakpoint?: number;
  getFormFactor?: (editorWidth: number, editorHeight: number) => EditorInterface["formFactor"];
}

export interface ThemeHost {
  theme?: Theme;
  onThemeChange?: unknown;
}

/** Fills in Excalidraw's defaults, as its `<Excalidraw>` does before rendering. */
export function resolveUIOptions(
  options: UIOptions | undefined,
  host: ThemeHost = {},
): ResolvedUIOptions {
  const given = options?.canvasActions;
  const exportOpts = given?.export;
  const toggleTheme = given?.toggleTheme ?? null;
  return {
    dockedSidebarBreakpoint: options?.dockedSidebarBreakpoint,
    getFormFactor: options?.getFormFactor,
    canvasActions: {
      changeViewBackgroundColor: given?.changeViewBackgroundColor ?? true,
      clearCanvas: given?.clearCanvas ?? true,
      export:
        exportOpts === false
          ? false
          : { ...exportOpts, saveFileToDisk: exportOpts?.saveFileToDisk ?? true },
      loadScene: given?.loadScene ?? true,
      saveToActiveFile: given?.saveToActiveFile ?? true,
      toggleTheme:
        toggleTheme === null
          ? host.theme === undefined || host.onThemeChange !== undefined
          : toggleTheme,
      saveAsImage: given?.saveAsImage ?? true,
    },
    tools: { image: options?.tools?.image ?? true },
  };
}

export interface LinkOpenDetail {
  nativeEvent: MouseEvent | PointerEvent;
}

/**
 * What the host decides for the editor, which actions read as Excalidraw's
 * read `app.props`: a mode the host controls has no toggle in the menus.
 */
export interface EditorHost {
  UIOptions: ResolvedUIOptions;
  /** `viewModeEnabled` is a prop: the view mode toggle is hidden. */
  viewModeControlled: boolean;
  /** The `viewModeEnabled` prop, which a non-interactive editor overrides and gives back. */
  viewModeEnabled?: boolean;
  /** `zenModeEnabled` is a prop: the zen mode toggle is hidden. */
  zenModeControlled: boolean;
  /** Called instead of changing the theme, when the host owns it. */
  onThemeChange?: (theme: Theme) => void;
  /** Excalidraw's `aiEnabled`: the text-to-diagram and magic frame entries. */
  aiEnabled: boolean;
  /** The app's wireframe-to-code backend; the magic frame generates only with it. */
  diagramToCode?: DiagramToCodeOptions;
  /** Excalidraw's `generateLinkForSelection`, for "copy link to element". */
  generateLinkForSelection?: (id: string, type: "element" | "group") => string;
  /** Excalidraw's `onExport`: a save waits for it, showing its progress. */
  onExport?: OnExport;
  /** Excalidraw's `name` prop: the file name when the scene has none. */
  name?: string;
  /** What an unnamed scene's file is called before its date, translated. @default "Untitled" */
  untitledName?: string;
  /** Excalidraw's `validateEmbeddable`: which links an embeddable shows. @default Excalidraw's allow-list */
  validateEmbeddable?: ValidateEmbeddable;
  /** The `sandbox` of an embeddable's iframe. @default Excalidraw's */
  embeddableSandbox?: EmbeddableSandbox;
  /** Excalidraw's `isCollaborating`: the laser pointer gets a button of its own beside the toolbar. */
  isCollaborating: boolean;
  /**
   * The collaborator followed, Excalidraw's controlled `userToFollow`: the
   * editor never sets it, it asks through `onUserFollow`.
   */
  userToFollow: UserToFollow | null;
  /** Excalidraw's `onPointerUpdate`: the pointer as it moves, presses and releases, in scene coordinates. */
  onPointerUpdate?: (payload: PointerUpdatePayload) => void;
  /** Excalidraw's `onScrollChange`: the viewport moved or zoomed. */
  onScrollChange?: (scrollX: number, scrollY: number, zoom: Zoom) => void;
  /** Excalidraw's `onUserFollow`: a request to follow a collaborator, or to stop. */
  onUserFollow?: (payload: OnUserFollowedPayload) => void;
  /** The UI's language, Excalidraw's `langCode`: a right-to-left one mirrors the measured UI's sides. */
  langCode?: string;
  /** Excalidraw's `interaction`: `false`, or what stays enabled, makes the editor take no input. @default true */
  interaction?: boolean | InteractionConfig;
  /** Excalidraw's `activeTool`: the tool the host forces, which the user cannot switch from. */
  activeTool?: ForcedActiveTool;
  /** Excalidraw's `onPaste`: returning `false` keeps the paste from the editor. */
  onPaste?: (data: ClipboardData, event: ClipboardEvent | null) => Promise<boolean> | boolean;
  /**
   * Excalidraw's `onDuplicate`: sees each duplication (drag, keys, paste,
   * library) and returns the elements to use instead, or `false` to cancel it.
   */
  onDuplicate?: (
    nextElements: readonly ExcalidrawElement[],
    prevElements: readonly ExcalidrawElement[],
    data: OnDuplicateData,
  ) => ExcalidrawElement[] | void | false;
  /** Excalidraw's `onLinkOpen`: an element's link opened; `preventDefault()` keeps the editor from opening it. */
  onLinkOpen?: (element: NonDeletedExcalidrawElement, event: CustomEvent<LinkOpenDetail>) => void;
  /** Excalidraw's `onPointerDown` on the canvas. */
  onPointerDown?: (activeTool: AppState["activeTool"], pointerDownState: PointerDownState) => void;
  /** Excalidraw's `onPointerUp` after a press on the canvas. */
  onPointerUp?: (activeTool: AppState["activeTool"], pointerDownState: PointerDownState) => void;
  /** Excalidraw's `generateIdForFile`: an inserted image's file id. @default the file's digest */
  generateIdForFile?: (file: File) => string | Promise<string>;
  /** Excalidraw's `handleKeyboardGlobally`: keys pressed anywhere in the document reach the editor. */
  handleKeyboardGlobally: boolean;
  /** Excalidraw's `detectScroll`: the page's scroll moves the editor's offsets. @default true */
  detectScroll: boolean;
  /** Excalidraw's `renderScrollbars`. */
  renderScrollbars: boolean;
  /** Excalidraw's `ui`: whether the default UI renders, or which of its controls. @default true */
  ui?: boolean | UIConfig;
}

export function defaultEditorHost(): EditorHost {
  return {
    UIOptions: resolveUIOptions(undefined),
    viewModeControlled: false,
    zenModeControlled: false,
    aiEnabled: true,
    isCollaborating: false,
    userToFollow: null,
    handleKeyboardGlobally: false,
    detectScroll: true,
    renderScrollbars: false,
  };
}

/** Whether the default UI renders: not with `ui` `false` or `{ enabled }`. */
export function isDefaultUIEnabled(ui: boolean | UIConfig | undefined): boolean {
  return ui !== false && !(typeof ui === "object" && "enabled" in ui);
}

/** Whether a default UI control renders under `ui`. */
export function isUIControlEnabled(
  control: UIControl,
  ui: boolean | UIConfig | undefined,
): boolean {
  if (typeof ui === "object") {
    return "enabled" in ui
      ? (ui.enabled as Partial<Record<UIControl, boolean>>)[control] === true
      : (ui.disabled as Partial<Record<UIControl, boolean>>)[control] !== true;
  }
  return ui !== false;
}
