import { afterEach, describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { destroyAnnouncer } from "@barqjs/aria/live";
import { ariaViolations, cleanup, render, screen, user } from "@barqjs/testing";
import type { LexicalEditor } from "lexical";

import {
  type CommentDraft,
  type CommentPerson,
  CommentThreadList,
} from "../components/comments.tsx";
import { hydrates } from "../test-arc.ts";
import { RichCommentComposer } from "./comment-composer.tsx";
import { keydown, settle, textOf, typeText } from "./test-editor.ts";

const entry = JSON.stringify(fileURLToPath(new URL("./index.ts", import.meta.url)));

afterEach(() => {
  cleanup();
  destroyAnnouncer();
  document.body.innerHTML = "";
});

const ME: CommentPerson = { id: "me", name: "Salama Ashoush" };
const SAM: CommentPerson = { id: "sam", name: "Sam Roe" };
const NOW = new Date("2026-05-01T12:00:00Z");

interface LexicalHost {
  __lexicalEditor?: LexicalEditor;
}

function editorIn(element: Element | null): LexicalEditor {
  const root = element?.querySelector<HTMLElement & LexicalHost>("[data-lexical-editor]");
  if (root?.__lexicalEditor === undefined) throw new Error("no editor here");
  return root.__lexicalEditor;
}

describe("RichCommentComposer in a thread list", () => {
  test("a new comment mentions with the typeahead and goes on Mod+Enter, as the plain composer's draft", async () => {
    const drafts: CommentDraft[] = [];
    render(() => (
      <CommentThreadList
        threads={[]}
        currentUser={ME}
        now={NOW}
        mentionables={[ME, SAM]}
        composer={RichCommentComposer}
        onCreate={(draft) => void drafts.push(draft)}
      />
    ));
    await settle();
    const box = screen.getByRole("textbox", { name: "New comment" });
    box.focus();
    const editor = editorIn(document.querySelector('[data-slot="chat-composer"]'));
    await typeText(editor, "Hi @sam");
    keydown(box, "Enter");
    await settle();
    expect(textOf(editor)).toBe("Hi @Sam Roe ");
    keydown(box, "Enter");
    await settle();
    expect(drafts).toHaveLength(0);
    keydown(box, "Enter", { ctrlKey: true });
    await settle();
    expect(drafts).toEqual([{ body: "Hi @Sam Roe", mentions: [SAM] }]);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("editing opens the comment with its mention whole, and Escape lets it go", async () => {
    const edits: CommentDraft[] = [];
    render(() => (
      <CommentThreadList
        threads={[
          {
            id: "t1",
            comments: [
              {
                id: "c1",
                author: ME,
                body: "Ask @Sam Roe first",
                mentions: [SAM],
                createdAt: new Date("2026-05-01T11:00:00Z"),
              },
            ],
          },
        ]}
        currentUser={ME}
        now={NOW}
        composer={RichCommentComposer}
        onEdit={(_comment, draft) => void edits.push(draft)}
      />
    ));
    await settle();
    await user.click(screen.getByRole("button", { name: /Actions for/ }));
    await settle();
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    await settle();
    const composer = document.querySelector('[data-slot="chat-composer"]');
    const editor = editorIn(composer);
    expect(composer?.querySelector('[data-slot="mention"]')?.textContent).toBe("@Sam Roe");
    expect(textOf(editor)).toBe("Ask @Sam Roe first");
    keydown(screen.getByRole("textbox", { name: "Edit comment" }), "Enter", { metaKey: true });
    await settle();
    expect(edits).toEqual([{ body: "Ask @Sam Roe first", mentions: [SAM] }]);
    await user.click(screen.getByRole("button", { name: /Actions for/ }));
    await settle();
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    await settle();
    keydown(screen.getByRole("textbox", { name: "Edit comment" }), "Escape");
    await settle();
    expect(screen.queryByRole("textbox", { name: "Edit comment" })).toBeNull();
  });

  test("hydrates a thread list that writes in the rich composer", async () => {
    const result = await hydrates(`
      import { CommentThreadList } from "<arc>";
      import { RichCommentComposer } from ${entry};
      export function Page() {
        return <CommentThreadList threads={[]} composer={RichCommentComposer} onCreate={() => undefined} />;
      }
    `);
    expect(result.container.querySelector('[data-slot="chat-composer"]')).not.toBeNull();
    result.unmount();
  });
});
