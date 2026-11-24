import { afterEach, expect, test } from "bun:test";
import { HistoryExtension } from "@lexical/history";
import { RichTextExtension } from "@lexical/rich-text";
import { render } from "@barqjs/web";
import { $createParagraphNode, $createTextNode, $getRoot, type LexicalEditor } from "lexical";

import { ContentEditable, LexicalComposer, useLexicalEditor } from "./index.ts";
import { host, settle } from "./test-helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.body.innerHTML = "";
});

test("a rich-text composer renders its root and reflects an update", async () => {
  let editor!: LexicalEditor;
  function Grab() {
    editor = useLexicalEditor();
    return null;
  }
  const element = host();
  cleanups.push(
    render(
      () => (
        <LexicalComposer
          extensions={[RichTextExtension, HistoryExtension]}
          initialConfig={{
            namespace: "notes",
            onError: (error) => {
              throw error;
            },
          }}
          contentEditable={<ContentEditable class="editable" aria-label="Notes" />}
        >
          <Grab />
        </LexicalComposer>
      ),
      element,
    ),
  );
  await settle();
  const root = element.querySelector(".editable");
  expect(root).not.toBeNull();
  expect(root?.getAttribute("contenteditable")).toBe("true");
  expect(root?.getAttribute("role")).toBe("textbox");
  editor.update(() => {
    $getRoot()
      .clear()
      .append($createParagraphNode().append($createTextNode("hello salama")));
  });
  await settle();
  expect(root?.textContent).toBe("hello salama");
});

test("a root born in a document with no window, as a template's clone is, binds once in the page", async () => {
  let editor!: LexicalEditor;
  function Grab() {
    editor = useLexicalEditor();
    return null;
  }
  const element = host();
  // A browser clones a template's nodes into the template's own document,
  // which has no window, and adopts them into the page as they are inserted.
  const inert = { defaultView: null } as unknown as Document;
  Object.defineProperty(HTMLDivElement.prototype, "ownerDocument", {
    configurable: true,
    get(this: HTMLDivElement) {
      return this.isConnected ? document : inert;
    },
  });
  try {
    cleanups.push(
      render(
        () => (
          <LexicalComposer
            extensions={[RichTextExtension]}
            contentEditable={<ContentEditable class="editable" aria-label="Notes" />}
          >
            <Grab />
          </LexicalComposer>
        ),
        element,
      ),
    );
    await settle();
  } finally {
    Reflect.deleteProperty(HTMLDivElement.prototype, "ownerDocument");
  }
  expect(editor.getRootElement()).toBe(element.querySelector<HTMLElement>(".editable"));
  expect(element.querySelector(".editable")?.hasAttribute("data-lexical-editor")).toBe(true);
});
