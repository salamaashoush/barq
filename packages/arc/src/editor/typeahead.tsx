import { type Child, For, Show, createMemo, onCleanup } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { filter as localeFilter, useLocale } from "@barqjs/aria/i18n";
import {
  LexicalTypeaheadMenuPlugin,
  type MenuRenderProps,
  MenuOption,
  type TriggerFn,
  basicTypeaheadTriggerMatch,
  useLexicalEditor,
} from "@barqjs/lexical";
import { dropdownMenuVariants } from "@barqjs/ui/dropdown-menu";
import { $createTextNode, type LexicalEditor } from "lexical";

import { type EmojiDataset, type EmojiSource, loadEmoji, searchEmoji } from "../chat/emoji-data.ts";
import { type ArcMessages, useArcMessages } from "../components/messages.ts";
import { PersonAvatar } from "../components/person-avatar.tsx";
import { type RemoteState, remoteSearch } from "../components/remote-search.ts";
import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { fg, gap, glyph, layout, space, truncate, type, zIndex } from "../style/index.ts";
import { labelOf } from "./blocks.tsx";
import { shortcutLabel } from "./commands.ts";
import {
  type CommandPlace,
  type EditorExtension,
  commandsOf,
  editorExtensions,
} from "./extension.ts";
import { editorSignal } from "./hooks.ts";
import { $createMentionNode } from "./mention-node.ts";

export const typeaheadStyles = variants({
  slots: {
    menu: arc(dropdownMenuVariants().content, {
      zIndex: zIndex.popover,
      width: "min(20rem, calc(100vw - 1rem))",
      maxHeight: "min(20rem, 50dvh)",
    }),
    heading: arc(type.caption, fg.muted, type.medium, {
      paddingInline: space.x1_5,
      paddingBlock: space.x1,
    }),
    option: arc(dropdownMenuVariants().item, gap[2]),
    icon: arc(layout.inlineCentre, glyph.md, fg.muted, layout.noShrink),
    text: arc(layout.column, layout.minZero, layout.grow),
    label: arc(truncate, { unicodeBidi: "isolate" }),
    detail: arc(type.caption, fg.muted, truncate),
    hint: arc(type.caption, fg.faint, layout.pushEnd, { direction: "ltr" }),
    empty: arc(type.caption, fg.muted, { padding: space.x2 }),
    emoji: arc(layout.inlineCentre, { fontSize: "1.25em", width: "1.5em" }),
  },
});

type Slots = ReturnType<typeof typeaheadStyles>;

export interface OptionExtra {
  detail?: string;
  group?: string;
  icon?: () => Child;
  hint?: string;
}

/** One thing a typeahead offers: what it is called, a line under it, an icon, a group. */
export class TypeaheadOption<Value = unknown> extends MenuOption {
  constructor(
    key: string,
    readonly label: string,
    readonly value: Value,
    readonly extra: OptionExtra = {},
  ) {
    super(key);
    this.title = label;
  }
}

interface TypeaheadListProps<Value> {
  menu: MenuRenderProps<TypeaheadOption<Value>>;
  cls: Slots;
  status?: string;
  grouped?: boolean;
  option?: (option: TypeaheadOption<Value>) => Child;
}

/** The menu a typeahead draws: its options with the highlight, under group headings, or what it is waiting for. */
function TypeaheadList<Value>(props: TypeaheadListProps<Value>) {
  const menu = props.menu;
  function heading(index: number): string | undefined {
    if (props.grouped !== true) return undefined;
    const options = menu.options();
    const group = options[index]?.extra.group;
    return group !== undefined && group !== options[index - 1]?.extra.group ? group : undefined;
  }
  return (
    <>
      <For each={menu.options()}>
        {(option: TypeaheadOption<Value>, index: () => number) => (
          <>
            <Show when={heading(index())}>
              {(group: () => string) => (
                <div class={props.cls.heading} role="presentation" data-slot="typeahead-heading">
                  {group()}
                </div>
              )}
            </Show>
            <div
              id={menu.optionId(index())}
              role="option"
              aria-selected={menu.selectedIndex() === index()}
              data-focused={menu.selectedIndex() === index() ? "" : undefined}
              class={props.cls.option}
              data-slot="typeahead-option"
              ref={(element: HTMLDivElement) => option.setRefElement(element)}
              onPointerMove={() => menu.setHighlightedIndex(index())}
              onMouseDown={(event: MouseEvent) => event.preventDefault()}
              onClick={() => {
                menu.setHighlightedIndex(index());
                menu.selectOptionAndCleanUp(option);
              }}
            >
              {props.option === undefined ? (
                <>
                  <Show when={option.extra.icon !== undefined}>
                    <span class={props.cls.icon} aria-hidden="true">
                      {option.extra.icon?.()}
                    </span>
                  </Show>
                  <span class={props.cls.text}>
                    <span class={props.cls.label}>{option.label}</span>
                    <Show when={option.extra.detail}>
                      <span class={props.cls.detail}>{option.extra.detail}</span>
                    </Show>
                  </span>
                  <Show when={option.extra.hint}>
                    <span class={props.cls.hint} aria-hidden="true">
                      {option.extra.hint}
                    </span>
                  </Show>
                </>
              ) : (
                props.option(option)
              )}
            </div>
          </>
        )}
      </For>
      <Show when={menu.options().length === 0 && props.status !== undefined}>
        <div class={props.cls.empty} role="presentation" data-slot="typeahead-status">
          {props.status}
        </div>
      </Show>
    </>
  );
}

// --- mentions ----------------------------------------------------------------

/** Someone or something `@` can name. */
export interface MentionCandidate {
  id: string;
  name: string;
  /** A line under the name: an email, a role, a channel's topic. */
  description?: string;
  /** A photo, for the avatar. */
  avatar?: string;
}

export interface MentionSearchContext {
  signal: AbortSignal;
}

export type MentionSource =
  | readonly MentionCandidate[]
  | ((query: string, context: MentionSearchContext) => Promise<readonly MentionCandidate[]>);

export interface MentionTypeaheadProps extends Customisable<Slots> {
  /** Who the trigger offers: a list, filtered as typed, or a search a server answers. */
  source: MentionSource;
  /** @default "@" */
  trigger?: string;
  /** At most this many offered. @default 8 */
  limit?: number;
  /** A search waits this long after typing stops. @default 150 */
  debounce?: number;
  /** Avatars beside the names. @default true */
  avatars?: boolean;
  /** Told each mention as it is inserted. */
  onMention?: (candidate: MentionCandidate) => void;
  /** Names the listbox. @default arc's "Mentions" */
  "aria-label"?: string;
}

/**
 * `@` and a few letters offer people, or channels with `trigger="#"`, from a
 * list or a server's search: the arrows move, Enter or Tab inserts a mention
 * node carrying the id, Escape leaves the text as typed. A server's search
 * is debounced, its stale answers dropped, and says when it is searching and
 * when it found nobody.
 */
export function MentionTypeahead(props: MentionTypeaheadProps) {
  const messages = useArcMessages();
  const locale = useLocale();
  function cls(): Slots {
    return parts(typeaheadStyles(), props.classes);
  }
  function trigger(): string {
    return props.trigger ?? "@";
  }
  const [query, setQuery] = editorSignal<string | null>(null);
  const [remote, setRemote] = editorSignal<RemoteState<MentionCandidate>>({
    status: "idle",
    results: [],
    loadingMore: false,
  });
  const match = localeFilter({ sensitivity: "base" });
  const search = remoteSearch<MentionCandidate>({
    search: () => (text, context) => {
      const source = props.source;
      return typeof source === "function" ? source(text, context) : Promise.resolve([]);
    },
    debounce: props.debounce ?? 150,
    onChange: setRemote,
  });
  onCleanup(search.stop);

  const candidates = createMemo((): readonly MentionCandidate[] => {
    const typed = query();
    if (typed === null) return [];
    const source = props.source;
    if (typeof source === "function") return remote().results;
    return source.filter(
      (one) => match.contains(one.name, typed) || match.contains(one.description ?? "", typed),
    );
  });
  const options = createMemo(() =>
    candidates()
      .slice(0, props.limit ?? 8)
      .map(
        (one) =>
          new TypeaheadOption(one.id, one.name, one, {
            detail: one.description,
          }),
      ),
  );
  function status(): string | undefined {
    if (typeof props.source !== "function")
      return query() === null ? undefined : messages().noResults;
    switch (remote().status) {
      case "loading":
        return messages().searching;
      case "error":
        return messages().searchFailedPlain;
      case "done":
        return messages().noResults;
      default:
        return undefined;
    }
  }

  return (
    <LexicalTypeaheadMenuPlugin<TypeaheadOption<MentionCandidate>>
      triggerFn={basicTypeaheadTriggerMatch(trigger(), { minLength: 0, maxLength: 40 })}
      onQueryChange={(value) => {
        setQuery(value);
        if (value !== null && typeof props.source === "function") search.query(value);
      }}
      onClose={() => search.stop()}
      options={options()}
      anchorClassName={arc(cls().menu, props.class, props.className)}
      menuLabel={props["aria-label"] ?? messages().mentions}
      onSelectOption={(option, node, close) => {
        const mention = $createMentionNode({
          id: option.value.id,
          name: option.value.name,
          trigger: trigger(),
        });
        if (node === null) return;
        node.replace(mention);
        const after = $createTextNode(" ");
        mention.insertAfter(after);
        after.select(1, 1);
        close();
        props.onMention?.(option.value);
      }}
      menuRenderFn={(menu) => (
        <TypeaheadList
          menu={menu}
          cls={cls()}
          status={status()}
          option={(option) => (
            <>
              <Show when={props.avatars !== false}>
                <PersonAvatar
                  size="sm"
                  person={{
                    id: option.value.id,
                    name: option.value.name,
                    src: option.value.avatar,
                  }}
                />
              </Show>
              <span class={cls().text} dir="auto" lang={locale().locale}>
                <bdi class={cls().label}>{option.label}</bdi>
                <Show when={option.extra.detail}>
                  <span class={cls().detail}>{option.extra.detail}</span>
                </Show>
              </span>
            </>
          )}
        />
      )}
    />
  );
}

// --- slash commands ----------------------------------------------------------

/** Something `/` can do: a block to turn into or insert, an action of an app's own. */
export interface SlashCommand {
  id: string;
  label: string;
  /** The heading it sits under while nothing has been typed. */
  group?: string;
  icon?: () => Child;
  /** More words it is found by. */
  keywords?: readonly string[];
  description?: string;
  /** The keys that do the same, shown at its end. */
  shortcut?: string;
  /** Runs inside an editor update, with the `/query` already taken out. */
  run: (editor: LexicalEditor) => void;
}

/** How well `query` names `command`: 0 not at all, higher first. */
function rank(
  command: SlashCommand,
  query: string,
  starts: (text: string, part: string) => boolean,
): number {
  if (query === "") return 1;
  const label = command.label;
  if (starts(label, query)) return 4;
  const words = [...label.split(/\s+/), ...(command.keywords ?? [])];
  if (words.some((word) => starts(word, query))) return 3;
  if (command.keywords?.some((word) => starts(query, word))) return 2;
  return 0;
}

/**
 * What an editor's extensions offer in a place, in the reader's words: the
 * `/` menu's commands, the block picker's, the toolbar's Insert menu's.
 */
export function editorCommands(
  messages: ArcMessages,
  extensions: readonly EditorExtension[],
  editor: LexicalEditor | null,
  place: CommandPlace = "slash",
): SlashCommand[] {
  const commands = commandsOf(extensions, editor, place).map((command) => ({
    id: command.id,
    label: labelOf(command.label, messages),
    group: command.group === undefined ? messages.basicBlocks : labelOf(command.group, messages),
    icon: command.icon,
    keywords: command.keywords,
    description:
      command.description === undefined ? undefined : labelOf(command.description, messages),
    shortcut: command.shortcut === undefined ? undefined : shortcutLabel(command.shortcut),
    run: command.run,
  }));
  // A group's commands sit together, the groups in the order they are first met.
  const groups = [...new Set(commands.map((command) => command.group))];
  return commands.toSorted((a, b) => groups.indexOf(a.group) - groups.indexOf(b.group));
}

export interface SlashCommandMenuProps extends Customisable<Slots> {
  /** What it offers. @default what the editor's extensions offer */
  commands?: readonly SlashCommand[];
  /** Names the listbox. @default arc's "Blocks" */
  "aria-label"?: string;
}

/**
 * `/` at the start of a line or after a space offers commands grouped under
 * their headings, and as more is typed the best matches first, so Enter
 * takes the best one at once. The query may hold spaces ("heading 2"); it
 * ends at a line break or another `/`, and the menu says when nothing
 * matches.
 */
export function SlashCommandMenu(props: SlashCommandMenuProps) {
  const editor = useLexicalEditor();
  const messages = useArcMessages();
  function cls(): Slots {
    return parts(typeaheadStyles(), props.classes);
  }
  const [query, setQuery] = editorSignal<string | null>(null);
  const match = localeFilter({ sensitivity: "base" });
  const base = basicTypeaheadTriggerMatch("/", {
    minLength: 0,
    maxLength: 32,
    allowWhitespace: true,
    punctuation: "\\/",
  });
  const commands = createMemo(
    () => props.commands ?? editorCommands(messages(), editorExtensions(editor), editor, "slash"),
  );
  function ranked(typed: string): SlashCommand[] {
    return commands()
      .map((command, index) => ({
        command,
        index,
        score: rank(command, typed.trim(), match.startsWith),
      }))
      .filter((one) => one.score > 0)
      .toSorted((a, b) => b.score - a.score || a.index - b.index)
      .map((one) => one.command);
  }
  // A query that has grown a space and matches nothing is a sentence, not a command.
  const triggerFn: TriggerFn = (text, current) => {
    const found = base(text, current);
    if (found === null) return null;
    if (/\s/.test(found.matchingString) && ranked(found.matchingString).length === 0) return null;
    return found;
  };
  const options = createMemo(() => {
    const typed = query();
    if (typed === null) return [];
    return ranked(typed).map(
      (command) =>
        new TypeaheadOption(command.id, command.label, command, {
          detail: command.description,
          group: command.group,
          icon: command.icon,
          hint: command.shortcut,
        }),
    );
  });

  return (
    <LexicalTypeaheadMenuPlugin<TypeaheadOption<SlashCommand>>
      triggerFn={triggerFn}
      onQueryChange={setQuery}
      options={options()}
      anchorClassName={arc(cls().menu, props.class, props.className)}
      menuLabel={props["aria-label"] ?? messages().blocks}
      onSelectOption={(option, node, close) => {
        node?.remove();
        close();
        option.value.run(editor);
      }}
      menuRenderFn={(menu) => (
        <TypeaheadList
          menu={menu}
          cls={cls()}
          grouped={(query() ?? "") === ""}
          status={messages().noMatchingBlocks}
        />
      )}
    />
  );
}

// --- emoji -------------------------------------------------------------------

export interface EmojiShortcutsProps extends Customisable<Slots> {
  /** Where the emoji come from. @default English, from emojibase, loaded on the first `:` */
  source?: EmojiSource;
  /** At most this many offered. @default 8 */
  limit?: number;
}

/**
 * `:` and two letters offer the emoji whose names start with them (`:thu`
 * offers 👍), inserted as the character itself. The list loads on the first
 * `:`, from the same data `EmojiPicker` reads.
 */
export function EmojiShortcuts(props: EmojiShortcutsProps) {
  const messages = useArcMessages();
  const locale = useLocale();
  function cls(): Slots {
    return parts(typeaheadStyles(), props.classes);
  }
  const [query, setQuery] = editorSignal<string | null>(null);
  const [dataset, setDataset] = editorSignal<EmojiDataset | null>(null);
  let asked = false;
  const options = createMemo(() => {
    const typed = query();
    const data = dataset();
    if (typed === null || data === null) return [];
    return searchEmoji(data, typed.replace(/_/g, " "))
      .slice(0, props.limit ?? 8)
      .map(
        (entry) =>
          new TypeaheadOption(entry.emoji, entry.label, entry.emoji, {
            icon: () => entry.emoji,
          }),
      );
  });
  return (
    <LexicalTypeaheadMenuPlugin<TypeaheadOption<string>>
      triggerFn={basicTypeaheadTriggerMatch(":", {
        minLength: 2,
        maxLength: 30,
        punctuation: "\\.,\\?!:;",
      })}
      onQueryChange={(value) => {
        setQuery(value);
        if (value === null || asked) return;
        asked = true;
        void loadEmoji(props.source, locale().locale).then(setDataset, () => {
          asked = false;
        });
      }}
      options={options()}
      anchorClassName={arc(cls().menu, props.class, props.className)}
      menuLabel={messages().emojiSuggestions}
      onSelectOption={(option, node, close) => {
        const text = $createTextNode(option.value);
        if (node === null) return;
        node.replace(text);
        text.select(option.value.length, option.value.length);
        close();
      }}
      menuRenderFn={(menu) => (
        <TypeaheadList
          menu={menu}
          cls={cls()}
          status={dataset() === null ? messages().loadingEmoji : messages().noEmojiFound}
          option={(option) => (
            <>
              <span class={cls().emoji} aria-hidden="true">
                {option.value}
              </span>
              <span class={cls().label}>{option.label}</span>
            </>
          )}
        />
      )}
    />
  );
}
