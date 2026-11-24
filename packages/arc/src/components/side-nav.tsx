import { For, Show, createUniqueId } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { on } from "@barqjs/ui/conditions";
import { tokens } from "@barqjs/ui/theme/tokens";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  fg,
  focus,
  gap,
  glyph,
  interaction,
  layout,
  motion,
  plainList,
  rounded,
  space,
  target,
  truncate,
  type,
} from "../style/index.ts";
import type { NavGroup, NavItem, NavSubItem } from "./app-shell.tsx";
import { routerLink } from "./link.ts";

export const sideNavStyles = variants({
  slots: {
    root: arc(layout.container, layout.column, gap[4], layout.minZero),
    group: arc(layout.column, gap[1]),
    groupLabel: arc(type.meta, type.medium, layout.flush, { paddingInline: space.x2 }),
    list: arc(plainList, layout.column, gap[0.5]),
    sublist: arc(plainList, layout.column, gap[0.5], { paddingInlineStart: space.x6 }),
    item: arc({}),
    link: arc(
      layout.row,
      layout.minZero,
      gap[2],
      glyph.md,
      rounded.md,
      type.sm,
      fg.muted,
      focus.visible,
      motion.colours,
      target.size,
      interaction.hoverText,
      type.navLink,
      {
        paddingInline: space.x2,
        minHeight: space.x9,
        "@media (hover: hover)": { ":hover": { backgroundColor: tokens.muted } },
        "[aria-current]": {
          backgroundColor: tokens.muted,
          fontWeight: "var(--font-weight-medium)",
        },
      },
    ),
    label: arc(truncate, layout.grow),
    badge: arc(type.meta, type.numeric, layout.noShrink),
  },
  variants: {
    collapse: {
      scroll: {
        root: arc({
          [on.cqBelowSm]: { flexDirection: "row", overflowX: "auto", gap: space.x1 },
        }),
        group: arc({ [on.cqBelowSm]: { flexDirection: "row", flex: "0 0 auto" } }),
        groupLabel: arc({ [on.cqBelowSm]: { display: "none" } }),
        list: arc({ [on.cqBelowSm]: { flexDirection: "row" } }),
        sublist: arc({ [on.cqBelowSm]: { display: "none" } }),
        link: arc({ [on.cqBelowSm]: { whiteSpace: "nowrap" } }),
      },
      never: {},
    },
  },
  defaults: { collapse: "scroll" },
});

type Slots = ReturnType<typeof sideNavStyles>;

export interface SideNavProps extends Customisable<Slots> {
  /** The same data as `AppShell`'s navigation: groups of router links. */
  navigation: readonly NavGroup[];
  /** Names the landmark. Required: a page's own navigation sits beside the app's. */
  "aria-label": string;
  /** Across a narrow container the groups become one row that scrolls, or stay a column. @default "scroll" */
  collapse?: "scroll" | "never";
  id?: string;
}

/**
 * A page's own navigation, outside `AppShell`: the sections of a settings
 * area, a record's pages, a docs chapter's.
 *
 * ```tsx
 * <SideNav
 *   aria-label="Settings"
 *   navigation={[
 *     { label: "Account", items: [{ label: "Profile", to: "/settings/profile" }] },
 *     { label: "Workspace", items: [{ label: "Members", to: "/settings/members", badge: "4" }] },
 *   ]}
 * />
 * ```
 *
 * The data is `AppShell`'s, so a section moves from one to the other
 * unchanged: each item a router link marked current while the location is
 * under it, its badge read after its label, one level of links below it.
 * Across a narrow container the groups run as one row that scrolls sideways
 * under a finger, their labels and sub-links left out.
 */
export function SideNav(props: SideNavProps) {
  function cls(): Slots {
    return parts(sideNavStyles({ collapse: props.collapse }), props.classes);
  }
  return (
    <nav
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="side-nav"
      aria-label={props["aria-label"]}
    >
      <For each={() => props.navigation}>
        {(group: NavGroup) => <Group group={group} classes={cls()} />}
      </For>
    </nav>
  );
}

interface GroupProps {
  group: NavGroup;
  classes: Slots;
}

function Group(props: GroupProps) {
  const labelId = createUniqueId();
  return (
    <div class={props.classes.group} data-slot="side-nav-group">
      <Show when={props.group.label !== undefined}>
        <h2 class={props.classes.groupLabel} id={labelId} data-slot="side-nav-group-label">
          {props.group.label}
        </h2>
      </Show>
      <ul
        class={props.classes.list}
        data-slot="side-nav-list"
        aria-labelledby={props.group.label === undefined ? undefined : labelId}
      >
        <For each={() => props.group.items}>
          {(item: NavItem) => <Entry item={item} classes={props.classes} />}
        </For>
      </ul>
    </div>
  );
}

interface EntryProps {
  item: NavItem | NavSubItem;
  classes: Slots;
}

function Entry(props: EntryProps) {
  const item = props.item;
  const link = item.to === undefined ? undefined : routerLink({ ...item, to: item.to });
  const badgeId = createUniqueId();
  const own = item as NavItem;
  const Icon = own.icon;
  return (
    <li class={props.classes.item} data-slot="side-nav-item">
      <Show
        when={link !== undefined}
        fallback={
          <span class={props.classes.groupLabel} data-slot="side-nav-heading">
            {item.label}
          </span>
        }
      >
        <a
          class={props.classes.link}
          data-slot="side-nav-link"
          href={link?.href()}
          aria-current={link?.isActive() === true ? "page" : undefined}
          aria-describedby={own.badge === undefined ? undefined : badgeId}
          onClick={(event: MouseEvent) => link?.onClick(event)}
          onMouseEnter={(event: MouseEvent) => link?.onMouseEnter(event)}
          onMouseLeave={(event: MouseEvent) => link?.onMouseLeave(event)}
        >
          {Icon === undefined ? null : <Icon />}
          <span class={props.classes.label} data-slot="side-nav-label">
            {item.label}
          </span>
          <Show when={own.badge !== undefined}>
            <span
              class={props.classes.badge}
              id={badgeId}
              data-slot="side-nav-badge"
              aria-hidden="true"
            >
              {own.badge}
            </span>
          </Show>
        </a>
      </Show>
      <Show when={own.items !== undefined && own.items.length > 0}>
        <ul class={props.classes.sublist} data-slot="side-nav-sublist">
          <For each={() => own.items ?? []}>
            {(child: NavSubItem) => <Entry item={child} classes={props.classes} />}
          </For>
        </ul>
      </Show>
    </li>
  );
}
