import {
  For,
  Show,
  createMemo,
  createSignal,
  createUniqueId,
  onSettled,
  untrack,
} from "@barqjs/core";
import { variants } from "@barqjs/css";
import { ListCollection, type Key, type Node } from "@barqjs/aria/collections";
import { useLocale } from "@barqjs/aria/i18n";
import { type LayoutInfo, listLayout, virtualizer } from "@barqjs/aria/virtualizer";
import { Search } from "@barqjs/lucide/icons/search";
import { ref as makeRef } from "@barqjs/primitives/refs";
import { persisted } from "@barqjs/primitives/storage";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@barqjs/ui/dropdown-menu";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@barqjs/ui/input-group";
import { Spinner } from "@barqjs/ui/spinner";
import { tokens } from "@barqjs/ui/theme/tokens";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  control,
  edge,
  fg,
  focus,
  gap,
  interaction,
  layout,
  panel,
  rounded,
  space,
  target,
  type,
} from "../style/index.ts";
import { IconButton } from "../components/icon-button.tsx";
import { useArcMessages } from "../components/messages.ts";
import {
  type EmojiDataset,
  type EmojiEntry,
  type EmojiSource,
  englishEmoji,
  loadEmoji,
  searchEmoji,
  withTone,
} from "./emoji-data.ts";

export const emojiPickerStyles = variants({
  slots: {
    root: arc(layout.column, gap[2], layout.minZero, { inlineSize: "100%" }),
    header: arc(layout.row, gap[1.5]),
    search: arc(layout.grow, layout.minZero),
    skin: arc(layout.noShrink),
    categories: arc(layout.row, layout.wrap, gap[0.5], edge.bottom),
    category: arc(control.bare, layout.inlineCentre, rounded.sm, target.size, focus.visible, {
      fontSize: "1.125rem",
      opacity: "0.6",
      "[aria-current]": { opacity: "1", boxShadow: `inset 0 -2px 0 ${tokens.primary}` },
    }),
    // The body grows from nothing, which in the picker's column would size it
    // by its content and draw every row; from its own height it scrolls them.
    viewport: arc(panel.body, layout.relative, focus.outline, {
      flexBasis: "auto",
      blockSize: "var(--arc-emoji-height, 16rem)",
    }),
    grid: arc(layout.relative, { inlineSize: "100%" }),
    heading: arc(type.meta, type.medium, layout.row, { paddingInline: space.x1 }),
    row: arc(layout.row),
    cell: arc(layout.inlineCentre, layout.grow, rounded.sm, interaction.pressable, {
      flexBasis: "0",
      fontSize: "1.375rem",
      lineHeight: "1",
      "[aria-selected=true]": { backgroundColor: tokens.accent },
    }),
    empty: arc(layout.centre, type.meta, { blockSize: "100%" }),
    loading: arc(layout.centre, gap[2], type.meta, { blockSize: "var(--arc-emoji-height, 16rem)" }),
    preview: arc(layout.row, gap[2], type.meta, layout.minZero, edge.top, {
      paddingBlockStart: space.x1_5,
      minBlockSize: space.x8,
    }),
    previewEmoji: arc({ fontSize: "1.5rem", lineHeight: "1" }),
    previewLabel: arc(layout.clip, layout.nowrap, fg.default),
  },
});

type Slots = ReturnType<typeof emojiPickerStyles>;

/** The hands a tone is shown on in the skin tone menu. */
const TONE_SAMPLE = ["✋", "✋🏻", "✋🏼", "✋🏽", "✋🏾", "✋🏿"] as const;
const RECENT_MAX = 24;

export interface EmojiPickerProps extends Customisable<Slots> {
  /** An emoji was chosen, in the reader's skin tone where it takes one. */
  onSelect: (emoji: string, entry: EmojiEntry) => void;
  /**
   * Where the emoji come from: a function handed the locale, or a file's
   * promise. @default English, from emojibase
   */
  source?: EmojiSource;
  /** Emoji per row. @default 8 */
  columns?: number;
  /** A row's height in px. @default 36 */
  rowHeight?: number;
  /** Where the recently used and the skin tone are remembered. @default "arc-emoji" */
  storageKey?: string;
  /** Focus the search on mount, as a picker opened from a button wants. */
  autoFocus?: boolean;
  "aria-label"?: string;
  id?: string;
}

interface Heading {
  kind: "heading";
  group: string;
  label: string;
}

interface EmojiRow {
  kind: "emoji";
  group: string;
  /** Its index among the emoji rows, which the keyboard moves through. */
  index: number;
  emojis: readonly EmojiEntry[];
}

type Row = Heading | EmojiRow;

const RECENT = "recent";

function node(key: Key, value: Row): Node<Row> {
  return {
    type: "item",
    key,
    value,
    textValue: "",
    level: 0,
    index: 0,
    hasChildNodes: false,
    childNodes: [],
    props: {},
  };
}

interface GridCell {
  row: number;
  column: number;
}

/**
 * A searchable grid of every emoji, in Unicode's groups and order, with the
 * reader's recently used first, a skin tone they choose once, and a row of
 * categories that jumps to each.
 *
 * ```tsx
 * <ResponsiveOverlay heading="Emoji" desktop="popover" trigger={<IconButton label="Emoji"><Smile /></IconButton>}>
 *   <EmojiPicker autoFocus onSelect={(emoji) => insert(emoji)} />
 * </ResponsiveOverlay>
 * ```
 *
 * The search keeps focus while the arrows move through the grid as a
 * combobox's do, Left and Right in the reading direction, Up and Down by a
 * row, Page Up and Page Down by a screen, and Enter chooses. Only the rows on
 * screen are drawn, through `@barqjs/aria`'s virtualizer. The emoji are
 * emojibase's, loaded when the first picker mounts; `source` takes another
 * language's file.
 */
export function EmojiPicker(props: EmojiPickerProps) {
  const messages = useArcMessages();
  const locale = useLocale();
  const listId = createUniqueId();
  function cls(): Slots {
    return parts(emojiPickerStyles(), props.classes);
  }
  function columns(): number {
    return Math.max(1, props.columns ?? 8);
  }
  function rowHeight(): number {
    return props.rowHeight ?? 36;
  }
  const storage = untrack(() => props.storageKey) ?? "arc-emoji";
  const [recent, setRecent] = persisted<string[]>(`${storage}:recent`, []);
  const [tone, setTone] = persisted<number>(`${storage}:tone`, 0);

  const [dataset, setDataset] = createSignal<EmojiDataset | null>(null, { ownedWrite: true });
  const [failed, setFailed] = createSignal(false, { ownedWrite: true });
  const [query, setQuery] = createSignal("");
  const [active, setActive] = createSignal<GridCell | null>(null);

  onSettled(() => {
    let live = true;
    loadEmoji(props.source ?? englishEmoji, locale().locale).then(
      (loaded) => {
        if (live) setDataset(loaded);
      },
      () => {
        if (live) setFailed(true);
      },
    );
    return () => {
      live = false;
    };
  });

  function searching(): boolean {
    return query().trim() !== "";
  }

  const rows = createMemo((): Row[] => {
    const data = dataset();
    if (data === null) return [];
    const out: Row[] = [];
    let index = 0;
    function chunk(group: string, emojis: readonly EmojiEntry[]): void {
      for (let at = 0; at < emojis.length; at += columns()) {
        out.push({
          kind: "emoji",
          group,
          index: index++,
          emojis: emojis.slice(at, at + columns()),
        });
      }
    }
    if (searching()) {
      chunk("search", searchEmoji(data, query()));
      return out;
    }
    const used = recent()
      .map((one) => data.byEmoji.get(one))
      .filter((one): one is EmojiEntry => one !== undefined);
    if (used.length > 0) {
      out.push({ kind: "heading", group: RECENT, label: messages().recentlyUsed });
      chunk(RECENT, used);
    }
    for (const group of data.groups) {
      out.push({ kind: "heading", group: group.key, label: messages().emojiGroup(group.key) });
      chunk(group.key, group.emojis);
    }
    return out;
  });

  const emojiRows = createMemo((): EmojiRow[] =>
    rows().filter((row): row is EmojiRow => row.kind === "emoji"),
  );
  function keyOf(row: Row, at: number): string {
    return row.kind === "heading" ? `h:${row.group}` : `r:${row.group}:${String(at)}`;
  }

  const viewport = makeRef<HTMLDivElement>();
  const layoutFor = listLayout({ rowHeight: untrack(rowHeight) });
  const collection = createMemo(
    () => new ListCollection<unknown>(rows().map((row, at) => node(keyOf(row, at), row))),
  );
  function activeKey(): Key | null {
    const held = active();
    if (held === null) return null;
    const all = rows();
    const at = all.findIndex((row) => row.kind === "emoji" && row.index === held.row);
    return at === -1 ? null : keyOf(all[at] as Row, at);
  }
  const virtual = virtualizer({
    layout: layoutFor,
    collection,
    ref: viewport,
    overscan: 0.5,
    persistedKeys: () => {
      const key = activeKey();
      return key === null ? [] : [key];
    },
  });

  function optionId(row: number, column: number): string {
    return `${listId}-${String(row)}-${String(column)}`;
  }
  function activeEntry(): EmojiEntry | undefined {
    const held = active();
    if (held === null) return undefined;
    return emojiRows()[held.row]?.emojis[held.column];
  }

  /** The group whose rows are at the top of the grid now. */
  function current(): string | undefined {
    const top = virtual.visibleRect().y;
    const all = rows();
    const at = Math.min(all.length - 1, Math.floor((top + 1) / rowHeight()));
    return all[Math.max(0, at)]?.group;
  }

  function reveal(key: Key, align: "start" | "nearest"): void {
    const element = viewport();
    const info = virtual.layout.getLayoutInfo(key);
    if (element === null || info === null) return;
    const top = info.rect.y;
    const bottom = top + info.rect.height;
    if (align === "start" || top < element.scrollTop) element.scrollTop = top;
    else if (bottom > element.scrollTop + element.clientHeight) {
      element.scrollTop = bottom - element.clientHeight;
    }
  }

  function move(next: GridCell): void {
    const list = emojiRows();
    if (list.length === 0) return;
    const row = Math.max(0, Math.min(list.length - 1, next.row));
    const width = list[row]?.emojis.length ?? 1;
    setActive({ row, column: Math.max(0, Math.min(width - 1, next.column)) });
    const key = activeKey();
    if (key !== null) reveal(key, "nearest");
  }

  function step(by: number): void {
    const list = emojiRows();
    const held = active();
    if (held === null) {
      move({ row: 0, column: 0 });
      return;
    }
    let { row, column } = held;
    column += by;
    while (column < 0 && row > 0) {
      row -= 1;
      column += list[row]?.emojis.length ?? 0;
    }
    while (column >= (list[row]?.emojis.length ?? 0) && row < list.length - 1) {
      column -= list[row]?.emojis.length ?? 0;
      row += 1;
    }
    move({ row, column });
  }

  function pick(entry: EmojiEntry): void {
    const emoji = withTone(entry, tone());
    setRecent((list) =>
      [entry.emoji, ...list.filter((one) => one !== entry.emoji)].slice(0, RECENT_MAX),
    );
    props.onSelect(emoji, entry);
  }

  function jump(group: string): void {
    const all = rows();
    const at = all.findIndex((row) => row.kind === "heading" && row.group === group);
    if (at === -1) return;
    reveal(keyOf(all[at] as Row, at), "start");
    const first = all[at + 1];
    if (first?.kind === "emoji") setActive({ row: first.index, column: 0 });
  }

  function onKeyDown(event: KeyboardEvent): void {
    const rtl = locale().direction === "rtl";
    const page = Math.max(1, Math.floor((viewport()?.clientHeight ?? 0) / rowHeight()));
    const held = active() ?? { row: -1, column: 0 };
    switch (event.key) {
      case "ArrowRight":
        step(rtl ? -1 : 1);
        break;
      case "ArrowLeft":
        step(rtl ? 1 : -1);
        break;
      case "ArrowDown":
        move({ row: held.row + 1, column: held.column });
        break;
      case "ArrowUp":
        move({ row: held.row - 1, column: held.column });
        break;
      case "PageDown":
        move({ row: held.row + page, column: held.column });
        break;
      case "PageUp":
        move({ row: held.row - page, column: held.column });
        break;
      case "Enter": {
        const entry = activeEntry();
        if (entry === undefined) return;
        pick(entry);
        break;
      }
      default:
        return;
    }
    event.preventDefault();
  }

  function groupsShown(): readonly string[] {
    const data = dataset();
    if (data === null) return [];
    const keys = data.groups.map((group) => group.key);
    return recent().length > 0 ? [RECENT, ...keys] : keys;
  }
  function glyphOf(group: string): string {
    if (group === RECENT) return "🕘";
    return dataset()?.groups.find((one) => one.key === group)?.emojis[0]?.emoji ?? "";
  }
  function groupLabel(group: string): string {
    return group === RECENT ? messages().recentlyUsed : messages().emojiGroup(group);
  }

  return (
    <div
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="emoji-picker"
      lang={locale().locale}
    >
      <div class={cls().header} data-slot="emoji-picker-header">
        <InputGroup class={cls().search} data-slot="emoji-picker-search">
          <InputGroupAddon>
            <Search aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            role="combobox"
            aria-label={props["aria-label"] ?? messages().searchEmoji}
            placeholder={messages().searchEmoji}
            aria-controls={listId}
            aria-expanded="true"
            aria-autocomplete="list"
            aria-activedescendant={
              active() === null ? undefined : optionId(active()?.row ?? 0, active()?.column ?? 0)
            }
            autoFocus={props.autoFocus}
            value={query()}
            onInput={(event: Event) => {
              const value = (event.currentTarget as HTMLInputElement).value;
              setQuery(value);
              setActive(value.trim() === "" ? null : { row: 0, column: 0 });
              const element = viewport();
              if (element !== null) element.scrollTop = 0;
            }}
            onKeyDown={onKeyDown}
          />
        </InputGroup>
        <Show when={dataset() !== null}>
          <DropdownMenu>
            <DropdownMenuTrigger>
              <IconButton
                class={cls().skin}
                label={`${messages().skinTone}: ${messages().skinToneName(tone())}`}
                variant="ghost"
                size="sm"
                tooltip={false}
              >
                <span aria-hidden="true">{TONE_SAMPLE[tone()] ?? TONE_SAMPLE[0]}</span>
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent aria-label={messages().skinTone}>
              <DropdownMenuRadioGroup
                value={String(tone())}
                onValueChange={(value: string) => setTone(Number(value))}
              >
                <For each={[0, 1, 2, 3, 4, 5]}>
                  {(one: number) => (
                    <DropdownMenuRadioItem
                      value={String(one)}
                      textValue={messages().skinToneName(one)}
                    >
                      <span aria-hidden="true">{TONE_SAMPLE[one]}</span>
                      {messages().skinToneName(one)}
                    </DropdownMenuRadioItem>
                  )}
                </For>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </Show>
      </div>
      <Show
        when={dataset() !== null}
        fallback={
          <div class={cls().loading} data-slot="emoji-picker-loading" role="status">
            <Show when={!failed()} fallback={messages().noEmojiFound}>
              <Spinner />
              {messages().loadingEmoji}
            </Show>
          </div>
        }
      >
        <Show when={!searching()}>
          <nav
            class={cls().categories}
            data-slot="emoji-picker-categories"
            aria-label={messages().emojiCategories}
          >
            <For each={groupsShown}>
              {(group: string) => (
                <button
                  type="button"
                  class={cls().category}
                  data-slot="emoji-picker-category"
                  aria-label={groupLabel(group)}
                  title={groupLabel(group)}
                  aria-current={current() === group ? "true" : undefined}
                  onClick={() => jump(group)}
                >
                  <span aria-hidden="true">{glyphOf(group)}</span>
                </button>
              )}
            </For>
          </nav>
        </Show>
        <div ref={viewport.set} class={cls().viewport} data-slot="emoji-picker-viewport">
          <Show
            when={rows().length > 0}
            fallback={
              <p class={cls().empty} data-slot="emoji-picker-empty" role="status">
                {messages().noEmojiFound}
              </p>
            }
          >
            <div
              id={listId}
              class={cls().grid}
              data-slot="emoji-picker-grid"
              role="listbox"
              aria-label={messages().emojiPicker}
              style={{ height: `${String(virtual.contentSize().height)}px` }}
            >
              <For each={() => virtual.visible()}>
                {(info: LayoutInfo) => {
                  function row(): Row | undefined {
                    return collection().getItem(info.key)?.value as Row | undefined;
                  }
                  function style(): Record<string, string> {
                    return {
                      position: "absolute",
                      top: `${String(info.rect.y)}px`,
                      "inset-inline": "0",
                      height: `${String(info.rect.height)}px`,
                    };
                  }
                  return (
                    <Show when={row()}>
                      {(held: () => Row) => (
                        <Show
                          when={held().kind === "emoji"}
                          fallback={
                            <div
                              class={cls().heading}
                              data-slot="emoji-picker-heading"
                              role="presentation"
                              style={style()}
                            >
                              {(held() as Heading).label}
                            </div>
                          }
                        >
                          <div
                            class={cls().row}
                            data-slot="emoji-picker-row"
                            role="presentation"
                            style={style()}
                          >
                            <For each={(held() as EmojiRow).emojis}>
                              {(entry: EmojiEntry, column: () => number) => {
                                function index(): number {
                                  return (held() as EmojiRow).index;
                                }
                                function selected(): boolean {
                                  return active()?.row === index() && active()?.column === column();
                                }
                                return (
                                  <div
                                    id={optionId(index(), column())}
                                    class={cls().cell}
                                    data-slot="emoji-picker-emoji"
                                    role="option"
                                    aria-selected={selected() ? "true" : "false"}
                                    aria-label={entry.label}
                                    title={entry.label}
                                    onPointerEnter={() =>
                                      setActive({ row: index(), column: column() })
                                    }
                                    onClick={() => pick(entry)}
                                  >
                                    {withTone(entry, tone())}
                                  </div>
                                );
                              }}
                            </For>
                          </div>
                        </Show>
                      )}
                    </Show>
                  );
                }}
              </For>
            </div>
          </Show>
        </div>
        <div class={cls().preview} data-slot="emoji-picker-preview" aria-hidden="true">
          <Show when={activeEntry()}>
            {(entry: () => EmojiEntry) => (
              <>
                <span class={cls().previewEmoji}>{withTone(entry(), tone())}</span>
                <span class={cls().previewLabel}>{entry().label}</span>
              </>
            )}
          </Show>
        </div>
      </Show>
    </div>
  );
}
