import { afterEach, describe, expect, test } from "bun:test";
import { type Child } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, cleanup, render, waitFor } from "@barqjs/testing";
import type { JSX } from "@barqjs/web";
import type { LexicalEditor } from "lexical";

import type { CompactEmoji } from "../chat/emoji-data.ts";
import { hydrates } from "../test-arc.ts";
import { documentToMarkdown } from "./document.ts";
import { RichTextEditor } from "./rich-text-editor.tsx";
import { capture, keydown, settle, textOf, typeText } from "./test-editor.ts";
import {
  EmojiShortcuts,
  type MentionCandidate,
  MentionTypeahead,
  SlashCommandMenu,
} from "./typeahead.tsx";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

const PEOPLE: MentionCandidate[] = [
  { id: "u1", name: "Salama Ashoush", description: "salama@example.com" },
  { id: "u2", name: "Sam Roe", description: "sam@example.com" },
  { id: "u3", name: "Alex Doe" },
];

const EMOJI: CompactEmoji[] = [
  { unicode: "👍", label: "thumbs up", hexcode: "1F44D", group: 1, order: 1, tags: ["yes"] },
  { unicode: "😄", label: "grinning face", hexcode: "1F604", group: 0, order: 2, tags: ["smile"] },
];

function listbox(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[role="listbox"]');
}

function options(): string[] {
  return [...document.querySelectorAll<HTMLElement>('[role="option"]')].map(
    (one) => one.textContent ?? "",
  );
}

function root(): HTMLElement {
  return document.querySelector<HTMLElement>('[data-slot="rich-text-editor-content"]')!;
}

async function mount(children: () => JSX.Element): Promise<LexicalEditor> {
  const editor = capture();
  render(() => (
    <RichTextEditor label="Message" toolbar={false} onEditor={editor.set}>
      {children()}
    </RichTextEditor>
  ));
  await settle();
  root().focus();
  return editor.get();
}

describe("MentionTypeahead", () => {
  test("offers matching people with avatars, and Enter inserts a mention carrying the id", async () => {
    const editor = await mount(() => <MentionTypeahead source={PEOPLE} />);
    await typeText(editor, "hi @sa");
    expect(listbox()?.getAttribute("aria-label")).toBe("Mentions");
    expect(options()).toEqual(["SASalama Ashoushsalama@example.com", "SRSam Roesam@example.com"]);
    expect(document.querySelectorAll('[role="option"] [data-slot="person-avatar"]')).toHaveLength(
      2,
    );
    expect(root().getAttribute("aria-activedescendant")).toBe(
      document.querySelector('[role="option"]')?.id ?? "",
    );
    keydown(root(), "ArrowDown");
    await settle();
    keydown(root(), "Enter");
    await settle();
    expect(listbox()).toBeNull();
    expect(textOf(editor)).toBe("hi @Sam Roe ");
    const mention = root().querySelector<HTMLElement>('[data-slot="mention"]');
    expect(mention?.textContent).toBe("@Sam Roe");
    expect(mention?.dataset.mentionId).toBe("u2");
    expect(documentToMarkdown(editor.getEditorState().toJSON())).toBe("hi [@Sam Roe](mention:u2) ");
  });

  test("asks a server once typing pauses, says it is searching, and drops a stale answer", async () => {
    const asked: string[] = [];
    const source = async (query: string): Promise<MentionCandidate[]> => {
      asked.push(query);
      await new Promise((resolve) => setTimeout(resolve, query === "a" ? 40 : 5));
      return PEOPLE.filter((one) => one.name.toLowerCase().includes(query.toLowerCase()));
    };
    const editor = await mount(() => <MentionTypeahead source={source} debounce={10} />);
    await typeText(editor, "@a");
    expect(document.querySelector('[data-slot="typeahead-status"]')?.textContent).toBe(
      "Searching…",
    );
    await typeText(editor, "le");
    await waitFor(() => expect(options()).toEqual(["ADAlex Doe"]));
    await settle(60);
    expect(options()).toEqual(["ADAlex Doe"]);
    expect(asked.at(-1)).toBe("ale");
  });

  test("says when nobody matches, and Escape leaves the text as typed", async () => {
    const editor = await mount(() => <MentionTypeahead source={PEOPLE} />);
    await typeText(editor, "@zz");
    expect(document.querySelector('[data-slot="typeahead-status"]')?.textContent).toBe(
      "No results found.",
    );
    keydown(root(), "Escape");
    await settle();
    expect(listbox()).toBeNull();
    expect(textOf(editor)).toBe("@zz");
  });

  test("a name in Arabic is isolated in its row, and the menu has no ARIA faults", async () => {
    const editor = capture();
    function Arabic(props: { children: Child }) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <RichTextEditor label="رسالة" toolbar={false} onEditor={editor.set}>
          <MentionTypeahead source={[{ id: "a", name: "سلامة" }, ...PEOPLE]} />
        </RichTextEditor>
      </Arabic>
    ));
    await settle();
    await typeText(editor.get(), "@س");
    expect(document.querySelector('[role="option"] bdi')?.textContent).toBe("سلامة");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("takes a class per part", async () => {
    const editor = await mount(() => (
      <MentionTypeahead source={PEOPLE} classes={{ menu: "m", option: "o" }} class="mine" />
    ));
    await typeText(editor, "@a");
    expect(listbox()?.classList.contains("m")).toBe(true);
    expect(listbox()?.classList.contains("mine")).toBe(true);
    expect(document.querySelector('[role="option"]')?.classList.contains("o")).toBe(true);
  });
});

describe("SlashCommandMenu", () => {
  test("offers every command under its group, and the best match first as more is typed", async () => {
    const editor = await mount(() => <SlashCommandMenu />);
    await typeText(editor, "/");
    expect(listbox()?.getAttribute("aria-label")).toBe("Blocks");
    expect(
      [...document.querySelectorAll('[data-slot="typeahead-heading"]')].map(
        (one) => one.textContent,
      ),
    ).toEqual(["Basic", "Media"]);
    await typeText(editor, "heading 2");
    expect(options()[0]).toBe("Heading 2");
    expect(document.querySelector('[data-slot="typeahead-heading"]')).toBeNull();
    keydown(root(), "Enter");
    await settle();
    expect(root().querySelector("h2")).not.toBeNull();
    expect(textOf(editor)).toBe("");
  });

  test("a list, a quote and a table come from a word", async () => {
    const editor = await mount(() => <SlashCommandMenu />);
    await typeText(editor, "/table");
    keydown(root(), "Enter");
    await settle();
    expect(root().querySelector("table")).not.toBeNull();
  });

  test("says when nothing matches, and a sentence after a slash closes it", async () => {
    const editor = await mount(() => <SlashCommandMenu />);
    await typeText(editor, "/zzz");
    expect(document.querySelector('[data-slot="typeahead-status"]')?.textContent).toBe(
      "No matching blocks",
    );
    await typeText(editor, " more words");
    expect(listbox()).toBeNull();
  });
});

describe("EmojiShortcuts", () => {
  test("a colon and two letters offer emoji by name, inserted as the character", async () => {
    const editor = await mount(() => <EmojiShortcuts source={Promise.resolve(EMOJI)} />);
    await typeText(editor, "nice :th");
    await waitFor(() => expect(options()).toEqual(["👍thumbs up"]));
    expect(listbox()?.getAttribute("aria-label")).toBe("Emoji");
    keydown(root(), "Enter");
    await settle();
    expect(textOf(editor)).toBe("nice 👍");
  });
});

describe("on the server", () => {
  test("a composer with its typeaheads hydrates, drawing no menu", async () => {
    const result = await hydrates(`
      import { MentionTypeahead, RichTextEditor, SlashCommandMenu } from "<arc>/../editor/index.ts";
      export function Page() {
        return (
          <RichTextEditor label="Message" toolbar={false}>
            <MentionTypeahead source={[{ id: "u1", name: "Salama" }]} />
            <SlashCommandMenu />
          </RichTextEditor>
        );
      }
    `);
    expect(result.container.querySelector('[role="listbox"]')).toBeNull();
    result.unmount();
  });
});
