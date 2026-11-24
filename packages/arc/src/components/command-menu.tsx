import { type Child, For, Show, createSignal, onCleanup, untrack } from "@barqjs/core";
import { shortcut } from "@barqjs/primitives/keyboard";
import { persisted } from "@barqjs/primitives/storage";
import { useRouter } from "@barqjs/router";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandLoading,
  CommandShortcut,
} from "@barqjs/ui/command";
import { Spinner } from "@barqjs/ui/spinner";
import { srOnly } from "@barqjs/ui/sr-only";
import { isServer } from "@barqjs/web";
import { variants } from "@barqjs/css";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { fg, gap, glyph, layout, space, type } from "../style/index.ts";
import { HighlightMatches, type MatchRange } from "./highlight-matches.tsx";
import { useArcMessages } from "./messages.ts";
import {
  type RemotePage,
  type RemoteSearch,
  type RemoteSearchContext,
  type RemoteState,
  remoteSearch,
} from "./remote-search.ts";

import type { NavIcon } from "./app-shell.tsx";
import type { LinkTarget } from "./link.ts";

/** One entry of the palette: a place to go (`to`), a thing to do (`onSelect`), or both. */
export interface CommandMenuAction extends Partial<LinkTarget> {
  label: string;
  icon?: NavIcon;
  /** More words it is found by, which are not shown. */
  keywords?: readonly string[];
  /** The keys shown beside it, such as `"G P"`. Shown only; binding them is the caller's. */
  keys?: string;
  /** Runs after the palette has closed, and after the navigation to `to` has started. */
  onSelect?: () => void;
  disabled?: boolean;
}

export interface CommandMenuGroup {
  /** Shown above the group. Groups with one heading are drawn as one. */
  heading: string;
  actions: readonly CommandMenuAction[];
}

/** One thing a search source found: a place to go, a record to open. */
export interface CommandResult extends Partial<LinkTarget> {
  /** Unique within its source. */
  id: string;
  label: string;
  /** A line under the label, such as the passage that matched. */
  snippet?: string;
  /** Quiet text at the end: a kind, a project, a date. */
  meta?: string;
  icon?: NavIcon;
  /** Where the service found the search in `label` and `snippet`, marked instead of matching it here. */
  highlights?: { label?: readonly MatchRange[]; snippet?: readonly MatchRange[] };
}

/** A page of a source's results, with what asks for the next one. */
export type CommandResultPage = RemotePage<CommandResult>;

export type CommandSearchContext = RemoteSearchContext;

/**
 * Somewhere the palette searches as the reader types: a server, an index, an
 * identifier lookup. Its results are a group of their own under `heading`.
 */
export interface CommandSource {
  id: string;
  heading: string;
  search: (
    query: string,
    context: CommandSearchContext,
  ) => Promise<CommandResultPage | readonly CommandResult[]>;
  /** Fewer characters than this search nothing. @default 2 */
  minLength?: number;
  /** How long typing has to pause, in milliseconds, before the search goes out. @default 250 */
  debounce?: number;
  /** Shown in the group when it found nothing. @default arc's "No matches in …" */
  empty?: string;
  /** A result with no `icon` of its own shows this. */
  icon?: NavIcon;
  /** Runs after the palette closed and any navigation to the result's `to` started. */
  onSelect?: (result: CommandResult) => void;
}

/** A chosen result, kept to offer again before anything is typed. */
interface Recent {
  source: string;
  result: Omit<CommandResult, "icon">;
}

type Found = RemoteState<CommandResult>;

type Registered = () => readonly CommandMenuGroup[];

// The registry lives beside the signal that announces it, which is what lets a
// component register from its own body: the write is `ownedWrite`, and the
// list itself is read as it stands rather than as of the last flush.
let sources: readonly Registered[] = [];
const [version, bump] = createSignal(0, { equals: false, ownedWrite: true });
const [opened, setOpened] = createSignal(false);

function registered(): readonly CommandMenuGroup[] {
  version();
  return sources.flatMap((source) => source());
}

/**
 * Add groups to every `<CommandMenu>` until the returned function is called.
 *
 * A function is read whenever the palette draws, so labels and the actions
 * themselves can follow state.
 */
export function registerCommands(
  groups: readonly CommandMenuGroup[] | (() => readonly CommandMenuGroup[]),
): () => void {
  const source: Registered = typeof groups === "function" ? groups : () => groups;
  sources = [...sources, source];
  bump(0);
  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    sources = sources.filter((each) => each !== source);
    bump(0);
  };
}

/**
 * {@link registerCommands} for as long as the calling component lives: a page
 * offers its own actions while it is open.
 *
 * ```tsx
 * useCommands(() => [{ heading: "Invoice", actions: [{ label: "Send", onSelect: send }] }]);
 * ```
 */
export function useCommands(
  groups: readonly CommandMenuGroup[] | (() => readonly CommandMenuGroup[]),
): void {
  if (isServer) return;
  onCleanup(registerCommands(groups));
}

/** Open the palette from a button, a menu, anywhere. */
export function openCommandMenu(): void {
  setOpened(true);
}

function merged(...lists: (readonly CommandMenuGroup[])[]): CommandMenuGroup[] {
  const byHeading = new Map<string, CommandMenuAction[]>();
  for (const list of lists) {
    for (const group of list) {
      const actions = byHeading.get(group.heading);
      if (actions === undefined) byHeading.set(group.heading, [...group.actions]);
      else actions.push(...group.actions);
    }
  }
  return [...byHeading].map(([heading, actions]) => ({ heading, actions }));
}

const rowInset = arc({ paddingInline: space.x2 });

export const commandMenuStyles = variants({
  slots: {
    root: arc({}),
    input: arc({}),
    list: arc({}),
    empty: arc({}),
    group: arc({}),
    item: arc({}),
    shortcut: arc({}),
    result: arc(layout.column, layout.minZero, layout.grow),
    label: arc(layout.minZero),
    snippet: arc(type.meta, layout.clamp2),
    meta: arc(type.meta, layout.pushEnd, layout.noShrink, layout.nowrap),
    loading: arc(layout.row, layout.centre, gap[2], glyph.sm),
    sourceEmpty: arc(type.meta, rowInset),
    sourceError: arc(type.caption, fg.danger, rowInset),
    more: arc(fg.muted),
  },
});

type Slots = ReturnType<typeof commandMenuStyles>;

export interface CommandMenuProps extends Customisable<Slots> {
  /** The palette's own groups. Registered ones join them, under their headings. */
  groups?: readonly CommandMenuGroup[];
  /** The combo that opens and closes it, `false` for none. @default "mod+k" */
  shortcut?: string | false;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Names the dialog to a screen reader. @default "Command menu" */
  title?: string;
  /** @default "Search for a page or an action." */
  description?: string;
  /** @default "Type a command or search..." */
  placeholder?: string;
  /** @default "No results found." */
  empty?: Child;
  /**
   * Searched as the reader types, each a group of its own results below the
   * palette's commands, with its own loading, empty and error rows and a
   * Show more while it has another page.
   */
  sources?: readonly CommandSource[];
  /**
   * Remember the results chosen from `sources` in `localStorage` under this
   * key, and offer the last `max` of them before anything is typed.
   */
  recent?: { key: string; max?: number };
}

/**
 * The app's palette: places to go and things to do, found by typing.
 *
 * ```tsx
 * <CommandMenu
 *   groups={[
 *     { heading: "Pages", actions: [{ label: "Projects", to: "/projects", icon: Folder }] },
 *     { heading: "Theme", actions: [{ label: "Dark", onSelect: () => scheme.set("dark") }] },
 *   ]}
 * />
 * ```
 *
 * `Mod+K` (Command on Apple platforms, Control elsewhere) opens it from
 * anywhere, and `openCommandMenu()` from a button. Anything rendered may add
 * to it with `useCommands`, for as long as it is on the page.
 */
export function CommandMenu(props: CommandMenuProps) {
  const router = useRouter();
  const messages = useArcMessages();
  const cls = (): Slots => parts(commandMenuStyles(), props.classes);
  const isOpen = (): boolean => props.open ?? opened();

  const [query, setQuery] = createSignal("");
  const [found, setFound] = createSignal<Readonly<Record<string, Found>>>({});
  const recentKey = untrack(() => props.recent?.key);
  const [recents, setRecents] =
    recentKey === undefined
      ? createSignal<readonly Recent[]>([])
      : persisted<readonly Recent[]>(recentKey, []);

  const searches = new Map<string, RemoteSearch>();

  const update = (id: string, next: RemoteState<CommandResult>): void => {
    const all = { ...found() };
    if (next.status === "idle") delete all[id];
    else all[id] = next;
    setFound(all);
  };

  const searchOf = (source: CommandSource): RemoteSearch => {
    let held = searches.get(source.id);
    if (held === undefined) {
      held = remoteSearch<CommandResult>({
        search: () => props.sources?.find((each) => each.id === source.id)?.search ?? source.search,
        debounce: source.debounce,
        minLength: source.minLength ?? 2,
        onChange: (state) => update(source.id, state),
      });
      searches.set(source.id, held);
    }
    return held;
  };

  const stop = (): void => {
    for (const held of searches.values()) held.stop();
  };
  onCleanup(stop);

  const search = (text: string): void => {
    setQuery(text);
    for (const source of props.sources ?? []) searchOf(source).query(text);
  };

  const more = (source: CommandSource): void => searchOf(source).more();

  const setOpen = (next: boolean): void => {
    if (!next) {
      stop();
      setQuery("");
      setFound({});
    }
    if (props.open === undefined) setOpened(next);
    props.onOpenChange?.(next);
  };

  const combo = untrack(() => props.shortcut);
  if (combo !== false) shortcut(combo ?? "mod+k", () => setOpen(!isOpen()));

  const groups = (): CommandMenuGroup[] => merged(props.groups ?? [], registered());

  const go = (target: Partial<LinkTarget>): void => {
    if (target.to === undefined) return;
    void router.navigate({
      to: target.to,
      params: target.params,
      search: target.search,
      hash: target.hash,
    } as never);
  };

  const run = (action: CommandMenuAction): void => {
    setOpen(false);
    go(action);
    action.onSelect?.();
  };

  const choose = (sourceId: string, result: CommandResult): void => {
    setOpen(false);
    if (recentKey !== undefined) {
      const { icon: _icon, ...kept } = result;
      const max = props.recent?.max ?? 5;
      setRecents(
        [
          { source: sourceId, result: kept },
          ...recents().filter((each) => each.source !== sourceId || each.result.id !== result.id),
        ].slice(0, max),
      );
    }
    go(result);
    props.sources?.find((each) => each.id === sourceId)?.onSelect?.(result);
  };

  const sourceOf = (id: string): CommandSource | undefined =>
    props.sources?.find((each) => each.id === id);

  const searching = (): boolean =>
    Object.values(found()).some((state) => state.status === "loading" || state.loadingMore);
  const foundCount = (): number =>
    Object.values(found()).reduce((sum, state) => sum + state.results.length, 0);
  const active = (): CommandSource[] =>
    (props.sources ?? []).filter((source) => found()[source.id] !== undefined);

  return (
    <CommandDialog
      isOpen={isOpen()}
      onOpenChange={setOpen}
      class={arc(cls().root, props.class, props.className)}
      title={props.title ?? messages().commandMenu}
      description={props.description ?? messages().commandMenuDescription}
    >
      <CommandInput
        class={cls().input}
        placeholder={props.placeholder ?? messages().commandPlaceholder}
        value={query()}
        onValueChange={search}
      />
      <div role="status" class={srOnly} data-slot="command-menu-status">
        {searching()
          ? messages().searching
          : active().length > 0
            ? messages().resultCount(foundCount())
            : ""}
      </div>
      <CommandList class={cls().list}>
        <Show when={foundCount() === 0 && !searching()}>
          <CommandEmpty class={cls().empty}>{props.empty ?? messages().noResults}</CommandEmpty>
        </Show>
        <Show when={query() === "" && recents().length > 0}>
          <CommandGroup class={cls().group} heading={messages().recent}>
            <For each={recents()}>
              {(recent: Recent) => (
                <ResultItem
                  result={recent.result}
                  source={sourceOf(recent.source)}
                  query=""
                  classes={cls()}
                  onChoose={() => choose(recent.source, recent.result)}
                />
              )}
            </For>
          </CommandGroup>
        </Show>
        <For each={groups()}>
          {(group: CommandMenuGroup) => (
            <CommandGroup class={cls().group} heading={group.heading}>
              <For each={group.actions}>
                {(action: CommandMenuAction) => (
                  <ActionItem action={action} run={run} classes={cls()} />
                )}
              </For>
            </CommandGroup>
          )}
        </For>
        <For each={active()}>
          {(source: CommandSource) => (
            <SourceGroup
              source={source}
              state={found()[source.id]}
              query={query()}
              classes={cls()}
              onChoose={(result) => choose(source.id, result)}
              onMore={() => more(source)}
            />
          )}
        </For>
      </CommandList>
    </CommandDialog>
  );
}

function SourceGroup(props: {
  source: CommandSource;
  state: Found | undefined;
  query: string;
  classes: Slots;
  onChoose: (result: CommandResult) => void;
  onMore: () => void;
}) {
  const messages = useArcMessages();
  const status = (): Found["status"] => props.state?.status ?? "loading";
  const results = (): readonly CommandResult[] => props.state?.results ?? [];
  return (
    <CommandGroup
      class={props.classes.group}
      heading={props.source.heading}
      forceMount
      data-slot="command-menu-source"
      data-status={status()}
    >
      <For each={results()}>
        {(result: CommandResult) => (
          <ResultItem
            result={result}
            source={props.source}
            query={props.query}
            classes={props.classes}
            onChoose={() => props.onChoose(result)}
          />
        )}
      </For>
      <Show when={status() === "loading" || props.state?.loadingMore === true}>
        <CommandLoading
          class={props.classes.loading}
          data-slot="command-menu-loading"
          label={messages().searchingIn(props.source.heading)}
        >
          <Spinner />
          {messages().searching}
        </CommandLoading>
      </Show>
      <Show when={status() === "done" && results().length === 0}>
        <div role="presentation" class={props.classes.sourceEmpty} data-slot="command-menu-none">
          {props.source.empty ?? messages().noMatchesIn(props.source.heading)}
        </div>
      </Show>
      <Show when={status() === "error"}>
        <div role="presentation" class={props.classes.sourceError} data-slot="command-menu-error">
          {messages().searchFailed(props.source.heading)}
        </div>
      </Show>
      <Show when={props.state?.next !== undefined && !props.state.loadingMore}>
        <CommandItem
          forceMount
          value={messages().showMoreIn(props.source.heading)}
          class={arc(props.classes.item, props.classes.more)}
          data-slot="command-menu-more"
          onSelect={props.onMore}
        >
          <span>{messages().showMoreIn(props.source.heading)}</span>
        </CommandItem>
      </Show>
    </CommandGroup>
  );
}

function ResultItem(props: {
  result: Omit<CommandResult, "icon"> & { icon?: NavIcon };
  source: CommandSource | undefined;
  query: string;
  classes: Slots;
  onChoose: () => void;
}) {
  const result = props.result;
  const Icon = result.icon ?? props.source?.icon;
  return (
    <CommandItem
      forceMount
      value={result.label}
      class={props.classes.item}
      data-slot="command-menu-result"
      onSelect={() => props.onChoose()}
    >
      {Icon === undefined ? null : <Icon />}
      <span class={props.classes.result}>
        <HighlightMatches
          class={props.classes.label}
          text={result.label}
          query={props.query}
          ranges={result.highlights?.label}
        />
        <Show when={result.snippet !== undefined}>
          <HighlightMatches
            class={props.classes.snippet}
            text={result.snippet ?? ""}
            query={props.query}
            ranges={result.highlights?.snippet}
          />
        </Show>
      </span>
      <Show when={result.meta !== undefined}>
        <span class={props.classes.meta}>{result.meta}</span>
      </Show>
    </CommandItem>
  );
}

function ActionItem(props: {
  action: CommandMenuAction;
  run: (action: CommandMenuAction) => void;
  classes: Slots;
}) {
  const action = props.action;
  const run = props.run;
  const Icon = action.icon;
  return (
    <CommandItem
      value={action.label}
      keywords={action.keywords === undefined ? undefined : [...action.keywords]}
      disabled={action.disabled === true}
      class={props.classes.item}
      data-slot="command-menu-item"
      onSelect={() => run(action)}
    >
      {Icon === undefined ? null : <Icon />}
      <span>{action.label}</span>
      <Show when={action.keys}>
        <CommandShortcut class={props.classes.shortcut}>{action.keys}</CommandShortcut>
      </Show>
    </CommandItem>
  );
}
