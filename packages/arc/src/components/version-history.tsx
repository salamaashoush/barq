import { type Child, For, Show, createSignal } from "@barqjs/core";
import { variants } from "@barqjs/css";
import type { Key } from "@barqjs/aria/collections";
import { History } from "@barqjs/lucide/icons/history";
import { RotateCcw } from "@barqjs/lucide/icons/rotate-ccw";
import { Badge } from "@barqjs/ui/badge";
import { Button } from "@barqjs/ui/button";
import { on } from "@barqjs/ui/conditions";
import { NativeSelect, NativeSelectOption } from "@barqjs/ui/native-select";
import { Skeleton } from "@barqjs/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@barqjs/ui/toggle-group";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { edge, fg, gap, layout, rounded, space, surface, type } from "../style/index.ts";
import type { Person } from "./avatar-stack.tsx";
import { confirm } from "./confirm.tsx";
import { EmptyState } from "./empty-state.tsx";
import { type Moment, RelativeTime } from "./format.tsx";
import { List, ListItem } from "./item-list.tsx";
import { Grid, Inline } from "./layout.tsx";
import { useArcMessages } from "./messages.ts";
import { PersonAvatar } from "./person-avatar.tsx";

/** One saved state of a document, a definition, a page. */
export interface VersionEntry {
  id: string;
  author: Person;
  createdAt: Moment;
  /** Names it where a time does not: "v12", "Published", "Spanish". */
  label?: string;
  /** What changed, in a line. */
  summary?: string;
  /** The state in use now: it cannot be restored, and compares against the rest. */
  current?: boolean;
}

export type VersionView = "preview" | "compare";
export type VersionBase = "current" | "previous";

export const versionHistoryStyles = variants({
  slots: {
    root: arc(layout.container, layout.minZero),
    columns: arc(layout.minZero),
    list: arc(layout.column, gap[2], layout.minZero, { flex: { [on.cqLg]: "1 1 16rem" } }),
    loading: arc(layout.column, gap[2]),
    skeleton: arc(rounded.md, { height: space.x12 }),
    detail: arc(layout.column, gap[3], layout.minZero, { flex: { [on.cqLg]: "2 1 0" } }),
    header: arc(layout.row, layout.wrap, gap[2]),
    heading: arc(type.subheading, layout.minZero, layout.grow),
    controls: arc(layout.row, layout.wrap, gap[2]),
    base: arc({ width: "auto" }),
    preview: arc(surface.card, layout.minZero, { padding: space.x4, overflow: "auto" }),
    compare: arc(layout.minZero),
    pane: arc(surface.card, layout.column, gap[2], layout.minZero, { padding: space.x3 }),
    paneLabel: arc(type.meta, edge.bottom, { paddingBlockEnd: space.x2 }),
    badge: arc({}),
    error: arc(type.caption, fg.danger, layout.flush),
    nothing: arc(type.meta, layout.flush),
  },
});

type Slots = ReturnType<typeof versionHistoryStyles>;

export interface VersionHistoryProps extends Customisable<Slots> {
  /** Newest first. */
  versions: readonly VersionEntry[];
  /** @default arc's "Version history" */
  "aria-label"?: string;
  selectedId?: string;
  /** @default the newest */
  defaultSelectedId?: string;
  onSelectionChange?: (id: string) => void;
  view?: VersionView;
  /** @default "preview" */
  defaultView?: VersionView;
  onViewChange?: (view: VersionView) => void;
  /** What a compare sets the chosen version against. @default "current" */
  defaultBase?: VersionBase;
  /** A version's content, for the preview and each pane of the compare. */
  renderPreview?: (version: VersionEntry) => Child;
  /**
   * The compare, in place of two previews side by side: `<CodeDiff>` from
   * `@barqjs/arc/code` for text, or an app's own.
   */
  renderCompare?: (older: VersionEntry, newer: VersionEntry) => Child;
  /** Adds Restore, asked through `confirm()`. A promise holds it pending. */
  onRestore?: (version: VersionEntry) => void | Promise<unknown>;
  isLoading?: boolean;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  /** The moment times are measured from on the server and while hydrating. */
  now?: Moment;
  empty?: Child;
}

/**
 * The saved states of something, newest first: who made each and when, a
 * preview, a compare against the current state or the one before, and
 * Restore through `confirm()`.
 *
 * ```tsx
 * <VersionHistory
 *   versions={versions()}
 *   renderPreview={(version) => <Prose html={version.html} />}
 *   renderCompare={(older, newer) => (
 *     <CodeDiff original={textOf(older)} modified={textOf(newer)} language="json" />
 *   )}
 *   onRestore={(version) => api.restore(version.id)}
 * />
 * ```
 *
 * The list is arc's `List`, one Tab stop with the arrows between versions;
 * the detail sits beside it across a wide container and under it across a
 * narrow one.
 */
export function VersionHistory(props: VersionHistoryProps) {
  const messages = useArcMessages();
  function cls(): Slots {
    return parts(versionHistoryStyles(), props.classes);
  }
  const [ownSelected, setOwnSelected] = createSignal<string | undefined>(props.defaultSelectedId, {
    ownedWrite: true,
  });
  const [ownView, setOwnView] = createSignal<VersionView>(props.defaultView ?? "preview", {
    ownedWrite: true,
  });
  const [base, setBase] = createSignal<VersionBase>(props.defaultBase ?? "current", {
    ownedWrite: true,
  });
  const [restoring, setRestoring] = createSignal(false);
  const [failed, setFailed] = createSignal(false);

  function selectedId(): string | undefined {
    return props.selectedId ?? ownSelected() ?? props.versions[0]?.id;
  }
  function selected(): VersionEntry | undefined {
    return props.versions.find((version) => version.id === selectedId());
  }
  function view(): VersionView {
    return props.view ?? ownView();
  }
  function current(): VersionEntry | undefined {
    return props.versions.find((version) => version.current === true) ?? props.versions[0];
  }
  function nameOf(version: VersionEntry): string {
    return version.label ?? version.author.name;
  }

  /** The two sides of the compare, older first, or nothing to set the choice against. */
  function pair(): [VersionEntry, VersionEntry] | undefined {
    const chosen = selected();
    if (chosen === undefined) return undefined;
    if (base() === "current") {
      const now = current();
      if (now === undefined || now.id === chosen.id) return undefined;
      return [chosen, now];
    }
    const at = props.versions.indexOf(chosen);
    const before = props.versions[at + 1];
    return before === undefined ? undefined : [before, chosen];
  }

  function choose(id: string): void {
    setFailed(false);
    if (props.selectedId === undefined) setOwnSelected(id);
    props.onSelectionChange?.(id);
  }
  function setView(next: VersionView): void {
    if (props.view === undefined) setOwnView(next);
    props.onViewChange?.(next);
  }

  async function restore(): Promise<void> {
    const version = selected();
    if (version === undefined || props.onRestore === undefined) return;
    const sure = await confirm({
      title: messages().restoreHeading(nameOf(version)),
      description: messages().restoreDescription,
      confirmLabel: messages().restore,
    });
    if (!sure) return;
    setFailed(false);
    const outcome = props.onRestore(version);
    if (!(outcome instanceof Promise)) return;
    setRestoring(true);
    outcome.then(
      () => setRestoring(false),
      () => {
        setRestoring(false);
        setFailed(true);
      },
    );
  }

  function preview(version: VersionEntry) {
    return props.renderPreview?.(version) ?? version.summary ?? nameOf(version);
  }

  return (
    <section
      class={arc(cls().root, props.class, props.className)}
      data-slot="version-history"
      aria-label={props["aria-label"] ?? messages().versionHistory}
    >
      <Inline class={cls().columns} gap={4} wrap={false} stackBelow="cqLg">
        <div class={cls().list} data-slot="version-history-list">
          <Show
            when={!(props.isLoading === true && props.versions.length === 0)}
            fallback={
              <div class={cls().loading} data-slot="version-history-loading" aria-busy="true">
                <For each={[0, 1, 2]}>{() => <Skeleton class={cls().skeleton} />}</For>
              </div>
            }
          >
            <List<VersionEntry>
              aria-label={messages().versions}
              items={props.versions}
              getTextValue={nameOf}
              selectionMode="single"
              selectedKeys={selectedId() === undefined ? [] : [selectedId() as string]}
              onSelectionChange={(keys: "all" | Set<Key>) => {
                if (keys === "all") return;
                const [first] = keys;
                if (first !== undefined) choose(String(first));
              }}
              onLoadMore={props.onLoadMore}
              isLoadingMore={props.isLoadingMore}
              empty={
                props.empty ?? <EmptyState icon={<History />} heading={messages().noVersions} />
              }
            >
              {(version: VersionEntry) => (
                <ListItem
                  media={<PersonAvatar person={version.author} size="sm" />}
                  mediaVariant="default"
                  title={nameOf(version)}
                  description={
                    version.label === undefined
                      ? version.summary
                      : `${version.author.name}${version.summary === undefined ? "" : ` · ${version.summary}`}`
                  }
                  meta={
                    <>
                      <Show when={version.current === true}>
                        <Badge variant="secondary" class={cls().badge}>
                          {messages().currentVersion}
                        </Badge>
                      </Show>
                      <RelativeTime value={version.createdAt} now={props.now} />
                    </>
                  }
                />
              )}
            </List>
          </Show>
        </div>
        <Show when={selected() !== undefined}>
          <div class={cls().detail} data-slot="version-history-detail">
            <div class={cls().header} data-slot="version-history-header">
              <h3 class={cls().heading}>{nameOf(selected() as VersionEntry)}</h3>
              <div class={cls().controls}>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  value={view()}
                  aria-label={messages().view}
                  onValueChange={(value: string | string[]) => {
                    if (value === "preview" || value === "compare") setView(value);
                  }}
                >
                  <ToggleGroupItem value="preview">{messages().preview}</ToggleGroupItem>
                  <ToggleGroupItem value="compare">{messages().compare}</ToggleGroupItem>
                </ToggleGroup>
                <Show when={view() === "compare"}>
                  <NativeSelect
                    class={cls().base}
                    size="sm"
                    aria-label={messages().compareWith}
                    value={base()}
                    onChange={(event: Event) =>
                      setBase((event.currentTarget as HTMLSelectElement).value as VersionBase)
                    }
                  >
                    <NativeSelectOption value="current">
                      {messages().currentVersion}
                    </NativeSelectOption>
                    <NativeSelectOption value="previous">
                      {messages().previousVersion}
                    </NativeSelectOption>
                  </NativeSelect>
                </Show>
                <Show when={props.onRestore !== undefined && selected()?.current !== true}>
                  <Button
                    size="sm"
                    variant="outline"
                    data-slot="version-history-restore"
                    isPending={restoring()}
                    onPress={() => void restore()}
                  >
                    <RotateCcw aria-hidden="true" />
                    {messages().restore}
                  </Button>
                </Show>
              </div>
            </div>
            <Show when={failed()}>
              <p class={cls().error} role="alert" data-slot="version-history-error">
                {messages().restoreFailed}
              </p>
            </Show>
            <Show
              when={view() === "compare"}
              fallback={
                <div class={cls().preview} data-slot="version-history-preview">
                  {preview(selected() as VersionEntry)}
                </div>
              }
            >
              <Show
                when={pair() !== undefined}
                fallback={
                  <p class={cls().nothing} data-slot="version-history-nothing">
                    {messages().nothingToCompare}
                  </p>
                }
              >
                <Show
                  when={props.renderCompare === undefined}
                  fallback={props.renderCompare?.(...(pair() as [VersionEntry, VersionEntry]))}
                >
                  <div class={cls().compare} data-slot="version-history-compare">
                    <Grid columns={{ base: 1, cqMd: 2 }} gap={3}>
                      <For each={pair() ?? []}>
                        {(side: VersionEntry, index: () => number) => (
                          <div class={cls().pane} data-slot="version-history-pane">
                            <span class={cls().paneLabel}>
                              {`${index() === 0 ? messages().original : messages().modified}: ${nameOf(side)}`}
                            </span>
                            {preview(side)}
                          </div>
                        )}
                      </For>
                    </Grid>
                  </div>
                </Show>
              </Show>
            </Show>
          </div>
        </Show>
      </Inline>
    </section>
  );
}
