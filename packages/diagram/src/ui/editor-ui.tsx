import { Show, provide } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";

import { DiagramUIContext, type DiagramUI, useDiagramUI } from "./context.tsx";
import { ContextMenu } from "./context-menu.tsx";
import { FooterEnd, FooterStart } from "./footer.tsx";
import { MainMenuButton } from "./main-menu.tsx";
import { CompactPropertiesPanel, PropertiesPanel } from "./properties.tsx";
import {
  acrossWidth,
  bottomEnd,
  bottomStart,
  iconButton,
  island,
  layerUI,
  noPointer,
  passThrough,
  pinned,
  startEdge,
  topCenter,
  topEnd,
  topStart,
} from "./styles.ts";
import { Toolbar } from "./toolbar.tsx";
import { ChartDialog } from "./chart-dialog.tsx";
import { CommandPaletteDialog } from "./command-palette.tsx";
import { EditorKeys } from "./editor-keys.tsx";
import { ImageExportDialog, JSONExportDialog } from "./export-dialogs.tsx";
import { HelpDialog } from "./help-dialog.tsx";
import { MagicFrameButtons } from "./embeds.tsx";
import { TTDDialogBase } from "./ttd-dialog.tsx";
import { HintViewer } from "./hint-viewer.tsx";
import { ElementLinkDialog, HyperlinkPopup } from "./hyperlink.tsx";
import { Minimap } from "./minimap.tsx";
import { ShapeSwitchPanel } from "./shape-switch.tsx";
import { DOCKED_SIDEBAR_INSET, DefaultSidebar, SidebarTrigger } from "./sidebar.tsx";
import { StatsPanel } from "./stats.tsx";
import { EditorToasts } from "./toasts.tsx";
import { gap, layout, space } from "@barqjs/arc/style";
import { DEFAULT_SIDEBAR } from "@excalidraw/common";

import { diagramLayer as d } from "./layer.ts";
import { actionToggleViewMode, actionToggleZenMode } from "../editor/actions/toggles.ts";
import { Pencil } from "@barqjs/lucide/icons/pencil";
import { Zap } from "@barqjs/lucide/icons/zap";
import { WelcomeScreenLayer } from "./welcome-screen.tsx";
import { PenModeButton, PhoneChrome } from "./layouts.tsx";
import { Button } from "@barqjs/ui/button";
import { UserList } from "./user-list.tsx";
import { ViewportStatusBadge, ViewportStatusBorder } from "./viewport-status-frame.tsx";

const scrollBack = d(pinned, passThrough, acrossWidth, layout.column, gap[2], {
  bottom: "60px",
  alignItems: "center",
});
// the user list reaches back to the middle, beside the toolbar
const topEndWide = d({ insetInlineStart: "50%" });
const topEndRow = d(layout.row, layout.end, gap[2], layout.minZero, { alignSelf: "stretch" });
const toolbarAnchor = d(layout.relative, noPointer);
const bottomStack = d(pinned, layout.column, gap[2], startEdge, {
  bottom: space.x3,
  alignItems: "flex-start",
  "& > *": { position: "static" },
});
const bottomCenter = d(pinned, passThrough, acrossWidth, layout.centre, { bottom: space.x3 });

export interface EditorUIProps {
  ui: DiagramUI;
}

/**
 * The editor's UI over its canvases, laid out as Excalidraw's: the main menu
 * and the properties panel at the top start, the toolbar in the middle, the
 * host's own UI and the stats at the top end, zoom and history at the bottom
 * start and help at the bottom end. It runs in the language's direction, so
 * a right-to-left language mirrors it; the canvas is drawn as it is.
 */
export function EditorUI(props: EditorUIProps) {
  return provide(
    DiagramUIContext,
    () => props.ui,
    () => <Layout />,
  );
}

/** The laser pointer beside the toolbar while collaborating, Excalidraw's `LaserPointerButton`. */
function LaserPointerButton() {
  const ui = useDiagramUI();
  function active() {
    return ui.store.state("activeTool").type === "laser";
  }
  return (
    <div class={island}>
      <button
        type="button"
        class={iconButton}
        aria-label={ui.t("toolBar.laser")}
        title={ui.t("toolBar.laser")}
        aria-pressed={active()}
        onClick={() => {
          const editor = ui.store.editor;
          editor?.batch(() => editor.setActiveTool({ type: "laser" }));
          ui.focusCanvas();
        }}
        data-testid="collab-laser"
      >
        <Zap aria-hidden="true" />
      </button>
    </div>
  );
}

interface ChildrenSlot {
  children?: unknown;
}

function Layout() {
  const value = useDiagramUI();
  function defaults() {
    return value.defaultUIEnabled();
  }
  function slots() {
    return value.host().slots;
  }
  const locale = provideLocale(() => value.langCode());
  function zen() {
    return value.store.state("zenModeEnabled");
  }
  function viewMode() {
    return value.store.state("viewModeEnabled");
  }
  function docked() {
    const name = value.dockedSidebar();
    return name !== null && value.store.state("openSidebar")?.name === name;
  }
  function editorInterface() {
    return value.store.editorInterface();
  }
  function phone() {
    return editorInterface().formFactor === "phone";
  }
  function collaborating() {
    return value.store.state("collaborators").size > 0;
  }
  function statusFrame() {
    return value.host().viewportStatusFrame;
  }
  function compact() {
    return editorInterface().formFactor === "tablet";
  }
  function scrollBackButton() {
    return (
      <Show
        when={
          value.uiControlEnabled("scrollBackToContent") &&
          value.store.state("scrolledOutside") &&
          !zen()
        }
      >
        <Button
          variant="secondary"
          onPress={() => {
            const editor = value.store.editor;
            editor?.batch(() => editor.scrollToContent());
          }}
          data-testid="scroll-back-to-content"
        >
          {value.t("buttons.scrollBackToContent")}
        </Button>
      </Show>
    );
  }
  return (
    <>
      <div
        class={layerUI}
        lang={locale.lang()}
        dir={locale.dir()}
        style={docked() ? { insetInlineEnd: `${DOCKED_SIDEBAR_INSET}px` } : undefined}
        data-diagram-ui=""
        data-form-factor={editorInterface().formFactor}
        data-touch={editorInterface().isTouchScreen ? "" : undefined}
        data-testid="editor-ui"
      >
        <Show when={slots().welcomeScreen} keyed>
          {(welcome: ChildrenSlot) => <WelcomeScreenLayer content={welcome.children as never} />}
        </Show>
        <Show when={!phone()} fallback={<PhoneChrome scrollBack={scrollBackButton()} />}>
          <div class={topStart}>
            {value.host().renderTopLeftUI?.(false, value.store.snapshot)}
            <Show when={!zen()}>
              <Show when={defaults() || slots().mainMenu}>
                <MainMenuButton />
              </Show>
              <Show when={defaults()}>
                <Show when={compact()} fallback={<PropertiesPanel />}>
                  <CompactPropertiesPanel />
                </Show>
              </Show>
            </Show>
          </div>
          <Show when={defaults() && !viewMode()}>
            <div class={topCenter} data-viewport-ui="top">
              <PenModeButton />
              <div class={toolbarAnchor}>
                <Toolbar />
                <HintViewer />
              </div>
              <Show when={value.host().isCollaborating}>
                <LaserPointerButton />
              </Show>
            </div>
          </Show>
          <div class={collaborating() ? `${topEnd} ${topEndWide}` : topEnd}>
            <div class={topEndRow}>
              <Show when={defaults() && collaborating()}>
                <UserList />
              </Show>
              {value.host().renderTopRightUI?.(false, value.store.snapshot)}
              <Show
                when={
                  (defaults() || slots().defaultSidebarTrigger) &&
                  !viewMode() &&
                  !(docked() && value.dockedSidebar() === DEFAULT_SIDEBAR.name)
                }
              >
                <SidebarTrigger />
              </Show>
            </div>
            <Show when={defaults()}>
              <StatsPanel />
            </Show>
          </div>
          <Show
            when={!zen()}
            fallback={
              <div class={bottomCenter}>
                <Button
                  variant="secondary"
                  onPress={() => value.run(actionToggleZenMode)}
                  data-testid="exit-zen-mode"
                >
                  {value.t("buttons.exitZenMode")}
                </Button>
              </div>
            }
          >
            <div class={bottomStack}>
              <Minimap />
              <div class={bottomStart}>
                <FooterStart />
              </div>
            </div>
            <Show when={slots().footer} keyed>
              {(footer: ChildrenSlot) => (
                <div class={bottomCenter} data-testid="footer-center">
                  {footer.children as never}
                </div>
              )}
            </Show>
            <div class={bottomEnd}>
              <Show when={defaults() && viewMode() && value.isEnabled(actionToggleViewMode)}>
                <div class={island}>
                  <button
                    type="button"
                    class={iconButton}
                    aria-label={value.t("labels.viewMode")}
                    aria-pressed="true"
                    title={`${value.t("labels.viewMode")} — ${value.shortcut("viewMode")}`}
                    onClick={() => value.run(actionToggleViewMode)}
                    data-testid="exit-view-mode"
                  >
                    <Pencil aria-hidden="true" />
                  </button>
                </div>
              </Show>
              <Show when={defaults()}>
                <FooterEnd />
              </Show>
            </div>
          </Show>
          <Show when={(value.store.state("scrolledOutside") && !zen()) || statusFrame()?.label}>
            <div class={scrollBack}>
              {scrollBackButton()}
              <Show when={statusFrame()?.label} keyed>
                {(label) => <ViewportStatusBadge label={label} border={statusFrame()?.border} />}
              </Show>
            </div>
          </Show>
        </Show>
        <Show when={statusFrame()?.border} keyed>
          {(border) => <ViewportStatusBorder border={border} />}
        </Show>
        <Show when={defaults()}>
          <ContextMenu />
          <ShapeSwitchPanel />
          <HyperlinkPopup />
          <ElementLinkDialog />
          <CommandPaletteDialog
            customCommandPaletteItems={slots().commandPalette?.customCommandPaletteItems}
          />
          <HelpDialog />
          <ChartDialog />
          <MagicFrameButtons />
          <ImageExportDialog />
          <JSONExportDialog />
        </Show>
        <TTDDialogBase />
        <EditorKeys />
        <EditorToasts />
        {value.hostChildren()}
      </div>
      <Show when={defaults() || slots().defaultSidebar}>
        <DefaultSidebar />
      </Show>
    </>
  );
}
