import { type Child, Show, provide } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";

import { DiagramUIContext, type DiagramUI, useDiagramUI } from "./context.tsx";
import { ContextMenu } from "./context-menu.tsx";
import { FooterEnd, FooterStart } from "./footer.tsx";
import { MainMenuButton } from "./main-menu.tsx";
import { PropertiesPanel } from "./properties.tsx";
import {
  bottomEnd,
  bottomStart,
  iconButton,
  island,
  layerUI,
  topCenter,
  topEnd,
  topStart,
} from "./styles.ts";
import { Toolbar } from "./toolbar.tsx";
import { ChartDialog } from "./chart-dialog.tsx";
import { CommandPalette } from "./command-palette.tsx";
import { EditorKeys } from "./editor-keys.tsx";
import { ImageExportDialog, JSONExportDialog } from "./export-dialogs.tsx";
import { HelpDialog } from "./help-dialog.tsx";
import { MagicFrameButtons } from "./embeds.tsx";
import { TTDDialog } from "./ttd-dialog.tsx";
import { HintViewer } from "./hint-viewer.tsx";
import { ElementLinkDialog, HyperlinkPopup } from "./hyperlink.tsx";
import { Minimap } from "./minimap.tsx";
import { ShapeSwitchPanel } from "./shape-switch.tsx";
import {
  DOCKED_SIDEBAR_INSET,
  DefaultSidebar,
  SidebarTrigger,
  isSidebarDocked,
} from "./sidebar.tsx";
import { StatsPanel } from "./stats.tsx";
import { EditorToasts } from "./toasts.tsx";
import { diagramLayer as d } from "./layer.ts";
import { actionToggleViewMode, actionToggleZenMode } from "../editor/actions/toggles.ts";
import { Pencil } from "@barqjs/lucide/icons/pencil";
import { Zap } from "@barqjs/lucide/icons/zap";
import { WelcomeScreenLayer } from "./welcome-screen.tsx";
import { CompactProperties, PenModeButton, PhoneChrome } from "./layouts.tsx";
import { Button } from "@barqjs/ui/button";
import { UserList } from "./user-list.tsx";
import { ViewportStatusBadge, ViewportStatusBorder } from "./viewport-status-frame.tsx";

const scrollBack = d({
  position: "absolute",
  bottom: "60px",
  insetInline: "0",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "8px",
  "& > *": { pointerEvents: "auto" },
});
// the user list reaches back to the middle, beside the toolbar
const topEndWide = d({ insetInlineStart: "50%" });
const topEndRow = d({
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "8px",
  alignSelf: "stretch",
  minWidth: "0",
});
const toolbarAnchor = d({ position: "relative", pointerEvents: "none" });
const bottomStack = d({
  position: "absolute",
  bottom: "12px",
  insetInlineStart: "12px",
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "8px",
  pointerEvents: "none",
  "& > *": { position: "static" },
});
const bottomCenter = d({
  position: "absolute",
  bottom: "12px",
  insetInline: "0",
  display: "flex",
  justifyContent: "center",
  "& > *": { pointerEvents: "auto" },
});

export interface EditorUIProps {
  ui: DiagramUI;
  /** The main menu's entries, replacing Excalidraw's defaults. */
  mainMenu?: () => Child;
  /** The welcome screen over an empty scene, `true` for Excalidraw's. */
  welcomeScreen?: true | Child;
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
    () => <Layout mainMenu={props.mainMenu} welcomeScreen={props.welcomeScreen} />,
  );
}

/** The laser pointer beside the toolbar while collaborating, Excalidraw's `LaserPointerButton`. */
function LaserPointerButton() {
  const ui = useDiagramUI();
  const active = () => ui.store.state("activeTool").type === "laser";
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

function Layout(props: { mainMenu?: () => Child; welcomeScreen?: true | Child }) {
  const value = useDiagramUI();
  const locale = provideLocale(() => value.langCode());
  const zen = () => value.store.state("zenModeEnabled");
  const viewMode = () => value.store.state("viewModeEnabled");
  const docked = () => {
    const editor = value.store.editor;
    value.store.state("width");
    return (
      editor !== null &&
      isSidebarDocked(
        value.store.state("openSidebar"),
        value.store.state("defaultSidebarDockedPreference"),
        editor.canFitSidebar(),
      )
    );
  };
  const editorInterface = () => value.store.editorInterface();
  const phone = () => editorInterface().formFactor === "phone";
  const collaborating = () => value.store.state("collaborators").size > 0;
  const statusFrame = () => value.host().viewportStatusFrame;
  const compact = () => editorInterface().formFactor === "tablet";
  const scrollBackButton = () => (
    <Show when={value.store.state("scrolledOutside") && !zen()}>
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
        <Show when={props.welcomeScreen !== undefined}>
          <WelcomeScreenLayer content={props.welcomeScreen ?? true} />
        </Show>
        <Show
          when={!phone()}
          fallback={<PhoneChrome mainMenu={props.mainMenu} scrollBack={scrollBackButton()} />}
        >
          <div class={topStart}>
            {value.host().renderTopLeftUI?.(false, value.store.snapshot)}
            <Show when={!zen()}>
              <MainMenuButton items={props.mainMenu} />
              <Show when={compact()} fallback={<PropertiesPanel />}>
                <CompactProperties />
              </Show>
            </Show>
          </div>
          <Show when={!viewMode()}>
            <div class={topCenter}>
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
              <Show when={collaborating()}>
                <UserList />
              </Show>
              {value.host().renderTopRightUI?.(false, value.store.snapshot)}
              <Show when={!viewMode() && !docked()}>
                <SidebarTrigger />
              </Show>
            </div>
            <StatsPanel />
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
            <div class={bottomEnd}>
              <Show when={viewMode() && value.isEnabled(actionToggleViewMode)}>
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
              <FooterEnd />
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
        <ContextMenu />
        <ShapeSwitchPanel />
        <HyperlinkPopup />
        <ElementLinkDialog />
        <CommandPalette />
        <HelpDialog />
        <ChartDialog />
        <TTDDialog />
        <MagicFrameButtons />
        <ImageExportDialog />
        <JSONExportDialog />
        <EditorKeys />
        <EditorToasts />
      </div>
      <DefaultSidebar />
    </>
  );
}
