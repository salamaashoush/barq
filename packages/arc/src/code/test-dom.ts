import { afterAll, beforeAll } from "bun:test";
import { flush } from "@barqjs/core";
import { waitFor } from "@barqjs/testing";
import type { EditorView } from "@codemirror/view";

import { loadLanguage, registerLanguage } from "./languages.ts";

/**
 * happy-dom fires `selectionchange` synchronously from inside the call that
 * moved the selection, where a browser queues a task for it. CodeMirror moves
 * the selection while it updates and reads it back on that event, so the
 * synchronous one lands inside its own update and throws. Queued, it arrives
 * where a browser would deliver it. For the suite that calls this.
 */
export function queueSelectionChanges(): void {
  beforeAll(() => {
    const dispatch = document.dispatchEvent.bind(document);
    document.dispatchEvent = (event: Event): boolean => {
      if (event.type !== "selectionchange") return dispatch(event);
      setTimeout(() => dispatch(event), 0);
      return true;
    };
  });
  afterAll(() => {
    Reflect.deleteProperty(document, "dispatchEvent");
  });
}

/** What a keystroke of text does in CodeMirror: replace the selection, as typing. */
export function type(view: EditorView, text: string): void {
  view.dispatch(view.state.replaceSelection(text), {
    userEvent: "input.type",
    scrollIntoView: true,
  });
}

/** Put the cursor at `at`, or at the end of the document. */
export function place(view: EditorView, at = view.state.doc.length): void {
  view.dispatch({ selection: { anchor: at } });
}

/** Wait until the editor in `container` has taken over from its static markup. */
export async function editorIn(container: Element, slot = "code-editor"): Promise<HTMLElement> {
  let editor: HTMLElement | null = null;
  await waitFor(() => {
    flush();
    editor = container.querySelector<HTMLElement>(`[data-slot=${slot}] .cm-editor`);
    if (editor === null) throw new Error("The editor has not mounted.");
  });
  return editor as unknown as HTMLElement;
}

/** A microtask for the batched report, then the writes it made. */
export async function reported(): Promise<void> {
  await Promise.resolve();
  flush();
}

let gates = 0;

/**
 * A language that loads only when `release` is called, as TypeScript: what
 * a slow network does to the first page that asks for one.
 */
export function gatedLanguage(): { name: string; release: () => Promise<void> } {
  const name = `acme-gated-${String(gates++)}`;
  let open: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  registerLanguage(name, async () => {
    await gate;
    const support = await loadLanguage("typescript");
    if (support === undefined) throw new Error("TypeScript did not load.");
    return support;
  });
  return {
    name,
    release: async () => {
      open();
      await loadLanguage(name);
    },
  };
}
