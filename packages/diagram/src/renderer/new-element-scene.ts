import {
  getTargetFrame,
  isInvisiblySmallElement,
  renderElement,
  shouldApplyFrameClip,
} from "@excalidraw/element";

import {
  bootstrapCanvas,
  getNormalizedCanvasDimensions,
  snapScrollToDevicePixels,
} from "./helpers.ts";
import { frameClip } from "./static-scene.ts";

import type { NewElementSceneRenderConfig } from "../scene/types.ts";

/**
 * Draws the element being drawn out on a layer of its own, so the static
 * scene under it is not redrawn on every pointer move. Excalidraw's
 * `renderNewElementScene`.
 */
export function renderNewElementScene({
  canvas,
  rc,
  newElement,
  elementsMap,
  allElementsMap,
  scale,
  appState: unsnappedAppState,
  renderConfig,
}: NewElementSceneRenderConfig): void {
  if (!canvas) {
    return;
  }
  // the same whole-device-pixel scroll the static scene draws at
  const appState = snapScrollToDevicePixels(unsnappedAppState, scale);
  const [normalizedWidth, normalizedHeight] = getNormalizedCanvasDimensions(canvas, scale);

  const context = bootstrapCanvas({
    canvas,
    scale,
    normalizedWidth,
    normalizedHeight,
  });

  context.save();
  context.scale(appState.zoom.value, appState.zoom.value);

  if (newElement && newElement.type !== "selection") {
    // an arrow still under its drag threshold, and the like
    if (isInvisiblySmallElement(newElement)) {
      context.restore();
      return;
    }

    const frameId = newElement.frameId || appState.frameToHighlight?.id;

    if (frameId && appState.frameRendering.enabled && appState.frameRendering.clip) {
      const frame = getTargetFrame(newElement, elementsMap, appState);
      if (frame && shouldApplyFrameClip(newElement, frame, appState, elementsMap)) {
        frameClip(frame, context, renderConfig, appState);
      }
    }

    renderElement(newElement, elementsMap, allElementsMap, rc, context, renderConfig, appState);
  } else {
    context.clearRect(0, 0, normalizedWidth, normalizedHeight);
  }

  context.restore();
}
