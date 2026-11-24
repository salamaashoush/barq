import { type Child, Show, createSignal } from "@barqjs/core";
import { Pencil } from "@barqjs/lucide/icons/pencil";
import { PenTool } from "@barqjs/lucide/icons/pen-tool";
import { Redo2 } from "@barqjs/lucide/icons/redo-2";
import { SlidersHorizontal } from "@barqjs/lucide/icons/sliders-horizontal";
import { Undo2 } from "@barqjs/lucide/icons/undo-2";
import { Button } from "@barqjs/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@barqjs/ui/drawer";
import { Toggle } from "@barqjs/ui/toggle";

import { actionToggleViewMode } from "../editor/actions/toggles.ts";
import { useDiagramUI } from "./context.tsx";
import { bg, gap, layout, space } from "@barqjs/arc/style";

import { diagramLayer as d } from "./layer.ts";
import { MainMenuButton } from "./main-menu.tsx";
import { PropertiesPanel, createPropertiesVisible } from "./properties.tsx";
import { SidebarTrigger } from "./sidebar.tsx";
import { StatsPanel } from "./stats.tsx";
import { acrossWidth, iconButton, island, noPointer, passThrough, pinned } from "./styles.ts";
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

// the phone's bars, a little closer to the edges than the larger layouts' islands
const phoneInset = d({ insetInline: space.x2 });
const topBar = d(pinned, phoneInset, layout.row, layout.between, gap[2], {
  top: space.x2,
  alignItems: "flex-start",
  "& > *": { display: "flex", gap: space.x2, alignItems: "flex-start" },
});
const topBarEnd = d(layout.column, { alignItems: "flex-end" });
// pinned just inside the status frame's border, over the top bar's middle
const statusBadgeRow = d(pinned, acrossWidth, layout.centre, { top: space.x3, zIndex: "1" });
const topBarRow = d(layout.row, gap[2]);

const bottomBar = d(pinned, passThrough, phoneInset, layout.column, gap[1.5], {
  bottom: space.x2,
  alignItems: "center",
});
const actionsRow = d(noPointer, passThrough, layout.row, layout.between, gap[1.5], {
  alignSelf: "stretch",
});
const phonePanel = d(bg.transparent, {
  width: "auto",
  boxShadow: "none",
  paddingTop: "0",
  paddingInline: space.x4,
  paddingBottom: space.x4,
  maxHeight: "60vh",
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
export function PhoneChrome(props: { scrollBack: Child }) {
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
            <MainMenuButton />
          </Show>
        </div>
        <div class={topBarEnd}>
          <div class={topBarRow}>
            {ui.host().renderTopRightUI?.(true, store.snapshot) ?? (
              <Show when={!viewMode() && ui.defaultUIEnabled()}>
                <PenModeButton />
                <SidebarTrigger />
              </Show>
            )}
            <Show when={ui.defaultUIEnabled() && viewMode() && ui.isEnabled(actionToggleViewMode)}>
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
          <Show when={ui.defaultUIEnabled()}>
            <StatsPanel />
          </Show>
        </div>
      </div>
      <Show when={ui.host().viewportStatusFrame?.label} keyed>
        {(label) => (
          <div class={statusBadgeRow}>
            <ViewportStatusBadge label={label} border={ui.host().viewportStatusFrame?.border} />
          </div>
        )}
      </Show>
      <Show when={!viewMode() && !zen() && ui.defaultUIEnabled()}>
        <div class={bottomBar} data-viewport-ui="bottom" data-testid="phone-bottom-bar">
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
