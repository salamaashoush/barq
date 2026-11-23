import { type Accessor, createSignal, onCleanup } from "@barqjs/core";
import {
  $canShowPlaceholderCurry,
  $isRootTextContentEmptyCurry,
  type EntityMatch,
  registerLexicalTextEntity,
} from "@lexical/text";
import {
  $createNodeSelection,
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  $setSelection,
  type EditorState,
  type Klass,
  type LexicalEditor,
  type NodeKey,
  type TextNode,
  mergeRegister,
  mountSlotContainer,
  unmountSlotContainer,
} from "lexical";

import { useLexicalEditor } from "./context.ts";

/**
 * Lexical calls its listeners synchronously from wherever an update commits,
 * which can be a ref or a component being built. A signal that mirrors the
 * editor is written from there, so it is declared as one an owned scope may
 * write.
 */
export function mirror<T>(initial: T): [Accessor<T>, (next: T) => void] {
  const [value, setValue] = createSignal<T>(initial as Exclude<T, Function>, { ownedWrite: true });
  return [
    value,
    (next: T): void => {
      setValue(() => next);
    },
  ];
}

export interface LexicalSubscription<T> {
  initialValueFn: () => T;
  subscribe: (callback: (value: T) => void) => () => void;
}

/**
 * A value the editor reports through a listener, as a signal. The
 * subscription is opened for the owner this runs under and closed with it.
 */
export function useLexicalSubscription<T>(
  subscription: (editor: LexicalEditor) => LexicalSubscription<T>,
): Accessor<T> {
  const editor = useLexicalEditor();
  const { initialValueFn, subscribe } = subscription(editor);
  const [value, setValue] = mirror(initialValueFn());
  onCleanup(subscribe(setValue));
  return value;
}

/** Whether `editor` accepts input, followed for the owner this runs under. */
export function watchEditable(editor: LexicalEditor): Accessor<boolean> {
  const [isEditable, setEditable] = mirror(editor.isEditable());
  onCleanup(editor.registerEditableListener(setEditable));
  return isEditable;
}

/** Whether the editor in scope accepts input. */
export function useLexicalEditable(): Accessor<boolean> {
  return watchEditable(useLexicalEditor());
}

/**
 * The editor state, or what `$select` reads from it, after every update.
 * `$select` runs inside a read of the committed state, so `$getRoot()` and
 * the rest of the `$` functions work in it.
 */
export function useLexicalEditorState(): Accessor<EditorState>;
export function useLexicalEditorState<T>($select: () => T): Accessor<T>;
export function useLexicalEditorState<T>($select?: () => T): Accessor<T | EditorState> {
  const editor = useLexicalEditor();
  const read = (state: EditorState): T | EditorState =>
    $select === undefined ? state : state.read($select, { editor });
  const [value, setValue] = mirror<T | EditorState>(
    $select === undefined ? editor.getEditorState() : editor.read("latest", $select),
  );
  onCleanup(editor.registerUpdateListener(({ editorState }) => setValue(read(editorState))));
  return value;
}

/** Whether the document has no text, optionally ignoring whitespace. */
export function useLexicalIsTextContentEmpty(
  editor: LexicalEditor,
  trim?: boolean,
): Accessor<boolean> {
  const [isEmpty, setIsEmpty] = mirror(
    editor.read("latest", $isRootTextContentEmptyCurry(editor.isComposing(), trim)),
  );
  onCleanup(
    editor.registerUpdateListener(({ editorState }) => {
      setIsEmpty(editorState.read($isRootTextContentEmptyCurry(editor.isComposing(), trim)));
    }),
  );
  return isEmpty;
}

function canShowPlaceholder(editor: LexicalEditor): boolean {
  return editor.read("latest", $canShowPlaceholderCurry(editor.isComposing()));
}

/** Whether a placeholder belongs over the editor: empty, not composing, one paragraph. */
export function useLexicalCanShowPlaceholder(editor: LexicalEditor): Accessor<boolean> {
  const [canShow, setCanShow] = mirror(canShowPlaceholder(editor));
  const reset = (): void => setCanShow(canShowPlaceholder(editor));
  onCleanup(
    mergeRegister(editor.registerUpdateListener(reset), editor.registerEditableListener(reset)),
  );
  return canShow;
}

function isNodeSelected(editor: LexicalEditor, key: NodeKey): boolean {
  return editor.read("latest", () => {
    const node = $getNodeByKey(key);
    return node === null ? false : node.isSelected();
  });
}

/**
 * Whether the node with `key` is selected, and two functions that change it:
 * `setSelected(true)` adds it to a node selection, `setSelected(false)` takes
 * it out, `clearSelected()` empties the node selection.
 */
export function useLexicalNodeSelection(
  key: NodeKey,
): [Accessor<boolean>, (selected: boolean) => void, () => void] {
  const editor = useLexicalEditor();
  const [isSelected, setIsSelected] = mirror(isNodeSelected(editor, key));
  onCleanup(editor.registerUpdateListener(() => setIsSelected(isNodeSelected(editor, key))));

  const setSelected = (selected: boolean): void => {
    editor.update(() => {
      let selection = $getSelection();
      if (!$isNodeSelection(selection)) {
        const node = selected ? null : $getNodeByKey(key);
        // Taking out a node the selection does not cover would replace the
        // caret with an empty node selection for nothing.
        if (node !== null && !node.isSelected()) return;
        selection = $createNodeSelection();
        $setSelection(selection);
      }
      if ($isNodeSelection(selection)) {
        if (selected) selection.add(key);
        else selection.delete(key);
      }
    });
  };

  const clearSelected = (): void => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isNodeSelection(selection)) selection.clear();
    });
  };

  return [isSelected, setSelected, clearSelected];
}

/**
 * Text that matches `getMatch` becomes a `targetNode` as it is typed, and
 * stops being one when it no longer matches: hashtags, keywords, emoji codes.
 */
export function useLexicalTextEntity<T extends TextNode>(
  getMatch: (text: string) => null | EntityMatch,
  targetNode: Klass<T>,
  createNode: (textNode: TextNode) => T,
): void {
  const editor = useLexicalEditor();
  onCleanup(mergeRegister(...registerLexicalTextEntity(editor, getMatch, targetNode, createNode)));
}

/**
 * A ref for the element a decorator draws one of its node's named slots in:
 * the editable content Lexical keeps for that slot is moved into it, and
 * moved out again when the element goes.
 */
export function useLexicalSlotRef(
  editor: LexicalEditor,
  nodeKey: NodeKey,
  slotName: string,
): (element: HTMLElement) => void | (() => void) {
  return (element) => {
    const container = mountSlotContainer(editor, nodeKey, slotName, element);
    if (container) return () => unmountSlotContainer(editor, nodeKey, container);
    return undefined;
  };
}
