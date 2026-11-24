import {
  COLOR_WHITE,
  KEYS,
  THEME,
  isColorDark,
  removeDarkModeFilter,
  rgbToHex,
} from "@excalidraw/common";

import type { DiagramEditor } from "../editor/editor.ts";

export interface AltKeyEvent {
  altKey: boolean;
}

export interface EyeDropperOptions {
  /** The colour picked, when the pointer goes up. */
  onSelect: (color: string, event: PointerEvent) => void;
  /** The colour under a held pointer, as it moves: a live preview. */
  onChange?: (color: string, event: AltKeyEvent) => void;
  onCancel?: () => void;
  /** Stays open for another pick while Alt is held, and goes when it is let go. */
  keepOpenOnAlt?: boolean;
}

const PREVIEW_SIZE = 28;
const PREVIEW_GAP = 7;

interface ClientPoint {
  clientX: number;
  clientY: number;
}

/**
 * Picks a colour off the canvas, Excalidraw's eye dropper: a layer over the
 * canvases takes the pointer, a swatch beside it shows the colour under it,
 * a held pointer previews it through `onChange`, letting go picks it and
 * Escape gives up. In dark mode the colour is the one the element has, the
 * filter the canvas draws through taken back off.
 */
export function startEyeDropper(editor: DiagramEditor, options: EyeDropperOptions): () => void {
  const document = editor.ownerDocument;
  const view = editor.ownerWindow;
  const container = editor.container;
  const overlay = document.createElement("div");
  overlay.setAttribute("data-diagram-ui", "");
  overlay.setAttribute("data-testid", "eye-dropper-overlay");
  overlay.tabIndex = -1;
  overlay.style.cssText =
    "position:absolute;inset:0;z-index:5;cursor:crosshair;touch-action:none;outline:none";
  const preview = document.createElement("div");
  preview.setAttribute("aria-hidden", "true");
  preview.style.cssText = `position:absolute;width:${PREVIEW_SIZE}px;height:${PREVIEW_SIZE}px;border-radius:6px;--shade:rgb(0 0 0 / 0.2);box-shadow:0 0 0 1px var(--shade), 0 2px 6px var(--shade);pointer-events:none;display:none`;
  overlay.append(preview);
  container.append(overlay);
  overlay.focus();

  let holding = false;

  function sample(event: ClientPoint): string | null {
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
  }

  function toApply(color: string): string {
    return editor.state.theme === THEME.DARK ? removeDarkModeFilter(color) : color;
  }

  function stop(): void {
    holding = false;
    overlay.removeEventListener("pointerdown", onDown);
    overlay.removeEventListener("pointerup", onUp);
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("keyup", onKeyUp, true);
    view.removeEventListener("pointermove", onMove);
    view.removeEventListener("blur", onBlur);
    overlay.remove();
  }
  function onMove(event: PointerEvent): void {
    const color = sample(event);
    if (!color) return;
    const rect = container.getBoundingClientRect();
    // beside the cursor, flipped to its other side near the container's edge
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const left =
      x + PREVIEW_GAP + PREVIEW_SIZE > rect.width
        ? x - PREVIEW_GAP - PREVIEW_SIZE
        : x + PREVIEW_GAP;
    const top =
      y + PREVIEW_GAP + PREVIEW_SIZE > rect.height
        ? y - PREVIEW_GAP - PREVIEW_SIZE
        : y + PREVIEW_GAP;
    preview.style.display = "";
    preview.style.background = color;
    preview.style.outline = `2px solid ${isColorDark(color) ? COLOR_WHITE : "#222"}`;
    preview.style.left = `${left}px`;
    preview.style.top = `${top}px`;
    if (holding) {
      options.onChange?.(toApply(color), { altKey: event.altKey });
    }
  }
  function onDown(event: PointerEvent): void {
    holding = true;
    // the canvas under it takes nothing; pointermove still has to arrive
    event.stopImmediatePropagation();
    onMove(event);
  }
  function onUp(event: PointerEvent): void {
    event.preventDefault();
    event.stopImmediatePropagation();
    const color = sample(event);
    holding = false;
    if (options.keepOpenOnAlt === true && event.altKey) {
      if (color) options.onSelect(toApply(color), event);
      return;
    }
    stop();
    if (color) {
      options.onSelect(toApply(color), event);
    } else {
      options.onCancel?.();
    }
    editor.focusContainer();
  }
  function onKey(event: KeyboardEvent): void {
    if (event.key === KEYS.ESCAPE) {
      event.preventDefault();
      event.stopImmediatePropagation();
      stop();
      options.onCancel?.();
      editor.focusContainer();
    }
  }
  function onKeyUp(event: KeyboardEvent): void {
    if (options.keepOpenOnAlt === true && event.key === KEYS.ALT) {
      stop();
      options.onCancel?.();
    }
  }
  function onBlur(): void {
    stop();
    options.onCancel?.();
  }

  overlay.addEventListener("pointerdown", onDown);
  overlay.addEventListener("pointerup", onUp);
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("keyup", onKeyUp, true);
  view.addEventListener("pointermove", onMove, { passive: true });
  view.addEventListener("blur", onBlur);
  return stop;
}
