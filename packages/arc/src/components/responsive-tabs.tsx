import { type Child, For, Show, createEffect, createSignal } from "@barqjs/core";
import { variants } from "@barqjs/css";
import type { Key } from "@barqjs/aria/collections";
import { useDirection } from "@barqjs/aria/i18n";
import { overflowItems } from "@barqjs/aria/overflow";
import { controllable } from "@barqjs/aria/utils";
import { ChevronDown } from "@barqjs/lucide/icons/chevron-down";
import { ChevronLeft } from "@barqjs/lucide/icons/chevron-left";
import { ChevronRight } from "@barqjs/lucide/icons/chevron-right";
import { ref as makeRef } from "@barqjs/primitives/refs";
import { Button, buttonVariants } from "@barqjs/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@barqjs/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, type TabsListVariant, TabsTrigger } from "@barqjs/ui/tabs";
import { isServer } from "@barqjs/web";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { gap, glyph, layout, motion } from "../style/index.ts";
import { Indicator } from "./indicator.tsx";
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
}

export const responsiveTabsStyles = variants({
  slots: {
    root: arc(layout.minZero),
    bar: arc(layout.row, layout.minZero, gap[1], { width: "100%" }),
    viewport: arc(layout.grow, layout.minZero, {
      overflowX: "auto",
      overflowY: "hidden",
      scrollbarWidth: "none",
      overscrollBehaviorInline: "contain",
      scrollSnapType: "x proximity",
      "::-webkit-scrollbar": { display: "none" },
    }),
    list: arc({ width: "max-content", minWidth: "100%", justifyContent: "flex-start" }),
    tab: arc(glyph.md, { flex: "0 0 auto", scrollSnapAlign: "start" }),
    icon: arc(layout.inlineCentre),
    count: arc({}),
    scroll: arc(layout.noShrink, motion.colours, {
      ":where(:dir(rtl), [dir=rtl], [dir=rtl] *) > svg": { rotate: "180deg" },
      "[data-hidden]": { visibility: "hidden" },
    }),
    more: arc(layout.noShrink, gap[1]),
    menuItem: arc(gap[2]),
    panel: arc({}),
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
  id?: string;
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
 */
export function ResponsiveTabs(props: ResponsiveTabsProps) {
  const messages = useArcMessages();
  const direction = useDirection();
  const bar = makeRef<HTMLDivElement>();
  const list = makeRef<HTMLDivElement>();
  const viewport = makeRef<HTMLDivElement>();
  const more = makeRef<HTMLElement>();
  const [selected, setSelected] = controllable<string | undefined>(
    () => props.selectedKey,
    () => props.defaultSelectedKey ?? props.items.find((one) => one.isDisabled !== true)?.id,
    (next) => {
      if (next !== undefined) props.onSelectionChange?.(next);
    },
  );
  const scrolls = (): boolean => props.overflow === "scroll";

  const { hidden } = overflowItems({
    wrapperRef: bar,
    groupRef: list,
    menuRef: more,
    isCollapsing: () => !scrolls(),
    orientation: () => "horizontal",
    keys: () => props.items.map((one) => one.id),
    keep: selected,
  });
  const shown = (): readonly TabItem[] =>
    props.items.filter((one) => !hidden().has(one.id) || one.id === selected());
  const folded = (): readonly TabItem[] =>
    props.items.filter((one) => hidden().has(one.id) && one.id !== selected());

  const [ends, setEnds] = createSignal({ back: false, forward: false }, { ownedWrite: true });
  const edges = (): void => {
    const element = viewport();
    if (element === null) return;
    const along = Math.abs(element.scrollLeft);
    const room = element.scrollWidth - element.clientWidth;
    setEnds({ back: along > 1, forward: room - along > 1 });
  };
  const scrollBy = (forward: boolean): void => {
    const element = viewport();
    if (element === null) return;
    const step = element.clientWidth * 0.8 * (forward ? 1 : -1);
    element.scrollBy({ left: direction() === "rtl" ? -step : step, behavior: "smooth" });
  };
  if (!isServer) {
    createEffect(
      () => [viewport(), scrolls()] as const,
      ([element, on]) => {
        if (element === null || !on) return undefined;
        edges();
        const observer =
          typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(edges);
        observer?.observe(element);
        element.addEventListener("scroll", edges, { passive: true });
        return () => {
          observer?.disconnect();
          element.removeEventListener("scroll", edges);
        };
      },
    );
    createEffect(
      () => [selected(), scrolls()] as const,
      ([key, on]) => {
        if (!on || key === undefined) return;
        const tab = list()?.querySelector(`[data-key="${CSS.escape(key)}"]`);
        tab?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      },
    );
  }
  const cls = (): Slots => parts(responsiveTabsStyles(), props.classes);
  const scrollButton = (forward: boolean) => (
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
      {forward ? <ChevronRight /> : <ChevronLeft />}
    </button>
  );

  return (
    <Tabs<TabItem>
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="responsive-tabs"
      data-overflow={scrolls() ? "scroll" : "menu"}
      items={shown()}
      getKey={(item: TabItem) => item.id}
      getTextValue={(item: TabItem) => item.label}
      getProps={(item: TabItem) => ({ isDisabled: item.isDisabled === true, href: item.href })}
      disabledKeys={props.items.filter((one) => one.isDisabled === true).map((one) => one.id)}
      selectedKey={selected()}
      onSelectionChange={(key: Key) => setSelected(String(key))}
      keyboardActivation={props.keyboardActivation}
    >
      <div ref={bar.set} class={cls().bar} data-slot="responsive-tabs-bar">
        <Show when={scrolls()}>{scrollButton(false)}</Show>
        <div ref={viewport.set} class={cls().viewport} data-slot="responsive-tabs-viewport">
          <TabsList<TabItem>
            ref={list.set}
            class={cls().list}
            data-slot="responsive-tabs-list"
            variant={props.variant ?? "line"}
            aria-label={props["aria-label"]}
          >
            {(item: TabItem) => (
              <TabsTrigger class={cls().tab} data-slot="responsive-tabs-tab" data-key={item.id}>
                <Show when={item.icon !== undefined}>
                  <span class={cls().icon} data-slot="responsive-tabs-icon" aria-hidden="true">
                    {item.icon}
                  </span>
                </Show>
                {item.label}
                <Show when={item.count !== undefined}>
                  <Indicator class={cls().count} count={item.count} size="sm" variant="subtle" />
                </Show>
              </TabsTrigger>
            )}
          </TabsList>
        </div>
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
        <TabsContent<TabItem> class={cls().panel} data-slot="responsive-tabs-panel">
          {(item: TabItem) => props.children?.(item)}
        </TabsContent>
      </Show>
    </Tabs>
  );
}
