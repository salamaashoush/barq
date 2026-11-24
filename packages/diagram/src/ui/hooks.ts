import {
  type Accessor,
  type Child,
  createContext,
  createMemo,
  createRenderEffect,
  createSignal,
  getContext,
  provide,
} from "@barqjs/core";
import { deriveStylesPanelMode, type EditorInterface } from "@excalidraw/common";

import { DiagramUIContext, useDiagramUI } from "./context.tsx";

import type { DiagramEditorApi } from "../editor/editor.ts";
import type { Translate } from "../i18n.ts";
import type { AppState } from "../types.ts";

/** What `ExcalidrawAPIProvider` shares: the API of the editor inside it, once it is mounted. */
export interface ExcalidrawAPIHandle {
  api: Accessor<DiagramEditorApi | null>;
  setApi: (api: DiagramEditorApi | null) => void;
}

/**
 * Excalidraw's `ExcalidrawAPIContext`: the API of the `<DiagramEditor>`
 * under an `ExcalidrawAPIProvider`, for components outside the editor.
 */
export const ExcalidrawAPIContext = createContext<ExcalidrawAPIHandle | null>(null);

export interface ChildrenProps {
  children?: Child;
}

/**
 * Excalidraw's `ExcalidrawAPIProvider`: lets `useExcalidrawAPI` (and the
 * hooks on it) work outside the editor, for the `<DiagramEditor>` inside it.
 */
export function ExcalidrawAPIProvider(props: ChildrenProps) {
  const [api, setApi] = createSignal<DiagramEditorApi | null>(null);
  return provide(
    ExcalidrawAPIContext,
    () => ({ api, setApi: (next: DiagramEditorApi | null) => setApi(() => next) }),
    () => props.children,
  );
}

/**
 * Excalidraw's `useExcalidrawAPI`: the editor's API, inside the editor or
 * under an `ExcalidrawAPIProvider`; `null` until it is mounted and after.
 */
export function useExcalidrawAPI(): Accessor<DiagramEditorApi | null> {
  const ui = getContext(DiagramUIContext);
  if (ui) {
    return () => ui.store.editor?.api ?? null;
  }
  const handle = getContext(ExcalidrawAPIContext);
  return handle ? handle.api : () => null;
}

/** Excalidraw's `useEditorInterface`, inside the editor: its form factor, touch, and whether a sidebar fits. */
export function useEditorInterface(): Accessor<EditorInterface> {
  return useDiagramUI().store.editorInterface;
}

/** Excalidraw's `useStylesPanelMode`, inside the editor: `"full"`, `"compact"` or `"mobile"`. */
export function useStylesPanelMode(): Accessor<ReturnType<typeof deriveStylesPanelMode>> {
  const editorInterface = useEditorInterface();
  return () => deriveStylesPanelMode(editorInterface());
}

export interface I18n {
  t: Translate;
  langCode: () => string;
}

/** Excalidraw's `useI18n`, inside the editor: the translator and the language. */
export function useI18n(): I18n {
  const ui = useDiagramUI();
  return { t: ui.t, langCode: ui.langCode };
}

type StateSelector<T> = keyof AppState | (keyof AppState)[] | ((appState: AppState) => T);

function select<T>(selector: StateSelector<T>, appState: AppState): unknown {
  return typeof selector === "function"
    ? selector(appState)
    : Array.isArray(selector)
      ? appState
      : appState[selector];
}

/**
 * Excalidraw's `useExcalidrawStateValue`: a key, keys (the whole state, when
 * any changes) or a selector of the app state, followed; `undefined` until
 * the editor is mounted. The selector is read once.
 */
export function useExcalidrawStateValue<K extends keyof AppState>(
  prop: K,
): Accessor<AppState[K] | undefined>;
export function useExcalidrawStateValue(props: (keyof AppState)[]): Accessor<AppState | undefined>;
export function useExcalidrawStateValue<T>(
  selector: (appState: AppState) => T,
): Accessor<T | undefined>;
export function useExcalidrawStateValue<T>(selector: StateSelector<T>): Accessor<unknown> {
  const api = useExcalidrawAPI();
  const [version, setVersion] = createSignal(0);
  createRenderEffect(api, (current) => {
    if (!current || current.isDestroyed) return () => {};
    // the editor calls it in its commit, which may run in an effect
    return current.onStateChange(selector as never, () =>
      queueMicrotask(() => setVersion((value) => value + 1)),
    );
  });
  return createMemo(() => {
    version();
    const current = api();
    if (!current || current.isDestroyed) return undefined;
    return select(selector, current.getAppState());
  });
}

/**
 * Excalidraw's `useOnExcalidrawStateChange`: `callback` hears a key, keys or
 * a selector of the app state change, for as long as the component lives.
 */
export function useOnExcalidrawStateChange<T>(
  selector: StateSelector<T>,
  callback: (value: never, appState: AppState) => void,
): void {
  const api = useExcalidrawAPI();
  createRenderEffect(api, (current) => {
    if (!current || current.isDestroyed) return () => {};
    return current.onStateChange(selector as never, callback as never);
  });
}
