import { For, Match, Show, Switch } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { on } from "@barqjs/ui/conditions";
import { Skeleton } from "@barqjs/ui/skeleton";
import { srOnly } from "@barqjs/ui/sr-only";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { bg, edge, gap, layout, rounded, space, square, surface } from "../style/index.ts";
import { useArcMessages } from "./messages.ts";

// Each bar is a height composed with a width, so no two bars write the same
// pair of declarations.
const tall = arc.create({
  x3: { height: space.x3 },
  x4: { height: space.x4 },
  x5: { height: space.x5 },
  x6: { height: space.x6 },
  x9: { height: space.x9 },
  x10: { height: space.x10 },
  x11: { height: space.x11 },
  x14: { height: space.x14 },
  cell: { height: "0.875rem" },
});

const wide = arc.create({
  full: { width: "100%" },
  fit: { maxWidth: "100%" },
});

export const pageSkeletonStyles = variants({
  slots: {
    root: arc(layout.column, gap[8]),
    header: arc(layout.row, layout.between, gap[6], { alignItems: "flex-start" }),
    titles: arc(layout.column, gap[2], layout.minZero),
    title: arc(tall.x6, { width: "12rem" }),
    line: arc(tall.x4, wide.fit, { width: "18rem" }),
    button: arc(layout.noShrink, tall.x9, { width: "7rem" }),
    toolbar: arc(layout.row, layout.wrap, gap[2]),
    search: arc(tall.x9, wide.fit, { width: "16rem" }),
    filters: arc(tall.x9, wide.fit, { width: "20rem" }),
    table: arc(surface.card, edge.all, rounded.lg, layout.clip),
    head: arc(bg.sunken, edge.bottom, tall.x10),
    row: arc(layout.row, gap[6], edge.bottom, tall.x11, {
      alignItems: "center",
      paddingInline: space.x4,
      ":last-child": { borderBlockEndWidth: "0px" },
    }),
    cellMain: arc(tall.cell, { width: "10rem" }),
    cellSide: arc(tall.cell, { width: "6rem", [on.belowSm]: { display: "none" } }),
    cellEnd: arc(tall.cell, { width: "3.5rem", marginInlineStart: "auto" }),
    section: arc(layout.column, gap[3]),
    sectionTitle: arc(tall.x5, { width: "6rem" }),
    strip: arc(layout.row, layout.wrap, edge.all, rounded.lg, layout.clip, bg.muted, {
      gap: "1px",
    }),
    stat: arc(surface.card, layout.column, gap[2], {
      flex: "1 1 10rem",
      paddingInline: space.x4,
      paddingBlock: space.x3_5,
    }),
    statLabel: arc(tall.x3, { width: "5rem" }),
    statValue: arc(tall.x6, { width: "6rem" }),
    statNote: arc(tall.x3, { width: "7rem" }),
    bar: arc(tall.x9, wide.full),
    block: arc(rounded.lg, wide.full, { height: "14rem" }),
    field: arc(layout.column, gap[3]),
    label: arc(tall.x5, { width: "8rem" }),
    input: arc(tall.x9, wide.full),
    inputShort: arc(tall.x9, { width: "66%" }),
    card: arc(surface.card, edge.all, rounded.lg, layout.clip),
    cardBody: arc(layout.column, gap[3], { padding: space.x6 }),
    cardInput: arc(tall.x9, wide.full, { maxWidth: "24rem", marginBlockStart: space.x2 }),
    cardFoot: arc(bg.sunken, edge.top, tall.x14),
    review: arc(layout.column, gap[4], {
      [on.lg]: {
        display: "grid",
        gridTemplateColumns: "300px minmax(0, 1fr)",
        alignItems: "start",
      },
    }),
    tabs: arc(tall.x9, wide.fit, { width: "24rem" }),
    items: arc(edge.all, rounded.lg, layout.clip, layout.column, bg.muted, { gap: "1px" }),
    item: arc(surface.card, layout.row, gap[3], {
      alignItems: "center",
      height: "3.25rem",
      paddingInline: space.x3,
    }),
    itemIcon: arc(layout.noShrink, square.x4),
    itemLines: arc(layout.column, layout.grow, gap[1.5]),
    itemTitle: arc(tall.cell, { width: "7rem" }),
    itemNote: arc(tall.x3, { width: "10rem" }),
    viewer: arc(rounded.lg, wide.full, { height: "22.5rem", [on.lg]: { height: "35rem" } }),
  },
});

type Slots = ReturnType<typeof pageSkeletonStyles>;

/** The shape of the page it stands in for. */
export type PageTemplate = "list" | "record" | "form" | "dashboard" | "settings" | "review";

export interface PageSkeletonProps extends Customisable<Slots> {
  template: PageTemplate;
  /** The heading and its line at the top. @default true */
  header?: boolean;
  /** A button beside the heading. @default true, except on a record or settings page */
  headerAction?: boolean;
  /** Rows in its table. @default the template's own */
  rows?: number;
}

function range(count: number): readonly number[] {
  return Array.from({ length: count }, (_, at) => at);
}

interface PartProps {
  cls: Slots;
}

interface TableProps extends PartProps {
  rows: number;
}

function Table(props: TableProps) {
  return (
    <div class={props.cls.table} data-slot="page-skeleton-table">
      <div class={props.cls.head} />
      <For each={range(props.rows)}>
        {() => (
          <div class={props.cls.row}>
            <Skeleton class={props.cls.cellMain} />
            <Skeleton class={props.cls.cellSide} />
            <Skeleton class={props.cls.cellEnd} />
          </div>
        )}
      </For>
    </div>
  );
}

function Strip(props: PartProps) {
  return (
    <div class={props.cls.strip} data-slot="page-skeleton-strip">
      <For each={range(4)}>
        {() => (
          <div class={props.cls.stat}>
            <Skeleton class={props.cls.statLabel} />
            <Skeleton class={props.cls.statValue} />
            <Skeleton class={props.cls.statNote} />
          </div>
        )}
      </For>
    </div>
  );
}

function Section(props: TableProps) {
  return (
    <div class={props.cls.section}>
      <Skeleton class={props.cls.sectionTitle} />
      <Table cls={props.cls} rows={props.rows} />
    </div>
  );
}

/**
 * What a page shows while its data loads, shaped like the page it becomes,
 * so nothing jumps when it arrives: a list, a record, a form, a dashboard,
 * a settings page or a review page with its list beside a viewer.
 *
 * ```tsx
 * export const Route = createFileRoute("/checks")({
 *   pendingComponent: () => <PageSkeleton template="list" />,
 * });
 * ```
 *
 * A status that is busy and named "Loading", so a screen reader hears that
 * something is coming rather than a page of nothing. A table's middle
 * column steps out below the small breakpoint, as a table's does.
 */
export function PageSkeleton(props: PageSkeletonProps) {
  const messages = useArcMessages();
  function cls(): Slots {
    return parts(pageSkeletonStyles(), props.classes);
  }
  function action(): boolean {
    return props.headerAction ?? (props.template !== "record" && props.template !== "settings");
  }
  function rows(fallback: number): number {
    return props.rows ?? fallback;
  }
  return (
    <div
      class={arc(cls().root, props.class, props.className)}
      data-slot="page-skeleton"
      data-template={props.template}
      role="status"
      aria-busy="true"
    >
      <span class={srOnly}>{messages().loading}</span>
      <Show when={props.header !== false}>
        <div class={cls().header} data-slot="page-skeleton-header">
          <div class={cls().titles}>
            <Skeleton class={cls().title} />
            <Skeleton class={cls().line} />
          </div>
          <Show when={action()}>
            <Skeleton class={cls().button} />
          </Show>
        </div>
      </Show>
      <Switch>
        <Match when={props.template === "list"}>
          <div class={cls().section}>
            <div class={cls().toolbar}>
              <Skeleton class={cls().search} />
              <Skeleton class={cls().filters} />
            </div>
            <Table cls={cls()} rows={rows(8)} />
          </div>
        </Match>
        <Match when={props.template === "record"}>
          <Skeleton class={cls().bar} />
          <Strip cls={cls()} />
          <Skeleton class={cls().block} />
          <Section cls={cls()} rows={rows(5)} />
        </Match>
        <Match when={props.template === "dashboard"}>
          <Strip cls={cls()} />
          <Section cls={cls()} rows={3} />
          <Section cls={cls()} rows={rows(5)} />
        </Match>
        <Match when={props.template === "form"}>
          <For each={range(3)}>
            {() => (
              <div class={cls().field}>
                <Skeleton class={cls().label} />
                <Skeleton class={cls().input} />
                <Skeleton class={cls().inputShort} />
              </div>
            )}
          </For>
        </Match>
        <Match when={props.template === "settings"}>
          <For each={range(2)}>
            {() => (
              <div class={cls().card}>
                <div class={cls().cardBody}>
                  <Skeleton class={cls().title} />
                  <Skeleton class={cls().line} />
                  <Skeleton class={cls().cardInput} />
                </div>
                <div class={cls().cardFoot} />
              </div>
            )}
          </For>
        </Match>
        <Match when={props.template === "review"}>
          <Skeleton class={cls().bar} />
          <Strip cls={cls()} />
          <Skeleton class={cls().tabs} />
          <div class={cls().review}>
            <div class={cls().items}>
              <For each={range(rows(6))}>
                {() => (
                  <div class={cls().item}>
                    <Skeleton class={cls().itemIcon} />
                    <div class={cls().itemLines}>
                      <Skeleton class={cls().itemTitle} />
                      <Skeleton class={cls().itemNote} />
                    </div>
                  </div>
                )}
              </For>
            </div>
            <Skeleton class={cls().viewer} />
          </div>
        </Match>
      </Switch>
    </div>
  );
}
