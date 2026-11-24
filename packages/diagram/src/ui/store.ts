import { type Accessor, createSignal } from "@barqjs/core";

import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";

import type { DiagramEditor } from "../editor/editor.ts";
import type { AppState } from "../types.ts";

/** The selection as the panels read it: its elements, as of the last commit outside a gesture. */
export interface SelectionSnapshot {
  readonly elements: readonly NonDeletedExcalidrawElement[];
  /** The selected elements' ids and versions, which change when anything the panels read could. */
  readonly key: string;
}

const EMPTY_SELECTION: SelectionSnapshot = { elements: [], key: "" };

/**
 * The editor's state for its UI, as signals. The editor changes its state
 * synchronously and commits once per input event; this reads it after each
 * commit, in a microtask of its own, and writes only what changed. A key
 * nobody reads is never written, the selection is read again only between
 * gestures (a drag moves the selection but changes nothing the panels show),
 * and the geometry the stats panel follows only while it is open.
 */
export class EditorStore {
  private readonly fields = new Map<keyof AppState, (value: unknown) => void>();
  private readonly readers = new Map<keyof AppState, Accessor<unknown>>();
  private readonly setSelection: (value: SelectionSnapshot) => void;
  private readonly setGeometry: (value: number) => void;
  private readonly setHistory: (value: { canUndo: boolean; canRedo: boolean }) => void;
  private readonly setSceneEmpty: (value: boolean) => void;
  private scheduled = false;
  private disposed = false;
  private off: (() => void) | null = null;
  private current: DiagramEditor | null = null;

  public readonly selection: Accessor<SelectionSnapshot>;
  /** Changes on every commit while the stats panel is open, so it follows a drag. */
  public readonly geometry: Accessor<number>;
  public readonly history: Accessor<{ canUndo: boolean; canRedo: boolean }>;
  /** Whether the scene has never had an element, deleted ones included: the welcome screen's cue. */
  public readonly sceneEmpty: Accessor<boolean>;
  /**
   * Whether the UI reads the editor yet: from its first commit on, never
   * during the render a hydration has to match with the server's.
   */
  public readonly ready: Accessor<boolean>;
  private readonly setReady: (value: boolean) => void;

  /**
   * `initial` is what the UI shows before the editor exists: on the server,
   * and while the page hydrates.
   */
  public constructor(private readonly initial: AppState) {
    const [selection, setSelection] = createSignal<SelectionSnapshot>(EMPTY_SELECTION, {
      equals: (a, b) => a.key === b.key,
    });
    this.selection = selection;
    this.setSelection = setSelection;
    const [geometry, setGeometry] = createSignal(0);
    this.geometry = geometry;
    this.setGeometry = setGeometry;
    const [history, setHistory] = createSignal(
      { canUndo: false, canRedo: false },
      { equals: (a, b) => a.canUndo === b.canUndo && a.canRedo === b.canRedo },
    );
    this.history = history;
    this.setHistory = setHistory;
    const [sceneEmpty, setSceneEmpty] = createSignal(true);
    this.sceneEmpty = sceneEmpty;
    this.setSceneEmpty = setSceneEmpty;
    const [ready, setReady] = createSignal(false);
    this.ready = ready;
    this.setReady = setReady;
  }

  /**
   * The editor, once it is mounted. A computation reading it follows
   * `ready`, so what it renders first matches the server's.
   */
  public get editor(): DiagramEditor | null {
    return this.ready() ? this.current : null;
  }

  /** Follows the mounted editor from now on; the returned function stops. */
  public attach(editor: DiagramEditor): () => void {
    this.off?.();
    this.current = editor;
    this.off = editor.onChange(() => this.schedule());
    this.schedule();
    return () => {
      if (this.current !== editor) return;
      this.off?.();
      this.off = null;
      this.current = null;
    };
  }

  /** The editor's state, or the initial state before it exists. */
  public get snapshot(): AppState {
    return this.current?.state ?? this.initial;
  }

  /** A key of the editor's state, followed reactively. */
  public state<K extends keyof AppState>(key: K): AppState[K] {
    let read = this.readers.get(key);
    if (read === undefined) {
      const [value, setValue] = createSignal<unknown>(this.snapshot[key]);
      read = value;
      this.readers.set(key, value);
      this.fields.set(key, (next) => setValue(() => next));
    }
    return read() as AppState[K];
  }

  /** Reads the editor again at once, as a test or a commit outside an input event wants. */
  public refresh(): void {
    const editor = this.current;
    if (this.disposed || editor === null) return;
    const { state } = editor;
    for (const [key, write] of this.fields) {
      write(state[key]);
    }
    const gesture =
      state.selectedElementsAreBeingDragged ||
      state.resizingElement !== null ||
      state.isRotating ||
      state.isResizing ||
      state.newElement !== null;
    if (!gesture) {
      this.setSelection(this.readSelection(editor));
    }
    if (state.stats.open) {
      this.setGeometry(editor.scene.getSceneNonce() ?? 0);
    }
    this.setHistory({
      canUndo: !editor.history.isUndoStackEmpty,
      canRedo: !editor.history.isRedoStackEmpty,
    });
    this.setSceneEmpty(editor.scene.getElementsIncludingDeleted().length === 0);
    this.setReady(true);
  }

  public dispose(): void {
    this.disposed = true;
    this.off?.();
    this.off = null;
    this.current = null;
  }

  private schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    // out of whatever is running: a commit may come from an effect
    queueMicrotask(() => {
      this.scheduled = false;
      this.refresh();
    });
  }

  private readSelection(editor: DiagramEditor): SelectionSnapshot {
    const elements = editor.scene.getSelectedElements({
      selectedElementIds: editor.state.selectedElementIds,
      includeBoundTextElement: true,
    });
    const editing = editor.state.editingTextElement;
    if (elements.length === 0 && !editing) {
      return EMPTY_SELECTION;
    }
    const edited = editing ? (editor.scene.getElement(editing.id) ?? editing) : null;
    let key = edited ? `${edited.id}:${edited.version};` : "";
    for (const element of elements) key += `${element.id}:${element.version};`;
    return { elements, key };
  }
}
