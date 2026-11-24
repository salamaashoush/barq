import { type Child, createContext, getContext } from "@barqjs/core";

import { isDarwin } from "@excalidraw/common";

import { getShortcutFromShortcutName, type ShortcutName } from "./shortcuts.ts";

import type { Theme } from "@excalidraw/element/types";
import type { Translate } from "../i18n.ts";
import type { Action, ActionLabel, ActionName } from "../editor/types.ts";
import type { ResolvedUIOptions } from "../editor/ui-options.ts";
import type { AppState } from "../types.ts";
import type { EditorStore } from "./store.ts";

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
  /** A theme the host passes: the main menu offers no toggle unless `onThemeChange` listens. */
  theme?: Theme;
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
  /** A shortcut, written for the platform, in the language's key names. */
  shortcut: (name: ShortcutName) => string;
  /** Gives the keyboard back to the canvas. */
  focusCanvas: () => void;
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
}): DiagramUI => {
  const { store, t } = options;
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
      editor.batch(() => editor.actionManager.executeAction(action, value));
    },
    runNamed: (name) => {
      const editor = store.editor;
      const action = editor?.actionManager.actions.get(name);
      if (editor && action) {
        editor.batch(() => editor.actionManager.executeAction(action));
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
    shortcut: (name) => getShortcutFromShortcutName(name, t, 0, store.ready() && isDarwin),
    focusCanvas: () => store.editor?.focusContainer(),
  };
};
