import { CURSOR_TYPE, MIME_TYPES, THEME } from "@excalidraw/common";

import { isEraserActive, isHandToolActive } from "../app-state.ts";
import { getBucketFillBackgroundColor } from "./bucket-fill.ts";

import type { AppState } from "../types.ts";

const laserPointerCursorSVGTag = `<svg viewBox="0 0 24 24" stroke-width="1" width="28" height="28" xmlns="http://www.w3.org/2000/svg">`;
const laserPointerCursorBackgroundSVG = `<path d="M6.164 11.755a5.314 5.314 0 0 1-4.932-5.298 5.314 5.314 0 0 1 5.311-5.311 5.314 5.314 0 0 1 5.307 5.113l8.773 8.773a3.322 3.322 0 0 1 0 4.696l-.895.895a3.322 3.322 0 0 1-4.696 0l-8.868-8.868Z" style="fill:#fff"/>`;
const laserPointerCursorIconSVG = `<path stroke="#1b1b1f" fill="#fff" d="m7.868 11.113 7.773 7.774a2.359 2.359 0 0 0 1.667.691 2.368 2.368 0 0 0 2.357-2.358c0-.625-.248-1.225-.69-1.667L11.201 7.78 9.558 9.469l-1.69 1.643v.001Zm10.273 3.606-3.333 3.333m-3.25-6.583 2 2m-7-7 3 3M3.664 3.625l1 1M2.529 6.922l1.407-.144m5.735-2.932-1.118.866M4.285 9.823l.758-1.194m1.863-6.207-.13 1.408"/>`;
const laserPointerCursorLight = `data:${MIME_TYPES.svg},${encodeURIComponent(
  `${laserPointerCursorSVGTag}${laserPointerCursorIconSVG}</svg>`,
)}`;
const laserPointerCursorDark = `data:${MIME_TYPES.svg},${encodeURIComponent(
  `${laserPointerCursorSVGTag}${laserPointerCursorBackgroundSVG}${laserPointerCursorIconSVG}</svg>`,
)}`;

const BUCKET_FILL_PATHS = [
  "M5 16l1.465 1.638a2 2 0 1 1 -3.015 .099l1.55 -1.737z",
  "M13.737 9.737c2.299 -2.3 3.23 -5.095 2.081 -6.245c-1.15 -1.15 -3.945 -.217 -6.244 2.082c-2.3 2.299 -3.231 5.095 -2.082 6.244c1.15 1.15 3.946 .218 6.245 -2.081z",
  "M7.492 11.818c.362 .362 .768 .676 1.208 .934l6.895 4.047c1.078 .557 2.255 -.075 3.692 -1.512c1.437 -1.437 2.07 -2.614 1.512 -3.692c-.372 -.718 -1.72 -3.017 -4.047 -6.895a6.015 6.015 0 0 0 -.934 -1.208",
];

/** Excalidraw's bucket cursor, its paint in the colour it pours. */
const bucketFillCursor = (color: string): string => {
  const paths = BUCKET_FILL_PATHS.map(
    (path, index) => `<path d="${path}" ${index < 2 ? `fill="${color}"` : ""} />`,
  ).join("");
  return `url(data:${MIME_TYPES.svg},${encodeURIComponent(
    `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke-linecap="round" stroke-linejoin="round"><g stroke="#fff" fill="#fff" stroke-width="5">${paths}</g><g stroke="#1b1b1f" stroke-width="1.25">${paths}</g></svg>`,
  )}) 5 18, auto`;
};

const ERASER_CURSOR_SIZE = 20;

/**
 * The interactive canvas' cursor, set imperatively as Excalidraw's
 * `AppCursor` does: the active tool's at rest, the hover affordances
 * (move, resize, a point to grab) over what is under the pointer.
 */
export class EditorCursor {
  private toolCursorMemo: {
    type: AppState["activeTool"]["type"];
    theme?: AppState["theme"];
    bucketFillColor?: string;
  } | null = null;
  private eraserCursor: { theme: AppState["theme"]; url: string } | null = null;

  public constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly getState: () => AppState,
  ) {}

  public set(cursor: string): void {
    this.toolCursorMemo = null;
    this.canvas.style.cursor = cursor;
  }

  /** The resting cursor: a grab hand in view mode, the active tool's otherwise. */
  public reset(): void {
    if (this.getState().viewModeEnabled) {
      this.set(CURSOR_TYPE.GRAB);
    } else {
      this.applyForTool();
    }
  }

  public applyForTool(activeTool: AppState["activeTool"] = this.getState().activeTool): void {
    // the eraser's and the laser's cursors follow the theme
    const theme =
      activeTool.type === "eraser" || activeTool.type === "laser"
        ? this.getState().theme
        : undefined;
    const bucketFillColor =
      activeTool.type === "bucketfill"
        ? getBucketFillBackgroundColor(
            this.getState().currentItemBackgroundColor,
            this.getState().theme,
          )
        : undefined;
    if (
      this.toolCursorMemo?.type === activeTool.type &&
      this.toolCursorMemo.theme === theme &&
      this.toolCursorMemo.bucketFillColor === bucketFillColor
    ) {
      return;
    }
    if (activeTool.type === "selection") {
      this.set("");
    } else if (isHandToolActive({ activeTool })) {
      this.set(CURSOR_TYPE.GRAB);
    } else if (isEraserActive({ activeTool })) {
      this.set(this.getEraserCursor());
    } else if (activeTool.type === "laser") {
      this.set(
        `url(${this.getState().theme === THEME.LIGHT ? laserPointerCursorLight : laserPointerCursorDark}), auto`,
      );
    } else if (bucketFillColor !== undefined) {
      this.set(bucketFillCursor(bucketFillColor));
    } else if (activeTool.type !== "image" && activeTool.type !== "custom") {
      this.set(CURSOR_TYPE.CROSSHAIR);
    } else {
      this.set(CURSOR_TYPE.AUTO);
    }
    this.toolCursorMemo = { type: activeTool.type, theme, bucketFillColor };
  }

  /** A small circle, light on dark or dark on light, drawn once per theme. */
  private getEraserCursor(): string {
    const theme = this.getState().theme;
    if (!this.eraserCursor || this.eraserCursor.theme !== theme) {
      const isDarkTheme = theme === THEME.DARK;
      const canvas = this.canvas.ownerDocument.createElement("canvas");
      canvas.width = ERASER_CURSOR_SIZE;
      canvas.height = ERASER_CURSOR_SIZE;
      const context = canvas.getContext("2d");
      if (context) {
        context.lineWidth = 1;
        context.beginPath();
        context.arc(ERASER_CURSOR_SIZE / 2, ERASER_CURSOR_SIZE / 2, 5, 0, 2 * Math.PI);
        context.fillStyle = isDarkTheme ? "#000" : "#fff";
        context.fill();
        context.strokeStyle = isDarkTheme ? "#fff" : "#000";
        context.stroke();
      }
      this.eraserCursor = { theme, url: canvas.toDataURL(MIME_TYPES.svg) };
    }
    return `url(${this.eraserCursor.url}) ${ERASER_CURSOR_SIZE / 2} ${ERASER_CURSOR_SIZE / 2}, auto`;
  }
}
