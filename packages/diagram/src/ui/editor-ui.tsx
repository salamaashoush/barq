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
import { ImageExportDialog, JSONExportDialog } from "./export-dialogs.tsx";
import { HelpDialog } from "./help-dialog.tsx";
import { HintViewer } from "./hint-viewer.tsx";
import { ElementLinkDialog, HyperlinkPopup } from "./hyperlink.tsx";
import { Minimap } from "./minimap.tsx";
import { ShapeSwitchPanel } from "./shape-switch.tsx";
import { StatsPanel } from "./stats.tsx";
import { EditorToasts } from "./toasts.tsx";
import { diagramLayer as d } from "./layer.ts";
import { actionToggleViewMode, actionToggleZenMode } from "../editor/actions/toggles.ts";
import { Pencil } from "@barqjs/lucide/icons/pencil";
import { Button } from "@barqjs/ui/button";

const scrollBack = d({
  position: "absolute",
  bottom: "60px",
  insetInline: "0",
  display: "flex",
  justifyContent: "center",
  "& > *": { pointerEvents: "auto" },
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
    () => <Layout mainMenu={props.mainMenu} />,
  );
}

function Layout(props: { mainMenu?: () => Child }) {
  const value = useDiagramUI();
  const locale = provideLocale(() => value.langCode());
  const zen = () => value.store.state("zenModeEnabled");
  const viewMode = () => value.store.state("viewModeEnabled");
  return (
    <div
      class={layerUI}
      lang={locale.lang()}
      dir={locale.dir()}
      data-diagram-ui=""
      data-testid="editor-ui"
    >
      <div class={topStart}>
        {value.host().renderTopLeftUI?.(false, value.store.snapshot)}
        <Show when={!zen()}>
          <MainMenuButton items={props.mainMenu} />
          <PropertiesPanel />
        </Show>
      </div>
      <Show when={!viewMode()}>
        <div class={topCenter}>
          <div class={toolbarAnchor}>
            <Toolbar />
            <HintViewer />
          </div>
        </div>
      </Show>
      <div class={topEnd}>
        {value.host().renderTopRightUI?.(false, value.store.snapshot)}
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
      <Show when={value.store.state("scrolledOutside") && !zen()}>
        <div class={scrollBack}>
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
        </div>
      </Show>
      <ContextMenu />
      <ShapeSwitchPanel />
      <HyperlinkPopup />
      <ElementLinkDialog />
      <CommandPalette />
      <HelpDialog />
      <ChartDialog />
      <ImageExportDialog />
      <JSONExportDialog />
      <EditorToasts />
    </div>
  );
}
