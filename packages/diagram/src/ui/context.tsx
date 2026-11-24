import { type Accessor, type Child, createContext, createSignal, getContext } from "@barqjs/core";

import { isDarwin } from "@excalidraw/common";

import { getShortcutFromShortcutName, type ShortcutName } from "./shortcuts.ts";

import type { Theme } from "@excalidraw/element/types";
import type { Translate } from "../i18n.ts";
import type { TextToDiagramOptions } from "../ttd/types.ts";
import type { DiagramToCodeOptions } from "../editor/magic-frame.ts";
import type { Action, ActionLabel, ActionName } from "../editor/types.ts";
import { isDefaultUIEnabled, isUIControlEnabled } from "../editor/ui-options.ts";
import type { ResolvedUIOptions } from "../editor/ui-options.ts";
import type { AppState, UIConfig, UIControl, UserToFollow } from "../types.ts";
import type { HostSlots } from "./host-children.ts";
import type { EditorStore } from "./store.ts";
import type { ViewportStatusFrame } from "./viewport-status-frame.tsx";

/** What a slot renders with: Excalidraw's `(isMobile, appState)`. */
export type RenderSlot = (isMobile: boolean, appState: AppState) => Child;

/** The host's choices the UI reads, Excalidraw's props by its names. */
export interface UIHost {
  UIOptions: ResolvedUIOptions;
  renderTopLeftUI?: RenderSlot;
  renderTopRightUI?: RenderSlot;
  renderCustomStats?: (elements: readonly unknown[], appState: AppState) => Child;
  /** Excalidraw's `aiEnabled`: the text-to-diagram and magic frame entries. */
  aiEnabled: boolean;
  /** The app's text-to-diagram backend; the dialog's chat tab is offered only with it. */
  textToDiagram?: TextToDiagramOptions;
  /** The app's wireframe-to-code backend; the magic frame is offered only with it. */
  diagramToCode?: DiagramToCodeOptions;
  /** A theme the host passes: the main menu offers no toggle unless `onThemeChange` listens. */
  theme?: Theme;
  /** Excalidraw's `libraryReturnUrl`: where the library site sends an installed library back to. */
  libraryReturnUrl?: string;
  /** Where the library's publish dialog sends a library; without it the dialog is not offered. */
  libraryPublishEndpoint?: string;
  /** Excalidraw's `isCollaborating`: the laser pointer gets a button beside the toolbar. */
  isCollaborating: boolean;
  /** The collaborator followed, whose avatar the user list marks. */
  userToFollow: UserToFollow | null;
  /** The frame around the canvas and its badge. */
  viewportStatusFrame: ViewportStatusFrame | null;
  /** Below the user list, in its menu on a desktop and in the main menu on a phone. */
  currentUserControls?: (isMobile: boolean) => Child;
  /** Excalidraw's `ui`: whether the default UI renders, or which of its controls. */
  ui?: boolean | UIConfig;
  /** What the host's children hand to the UI's places: the main menu's entries, the footer, ... */
  slots: Partial<HostSlots>;
  /** Excalidraw's `showDeprecatedFonts`: the font picker offers the fonts Excalidraw retired. */
  showDeprecatedFonts: boolean;
}

export interface DiagramUI {
  store: EditorStore;
  /** A translated string, in the language of the moment. */
  t: Translate;
  /** The language, Excalidraw's `langCode`. */
  langCode: () => string;
  /** Whether the UI runs right to left. */
  rtl: () => boolean;
  host: () => UIHost;
  /** Runs an action on the mounted editor; nothing before it mounts. */
  run: <T>(action: Action<T>, value?: T | null) => void;
  /** Runs one of the editor's actions by its name, as undo and redo, which belong to its history. */
  runNamed: (name: ActionName) => void;
  /** Whether an action is offered now; read inside a computation, it follows the state. */
  isEnabled: <T>(action: Action<T>) => boolean;
  /** An action's name in a menu, translated. */
  label: <T>(action: Action<T>) => string;
  /** A shortcut, written for the platform, in the language's key names; `index` picks one of several. */
  shortcut: (name: ShortcutName, index?: number) => string;
  /** Gives the keyboard back to the canvas. */
  focusCanvas: () => void;
  /** Whether the default UI renders, under `ui`. */
  defaultUIEnabled: () => boolean;
  /** Whether a default control renders, under `ui`. */
  uiControlEnabled: (control: UIControl) => boolean;
  /** The sidebar docked beside the canvas, whose room the rest of the UI gives up. */
  dockedSidebar: Accessor<string | null>;
  /** Sets the docked sidebar; `null` from `owner` clears it only while it is `owner`'s. */
  setDockedSidebar: (name: string | null, owner: string) => void;
  /** What the host gave as children that renders as it is, in the UI's layer. */
  hostChildren: () => readonly unknown[];
}

export const DiagramUIContext = createContext<DiagramUI | null>(null);

export function useDiagramUI(): DiagramUI {
  const ui = getContext(DiagramUIContext);
  if (ui === null || ui === undefined) {
    throw new Error("The diagram editor's UI is rendered inside <DiagramEditor>.");
  }
  return ui;
}

/** The context value for a store and a translator. */
export const createDiagramUI = (options: {
  store: EditorStore;
  t: Translate;
  langCode: () => string;
  rtl: () => boolean;
  host: () => UIHost;
  hostChildren?: () => readonly unknown[];
}): DiagramUI => {
  const { store, t } = options;
  const [dockedSidebar, setDocked] = createSignal<string | null>(null);
  const resolveLabel = (label: ActionLabel | undefined): string => {
    if (label === undefined) return "";
    if (typeof label === "string") return t(label);
    const editor = store.editor;
    if (editor === null) return "";
    return t(label(editor.scene.getElementsIncludingDeleted(), editor.state, editor));
  };
  return {
    ...options,
    run: (action, value = null) => {
      const editor = store.editor;
      if (editor === null) return;
      editor.batch(() => editor.actionManager.executeAction(action, value, "ui"));
    },
    runNamed: (name) => {
      const editor = store.editor;
      const action = editor?.actionManager.actions.get(name);
      if (editor && action) {
        editor.batch(() => editor.actionManager.executeAction(action, null, "ui"));
      }
    },
    isEnabled: (action) => {
      // subscribed to what a predicate can read
      store.selection();
      store.state("viewModeEnabled");
      store.state("openDialog");
      store.state("height");
      const editor = store.editor;
      return editor !== null && editor.actionManager.isActionEnabled(action as Action);
    },
    label: (action) => {
      store.selection();
      store.state("theme");
      return resolveLabel(action.label);
    },
    // the platform's key names once the page runs: a server knows no platform,
    // and the markup it sent is what hydrates
    shortcut: (name, index = 0) =>
      getShortcutFromShortcutName(name, t, index, store.ready() && isDarwin),
    focusCanvas: () => store.editor?.focusContainer(),
    defaultUIEnabled: () => isDefaultUIEnabled(options.host().ui),
    uiControlEnabled: (control) => isUIControlEnabled(control, options.host().ui),
    dockedSidebar,
    setDockedSidebar: (name, owner) => {
      if (name !== null || dockedSidebar() === owner) setDocked(name);
    },
    hostChildren: options.hostChildren ?? (() => []),
  };
};
