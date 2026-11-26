import { type Child, Show, cells } from "@barqjs/core";
import { variants } from "@barqjs/css";
import type { UiProps } from "@barqjs/ui/props";
import { type RenderPart, uiProps } from "@barqjs/ui/slot";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts, rendered } from "../lib/parts.ts";
import { fg, gap, layout, space, type } from "../style/index.ts";

export const panelToolbarStyles = variants({
  slots: {
    root: arc(layout.row, layout.wrap, layout.between, gap[2], {
      columnGap: space.x4,
      minHeight: space.x8,
    }),
    text: arc(layout.column, layout.minZero, gap[0.5], { flex: "1 1 16rem" }),
    heading: arc(type.heading),
    description: arc(type.body, fg.muted, { maxWidth: "72ch" }),
    actions: arc(layout.row, layout.wrap, gap[2]),
  },
});

type Slots = ReturnType<typeof panelToolbarStyles>;

export interface PanelToolbarRenders {
  heading?: RenderPart<Child>;
  description?: RenderPart<Child>;
}

export interface PanelToolbarProps
  extends Omit<UiProps, "class" | "className">, Customisable<Slots> {
  /** The section's `<h2>`. Leave it out in a tab panel the tab already names. */
  heading?: Child;
  /** What the panel or section holds. */
  description?: Child;
  /** At the end of the row, wrapping under the text when the row is narrow: filters, actions. */
  actions?: Child;
  /** The heading's id, for a `<section aria-labelledby>` around it. */
  headingId?: string;
  /** Another element for the heading or the line under it: an `<h3>` in a nested section. */
  renders?: PanelToolbarRenders;
}

/**
 * The row that opens a tab panel or a section of a page: what it is, a line
 * about it, and its own filters or actions at the end. `PageHeader` is the
 * page's `<h1>`; this is everything under it.
 *
 * ```tsx
 * <PanelToolbar
 *   description="Runners that picked up work in the last hour."
 *   actions={<Button size="sm" onPress={add}>Add runner</Button>}
 * />
 * <PanelToolbar heading="Keys" headingId="keys" actions={<Button size="sm">New key</Button>} />
 * ```
 */
export function PanelToolbar(props: PanelToolbarProps) {
  function cls(): Slots {
    return parts(panelToolbarStyles(), props.classes);
  }
  const heading = props.renders?.heading;
  const description = props.renders?.description;
  return (
    <div {...uiProps("panel-toolbar", () => cls().root, cells(props))}>
      <div class={cls().text} data-slot="panel-toolbar-text">
        <Show when={props.heading !== undefined}>
          {heading === undefined ? (
            <h2 id={props.headingId} class={cls().heading} data-slot="panel-toolbar-heading">
              {props.heading}
            </h2>
          ) : (
            rendered(
              heading,
              {
                class: cls().heading,
                "data-slot": "panel-toolbar-heading",
                ...(props.headingId === undefined ? {} : { id: props.headingId }),
              },
              props.heading,
            )
          )}
        </Show>
        <Show when={props.description !== undefined}>
          {description === undefined ? (
            <p class={cls().description} data-slot="panel-toolbar-description">
              {props.description}
            </p>
          ) : (
            rendered(
              description,
              { class: cls().description, "data-slot": "panel-toolbar-description" },
              props.description,
            )
          )}
        </Show>
      </div>
      <Show when={props.actions !== undefined}>
        <div class={cls().actions} data-slot="panel-toolbar-actions">
          {props.actions}
        </div>
      </Show>
    </div>
  );
}
