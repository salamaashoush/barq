/**
 * Real-time collaboration over a Yjs document, `@barqjs/lexical/collaboration`.
 *
 * Its own entry point because it imports `@lexical/yjs` and `yjs`, which an
 * editor that is not collaborative should not load.
 */

import {
  Show,
  createContext,
  createEffect,
  createMemo,
  getContext,
  getOwner,
  onCleanup,
  untrack,
} from "@barqjs/core";
import { type JSX, Portal } from "@barqjs/web";
import {
  type BaseBinding,
  type Binding,
  type BindingV2,
  CLEAR_DIFF_VERSIONS_COMMAND__EXPERIMENTAL,
  CONNECTED_COMMAND,
  DIFF_VERSIONS_COMMAND__EXPERIMENTAL,
  type ExcludedProperties,
  type Provider,
  type SyncCursorPositionsFn,
  TOGGLE_CONNECT_COMMAND,
  createBindingV2__EXPERIMENTAL,
  createUndoManager,
  createYjsBinding,
  initLocalState,
  removeCursorHighlightRule,
  renderSnapshot__EXPERIMENTAL,
  setLocalStateFocus,
  syncCursorPositions,
  syncLexicalUpdateToYjs,
  syncLexicalUpdateToYjsV2__EXPERIMENTAL,
  syncYjsChangesToLexical,
  syncYjsChangesToLexicalV2__EXPERIMENTAL,
  syncYjsStateToLexicalV2__EXPERIMENTAL,
} from "@lexical/yjs";
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  BLUR_COMMAND,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  CAN_USE_DOM,
  COMMAND_PRIORITY_EDITOR,
  FOCUS_COMMAND,
  HISTORY_MERGE_TAG,
  type InitialEditorStateType,
  type LexicalEditor,
  REDO_COMMAND,
  SKIP_COLLAB_TAG,
  UNDO_COMMAND,
  getActiveElement,
  mergeRegister,
  registerEventListeners,
} from "lexical";
import {
  type Doc,
  type Snapshot,
  type Transaction,
  UndoManager,
  type XmlElement,
  type XmlText,
} from "yjs";

import { useLexicalEditor } from "./context.ts";
import { mirror } from "./hooks.ts";

/**
 * The local user's name and cursor colour, whether collaboration is on, and
 * the Yjs documents the editors under one `LexicalCollaboration` share.
 */
export interface CollaborationContextType {
  color: string;
  isCollabActive: boolean;
  name: string;
  yjsDocMap: Map<string, Doc>;
}

const ENTRIES: ReadonlyArray<readonly [string, string]> = [
  ["Cat", "rgb(125, 50, 0)"],
  ["Dog", "rgb(100, 0, 0)"],
  ["Rabbit", "rgb(150, 0, 0)"],
  ["Frog", "rgb(200, 0, 0)"],
  ["Fox", "rgb(200, 75, 0)"],
  ["Hedgehog", "rgb(0, 75, 0)"],
  ["Pigeon", "rgb(0, 125, 0)"],
  ["Squirrel", "rgb(75, 100, 0)"],
  ["Bear", "rgb(125, 100, 0)"],
  ["Tiger", "rgb(0, 0, 150)"],
  ["Leopard", "rgb(0, 0, 200)"],
  ["Zebra", "rgb(0, 0, 250)"],
  ["Wolf", "rgb(0, 100, 150)"],
  ["Owl", "rgb(0, 100, 100)"],
  ["Gull", "rgb(100, 0, 100)"],
  ["Squid", "rgb(150, 0, 150)"],
];

let picked: readonly [string, string] | undefined;

// Picked once per page. A server render takes the first, so it never reads
// `Math.random()` while prerendering; the browser picks its own.
function randomEntry(): readonly [string, string] {
  const fallback = ENTRIES[0] as readonly [string, string];
  if (!CAN_USE_DOM) return fallback;
  picked ??= ENTRIES[Math.floor(Math.random() * ENTRIES.length)] ?? fallback;
  return picked;
}

/** A fresh collaboration context with a placeholder name and colour. */
export function newContext(): CollaborationContextType {
  const [name, color] = randomEntry();
  return { color, isCollabActive: false, name, yjsDocMap: new Map() };
}

export const CollaborationContext = createContext<CollaborationContextType | undefined>(
  undefined,
  "barq-lexical-collaboration",
);

export interface LexicalCollaborationProps {
  children?: JSX.Element;
}

/** One collaboration context for the editors inside, which share its Yjs documents. */
export function LexicalCollaboration(props: LexicalCollaborationProps): JSX.Element {
  const context = newContext();
  return <CollaborationContext value={context}>{props.children}</CollaborationContext>;
}

/**
 * The collaboration context in scope. A `username` or `color` given replaces
 * the local user's.
 */
export function useCollaborationContext(
  username?: string,
  color?: string,
): CollaborationContextType {
  const owner = getOwner();
  const context = owner === null ? undefined : getContext(CollaborationContext, owner);
  if (context === undefined) {
    throw new Error(
      "[barq] useCollaborationContext was called outside a `LexicalCollaboration`, so the editors have no Yjs documents to share. " +
        "Wrap the composer in `<LexicalCollaboration>`.",
    );
  }
  if (username !== undefined) context.name = username;
  if (color !== undefined) context.color = color;
  return context;
}

type ProviderFactory = (id: string, yjsDocMap: Map<string, Doc>) => Provider;

/**
 * Where the yjs undo manager of a collaborative editor is published, on the
 * editor, as `@lexical/react` publishes it: collaboration replaces
 * `@lexical/history`, and tooling reaches the manager here.
 */
const COLLAB_UNDO_MANAGER = Symbol.for("@lexical/yjs/UndoManager");

function useCollabActive(context: CollaborationContextType, editor: LexicalEditor): void {
  context.isCollabActive = true;
  onCleanup(() => {
    // A nested editor going away leaves its parent's collaboration on.
    if (editor._parentEditor === null || editor._parentEditor === undefined)
      context.isCollabActive = false;
  });
}

function bootstrapEditor(
  binding: BaseBinding,
  editor: LexicalEditor,
  initialEditorState?: InitialEditorStateType,
): void {
  // The bootstrap is not a user edit, so the undo manager skips it. The flag
  // has to outlive the update, whose yjs write happens in the commit; the
  // microtask bounds it when the update throws and its onUpdate never runs.
  binding.isBootstrapping = true;
  try {
    initializeEditor(editor, initialEditorState, () => {
      binding.isBootstrapping = false;
    });
  } finally {
    queueMicrotask(() => {
      binding.isBootstrapping = false;
    });
  }
}

function initializeEditor(
  editor: LexicalEditor,
  initialEditorState?: InitialEditorStateType,
  onUpdate?: () => void,
): void {
  editor.update(
    () => {
      const root = $getRoot();
      if (!root.isEmpty()) return;
      if (initialEditorState) {
        switch (typeof initialEditorState) {
          case "string":
            editor.setEditorState(editor.parseEditorState(initialEditorState), {
              tag: HISTORY_MERGE_TAG,
            });
            return;
          case "object":
            editor.setEditorState(initialEditorState, { tag: HISTORY_MERGE_TAG });
            return;
          case "function":
            editor.update(
              () => {
                if ($getRoot().isEmpty()) initialEditorState(editor);
              },
              { tag: HISTORY_MERGE_TAG },
            );
            return;
        }
      }
      const paragraph = $createParagraphNode();
      root.append(paragraph);
      const rootElement = editor.getRootElement();
      if (
        $getSelection() !== null ||
        (rootElement !== null && getActiveElement(rootElement) === rootElement)
      ) {
        paragraph.select();
      }
    },
    { onUpdate, tag: HISTORY_MERGE_TAG },
  );
}

function clearEditorSkipCollab(editor: LexicalEditor, binding: BaseBinding): void {
  editor.update(
    () => {
      const root = $getRoot();
      root.clear();
      root.select();
    },
    { tag: SKIP_COLLAB_TAG },
  );
  const cursors = binding.cursors;
  const container = binding.cursorsContainer;
  if (container === null) return;
  for (const cursor of cursors.values()) {
    const selection = cursor.selection;
    if (selection === null) continue;
    if (selection.highlight !== null) {
      CSS.highlights.delete(selection.highlightName);
      removeCursorHighlightRule(binding, selection.highlightName);
    }
    if (selection.caret.parentNode === container) container.removeChild(selection.caret);
    for (const span of selection.selections) {
      if (span.parentNode === container) container.removeChild(span);
    }
    cursor.selection = null;
  }
}

interface ReloadFlag {
  current: boolean;
}

interface ProviderStatus {
  status: string;
}

/** Connects the provider for the owner this runs under, and the commands and awareness around it. */
function connectProvider(
  editor: LexicalEditor,
  provider: Provider,
  name: string,
  color: string,
  isReloadingDoc: ReloadFlag,
  awarenessData: object | undefined,
  onBootstrap: () => void,
): void {
  function connect(): void | Promise<void> {
    return provider.connect();
  }
  function disconnect(): void {
    try {
      provider.disconnect();
    } catch {
      // A provider torn down already has nothing left to disconnect.
    }
  }

  function onStatus({ status }: ProviderStatus): void {
    editor.dispatchCommand(CONNECTED_COMMAND, status === "connected");
  }
  function onSync(isSynced: boolean): void {
    if (isSynced && !isReloadingDoc.current) onBootstrap();
  }

  const rootElement = editor.getRootElement();
  initLocalState(
    provider,
    name,
    color,
    rootElement !== null && getActiveElement(rootElement) === rootElement,
    awarenessData ?? {},
  );
  provider.on("status", onStatus);
  provider.on("sync", onSync);
  const connection = connect();

  onCleanup(() => {
    if (!isReloadingDoc.current) {
      if (connection) void connection.then(disconnect);
      else disconnect();
    }
    provider.off("sync", onSync);
    provider.off("status", onStatus);
  });

  onCleanup(
    editor.registerCommand(
      TOGGLE_CONNECT_COMMAND,
      (shouldConnect) => {
        if (shouldConnect) void connect();
        else disconnect();
        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    ),
  );

  // Cleared as the page goes, so the others stop drawing this cursor at once
  // rather than when the awareness times out.
  if (typeof window !== "undefined") {
    function clear(): void {
      try {
        provider.awareness.setLocalState(null);
      } catch {
        // The provider may be gone already.
      }
    }
    onCleanup(registerEventListeners(window, { beforeunload: clear, pagehide: clear }));
  }
}

function followAwareness(
  binding: Binding | BindingV2,
  provider: Provider,
  selectionHighlight: boolean,
): void {
  function onUpdate(): void {
    return syncCursorPositions(binding, provider, { selectionHighlight });
  }
  provider.awareness.on("update", onUpdate);
  onCleanup(() => provider.awareness.off("update", onUpdate));
}

function trackFocus(
  editor: LexicalEditor,
  provider: Provider,
  name: string,
  color: string,
  awarenessData: object | undefined,
): void {
  onCleanup(
    mergeRegister(
      editor.registerCommand(
        FOCUS_COMMAND,
        () => {
          setLocalStateFocus(provider, name, color, true, awarenessData ?? {});
          return false;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      editor.registerCommand(
        BLUR_COMMAND,
        () => {
          setLocalStateFocus(provider, name, color, false, awarenessData ?? {});
          return false;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
    ),
  );
}

/** The yjs undo manager standing in for `@lexical/history`. */
function yjsHistory(editor: LexicalEditor, undoManager: UndoManager): void {
  onCleanup(
    mergeRegister(
      editor.registerCommand(
        UNDO_COMMAND,
        () => {
          undoManager.undo();
          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      editor.registerCommand(
        REDO_COMMAND,
        () => {
          undoManager.redo();
          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
    ),
  );
  const published = editor as LexicalEditor & Record<symbol, UndoManager | undefined>;
  published[COLLAB_UNDO_MANAGER] = undoManager;
  onCleanup(() => {
    if (published[COLLAB_UNDO_MANAGER] === undoManager) delete published[COLLAB_UNDO_MANAGER];
  });
  function report(): void {
    editor.dispatchCommand(CAN_UNDO_COMMAND, undoManager.undoStack.length > 0);
    editor.dispatchCommand(CAN_REDO_COMMAND, undoManager.redoStack.length > 0);
  }
  undoManager.on("stack-item-added", report);
  undoManager.on("stack-item-popped", report);
  undoManager.on("stack-cleared", report);
  onCleanup(() => {
    undoManager.off("stack-item-added", report);
    undoManager.off("stack-item-popped", report);
    undoManager.off("stack-cleared", report);
  });
}

interface CursorsProps {
  binding: BaseBinding;
  container?: HTMLElement | null;
}

/** Where the other users' cursors are drawn: inside `container`, or the body. */
function Cursors(props: CursorsProps): JSX.Element {
  const binding = props.binding;
  const mount = props.container ?? (typeof document === "undefined" ? null : document.body);
  // Lexical places each caret at its distance from the container's offset
  // parent, and the caret is positioned against its nearest positioned
  // ancestor. A zero-size box at the top left of `mount`'s content is both,
  // so a caret lands on its text whatever `mount`'s margins, borders or
  // scroll, and scrolls with it.
  return (
    <Portal mount={mount}>
      <div
        data-lexical-cursors=""
        style={{ position: "absolute", top: "0", left: "0", width: "0", height: "0" }}
      >
        <div
          ref={(element: HTMLDivElement) => {
            binding.cursorsContainer = element;
          }}
        />
      </div>
    </Portal>
  );
}

type YjsEvents = Parameters<typeof syncYjsChangesToLexical>[2];
type YjsEventsV2 = Parameters<typeof syncYjsChangesToLexicalV2__EXPERIMENTAL>[2];

export interface CollaborationPluginProps {
  id: string;
  providerFactory: ProviderFactory;
  /**
   * Seed an empty shared document with `initialEditorState`, or one empty
   * paragraph, once the provider reports `sync`. At most one client may: the
   * seed is a plain insert, so two clients seeding at once leave two
   * paragraphs. Seeding on the server is the safer place.
   */
  shouldBootstrap: boolean;
  username?: string;
  cursorColor?: string;
  /** Where the other users' cursors are drawn. The body by default. */
  cursorsContainer?: HTMLElement | null;
  initialEditorState?: InitialEditorStateType;
  excludedProperties?: ExcludedProperties;
  /** Anything else to publish in this user's awareness state. */
  awarenessData?: object;
  syncCursorPositionsFn?: SyncCursorPositionsFn;
  /** Draw other users' selections with the CSS Highlight API where the browser has it. */
  selectionHighlight?: boolean;
  /** The key of the root `XmlText` in the document. `"root"` by default. */
  rootName?: string;
  /**
   * Resolves the root `XmlText` yourself, for a root that is not a top-level
   * shared type. Read once, when the binding is made, as `rootName` is.
   */
  getXmlText?: (doc: Doc) => XmlText;
}

interface Session {
  provider: Provider;
  binding: Binding;
}

interface CollaboratingProps {
  session: Session;
  editor: LexicalEditor;
  id: string;
  context: CollaborationContextType;
  shouldBootstrap: boolean;
  initialEditorState?: InitialEditorStateType;
  awarenessData?: object;
  syncCursorPositionsFn?: SyncCursorPositionsFn;
  selectionHighlight?: boolean;
  cursorsContainer?: HTMLElement | null;
  setDoc: (doc: Doc | undefined) => void;
}

function Collaborating(props: CollaboratingProps): JSX.Element {
  const { provider, binding } = props.session;
  const editor = props.editor;
  const id = props.id;
  const context = props.context;
  const { name, color, yjsDocMap } = context;
  const shouldBootstrap = props.shouldBootstrap;
  const initialEditorState = props.initialEditorState;
  const awarenessData = props.awarenessData;
  const syncCursors = props.syncCursorPositionsFn ?? syncCursorPositions;
  const setDoc = props.setDoc;
  const isReloadingDoc = { current: false };

  function onBootstrap(): void {
    const { root } = binding;
    if (shouldBootstrap && root.isEmpty() && root._xmlText._length === 0) {
      bootstrapEditor(binding, editor, initialEditorState);
    }
  }

  // Remote changes into the editor, local updates into the document.
  function onYjsTreeChanges(events: YjsEvents, transaction: Transaction): void {
    const origin = transaction.origin;
    if (origin !== binding) {
      syncYjsChangesToLexical(
        binding,
        provider,
        events,
        origin instanceof UndoManager,
        syncCursors,
      );
    }
  }
  const shared = binding.root.getSharedType();
  shared.observeDeep(onYjsTreeChanges);
  onCleanup(() => shared.unobserveDeep(onYjsTreeChanges));
  onCleanup(
    editor.registerUpdateListener(
      ({ prevEditorState, editorState, dirtyLeaves, dirtyElements, normalizedNodes, tags }) => {
        if (tags.has(SKIP_COLLAB_TAG)) return;
        syncLexicalUpdateToYjs(
          binding,
          provider,
          prevEditorState,
          editorState,
          dirtyElements,
          dirtyLeaves,
          normalizedNodes,
          tags,
        );
      },
    ),
  );

  // `reload` is not a yjs event; providers that emit it hand over a new document.
  function onReload(doc: Doc): void {
    clearEditorSkipCollab(editor, binding);
    setDoc(doc);
    yjsDocMap.set(id, doc);
    isReloadingDoc.current = true;
  }
  function onSync(): void {
    isReloadingDoc.current = false;
  }
  provider.on("reload", onReload);
  provider.on("sync", onSync);
  onCleanup(() => {
    provider.off("reload", onReload);
    provider.off("sync", onSync);
  });

  connectProvider(editor, provider, name, color, isReloadingDoc, awarenessData, onBootstrap);
  followAwareness(binding, provider, props.selectionHighlight ?? false);
  yjsHistory(editor, createUndoManager(binding, binding.root.getSharedType()));
  trackFocus(editor, provider, name, color, awarenessData);

  return <Cursors binding={binding} container={props.cursorsContainer} />;
}

interface ProviderInputs {
  id: string;
  factory: ProviderFactory;
}

/**
 * Connects the editor in scope to a Yjs document and draws the other users'
 * cursors. `providerFactory` makes the provider for document `id`; the editor
 * is bound to that document once, so a different document needs a new editor.
 * A new `id` or `providerFactory` replaces the provider. Must be inside a
 * `LexicalCollaboration`, and the composer's `initialConfig.editorState` should
 * be `null`, so the shared document fills the editor.
 */
export function CollaborationPlugin(props: CollaborationPluginProps): JSX.Element {
  const editor = useLexicalEditor();
  const context = useCollaborationContext(
    untrack(() => props.username),
    untrack(() => props.cursorColor),
  );
  const { yjsDocMap } = context;
  useCollabActive(context, editor);

  const [provider, setProvider] = mirror<Provider | undefined>(undefined);
  const [doc, setDoc] = mirror<Doc | undefined>(undefined);
  let inputs: ProviderInputs | null = null;
  let current: Provider | null = null;

  createEffect(
    () => [props.id, props.providerFactory] as const,
    ([id, factory]) => {
      if (inputs !== null && inputs.id === id && inputs.factory === factory) return;
      inputs = { id, factory };
      const next = factory(id, yjsDocMap);
      // Disconnected only when something replaced it: a factory that hands
      // back the provider it already made must keep it connected.
      if (current !== null && current !== next) current.disconnect();
      current = next;
      setProvider(next);
      setDoc(yjsDocMap.get(id));
    },
  );
  onCleanup(() => {
    const last = current;
    current = null;
    last?.disconnect();
  });

  const [binding, setBinding] = mirror<Binding | undefined>(undefined);
  createEffect(
    () => [provider(), doc()] as const,
    ([currentProvider, currentDoc]) => {
      if (currentProvider === undefined || untrack(binding) !== undefined) return;
      const id = untrack(() => props.id);
      const resolved = currentDoc ?? yjsDocMap.get(id);
      if (resolved === undefined) return;
      setBinding(
        createYjsBinding({
          doc: resolved,
          docMap: yjsDocMap,
          editor,
          excludedProperties: untrack(() => props.excludedProperties),
          getXmlText: untrack(() => props.getXmlText),
          id,
          rootName: untrack(() => props.rootName),
        }),
      );
    },
  );
  onCleanup(() => {
    const made = untrack(binding);
    made?.root.destroy(made);
  });

  const session = createMemo((): Session | undefined => {
    const p = provider();
    const b = binding();
    return p === undefined || b === undefined ? undefined : { provider: p, binding: b };
  });

  return (
    <Show when={session()} keyed>
      {(active: Session) => (
        <Collaborating
          session={active}
          editor={editor}
          id={untrack(() => props.id)}
          context={context}
          shouldBootstrap={untrack(() => props.shouldBootstrap)}
          initialEditorState={untrack(() => props.initialEditorState)}
          awarenessData={untrack(() => props.awarenessData)}
          syncCursorPositionsFn={untrack(() => props.syncCursorPositionsFn)}
          selectionHighlight={untrack(() => props.selectionHighlight)}
          cursorsContainer={untrack(() => props.cursorsContainer)}
          setDoc={setDoc}
        />
      )}
    </Show>
  );
}

export interface CollaborationPluginV2Props {
  id: string;
  doc: Doc;
  provider: Provider;
  /** Seed an empty document. Unsafe with more than one client; seed on the server. */
  __shouldBootstrapUnsafe?: boolean;
  username?: string;
  cursorColor?: string;
  cursorsContainer?: HTMLElement | null;
  excludedProperties?: ExcludedProperties;
  awarenessData?: object;
  selectionHighlight?: boolean;
  /** The key of the root `XmlElement`. `"root-v2"` by default. */
  rootName?: string;
  /** Resolves the root `XmlElement` yourself; it must be made as `new XmlElement()`. */
  getXmlElement?: (doc: Doc) => XmlElement;
}

interface SnapshotDiff {
  prevSnapshot?: Snapshot;
  snapshot?: Snapshot;
}

/**
 * The second collaboration binding, experimental upstream: the application
 * owns the `doc` and the `provider`, and the binding diffs versions with
 * `DIFF_VERSIONS_COMMAND__EXPERIMENTAL`. Must be inside a `LexicalCollaboration`.
 */
export function CollaborationPluginV2__EXPERIMENTAL(
  props: CollaborationPluginV2Props,
): JSX.Element {
  const editor = useLexicalEditor();
  const context = useCollaborationContext(
    untrack(() => props.username),
    untrack(() => props.cursorColor),
  );
  const { yjsDocMap, name, color } = context;
  useCollabActive(context, editor);

  const id = untrack(() => props.id);
  const doc = untrack(() => props.doc);
  const provider = untrack(() => props.provider);
  const awarenessData = untrack(() => props.awarenessData);
  const shouldBootstrap = untrack(() => props.__shouldBootstrapUnsafe) === true;

  // Made once: a binding cannot be pointed at another root, and remaking it
  // would hand the editor a root the next local update overwrites.
  const binding: BindingV2 = createBindingV2__EXPERIMENTAL(editor, id, doc, yjsDocMap, {
    excludedProperties: untrack(() => props.excludedProperties),
    getXmlElement: untrack(() => props.getXmlElement),
    rootName: untrack(() => props.rootName),
  });

  yjsDocMap.set(id, doc);
  onCleanup(() => yjsDocMap.delete(id));

  function onBootstrap(): void {
    if (shouldBootstrap && binding.root._length === 0) bootstrapEditor(binding, editor);
  }

  const [diff, setDiff] = mirror<SnapshotDiff | null>(null);
  onCleanup(
    mergeRegister(
      editor.registerCommand(
        CLEAR_DIFF_VERSIONS_COMMAND__EXPERIMENTAL,
        () => {
          setDiff(null);
          // Whatever arrived while the diff was shown is loaded now.
          syncYjsStateToLexicalV2__EXPERIMENTAL(binding, provider);
          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      editor.registerCommand(
        DIFF_VERSIONS_COMMAND__EXPERIMENTAL,
        ({ prevSnapshot, snapshot }) => {
          setDiff({ prevSnapshot, snapshot });
          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
    ),
  );

  createEffect(diff, (shown) => {
    if (shown !== null) {
      renderSnapshot__EXPERIMENTAL(binding, shown.snapshot, shown.prevSnapshot);
      return undefined;
    }
    function onYjsTreeChanges(events: YjsEventsV2, transaction: Transaction): void {
      const origin = transaction.origin;
      if (origin !== binding) {
        syncYjsChangesToLexicalV2__EXPERIMENTAL(
          binding,
          provider,
          events,
          transaction,
          origin instanceof UndoManager,
        );
      }
    }
    binding.root.observeDeep(onYjsTreeChanges);
    const removeListener = editor.registerUpdateListener(
      ({ prevEditorState, editorState, dirtyElements, dirtyLeaves, normalizedNodes, tags }) => {
        if (tags.has(SKIP_COLLAB_TAG)) return;
        syncLexicalUpdateToYjsV2__EXPERIMENTAL(
          binding,
          provider,
          prevEditorState,
          editorState,
          dirtyElements,
          dirtyLeaves,
          normalizedNodes,
          tags,
        );
      },
    );
    return () => {
      binding.root.unobserveDeep(onYjsTreeChanges);
      removeListener();
    };
  });

  connectProvider(editor, provider, name, color, { current: false }, awarenessData, onBootstrap);
  followAwareness(binding, provider, untrack(() => props.selectionHighlight) ?? false);
  yjsHistory(editor, createUndoManager(binding, binding.root));
  trackFocus(editor, provider, name, color, awarenessData);

  return <Cursors binding={binding} container={untrack(() => props.cursorsContainer)} />;
}
