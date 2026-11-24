import { Show, createEffect, onCleanup } from "@barqjs/core";
import { THEME, applyDarkModeFilter } from "@excalidraw/common";
import { getCommonBounds, getElementAbsoluteCoords } from "@excalidraw/element";

import { actionToggleMinimap } from "../editor/actions/toggles.ts";
import { useDiagramUI } from "./context.tsx";
import { diagramLayer as d } from "./layer.ts";
import { island } from "./styles.ts";

import type { DiagramEditor } from "../editor/editor.ts";

const WIDTH = 200;
const HEIGHT = 130;
const PADDING = 8;

const surface = d({
  padding: "0",
  overflow: "hidden",
  cursor: "pointer",
  touchAction: "none",
  "& canvas": { display: "block" },
});

interface Frame {
  scale: number;
  originX: number;
  originY: number;
}

/** The scene and the viewport, fitted into the minimap: where scene point (0, 0) lands and how small. */
const frameOf = (editor: DiagramEditor): Frame => {
  const { state } = editor;
  const elements = editor.scene.getNonDeletedElements();
  const zoom = state.zoom.value;
  const viewport = {
    minX: -state.scrollX,
    minY: -state.scrollY,
    maxX: -state.scrollX + state.width / zoom,
    maxY: -state.scrollY + state.height / zoom,
  };
  let [minX, minY, maxX, maxY] = elements.length
    ? getCommonBounds(elements)
    : [viewport.minX, viewport.minY, viewport.maxX, viewport.maxY];
  minX = Math.min(minX, viewport.minX);
  minY = Math.min(minY, viewport.minY);
  maxX = Math.max(maxX, viewport.maxX);
  maxY = Math.max(maxY, viewport.maxY);
  const scale = Math.min(
    (WIDTH - PADDING * 2) / Math.max(1, maxX - minX),
    (HEIGHT - PADDING * 2) / Math.max(1, maxY - minY),
  );
  return {
    scale,
    originX: PADDING - minX * scale + (WIDTH - PADDING * 2 - (maxX - minX) * scale) / 2,
    originY: PADDING - minY * scale + (HEIGHT - PADDING * 2 - (maxY - minY) * scale) / 2,
  };
};

const draw = (canvas: HTMLCanvasElement, editor: DiagramEditor): Frame => {
  const frame = frameOf(editor);
  const ratio = editor.ownerWindow.devicePixelRatio || 1;
  if (canvas.width !== WIDTH * ratio) canvas.width = WIDTH * ratio;
  if (canvas.height !== HEIGHT * ratio) canvas.height = HEIGHT * ratio;
  const context = canvas.getContext("2d");
  if (!context) return frame;
  const { state } = editor;
  const dark = state.theme === THEME.DARK;
  const color = (value: string) => (dark ? applyDarkModeFilter(value) : value);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.fillStyle = color(state.viewBackgroundColor);
  context.fillRect(0, 0, WIDTH, HEIGHT);
  const elementsMap = editor.scene.getNonDeletedElementsMap();
  for (const element of editor.scene.getNonDeletedElements()) {
    const [x1, y1, x2, y2] = getElementAbsoluteCoords(element, elementsMap);
    context.fillStyle = color(
      element.backgroundColor === "transparent" ? element.strokeColor : element.backgroundColor,
    );
    context.globalAlpha =
      (element.backgroundColor === "transparent" ? 0.35 : 0.8) * (element.opacity / 100);
    context.fillRect(
      frame.originX + x1 * frame.scale,
      frame.originY + y1 * frame.scale,
      Math.max(1, (x2 - x1) * frame.scale),
      Math.max(1, (y2 - y1) * frame.scale),
    );
  }
  context.globalAlpha = 1;
  const zoom = state.zoom.value;
  context.strokeStyle = dark ? "#a5d8ff" : "#1971c2";
  context.lineWidth = 1.5;
  context.strokeRect(
    frame.originX - state.scrollX * frame.scale,
    frame.originY - state.scrollY * frame.scale,
    (state.width / zoom) * frame.scale,
    (state.height / zoom) * frame.scale,
  );
  return frame;
};

/**
 * Excalidraw's minimap: the whole scene with the viewport on it, above the
 * zoom controls. A press or a drag on it moves the viewport there. It draws
 * once a frame at most, and not at all while it is closed.
 */
export function Minimap() {
  const ui = useDiagramUI();
  const store = ui.store;
  const open = () => store.state("minimapEnabled") && ui.isEnabled(actionToggleMinimap);

  return (
    <Show when={open()}>
      {(() => {
        let canvas: HTMLCanvasElement | undefined;
        let frame: Frame | null = null;
        let pending: number | null = null;
        const editor = store.editor;
        const redraw = (): void => {
          if (pending !== null || !editor || !canvas) return;
          pending = editor.ownerWindow.requestAnimationFrame(() => {
            pending = null;
            if (canvas && !editor.isDestroyed) frame = draw(canvas, editor);
          });
        };
        // the minimap follows the scene and the viewport, outside the reactive graph
        const off = editor?.onChange(redraw);
        onCleanup(() => {
          off?.();
          if (pending !== null) editor?.ownerWindow.cancelAnimationFrame(pending);
        });
        createEffect(
          () => store.state("theme"),
          () => redraw(),
        );
        const moveTo = (event: PointerEvent): void => {
          if (!editor || !canvas || !frame) return;
          const rect = canvas.getBoundingClientRect();
          const sceneX = (event.clientX - rect.left - frame.originX) / frame.scale;
          const sceneY = (event.clientY - rect.top - frame.originY) / frame.scale;
          const zoom = editor.state.zoom.value;
          editor.batch(() =>
            editor.translateViewport({
              scrollX: -(sceneX - editor.state.width / zoom / 2),
              scrollY: -(sceneY - editor.state.height / zoom / 2),
            }),
          );
        };
        return (
          <div class={`${island} ${surface}`} data-testid="minimap">
            <canvas
              ref={(element: HTMLCanvasElement) => {
                canvas = element;
                redraw();
              }}
              role="img"
              aria-label={ui.t("labels.minimap")}
              style={{ width: `${WIDTH}px`, height: `${HEIGHT}px` }}
              onPointerDown={(event: PointerEvent) => {
                (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
                moveTo(event);
              }}
              onPointerMove={(event: PointerEvent) => {
                if (event.buttons & 1) moveTo(event);
              }}
            />
          </div>
        );
      })()}
    </Show>
  );
}
