import {
  applyDarkModeFilter,
  BUCKET_FILL_BACKGROUND_PICKS,
  COLOR_PALETTE,
  DEFAULT_ELEMENT_BACKGROUND_COLOR_INDEX,
  getSizeFromPoints,
  isTransparent,
  THEME,
} from "@excalidraw/common";
import {
  CaptureUpdateAction,
  computeBucketFillPolygon,
  isBucketFillCompatible,
  isFrameLikeElement,
  isRestylableFill,
  newLinearElement,
  ShapeCache,
} from "@excalidraw/element";
import { pointFrom } from "@excalidraw/math";

import type { NonDeletedExcalidrawElement, Theme } from "@excalidraw/element/types";
import type { GlobalPoint, LocalPoint } from "@excalidraw/math";

import { startEyeDropper } from "../ui/eye-dropper.ts";

import type { LocalizedMessage } from "../i18n.ts";
import type { Action } from "./types.ts";
import type { DiagramEditor } from "./editor.ts";

/** The fill the bucket pours: the shared background colour, green where that is transparent. */
export const getBucketFillBackgroundColor = (backgroundColor: string, theme?: Theme): string =>
  isTransparent(backgroundColor)
    ? (COLOR_PALETTE.green[DEFAULT_ELEMENT_BACKGROUND_COLOR_INDEX] ?? "#b2f2bb")
    : applyDarkModeFilter(backgroundColor, theme === THEME.DARK);

const KEYBOARD_PICKS = BUCKET_FILL_BACKGROUND_PICKS.filter(
  (color) => color !== COLOR_PALETTE.white,
);

/** The bucket fill's colour, which the tool's panel, its eye dropper and B again set. */
export const actionChangeBucketFillBackgroundColor: Action<{
  currentItemBackgroundColor: string;
}> = {
  name: "changeBucketFillBackgroundColor",
  label: "labels.changeBackground",
  announcement: "Fill colour changed",
  perform: (_elements, appState, value) => ({
    appState: { ...appState, ...value },
    captureUpdate: CaptureUpdateAction.EVENTUALLY,
  }),
};

const toast = (key: LocalizedMessage["key"]) => ({
  message: { key } satisfies LocalizedMessage,
  duration: 3000,
});

/**
 * Excalidraw's bucket fill tool (B): a click fills the closed region under
 * it with a strokeless polygon, stacked just above what bounds it, in the
 * tool's colour, fill style and opacity. A click on a fill it made restyles
 * it instead. The press only arms the fill; it is poured when the pointer
 * goes up, so a second finger, a context menu or a cancelled pointer leaves
 * the scene as it was. Alt held opens an eye dropper for the colour.
 */
export class BucketFill {
  private pending: { x: number; y: number } | null = null;
  private stopEyeDropper: (() => void) | null = null;

  public constructor(private readonly app: DiagramEditor) {}

  public handlePointerDown(scenePointer: { x: number; y: number }): void {
    this.pending = scenePointer;
  }

  public handlePointerUp(): void {
    const point = this.pending;
    this.pending = null;
    if (point) {
      this.fill(point);
    }
  }

  public cancel(): void {
    this.pending = null;
  }

  /** B with the tool already active steps through the colours. */
  public cycleBackgroundColor(): void {
    const current = getBucketFillBackgroundColor(this.app.state.currentItemBackgroundColor);
    const index = KEYBOARD_PICKS.indexOf(current);
    const next = KEYBOARD_PICKS[(index + 1) % KEYBOARD_PICKS.length];
    if (next) {
      this.app.actionManager.executeAction(actionChangeBucketFillBackgroundColor, {
        currentItemBackgroundColor: next,
      });
    }
  }

  /** Alt down: an eye dropper that picks while Alt is held, and goes when it is let go. */
  public openTemporaryEyeDropper(): void {
    if (this.stopEyeDropper) return;
    const open = (): void => {
      this.stopEyeDropper = startEyeDropper(this.app, {
        onSelect: (color, event) => {
          this.app.batch(() =>
            this.app.actionManager.executeAction(actionChangeBucketFillBackgroundColor, {
              currentItemBackgroundColor: color,
            }),
          );
          this.stopEyeDropper = null;
          if (event.altKey) open();
        },
        onCancel: () => {
          this.stopEyeDropper = null;
        },
      });
    };
    open();
  }

  public closeTemporaryEyeDropper(): void {
    const stop = this.stopEyeDropper;
    this.stopEyeDropper = null;
    stop?.();
  }

  private restyle(element: NonDeletedExcalidrawElement): void {
    const { state } = this.app;
    const backgroundColor = getBucketFillBackgroundColor(state.currentItemBackgroundColor);
    if (
      element.backgroundColor === backgroundColor &&
      element.fillStyle === state.currentItemFillStyle &&
      element.opacity === state.currentItemOpacity
    ) {
      return;
    }
    this.app.scene.mutateElement(element, {
      backgroundColor,
      fillStyle: state.currentItemFillStyle,
      opacity: state.currentItemOpacity,
    });
    // the drawable is cached by the element; a mutation in place keeps it
    ShapeCache.delete(element);
    this.app.store.scheduleCapture();
  }

  private fill(scenePointer: { x: number; y: number }): void {
    const { app } = this;
    const { state } = app;
    const backgroundColor = getBucketFillBackgroundColor(state.currentItemBackgroundColor);
    const elements = app.scene.getNonDeletedElements();
    const elementsMap = app.scene.getNonDeletedElementsMap();
    const point = pointFrom<GlobalPoint>(scenePointer.x, scenePointer.y);
    const hitElement = app.getElementAtPosition(point[0], point[1]);
    const result = computeBucketFillPolygon({ point, elements, elementsMap });

    if (!result.ok) {
      // paint with nothing left to bound it is still restyled where it is clicked
      if (hitElement && isBucketFillCompatible(hitElement)) {
        this.restyle(hitElement);
        return;
      }
      if (result.reason === "too_complex") {
        app.setState({ toast: toast("bucketfill.tooComplex") });
      } else if (result.reason !== "no_owner") {
        app.setState({ toast: toast("bucketfill.noRegion") });
      }
      return;
    }

    if (
      hitElement &&
      isRestylableFill({ hitElement, scenePoints: result.scenePoints, elementsMap })
    ) {
      this.restyle(hitElement);
      return;
    }

    const { width, height } = getSizeFromPoints(result.scenePoints);
    const [origin] = result.scenePoints;
    if (!origin) return;
    const [originX, originY] = origin;
    const points = result.scenePoints.map((scenePoint) =>
      pointFrom<LocalPoint>(scenePoint[0] - originX, scenePoint[1] - originY),
    );
    const owner = result.ownerId ? elementsMap.get(result.ownerId) : null;
    const frameId = owner
      ? isFrameLikeElement(owner)
        ? owner.id
        : owner.frameId
      : (app.getTopLayerFrameAtSceneCoords(scenePointer)?.id ?? null);
    // a fill without an owner shares only the groups every boundary is in
    const groupIds = owner
      ? owner.groupIds
      : (result.boundaryElementIds
          .map((id) => elementsMap.get(id)?.groupIds)
          .filter((ids): ids is readonly string[] => ids !== undefined)
          .reduce<readonly string[] | null>(
            (common, ids) => (common === null ? ids : common.filter((id) => ids.includes(id))),
            null,
          ) ?? []);

    const fill = newLinearElement({
      type: "line",
      x: originX,
      y: originY,
      width,
      height,
      points,
      polygon: true,
      strokeColor: "transparent",
      backgroundColor,
      fillStyle: state.currentItemFillStyle,
      strokeWidth: 1,
      strokeStyle: "solid",
      roughness: 0,
      roundness: null,
      opacity: state.currentItemOpacity,
      frameId,
      groupIds: [...groupIds],
    });
    const anchorIndex = app.scene
      .getElementsIncludingDeleted()
      .findIndex((element) => element.id === result.insertion.elementId);
    app.scene.insertElementsAtIndex(
      [fill],
      anchorIndex < 0
        ? null
        : result.insertion.placement === "above"
          ? anchorIndex + 1
          : anchorIndex,
    );
    // the tool stays and selects nothing, for the next region
    app.store.scheduleCapture();
  }
}
