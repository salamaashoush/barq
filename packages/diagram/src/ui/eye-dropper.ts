import { KEYS, rgbToHex } from "@excalidraw/common";

import type { DiagramEditor } from "../editor/editor.ts";

export interface EyeDropperOptions {
  onSelect: (color: string, event: PointerEvent) => void;
  onCancel?: () => void;
}

const PREVIEW_SIZE = 28;

/**
 * Picks a colour off the canvas, Excalidraw's eye dropper: a layer over the
 * canvases takes the pointer, a swatch beside it shows the colour under it,
 * a press picks it and Escape gives up. The colour is read from the scene's
 * canvas as drawn, so it is what the reader sees, the dark mode filter
 * included.
 */
export const startEyeDropper = (
  editor: DiagramEditor,
  options: EyeDropperOptions,
): (() => void) => {
  const document = editor.ownerDocument;
  const container = editor.container;
  const overlay = document.createElement("div");
  overlay.setAttribute("data-diagram-ui", "");
  overlay.setAttribute("data-testid", "eye-dropper-overlay");
  overlay.style.cssText = "position:absolute;inset:0;z-index:5;cursor:crosshair;touch-action:none";
  const preview = document.createElement("div");
  preview.setAttribute("aria-hidden", "true");
  preview.style.cssText = `position:absolute;width:${PREVIEW_SIZE}px;height:${PREVIEW_SIZE}px;border-radius:6px;box-shadow:0 0 0 1px rgb(0 0 0 / 0.2), 0 2px 6px rgb(0 0 0 / 0.2);pointer-events:none;display:none`;
  overlay.append(preview);
  container.append(overlay);

  const sample = (event: PointerEvent): string | null => {
    const canvas = editor.canvas;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / Math.max(1, rect.width || canvas.width);
    try {
      const pixel = context.getImageData(
        Math.floor((event.clientX - rect.left) * scale),
        Math.floor((event.clientY - rect.top) * scale),
        1,
        1,
      ).data;
      return rgbToHex(pixel[0] ?? 0, pixel[1] ?? 0, pixel[2] ?? 0);
    } catch {
      return null;
    }
  };

  const stop = (): void => {
    overlay.removeEventListener("pointermove", onMove);
    overlay.removeEventListener("pointerdown", onDown);
    document.removeEventListener("keydown", onKey, true);
    overlay.remove();
  };
  const onMove = (event: PointerEvent): void => {
    const color = sample(event);
    if (!color) return;
    const rect = container.getBoundingClientRect();
    preview.style.display = "";
    preview.style.background = color;
    preview.style.left = `${event.clientX - rect.left + 12}px`;
    preview.style.top = `${event.clientY - rect.top + 12}px`;
  };
  const onDown = (event: PointerEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    const color = sample(event);
    stop();
    if (color) {
      options.onSelect(color, event);
    } else {
      options.onCancel?.();
    }
    editor.focusContainer();
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === KEYS.ESCAPE) {
      event.preventDefault();
      event.stopPropagation();
      stop();
      options.onCancel?.();
      editor.focusContainer();
    }
  };
  overlay.addEventListener("pointermove", onMove);
  overlay.addEventListener("pointerdown", onDown);
  document.addEventListener("keydown", onKey, true);
  return stop;
};
