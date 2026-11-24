import { type Accessor, onCleanup } from "@barqjs/core";
import { useLexicalEditor } from "@barqjs/lexical";
import { $getRoot, type LexicalEditor, type SerializedEditorState } from "lexical";

import { editorSignal, useRegistration } from "./hooks.ts";

/** How many characters a document has, as a reader counts them: one per grapheme, emoji and all. */
export function countCharacters(text: string): number {
  let count = 0;
  for (const _ of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)) count++;
  return count;
}

export interface CharacterCount {
  count: Accessor<number>;
  /** Over `max`. */
  over: Accessor<boolean>;
  /** Left before `max`, negative past it. */
  remaining: Accessor<number>;
}

/** The editor's length against `max`, followed through every update. */
export function useCharacterCount(max: () => number | undefined): CharacterCount {
  const editor = useLexicalEditor();
  const read = (): number => editor.read(() => countCharacters($getRoot().getTextContent()));
  const [count, setCount] = editorSignal(read());
  useRegistration(() =>
    editor.registerTextContentListener((text) => setCount(countCharacters(text))),
  );
  const remaining = (): number => (max() ?? Number.POSITIVE_INFINITY) - count();
  return { count, remaining, over: () => remaining() < 0 };
}

export type AutosaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

export interface AutosaveOptions {
  /** Stores the document. A promise holds the status at saving until it settles. */
  save: (value: SerializedEditorState, editor: LexicalEditor) => void | Promise<unknown>;
  /** How long typing has to pause first, in milliseconds. @default 1000 */
  delay?: number;
}

export interface Autosave {
  status: Accessor<AutosaveStatus>;
  /** Saves now what is waiting, rather than after the pause. */
  flush: () => void;
}

const SKIPPED = new Set(["history-merge", "collaboration"]);

/**
 * Saves the document once typing pauses, again after each change, at once
 * when the editor loses focus, and when the component goes. Selection moves
 * and a shared document's remote changes save nothing.
 */
export function useEditorAutosave(options: AutosaveOptions): Autosave {
  const editor = useLexicalEditor();
  const [status, setStatus] = editorSignal<AutosaveStatus>("idle");
  let timer: ReturnType<typeof setTimeout> | undefined;
  let waiting = false;
  let turn = 0;

  const flush = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (!waiting) return;
    waiting = false;
    const mine = ++turn;
    setStatus("saving");
    let result: void | Promise<unknown>;
    try {
      result = options.save(editor.getEditorState().toJSON(), editor);
    } catch {
      setStatus("error");
      return;
    }
    if (result instanceof Promise) {
      result.then(
        () => {
          if (mine === turn && !waiting) setStatus("saved");
        },
        () => {
          if (mine === turn) setStatus("error");
        },
      );
    } else {
      setStatus("saved");
    }
  };

  useRegistration(() =>
    editor.registerUpdateListener(({ dirtyElements, dirtyLeaves, tags }) => {
      if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
      if ([...tags].some((tag) => SKIPPED.has(tag))) return;
      waiting = true;
      setStatus("pending");
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(flush, options.delay ?? 1000);
    }),
  );
  useRegistration(() =>
    editor.registerRootListener((root, previous) => {
      previous?.removeEventListener("focusout", flush);
      root?.addEventListener("focusout", flush);
    }),
  );
  onCleanup(flush);
  return { status, flush };
}
