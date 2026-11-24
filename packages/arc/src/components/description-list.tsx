import { type Child, For, Show } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { on } from "@barqjs/ui/conditions";
import type { RenderPart } from "@barqjs/ui/slot";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts, rendered } from "../lib/parts.ts";
import { edge, fg, gap, layout, space, type } from "../style/index.ts";

export interface DescriptionItem {
  id?: string;
  /** What the value is: "Plan", "Owner". */
  term: Child;
  /** The value. */
  details: Child;
  /** Beside the value, at the end: an edit button, a copy button. */
  action?: Child;
}

export const descriptionListStyles = variants({
  slots: {
    root: arc(layout.container, layout.flush, {
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr)",
    }),
    row: arc(layout.minZero, {
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr) auto",
      columnGap: space.x4,
      rowGap: space.x1,
      alignItems: "baseline",
      paddingBlock: space.x3,
    }),
    term: arc(type.sm, fg.muted, layout.minZero, { gridColumn: "1 / -1" }),
    details: arc(type.sm, fg.default, layout.minZero, layout.flush, { overflowWrap: "anywhere" }),
    action: arc(layout.row, gap[1], { gridRow: "span 1" }),
  },
  variants: {
    layout: {
      auto: {
        row: arc({
          [on.cqSm]: { gridTemplateColumns: "minmax(8rem, 1fr) minmax(0, 2fr) auto" },
        }),
        term: arc({ [on.cqSm]: { gridColumn: "auto" } }),
      },
      inline: {
        row: arc({ gridTemplateColumns: "minmax(8rem, 1fr) minmax(0, 2fr) auto" }),
        term: arc({ gridColumn: "auto" }),
      },
      stacked: {},
    },
    columns: {
      1: {},
      2: {
        root: arc({
          columnGap: space.x8,
          [on.cqLg]: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" },
        }),
      },
      3: {
        root: arc({
          columnGap: space.x8,
          [on.cqLg]: { gridTemplateColumns: "repeat(3, minmax(0, 1fr))" },
        }),
      },
    },
    divided: { true: { row: edge.bottom }, false: {} },
    align: { start: {}, end: { details: arc({ textAlign: "end" }) } },
  },
  defaults: { layout: "auto", columns: 1, divided: true, align: "start" },
});

type Slots = ReturnType<typeof descriptionListStyles>;

export interface DescriptionListProps extends Customisable<Slots> {
  items: readonly DescriptionItem[];
  /**
   * `auto` puts each term beside its value once the container is wide enough
   * and above it when it is not; `inline` and `stacked` always do one.
   * @default "auto"
   */
  layout?: "auto" | "inline" | "stacked";
  /** Pairs side by side across a wide container. @default 1 */
  columns?: 1 | 2 | 3;
  /** A rule under each pair. @default true */
  divided?: boolean;
  /** The values at the start or the end of their column. @default "start" */
  align?: "start" | "end";
  /** Another element for a term or a value: a heading, a link. */
  renders?: { term?: RenderPart<Child>; details?: RenderPart<Child> };
  "aria-label"?: string;
  id?: string;
}

/**
 * A record's facts as names and values: an invoice's, a member's, a check's.
 *
 * ```tsx
 * <DescriptionList
 *   items={[
 *     { term: "Plan", details: "Team", action: <Button size="sm">Change</Button> },
 *     { term: "Renews", details: <FormattedDate value={renewsAt} /> },
 *   ]}
 * />
 * ```
 *
 * A `<dl>` with each pair in a `<div>`, as HTML allows, so a screen reader
 * hears a term with its value. Two columns from a container's `sm` step, one
 * name above its value below it, and `columns` pairs side by side across a
 * wide container.
 */
export function DescriptionList(props: DescriptionListProps) {
  const cls = (): Slots =>
    parts(
      descriptionListStyles({
        layout: props.layout,
        columns: props.columns ?? 1,
        divided: props.divided !== false,
        align: props.align,
      }),
      props.classes,
    );
  return (
    <dl
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="description-list"
      aria-label={props["aria-label"]}
    >
      <For each={() => props.items}>
        {(item: DescriptionItem) => (
          <div class={cls().row} data-slot="description-list-row">
            {props.renders?.term === undefined ? (
              <dt class={cls().term} data-slot="description-list-term">
                {item.term}
              </dt>
            ) : (
              rendered(
                props.renders.term,
                { class: cls().term, "data-slot": "description-list-term" },
                item.term,
              )
            )}
            {props.renders?.details === undefined ? (
              <dd class={cls().details} data-slot="description-list-details">
                {item.details}
              </dd>
            ) : (
              rendered(
                props.renders.details,
                { class: cls().details, "data-slot": "description-list-details" },
                item.details,
              )
            )}
            <Show when={item.action !== undefined}>
              <dd class={cls().action} data-slot="description-list-action">
                {item.action}
              </dd>
            </Show>
          </div>
        )}
      </For>
    </dl>
  );
}
