import {
  type Child,
  Show,
  createContext,
  createSignal,
  createUniqueId,
  getOwner,
  install,
  untrack,
  useContext,
} from "@barqjs/core";
import { variants } from "@barqjs/css";
import { X } from "@barqjs/lucide/icons/x";
import { persisted } from "@barqjs/primitives/storage";
import type { Breakpoint } from "@barqjs/ui/conditions";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@barqjs/ui/resizable";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { bg, edge, fg, gap, layout, panel, place, space, type } from "../style/index.ts";
import type { NavIcon } from "./app-shell.tsx";
import { IconButton } from "./icon-button.tsx";
import { Indicator } from "./indicator.tsx";
import { useArcMessages } from "./messages.ts";
import { ResponsiveOverlay, useCompactOverlay } from "./responsive-overlay.tsx";

/** One panel that docks beside the page: details, comments, an assistant. */
export interface DockedPanel {
  id: string;
  label: string;
  icon?: NavIcon;
  /** A count on its toggle: unread comments, open tasks. */
  count?: number;
  content: () => Child;
  /** Pinned under the content: a composer, a Save. */
  footer?: () => Child;
}

export const dockedPanelsStyles = variants({
  slots: {
    root: arc(layout.minZero, place.fill),
    main: arc(layout.minZero, place.fill, { overflow: "auto" }),
    panel: arc(layout.column, bg.card, edge.start, place.fill),
    header: arc(layout.row, gap[2], edge.bottom, {
      paddingInline: space.x4,
      paddingBlock: space.x2,
    }),
    title: arc(type.subheading, layout.grow, layout.minZero, layout.clip, layout.nowrap),
    body: arc(panel.body, { padding: space.x4 }),
    footer: arc(edge.top, { padding: space.x3 }),
    toggle: arc({}),
    count: arc(fg.default),
  },
});

type Slots = ReturnType<typeof dockedPanelsStyles>;

interface DockedContext {
  panels: () => readonly DockedPanel[];
  active: () => string | null;
  toggle: (id: string) => void;
  toggleId: (id: string) => string;
}

const Context = createContext<DockedContext | null>(null, "DockedPanels");

export interface DockedPanelsProps extends Customisable<Slots> {
  panels: readonly DockedPanel[];
  /** The page beside the panel. */
  children?: Child;
  /** The open panel's id, or `null` for none. */
  active?: string | null;
  defaultActive?: string | null;
  onActiveChange?: (active: string | null) => void;
  /** Remember the panel's width in `localStorage` under this name. */
  storageKey?: string;
  /** The panel's width, as a percentage of the row, before the reader moves it. @default 30 */
  defaultSize?: number;
  /** Below this step, or under a finger, the panel is a sheet over the page. @default "lg" */
  breakpoint?: Breakpoint;
}

/**
 * A page with one panel docked beside it at a time, which the page makes room
 * for rather than sitting under: details, comments, an assistant.
 *
 * ```tsx
 * <DockedPanels
 *   storageKey="document-panels"
 *   panels={[
 *     { id: "details", label: "Details", icon: Info, content: () => <Details /> },
 *     { id: "comments", label: "Comments", icon: MessageSquare, count: unread(),
 *       content: () => <CommentThreadList … />, footer: () => <CommentComposer … /> },
 *   ]}
 * >
 *   <DockedPanelToggle panel="comments" />
 *   <Document />
 * </DockedPanels>
 * ```
 *
 * The panel is not modal: the page stays in reach, and the panel is a named
 * landmark beside it. Its edge is ui's resizable handle, which the arrows move
 * and Enter folds, its width is remembered under `storageKey`, and its close
 * button or Escape inside it closes it and returns focus to its toggle. Below
 * `breakpoint` or under a finger it is a sheet over the page instead.
 */
export function DockedPanels(props: DockedPanelsProps) {
  const messages = useArcMessages();
  const cls = (): Slots => parts(dockedPanelsStyles(), props.classes);
  const compact = useCompactOverlay(() => props.breakpoint ?? "lg");
  const base = createUniqueId();
  const headingId = createUniqueId();
  const [own, setOwn] = createSignal<string | null>(untrack(() => props.defaultActive) ?? null);
  const fallback = untrack(() => props.defaultSize) ?? 30;
  const key = untrack(() => props.storageKey);
  const [size, setSize] =
    key === undefined
      ? createSignal(fallback, { ownedWrite: true })
      : persisted<number>(`arc-docked:${key}`, fallback);

  const active = (): string | null => {
    const id = props.active === undefined ? own() : props.active;
    return id !== null && props.panels.some((one) => one.id === id) ? id : null;
  };
  const shown = (): DockedPanel | undefined => props.panels.find((one) => one.id === active());
  const toggleId = (id: string): string => `${base}-toggle-${id}`;

  const choose = (next: string | null): void => {
    const was = active();
    if (props.active === undefined) setOwn(next);
    props.onActiveChange?.(next);
    if (next === null && was !== null) {
      queueMicrotask(() => document.getElementById(toggleId(was))?.focus());
    }
  };

  const owner = getOwner();
  if (owner !== null) {
    install(owner, Context, () => ({
      panels: () => props.panels,
      active,
      toggle: (id: string) => choose(active() === id ? null : id),
      toggleId,
    }));
  }

  const docked = () => (
    <aside
      class={cls().panel}
      data-slot="docked-panel"
      data-panel={active() ?? undefined}
      aria-labelledby={headingId}
      onKeyDown={(event: KeyboardEvent) => {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        event.preventDefault();
        choose(null);
      }}
    >
      <div class={cls().header} data-slot="docked-panel-header">
        <h2 id={headingId} class={cls().title} data-slot="docked-panel-title">
          {shown()?.label}
        </h2>
        <IconButton
          label={messages().closePanel(shown()?.label ?? "")}
          variant="ghost"
          size="sm"
          tooltip={false}
          onPress={() => choose(null)}
        >
          <X aria-hidden="true" />
        </IconButton>
      </div>
      <div class={cls().body} data-slot="docked-panel-body">
        {shown()?.content()}
      </div>
      <Show when={shown()?.footer !== undefined}>
        <div class={cls().footer} data-slot="docked-panel-footer">
          {shown()?.footer?.()}
        </div>
      </Show>
    </aside>
  );

  return (
    <div
      class={arc(cls().root, props.class, props.className)}
      data-slot="docked-panels"
      data-presentation={compact() ? "sheet" : "docked"}
      data-active={active() ?? undefined}
    >
      <Show
        when={!compact()}
        fallback={
          <>
            <div class={cls().main} data-slot="docked-panels-main">
              {props.children}
            </div>
            <ResponsiveOverlay
              heading={shown()?.label ?? ""}
              open={active() !== null}
              onOpenChange={(open: boolean) => {
                if (!open) choose(null);
              }}
              footer={shown()?.footer?.()}
            >
              {shown()?.content()}
            </ResponsiveOverlay>
          </>
        }
      >
        <ResizablePanelGroup
          direction="horizontal"
          onLayoutChanged={(sizes: Record<string, number>) => {
            const width = sizes[`${base}-panel`];
            if (width !== undefined && width > 0) setSize(width);
          }}
        >
          <ResizablePanel id={`${base}-main`} minSize={30}>
            <div class={cls().main} data-slot="docked-panels-main">
              {props.children}
            </div>
          </ResizablePanel>
          <Show when={active() !== null}>
            <ResizableHandle withHandle aria-label={messages().resizePanel} />
            <ResizablePanel
              id={`${base}-panel`}
              defaultSize={untrack(size)}
              minSize="280px"
              maxSize={60}
              collapsible
              onCollapse={() => choose(null)}
            >
              {docked()}
            </ResizablePanel>
          </Show>
        </ResizablePanelGroup>
      </Show>
    </div>
  );
}

export interface DockedPanelToggleProps extends Customisable<Slots> {
  /** The id of the panel it opens and closes. */
  panel: string;
}

/**
 * The button that opens and closes one of the enclosing `DockedPanels`,
 * pressed while it is open, with the panel's count on it.
 */
export function DockedPanelToggle(props: DockedPanelToggleProps) {
  const messages = useArcMessages();
  const held = useContext(Context);
  const cls = (): Slots => parts(dockedPanelsStyles(), props.classes);
  const docked = (): DockedContext => {
    const value = held();
    if (value === null) throw new Error("A DockedPanelToggle has to be inside DockedPanels.");
    return value;
  };
  const shown = (): DockedPanel | undefined =>
    docked()
      .panels()
      .find((one) => one.id === props.panel);
  const count = (): number => shown()?.count ?? 0;
  const Icon = untrack(() => shown()?.icon);
  return (
    <IconButton
      id={docked().toggleId(props.panel)}
      class={arc(cls().toggle, props.class, props.className)}
      label={
        count() > 0
          ? messages().panelWithCount(shown()?.label ?? "", count())
          : (shown()?.label ?? "")
      }
      variant="ghost"
      isPressed={docked().active() === props.panel}
      onPress={() => docked().toggle(props.panel)}
    >
      <Indicator count={count()} size="sm" tone="info" label="" class={cls().count}>
        {Icon === undefined ? null : <Icon />}
      </Indicator>
    </IconButton>
  );
}
