import { type Child, For, Show, createEffect, createSignal, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import type { Key } from "@barqjs/aria/collections";
import { useDirection } from "@barqjs/aria/i18n";
import { overflowItems } from "@barqjs/aria/overflow";
import { controllable } from "@barqjs/aria/utils";
import { ChevronDown } from "@barqjs/lucide/icons/chevron-down";
import { ChevronLeft } from "@barqjs/lucide/icons/chevron-left";
import { ChevronRight } from "@barqjs/lucide/icons/chevron-right";
import { Pin } from "@barqjs/lucide/icons/pin";
import { X } from "@barqjs/lucide/icons/x";
import { announce } from "@barqjs/aria/live";
import { ref as makeRef } from "@barqjs/primitives/refs";
import { Button, buttonVariants } from "@barqjs/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@barqjs/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@barqjs/ui/dropdown-menu";
import { icon } from "@barqjs/ui/shared-icon";
import { Tabs, TabsContent, TabsList, type TabsListVariant, TabsTrigger } from "@barqjs/ui/tabs";
import { tokens } from "@barqjs/ui/theme/tokens";
import { isServer } from "@barqjs/web";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { type SearchParamState, useSearchParam } from "../lib/search-state.ts";
import {
  control,
  fg,
  gap,
  glyph,
  interaction,
  layout,
  motion,
  rounded,
  square,
} from "../style/index.ts";
import { Indicator } from "./indicator.tsx";
import { maybeRouter } from "./link.ts";
import { useArcMessages } from "./messages.ts";

export interface TabItem {
  id: string;
  label: string;
  /** Before the label. Hidden from assistive tech. */
  icon?: Child;
  /** A count after the label: unread, open, failing. */
  count?: number;
  isDisabled?: boolean;
  /** A tab that is a link: a route of its own. */
  href?: string;
  /** Left out of the row: a tab that does not apply to this record, rather than one disabled. */
  hidden?: boolean;
  /** Changes not saved yet: a dot where its close button is, and said in its name. */
  dirty?: boolean;
  /** Kept out of the closes that take several tabs, with a pin where its close button would be. */
  pinned?: boolean;
  /** @default true while the tabs have `onClose` and it is not pinned */
  closable?: boolean;
  /** What a resting pointer shows: a file's whole path. */
  title?: string;
}

export const responsiveTabsStyles = variants({
  slots: {
    root: arc(layout.minZero, {
      "&[data-fill]": { height: "100%", minHeight: "0px" },
    }),
    bar: arc(layout.row, layout.minZero, gap[1], { width: "100%" }),
    viewport: arc(layout.grow, layout.minZero, layout.scrollInline, {
      overflowY: "hidden",
      overscrollBehaviorInline: "contain",
      scrollSnapType: "x proximity",
      "::-webkit-scrollbar": { display: "none" },
    }),
    list: arc({ width: "max-content", minWidth: "100%", justifyContent: "flex-start" }),
    tab: arc(glyph.md, {
      flex: "0 0 auto",
      scrollSnapAlign: "start",
      "[data-drop]::before": {
        content: '""',
        position: "absolute",
        insetBlock: "0px",
        width: "2px",
        backgroundColor: tokens.ring,
      },
      "[data-drop=before]::before": { insetInlineStart: "0px" },
      "[data-drop=after]::before": { insetInlineEnd: "0px" },
    }),
    strip: arc({ display: "contents" }),
    close: arc(
      control.bare,
      layout.inlineCentre,
      layout.noShrink,
      rounded.sm,
      fg.muted,
      glyph.sm,
      square.x4,
      interaction.hover,
      {
        marginInlineEnd: "calc(var(--spacing) * -0.5)",
        "&[data-dirty] > svg": { display: "none" },
        ":is(:hover, :focus-visible) > &[data-dirty] > svg": { display: "inline" },
        ":is(:hover, :focus-visible) > &[data-dirty] > [data-slot=responsive-tabs-dirty]": {
          display: "none",
        },
      },
    ),
    dirty: arc(rounded.full, { width: "8px", height: "8px", backgroundColor: "currentColor" }),
    pin: arc(layout.inlineCentre, layout.noShrink, fg.muted, glyph.sm),
    icon: arc(layout.inlineCentre),
    count: arc({}),
    scroll: arc(layout.noShrink, motion.colours, {
      "[data-hidden]": { visibility: "hidden" },
    }),
    more: arc(layout.noShrink, gap[1]),
    menuItem: arc(gap[2]),
    // A kept panel is `hidden`; the flex layout applies only to the shown one,
    // so it never outranks the attribute.
    panel: arc({
      "[data-fill] > &:not([hidden])": {
        display: "flex",
        flexDirection: "column",
        flex: "1 1 0",
        minHeight: "0px",
      },
    }),
  },
});

type Slots = ReturnType<typeof responsiveTabsStyles>;

export interface ResponsiveTabsProps extends Customisable<Slots> {
  items: readonly TabItem[];
  /** Names the tab list. */
  "aria-label": string;
  selectedKey?: string;
  defaultSelectedKey?: string;
  onSelectionChange?: (id: string) => void;
  /** The selected tab's panel. Leave it out for tabs that are links with their own pages. */
  children?: (item: TabItem) => Child;
  /**
   * What happens to tabs that do not fit: `menu` moves the last of them into
   * a More menu, `scroll` lets the row scroll with a button at each end.
   * @default "menu"
   */
  overflow?: "menu" | "scroll";
  /** @default "line" */
  variant?: TabsListVariant;
  /** `manual` waits for Enter or Space before a focused tab opens. @default "automatic" */
  keyboardActivation?: "automatic" | "manual";
  /**
   * Read once: the search parameter that holds the selected tab, so a tab has
   * a link and a reload or Back returns to it. The first tab is the one the
   * URL leaves out.
   */
  param?: string;
  /**
   * Search parameters that belong to the page rather than to a tab, such as a
   * time window: a tab that is a link carries them to the next tab, while
   * each tab's own (its filters, its page) are kept for when the reader comes back.
   */
  shared?: readonly string[];
  /** Keep every tab's panel in the document, hidden, so its state survives switching away. */
  keepMounted?: boolean;
  /** Take the whole height of the parent, the selected panel the rest of it below the tabs: a workbench's bottom panel. */
  fill?: boolean;
  id?: string;
  /**
   * Tabs close: a close button on each, a middle click, Delete on a focused
   * tab, and Close others, Close the ones after and Close all in its menu.
   * Called with the tabs to close; a closed tab that was selected hands the
   * selection to its neighbour first.
   */
  onClose?: (ids: string[]) => void;
  /**
   * Tabs move: dragged, Ctrl+Shift+Page Up or Page Down (or Alt+Shift and an
   * arrow) on a focused tab, or Move earlier and Move later in its menu.
   * Called with every tab's id in the new order. Pinned tabs stay before
   * the rest.
   */
  onReorder?: (ids: string[]) => void;
  /** Pin and Unpin in a tab's menu. */
  onPinnedChange?: (id: string, pinned: boolean) => void;
}

type TabAction =
  | "close"
  | "close-others"
  | "close-after"
  | "close-all"
  | "pin"
  | "unpin"
  | "earlier"
  | "later";

interface TabMenuItem {
  id: TabAction;
  label: string;
}

type DropSide = "before" | "after";

interface DropAt {
  id: string;
  side: DropSide;
}

function tabKey(target: EventTarget | null): string | undefined {
  const tab = (target as Element | null)?.closest?.<HTMLElement>('[role="tab"][data-key]');
  return tab?.dataset["key"];
}

function stopPress(event: Event): void {
  event.stopPropagation();
}

/**
 * The last search each tab that is a link was left with, by its path. In
 * memory only: the server and the first render in the browser both start
 * without it, so the links hydrate as written, and the URL stays the record
 * of what is shown.
 */
const remembered = new Map<string, URLSearchParams>();

function pathOf(href: string): string {
  const path = new URL(href, "http://tab.invalid").pathname;
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

/**
 * Tabs that stay usable as the room narrows, on ui's tabs and `@barqjs/aria`'s
 * tab list.
 *
 * ```tsx
 * <ResponsiveTabs
 *   aria-label="Project"
 *   items={[
 *     { id: "overview", label: "Overview" },
 *     { id: "checks", label: "Checks", count: 12 },
 *     { id: "settings", label: "Settings" },
 *   ]}
 * >
 *   {(tab) => <ProjectPanel id={tab.id} />}
 * </ResponsiveTabs>
 * ```
 *
 * With `overflow="menu"` the tabs that do not fit go into a More menu, the
 * last first, and the selected tab always stays in the row; choosing one from
 * the menu brings it into the row. With `overflow="scroll"` the row scrolls
 * under a finger, with a button at each end while there is more that way, and
 * the selected tab scrolls into view. The arrows move between tabs in the
 * reading direction either way. The server draws every tab in the row; the
 * browser measures and folds after hydrating.
 *
 * Where the tabs live in the address, `param` keeps the selected one in a
 * search parameter, and tabs with `href` are routes of their own: under a
 * router the tab whose path the page is on is the selected one, and coming
 * back to a tab brings back the search it was left with. `shared` names the
 * parameters every tab carries on.
 *
 * Open documents are tabs too: with `onClose` each tab closes by its button,
 * a middle click or Delete, `onReorder` moves them by dragging or from the
 * keyboard, `onPinnedChange` pins them, and a right-click, a held touch or
 * Shift+F10 on a tab opens all of that as a menu. `dirty` marks a tab with
 * changes not saved, in a dot and in its name.
 */
export function ResponsiveTabs(props: ResponsiveTabsProps) {
  const messages = useArcMessages();
  const direction = useDirection();
  const bar = makeRef<HTMLDivElement>();
  const list = makeRef<HTMLDivElement>();
  const viewport = makeRef<HTMLElement>();
  const more = makeRef<HTMLElement>();
  const router = maybeRouter();
  function items(): readonly TabItem[] {
    return props.items.filter((one) => one.hidden !== true);
  }
  function first(): string | undefined {
    return items().find((one) => one.isDisabled !== true)?.id;
  }
  const param = untrack(() => props.param);
  const search: SearchParamState<string> | undefined =
    param === undefined || router === undefined
      ? undefined
      : useSearchParam(param, {
          defaultValue: untrack(() => props.defaultSelectedKey ?? first() ?? ""),
          parse: (raw) => (items().some((one) => one.id === raw) ? raw : undefined),
        });
  const [own, setOwn] = controllable<string | undefined>(
    () => props.selectedKey ?? search?.value(),
    () => props.defaultSelectedKey ?? first(),
    (next) => {
      if (next !== undefined) props.onSelectionChange?.(next);
    },
  );
  function routed(): string | undefined {
    if (router === undefined || props.selectedKey !== undefined) return undefined;
    const here = pathOf(router.location().pathname);
    let best: TabItem | undefined;
    for (const one of items()) {
      if (one.href === undefined) continue;
      const path = pathOf(one.href);
      if (path === here) return one.id;
      const under = here.startsWith(path === "/" ? "/" : `${path}/`);
      if (under && (best === undefined || path.length > pathOf(best.href ?? "").length)) {
        best = one;
      }
    }
    return best?.id;
  }
  function selected(): string | undefined {
    return routed() ?? own();
  }
  function setSelected(next: string): void {
    if (search !== undefined && props.selectedKey === undefined) search.setValue(next);
    setOwn(next);
  }
  function linkOf(item: TabItem): string | undefined {
    if (item.href === undefined || router === undefined) return item.href;
    const target = new URL(item.href, "http://tab.invalid");
    const path = pathOf(item.href);
    const current = router.search();
    const kept = new URLSearchParams(target.search);
    const shared = props.shared ?? [];
    if (path !== pathOf(router.location().pathname)) {
      for (const [key, value] of remembered.get(path) ?? []) kept.set(key, value);
    }
    for (const key of shared) {
      const value = current.get(key);
      if (value !== null) kept.set(key, value);
    }
    const query = kept.toString();
    return `${target.pathname}${query === "" ? "" : `?${query}`}${target.hash}`;
  }
  if (router !== undefined && !isServer) {
    createEffect(
      () => [router.location().pathname, router.search().toString()] as const,
      ([pathname, query]) => {
        const path = pathOf(pathname);
        const tabs = untrack(items);
        if (!tabs.some((one) => one.href !== undefined && pathOf(one.href) === path)) return;
        const kept = new URLSearchParams(query);
        for (const key of untrack(() => props.shared) ?? []) kept.delete(key);
        remembered.set(path, kept);
      },
    );
  }
  function scrolls(): boolean {
    return props.overflow === "scroll";
  }

  function editable(): boolean {
    return (
      props.onClose !== undefined ||
      props.onReorder !== undefined ||
      props.onPinnedChange !== undefined
    );
  }
  function itemOf(id: string | undefined): TabItem | undefined {
    return id === undefined ? undefined : props.items.find((one) => one.id === id);
  }
  function closable(item: TabItem | undefined): boolean {
    return (
      item !== undefined &&
      props.onClose !== undefined &&
      item.pinned !== true &&
      item.closable !== false &&
      item.isDisabled !== true
    );
  }
  function tabElement(id: string): HTMLElement | null {
    return list()?.querySelector<HTMLElement>(`[role="tab"][data-key="${CSS.escape(id)}"]`) ?? null;
  }
  function focusedTab(): string | undefined {
    const active = typeof document === "undefined" ? null : document.activeElement;
    return active !== null && list()?.contains(active) === true ? tabKey(active) : undefined;
  }

  let refocusKey: string | undefined;
  function close(ids: readonly string[]): void {
    const shut = new Set(ids.filter((id) => closable(itemOf(id))));
    if (shut.size === 0) return;
    const rows = untrack(items);
    function neighbour(id: string): string | undefined {
      const at = rows.findIndex((one) => one.id === id);
      function open(one: TabItem): boolean {
        return !shut.has(one.id) && one.isDisabled !== true;
      }
      return (
        rows.slice(at + 1).find(open) ?? rows.slice(0, Math.max(at, 0)).toReversed().find(open)
      )?.id;
    }
    const current = untrack(selected);
    let next = current;
    if (current !== undefined && shut.has(current)) {
      next = neighbour(current);
      if (next !== undefined) setSelected(next);
    }
    const focused = focusedTab();
    if (focused !== undefined && shut.has(focused)) refocusKey = next ?? neighbour(focused);
    props.onClose?.([...shut]);
  }

  /** Every tab's id with `id` put at `index` among the visible ones, pinned ones kept first. */
  function moveTo(id: string, target: string, side: DropSide): void {
    const moving = itemOf(id);
    const anchor = itemOf(target);
    if (moving === undefined || anchor === undefined || id === target) return;
    const order = props.items.map((one) => one.id).filter((one) => one !== id);
    let at = order.indexOf(target) + (side === "after" ? 1 : 0);
    const pinned = props.items.filter((one) => one.pinned === true && one.id !== id).length;
    const firstLoose = order.findIndex((one) => itemOf(one)?.pinned !== true);
    const boundary = firstLoose === -1 ? order.length : firstLoose;
    at = moving.pinned === true ? Math.min(at, boundary) : Math.max(at, Math.min(boundary, pinned));
    order.splice(at, 0, id);
    if (order.every((one, index) => props.items[index]?.id === one)) return;
    refocusKey = focusedTab() === id ? id : undefined;
    props.onReorder?.(order);
    const visible = order.filter((one) => itemOf(one)?.hidden !== true);
    announce(messages().tabMoved(moving.label, visible.indexOf(id) + 1, visible.length), "polite");
  }
  function stepTab(id: string, forward: boolean): void {
    const rows = untrack(items);
    const at = rows.findIndex((one) => one.id === id);
    const other = rows[at + (forward ? 1 : -1)];
    if (at === -1 || other === undefined) return;
    moveTo(id, other.id, forward ? "after" : "before");
  }
  function canStep(id: string, forward: boolean): boolean {
    const rows = untrack(items);
    const at = rows.findIndex((one) => one.id === id);
    const other = rows[at + (forward ? 1 : -1)];
    return other !== undefined && (other.pinned === true) === (rows[at]?.pinned === true);
  }

  function onStripKeyDown(event: KeyboardEvent): void {
    const id = tabKey(event.target);
    if (id === undefined) return;
    if (
      event.key === "Delete" &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey
    ) {
      if (!closable(itemOf(id))) return;
      event.preventDefault();
      event.stopPropagation();
      close([id]);
      return;
    }
    if (props.onReorder === undefined || !event.shiftKey) return;
    const rtl = direction() === "rtl";
    let forward: boolean | undefined;
    if (event.ctrlKey && (event.key === "PageUp" || event.key === "PageDown")) {
      forward = event.key === "PageDown";
    } else if (event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      forward = (event.key === "ArrowRight") !== rtl;
    }
    if (forward === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    if (canStep(id, forward)) stepTab(id, forward);
  }

  let dragging: string | undefined;
  let dropAt: DropAt | undefined;
  const [drop, setShownDrop] = createSignal<DropAt | undefined>(undefined, { ownedWrite: true });
  function setDrop(next: DropAt | undefined): void {
    if (next?.id === dropAt?.id && next?.side === dropAt?.side) return;
    dropAt = next;
    setShownDrop(next);
  }
  function sideOf(event: DragEvent, tab: HTMLElement): DropSide {
    const box = tab.getBoundingClientRect();
    const past = event.clientX > box.left + box.width / 2;
    return past !== (direction() === "rtl") ? "after" : "before";
  }
  function onDragStart(event: DragEvent): void {
    const id = tabKey(event.target);
    if (id === undefined || props.onReorder === undefined) return;
    dragging = id;
    const transfer = event.dataTransfer ?? undefined;
    if (transfer !== undefined) {
      transfer.effectAllowed = "move";
      transfer.setData("text/plain", itemOf(id)?.label ?? id);
    }
  }
  function onDragOver(event: DragEvent): void {
    const from = dragging;
    const id = tabKey(event.target);
    if (from === undefined || id === undefined) return;
    event.preventDefault();
    const transfer = event.dataTransfer ?? undefined;
    if (transfer !== undefined) transfer.dropEffect = "move";
    const tab = tabElement(id);
    if (tab === null || id === from) {
      setDrop(undefined);
      return;
    }
    setDrop({ id, side: sideOf(event, tab) });
  }
  function onDrop(event: DragEvent): void {
    const from = dragging;
    const at = dropAt;
    if (from === undefined) return;
    event.preventDefault();
    if (at !== undefined) moveTo(from, at.id, at.side);
    dragging = undefined;
    setDrop(undefined);
  }
  function onDragEnd(): void {
    dragging = undefined;
    setDrop(undefined);
  }
  function onDragLeave(event: DragEvent): void {
    const into = event.relatedTarget as Node | null;
    if (into === null || !(event.currentTarget as Element).contains(into)) setDrop(undefined);
  }

  const [subject, setSubject] = createSignal<string | undefined>(undefined, { ownedWrite: true });
  function aim(event: Event): void {
    setSubject(tabKey(event.target));
  }
  function aimFromKeys(event: KeyboardEvent): void {
    if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) aim(event);
  }
  function menu(): TabMenuItem[] {
    const id = subject();
    const item = itemOf(id);
    const words = messages();
    const rows = items();
    const out: TabMenuItem[] = [];
    if (props.onClose !== undefined) {
      if (closable(item)) out.push({ id: "close", label: words.close });
      if (rows.some((one) => one.id !== id && closable(one))) {
        out.push({ id: "close-others", label: words.closeOtherTabs });
      }
      const at = rows.findIndex((one) => one.id === id);
      if (at !== -1 && rows.slice(at + 1).some(closable)) {
        out.push({ id: "close-after", label: words.closeTabsAfter });
      }
      if (rows.some(closable)) out.push({ id: "close-all", label: words.closeAllTabs });
    }
    if (item !== undefined && props.onPinnedChange !== undefined) {
      out.push(
        item.pinned === true
          ? { id: "unpin", label: words.unpinTab }
          : { id: "pin", label: words.pinTab },
      );
    }
    if (id !== undefined && props.onReorder !== undefined) {
      if (canStep(id, false)) out.push({ id: "earlier", label: words.moveTabEarlier });
      if (canStep(id, true)) out.push({ id: "later", label: words.moveTabLater });
    }
    return out;
  }
  function act(action: TabAction): void {
    const id = untrack(subject);
    const rows = untrack(items);
    if (action === "close-all") {
      close(rows.map((one) => one.id));
      return;
    }
    if (id === undefined) return;
    if (action === "close") close([id]);
    else if (action === "close-others")
      close(rows.filter((one) => one.id !== id).map((one) => one.id));
    else if (action === "close-after") {
      const at = rows.findIndex((one) => one.id === id);
      close(rows.slice(at + 1).map((one) => one.id));
    } else if (action === "pin" || action === "unpin") props.onPinnedChange?.(id, action === "pin");
    else stepTab(id, action === "later");
  }
  function tabName(item: TabItem): string | undefined {
    if (!editable() || (item.dirty !== true && item.pinned !== true)) return undefined;
    const words = messages();
    return [
      item.label,
      ...(item.count === undefined ? [] : [String(item.count)]),
      ...(item.pinned === true ? [words.pinnedTab] : []),
      ...(item.dirty === true ? [words.unsavedChanges] : []),
    ].join(", ");
  }

  const { hidden } = overflowItems({
    wrapperRef: bar,
    groupRef: list,
    menuRef: more,
    isCollapsing: () => !scrolls(),
    orientation: () => "horizontal",
    keys: () => items().map((one) => one.id),
    keep: selected,
  });
  function shown(): readonly TabItem[] {
    return items().filter((one) => !hidden().has(one.id) || one.id === selected());
  }
  function folded(): readonly TabItem[] {
    return items().filter((one) => hidden().has(one.id) && one.id !== selected());
  }

  const [ends, setEnds] = createSignal({ back: false, forward: false }, { ownedWrite: true });
  function edges(element: HTMLElement): void {
    const along = Math.abs(element.scrollLeft);
    const room = element.scrollWidth - element.clientWidth;
    setEnds({ back: along > 1, forward: room - along > 1 });
  }
  function scrollBy(forward: boolean): void {
    const element = viewport();
    if (element === null) return;
    const step = element.clientWidth * 0.8 * (forward ? 1 : -1);
    element.scrollBy({ left: direction() === "rtl" ? -step : step, behavior: "smooth" });
  }
  if (!isServer) {
    createEffect(
      () => [viewport(), scrolls()] as const,
      ([element, on]) => {
        if (element === null || !on) return undefined;
        const measure: () => void = () => {
          edges(element);
        };
        measure();
        const observer =
          typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
        observer?.observe(element);
        element.addEventListener("scroll", measure, { passive: true });
        return () => {
          observer?.disconnect();
          element.removeEventListener("scroll", measure);
        };
      },
    );
    createEffect(
      () =>
        items()
          .map((one) => one.id)
          .join("\n"),
      () => {
        const key = refocusKey;
        refocusKey = undefined;
        if (key !== undefined) untrack(() => tabElement(key))?.focus();
      },
    );
    createEffect(
      () => [selected(), scrolls(), list()] as const,
      ([key, on, row]) => {
        if (!on || key === undefined) return;
        const tab = row?.querySelector(`[data-key="${CSS.escape(key)}"]`);
        tab?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      },
    );
  }
  function cls(): Slots {
    return parts(responsiveTabsStyles(), props.classes);
  }
  function scrollButton(forward: boolean) {
    return (
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        class={arc(buttonVariants({ variant: "ghost", size: "icon-sm" }), cls().scroll)}
        data-slot="responsive-tabs-scroll"
        data-direction={forward ? "forward" : "back"}
        data-hidden={(forward ? ends().forward : ends().back) ? undefined : ""}
        onClick={() => scrollBy(forward)}
      >
        {forward ? (
          <ChevronRight class={icon.directional} />
        ) : (
          <ChevronLeft class={icon.directional} />
        )}
      </button>
    );
  }

  function tabList() {
    return (
      <TabsList<TabItem>
        ref={list.set}
        class={cls().list}
        data-slot="responsive-tabs-list"
        variant={props.variant ?? "line"}
        aria-label={props["aria-label"]}
      >
        {(item: TabItem) => (
          <TabsTrigger
            class={cls().tab}
            data-slot="responsive-tabs-tab"
            data-key={item.id}
            title={item.title}
            aria-label={tabName(item)}
            draggable={props.onReorder === undefined ? undefined : true}
            data-drop={drop()?.id === item.id ? drop()?.side : undefined}
            data-dirty={item.dirty === true ? "" : undefined}
            data-pinned={item.pinned === true ? "" : undefined}
            onAuxClick={(event: MouseEvent) => {
              if (event.button !== 1 || !closable(item)) return;
              event.preventDefault();
              close([item.id]);
            }}
            onMouseDown={(event: MouseEvent) => {
              if (event.button === 1 && closable(item)) event.preventDefault();
            }}
          >
            <Show when={item.icon !== undefined}>
              <span class={cls().icon} data-slot="responsive-tabs-icon" aria-hidden="true">
                {item.icon}
              </span>
            </Show>
            {item.label}
            <Show when={item.count !== undefined}>
              <Indicator class={cls().count} count={item.count} size="sm" variant="subtle" />
            </Show>
            <Show when={editable()}>
              <Show when={item.pinned === true}>
                <span class={cls().pin} data-slot="responsive-tabs-pin" aria-hidden="true">
                  <Pin />
                </span>
              </Show>
              <Show
                when={closable(item)}
                fallback={
                  <Show when={item.dirty === true}>
                    <span
                      class={cls().dirty}
                      data-slot="responsive-tabs-dirty"
                      aria-hidden="true"
                    />
                  </Show>
                }
              >
                <span
                  class={cls().close}
                  data-slot="responsive-tabs-close"
                  data-dirty={item.dirty === true ? "" : undefined}
                  aria-hidden="true"
                  onPointerDown={stopPress}
                  onMouseDown={stopPress}
                  onClick={(event: MouseEvent) => {
                    event.stopPropagation();
                    event.preventDefault();
                    close([item.id]);
                  }}
                >
                  <X />
                  <Show when={item.dirty === true}>
                    <span class={cls().dirty} data-slot="responsive-tabs-dirty" />
                  </Show>
                </span>
              </Show>
            </Show>
          </TabsTrigger>
        )}
      </TabsList>
    );
  }

  return (
    <Tabs<TabItem>
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="responsive-tabs"
      data-fill={props.fill === true ? "" : undefined}
      data-overflow={scrolls() ? "scroll" : "menu"}
      items={shown()}
      getKey={(item: TabItem) => item.id}
      getTextValue={(item: TabItem) => item.label}
      getProps={(item: TabItem) => ({ isDisabled: item.isDisabled === true, href: linkOf(item) })}
      disabledKeys={items()
        .filter((one) => one.isDisabled === true)
        .map((one) => one.id)}
      selectedKey={selected()}
      onSelectionChange={(key: Key) => setSelected(String(key))}
      keyboardActivation={props.keyboardActivation}
    >
      <div ref={bar.set} class={cls().bar} data-slot="responsive-tabs-bar">
        <Show when={scrolls()}>{scrollButton(false)}</Show>
        <Show
          when={editable()}
          fallback={
            <div ref={viewport.set} class={cls().viewport} data-slot="responsive-tabs-viewport">
              {tabList()}
            </div>
          }
        >
          <ContextMenu>
            <ContextMenuTrigger
              ref={viewport.set}
              class={cls().viewport}
              data-slot="responsive-tabs-viewport"
            >
              <div
                class={cls().strip}
                data-slot="responsive-tabs-strip"
                onContextMenuCapture={aim}
                onPointerDownCapture={aim}
                onKeyDownCapture={(event: KeyboardEvent) => {
                  aimFromKeys(event);
                  onStripKeyDown(event);
                }}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onDragEnd={onDragEnd}
              >
                {tabList()}
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent aria-label={messages().tabActions}>
              <For each={() => menu()}>
                {(entry: TabMenuItem) => (
                  <ContextMenuItem onSelect={() => act(entry.id)}>{entry.label}</ContextMenuItem>
                )}
              </For>
            </ContextMenuContent>
          </ContextMenu>
        </Show>
        <Show when={scrolls()}>{scrollButton(true)}</Show>
        <Show when={folded().length > 0}>
          <DropdownMenu>
            <DropdownMenuTrigger>
              <Button
                ref={more.set}
                variant="ghost"
                size="sm"
                class={cls().more}
                data-slot="responsive-tabs-more"
              >
                {messages().moreTabs}
                <ChevronDown aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" aria-label={messages().moreTabs}>
              <For each={() => folded()}>
                {(item: TabItem) => (
                  <DropdownMenuItem
                    class={cls().menuItem}
                    data-slot="responsive-tabs-menu-item"
                    isDisabled={item.isDisabled}
                    onSelect={() => setSelected(item.id)}
                  >
                    {item.icon}
                    {item.label}
                    <Show when={item.count !== undefined}>
                      <Indicator count={item.count} size="sm" variant="subtle" />
                    </Show>
                  </DropdownMenuItem>
                )}
              </For>
            </DropdownMenuContent>
          </DropdownMenu>
        </Show>
      </div>
      <Show when={props.children !== undefined}>
        <TabsContent<TabItem>
          class={cls().panel}
          data-slot="responsive-tabs-panel"
          shouldForceMount={props.keepMounted === true}
        >
          {(item: TabItem) => props.children?.(item)}
        </TabsContent>
      </Show>
    </Tabs>
  );
}
