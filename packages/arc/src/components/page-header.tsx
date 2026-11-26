import { type Child, For, Show, cells } from "@barqjs/core";
import { variants } from "@barqjs/css";
import type { UiProps } from "@barqjs/ui/props";
import { type RenderPart, uiProps } from "@barqjs/ui/slot";
import { srOnly } from "@barqjs/ui/sr-only";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts, rendered } from "../lib/parts.ts";
import { fg, gap, glyph, layout, plainList, rounded, space, type } from "../style/index.ts";
import type { Tone } from "../theme/tokens.ts";
import { Chip } from "./chip.tsx";

export const pageHeaderStyles = variants({
  slots: {
    root: arc(layout.row, layout.wrap, layout.between, gap[4], {
      alignItems: "flex-end",
      paddingBlockEnd: space.x4,
    }),
    media: arc(layout.noShrink),
    text: arc(layout.column, layout.minZero, gap[1], { flex: "1 1 18rem" }),
    titleRow: arc(layout.row, layout.wrap, layout.minZero, gap[2], { rowGap: space.x1 }),
    mark: arc(layout.inlineCentre, layout.noShrink),
    title: arc(type.title, layout.minZero, { overflowWrap: "anywhere" }),
    badges: arc(layout.row, layout.wrap, gap[1.5]),
    facts: arc(layout.row, layout.wrap, layout.flush, type.sm, fg.muted, {
      columnGap: space.x3,
      rowGap: space.x1,
    }),
    fact: arc(layout.inlineRow, layout.minZero),
    factValue: arc(layout.inlineRow, layout.minZero, layout.flush, glyph.sm, gap[1.5]),
    description: arc(type.body, fg.muted),
    alerts: arc(plainList, layout.row, layout.wrap, gap[2], { paddingBlockStart: space.x1 }),
    alert: arc(layout.minZero, { maxWidth: "100%" }),
    alertChip: arc(rounded.md),
    // A long alert wraps inside its chip: held to one line it clipped what it said on a phone.
    alertLabel: arc({ whiteSpace: "normal", paddingBlock: space.x0_5 }),
    actions: arc(layout.row, layout.wrap, gap[2]),
  },
  variants: {
    align: {
      end: {},
      start: { root: arc({ alignItems: "flex-start" }) },
    },
  },
  defaults: { align: "end" },
});

type Slots = ReturnType<typeof pageHeaderStyles>;

/** One fact about the record in the row under its title: its kind, its owner, when it last ran. */
export interface HeaderFact {
  id?: string;
  /** What the value is, for a screen reader: the value explains itself on screen. */
  label: string;
  value: Child;
}

/** Something about the record a reader must not miss: overdue, on hold, muted. */
export interface HeaderAlert {
  id?: string;
  label: Child;
  /** @default "warning" */
  tone?: Tone;
  /** Before the words. Hidden from assistive tech. */
  icon?: Child;
}

export interface PageHeaderRenders {
  title?: RenderPart<Child>;
  description?: RenderPart<Child>;
}

export interface PageHeaderProps extends Omit<UiProps, "class" | "className">, Customisable<Slots> {
  /** The page's `<h1>`. Not `title`, which is the attribute every element takes. */
  heading: Child;
  description?: Child;
  /** Above the title: a breadcrumb, a back link, an eyebrow. */
  leading?: Child;
  /** At the start, beside everything else: the record's avatar or photo. */
  media?: Child;
  /** Right before the title: a status dot or the record kind's icon. */
  mark?: Child;
  /** Right after the title: a status pill, a version, a "Shared" badge. */
  badges?: Child;
  /** The record's facts, one wrapping row under the title, each named for a screen reader. */
  facts?: readonly HeaderFact[];
  /** A strip of toned notes under the rest. */
  alerts?: readonly HeaderAlert[];
  /** At the end of the row, wrapping below the title on a narrow screen. */
  actions?: Child;
  /** The actions at the foot of the text or at its top, beside the title. @default "end" */
  align?: "start" | "end";
  /** Another element for the title or the line under it: an `<h2>` on a page inside a page. */
  renders?: PageHeaderRenders;
}

/**
 * The top of a page: what it is, a line about it, and what you can do here.
 *
 * ```tsx
 * <PageHeader
 *   heading="Checks"
 *   description="Everything this project watches."
 *   actions={<Button onPress={create}>New check</Button>}
 * />
 * ```
 *
 * A record's page says more about the record in the same header:
 *
 * ```tsx
 * <PageHeader
 *   heading="Checkout API"
 *   mark={<Status tone="danger" label="Failing" />}
 *   badges={<Chip size="sm">HTTP</Chip>}
 *   facts={[
 *     { label: "Target", value: "api.example.com" },
 *     { label: "Schedule", value: "Every minute" },
 *   ]}
 *   alerts={[{ label: "Alerts muted until 14:00", tone: "warning", icon: <BellOff /> }]}
 *   actions={<Button>Run now</Button>}
 * />
 * ```
 *
 * The facts are a `<dl>` whose terms only a screen reader hears, since a
 * value such as a host or a schedule explains itself on screen; the alerts
 * are a list of toned chips that wrap, a long one inside its own chip.
 */
export function PageHeader(props: PageHeaderProps) {
  function cls(): Slots {
    return parts(pageHeaderStyles({ align: props.align }), props.classes);
  }
  const title = props.renders?.title;
  const description = props.renders?.description;
  function facts(): readonly HeaderFact[] {
    return props.facts ?? [];
  }
  function alerts(): readonly HeaderAlert[] {
    return props.alerts ?? [];
  }
  return (
    <header {...uiProps("page-header", () => cls().root, cells(props))}>
      <Show when={props.media !== undefined}>
        <div class={cls().media} data-slot="page-header-media">
          {props.media}
        </div>
      </Show>
      <div class={cls().text} data-slot="page-header-text">
        <Show when={props.leading}>{props.leading}</Show>
        <div class={cls().titleRow} data-slot="page-header-title-row">
          <Show when={props.mark !== undefined}>
            <span class={cls().mark} data-slot="page-header-mark">
              {props.mark}
            </span>
          </Show>
          {title === undefined ? (
            <h1 class={cls().title} data-slot="page-header-title">
              {props.heading}
            </h1>
          ) : (
            rendered(title, { class: cls().title, "data-slot": "page-header-title" }, props.heading)
          )}
          <Show when={props.badges !== undefined}>
            <span class={cls().badges} data-slot="page-header-badges">
              {props.badges}
            </span>
          </Show>
        </div>
        <Show when={facts().length > 0}>
          <dl class={cls().facts} data-slot="page-header-facts">
            <For each={facts}>
              {(fact: HeaderFact) => (
                <div class={cls().fact} data-slot="page-header-fact">
                  <dt class={srOnly}>{fact.label}</dt>
                  <dd class={cls().factValue}>{fact.value}</dd>
                </div>
              )}
            </For>
          </dl>
        </Show>
        <Show when={props.description}>
          {description === undefined ? (
            <p class={cls().description} data-slot="page-header-description">
              {props.description}
            </p>
          ) : (
            rendered(
              description,
              { class: cls().description, "data-slot": "page-header-description" },
              props.description,
            )
          )}
        </Show>
        <Show when={alerts().length > 0}>
          <ul class={cls().alerts} data-slot="page-header-alerts">
            <For each={alerts}>
              {(alert: HeaderAlert) => (
                <li class={cls().alert} data-slot="page-header-alert">
                  <Chip
                    tone={alert.tone ?? "warning"}
                    variant="subtle"
                    size="sm"
                    icon={alert.icon}
                    class={cls().alertChip}
                    classes={{ label: cls().alertLabel }}
                  >
                    {alert.label}
                  </Chip>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </div>
      <Show when={props.actions}>
        <div class={cls().actions} data-slot="page-header-actions">
          {props.actions}
        </div>
      </Show>
    </header>
  );
}
