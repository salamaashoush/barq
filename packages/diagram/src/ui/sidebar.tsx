import type { JSX } from "@barqjs/web";
import {
  type Child,
  Show,
  createContext,
  createRenderEffect,
  getContext,
  onCleanup,
  provide,
  readProp,
  untrack,
} from "@barqjs/core";
import { LibraryBig } from "@barqjs/lucide/icons/library-big";
import { Pin } from "@barqjs/lucide/icons/pin";
import { Search } from "@barqjs/lucide/icons/search";
import { X } from "@barqjs/lucide/icons/x";
import { Sheet, SheetContent } from "@barqjs/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@barqjs/ui/tabs";
import {
  CANVAS_SEARCH_TAB,
  DEFAULT_SIDEBAR,
  KEYS,
  LIBRARY_SIDEBAR_TAB,
  capitalizeString,
} from "@excalidraw/common";

import { useDiagramUI } from "./context.tsx";
import {
  type DefaultSidebarProps,
  HostChildrenContext,
  type HostSlots,
  hostSlot,
  isHostChild,
} from "./host-children.ts";
import { gap, layout, space, surface, type } from "@barqjs/arc/style";

import { diagramLayer as d } from "./layer.ts";
import { LibraryMenu } from "./library-menu.tsx";
import { SearchMenu } from "./search-menu.tsx";
import { floating, iconButton, island, takesPointer } from "./styles.ts";

import type { DiagramEditor } from "../editor/editor.ts";
import type { AppState } from "../types.ts";

/** The sidebar's width, which a docked sidebar takes from the rest of the UI. */
export const SIDEBAR_WIDTH = 304;
/** The gap between a docked sidebar and the editor's edge. */
const SIDEBAR_MARGIN = 12;
/** What the rest of the UI gives up while the sidebar is docked beside it. */
export const DOCKED_SIDEBAR_INSET = SIDEBAR_WIDTH + SIDEBAR_MARGIN;

// SIDEBAR_WIDTH and SIDEBAR_MARGIN, written out for the compiler
const sidebarWidth = d({ width: "304px" });

const panel = d(
  surface.elevated,
  layout.column,
  type.sm,
  type.sans,
  floating,
  gap[2],
  takesPointer,
  sidebarWidth,
  {
    top: "12px",
    bottom: "12px",
    insetInlineEnd: "12px",
    maxWidth: "calc(100% - 24px)",
    padding: space.x2,
  },
);

const phonePanel = d(sidebarWidth, gap[2], { maxWidth: "100%", padding: space.x2 });

const tabs = d(layout.column, gap[2], layout.grow, layout.minZeroBlock);

const header = d(layout.row, gap[1]);

const tabPanel = d(layout.column, layout.grow, layout.minZeroBlock);

const headerButtons = d(layout.row, gap[0.5], layout.pushEnd);

type OpenSidebar = AppState["openSidebar"];

interface SidebarState {
  name: string;
  editor: DiagramEditor;
  /** Whether it is docked beside the canvas: docked and fitting. */
  docked: () => boolean;
  /** Whether the header offers the dock button. */
  dockable: () => boolean;
  onDock: (docked: boolean) => void;
  close: () => void;
}

const SidebarContext = createContext<SidebarState | null>(null);

function useSidebar(): SidebarState {
  const sidebar = getContext(SidebarContext);
  if (sidebar === null || sidebar === undefined) {
    throw new Error("A Sidebar's parts are rendered inside its <Sidebar>.");
  }
  return sidebar;
}

function setOpenSidebar(editor: DiagramEditor, openSidebar: OpenSidebar): void {
  editor.batch(() => editor.setState({ openSidebar }));
}

export interface SidebarProps {
  name: string;
  children?: Child;
  /** Hears it open, close or change tab, with `null` once closed. */
  onStateChange?: (state: OpenSidebar) => void;
  /** With `docked`, makes it dockable: the header's pin calls it. */
  onDock?: (docked: boolean) => void;
  /** Whether it is docked beside the canvas, where it fits. */
  docked?: boolean;
  class?: string;
  /** Its accessible name. @default its `name` */
  "aria-label"?: string;
  "data-testid"?: string;
}

interface EditorProp {
  editor: DiagramEditor;
}

function SidebarPanel(props: SidebarProps & EditorProp) {
  const ui = useDiagramUI();
  const store = ui.store;
  const editor = props.editor;
  function canFit() {
    store.state("width");
    return editor.canFitSidebar();
  }
  function docked() {
    return props.docked === true && canFit();
  }
  let panelElement: HTMLElement | undefined;

  function closeUnlessDocked(): boolean {
    if (docked()) return false;
    setOpenSidebar(editor, null);
    return true;
  }
  // a press on the canvas closes a sidebar that is not docked
  function onPointerDown(event: PointerEvent): void {
    const target = event.target as Element | null;
    if (!target || panelElement?.contains(target)) return;
    if (!editor.container.contains(target) || target.closest("[data-sidebar-trigger]")) return;
    closeUnlessDocked();
  }
  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === KEYS.ESCAPE && !event.defaultPrevented) {
      closeUnlessDocked();
    }
  }
  editor.container.addEventListener("pointerdown", onPointerDown, true);
  editor.container.addEventListener("keydown", onKeyDown);
  onCleanup(() => {
    editor.container.removeEventListener("pointerdown", onPointerDown, true);
    editor.container.removeEventListener("keydown", onKeyDown);
  });
  // the rest of the UI makes room for it while it is docked; written outside
  // the effect, as the store's are
  createRenderEffect(docked, (isDocked) => {
    queueMicrotask(() => ui.setDockedSidebar(isDocked ? props.name : null, props.name));
  });
  onCleanup(() => queueMicrotask(() => ui.setDockedSidebar(null, props.name)));

  const state: SidebarState = {
    name: props.name,
    editor,
    docked,
    dockable: () => props.onDock !== undefined && props.docked !== undefined && canFit(),
    onDock: (next) => props.onDock?.(next),
    close: () => setOpenSidebar(editor, null),
  };

  return (
    <aside
      class={props.class ? `${panel} ${props.class}` : panel}
      ref={(element: HTMLElement) => {
        panelElement = element;
      }}
      aria-label={props["aria-label"] ?? props.name}
      lang={ui.langCode()}
      dir={ui.rtl() ? "rtl" : "ltr"}
      data-diagram-ui=""
      data-docked={docked() ? "" : undefined}
      data-viewport-ui="side"
      data-viewport-ui-name="sidebar"
      data-testid={props["data-testid"]}
    >
      {provide(
        SidebarContext,
        () => state,
        () => props.children,
      )}
    </aside>
  );
}

/**
 * The sidebar on a phone, where it cannot dock: Excalidraw's overlay at the
 * editor's end, the full height, closed by a press outside it or Escape.
 */
function PhoneSidebar(props: SidebarProps & EditorProp) {
  const ui = useDiagramUI();
  const editor = props.editor;
  const state: SidebarState = {
    name: props.name,
    editor,
    docked: () => false,
    dockable: () => false,
    onDock: () => {},
    close: () => setOpenSidebar(editor, null),
  };
  return (
    <Sheet
      isOpen
      onOpenChange={(isOpen: boolean) => {
        if (!isOpen) setOpenSidebar(editor, null);
      }}
    >
      <SheetContent
        side={ui.rtl() ? "left" : "right"}
        showCloseButton={false}
        class={props.class ? `${phonePanel} ${props.class}` : phonePanel}
        aria-label={props["aria-label"] ?? props.name}
        lang={ui.langCode()}
        dir={ui.rtl() ? "rtl" : "ltr"}
        data-diagram-ui=""
        data-testid={props["data-testid"]}
      >
        {provide(
          SidebarContext,
          () => state,
          () => props.children,
        )}
      </SheetContent>
    </Sheet>
  );
}

function SidebarRoot(props: SidebarProps): JSX.Element {
  const ui = useDiagramUI();
  const store = ui.store;
  function open() {
    return store.state("openSidebar")?.name === props.name;
  }
  createRenderEffect(
    () => store.state("openSidebar"),
    (next, previous) => {
      const name = props.name;
      const concerned = next?.name === name || previous?.name === name;
      if (previous === undefined || next === previous || !concerned) return;
      const state = next?.name === name ? next : null;
      // the host's listener may write its own state
      queueMicrotask(() => untrack(() => props.onStateChange)?.(state));
    },
  );
  // its own parts are no children of the editor's
  return provide(
    HostChildrenContext,
    () => false,
    () => (
      <Show when={open() && store.editor}>
        {(editor: () => DiagramEditor) => (
          <Show
            when={store.editorInterface().formFactor === "phone"}
            fallback={<SidebarPanel {...props} editor={editor()} />}
          >
            <PhoneSidebar {...props} editor={editor()} />
          </Show>
        )}
      </Show>
    ),
  );
}

interface ClassedChildrenProps {
  children?: Child;
  class?: string;
}

/** The sidebar's head, Excalidraw's `Sidebar.Header`: what it holds, the pin where it docks, and close. */
function SidebarHeader(props: ClassedChildrenProps) {
  const ui = useDiagramUI();
  const t = ui.t;
  const sidebar = useSidebar();
  return (
    <div class={props.class ? `${header} ${props.class}` : header}>
      {props.children}
      <div class={headerButtons}>
        <Show when={sidebar.dockable()}>
          <button
            type="button"
            class={iconButton}
            aria-label={t("labels.sidebarLock")}
            title={t("labels.sidebarLock")}
            aria-pressed={sidebar.docked()}
            onClick={() => sidebar.onDock(!sidebar.docked())}
            data-testid="sidebar-dock"
          >
            <Pin aria-hidden="true" />
          </button>
        </Show>
        <button
          type="button"
          class={iconButton}
          aria-label={t("buttons.close")}
          title={t("buttons.close")}
          onClick={() => {
            sidebar.close();
            sidebar.editor.focusContainer();
          }}
          data-testid="sidebar-close"
        >
          <X aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/** The sidebar's tabs, Excalidraw's `Sidebar.Tabs`: the open one is `openSidebar.tab`. */
function SidebarTabs(props: ClassedChildrenProps) {
  const ui = useDiagramUI();
  const sidebar = useSidebar();
  function tab() {
    return ui.store.state("openSidebar")?.tab;
  }
  return (
    <Tabs
      class={props.class ? `${tabs} ${props.class}` : tabs}
      value={tab() ?? ""}
      onValueChange={(value: string) =>
        setOpenSidebar(sidebar.editor, { name: sidebar.name, tab: value })
      }
    >
      {props.children}
    </Tabs>
  );
}

interface SidebarTabProps {
  tab: string;
  children?: Child;
  class?: string;
}

/** A tab's content, Excalidraw's `Sidebar.Tab`. */
function SidebarTab(props: SidebarTabProps) {
  return (
    <TabsContent value={props.tab} class={props.class ? `${tabPanel} ${props.class}` : tabPanel}>
      {props.children}
    </TabsContent>
  );
}

interface SidebarTabTriggersProps {
  children?: Child;
  "aria-label"?: string;
}

/** The tabs' buttons, Excalidraw's `Sidebar.TabTriggers`. */
function SidebarTabTriggers(props: SidebarTabTriggersProps) {
  const sidebar = useSidebar();
  return <TabsList aria-label={props["aria-label"] ?? sidebar.name}>{props.children}</TabsList>;
}

interface SidebarTabTriggerProps {
  tab: string;
  children?: Child;
  title?: string;
  "data-testid"?: string;
}

/** A tab's button, Excalidraw's `Sidebar.TabTrigger`. */
function SidebarTabTrigger(props: SidebarTabTriggerProps) {
  return (
    <TabsTrigger value={props.tab} aria-label={props.title} data-testid={props["data-testid"]}>
      {props.children}
    </TabsTrigger>
  );
}

export interface SidebarTriggerProps {
  name: string;
  tab?: string;
  icon?: Child;
  title?: string;
  children?: Child;
  class?: string;
  onToggle?: (open: boolean) => void;
  "data-testid"?: string;
}

/** Opens a sidebar (on a tab), or closes it, Excalidraw's `Sidebar.Trigger`. */
function SidebarTriggerButton(props: SidebarTriggerProps) {
  const ui = useDiagramUI();
  const store = ui.store;
  function open() {
    return store.state("openSidebar")?.name === props.name;
  }
  return (
    <div class={island}>
      <button
        type="button"
        class={props.class ? `${iconButton} ${props.class}` : iconButton}
        aria-label={props.title}
        title={props.title}
        aria-pressed={open()}
        data-sidebar-trigger=""
        onClick={() => {
          const editor = store.editor;
          const next = !open();
          editor?.batch(() =>
            editor.setState({
              openSidebar: next ? { name: props.name, tab: props.tab } : null,
              openMenu: null,
              openPopup: null,
            }),
          );
          props.onToggle?.(next);
        }}
        data-testid={props["data-testid"]}
      >
        {props.icon}
        {props.children}
      </button>
    </div>
  );
}

/**
 * Excalidraw's `Sidebar`: a panel at the editor's end while `openSidebar`
 * names it, given to `<DiagramEditor>` as a child, made of `Sidebar.Header`,
 * `Sidebar.Tabs` with `Sidebar.TabTriggers`, `Sidebar.TabTrigger` and
 * `Sidebar.Tab`; `Sidebar.Trigger` opens it from anywhere. With `docked` and
 * `onDock` it docks beside the canvas where it fits; undocked a press on the
 * canvas or Escape closes it. On a phone it is a sheet over the editor.
 */
export const Sidebar = Object.assign(SidebarRoot, {
  Header: SidebarHeader,
  Tabs: SidebarTabs,
  Tab: SidebarTab,
  TabTriggers: SidebarTabTriggers,
  TabTrigger: SidebarTabTrigger,
  Trigger: SidebarTriggerButton,
});

/**
 * The library's button at the top end, Excalidraw's `DefaultSidebar.Trigger`:
 * it opens the default sidebar on the library, or closes it. A
 * `DefaultSidebar.Trigger` child gives it its own icon, title and label.
 */
export function SidebarTrigger() {
  const ui = useDiagramUI();
  function given() {
    return ui.host().slots.defaultSidebarTrigger;
  }
  function label() {
    return capitalizeString(ui.t("toolBar.library"));
  }
  return (
    <SidebarTriggerButton
      name={DEFAULT_SIDEBAR.name}
      tab={DEFAULT_SIDEBAR.defaultTab}
      icon={given()?.icon ?? <LibraryBig aria-hidden="true" />}
      title={given()?.title ?? label()}
      class={given()?.class}
      onToggle={given()?.onToggle}
      data-testid="sidebar-trigger"
    >
      {given()?.children}
    </SidebarTriggerButton>
  );
}

function DefaultSidebarContent(props: DefaultSidebarProps & EditorProp) {
  const ui = useDiagramUI();
  const t = ui.t;
  const store = ui.store;
  // the search always docks, as Excalidraw's does
  function forceDocked() {
    return store.state("openSidebar")?.tab === CANVAS_SEARCH_TAB;
  }
  function docked() {
    return forceDocked() || (props.docked ?? store.state("defaultSidebarDockedPreference"));
  }
  // `onDock={false}` takes the pin away, and so does `docked` without `onDock`
  function dockable() {
    return (
      !forceDocked() &&
      props.onDock !== false &&
      !(props.onDock === undefined && props.docked !== undefined)
    );
  }
  function library() {
    return capitalizeString(t("toolBar.library"));
  }
  return (
    <SidebarRoot
      name={DEFAULT_SIDEBAR.name}
      class={props.class}
      aria-label={library()}
      docked={docked()}
      onDock={
        dockable()
          ? (next: boolean) => {
              if (typeof props.onDock === "function") props.onDock(next);
              props.editor.batch(() =>
                props.editor.setState({ defaultSidebarDockedPreference: next }),
              );
            }
          : undefined
      }
      onStateChange={props.onStateChange}
      data-testid="default-sidebar"
    >
      <SidebarTabs>
        <SidebarHeader>
          <SidebarTabTriggers aria-label={library()}>
            <SidebarTabTrigger
              tab={CANVAS_SEARCH_TAB}
              title={t("search.title")}
              data-testid="sidebar-tab-search"
            >
              <Search aria-hidden="true" />
            </SidebarTabTrigger>
            <SidebarTabTrigger
              tab={LIBRARY_SIDEBAR_TAB}
              title={library()}
              data-testid="sidebar-tab-library"
            >
              <LibraryBig aria-hidden="true" />
            </SidebarTabTrigger>
            {ui.host().slots.defaultSidebarTabTriggers?.children}
          </SidebarTabTriggers>
        </SidebarHeader>
        <SidebarTab tab={LIBRARY_SIDEBAR_TAB}>
          <LibraryMenu editor={props.editor} />
        </SidebarTab>
        <SidebarTab tab={CANVAS_SEARCH_TAB}>
          <SearchMenu editor={props.editor} />
        </SidebarTab>
        {props.children}
      </SidebarTabs>
    </SidebarRoot>
  );
}

/**
 * Excalidraw's `DefaultSidebar`: the search and the library as tabs, a pin
 * to dock it beside the canvas where it fits, and a close button. Given to
 * `<DiagramEditor>` as a child, its props (`docked`, `onDock`, `class`, more
 * `Sidebar.Tab`s as children) apply to the editor's own; `DefaultSidebar.Trigger`
 * and `DefaultSidebar.TabTriggers` add to its button and its tab buttons.
 */
function DefaultSidebarTrigger(props: HostSlots["defaultSidebarTrigger"]): JSX.Element {
  return isHostChild()
    ? hostSlot("defaultSidebarTrigger", {
        get icon() {
          return readProp(props.icon) as never;
        },
        get title() {
          return readProp(props.title) as never;
        },
        get children() {
          return readProp(props.children) as never;
        },
        get onToggle() {
          return readProp(props.onToggle) as never;
        },
        get class() {
          return readProp(props.class) as never;
        },
      })
    : null;
}

interface ChildrenProps {
  children?: Child;
}

function DefaultSidebarTabTriggers(props: ChildrenProps): JSX.Element {
  return isHostChild()
    ? hostSlot("defaultSidebarTabTriggers", {
        get children() {
          return readProp(props.children) as never;
        },
      })
    : null;
}

function DefaultSidebarRoot(props: DefaultSidebarProps): JSX.Element {
  if (isHostChild()) {
    return hostSlot("defaultSidebar", {
      get children() {
        return props.children;
      },
      get class() {
        return props.class;
      },
      get docked() {
        return props.docked;
      },
      get onDock() {
        return props.onDock;
      },
      get onStateChange() {
        return props.onStateChange;
      },
    });
  }
  const ui = useDiagramUI();
  function given() {
    return ui.host().slots.defaultSidebar;
  }
  return (
    <Show when={ui.store.editor}>
      {(editor: () => DiagramEditor) => (
        <DefaultSidebarContent
          {...given()}
          {...props}
          children={props.children ?? given()?.children}
          editor={editor()}
        />
      )}
    </Show>
  );
}

export const DefaultSidebar = Object.assign(DefaultSidebarRoot, {
  Trigger: DefaultSidebarTrigger,
  TabTriggers: DefaultSidebarTabTriggers,
});
