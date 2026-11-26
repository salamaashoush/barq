import { type Child, For, Show, createMemo, createUniqueId } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { controllable } from "@barqjs/aria/utils";
import { Star } from "@barqjs/lucide/icons/star";
import { Button } from "@barqjs/ui/button";
import type { RenderPart } from "@barqjs/ui/slot";
import { srOnly } from "@barqjs/ui/sr-only";
import { tokens } from "@barqjs/ui/theme/tokens";
import { ToggleGroup, ToggleGroupItem } from "@barqjs/ui/toggle-group";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts, rendered } from "../lib/parts.ts";
import {
  bg,
  fg,
  gap,
  glyph,
  layout,
  place,
  plainList,
  rounded,
  space,
  square,
  surface,
  tone as tones,
  type,
} from "../style/index.ts";
import type { Tone } from "../theme/tokens.ts";
import { FormattedDate, type Moment, RelativeTime } from "./format.tsx";
import { IconButton } from "./icon-button.tsx";
import { type ListSection, useDateSections } from "./item-list.tsx";
import { useArcMessages } from "./messages.ts";

export interface TimelineEvent {
  id: string;
  /** What happened: "Deployed v2.4", "Ana commented". Left out, its kind's verb. */
  title?: Child;
  /** More about it: a message, a diff, a quote. */
  description?: Child;
  /** When. Written as how long ago, the absolute time in its title. */
  time?: Moment;
  /** In the marker. Left out, its kind's icon, or a dot. Hidden from assistive tech. */
  icon?: Child;
  /** @default its kind's tone, or "neutral" */
  tone?: Tone;
  /** Who: an avatar, a name. Before the title. */
  actor?: Child;
  /** What sort of event it is, looked up in the timeline's `kinds`. */
  kind?: string;
  /** After the title: a link to the run, a button. */
  action?: Child;
  /** Marked as one of the events that matter: the ones a postmortem tells. */
  isKey?: boolean;
  /** A comment someone wrote, drawn as a card among the events. */
  comment?: boolean;
}

/** What one kind of event looks like and says, so an app describes each kind once. */
export interface TimelineKind {
  /** The kind's name in the filter: "Comments". */
  label: string;
  icon?: Child;
  tone?: Tone;
  /** The title of an event of this kind that has none: "acknowledged", "renamed it to Outage". */
  verb?: (event: TimelineEvent) => Child;
  /** Its detail is in the verb, so the description is not shown. */
  quiet?: boolean;
  /** Its events are comments. */
  comment?: boolean;
}

export const timelineStyles = variants({
  slots: {
    root: arc(plainList, layout.column),
    filter: arc(layout.wrap, { marginBlockEnd: space.x4 }),
    group: arc(layout.column, gap[3], { "& + &": { marginBlockStart: space.x6 } }),
    day: arc(type.label, fg.muted, layout.flush),
    list: arc(plainList, layout.column),
    event: arc(layout.row, layout.relative, gap[3], {
      alignItems: "flex-start",
      paddingBlockEnd: space.x5,
      "&:last-child": { paddingBlockEnd: "0" },
    }),
    rail: arc(layout.column, layout.centre, layout.noShrink, {
      alignSelf: "stretch",
      justifyContent: "flex-start",
    }),
    marker: arc(
      layout.inlineCentre,
      layout.noShrink,
      rounded.full,
      glyph.sm,
      bg.tone,
      fg.tone,
      square.x6,
    ),
    dot: arc(rounded.full, bg.toneSolid, { width: space.x2_5, height: space.x2_5 }),
    line: arc(layout.grow, {
      width: "2px",
      marginBlockStart: space.x1,
      marginBlockEnd: "calc(var(--spacing) * -4)",
      backgroundColor: tokens.border,
      "li:last-child > * > &": { display: "none" },
    }),
    body: arc(layout.column, layout.minZero, layout.grow, gap[1], {
      paddingBlockStart: space.x0_5,
    }),
    heading: arc(layout.row, layout.wrap, gap[2], { columnGap: space.x2, rowGap: space.x0_5 }),
    actor: arc(layout.inlineRow, gap[1.5], type.label),
    title: arc(type.sm, layout.minZero),
    key: arc(layout.inlineCentre, fg.muted, { "& svg[data-key]": { fill: "currentColor" } }),
    action: arc(layout.inlineRow, gap[1], type.sm),
    time: arc(type.meta, { marginInlineStart: "auto" }),
    description: arc(type.sm, fg.muted, { whiteSpace: "pre-wrap" }),
    comment: arc(surface.bordered, rounded.md, type.sm, fg.default, place.padded, {
      whiteSpace: "pre-wrap",
    }),
    empty: arc(type.meta),
    more: arc(layout.row, { marginBlockStart: space.x4 }),
  },
  variants: {
    density: {
      comfortable: {},
      compact: { event: arc({ paddingBlockEnd: space.x3 }) },
    },
  },
  defaults: { density: "comfortable" },
});

type Slots = ReturnType<typeof timelineStyles>;

const marked = arc(tones.warning, fg.tone);

export interface TimelineRenders {
  /** Another element for a day's heading: an `h2`, an `h4`. @default an `h3` */
  day?: RenderPart<Child>;
}

export interface TimelineProps extends Customisable<Slots> {
  events: readonly TimelineEvent[];
  /** Names the list. */
  "aria-label"?: string;
  /** `relative` writes "3 minutes ago"; `absolute` the date and time. @default "relative" */
  timeFormat?: "relative" | "absolute";
  /** The moment relative times are measured from while the page is drawn and hydrated. */
  now?: Moment;
  /** @default "comfortable" */
  density?: "comfortable" | "compact";
  /** Each kind's label, icon, tone and verb, for events that name a `kind`. */
  kinds?: Readonly<Record<string, TimelineKind>>;
  /** Under a heading per day: "Today", "Yesterday", "Monday 3 March". */
  groupByDay?: boolean;
  /** The zone whose calendar the days fall in. @default the reader's */
  timeZone?: string;
  /** A row of the kinds present above the list, to show only some of them. */
  filterable?: boolean;
  /** The kinds shown. Empty shows every kind. */
  kindFilter?: readonly string[];
  defaultKindFilter?: readonly string[];
  onKindFilterChange?: (kinds: string[]) => void;
  /** Each event gets a star that marks it as a key event, and this hears it. */
  onKeyChange?: (id: string, isKey: boolean) => void;
  /** Shown when there are no events, or none of the kinds chosen. */
  empty?: Child;
  /** Adds Show more under the list, for a history read a page at a time. */
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  /** @default the provider's `showMore`, "Show more" */
  loadMoreLabel?: string;
  renders?: TimelineRenders;
  id?: string;
}

interface Day {
  section: ListSection | undefined;
  events: TimelineEvent[];
}

interface Shared {
  props: TimelineProps;
  cls: () => Slots;
}

function kindOf(shared: Shared, event: TimelineEvent): TimelineKind | undefined {
  return event.kind === undefined ? undefined : shared.props.kinds?.[event.kind];
}

function humanised(kind: string): string {
  return kind.replaceAll("_", " ");
}

/**
 * What happened to something, in order: a record's activity, a deploy's
 * steps, an incident's updates.
 *
 * ```tsx
 * <Timeline
 *   aria-label="Activity"
 *   groupByDay
 *   filterable
 *   kinds={{
 *     comment: { label: "Comments", icon: <MessageSquare />, comment: true },
 *     resolved: { label: "Resolutions", icon: <CircleCheck />, tone: "success", verb: () => "resolved" },
 *   }}
 *   events={[
 *     { id: "1", kind: "resolved", actor: "Ana", time: resolvedAt },
 *     { id: "2", kind: "comment", actor: "Ben", time: commentedAt, description: "Rolled back" },
 *   ]}
 *   onKeyChange={(id, isKey) => mark(id, isKey)}
 * />
 * ```
 *
 * An ordered list down a rail, each event's marker an icon or a dot in its
 * tone. `kinds` describes each kind of event once: an event that names one
 * takes its icon, tone and verb, and a kind the registry does not know reads
 * as its own name. `groupByDay` puts the events under a heading per day in a
 * list of their own; `filterable` adds a row of the kinds present, and
 * comments are drawn as cards among the events. Its time is `RelativeTime`
 * (or `FormattedDate`), a `<time>` with the absolute moment, so the server
 * and the hydrating page agree. The rail follows the reading direction.
 */
export function Timeline(props: TimelineProps) {
  const messages = useArcMessages();
  function cls(): Slots {
    return parts(timelineStyles({ density: props.density }), props.classes);
  }
  const shared: Shared = { props, cls };
  const [chosen, setChosen] = controllable<readonly string[]>(
    () => props.kindFilter,
    () => props.defaultKindFilter ?? [],
    (kinds) => props.onKindFilterChange?.([...kinds]),
  );
  const byDay = useDateSections({
    get timeZone() {
      return props.timeZone;
    },
    get now() {
      return props.now;
    },
  });

  function present(): string[] {
    const seen = new Set<string>();
    for (const event of props.events) if (event.kind !== undefined) seen.add(event.kind);
    const order = Object.keys(props.kinds ?? {});
    return [...seen].toSorted((a, b) => rank(order, a) - rank(order, b));
  }
  function shown(): readonly TimelineEvent[] {
    const kinds = chosen();
    if (kinds.length === 0) return props.events;
    return props.events.filter((event) => event.kind !== undefined && kinds.includes(event.kind));
  }
  const days = createMemo((): Day[] => {
    if (props.groupByDay !== true) return [{ section: undefined, events: [...shown()] }];
    const out: Day[] = [];
    for (const event of shown()) {
      const last = out.at(-1);
      const section = event.time === undefined ? last?.section : byDay(event.time);
      if (last !== undefined && last.section?.id === section?.id) last.events.push(event);
      else out.push({ section, events: [event] });
    }
    return out;
  });

  return (
    <div
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="timeline"
      role={props.groupByDay === true ? "group" : undefined}
      aria-label={props.groupByDay === true ? props["aria-label"] : undefined}
    >
      <Show when={props.filterable === true && present().length > 0}>
        <ToggleGroup
          class={cls().filter}
          data-slot="timeline-filter"
          type="multiple"
          variant="outline"
          size="sm"
          spacing={1}
          aria-label={messages().eventKinds}
          value={chosen()}
          onChange={(kinds: string[]) => setChosen(kinds)}
        >
          <For each={present()}>
            {(kind: string) => (
              <ToggleGroupItem value={kind} data-slot="timeline-filter-kind">
                {props.kinds?.[kind]?.label ?? humanised(kind)}
              </ToggleGroupItem>
            )}
          </For>
        </ToggleGroup>
      </Show>
      <Show
        when={shown().length > 0}
        fallback={
          <Show when={props.empty !== undefined || chosen().length > 0}>
            <p class={cls().empty} data-slot="timeline-empty">
              {props.empty ?? messages().noMatchingEvents}
            </p>
          </Show>
        }
      >
        <For each={days()}>{(day: Day) => <TimelineDay shared={shared} day={day} />}</For>
      </Show>
      <Show when={props.onLoadMore !== undefined}>
        <div class={cls().more} data-slot="timeline-more">
          <Button
            variant="outline"
            size="sm"
            isPending={props.isLoadingMore === true}
            onPress={() => props.onLoadMore?.()}
          >
            {props.loadMoreLabel ?? messages().showMore}
          </Button>
        </div>
      </Show>
    </div>
  );
}

function rank(order: readonly string[], kind: string): number {
  const at = order.indexOf(kind);
  return at < 0 ? order.length : at;
}

interface TimelineDayProps {
  shared: Shared;
  day: Day;
}

function TimelineDay(props: TimelineDayProps) {
  const headingId = createUniqueId();
  const cls = props.shared.cls;
  function heading() {
    const render = props.shared.props.renders?.day;
    const label = props.day.section?.label;
    return render === undefined ? (
      <h3 class={cls().day} id={headingId} data-slot="timeline-day">
        {label}
      </h3>
    ) : (
      rendered(render, { class: cls().day, id: headingId, "data-slot": "timeline-day" }, label)
    );
  }
  return (
    <Show
      when={props.day.section !== undefined}
      fallback={
        <TimelineList
          shared={props.shared}
          events={props.day.events}
          label={props.shared.props["aria-label"]}
        />
      }
    >
      <section class={cls().group} data-slot="timeline-group" aria-labelledby={headingId}>
        {heading()}
        <TimelineList shared={props.shared} events={props.day.events} labelledBy={headingId} />
      </section>
    </Show>
  );
}

interface TimelineListProps {
  shared: Shared;
  events: readonly TimelineEvent[];
  label?: string;
  labelledBy?: string;
}

function TimelineList(props: TimelineListProps) {
  return (
    <ol
      class={props.shared.cls().list}
      data-slot="timeline-list"
      aria-label={props.label}
      aria-labelledby={props.labelledBy}
    >
      <For each={() => props.events}>
        {(event: TimelineEvent) => <TimelineRow shared={props.shared} event={event} />}
      </For>
    </ol>
  );
}

interface TimelineRowProps {
  shared: Shared;
  event: TimelineEvent;
}

function TimelineRow(props: TimelineRowProps) {
  const messages = useArcMessages();
  const cls = props.shared.cls;
  const owner = props.shared.props;
  function kind(): TimelineKind | undefined {
    return kindOf(props.shared, props.event);
  }
  function tone(): Tone {
    return props.event.tone ?? kind()?.tone ?? "neutral";
  }
  function icon(): Child {
    return props.event.icon ?? kind()?.icon;
  }
  function title(): Child {
    if (props.event.title !== undefined) return props.event.title;
    const verb = kind()?.verb;
    if (verb !== undefined) return verb(props.event);
    return props.event.kind === undefined ? undefined : humanised(props.event.kind);
  }
  function isComment(): boolean {
    return props.event.comment ?? kind()?.comment === true;
  }
  function described(): boolean {
    return props.event.description !== undefined && kind()?.quiet !== true;
  }
  return (
    <li
      class={arc(cls().event, tones[tone()])}
      data-slot="timeline-event"
      data-tone={tone()}
      data-kind={props.event.kind}
      data-key={props.event.isKey === true ? "" : undefined}
    >
      <span class={cls().rail} data-slot="timeline-rail" aria-hidden="true">
        <span class={cls().marker} data-slot="timeline-marker">
          <Show
            when={icon() !== undefined}
            fallback={<span class={cls().dot} data-slot="timeline-dot" />}
          >
            {icon()}
          </Show>
        </span>
        <span class={cls().line} data-slot="timeline-line" />
      </span>
      <div class={cls().body} data-slot="timeline-body">
        <div class={cls().heading} data-slot="timeline-heading">
          <Show when={props.event.actor !== undefined}>
            <span class={cls().actor} data-slot="timeline-actor">
              {props.event.actor}
            </span>
          </Show>
          <span class={cls().title} data-slot="timeline-title">
            {title()}
          </span>
          <Show
            when={owner.onKeyChange !== undefined}
            fallback={
              <Show when={props.event.isKey === true}>
                <span class={arc(cls().key, marked)} data-slot="timeline-key">
                  <Star aria-hidden="true" data-key="" />
                  <span class={srOnly}>{messages().keyEvent}</span>
                </span>
              </Show>
            }
          >
            <IconButton
              class={arc(cls().key, props.event.isKey === true ? marked : undefined)}
              slot="timeline-key"
              size="xs"
              label={
                props.event.isKey === true ? messages().unmarkKeyEvent : messages().markKeyEvent
              }
              isPressed={props.event.isKey === true}
              onPress={() => owner.onKeyChange?.(props.event.id, props.event.isKey !== true)}
            >
              <Star aria-hidden="true" data-key={props.event.isKey === true ? "" : undefined} />
            </IconButton>
          </Show>
          <Show when={props.event.action !== undefined}>
            <span class={cls().action} data-slot="timeline-action">
              {props.event.action}
            </span>
          </Show>
          <Show when={props.event.time !== undefined}>
            {owner.timeFormat === "absolute" ? (
              <FormattedDate
                class={cls().time}
                value={props.event.time ?? 0}
                options={
                  owner.groupByDay === true
                    ? { timeStyle: "short" }
                    : { dateStyle: "medium", timeStyle: "short" }
                }
                timeZone={owner.timeZone}
              />
            ) : (
              <RelativeTime class={cls().time} value={props.event.time ?? 0} now={owner.now} />
            )}
          </Show>
        </div>
        <Show when={described()}>
          <div
            class={isComment() ? cls().comment : cls().description}
            data-slot={isComment() ? "timeline-comment" : "timeline-description"}
          >
            {props.event.description}
          </div>
        </Show>
      </div>
    </li>
  );
}
