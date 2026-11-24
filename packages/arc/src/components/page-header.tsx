import { type Child, Show, cells } from "@barqjs/core";
import { variants } from "@barqjs/css";
import type { UiProps } from "@barqjs/ui/props";
import { type RenderPart, uiProps } from "@barqjs/ui/slot";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts, rendered } from "../lib/parts.ts";
import { fg, gap, layout, space, type } from "../style/index.ts";

export const pageHeaderStyles = variants({
  slots: {
    root: arc(layout.row, layout.wrap, layout.between, gap[4], {
      alignItems: "flex-end",
      paddingBlockEnd: space.x4,
    }),
    text: arc(layout.column, layout.minZero, gap[1], { flex: "1 1 18rem" }),
    title: arc(type.title),
    description: arc(type.body, fg.muted),
    actions: arc(layout.row, layout.wrap, gap[2]),
  },
});

type Slots = ReturnType<typeof pageHeaderStyles>;

export interface PageHeaderProps extends Omit<UiProps, "class" | "className">, Customisable<Slots> {
  /** The page's `<h1>`. Not `title`, which is the attribute every element takes. */
  heading: Child;
  description?: Child;
  /** Above the title: a breadcrumb, a back link, an eyebrow. */
  leading?: Child;
  /** At the end of the row, wrapping below the title on a narrow screen. */
  actions?: Child;
  /** Another element for the title or the line under it: an `<h2>` on a page inside a page. */
  renders?: { title?: RenderPart<Child>; description?: RenderPart<Child> };
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
 */
export function PageHeader(props: PageHeaderProps) {
  const cls = (): Slots => parts(pageHeaderStyles(), props.classes);
  const title = props.renders?.title;
  const description = props.renders?.description;
  return (
    <header {...uiProps("page-header", () => cls().root, cells(props))}>
      <div class={cls().text} data-slot="page-header-text">
        <Show when={props.leading}>{props.leading}</Show>
        {title === undefined ? (
          <h1 class={cls().title} data-slot="page-header-title">
            {props.heading}
          </h1>
        ) : (
          rendered(title, { class: cls().title, "data-slot": "page-header-title" }, props.heading)
        )}
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
      </div>
      <Show when={props.actions}>
        <div class={cls().actions} data-slot="page-header-actions">
          {props.actions}
        </div>
      </Show>
    </header>
  );
}
