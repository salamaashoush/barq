import { type Child, Show, createUniqueId } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { Pencil } from "@barqjs/lucide/icons/pencil";
import { Button } from "@barqjs/ui/button";
import { on } from "@barqjs/ui/conditions";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { edge, gap, layout, space, surface } from "../style/index.ts";
import { useArcMessages } from "./messages.ts";
import { PanelToolbar } from "./panel-toolbar.tsx";

// Each column at its content's height, so a sticky rail has room to stay in view.
const column = arc(layout.minZero, gap[6], {
  display: "grid",
  alignContent: "start",
  alignSelf: "start",
});

export const recordLayoutStyles = variants({
  slots: {
    root: arc(layout.track, gap[8]),
    main: column,
    rail: column,
  },
  variants: {
    rail: {
      narrow: {
        root: arc({
          [on.lg]: { gridTemplateColumns: "minmax(0, 1fr) 18.75rem", columnGap: space.x10 },
        }),
      },
      third: {
        root: arc({ [on.lg]: { gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)" } }),
      },
    },
    sticky: {
      true: {
        rail: arc({ [on.lg]: { position: "sticky", top: "var(--arc-sticky-top, 1rem)" } }),
      },
      false: {},
    },
  },
  defaults: { rail: "narrow", sticky: false },
});

type LayoutSlots = ReturnType<typeof recordLayoutStyles>;

export interface RecordLayoutProps extends Customisable<LayoutSlots> {
  /** The record itself: its summary, its tabs, its sections. */
  children?: Child;
  /** The record's facts and links beside the main column from `lg`, under it below. */
  rail?: Child;
  /** Names the rail's landmark. @default the provider's `details` message, "Details" */
  railLabel?: string;
  /**
   * `narrow` is a fixed column of facts beside a wide story; `third` gives
   * the rail a third of the row, for sections as wide as the main column's.
   * @default "narrow"
   */
  railWidth?: "narrow" | "third";
  /**
   * The rail stays in view while the main column scrolls past it, below
   * `--arc-sticky-top` (a sticky top bar's height). For a short rail beside long tabs.
   */
  stickyRail?: boolean;
  id?: string;
}

/**
 * A record's page under its header: the story in the main column and the
 * record's facts in a rail beside it, the rail stacked under the story on a
 * narrower screen.
 *
 * ```tsx
 * <PageHeader heading="INV-0042" facts={…} />
 * <RecordLayout rail={<RecordSection heading="Details"><DescriptionList items={…} /></RecordSection>}>
 *   <RecordSection heading="Lines" onEdit={editLines}>…</RecordSection>
 *   <RecordSection heading="History">…</RecordSection>
 * </RecordLayout>
 * ```
 *
 * The main column keeps its width when the rail has nothing in it, so a
 * page does not shift as a tab changes what the rail shows.
 */
export function RecordLayout(props: RecordLayoutProps) {
  const messages = useArcMessages();
  function cls(): LayoutSlots {
    return parts(
      recordLayoutStyles({ rail: props.railWidth, sticky: props.stickyRail === true }),
      props.classes,
    );
  }
  return (
    <div
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="record-layout"
      data-rail={props.railWidth ?? "narrow"}
    >
      <div class={cls().main} data-slot="record-layout-main">
        {props.children}
      </div>
      <Show when={props.rail !== undefined}>
        <aside
          class={cls().rail}
          data-slot="record-layout-rail"
          aria-label={props.railLabel ?? messages().details}
        >
          {props.rail}
        </aside>
      </Show>
    </div>
  );
}

export const recordSectionStyles = variants({
  slots: {
    root: arc(layout.minZero, layout.container, layout.column, gap[3]),
    header: arc({}),
    edit: arc({}),
    body: arc(layout.minZero),
  },
  variants: {
    variant: {
      card: { root: arc(surface.card, { padding: space.x5, paddingBlockStart: space.x4 }) },
      ruled: { root: arc(edge.top, { paddingBlockStart: space.x6 }) },
      plain: {},
    },
  },
  defaults: { variant: "card" },
});

type SectionSlots = ReturnType<typeof recordSectionStyles>;

export interface RecordSectionProps extends Customisable<SectionSlots> {
  /** The section's `<h2>`. */
  heading: Child;
  description?: Child;
  /** At the end of the header, before Edit. */
  actions?: Child;
  /** A ghost Edit button in the header: the section is read here and changed in a sheet or a page. */
  onEdit?: () => void;
  /** Names what Edit changes: "Edit the contact details". @default "Edit" */
  editLabel?: string;
  /**
   * `card` frames the section, `ruled` separates it from the one above with a
   * line, for a record read as one page, and `plain` draws nothing.
   * @default "card"
   */
  variant?: "card" | "ruled" | "plain";
  /** The anchor a link to the section uses. */
  id?: string;
  children?: Child;
}

/**
 * One titled part of a record: its header, with an Edit button where the
 * reader may change it, over whatever it holds. A `<section>` named by its
 * heading, and a query container, so a `DescriptionList` inside lays out by
 * the section's width in the main column and in the rail alike.
 */
export function RecordSection(props: RecordSectionProps) {
  const headingId = `${props.id ?? createUniqueId()}-heading`;
  function cls(): SectionSlots {
    return parts(recordSectionStyles({ variant: props.variant }), props.classes);
  }
  return (
    <section
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="record-section"
      data-variant={props.variant ?? "card"}
      aria-labelledby={headingId}
    >
      <Show
        when={props.actions !== undefined || props.onEdit !== undefined}
        fallback={
          <PanelToolbar
            class={cls().header}
            data-slot="record-section-header"
            heading={props.heading}
            headingId={headingId}
            description={props.description}
          />
        }
      >
        <PanelToolbar
          class={cls().header}
          data-slot="record-section-header"
          heading={props.heading}
          headingId={headingId}
          description={props.description}
          actions={
            <SectionActions
              actions={props.actions}
              onEdit={props.onEdit}
              editLabel={props.editLabel}
              class={cls().edit}
            />
          }
        />
      </Show>
      <div class={cls().body} data-slot="record-section-body">
        {props.children}
      </div>
    </section>
  );
}

interface SectionActionsProps {
  actions: Child;
  onEdit: (() => void) | undefined;
  editLabel: string | undefined;
  class: string;
}

function SectionActions(props: SectionActionsProps) {
  const messages = useArcMessages();
  return (
    <>
      {props.actions}
      <Show when={props.onEdit !== undefined}>
        <Button
          variant="ghost"
          size="sm"
          class={props.class}
          data-slot="record-section-edit"
          aria-label={props.editLabel}
          onPress={() => props.onEdit?.()}
        >
          <Pencil aria-hidden="true" />
          {messages().edit}
        </Button>
      </Show>
    </>
  );
}
