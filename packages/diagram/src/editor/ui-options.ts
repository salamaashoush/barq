import type { NonDeletedExcalidrawElement, Theme } from "@excalidraw/element/types";

import type { AppState, BinaryFiles } from "../types.ts";
import type { OnExport } from "./actions/export.ts";

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

/** Excalidraw's `UIOptions`, as an app passes it. */
export interface UIOptions {
  canvasActions?: CanvasActions;
  tools?: { image?: boolean };
  dockedSidebarBreakpoint?: number;
}

/** `UIOptions` with every default filled in. */
export interface ResolvedUIOptions {
  canvasActions: {
    changeViewBackgroundColor: boolean;
    clearCanvas: boolean;
    export: false | ExportOpts;
    loadScene: boolean;
    saveToActiveFile: boolean;
    toggleTheme: boolean;
    saveAsImage: boolean;
  };
  tools: { image: boolean };
  dockedSidebarBreakpoint?: number;
}

/** Fills in Excalidraw's defaults, as its `<Excalidraw>` does before rendering. */
export const resolveUIOptions = (
  options: UIOptions | undefined,
  host: { theme?: Theme; onThemeChange?: unknown } = {},
): ResolvedUIOptions => {
  const given = options?.canvasActions;
  const exportOpts = given?.export;
  const toggleTheme = given?.toggleTheme ?? null;
  return {
    dockedSidebarBreakpoint: options?.dockedSidebarBreakpoint,
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
};

/**
 * What the host decides for the editor, which actions read as Excalidraw's
 * read `app.props`: a mode the host controls has no toggle in the menus.
 */
export interface EditorHost {
  UIOptions: ResolvedUIOptions;
  /** `viewModeEnabled` is a prop: the view mode toggle is hidden. */
  viewModeControlled: boolean;
  /** `zenModeEnabled` is a prop: the zen mode toggle is hidden. */
  zenModeControlled: boolean;
  /** Called instead of changing the theme, when the host owns it. */
  onThemeChange?: (theme: Theme) => void;
  /** Excalidraw's `aiEnabled`: the text-to-diagram and magic frame entries. */
  aiEnabled: boolean;
  /** Excalidraw's `generateLinkForSelection`, for "copy link to element". */
  generateLinkForSelection?: (id: string, type: "element" | "group") => string;
  /** Excalidraw's `onExport`: a save waits for it, showing its progress. */
  onExport?: OnExport;
  /** Excalidraw's `name` prop: the file name when the scene has none. */
  name?: string;
  /** What an unnamed scene's file is called before its date, translated. @default "Untitled" */
  untitledName?: string;
}

export const defaultEditorHost = (): EditorHost => ({
  UIOptions: resolveUIOptions(undefined),
  viewModeControlled: false,
  zenModeControlled: false,
  aiEnabled: true,
});
