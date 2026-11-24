import { type Child, For, Show } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { tokens } from "@barqjs/ui/theme/tokens";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  bg,
  fg,
  gap,
  glyph,
  layout,
  plainList,
  rounded,
  space,
  square,
  tone as tones,
  type,
} from "../style/index.ts";
import type { Tone } from "../theme/tokens.ts";
import { FormattedDate, type Moment, RelativeTime } from "./format.tsx";

export interface TimelineEvent {
  id: string;
  /** What happened: "Deployed v2.4", "Ana commented". */
  title: Child;
  /** More about it: a message, a diff, a quote. */
  description?: Child;
  /** When. Written as how long ago, the absolute time in its title. */
  time?: Moment;
  /** In the marker. Left out, a dot. Hidden from assistive tech. */
  icon?: Child;
  /** @default "neutral" */
  tone?: Tone;
  /** Who: an avatar, a name. Before the title. */
  actor?: Child;
}

export const timelineStyles = variants({
  slots: {
    root: arc(plainList, layout.column),
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
    time: arc(type.meta, { marginInlineStart: "auto" }),
    description: arc(type.sm, fg.muted),
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
  id?: string;
}

/**
 * What happened to something, in order: a record's activity, a deploy's
 * steps, an incident's updates.
 *
 * ```tsx
 * <Timeline
 *   aria-label="Activity"
 *   events={[
 *     { id: "1", title: "Deployed v2.4", time: deployedAt, tone: "success", icon: <Rocket /> },
 *     { id: "2", title: "Check failed", time: failedAt, tone: "danger", description: "Timed out" },
 *   ]}
 * />
 * ```
 *
 * An ordered list down a rail, each event's marker an icon or a dot in its
 * tone. Its time is `RelativeTime` (or `FormattedDate`), a `<time>` with the
 * absolute moment, so the server and the hydrating page agree. The rail is
 * drawn with logical edges and follows the reading direction.
 */
export function Timeline(props: TimelineProps) {
  const cls = (): Slots => parts(timelineStyles({ density: props.density }), props.classes);
  return (
    <ol
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="timeline"
      aria-label={props["aria-label"]}
    >
      <For each={() => props.events}>
        {(event: TimelineEvent) => (
          <li
            class={arc(cls().event, tones[event.tone ?? "neutral"])}
            data-slot="timeline-event"
            data-tone={event.tone ?? "neutral"}
          >
            <span class={cls().rail} data-slot="timeline-rail" aria-hidden="true">
              <span class={cls().marker} data-slot="timeline-marker">
                {event.icon ?? <span class={cls().dot} data-slot="timeline-dot" />}
              </span>
              <span class={cls().line} data-slot="timeline-line" />
            </span>
            <div class={cls().body} data-slot="timeline-body">
              <div class={cls().heading} data-slot="timeline-heading">
                <Show when={event.actor !== undefined}>
                  <span class={cls().actor} data-slot="timeline-actor">
                    {event.actor}
                  </span>
                </Show>
                <span class={cls().title} data-slot="timeline-title">
                  {event.title}
                </span>
                <Show when={event.time !== undefined}>
                  {props.timeFormat === "absolute" ? (
                    <FormattedDate
                      class={cls().time}
                      value={event.time ?? 0}
                      options={{ dateStyle: "medium", timeStyle: "short" }}
                    />
                  ) : (
                    <RelativeTime class={cls().time} value={event.time ?? 0} now={props.now} />
                  )}
                </Show>
              </div>
              <Show when={event.description !== undefined}>
                <div class={cls().description} data-slot="timeline-description">
                  {event.description}
                </div>
              </Show>
            </div>
          </li>
        )}
      </For>
    </ol>
  );
}
