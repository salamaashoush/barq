/**
 * The binding against the shape a chat composer on `@lexical/react` has: rich
 * text with history, lists, links and autolinks, markdown shortcuts and tab
 * indentation, a change listener, a toolbar that follows the selection's
 * format, an `@` mention typeahead that inserts a custom inline node, and a
 * `/` command menu. Every edit goes through the editor and every key through
 * the root element, as a browser would deliver them.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { type Accessor, For, createMemo, createSignal, flush } from "@barqjs/core";
import { render } from "@barqjs/web";
import { TabIndentationExtension } from "@lexical/extension";
import { HistoryExtension } from "@lexical/history";
import { AutoLinkExtension, LinkExtension, autoLinkUrlMatcher } from "@lexical/link";
import { ListExtension } from "@lexical/list";
import { HEADING, QUOTE, UNORDERED_LIST, registerMarkdownShortcuts } from "@lexical/markdown";
import { $createQuoteNode, $isHeadingNode, RichTextExtension } from "@lexical/rich-text";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  type EditorState,
  type ElementNode,
  FORMAT_TEXT_COMMAND,
  type LexicalEditor,
  TextNode,
  UNDO_COMMAND,
  configExtension,
  defineExtension,
} from "lexical";

import { $isMentionNode, MentionNode } from "./fixtures/mention-node.ts";
import {
  ContentEditable,
  LexicalComposer,
  LexicalTypeaheadMenuPlugin,
  type MenuRenderProps,
  MenuOption,
  OnChangePlugin,
  basicTypeaheadTriggerMatch,
  useLexicalEditor,
  useLexicalEditorState,
} from "./index.ts";
import { host, key, settle } from "./test-helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.body.innerHTML = "";
});

interface Member {
  id: string;
  display_name: string;
  email: string;
}

const members: Member[] = [
  { id: "u1", display_name: "Salama", email: "salama@example.com" },
  { id: "u2", display_name: "Sales Team", email: "sales@example.com" },
  { id: "u3", display_name: "Acme Bot", email: "bot@example.com" },
];
const channels = [
  { id: "c1", name: "general" },
  { id: "c2", name: "random" },
];

class MentionOption extends MenuOption {
  constructor(
    readonly name: string,
    readonly id: string,
    readonly kind: "user" | "channel",
  ) {
    super(`${kind}:${id}`);
  }
}

interface MentionMenuProps {
  menu: MenuRenderProps<MentionOption>;
}

function MentionMenu(props: MentionMenuProps) {
  const menu = props.menu;
  return (
    <div class="mention-menu">
      <For each={menu.options()}>
        {(option: MentionOption, index: Accessor<number>) => (
          <button
            type="button"
            role="option"
            id={menu.optionId(index())}
            aria-selected={menu.selectedIndex() === index()}
            ref={(element: HTMLButtonElement) => option.setRefElement(element)}
            onMouseEnter={() => menu.setHighlightedIndex(index())}
            onClick={() => menu.selectOptionAndCleanUp(option)}
          >
            {option.name}
          </button>
        )}
      </For>
    </div>
  );
}

interface MentionPluginProps {
  users: Member[];
}

function MentionPlugin(props: MentionPluginProps) {
  const [query, setQuery] = createSignal<string | null>(null);
  const [trigger, setTrigger] = createSignal<"@" | "#" | null>(null, { ownedWrite: true });
  const users = basicTypeaheadTriggerMatch("@", { minLength: 0 });
  const rooms = basicTypeaheadTriggerMatch("#", { minLength: 0 });

  function triggerFn(typed: string, editor: LexicalEditor) {
    const user = users(typed, editor);
    if (user !== null) {
      setTrigger("@");
      return user;
    }
    const room = rooms(typed, editor);
    setTrigger(room === null ? null : "#");
    return room;
  }

  const options = createMemo((): MentionOption[] => {
    const typed = query();
    if (typed === null) return [];
    const lower = typed.toLowerCase();
    if (trigger() === "@") {
      return props.users
        .filter(
          (user) => user.display_name.toLowerCase().includes(lower) || user.email.includes(lower),
        )
        .slice(0, 5)
        .map((user) => new MentionOption(user.display_name, user.id, "user"));
    }
    if (trigger() === "#") {
      return channels
        .filter((channel) => channel.name.includes(lower))
        .map((channel) => new MentionOption(channel.name, channel.id, "channel"));
    }
    return [];
  });

  return (
    <LexicalTypeaheadMenuPlugin<MentionOption>
      onQueryChange={(value) => setQuery(value)}
      onSelectOption={(option, nodeToReplace, closeMenu) => {
        const mention = new MentionNode(option.name, option.id);
        if (nodeToReplace !== null) nodeToReplace.replace(mention);
        mention.insertAfter(new TextNode(" "));
        mention.selectNext();
        closeMenu();
      }}
      triggerFn={triggerFn}
      options={options()}
      menuLabel="People and channels"
      menuRenderFn={(menu) => <MentionMenu menu={menu} />}
    />
  );
}

class CommandOption extends MenuOption {
  constructor(
    readonly label: string,
    readonly run: (editor: LexicalEditor) => void,
  ) {
    super(label);
    this.title = label;
  }
}

const COMMANDS = [
  new CommandOption("Quote", () => {
    const selection = $getSelection();
    if ($isRangeSelection(selection))
      selection.anchor.getNode().getTopLevelElementOrThrow().replace($createQuoteNode(), true);
  }),
  new CommandOption("Divider", () => undefined),
];

/** A `/` command list, drawn by the default menu. */
function SlashCommands() {
  const editor = useLexicalEditor();
  const [query, setQuery] = createSignal<string | null>(null);
  const options = createMemo(() =>
    COMMANDS.filter((command) =>
      command.label.toLowerCase().includes((query() ?? "").toLowerCase()),
    ),
  );
  return (
    <LexicalTypeaheadMenuPlugin<CommandOption>
      onQueryChange={(value) => setQuery(value)}
      onSelectOption={(option, node, closeMenu) => {
        node?.remove();
        option.run(editor);
        closeMenu();
      }}
      triggerFn={basicTypeaheadTriggerMatch("/", { minLength: 0 })}
      options={options()}
    />
  );
}

function Toolbar() {
  const editor = useLexicalEditor();
  const isBold = useLexicalEditorState(() => {
    const selection = $getSelection();
    return $isRangeSelection(selection) && selection.hasFormat("bold");
  });
  return (
    <button
      type="button"
      class="bold"
      aria-pressed={isBold()}
      onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")}
    >
      B
    </button>
  );
}

const MarkdownShortcuts = defineExtension({
  name: "chat/markdown",
  register: (editor) => registerMarkdownShortcuts(editor, [HEADING, QUOTE, UNORDERED_LIST]),
});

interface Mounted {
  editor: LexicalEditor;
  root: HTMLElement;
  element: HTMLElement;
  changes: EditorState[];
}

async function mountComposer(): Promise<Mounted> {
  let editor!: LexicalEditor;
  const changes: EditorState[] = [];
  function Grab() {
    editor = useLexicalEditor();
    return null;
  }
  const element = host();
  cleanups.push(
    render(
      () => (
        <LexicalComposer
          extensions={[
            RichTextExtension,
            HistoryExtension,
            ListExtension,
            LinkExtension,
            configExtension(AutoLinkExtension, { matchers: [autoLinkUrlMatcher] }),
            TabIndentationExtension,
            MarkdownShortcuts,
          ]}
          initialConfig={{
            namespace: "chat",
            nodes: [MentionNode],
            onError: (error) => {
              throw error;
            },
          }}
          contentEditable={null}
        >
          <Toolbar />
          <div class="editor-shell">
            <ContentEditable
              class="composer"
              aria-label="Message"
              placeholder={<span>Message #general</span>}
            />
          </div>
          <OnChangePlugin onChange={(state) => changes.push(state)} />
          <MentionPlugin users={members} />
          <SlashCommands />
          <Grab />
        </LexicalComposer>
      ),
      element,
    ),
  );
  await settle();
  const root = element.querySelector<HTMLElement>(".composer");
  if (root === null) throw new Error("no editable root");
  root.focus();
  return { editor, root, element, changes };
}

/** Types `keys` at the end of the document, one character per update, as keystrokes would. */
async function type(editor: LexicalEditor, keys: string): Promise<void> {
  for (const character of keys) {
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

function text(editor: LexicalEditor): string {
  return editor.getEditorState().read(() => $getRoot().getTextContent());
}

describe("a chat composer", () => {
  test("renders the root, a placeholder while empty, and the toolbar outside the root", async () => {
    const { root, element } = await mountComposer();
    expect(root.getAttribute("contenteditable")).toBe("true");
    expect(root.getAttribute("aria-label")).toBe("Message");
    expect(element.querySelector(".editor-shell")?.textContent).toContain("Message #general");
    expect(element.querySelector("button.bold")).not.toBeNull();
  });

  test("the placeholder goes once there is text, and the change listener hears the edit", async () => {
    const { editor, element, changes } = await mountComposer();
    await type(editor, "hi");
    expect(text(editor)).toBe("hi");
    expect(element.querySelector(".editor-shell")?.textContent).toBe("hi");
    expect(changes.length).toBeGreaterThan(0);
    expect(changes.at(-1)?.read(() => $getRoot().getTextContent())).toBe("hi");
  });

  test("the toolbar follows the selection's format", async () => {
    const { editor, element } = await mountComposer();
    await type(editor, "word");
    const bold = element.querySelector<HTMLButtonElement>("button.bold");
    expect(bold?.getAttribute("aria-pressed")).toBe("false");
    editor.update(() => $getRoot().select(0, 1));
    await settle();
    bold?.click();
    await settle();
    expect(bold?.getAttribute("aria-pressed")).toBe("true");
    expect(element.querySelector(".composer strong, .composer b")?.textContent).toBe("word");
  });

  test("an @ query opens a listbox under the caret, arrows move the highlight, Enter inserts a mention", async () => {
    const { editor, root } = await mountComposer();
    await type(editor, "hey @sa");

    const listbox = document.querySelector<HTMLElement>('[role="listbox"]');
    expect(listbox).not.toBeNull();
    expect(listbox?.getAttribute("aria-label")).toBe("People and channels");
    expect(listbox?.style.position).toBe("absolute");
    const options = [...(listbox?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
    expect(options.map((option) => option.textContent)).toEqual(["Salama", "Sales Team"]);
    expect(root.getAttribute("aria-controls")).toBe(listbox?.id ?? "");
    expect(root.getAttribute("aria-activedescendant")).toBe(options[0]?.id ?? "");
    expect(options[0]?.getAttribute("aria-selected")).toBe("true");

    expect(key(root, "ArrowDown").defaultPrevented).toBe(true);
    await settle();
    expect(root.getAttribute("aria-activedescendant")).toBe(options[1]?.id ?? "");
    expect(options[1]?.getAttribute("aria-selected")).toBe("true");
    expect(options[0]?.getAttribute("aria-selected")).toBe("false");

    key(root, "ArrowDown");
    await settle();
    expect(root.getAttribute("aria-activedescendant")).toBe(options[0]?.id ?? "");
    key(root, "ArrowUp");
    await settle();

    key(root, "Enter");
    await settle();
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(root.hasAttribute("aria-activedescendant")).toBe(false);
    expect(root.hasAttribute("aria-controls")).toBe(false);
    expect(text(editor)).toBe("hey Sales Team ");
    const mention = root.querySelector<HTMLElement>(".mention");
    expect(mention?.textContent).toBe("Sales Team");
    expect(mention?.dataset.mentionId).toBe("u2");
    editor.getEditorState().read(() => {
      const nodes = $getRoot().getAllTextNodes();
      expect(nodes.some((node) => $isMentionNode(node) && node.__mentionId === "u2")).toBe(true);
    });
  });

  test("typing after a mention narrows nothing: the menu stays closed until a new trigger", async () => {
    const { editor, root } = await mountComposer();
    await type(editor, "@sal");
    key(root, "Enter");
    await settle();
    expect(text(editor)).toBe("Salama ");
    await type(editor, "ok");
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    await type(editor, " #gen");
    expect(document.querySelector('[role="listbox"]')?.textContent).toBe("general");
  });

  test("Escape closes the menu and leaves the query as text", async () => {
    const { editor, root } = await mountComposer();
    await type(editor, "@s");
    expect(document.querySelector('[role="listbox"]')).not.toBeNull();
    key(root, "Escape");
    await settle();
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(text(editor)).toBe("@s");
  });

  test("a click on an option chooses it", async () => {
    const { editor } = await mountComposer();
    await type(editor, "@bot");
    document.querySelector<HTMLElement>('[role="option"]')?.click();
    await settle();
    expect(text(editor)).toBe("Acme Bot ");
  });

  test("a / command from the default menu turns the block into a quote", async () => {
    const { editor, root } = await mountComposer();
    await type(editor, "/quo");
    expect(document.querySelector('[role="listbox"]')?.getAttribute("aria-label")).toBe(
      "Typeahead menu",
    );
    const items = [...document.querySelectorAll<HTMLElement>('li[role="option"]')];
    expect(items.map((item) => item.textContent)).toEqual(["Quote"]);
    expect(items[0]?.className).toBe("item selected");
    key(root, "Tab");
    await settle();
    expect(root.querySelector("blockquote")).not.toBeNull();
    expect(text(editor)).toBe("");
  });

  test("markdown shortcuts make a heading and a list, and Tab indents the list item", async () => {
    const { editor, root } = await mountComposer();
    await type(editor, "# ");
    editor
      .getEditorState()
      .read(() => expect($isHeadingNode($getRoot().getFirstChild())).toBe(true));
    await type(editor, "Title");
    expect(root.querySelector("h1")?.textContent).toBe("Title");

    editor.update(() => {
      $getRoot().append($createParagraphNode());
      $getRoot().selectEnd();
    });
    await settle();
    await type(editor, "- one");
    expect(root.querySelector("ul > li")?.textContent).toBe("one");
    // Tab indents from the start of a block and inserts a tab anywhere else.
    editor.update(() => {
      const list = $getRoot().getLastChild();
      if ($isElementNode(list)) (list.getFirstChildOrThrow() as ElementNode).selectStart();
    });
    await settle();
    key(root, "Tab");
    await settle();
    expect(root.querySelector("ul ul")).not.toBeNull();
  });

  test("a URL typed becomes an autolink", async () => {
    const { editor, root } = await mountComposer();
    await type(editor, "see https://example.com ");
    expect(root.querySelector("a")?.getAttribute("href")).toBe("https://example.com");
  });

  test("undo reverts the last edit through the history extension", async () => {
    const { editor } = await mountComposer();
    editor.update(() => {
      $getRoot()
        .clear()
        .append($createParagraphNode().append($createTextNode("first")));
    });
    await settle(5);
    editor.update(() => {
      $getRoot()
        .clear()
        .append($createParagraphNode().append($createTextNode("second")));
    });
    await settle(5);
    editor.dispatchCommand(UNDO_COMMAND, undefined);
    await settle();
    expect(text(editor)).toBe("first");
    flush();
  });
});
