/**
 * What the editor suites repeat: Lexical's commit and barq's flush, and text
 * typed one update a character, as keystrokes arrive.
 */

import { flush } from "@barqjs/core";
import { $getRoot, $getSelection, $isRangeSelection, type LexicalEditor } from "lexical";

export async function settle(ms = 0): Promise<void> {
  flush();
  await Promise.resolve();
  flush();
  await new Promise((resolve) => setTimeout(resolve, ms));
  flush();
}

export async function typeText(editor: LexicalEditor, text: string): Promise<void> {
  for (const character of text) {
    editor.update(() => {
      let selection = $getSelection();
      if (!$isRangeSelection(selection)) {
        $getRoot().selectEnd();
        selection = $getSelection();
      }
      if ($isRangeSelection(selection)) selection.insertText(character);
    });
    await settle();
  }
}

export async function selectAll(editor: LexicalEditor): Promise<void> {
  editor.update(() => {
    $getRoot().select(0, $getRoot().getChildrenSize());
  });
  await settle();
}

export function textOf(editor: LexicalEditor): string {
  return editor.getEditorState().read(() => $getRoot().getTextContent());
}

export function keydown(target: Element, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

/** A captured editor, for `onEditor`. */
export function capture(): { get: () => LexicalEditor; set: (editor: LexicalEditor) => void } {
  let current: LexicalEditor | undefined;
  return {
    get: () => {
      if (current === undefined) throw new Error("The editor has not been built.");
      return current;
    },
    set: (editor) => {
      current = editor;
    },
  };
}

/**
 * A page rendered by a real server process and hydrated here: `jsx` is the
 * page's markup, written with what `imports` brings from the editor entry.
 * Hydration claims the server's markup with no mismatch and no rebuild.
 */
export async function hydratesFromServer(
  imports: string,
  jsx: string,
): Promise<{ container: HTMLElement; dispose: () => void }> {
  const { serverProcess, halves } = await import("../ssr-harness.ts");
  const { resetChildIds } = await import("@barqjs/core");
  const { hydrate } = await import("@barqjs/web");
  const entry = JSON.stringify(new URL("./index.ts", import.meta.url).pathname);
  const { code, html, errors } = await serverProcess(`
    import { renderToStringAsync } from "@barqjs/server";
    import { ${imports} } from ${entry};
    export async function page() {
      return await renderToStringAsync(() => (${jsx}));
    }
  `);
  if (code !== 0) throw new Error(errors);
  const { client } = await halves(`
    import { ${imports} } from ${entry};
    export function Page() {
      return ${jsx};
    }
  `);
  const container = document.body.appendChild(document.createElement("div"));
  container.innerHTML = html;
  resetChildIds();
  const dispose = hydrate(client, container);
  if (hydrate.report.mismatches.length > 0 || hydrate.report.recovered) {
    throw new Error(`hydration did not claim the server's page: ${JSON.stringify(hydrate.report)}`);
  }
  await settle();
  return {
    container,
    dispose: () => {
      dispose();
      container.remove();
    },
  };
}

/** Lays the top-level blocks out 40px apart, which happy-dom does not. */
export function layOut(editor: LexicalEditor): void {
  const keys = editor.read(() => $getRoot().getChildrenKeys());
  keys.forEach((key, index) => {
    const element = editor.getElementByKey(key);
    if (element === null) return;
    element.getBoundingClientRect = () =>
      ({
        top: index * 40,
        bottom: index * 40 + 30,
        height: 30,
        left: 0,
        right: 300,
        width: 300,
        x: 0,
        y: index * 40,
      }) as DOMRect;
  });
}
