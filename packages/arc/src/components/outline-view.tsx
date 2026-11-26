import { type Child, For, Show } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { ChevronRight } from "@barqjs/lucide/icons/chevron-right";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  bg,
  edge,
  fg,
  gap,
  glyph,
  layout,
  place,
  plainList,
  rounded,
  space,
  tone as tones,
  type,
} from "../style/index.ts";
import type { Tone } from "../theme/tokens.ts";

/** One line of an outline, and the lines set under it. */
export interface OutlineNode {
  id: string;
  label: Child;
  /** Before the label, hidden from assistive tech. */
  icon?: Child;
  /** Colours the line: a block's category, a step's result. */
  tone?: Tone;
  children?: readonly OutlineNode[];
}

export const outlineViewStyles = variants({
  slots: {
    root: arc(plainList, layout.column, gap[1]),
    item: arc(layout.column, gap[1], { alignItems: "flex-start" }),
    line: arc(layout.inlineRow, gap[1.5], type.sm, layout.minZero, {
      maxWidth: "100%",
      overflowWrap: "anywhere",
    }),
    icon: arc(layout.inlineCentre, layout.noShrink, glyph.sm, fg.muted),
    children: arc(plainList, layout.column, gap[1], { paddingInlineStart: space.x6 }),
    separator: arc(layout.inlineCentre, fg.faint, glyph.sm, { "&:dir(rtl)": { rotate: "180deg" } }),
  },
  variants: {
    look: {
      lines: {},
      pills: {
        line: arc(edge.all, rounded.md, bg.muted, place.paddedLine),
      },
    },
    flow: {
      nested: {},
      inline: { root: arc(layout.row, layout.wrap, gap[1.5]), item: arc(layout.row, gap[1.5]) },
    },
    guides: {
      true: {
        children: arc(edge.start, { marginInlineStart: space.x2, paddingInlineStart: space.x4 }),
      },
      false: {},
    },
  },
  defaults: { look: "lines", flow: "nested", guides: false },
});

type Slots = ReturnType<typeof outlineViewStyles>;

export interface OutlineViewProps extends Customisable<Slots> {
  nodes: readonly OutlineNode[];
  /** Names the outline. */
  "aria-label"?: string;
  /** `pills` draws each line as a chip, as blocks of a program are. @default "lines" */
  look?: "lines" | "pills";
  /**
   * `inline` lays the top lines in a row joined by an arrow, for a sequence
   * read along: a route, a row of moves. @default "nested"
   */
  flow?: "nested" | "inline";
  /** A rule down the start edge of each set of lines under another. @default false */
  guides?: boolean;
  /** An ordered list, for lines whose order is their meaning. @default true */
  ordered?: boolean;
  /** Between lines in a row. @default a chevron along the reading direction */
  separator?: Child;
  id?: string;
}

/**
 * A hierarchy to read, not to browse: a program's blocks, a course's units
 * and lessons, a plan's sections.
 *
 * ```tsx
 * <OutlineView
 *   aria-label="Program"
 *   look="pills"
 *   nodes={[
 *     { id: "1", label: "repeat 3 times", children: [{ id: "2", label: "move forward" }] },
 *     { id: "3", label: "turn left" },
 *   ]}
 * />
 * ```
 *
 * Nested lists, each set of lines indented under the line it belongs to on
 * the start edge, so it follows the reading direction; a screen reader
 * hears how deep a line is from the lists themselves. `TreeView` is the one
 * to open, select and move things in; this one only shows them.
 */
export function OutlineView(props: OutlineViewProps) {
  function cls(): Slots {
    return parts(
      outlineViewStyles({
        look: props.look,
        flow: props.flow,
        guides: props.guides === true,
      }),
      props.classes,
    );
  }
  const shared: OutlineShared = { props, cls };
  return (
    <OutlineList
      shared={shared}
      nodes={props.nodes}
      depth={0}
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      label={props["aria-label"]}
    />
  );
}

interface OutlineShared {
  props: OutlineViewProps;
  cls: () => Slots;
}

interface OutlineListProps {
  shared: OutlineShared;
  nodes: readonly OutlineNode[];
  depth: number;
  class: string;
  id?: string;
  label?: string;
}

function OutlineList(props: OutlineListProps) {
  function items() {
    return (
      <For each={() => props.nodes}>
        {(node: OutlineNode, index: () => number) => (
          <OutlineItem
            shared={props.shared}
            node={node}
            depth={props.depth}
            first={index() === 0}
          />
        )}
      </For>
    );
  }
  return (
    <Show
      when={props.shared.props.ordered !== false}
      fallback={
        <ul
          class={props.class}
          id={props.id}
          aria-label={props.label}
          data-slot={props.depth === 0 ? "outline-view" : "outline-view-children"}
        >
          {items()}
        </ul>
      }
    >
      <ol
        class={props.class}
        id={props.id}
        aria-label={props.label}
        data-slot={props.depth === 0 ? "outline-view" : "outline-view-children"}
      >
        {items()}
      </ol>
    </Show>
  );
}

interface OutlineItemProps {
  shared: OutlineShared;
  node: OutlineNode;
  depth: number;
  first: boolean;
}

function OutlineItem(props: OutlineItemProps) {
  const cls = props.shared.cls;
  function inline(): boolean {
    return props.shared.props.flow === "inline" && props.depth === 0;
  }
  return (
    <li class={cls().item} data-slot="outline-view-item" data-depth={String(props.depth)}>
      <Show when={inline() && !props.first}>
        <span class={cls().separator} data-slot="outline-view-separator" aria-hidden="true">
          {props.shared.props.separator ?? <ChevronRight />}
        </span>
      </Show>
      <span
        class={arc(
          cls().line,
          props.node.tone === undefined ? undefined : arc(tones[props.node.tone], fg.tone),
        )}
        data-slot="outline-view-line"
        data-tone={props.node.tone}
        dir="auto"
      >
        <Show when={props.node.icon !== undefined}>
          <span class={cls().icon} data-slot="outline-view-icon" aria-hidden="true">
            {props.node.icon}
          </span>
        </Show>
        {props.node.label}
      </span>
      <Show when={props.node.children !== undefined && props.node.children.length > 0}>
        <OutlineList
          shared={props.shared}
          nodes={props.node.children ?? []}
          depth={props.depth + 1}
          class={cls().children}
        />
      </Show>
    </li>
  );
}
