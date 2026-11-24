import { Show, onCleanup } from "@barqjs/core";
import { LibraryBig } from "@barqjs/lucide/icons/library-big";
import { Pin } from "@barqjs/lucide/icons/pin";
import { Search } from "@barqjs/lucide/icons/search";
import { X } from "@barqjs/lucide/icons/x";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@barqjs/ui/tabs";
import {
  CANVAS_SEARCH_TAB,
  DEFAULT_SIDEBAR,
  KEYS,
  LIBRARY_SIDEBAR_TAB,
  capitalizeString,
} from "@excalidraw/common";

import { useDiagramUI } from "./context.tsx";
import { layout, surface, type } from "@barqjs/arc/style";

import { diagramLayer as d } from "./layer.ts";
import { LibraryMenu } from "./library-menu.tsx";
import { SearchMenu } from "./search-menu.tsx";
import { iconButton, island } from "./styles.ts";

import type { DiagramEditor } from "../editor/editor.ts";

/** The sidebar's width, which a docked sidebar takes from the rest of the UI. */
export const SIDEBAR_WIDTH = 304;
/** The gap between a docked sidebar and the editor's edge. */
const SIDEBAR_MARGIN = 12;
/** What the rest of the UI gives up while the sidebar is docked beside it. */
export const DOCKED_SIDEBAR_INSET = SIDEBAR_WIDTH + SIDEBAR_MARGIN;

const panel = d(surface.elevated, layout.column, type.sm, {
  position: "absolute",
  top: `${SIDEBAR_MARGIN}px`,
  bottom: `${SIDEBAR_MARGIN}px`,
  insetInlineEnd: `${SIDEBAR_MARGIN}px`,
  zIndex: "4",
  gap: "8px",
  width: `${SIDEBAR_WIDTH}px`,
  maxWidth: `calc(100% - ${SIDEBAR_MARGIN * 2}px)`,
  padding: "8px",
  pointerEvents: "auto",
  fontFamily: "var(--font-sans)",
});

const tabs = d({ display: "flex", flexDirection: "column", gap: "8px", flex: "1", minHeight: "0" });

const header = d({ display: "flex", alignItems: "center", gap: "4px" });

const tabPanel = d({ display: "flex", flexDirection: "column", flex: "1", minHeight: "0" });

const headerButtons = d({ display: "flex", gap: "2px", marginInlineStart: "auto" });

/** Whether the default sidebar is open and docked beside the canvas, taking its room from the UI. */
export const isSidebarDocked = (
  openSidebar: { name: string } | null,
  docked: boolean,
  canFit: boolean,
): boolean => openSidebar?.name === DEFAULT_SIDEBAR.name && docked && canFit;

/**
 * The library's button at the top end, Excalidraw's `DefaultSidebar.Trigger`:
 * it opens the sidebar on the library, or closes it.
 */
export function SidebarTrigger() {
  const ui = useDiagramUI();
  const store = ui.store;
  const open = () => store.state("openSidebar")?.name === DEFAULT_SIDEBAR.name;
  const label = () => capitalizeString(ui.t("toolBar.library"));
  return (
    <div class={island}>
      <button
        type="button"
        class={iconButton}
        aria-label={label()}
        title={label()}
        aria-pressed={open()}
        data-sidebar-trigger=""
        onClick={() => {
          const editor = store.editor;
          editor?.batch(() =>
            editor.setState({
              openSidebar: open()
                ? null
                : { name: DEFAULT_SIDEBAR.name, tab: DEFAULT_SIDEBAR.defaultTab },
            }),
          );
        }}
        data-testid="sidebar-trigger"
      >
        <LibraryBig aria-hidden="true" />
      </button>
    </div>
  );
}

function SidebarPanel(props: { editor: DiagramEditor }) {
  const ui = useDiagramUI();
  const t = ui.t;
  const store = ui.store;
  const editor = props.editor;
  const tab = () => store.state("openSidebar")?.tab ?? DEFAULT_SIDEBAR.defaultTab;
  // the search always docks, as Excalidraw's does
  const forceDocked = () => tab() === CANVAS_SEARCH_TAB;
  const docked = () => forceDocked() || store.state("defaultSidebarDockedPreference");
  const canFit = () => {
    store.state("width");
    return editor.canFitSidebar();
  };
  let panelElement: HTMLElement | undefined;

  const close = (): void => {
    editor.batch(() => editor.setState({ openSidebar: null }));
  };

  const closeUnlessDocked = (): boolean => {
    if (docked() && canFit()) return false;
    close();
    return true;
  };

  // a press on the canvas closes a sidebar that is not docked
  const onPointerDown = (event: PointerEvent): void => {
    const target = event.target as Element | null;
    if (!target || panelElement?.contains(target)) return;
    if (!editor.container.contains(target) || target.closest("[data-sidebar-trigger]")) return;
    closeUnlessDocked();
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === KEYS.ESCAPE && !event.defaultPrevented) {
      closeUnlessDocked();
    }
  };
  editor.container.addEventListener("pointerdown", onPointerDown, true);
  editor.container.addEventListener("keydown", onKeyDown);
  onCleanup(() => {
    editor.container.removeEventListener("pointerdown", onPointerDown, true);
    editor.container.removeEventListener("keydown", onKeyDown);
  });

  return (
    <aside
      class={panel}
      ref={(element: HTMLElement) => {
        panelElement = element;
      }}
      aria-label={capitalizeString(t("toolBar.library"))}
      lang={ui.langCode()}
      dir={ui.rtl() ? "rtl" : "ltr"}
      data-diagram-ui=""
      data-docked={docked() && canFit() ? "" : undefined}
      data-testid="default-sidebar"
    >
      <Tabs
        class={tabs}
        value={tab()}
        onValueChange={(value: string) =>
          editor.batch(() =>
            editor.setState({ openSidebar: { name: DEFAULT_SIDEBAR.name, tab: value } }),
          )
        }
      >
        <div class={header}>
          <TabsList aria-label={capitalizeString(t("toolBar.library"))}>
            <TabsTrigger
              value={CANVAS_SEARCH_TAB}
              aria-label={t("search.title")}
              data-testid="sidebar-tab-search"
            >
              <Search aria-hidden="true" />
            </TabsTrigger>
            <TabsTrigger
              value={LIBRARY_SIDEBAR_TAB}
              aria-label={capitalizeString(t("toolBar.library"))}
              data-testid="sidebar-tab-library"
            >
              <LibraryBig aria-hidden="true" />
            </TabsTrigger>
          </TabsList>
          <div class={headerButtons}>
            <Show when={canFit() && !forceDocked()}>
              <button
                type="button"
                class={iconButton}
                aria-label={t("labels.sidebarLock")}
                title={t("labels.sidebarLock")}
                aria-pressed={docked()}
                onClick={() =>
                  editor.batch(() =>
                    editor.setState({
                      defaultSidebarDockedPreference: !editor.state.defaultSidebarDockedPreference,
                    }),
                  )
                }
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
                close();
                editor.focusContainer();
              }}
              data-testid="sidebar-close"
            >
              <X aria-hidden="true" />
            </button>
          </div>
        </div>
        <TabsContent value={LIBRARY_SIDEBAR_TAB} class={tabPanel}>
          <LibraryMenu editor={editor} />
        </TabsContent>
        <TabsContent value={CANVAS_SEARCH_TAB} class={tabPanel}>
          <SearchMenu editor={editor} />
        </TabsContent>
      </Tabs>
    </aside>
  );
}

/**
 * Excalidraw's default sidebar, at the editor's end: the search and the
 * library as tabs, a pin to dock it beside the canvas where it fits, and a
 * close button. Undocked it closes on a press on the canvas or Escape.
 */
export function DefaultSidebar() {
  const ui = useDiagramUI();
  const store = ui.store;
  const open = () => store.state("openSidebar")?.name === DEFAULT_SIDEBAR.name;
  return (
    <Show when={open() && store.editor}>
      {(editor: () => DiagramEditor) => <SidebarPanel editor={editor()} />}
    </Show>
  );
}
