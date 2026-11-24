import { Show, createMemo } from "@barqjs/core";
import { CircleHelp } from "@barqjs/lucide/icons/circle-help";
import { Map as MapIcon } from "@barqjs/lucide/icons/map";
import { Redo2 } from "@barqjs/lucide/icons/redo-2";
import { Undo2 } from "@barqjs/lucide/icons/undo-2";
import { ZoomIn } from "@barqjs/lucide/icons/zoom-in";
import { ZoomOut } from "@barqjs/lucide/icons/zoom-out";
import { Toggle } from "@barqjs/ui/toggle";
import { MAX_ZOOM, MIN_ZOOM } from "@excalidraw/common";

import { actionResetZoom, actionZoomIn, actionZoomOut } from "../editor/actions/canvas.ts";
import { actionToggleMinimap, actionShortcuts } from "../editor/actions/toggles.ts";
import { useDiagramUI } from "./context.tsx";
import { iconButton, island } from "./styles.ts";
import { diagramLayer as d } from "./layer.ts";

const zoomLevel = d({
  // a fixed width: the level changing at every wheel step moves nothing else
  width: "56px",
  paddingInline: "6px",
  fontVariantNumeric: "tabular-nums",
  fontSize: "var(--text-xs)",
});

/** Bottom start: the zoom out, the level (which resets it) and zoom in; undo and redo; the minimap toggle. */
export function FooterStart() {
  const ui = useDiagramUI();
  const t = ui.t;
  // while a wheel or a pinch zooms, the level waits for the gesture's pause:
  // the canvas draws from bitmaps then, and the UI touches nothing per step
  const zoom = createMemo((previous: number | undefined): number => {
    const value = ui.store.state("zoom").value;
    return previous !== undefined && ui.store.state("shouldCacheIgnoreZoom") ? previous : value;
  });
  const history = () => ui.store.history();
  const level = () => `${(zoom() * 100).toFixed(0)}%`;
  const minimapOffered = () => ui.isEnabled(actionToggleMinimap);

  return (
    <>
      <div class={island} role="group" aria-label={t("labels.zoom")} data-testid="zoom-actions">
        <button
          type="button"
          class={iconButton}
          aria-label={t("buttons.zoomOut")}
          title={`${t("buttons.zoomOut")} — ${ui.shortcut("zoomOut")}`}
          aria-keyshortcuts="Control+-"
          disabled={zoom() <= MIN_ZOOM}
          onClick={() => ui.run(actionZoomOut)}
        >
          <ZoomOut aria-hidden="true" />
        </button>
        <button
          type="button"
          class={`${iconButton} ${zoomLevel}`}
          aria-label={`${t("buttons.resetZoom")}: ${level()}`}
          title={`${t("buttons.resetZoom")} — ${ui.shortcut("resetZoom")}`}
          aria-keyshortcuts="Control+0"
          onClick={() => ui.run(actionResetZoom)}
          data-testid="zoom-level"
        >
          {level()}
        </button>
        <button
          type="button"
          class={iconButton}
          aria-label={t("buttons.zoomIn")}
          title={`${t("buttons.zoomIn")} — ${ui.shortcut("zoomIn")}`}
          aria-keyshortcuts="Control+="
          disabled={zoom() >= MAX_ZOOM}
          onClick={() => ui.run(actionZoomIn)}
        >
          <ZoomIn aria-hidden="true" />
        </button>
        <Show when={minimapOffered()}>
          <Toggle
            class={iconButton}
            isSelected={ui.store.state("minimapEnabled")}
            onChange={() => ui.run(actionToggleMinimap)}
            aria-label={t("labels.minimap")}
            title={t("labels.minimap")}
            data-testid="button-minimap"
          >
            <MapIcon aria-hidden="true" />
          </Toggle>
        </Show>
      </div>
      <Show when={!ui.store.state("viewModeEnabled")}>
        <div class={island} role="group" aria-label={`${t("buttons.undo")} / ${t("buttons.redo")}`}>
          <button
            type="button"
            class={iconButton}
            aria-label={t("buttons.undo")}
            title={`${t("buttons.undo")} — ${ui.shortcut("undo")}`}
            aria-keyshortcuts="Control+Z"
            disabled={!history().canUndo}
            onClick={() => ui.runNamed("undo")}
            data-testid="button-undo"
          >
            <Undo2 aria-hidden="true" />
          </button>
          <button
            type="button"
            class={iconButton}
            aria-label={t("buttons.redo")}
            title={`${t("buttons.redo")} — ${ui.shortcut("redo")}`}
            aria-keyshortcuts="Control+Shift+Z"
            disabled={!history().canRedo}
            onClick={() => ui.runNamed("redo")}
            data-testid="button-redo"
          >
            <Redo2 aria-hidden="true" />
          </button>
        </div>
      </Show>
    </>
  );
}

/** Bottom end: the help button, which opens the shortcuts. */
export function FooterEnd() {
  const ui = useDiagramUI();
  const t = ui.t;
  return (
    <div class={island}>
      <button
        type="button"
        class={iconButton}
        aria-label={t("helpDialog.title")}
        title={`${t("helpDialog.title")} — ?`}
        aria-keyshortcuts="?"
        onClick={() => ui.run(actionShortcuts)}
        data-testid="help-icon"
      >
        <CircleHelp aria-hidden="true" />
      </button>
    </div>
  );
}
