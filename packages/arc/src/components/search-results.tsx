import { type Child, For, Show, createUniqueId } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { Link } from "@barqjs/aria/link";
import { controllable } from "@barqjs/aria/utils";
import { Search } from "@barqjs/lucide/icons/search";
import { Badge } from "@barqjs/ui/badge";
import { Button } from "@barqjs/ui/button";
import { Skeleton } from "@barqjs/ui/skeleton";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  fg,
  focus,
  gap,
  glyph,
  interaction,
  layout,
  motion,
  place,
  plainList,
  rounded,
  space,
  surface,
  type,
} from "../style/index.ts";
import { EmptyState } from "./empty-state.tsx";
import { HighlightMatches } from "./highlight-matches.tsx";
import { useArcMessages } from "./messages.ts";
import { ResponsiveTabs, type TabItem } from "./responsive-tabs.tsx";

/** One kind of thing a search finds: people, classes, messages. */
export interface SearchResultKind {
  id: string;
  /** Plural, as a tab and a section heading: "People". */
  label: string;
  /** Before each result of the kind, and in its tab. */
  icon?: Child;
}

/** One thing a search found. */
export interface SearchResult {
  id: string;
  title: string;
  /** A line under the title: an email, a class's teacher. */
  description?: string;
  /** Where in its text the query matched, marked too. */
  snippet?: string;
  /** At the end, quiet: a date, a status. */
  meta?: Child;
  /** Where it opens. Left out, `onOpen` is called instead. */
  href?: string;
  /** In place of its kind's icon: an avatar. */
  media?: Child;
}

/** What a search found of one kind. */
export interface SearchResultGroup {
  kind: string;
  results: readonly SearchResult[];
  /** How many there are in all, where more exist than are listed. */
  total?: number;
  /** More can be asked for with `onLoadMore`. */
  hasMore?: boolean;
}

export const searchResultsStyles = variants({
  slots: {
    root: arc(layout.column, gap[4], layout.minZero),
    status: arc(type.meta, { paddingBlock: space.x4 }),
    error: arc(layout.row, layout.wrap, gap[3], type.sm, fg.danger, { paddingBlock: space.x4 }),
    groups: arc(layout.column, gap[6]),
    group: arc(layout.column, gap[1], layout.minZero),
    heading: arc(layout.row, gap[2], type.label, fg.muted, layout.flush, {
      paddingInline: space.x3,
    }),
    count: arc({}),
    list: arc(plainList, layout.column, surface.card, rounded.lg, { padding: space.x1 }),
    result: arc(
      layout.row,
      gap[3],
      rounded.md,
      interaction.hover,
      focus.visible,
      motion.colours,
      place.padded,
      fg.inherit,
      type.navLink,
    ),
    media: arc(layout.inlineCentre, layout.noShrink, fg.muted, glyph.md, {
      alignSelf: "flex-start",
      marginBlockStart: space.x0_5,
    }),
    body: arc(layout.column, layout.grow, layout.minZero, gap[0.5]),
    title: arc(type.sm, type.medium, layout.clip, layout.nowrap),
    description: arc(type.meta, layout.clip, layout.nowrap),
    snippet: arc(type.sm, fg.muted, layout.clamp2),
    meta: arc(type.meta, layout.noShrink, layout.nowrap, { alignSelf: "flex-start" }),
    more: arc(layout.row, { paddingBlockStart: space.x1 }),
    skeleton: arc({ height: space.x10 }),
  },
});

type Slots = ReturnType<typeof searchResultsStyles>;

export interface SearchResultsProps extends Customisable<Slots> {
  /** What was searched for: its words are marked in every result. */
  query: string;
  /** Every kind the search covers, in the order of its tabs. */
  kinds: readonly SearchResultKind[];
  /**
   * What was found, a group per kind. Under All, the first few of each;
   * under one kind's tab, that kind's in full.
   */
  groups: readonly SearchResultGroup[];
  /** `all`, or a kind's id. @default "all" */
  kind?: string;
  defaultKind?: string;
  onKindChange?: (kind: string) => void;
  /** Read once: keeps the tab in this search parameter. */
  param?: string;
  /** @default "done" */
  status?: "idle" | "loading" | "error" | "done";
  /** Shown with `status="error"`, with Try again when `onRetry` is given. */
  errorMessage?: string;
  onRetry?: () => void;
  /** Under All, how many of a kind are listed before Show all. @default 5 */
  perGroup?: number;
  /** Asks for more of one kind, under its tab. */
  onLoadMore?: (kind: string) => void;
  isLoadingMore?: boolean;
  /** A result with no `href` was opened. */
  onOpen?: (result: SearchResult, kind: string) => void;
  /** What shows while nothing has been searched for. */
  idle?: Child;
  "aria-label"?: string;
  id?: string;
}

const ALL = "all";

/**
 * A search's results across kinds: all of them at a glance, or one kind in
 * full.
 *
 * ```tsx
 * <SearchResults
 *   query={q()}
 *   kinds={[{ id: "people", label: "People", icon: <Users /> }, { id: "classes", label: "Classes" }]}
 *   groups={found()}
 *   param="kind"
 *   status={loading() ? "loading" : "done"}
 *   onLoadMore={(kind) => fetchMore(kind)}
 * />
 * ```
 *
 * `ResponsiveTabs` of All and each kind, counted. Under All, a section per
 * kind with its first few results and a Show all that opens that kind's tab;
 * under a kind's tab, all of it with Show more. Each result is a link to
 * where it opens, its title and snippet with the query's words marked by
 * `HighlightMatches`. While a search runs the panel holds skeleton rows, a
 * failure says so with Try again, and nothing found says what was searched.
 */
export function SearchResults(props: SearchResultsProps) {
  const messages = useArcMessages();
  function cls(): Slots {
    return parts(searchResultsStyles(), props.classes);
  }
  const [kind, setKind] = controllable<string>(
    () => props.kind,
    () => props.defaultKind ?? ALL,
    (next) => props.onKindChange?.(next),
  );
  function groupOf(id: string): SearchResultGroup | undefined {
    return props.groups.find((group) => group.kind === id);
  }
  function countOf(id: string): number | undefined {
    const group = groupOf(id);
    if (group === undefined) return undefined;
    return group.total ?? group.results.length;
  }
  function tabs(): TabItem[] {
    return [
      { id: ALL, label: messages().allResults },
      ...props.kinds.map((one) => ({
        id: one.id,
        label: one.label,
        icon: one.icon,
        count: props.status === "done" || props.status === undefined ? countOf(one.id) : undefined,
      })),
    ];
  }
  const shared: SharedSearch = { props, cls, open: setKind };
  return (
    <div
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="search-results"
    >
      <ResponsiveTabs
        aria-label={props["aria-label"] ?? messages().resultsFor(props.query)}
        items={tabs()}
        selectedKey={kind()}
        onSelectionChange={setKind}
        param={props.param}
      >
        {(tab: TabItem) => <SearchPanel shared={shared} kind={tab.id} />}
      </ResponsiveTabs>
    </div>
  );
}

interface SharedSearch {
  props: SearchResultsProps;
  cls: () => Slots;
  open: (kind: string) => void;
}

interface SearchPanelProps {
  shared: SharedSearch;
  kind: string;
}

function SearchPanel(props: SearchPanelProps) {
  const messages = useArcMessages();
  const owner = props.shared.props;
  const cls = props.shared.cls;
  function status(): NonNullable<SearchResultsProps["status"]> {
    return owner.query.trim() === "" ? "idle" : (owner.status ?? "done");
  }
  function groups(): readonly SearchResultGroup[] {
    const found = owner.groups.filter((group) => group.results.length > 0);
    const order = owner.kinds.map((one) => one.id);
    const sorted = found.toSorted((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
    return props.kind === ALL ? sorted : sorted.filter((group) => group.kind === props.kind);
  }
  return (
    <Show
      when={status() === "done"}
      fallback={
        <Show
          when={status() === "loading"}
          fallback={<SearchStatus shared={props.shared} idle={status() === "idle"} />}
        >
          <div class={cls().groups} data-slot="search-results-loading" aria-busy="true">
            <span class={cls().status} role="status">
              {messages().searching}
            </span>
            <For each={[0, 1, 2, 3]}>{() => <Skeleton class={cls().skeleton} />}</For>
          </div>
        </Show>
      }
    >
      <Show
        when={groups().length > 0}
        fallback={
          <EmptyState
            placement="section"
            icon={<Search />}
            heading={messages().noResultsFor(owner.query)}
          />
        }
      >
        <div class={cls().groups} data-slot="search-results-groups">
          <For each={groups()}>
            {(group: SearchResultGroup) => (
              <SearchGroupSection shared={props.shared} group={group} all={props.kind === ALL} />
            )}
          </For>
        </div>
      </Show>
    </Show>
  );
}

interface SearchStatusProps {
  shared: SharedSearch;
  idle: boolean;
}

function SearchStatus(props: SearchStatusProps) {
  const messages = useArcMessages();
  const owner = props.shared.props;
  const cls = props.shared.cls;
  return (
    <Show
      when={!props.idle}
      fallback={
        <Show when={owner.idle !== undefined}>
          <div data-slot="search-results-idle">{owner.idle}</div>
        </Show>
      }
    >
      <div class={cls().error} role="alert" data-slot="search-results-error">
        {owner.errorMessage ?? messages().searchFailedPlain}
        <Show when={owner.onRetry !== undefined}>
          <Button variant="outline" size="sm" onPress={() => owner.onRetry?.()}>
            {messages().tryAgain}
          </Button>
        </Show>
      </div>
    </Show>
  );
}

interface SearchGroupSectionProps {
  shared: SharedSearch;
  group: SearchResultGroup;
  all: boolean;
}

function SearchGroupSection(props: SearchGroupSectionProps) {
  const messages = useArcMessages();
  const headingId = createUniqueId();
  const owner = props.shared.props;
  const cls = props.shared.cls;
  function kind(): SearchResultKind | undefined {
    return owner.kinds.find((one) => one.id === props.group.kind);
  }
  function label(): string {
    return kind()?.label ?? props.group.kind;
  }
  function total(): number {
    return props.group.total ?? props.group.results.length;
  }
  function shown(): readonly SearchResult[] {
    return props.all ? props.group.results.slice(0, owner.perGroup ?? 5) : props.group.results;
  }
  function more(): boolean {
    return props.all ? total() > shown().length || props.group.hasMore === true : false;
  }
  return (
    <section class={cls().group} data-slot="search-results-group" aria-labelledby={headingId}>
      <h3 class={cls().heading} id={headingId} data-slot="search-results-heading">
        {label()}
        <Badge class={cls().count} variant="secondary" data-slot="search-results-count">
          {messages().resultCount(total())}
        </Badge>
      </h3>
      <ul class={cls().list} data-slot="search-results-list">
        <For each={shown()}>
          {(result: SearchResult) => (
            <li>
              <SearchResultRow shared={props.shared} result={result} kind={kind()} />
            </li>
          )}
        </For>
      </ul>
      <Show when={more()}>
        <div class={cls().more} data-slot="search-results-more">
          <Button variant="link" size="sm" onPress={() => props.shared.open(props.group.kind)}>
            {messages().showAllOf(total(), label().toLocaleLowerCase())}
          </Button>
        </div>
      </Show>
      <Show when={!props.all && props.group.hasMore === true && owner.onLoadMore !== undefined}>
        <div class={cls().more} data-slot="search-results-more">
          <Button
            variant="outline"
            size="sm"
            isPending={owner.isLoadingMore === true}
            onPress={() => owner.onLoadMore?.(props.group.kind)}
          >
            {messages().showMore}
          </Button>
        </div>
      </Show>
    </section>
  );
}

interface SearchResultRowProps {
  shared: SharedSearch;
  result: SearchResult;
  kind: SearchResultKind | undefined;
}

function SearchResultRow(props: SearchResultRowProps) {
  const owner = props.shared.props;
  const cls = props.shared.cls;
  return (
    <Link
      class={cls().result}
      data-slot="search-results-result"
      href={props.result.href}
      onPress={() => {
        if (props.result.href === undefined) owner.onOpen?.(props.result, props.kind?.id ?? "");
      }}
    >
      <Show when={(props.result.media ?? props.kind?.icon) !== undefined}>
        <span class={cls().media} data-slot="search-results-media" aria-hidden="true">
          {props.result.media ?? props.kind?.icon}
        </span>
      </Show>
      <span class={cls().body}>
        <span class={cls().title} dir="auto" data-slot="search-results-title">
          <HighlightMatches text={props.result.title} query={owner.query} />
        </span>
        <Show when={props.result.description !== undefined}>
          <span class={cls().description} dir="auto" data-slot="search-results-description">
            {props.result.description}
          </span>
        </Show>
        <Show when={props.result.snippet !== undefined}>
          <span class={cls().snippet} dir="auto" data-slot="search-results-snippet">
            <HighlightMatches text={props.result.snippet ?? ""} query={owner.query} />
          </span>
        </Show>
      </span>
      <Show when={props.result.meta !== undefined}>
        <span class={cls().meta} data-slot="search-results-meta">
          {props.result.meta}
        </span>
      </Show>
    </Link>
  );
}
