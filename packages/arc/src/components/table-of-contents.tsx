import { For, Show, createEffect } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { controllable } from "@barqjs/aria/utils";
import { tokens } from "@barqjs/ui/theme/tokens";
import { isServer } from "@barqjs/web";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  edge,
  fg,
  focus,
  gap,
  interaction,
  layout,
  motion,
  plainList,
  rounded,
  space,
  type,
} from "../style/index.ts";
import { useArcMessages } from "./messages.ts";

export interface TocItem {
  /** The `id` of the section's element, which the link points at. */
  id: string;
  label: string;
  /** Sections under this one, indented. */
  items?: readonly TocItem[];
}

export const tableOfContentsStyles = variants({
  slots: {
    root: arc(layout.column, gap[2], type.sm),
    title: arc(type.label, layout.flush),
    list: arc(plainList, layout.column, edge.start),
    nested: arc(plainList, layout.column),
    item: arc({}),
    link: arc(
      layout.inlineRow,
      rounded.xs,
      fg.muted,
      focus.visible,
      motion.colours,
      interaction.hoverText,
      type.navLink,
      {
        marginInlineStart: "-1px",
        paddingBlock: space.x1,
        paddingInlineStart: "calc(var(--spacing) * 3 * var(--arc-toc-depth, 1))",
        paddingInlineEnd: space.x2,
        borderInlineStartWidth: "2px",
        borderInlineStartStyle: "solid",
        borderInlineStartColor: "transparent",
        "[aria-current]": { borderInlineStartColor: tokens.primary },
      },
    ),
  },
  variants: {
    sticky: {
      true: { root: arc(layout.sticky, { insetBlockStart: space.x4, alignSelf: "flex-start" }) },
      false: {},
    },
  },
  defaults: { sticky: false },
});

type Slots = ReturnType<typeof tableOfContentsStyles>;

export interface TableOfContentsProps extends Customisable<Slots> {
  items: readonly TocItem[];
  /** Above the list, and the landmark's name. @default the provider's `onThisPage`, "On this page" */
  title?: string;
  /** The section shown as current. Left out, the one being read, as the page scrolls. */
  activeId?: string;
  onActiveChange?: (id: string) => void;
  /** How far below the top of the viewport a section counts as reached, in pixels: a sticky header's height. @default 0 */
  offset?: number;
  /** Held in view beside the content as the page scrolls. */
  sticky?: boolean;
  id?: string;
}

interface FlatTocItem {
  item: TocItem;
  depth: number;
}

/** Every item, depth first, with how deep it is. */
function flatten(items: readonly TocItem[], depth = 1): FlatTocItem[] {
  return items.flatMap((item) => [{ item, depth }, ...flatten(item.items ?? [], depth + 1)]);
}

/**
 * The sections of a long page as links, the one being read marked as the
 * page scrolls.
 *
 * ```tsx
 * <TableOfContents
 *   sticky
 *   offset={64}
 *   items={[
 *     { id: "install", label: "Install" },
 *     { id: "usage", label: "Usage", items: [{ id: "options", label: "Options" }] },
 *   ]}
 * />
 * ```
 *
 * A navigation landmark of plain `#id` links, so the browser scrolls, keeps
 * the address and moves focus as it always does, and the section being read
 * carries `aria-current="location"`. The section that counts is the last one
 * whose top has passed `offset`, worked out by an `IntersectionObserver`; the
 * server marks none.
 */
export function TableOfContents(props: TableOfContentsProps) {
  const messages = useArcMessages();
  const [active, setActive] = controllable<string | undefined>(
    () => props.activeId,
    () => undefined,
    (next) => {
      if (next !== undefined) props.onActiveChange?.(next);
    },
  );
  function ids(): string[] {
    return flatten(props.items).map((one) => one.item.id);
  }

  if (!isServer) {
    createEffect(
      () => [ids(), props.offset ?? 0] as const,
      ([all, offset]) => {
        if (typeof IntersectionObserver === "undefined") return undefined;
        const targets = all
          .map((id) => document.getElementById(id))
          .filter((one): one is HTMLElement => one !== null);
        if (targets.length === 0) return undefined;
        const passed = new Set<string>();
        const observer = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              const id = entry.target.id;
              const above = entry.boundingClientRect.top < offset + 1;
              if (entry.isIntersecting || above) passed.add(id);
              else passed.delete(id);
            }
            const reached = all.filter((id) => passed.has(id));
            const current = reached.at(-1) ?? all[0];
            if (current !== undefined && current !== active()) setActive(current);
          },
          { rootMargin: `-${String(offset)}px 0px -60% 0px`, threshold: [0, 1] },
        );
        for (const target of targets) observer.observe(target);
        return () => observer.disconnect();
      },
    );
  }

  function cls(): Slots {
    return parts(tableOfContentsStyles({ sticky: props.sticky === true }), props.classes);
  }
  function title(): string {
    return props.title ?? messages().onThisPage;
  }
  function list(items: readonly TocItem[], depth: number) {
    return (
      <For each={() => items}>
        {(item: TocItem) => (
          <li class={cls().item} data-slot="table-of-contents-item">
            <a
              class={cls().link}
              data-slot="table-of-contents-link"
              href={`#${item.id}`}
              style={{ "--arc-toc-depth": String(depth) }}
              aria-current={active() === item.id ? "location" : undefined}
              onClick={() => setActive(item.id)}
            >
              {item.label}
            </a>
            <Show when={item.items !== undefined && item.items.length > 0}>
              <ul class={cls().nested} data-slot="table-of-contents-nested">
                {list(item.items ?? [], depth + 1)}
              </ul>
            </Show>
          </li>
        )}
      </For>
    );
  }

  return (
    <nav
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="table-of-contents"
      aria-label={title()}
    >
      <p class={cls().title} data-slot="table-of-contents-title" aria-hidden="true">
        {title()}
      </p>
      <ul class={cls().list} data-slot="table-of-contents-list">
        {list(props.items, 1)}
      </ul>
    </nav>
  );
}
