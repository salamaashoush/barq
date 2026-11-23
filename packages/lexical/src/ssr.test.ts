/**
 * The composer across a server render.
 *
 * The server builds the editor from the same extensions, touches no DOM, and
 * sends the editable root as an empty shell with its placeholder. The browser
 * hydrates that shell without a mismatch, binds the editor to the element the
 * server sent, and the editor then fills and edits it.
 */

import { afterEach, expect, test } from "bun:test";
import { flush, resetChildIds } from "@barqjs/core";
import { hydrate } from "@barqjs/web";
import { $createParagraphNode, $createTextNode, $getRoot, type LexicalEditor } from "lexical";

import { CARD, type Compiled, ENTRY, compile, serve } from "./ssr-harness.ts";
import { host, settle } from "./test-helpers.ts";

const PAGE = `
import { RichTextExtension } from "@lexical/rich-text"
import { HistoryExtension } from "@lexical/history"
import { ContentEditable, LexicalComposer, useLexicalEditor, useLexicalEditable } from ${JSON.stringify(ENTRY)}

export const handle = { editor: null }

function Mode() {
  handle.editor = useLexicalEditor()
  const editable = useLexicalEditable()
  return <span class="mode">{editable() ? "editing" : "reading"}</span>
}

export const page = () => () => (
  <main>
    <LexicalComposer
      extensions={[RichTextExtension, HistoryExtension]}
      initialConfig={{ namespace: "notes" }}
      contentEditable={null}
    >
      <section class="frame">
        <ContentEditable class="notes" aria-label="Notes" placeholder={<em>Write something</em>} />
      </section>
      <Mode />
    </LexicalComposer>
  </main>
)
`;

let compiled: Compiled | undefined;
const fixture = (): Compiled => (compiled ??= compile(PAGE, "composer"));

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  document.body.innerHTML = "";
});

test("the server sends an empty editable shell with its placeholder, and the browser hydrates and edits it", async () => {
  const served = serve(fixture().ssr);
  const container = host();
  container.innerHTML = served.html;

  const shell = container.querySelector<HTMLElement>(".notes");
  expect(shell).not.toBeNull();
  expect(shell?.getAttribute("contenteditable")).toBe("true");
  expect(shell?.getAttribute("role")).toBe("textbox");
  expect(shell?.getAttribute("aria-label")).toBe("Notes");
  expect(shell?.childNodes.length).toBe(0);
  expect(shell?.hasAttribute("data-lexical-editor")).toBe(false);
  expect(container.querySelector(".frame em")?.textContent).toBe("Write something");
  expect(container.querySelector(".mode")?.textContent).toBe("editing");

  const module = (await import(`${fixture().dom}?${Math.random()}`)) as {
    page: () => () => unknown;
    handle: { editor: LexicalEditor | null };
  };
  resetChildIds();
  cleanup = hydrate(module.page() as never, container);
  flush();
  expect(hydrate.report.recovered).toBe(false);
  // Hydration claimed the server's element rather than building another.
  expect(container.querySelector(".notes")).toBe(shell);
  expect(container.querySelectorAll(".notes").length).toBe(1);

  await settle();
  const editor = module.handle.editor;
  if (editor === null) throw new Error("the editor was not built in the browser");
  expect(editor.getRootElement()).toBe(shell);
  expect(shell?.getAttribute("data-lexical-editor")).toBe("true");
  expect(shell?.querySelector("p")).not.toBeNull();

  editor.update(() => {
    $getRoot()
      .clear()
      .append($createParagraphNode().append($createTextNode("hydrated")));
  });
  await settle();
  expect(shell?.textContent).toBe("hydrated");
  expect(container.querySelector(".frame em")).toBeNull();
});

const WITH_CARD = `
import { RichTextExtension } from "@lexical/rich-text"
import { LexicalComposer, ContentEditable } from ${JSON.stringify(ENTRY)}
import { CardNode } from ${JSON.stringify(CARD)}

const stored = JSON.stringify({
  root: {
    type: "root", version: 1, direction: null, format: "", indent: 0,
    children: [
      { type: "paragraph", version: 1, direction: null, format: "", indent: 0, textFormat: 0, textStyle: "",
        children: [{ type: "text", version: 1, text: "Intro", format: 0, style: "", mode: "normal", detail: 0 }] },
      { type: "card", version: 1, format: "", title: "Served block" },
    ],
  },
})

export const page = () => () => (
  <LexicalComposer
    extensions={[RichTextExtension]}
    initialConfig={{ namespace: "course", nodes: [CardNode], editorState: stored }}
    contentEditable={<ContentEditable class="lesson" placeholder={<em>Empty</em>} />}
  >
    <footer>end</footer>
  </LexicalComposer>
)
`;

test("a stored document with a block decorator hydrates, then the block's component mounts into its node", async () => {
  const compiledCard = compile(WITH_CARD, "card");
  const served = serve(compiledCard.ssr);
  const container = host();
  container.innerHTML = served.html;
  // Nothing of the document is on the page until the editor fills it, and no
  // placeholder either: the document is not empty.
  expect(container.querySelector(".lesson")?.childNodes.length).toBe(0);
  expect(container.querySelector("em")).toBeNull();
  expect(container.querySelector("footer")?.textContent).toBe("end");

  const module = (await import(`${compiledCard.dom}?${Math.random()}`)) as {
    page: () => () => unknown;
  };
  resetChildIds();
  cleanup = hydrate(module.page() as never, container);
  flush();
  expect(hydrate.report.recovered).toBe(false);
  await settle();
  expect(container.querySelector(".lesson p")?.textContent).toBe("Intro");
  expect(container.querySelector(".lesson .card-title")?.textContent).toBe("Served block");
});
