import { For, Show } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { on } from "@barqjs/ui/conditions";
import { numberFormatter } from "@barqjs/aria/i18n";
import { contrast } from "@barqjs/ui/shared-contrast";
import { srOnly } from "@barqjs/ui/sr-only";
import { tokens } from "@barqjs/ui/theme/tokens";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { plainList } from "../lib/list.ts";
import { navLink } from "../lib/nav.ts";
import {
  bg,
  edge,
  fg,
  focus,
  gap,
  glyph,
  interaction,
  layout,
  motion,
  rounded,
  space,
  target,
  truncate,
  type,
  zIndex,
} from "../style/index.ts";
import type { NavIcon } from "./app-shell.tsx";
import { Indicator } from "./indicator.tsx";
import { type LinkTarget, routerLink } from "./link.ts";
import { useArcMessages } from "./messages.ts";

export interface BottomNavItem extends Partial<LinkTarget> {
  /** Names the item for `selectedKey`, when it is not a route. @default its `to`, else its label */
  id?: string;
  label: string;
  icon?: NavIcon;
  /** A link outside the router. */
  href?: string;
  /** Unread, waiting: pinned to the icon. */
  count?: number;
  /** Something new, without a number. */
  dot?: boolean;
}

export const bottomNavigationStyles = variants({
  slots: {
    root: arc(bg.card, edge.top, {
      insetInline: "0",
      bottom: "0",
      zIndex: zIndex.header,
      paddingBlockEnd: "env(safe-area-inset-bottom)",
      paddingInline: "env(safe-area-inset-left) env(safe-area-inset-right)",
    }),
    list: arc(plainList, layout.row, { alignItems: "stretch" }),
    item: arc(layout.grow, layout.minZero, { display: "flex" }),
    link: arc(
      layout.column,
      layout.centre,
      layout.grow,
      layout.minZero,
      gap[1],
      type.caption,
      type.medium,
      fg.muted,
      focus.visible,
      target.size,
      motion.colours,
      interaction.pressable,
      contrast.selected,
      bg.transparent,
      edge.none,
      navLink,
      {
        paddingBlock: space.x2,
        WebkitTapHighlightColor: "transparent",
        "@media (hover: hover)": { ":hover": { color: tokens.foreground } },
      },
    ),
    icon: arc(layout.inlineCentre, rounded.full, glyph.md, motion.colours, {
      width: space.x14,
      height: space.x8,
      "[aria-current] > &": { backgroundColor: tokens.accent, color: tokens.accentForeground },
    }),
    label: arc(truncate, { maxWidth: "100%" }),
    hint: arc(srOnly),
  },
  variants: {
    position: {
      fixed: { root: arc({ position: "fixed" }) },
      sticky: { root: arc({ position: "sticky" }) },
      static: {},
    },
    hideFrom: {
      sm: { root: arc({ [on.sm]: { display: "none" } }) },
      md: { root: arc({ [on.md]: { display: "none" } }) },
      lg: { root: arc({ [on.lg]: { display: "none" } }) },
      never: {},
    },
  },
  defaults: { position: "fixed", hideFrom: "md" },
});

type Slots = ReturnType<typeof bottomNavigationStyles>;

export interface BottomNavigationProps extends Customisable<Slots> {
  /** Three to five destinations. */
  items: readonly BottomNavItem[];
  /** @default the provider's `mainNavigation`, "Main" */
  "aria-label"?: string;
  /** The current item, for items that are not routes; a route's item is current by location. */
  selectedKey?: string;
  onSelectionChange?: (id: string) => void;
  /** Hidden from this viewport step up, where a sidebar takes over. @default "md" */
  hideFrom?: "sm" | "md" | "lg" | "never";
  /** `fixed` to the viewport's bottom, `sticky` to its scroller's, or in the flow. @default "fixed" */
  position?: "fixed" | "sticky" | "static";
}

const keyOf = (item: BottomNavItem): string => item.id ?? item.to ?? item.href ?? item.label;

/**
 * A phone's tab bar: the app's top destinations along the bottom of the
 * screen, within reach of a thumb.
 *
 * ```tsx
 * <BottomNavigation
 *   items={[
 *     { label: "Home", to: "/", exact: true, icon: House },
 *     { label: "Inbox", to: "/inbox", icon: Inbox, count: unread() },
 *     { label: "Search", to: "/search", icon: Search },
 *     { label: "Account", to: "/account", icon: User },
 *   ]}
 * />
 * ```
 *
 * A navigation landmark of links, each a router link marked current while
 * the location is under it, or buttons with `selectedKey` for views that are
 * not routes. The bar clears a phone's home indicator, every item is a
 * finger's height, and from `hideFrom` up it hides, for the sidebar to take
 * over. A count or a dot is an `Indicator` on the icon.
 */
export function BottomNavigation(props: BottomNavigationProps) {
  const messages = useArcMessages();
  const cls = (): Slots =>
    parts(
      bottomNavigationStyles({ position: props.position, hideFrom: props.hideFrom }),
      props.classes,
    );
  return (
    <nav
      class={arc(cls().root, props.class, props.className)}
      data-slot="bottom-navigation"
      aria-label={props["aria-label"] ?? messages().mainNavigation}
    >
      <ul class={cls().list} data-slot="bottom-navigation-list">
        <For each={() => props.items}>
          {(item: BottomNavItem) => <Entry item={item} classes={cls()} parent={props} />}
        </For>
      </ul>
    </nav>
  );
}

function Entry(props: { item: BottomNavItem; classes: Slots; parent: BottomNavigationProps }) {
  const item = props.item;
  const link = item.to === undefined ? undefined : routerLink({ ...item, to: item.to });
  const current = (): boolean => link?.isActive() ?? props.parent.selectedKey === keyOf(item);
  const Icon = item.icon;
  const messages = useArcMessages();
  const format = numberFormatter();
  const words = (): string | undefined => {
    if (item.dot === true) return messages().newItem;
    if ((item.count ?? 0) <= 0) return undefined;
    return messages().newCount(format().format(item.count ?? 0));
  };
  const content = () => (
    <>
      <span class={props.classes.icon} data-slot="bottom-navigation-icon" aria-hidden="true">
        <Indicator count={item.count} dot={item.dot} size="sm" tone="danger">
          {Icon === undefined ? null : <Icon />}
        </Indicator>
      </span>
      <span class={props.classes.label} data-slot="bottom-navigation-label">
        {item.label}
      </span>
      <Show when={words() !== undefined}>
        <span class={props.classes.hint} data-slot="bottom-navigation-hint">
          {`, ${words() ?? ""}`}
        </span>
      </Show>
    </>
  );
  return (
    <li class={props.classes.item} data-slot="bottom-navigation-item">
      {link !== undefined ? (
        <a
          class={props.classes.link}
          data-slot="bottom-navigation-link"
          href={link.href()}
          aria-current={current() ? "page" : undefined}
          onClick={(event: MouseEvent) => {
            link.onClick(event);
            props.parent.onSelectionChange?.(keyOf(item));
          }}
          onMouseEnter={link.onMouseEnter}
          onMouseLeave={link.onMouseLeave}
        >
          {content()}
        </a>
      ) : item.href !== undefined ? (
        <a
          class={props.classes.link}
          data-slot="bottom-navigation-link"
          href={item.href}
          aria-current={current() ? "page" : undefined}
          onClick={() => props.parent.onSelectionChange?.(keyOf(item))}
        >
          {content()}
        </a>
      ) : (
        <button
          type="button"
          class={props.classes.link}
          data-slot="bottom-navigation-link"
          aria-current={current() ? "page" : undefined}
          onClick={() => props.parent.onSelectionChange?.(keyOf(item))}
        >
          {content()}
        </button>
      )}
    </li>
  );
}
