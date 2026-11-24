import { type Child, Show, createSignal } from "@barqjs/core";
import { Pencil } from "@barqjs/lucide/icons/pencil";
import { PenTool } from "@barqjs/lucide/icons/pen-tool";
import { Redo2 } from "@barqjs/lucide/icons/redo-2";
import { SlidersHorizontal } from "@barqjs/lucide/icons/sliders-horizontal";
import { Undo2 } from "@barqjs/lucide/icons/undo-2";
import { Button } from "@barqjs/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@barqjs/ui/drawer";
import { Popover, PopoverContent, PopoverTrigger } from "@barqjs/ui/popover";
import { Toggle } from "@barqjs/ui/toggle";

import { actionToggleViewMode } from "../editor/actions/toggles.ts";
import { useDiagramUI } from "./context.tsx";
import { diagramLayer as d } from "./layer.ts";
import { MainMenuButton } from "./main-menu.tsx";
import { PropertiesPanel, createPropertiesVisible } from "./properties.tsx";
import { SidebarTrigger } from "./sidebar.tsx";
import { StatsPanel } from "./stats.tsx";
import { iconButton, island } from "./styles.ts";
import { PhoneToolbar } from "./toolbar.tsx";
import { ViewportStatusBadge } from "./viewport-status-frame.tsx";

/**
 * Pen mode, Excalidraw's `PenModeButton`: once a pen has drawn, the pen draws
 * and a finger pans. It shows only after a pen is detected.
 */
export function PenModeButton() {
  const ui = useDiagramUI();
  const store = ui.store;
  return (
    <Show when={store.state("penDetected")}>
      <div class={island}>
        <Toggle
          class={iconButton}
          isSelected={store.state("penMode")}
          onChange={(selected: boolean) => {
            const editor = store.editor;
            editor?.batch(() => editor.setState({ penMode: selected }));
          }}
          aria-label={ui.t("toolBar.penMode")}
          title={ui.t("toolBar.penMode")}
          data-testid="pen-mode"
        >
          <PenTool aria-hidden="true" />
        </Toggle>
      </div>
    </Show>
  );
}

const compactPanel = d({ maxHeight: "min(70vh, 560px)", boxShadow: "none", padding: "4px" });

/**
 * The properties panel on a tablet, where the canvas has no room to spare for
 * it: a button at the top start that opens it in a popover.
 */
export function CompactProperties() {
  const ui = useDiagramUI();
  const visible = createPropertiesVisible(ui);
  const [open, setOpen] = createSignal(false);
  return (
    <Show when={visible()}>
      <Popover isOpen={open()} onOpenChange={setOpen}>
        <PopoverTrigger>
          <Button
            variant="ghost"
            size="icon"
            class={`${iconButton} ${island}`}
            aria-label={ui.t("headings.selectedShapeActions")}
            title={ui.t("headings.selectedShapeActions")}
            data-testid="compact-properties"
          >
            <SlidersHorizontal aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent side="right" align="start">
          <PropertiesPanel class={compactPanel} />
        </PopoverContent>
      </Popover>
    </Show>
  );
}

const topBar = d({
  position: "absolute",
  top: "8px",
  insetInline: "8px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "8px",
  pointerEvents: "none",
  "& > *": { display: "flex", gap: "8px", alignItems: "flex-start" },
});
const topBarEnd = d({ flexDirection: "column", alignItems: "flex-end" });
// pinned just inside the status frame's border, over the top bar's middle
const statusBadgeRow = d({
  position: "absolute",
  top: "12px",
  insetInline: "0",
  display: "flex",
  justifyContent: "center",
  pointerEvents: "none",
  zIndex: "1",
});
const topBarRow = d({ display: "flex", gap: "8px" });

const bottomBar = d({
  position: "absolute",
  bottom: "8px",
  insetInline: "8px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "6px",
  pointerEvents: "none",
  "& > *": { pointerEvents: "auto" },
});
const actionsRow = d({
  display: "flex",
  alignSelf: "stretch",
  justifyContent: "space-between",
  gap: "6px",
  pointerEvents: "none",
  "& > *": { pointerEvents: "auto" },
});
const phonePanel = d({
  width: "auto",
  boxShadow: "none",
  padding: "0 16px 16px",
  maxHeight: "60vh",
  backgroundColor: "transparent",
});

/**
 * The properties of the selection on a phone, Excalidraw's mobile shape
 * actions: a bottom sheet the bar's button opens over the canvas.
 */
function PropertiesDrawer() {
  const ui = useDiagramUI();
  const visible = createPropertiesVisible(ui);
  const [open, setOpen] = createSignal(false);
  return (
    <Show when={visible()}>
      <Button
        variant="ghost"
        size="icon"
        class={`${iconButton} ${island}`}
        aria-label={ui.t("headings.selectedShapeActions")}
        aria-haspopup="dialog"
        aria-expanded={open()}
        title={ui.t("headings.selectedShapeActions")}
        onPress={() => setOpen(true)}
        data-testid="phone-properties"
      >
        <SlidersHorizontal aria-hidden="true" />
      </Button>
      <Drawer open={open() && visible()} onOpenChange={setOpen} direction="bottom">
        <DrawerContent data-testid="phone-properties-drawer">
          <DrawerHeader>
            <DrawerTitle>{ui.t("headings.selectedShapeActions")}</DrawerTitle>
          </DrawerHeader>
          <PropertiesPanel class={phonePanel} />
        </DrawerContent>
      </Drawer>
    </Show>
  );
}

function HistoryButtons() {
  const ui = useDiagramUI();
  const history = () => ui.store.history();
  return (
    <div class={island} role="group" aria-label={ui.t("buttons.undo")}>
      <button
        type="button"
        class={iconButton}
        aria-label={ui.t("buttons.undo")}
        title={ui.t("buttons.undo")}
        disabled={!history().canUndo}
        onClick={() => ui.runNamed("undo")}
        data-testid="phone-undo"
      >
        <Undo2 aria-hidden="true" />
      </button>
      <button
        type="button"
        class={iconButton}
        aria-label={ui.t("buttons.redo")}
        title={ui.t("buttons.redo")}
        disabled={!history().canRedo}
        onClick={() => ui.runNamed("redo")}
        data-testid="phone-redo"
      >
        <Redo2 aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * Excalidraw's mobile UI: the main menu and the host's UI along the top, pen
 * mode and the library at its end, and along the bottom the properties, undo
 * and redo over the toolbar, every control a finger's size.
 */
export function PhoneChrome(props: { mainMenu?: () => Child; scrollBack: Child }) {
  const ui = useDiagramUI();
  const store = ui.store;
  const zen = () => store.state("zenModeEnabled");
  const viewMode = () => store.state("viewModeEnabled");
  return (
    <>
      <div class={topBar} data-testid="phone-top-bar">
        <div>
          {ui.host().renderTopLeftUI?.(true, store.snapshot)}
          <Show when={!zen()}>
            <MainMenuButton items={props.mainMenu} />
          </Show>
        </div>
        <div class={topBarEnd}>
          <div class={topBarRow}>
            {ui.host().renderTopRightUI?.(true, store.snapshot) ?? (
              <Show when={!viewMode()}>
                <PenModeButton />
                <SidebarTrigger />
              </Show>
            )}
            <Show when={viewMode() && ui.isEnabled(actionToggleViewMode)}>
              <div class={island}>
                <button
                  type="button"
                  class={iconButton}
                  aria-label={ui.t("labels.viewMode")}
                  aria-pressed="true"
                  onClick={() => ui.run(actionToggleViewMode)}
                  data-testid="exit-view-mode"
                >
                  <Pencil aria-hidden="true" />
                </button>
              </div>
            </Show>
          </div>
          <StatsPanel />
        </div>
      </div>
      <Show when={ui.host().viewportStatusFrame?.label} keyed>
        {(label) => (
          <div class={statusBadgeRow}>
            <ViewportStatusBadge label={label} border={ui.host().viewportStatusFrame?.border} />
          </div>
        )}
      </Show>
      <Show when={!viewMode() && !zen()}>
        <div class={bottomBar} data-testid="phone-bottom-bar">
          {props.scrollBack}
          <div class={actionsRow}>
            <PropertiesDrawer />
            <HistoryButtons />
          </div>
          <PhoneToolbar />
        </div>
      </Show>
    </>
  );
}
