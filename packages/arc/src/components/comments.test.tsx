import { describe, expect, test } from "bun:test";
import { createSignal, type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user, waitFor, within } from "@barqjs/testing";

import { touch } from "@barqjs/ui/shared-touch";

import { target } from "../style/index.ts";
import { hydrates, settle, wears } from "../test-arc.ts";
import {
  type CommentData,
  type CommentDraft,
  type CommentPerson,
  CommentThread,
  type CommentThreadData,
  CommentThreadList,
} from "./comments.tsx";
import { ConfirmHost } from "./confirm.tsx";

const NOW = new Date("2026-05-01T12:00:00Z");
const ME: CommentPerson = { id: "me", name: "Salama Ashoush" };
const ALEX: CommentPerson = { id: "alex", name: "Alex Doe" };
const SAM: CommentPerson = { id: "sam", name: "Sam Roe" };

function comment(
  id: string,
  author: CommentPerson,
  body: string,
  extra: Partial<CommentData> = {},
) {
  return { id, author, body, createdAt: new Date("2026-05-01T11:00:00Z"), ...extra };
}

const THREADS: CommentThreadData[] = [
  {
    id: "t1",
    anchor: { id: "intro", quote: "the first paragraph" },
    comments: [
      comment("c1", ALEX, "Can we shorten this, @Salama Ashoush?", {
        mentions: [ME],
        reactions: [{ emoji: "👍", count: 2, reacted: false, label: "Sam and Alex" }],
      }),
      comment("c2", ME, "Yes, on it", { editedAt: NOW, unread: true }),
    ],
  },
  {
    id: "t2",
    resolved: true,
    anchor: { id: "outro", quote: "gone text", detached: true },
    comments: [comment("c3", SAM, "Typo here")],
  },
];

function deferred() {
  let resolve: () => void = () => {};
  let reject: () => void = () => {};
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = () => no(new Error("refused"));
  });
  return { promise, resolve, reject };
}

function slot(name: string, root: ParentNode = document): HTMLElement[] {
  return [...root.querySelectorAll(`[data-slot="${name}"]`)] as HTMLElement[];
}

async function typeIn(box: HTMLElement, text: string): Promise<void> {
  box.focus();
  await user.keyboard(text);
  await settle();
}

describe("CommentThreadList", () => {
  test("lists the open threads, each an article with its anchor, mentions and reactions", async () => {
    render(() => <CommentThreadList threads={THREADS} currentUser={ME} now={NOW} />);
    const list = screen.getByRole("region", { name: "Comments" });
    const threads = within(list).getAllByRole("article", { name: /^On|Thread/ });
    expect(threads).toHaveLength(1);
    expect(screen.getByText("the first paragraph")).toBeDefined();
    expect(slot("comment-mention")[0]?.textContent).toBe("@Salama Ashoush");
    expect(slot("comment-edited")).toHaveLength(1);
    expect(slot("comment")[1]?.hasAttribute("data-unread")).toBe(true);
    const reaction = screen.getByRole("button", { name: /👍, 2 reactions from Sam and Alex/ });
    expect(reaction.getAttribute("aria-pressed")).toBe("false");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("the filter shows resolved threads, dimmed, with a detached anchor said so", async () => {
    const [filter, setFilter] = createSignal<"open" | "resolved" | "all">("open");
    render(() => (
      <CommentThreadList threads={THREADS} filter={filter()} onFilterChange={setFilter} />
    ));
    await user.click(screen.getByRole("button", { name: /Resolved 1/ }));
    await settle();
    expect(filter()).toBe("resolved");
    const thread = slot("comment-thread")[0];
    expect(thread?.hasAttribute("data-resolved")).toBe(true);
    expect(screen.getByText("What this was on has changed")).toBeDefined();
    expect(screen.queryByText("gone text")).toBeNull();
  });

  test("an anchor narrows the list to its threads, and its chip lets it go", async () => {
    const [anchor, setAnchor] = createSignal<string | undefined>("intro");
    render(() => (
      <CommentThreadList
        threads={THREADS}
        defaultFilter="all"
        anchor={anchor()}
        onAnchorChange={setAnchor}
      />
    ));
    expect(slot("comment-thread")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: /Remove/ }));
    await settle();
    expect(anchor()).toBeUndefined();
    expect(slot("comment-thread")).toHaveLength(2);
  });

  test("a new comment shows at once as pending, and goes when the caller's promise settles", async () => {
    const gate = deferred();
    const drafts: CommentDraft[] = [];
    render(() => (
      <CommentThreadList
        threads={[]}
        currentUser={ME}
        onCreate={(draft) => {
          drafts.push(draft);
          return gate.promise;
        }}
      />
    ));
    expect(screen.getByText("No comments yet")).toBeDefined();
    await typeIn(screen.getByRole("textbox", { name: "New comment" }), "First note");
    await user.keyboard("{Enter}", { ctrlKey: true });
    await settle();
    expect(drafts).toEqual([{ body: "First note", mentions: [] }]);
    const pending = slot("comment")[0];
    expect(pending?.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText("Sending…")).toBeDefined();
    expect(screen.getByRole<HTMLTextAreaElement>("textbox", { name: "New comment" }).value).toBe(
      "",
    );
    gate.resolve();
    await waitFor(() => expect(slot("comment")).toHaveLength(0));
  });
});

describe("CommentThread", () => {
  test("a reply that fails stays, marked, with Retry and Discard", async () => {
    let attempts = 0;
    const gates = [deferred(), deferred()];
    render(() => (
      <CommentThread
        thread={THREADS[0] as CommentThreadData}
        currentUser={ME}
        now={NOW}
        onReply={() => gates[attempts++]?.promise}
      />
    ));
    await user.click(screen.getByRole("button", { name: "Reply" }));
    await settle();
    await typeIn(screen.getByRole("textbox", { name: "Reply" }), "Done now");
    await user.click(screen.getAllByRole("button", { name: "Reply" }).at(-1) as HTMLElement);
    await settle();
    expect(slot("comment")).toHaveLength(3);
    gates[0]?.reject();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Not sent"));
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await settle();
    expect(attempts).toBe(2);
    expect(screen.queryByRole("alert")).toBeNull();
    gates[1]?.resolve();
    await waitFor(() => expect(slot("comment")).toHaveLength(2));
  });

  test("its author edits a comment in place, Escape cancelling and Mod+Enter saving", async () => {
    const edits: string[] = [];
    render(() => (
      <CommentThread
        thread={THREADS[0] as CommentThreadData}
        currentUser={ME}
        now={NOW}
        onEdit={(_comment, draft) => {
          edits.push(draft.body);
        }}
      />
    ));
    expect(screen.getAllByRole("button", { name: /Actions for/ })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Actions for Salama Ashoush's comment" }));
    await settle();
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    await settle();
    const box = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Edit comment" });
    expect(box.value).toBe("Yes, on it");
    box.focus();
    await user.keyboard("{Escape}");
    await settle();
    expect(screen.queryByRole("textbox", { name: "Edit comment" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Actions for Salama Ashoush's comment" }));
    await settle();
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    await settle();
    await typeIn(screen.getByRole("textbox", { name: "Edit comment" }), " today");
    await user.keyboard("{Enter}", { metaKey: true });
    await settle();
    expect(edits).toEqual(["Yes, on it today"]);
  });

  test("deleting asks first, hides the comment while it goes, and brings it back if it fails", async () => {
    const gate = deferred();
    render(() => (
      <>
        <ConfirmHost />
        <CommentThread
          thread={THREADS[0] as CommentThreadData}
          currentUser={ME}
          onDelete={() => gate.promise}
        />
      </>
    ));
    await user.click(screen.getByRole("button", { name: "Actions for Salama Ashoush's comment" }));
    await settle();
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    await settle();
    const dialog = screen.getByRole("alertdialog", { name: "Delete the comment?" });
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    await settle();
    await waitFor(() => expect(slot("comment")).toHaveLength(1));
    gate.reject();
    await waitFor(() => expect(slot("comment")).toHaveLength(2));
    expect(screen.getByRole("alert").textContent).toBe("It could not be deleted");
  });

  test("resolving and reacting show at once", async () => {
    const calls: string[] = [];
    render(() => (
      <CommentThread
        thread={THREADS[0] as CommentThreadData}
        currentUser={ME}
        onResolve={(_id, resolved) => {
          calls.push(`resolve ${String(resolved)}`);
          return new Promise(() => {});
        }}
        onReact={(_comment, emoji, add) => {
          calls.push(`${emoji} ${String(add)}`);
          return new Promise(() => {});
        }}
      />
    ));
    await user.click(screen.getByRole("button", { name: "Resolve" }));
    await settle();
    expect(slot("comment-thread")[0]?.hasAttribute("data-resolved")).toBe(true);
    expect(screen.getByRole("button", { name: "Reopen" })).toBeDefined();
    user.tap(screen.getByRole("button", { name: /👍, 2 reactions/ }));
    await settle();
    expect(
      screen.getByRole("button", { name: /👍, 3 reactions/ }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(calls).toEqual(["resolve true", "👍 true"]);
  });

  test("@ offers the people to mention, chosen with the arrows and Enter", async () => {
    const drafts: CommentDraft[] = [];
    render(() => (
      <CommentThread
        thread={THREADS[0] as CommentThreadData}
        currentUser={ME}
        mentionables={[ALEX, SAM]}
        onReply={(_id, draft) => {
          drafts.push(draft);
        }}
      />
    ));
    await user.click(screen.getByRole("button", { name: "Reply" }));
    await settle();
    const box = screen.getByRole("textbox", { name: "Reply" });
    await typeIn(box, "Thanks @");
    const list = screen.getByRole("listbox", { name: "People to mention" });
    expect(within(list).getAllByRole("option")).toHaveLength(2);
    await user.keyboard("s");
    await settle();
    expect(
      within(list)
        .getAllByRole("option")
        .map((one) => one.textContent),
    ).toEqual(["SRSam Roe"]);
    expect(box.getAttribute("aria-activedescendant")).toBe(
      within(list).getByRole("option").getAttribute("id"),
    );
    await user.keyboard("{Enter}");
    await settle();
    expect((box as HTMLTextAreaElement).value).toBe("Thanks @Sam Roe ");
    expect(screen.queryByRole("listbox")).toBeNull();
    await user.keyboard("{Enter}", { ctrlKey: true });
    await settle();
    expect(drafts).toEqual([{ body: "Thanks @Sam Roe", mentions: [SAM] }]);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("runs right to left, the anchor's rule at the start", () => {
    function Arabic(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <CommentThread thread={THREADS[0] as CommentThreadData} now={NOW} />
      </Arabic>
    ));
    const anchor = slot("comment-thread-anchor")[0];
    expect(anchor?.closest("[dir=rtl]")).not.toBeNull();
    expect(slot("comment-time")[0]?.textContent).toMatch(/[٠-٩]/u);
  });

  test("its controls are a finger's size under a coarse pointer", async () => {
    render(() => (
      <CommentThread
        thread={THREADS[0] as CommentThreadData}
        currentUser={ME}
        mentionables={[ALEX]}
        onResolve={() => {}}
        onReply={() => {}}
        onAnchorPress={() => {}}
      />
    ));
    expect(wears(screen.getByRole("button", { name: "Resolve" }), touch.target)).toBe(true);
    expect(wears(slot("comment-thread-anchor")[0], target.size)).toBe(true);
    user.tap(screen.getByRole("button", { name: "Reply" }));
    await settle();
    await typeIn(screen.getByRole("textbox", { name: "Reply" }), "@");
    const option = screen.getByRole("option", { name: /Alex Doe/ });
    expect(wears(option, target.size)).toBe(true);
    user.tap(option);
    await settle();
    expect(screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Reply" }).value).toBe(
      "@Alex Doe ",
    );
  });

  test("takes a class per part", () => {
    render(() => (
      <CommentThread
        class="mine"
        thread={THREADS[0] as CommentThreadData}
        onReply={() => {}}
        classes={{
          thread: "th",
          comment: "co",
          author: "au",
          body: "bo",
          mention: "me",
          reactions: "re",
          anchor: "an",
        }}
      />
    ));
    const pairs = [
      ["comment-thread", "th"],
      ["comment", "co"],
      ["comment-author", "au"],
      ["comment-body", "bo"],
      ["comment-mention", "me"],
      ["comment-reactions", "re"],
      ["comment-thread-anchor", "an"],
    ] as const;
    for (const [name, cls] of pairs) expect(slot(name)[0]?.classList.contains(cls)).toBe(true);
    expect(slot("comment-thread")[0]?.classList.contains("mine")).toBe(true);
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { CommentThreadList } from "<arc>";
      const at = new Date("2026-05-01T11:00:00Z");
      export function Page() {
        return (
          <CommentThreadList
            now={new Date("2026-05-01T12:00:00Z")}
            threads={[
              {
                id: "t1",
                anchor: { quote: "intro" },
                comments: [
                  { id: "a", author: { id: "x", name: "Alex Doe" }, body: "Hi @Sam Roe", createdAt: at, mentions: [{ id: "s", name: "Sam Roe" }] },
                ],
              },
            ]}
          />
        );
      }
    `);
    expect(result.container.querySelector('[data-slot="comment-mention"]')?.textContent).toBe(
      "@Sam Roe",
    );
    result.unmount();
  });
});
