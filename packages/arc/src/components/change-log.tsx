import { type Child, For, Show } from "@barqjs/core";
import { variants } from "@barqjs/css";
import type { DateRange } from "@barqjs/aria/calendar";
import { controllable } from "@barqjs/aria/utils";
import { ArrowRight } from "@barqjs/lucide/icons/arrow-right";
import { Bot } from "@barqjs/lucide/icons/bot";
import { srOnly } from "@barqjs/ui/sr-only";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { fg, gap, glyph, layout, square, type } from "../style/index.ts";
import type { Tone } from "../theme/tokens.ts";
import { type DataToolbarFilter, DataToolbar } from "./data-toolbar.tsx";
import type { Moment } from "./format.tsx";
import { useArcMessages } from "./messages.ts";
import { PersonAvatar } from "./person-avatar.tsx";
import { Timeline, type TimelineEvent } from "./timeline.tsx";

/** One field a change moved, its values written out for the reader. */
export interface FieldChange {
  /** The field's name: "Currency". */
  field: string;
  /** What it held. Left out or `null`, it held nothing, which is not struck out. */
  before?: string | null;
  /** What it holds now. `null`, it was cleared. */
  after?: string | null;
  /** The values read left to right in every language: a phone number, a code. */
  ltr?: boolean;
}

/** Who made a change. Left out of an entry, the system did. */
export interface ChangeActor {
  id: string;
  name: string;
  /** A photo; left out, the initials of `name`. */
  src?: string;
  /** An automation, an agent, an API key: drawn with a robot glyph rather than initials. */
  system?: boolean;
}

/** One change: who did what to which record, when, and the fields it moved. */
export interface ChangeEntry {
  id: string;
  actor?: ChangeActor;
  /** What was done: "changed the plan", "removed a member". */
  action: Child;
  /** What it was done to, where a log spans records: its name, linked to it. */
  target?: Child;
  time: Moment;
  /** Why, as the person who made it wrote it. */
  reason?: Child;
  changes?: readonly FieldChange[];
  /** Anything else under it: the request's payload, a copy button. */
  details?: Child;
  icon?: Child;
  tone?: Tone;
}

/** What a change log is narrowed to: some people, and a span of days. */
export interface ChangeLogFilter {
  /** Actor ids; empty is everyone. */
  actors: readonly string[];
  range: DateRange | null;
}

export const fieldChangesStyles = variants({
  slots: {
    root: arc(layout.column, gap[1], type.sm, layout.flush),
    row: arc(layout.row, layout.wrap, gap[2], { alignItems: "baseline" }),
    field: arc(fg.muted),
    values: arc(layout.row, layout.wrap, layout.minZero, gap[1.5], layout.flush, {
      alignItems: "baseline",
    }),
    before: arc(fg.muted, { textDecorationLine: "line-through" }),
    after: arc(fg.default, { overflowWrap: "anywhere" }),
    blank: arc(fg.faint, { fontStyle: "italic", textDecorationLine: "none" }),
    arrow: arc(layout.noShrink, fg.faint, glyph.sm, square.x4, {
      alignSelf: "center",
      "&:dir(rtl)": { rotate: "180deg" },
    }),
  },
});

type FieldChangesSlots = ReturnType<typeof fieldChangesStyles>;

export interface FieldChangesProps extends Customisable<FieldChangesSlots> {
  changes: readonly FieldChange[];
  id?: string;
}

/**
 * The fields a change moved, each from its old value to its new one.
 *
 * ```tsx
 * <FieldChanges changes={[{ field: "Plan", before: "Team", after: "Business" }]} />
 * ```
 *
 * A `<dl>`: the field, then its old value struck through, an arrow and the
 * new one, the words "changed from" and "to" there for a screen reader in
 * place of the arrow. Each value is a `<bdi>`, so an English value in an
 * Arabic page, or the other way round, keeps its own direction and does not
 * drag the arrow with it; `ltr` holds a phone number or a code left to
 * right. A value that was not there reads as "Not set", not struck out.
 */
export function FieldChanges(props: FieldChangesProps) {
  const messages = useArcMessages();
  function cls(): FieldChangesSlots {
    return parts(fieldChangesStyles(), props.classes);
  }
  return (
    <dl
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="field-changes"
    >
      <For each={() => props.changes}>
        {(change: FieldChange) => (
          <div class={cls().row} data-slot="field-changes-row">
            <dt class={cls().field} data-slot="field-changes-field">
              {change.field}
            </dt>
            <dd class={cls().values} data-slot="field-changes-values">
              <span class={srOnly}>{messages().changedFrom}</span>
              <bdi
                class={arc(cls().before, blank(change.before) ? cls().blank : undefined)}
                dir={change.ltr === true ? "ltr" : undefined}
                data-slot="field-changes-before"
              >
                {blank(change.before) ? messages().notSet : change.before}
              </bdi>
              <ArrowRight class={cls().arrow} aria-hidden="true" data-slot="field-changes-arrow" />
              <span class={srOnly}>{messages().changedTo}</span>
              <bdi
                class={arc(cls().after, blank(change.after) ? cls().blank : undefined)}
                dir={change.ltr === true ? "ltr" : undefined}
                data-slot="field-changes-after"
              >
                {blank(change.after) ? messages().notSet : change.after}
              </bdi>
            </dd>
          </div>
        )}
      </For>
    </dl>
  );
}

function blank(value: string | null | undefined): boolean {
  return value === undefined || value === null || value === "";
}

/** The day a moment falls on in a zone, as `2026-03-04`. */
function dayOf(moment: Moment, timeZone: string | undefined): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).format(new Date(moment));
}

/**
 * Whether an entry is inside a filter: by one of its people, on a day in its
 * range, counted in `timeZone`.
 */
export function matchesChangeLogFilter(
  entry: ChangeEntry,
  filter: ChangeLogFilter,
  timeZone?: string,
): boolean {
  if (filter.actors.length > 0 && !filter.actors.includes(entry.actor?.id ?? "")) return false;
  if (filter.range !== null) {
    const day = dayOf(entry.time, timeZone);
    if (day < filter.range.start.toString() || day > filter.range.end.toString()) return false;
  }
  return true;
}

export const changeLogStyles = variants({
  slots: {
    root: arc(layout.column, gap[4], layout.minZero),
    toolbar: arc({}),
    actor: arc(layout.inlineRow, gap[1.5]),
    avatar: arc({}),
    system: arc(layout.inlineCentre, fg.muted, glyph.sm, square.x5),
    target: arc(type.medium),
    reason: arc(type.sm, fg.default),
    entry: arc(layout.column, gap[1.5]),
  },
});

type ChangeLogSlots = ReturnType<typeof changeLogStyles>;

export interface ChangeLogProps extends Customisable<ChangeLogSlots> {
  entries: readonly ChangeEntry[];
  /** Names the log. @default the provider's `changeLog`, "Changes" */
  "aria-label"?: string;
  /** Who the actor filter offers. @default the people in `entries` */
  actors?: readonly ChangeActor[];
  /** The Who and When filters over the log. @default true */
  filterable?: boolean;
  filter?: ChangeLogFilter;
  defaultFilter?: ChangeLogFilter;
  onFilterChange?: (filter: ChangeLogFilter) => void;
  /**
   * The entries are already narrowed by the server to the filter, so the log
   * shows them as given rather than filtering them again. @default false
   */
  manualFiltering?: boolean;
  /** Kept in these search parameters, so a filtered log has a link. */
  params?: ChangeLogParams;
  /** The zone the days fall in, for the headings and the When filter. @default the reader's */
  timeZone?: string;
  /** What today is, so the server and the page agree on "Today". */
  now?: Moment;
  /** Shown when nothing has changed. @default the provider's `noChanges` */
  empty?: Child;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  id?: string;
}

export interface ChangeLogParams {
  actors?: string;
  range?: string;
}

const NO_FILTER: ChangeLogFilter = { actors: [], range: null };

/**
 * Who changed what, and when: a record's history, a workspace's audit log.
 *
 * ```tsx
 * <ChangeLog
 *   timeZone="Africa/Cairo"
 *   entries={[
 *     {
 *       id: "1",
 *       actor: { id: "u1", name: "Salama Ashoush" },
 *       action: "changed the plan",
 *       target: <Link to="/billing">Billing</Link>,
 *       time: "2026-03-04T09:30:00Z",
 *       reason: "Moved to annual billing",
 *       changes: [{ field: "Plan", before: "Team", after: "Business" }],
 *     },
 *   ]}
 *   onLoadMore={next}
 * />
 * ```
 *
 * A `Timeline` grouped by day, each entry its actor (a person's avatar, or a
 * robot for the system), what they did and to what, why, and the fields it
 * moved as `FieldChanges`. Over it, a `DataToolbar` with Who, the people in
 * the log, and When, a range of days with presets, which narrow the entries
 * here or, with `manualFiltering`, are handed to a server that does. `params`
 * keeps both in the address.
 */
export function ChangeLog(props: ChangeLogProps) {
  const messages = useArcMessages();
  function cls(): ChangeLogSlots {
    return parts(changeLogStyles(), props.classes);
  }
  const [filter, setFilter] = controllable<ChangeLogFilter>(
    () => props.filter,
    () => props.defaultFilter ?? NO_FILTER,
    (next) => props.onFilterChange?.(next),
  );
  function actors(): readonly ChangeActor[] {
    if (props.actors !== undefined) return props.actors;
    const seen = new Map<string, ChangeActor>();
    for (const entry of props.entries) {
      if (entry.actor !== undefined && !seen.has(entry.actor.id)) {
        seen.set(entry.actor.id, entry.actor);
      }
    }
    return [...seen.values()];
  }
  function shown(): readonly ChangeEntry[] {
    if (props.manualFiltering === true) return props.entries;
    const now = filter();
    return props.entries.filter((entry) => matchesChangeLogFilter(entry, now, props.timeZone));
  }
  function filters(): DataToolbarFilter[] {
    return [
      {
        id: "actors",
        label: messages().changeActor,
        options: actors().map((actor) => ({ value: actor.id, label: actor.name })),
        value: filter().actors,
        param: props.params?.actors,
        onChange: (ids: string[]) => setFilter({ ...filter(), actors: ids }),
      },
      {
        kind: "date-range",
        id: "range",
        label: messages().changeDate,
        value: filter().range,
        param: props.params?.range,
        onChange: (range: DateRange | null) => setFilter({ ...filter(), range }),
      },
    ];
  }
  function events(): TimelineEvent[] {
    return shown().map((entry) => ({
      id: entry.id,
      time: entry.time,
      icon: entry.icon,
      tone: entry.tone,
      actor: <ChangeActorName actor={entry.actor} classes={cls()} />,
      title: <ChangeTitle entry={entry} classes={cls()} />,
      description:
        entry.reason === undefined &&
        entry.changes === undefined &&
        entry.details === undefined ? undefined : (
          <ChangeBody entry={entry} classes={cls()} />
        ),
    }));
  }
  return (
    <div class={arc(cls().root, props.class, props.className)} id={props.id} data-slot="change-log">
      <Show when={props.filterable !== false}>
        <DataToolbar class={cls().toolbar} filters={filters()} />
      </Show>
      <Timeline
        aria-label={props["aria-label"] ?? messages().changeLog}
        events={events()}
        groupByDay
        timeFormat="absolute"
        timeZone={props.timeZone}
        now={props.now}
        empty={props.empty ?? messages().noChanges}
        onLoadMore={props.onLoadMore}
        isLoadingMore={props.isLoadingMore}
      />
    </div>
  );
}

interface ChangePartProps {
  classes: ChangeLogSlots;
}

interface ChangeActorNameProps extends ChangePartProps {
  actor: ChangeActor | undefined;
}

function ChangeActorName(props: ChangeActorNameProps) {
  const messages = useArcMessages();
  function isSystem(): boolean {
    return props.actor === undefined || props.actor.system === true;
  }
  return (
    <span class={props.classes.actor} data-slot="change-log-actor">
      <Show
        when={!isSystem()}
        fallback={
          <span class={props.classes.system} data-slot="change-log-system">
            <Bot aria-hidden="true" />
          </span>
        }
      >
        <PersonAvatar
          class={props.classes.avatar}
          size="sm"
          person={{ name: props.actor?.name ?? "", src: props.actor?.src }}
        />
      </Show>
      {props.actor?.name ?? messages().system}
    </span>
  );
}

interface ChangeEntryProps extends ChangePartProps {
  entry: ChangeEntry;
}

function ChangeTitle(props: ChangeEntryProps) {
  return (
    <>
      {props.entry.action}
      <Show when={props.entry.target !== undefined}>
        {" "}
        <span class={props.classes.target} data-slot="change-log-target">
          {props.entry.target}
        </span>
      </Show>
    </>
  );
}

function ChangeBody(props: ChangeEntryProps) {
  return (
    <div class={props.classes.entry} data-slot="change-log-entry">
      <Show when={props.entry.reason !== undefined}>
        <p class={props.classes.reason} dir="auto" data-slot="change-log-reason">
          {props.entry.reason}
        </p>
      </Show>
      <Show when={props.entry.changes !== undefined && props.entry.changes.length > 0}>
        <FieldChanges changes={props.entry.changes ?? []} />
      </Show>
      {props.entry.details}
    </div>
  );
}
