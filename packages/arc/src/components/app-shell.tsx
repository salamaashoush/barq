import {
  type Child,
  For,
  type JSXElement,
  Show,
  createSignal,
  createUniqueId,
  untrack,
} from "@barqjs/core";
import { ChevronDown } from "@barqjs/lucide/icons/chevron-down";
import type { UiProps } from "@barqjs/ui/props";
import { Separator } from "@barqjs/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  type SidebarSide,
  SidebarTrigger,
  type SidebarVariant,
  useSidebar,
} from "@barqjs/ui/sidebar";
import { getRequestEvent, isServer } from "@barqjs/web";

import { arcLayer as arc } from "../layer.ts";
import { Breadcrumbs } from "./breadcrumbs.tsx";
import { type LinkTarget, routerLink } from "./link.ts";

/** The cookie ui's `SidebarProvider` writes the open state to. */
const SIDEBAR_COOKIE = "sidebar_state";

/** An icon component, `@barqjs/lucide`'s or one of the same shape. */
export type NavIcon = (props: Record<string, never>) => JSXElement;

export interface NavItem extends Partial<LinkTarget> {
  label: string;
  icon?: NavIcon;
  /** Beside the label, and read after it: a count, a "new". Hidden while collapsed to icons. */
  badge?: Child;
  /**
   * One level of links below this one. With no `to` of its own the item is a
   * button that shows and hides them.
   */
  items?: readonly NavSubItem[];
}

export interface NavSubItem extends LinkTarget {
  label: string;
}

export interface NavGroup {
  /** Shown above the group and names it; left out for the first, unlabelled group. */
  label?: string;
  items: readonly NavItem[];
}

export interface AppShellProps extends UiProps {
  /** The sidebar's navigation, as data. */
  navigation: readonly NavGroup[];
  /** The top of the sidebar: the product's mark, a workspace switcher. */
  header?: Child;
  /** The foot of the sidebar: the account menu. */
  footer?: Child;
  /** The top bar's trail. Left out, the matched routes' `<Breadcrumbs />`. */
  trail?: Child;
  /** The top bar's end: search, notifications, the theme. */
  actions?: Child;
  /**
   * Open at first. Left out, the sidebar opens as the reader left it, from the
   * cookie it keeps, which the server reads too.
   */
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** @default "icon" */
  collapsible?: "icon" | "offcanvas" | "none";
  /** @default "sidebar" */
  variant?: SidebarVariant;
  /** @default "left", which is the start side's edge in a left-to-right page */
  side?: SidebarSide;
  /** Names the sidebar's navigation landmark. @default "Main" */
  navigationLabel?: string;
  /** The link to the page past the navigation, shown on focus. @default "Skip to content" */
  skipLabel?: string;
}

const skip = arc({
  position: "fixed",
  insetInlineStart: "calc(var(--spacing) * 2)",
  top: "calc(var(--spacing) * 2)",
  zIndex: "var(--z-toast, 60)",
  borderRadius: "var(--radius)",
  backgroundColor: "var(--background)",
  color: "var(--foreground)",
  paddingInline: "calc(var(--spacing) * 3)",
  paddingBlock: "calc(var(--spacing) * 2)",
  fontSize: "var(--text-sm)",
  boxShadow: "0 0 0 2px var(--ring)",
  translate: "0 calc(-100% - var(--spacing) * 4)",
  ":focus": { translate: "0 0" },
  ":focus-visible": { translate: "0 0" },
});

const nav = arc({
  display: "flex",
  flexDirection: "column",
  gap: "calc(var(--spacing) * 2)",
});

const label = arc({
  flex: "1",
  minWidth: "0px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const chevron = arc({
  flexShrink: "0",
  marginInlineStart: "auto",
  transitionProperty: "rotate",
  transitionDuration: "var(--duration-fast, 150ms)",
  '[aria-expanded="false"] > &': { rotate: "-90deg" },
  '[aria-expanded="false"] > &:dir(rtl)': { rotate: "90deg" },
  "@media (prefers-reduced-motion: reduce)": { transitionDuration: "0s" },
});

const inset = arc({
  minWidth: "0px",
});

const topBar = arc({
  position: "sticky",
  top: "0px",
  zIndex: "var(--z-header, 20)",
  display: "flex",
  height: "calc(var(--spacing) * 14)",
  flexShrink: "0",
  alignItems: "center",
  gap: "calc(var(--spacing) * 2)",
  borderBlockEndWidth: "1px",
  borderBlockEndStyle: "solid",
  borderColor: "var(--border)",
  backgroundColor: "var(--background)",
  paddingInline: "calc(var(--spacing) * 4)",
});

const divider = arc({
  height: "calc(var(--spacing) * 4)",
});

const trailBox = arc({
  display: "flex",
  minWidth: "0px",
  flex: "1",
  alignItems: "center",
});

const actionsBox = arc({
  display: "flex",
  flexShrink: "0",
  alignItems: "center",
  gap: "calc(var(--spacing) * 2)",
});

const main = arc({
  display: "flex",
  minWidth: "0px",
  flex: "1",
  flexDirection: "column",
  outlineStyle: "none",
});

/** A cookie's value from a `Cookie` header or `document.cookie`. */
function readCookie(header: string | null | undefined, key: string): string | undefined {
  if (header === null || header === undefined || header === "") return undefined;
  for (const part of header.split(";")) {
    const at = part.indexOf("=");
    if (at === -1 || part.slice(0, at).trim() !== key) continue;
    try {
      return decodeURIComponent(part.slice(at + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function rememberedOpen(): boolean {
  const header = isServer
    ? getRequestEvent()?.request.headers.get("cookie")
    : typeof document === "undefined"
      ? undefined
      : document.cookie;
  return readCookie(header, SIDEBAR_COOKIE) !== "false";
}

/**
 * The frame of every page of an app: a sidebar of navigation beside the page,
 * with a top bar over it.
 *
 * ```tsx
 * <AppShell
 *   header={<WorkspaceSwitcher />}
 *   footer={<AccountMenu />}
 *   actions={<ThemeToggle />}
 *   navigation={[
 *     { items: [{ label: "Overview", to: "/", exact: true, icon: House }] },
 *     { label: "Projects", items: [{ label: "All projects", to: "/projects", icon: Folder }] },
 *   ]}
 * >
 *   <Outlet />
 * </AppShell>
 * ```
 *
 * The sidebar collapses to its icons (`Cmd/Ctrl+B` or the trigger), opens as
 * it was left, and is a sheet on a narrow screen that closes once a page is
 * chosen in it. Each item is a router link, marked current while the
 * location is under it.
 */
export function AppShell(props: AppShellProps) {
  const mainId = createUniqueId();
  const initiallyOpen = untrack(() => props.defaultOpen) ?? rememberedOpen();

  return (
    <SidebarProvider
      {...props}
      data-slot={props["data-slot"] ?? "app-shell"}
      defaultOpen={initiallyOpen}
      open={props.open}
      onOpenChange={props.onOpenChange}
    >
      <a href={`#${mainId}`} class={skip} data-slot="app-shell-skip">
        {props.skipLabel ?? "Skip to content"}
      </a>
      <Sidebar
        collapsible={props.collapsible ?? "icon"}
        variant={props.variant ?? "sidebar"}
        side={props.side ?? "left"}
      >
        <Show when={props.header}>
          <SidebarHeader>{props.header}</SidebarHeader>
        </Show>
        <SidebarContent>
          <nav class={nav} data-slot="app-shell-nav" aria-label={props.navigationLabel ?? "Main"}>
            <For each={props.navigation}>{(group: NavGroup) => <NavGroupView group={group} />}</For>
          </nav>
        </SidebarContent>
        <Show when={props.footer}>
          <SidebarFooter>{props.footer}</SidebarFooter>
        </Show>
        <SidebarRail />
      </Sidebar>
      <SidebarInset class={inset}>
        <header class={topBar} data-slot="app-shell-top-bar">
          <SidebarTrigger />
          <Separator orientation="vertical" class={divider} />
          <div class={trailBox} data-slot="app-shell-trail">
            {props.trail === undefined ? <Breadcrumbs /> : props.trail}
          </div>
          <Show when={props.actions}>
            <div class={actionsBox} data-slot="app-shell-actions">
              {props.actions}
            </div>
          </Show>
        </header>
        <div id={mainId} tabIndex={-1} class={main} data-slot="app-shell-main">
          {props.children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function NavGroupView(props: { group: NavGroup }) {
  const labelId = createUniqueId();
  const group = props.group;
  return (
    <SidebarGroup
      role={group.label === undefined ? undefined : "group"}
      aria-labelledby={group.label === undefined ? undefined : labelId}
    >
      <Show when={group.label !== undefined}>
        <SidebarGroupLabel id={labelId}>{group.label}</SidebarGroupLabel>
      </Show>
      <SidebarMenu>
        <For each={group.items}>{(item: NavItem) => <NavEntry item={item} />}</For>
      </SidebarMenu>
    </SidebarGroup>
  );
}

/** A narrow screen's sheet closes once a page is chosen in it. */
function closeSheet(sidebar: ReturnType<typeof useSidebar>): void {
  if (sidebar.isMobile()) sidebar.setOpenMobile(false);
}

function NavEntry(props: { item: NavItem }) {
  const sidebar = useSidebar();
  const item = props.item;
  const badgeId = createUniqueId();
  const subId = createUniqueId();
  const Icon = item.icon;
  const [expanded, setExpanded] = createSignal(true);
  const link = item.to === undefined ? undefined : routerLink({ ...item, to: item.to });
  const disclosure = link === undefined && item.items !== undefined;
  const describedBy = item.badge === undefined ? undefined : badgeId;

  return (
    <SidebarMenuItem>
      {link === undefined ? (
        <SidebarMenuButton
          tooltip={item.label}
          aria-expanded={disclosure ? (expanded() ? "true" : "false") : undefined}
          aria-controls={disclosure ? subId : undefined}
          aria-describedby={describedBy}
          onClick={() => setExpanded((open) => !open)}
        >
          {Icon === undefined ? null : <Icon />}
          <span class={label}>{item.label}</span>
          {disclosure ? <ChevronDown class={chevron} aria-hidden="true" /> : null}
        </SidebarMenuButton>
      ) : (
        <SidebarMenuButton
          tooltip={item.label}
          href={link.href()}
          isActive={link.isActive()}
          aria-current={link.isActive() ? "page" : undefined}
          aria-describedby={describedBy}
          onClick={(event: MouseEvent) => {
            link.onClick(event);
            closeSheet(sidebar);
          }}
          onMouseEnter={link.onMouseEnter}
          onMouseLeave={link.onMouseLeave}
        >
          {Icon === undefined ? null : <Icon />}
          <span class={label}>{item.label}</span>
        </SidebarMenuButton>
      )}
      <Show when={item.badge !== undefined}>
        <SidebarMenuBadge id={badgeId}>{item.badge}</SidebarMenuBadge>
      </Show>
      <Show when={item.items !== undefined && item.items.length > 0}>
        <SidebarMenuSub id={subId} hidden={disclosure && !expanded()}>
          <For each={item.items ?? []}>
            {(child: NavSubItem) => <NavSubEntry item={child} sidebar={sidebar} />}
          </For>
        </SidebarMenuSub>
      </Show>
    </SidebarMenuItem>
  );
}

function NavSubEntry(props: { item: NavSubItem; sidebar: ReturnType<typeof useSidebar> }) {
  const item = props.item;
  const sidebar = props.sidebar;
  const link = routerLink(item);
  return (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton
        href={link.href()}
        isActive={link.isActive()}
        aria-current={link.isActive() ? "page" : undefined}
        onClick={(event: MouseEvent) => {
          link.onClick(event);
          closeSheet(sidebar);
        }}
        onMouseEnter={link.onMouseEnter}
        onMouseLeave={link.onMouseLeave}
      >
        <span class={label}>{item.label}</span>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  );
}
