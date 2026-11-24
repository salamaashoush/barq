import { getStrokeWidthByKey, randomInteger, THEME } from "@excalidraw/common";
import {
  bindBindingElement,
  convertToShape,
  convertToShapeHandlePointerMoveFromPointerDown,
  getHoveredElementForBinding,
  isBindingElement,
  isLineElement,
  LinearElementEditor,
  newArrowElement,
  updateBoundPoint,
} from "@excalidraw/element";
import { clamp, pointFrom } from "@excalidraw/math";

import type {
  ExcalidrawArrowElement,
  ExcalidrawLineElement,
  NonDeleted,
  NonDeletedExcalidrawElement,
  PointsPositionUpdates,
} from "@excalidraw/element/types";
import type { GlobalPoint } from "@excalidraw/math";

import { AnimatedTrail } from "./trails.ts";

import type { AppState } from "../types.ts";
import type { DiagramEditor } from "./editor.ts";
import type { Coords } from "../types.ts";

/** The autoshape tool's stroke: a soft trail the sketch is recognised from. */
export class DrawShapeTrail extends AnimatedTrail {
  public constructor(app: DiagramEditor) {
    super(app, {
      simplify: 0,
      streamline: 0.4,
      size: 1,
      sizeMapping: () =>
        clamp(
          getStrokeWidthByKey("line", app.state.currentItemStrokeWidthKey) *
            0.65 *
            app.state.zoom.value,
          1.25,
          4,
        ),
      fill: () =>
        app.state.theme === THEME.LIGHT ? "rgba(0, 0, 0, 0.2)" : "rgba(255, 255, 255, 0.2)",
    });
  }

  public getCurrentPoints(): GlobalPoint[] {
    const trail = this.getCurrentTrail();
    return trail ? trail.originalPoints.map(([x, y]) => pointFrom<GlobalPoint>(x, y)) : [];
  }
}

/**
 * Excalidraw's autoshape tool (Shift+X): a freehand sketch recognised as a
 * rectangle, diamond, ellipse, arrow or line. The shape it reads previews in
 * `newElement` while the pointer moves; `actionFinalize` commits it, binding
 * a recognised arrow's ends to the shapes they land on, and a line drawn
 * from a shape to elsewhere becomes an arrow.
 */
export class DrawShape {
  public readonly trail: DrawShapeTrail;
  private gestureInProgress = false;

  public constructor(private readonly app: DiagramEditor) {
    this.trail = new DrawShapeTrail(app);
  }

  public start(container: SVGSVGElement): void {
    this.trail.start(container);
  }

  public stop(): void {
    this.trail.stop();
  }

  public hasPendingGesture(): boolean {
    return this.gestureInProgress;
  }

  public handlePointerDown(origin: Coords, finalize: () => void): void {
    if (this.gestureInProgress) {
      finalize();
    }
    this.gestureInProgress = true;
    this.trail.startPath(origin.x, origin.y);
  }

  /** Whether the move went to the sketch. */
  public handlePointerMove(pointerCoords: Coords): boolean {
    return convertToShapeHandlePointerMoveFromPointerDown(this.app.elementApp, pointerCoords);
  }

  /** Commits the sketch, if one is pending, and clears the trail. Run by `actionFinalize`. */
  public finalize(): void {
    const { app } = this;
    const points = this.gestureInProgress ? this.trail.getCurrentPoints() : [];
    this.gestureInProgress = false;
    this.trail.endPath();

    if (points.length >= 3) {
      const detected =
        app.state.newElement ??
        convertToShape(
          points,
          app.state,
          app.scene.getNonDeletedElementsMap(),
          app.state.newElement,
          app.scene.getNonDeletedFramesLikes(),
        );
      if (detected) {
        let element: NonDeletedExcalidrawElement = {
          ...detected,
          seed: randomInteger(),
          opacity: app.state.currentItemOpacity,
        };
        if (app.state.isBindingEnabled && isLineElement(element)) {
          element = this.maybeUpgradeLineToArrow(element, app.state) ?? element;
        }
        app.insertNewElement(element);
        if (app.state.isBindingEnabled && isBindingElement(element)) {
          this.bindRecognizedArrow(element);
        }
      }
    }
    this.trail.clearTrails();
  }

  /**
   * Binds a recognised arrow's ends to the shapes under them, at their
   * outlines; a sketch inside a single shape binds both ends inside it.
   */
  private bindRecognizedArrow(arrow: NonDeleted<ExcalidrawArrowElement>): void {
    const { app } = this;
    const elementsMap = app.scene.getNonDeletedElementsMap();
    const elements = app.scene.getNonDeletedElements();
    const endpoints = (["start", "end"] as const).map((startOrEnd) => {
      const globalPoint = LinearElementEditor.getPointAtIndexGlobalCoordinates(
        arrow,
        startOrEnd === "start" ? 0 : -1,
        elementsMap,
      );
      return {
        startOrEnd,
        globalPoint,
        target: getHoveredElementForBinding(globalPoint, elements, elementsMap, app.state.zoom),
      };
    });
    const [start, end] = endpoints;
    const sameTarget = !!start?.target && start.target === end?.target;
    const midpointSnapping = app.state.isMidpointSnappingEnabled && !app.state.gridModeEnabled;
    for (const { startOrEnd, globalPoint, target } of endpoints) {
      if (target) {
        bindBindingElement(
          arrow,
          target,
          sameTarget ? "inside" : "orbit",
          startOrEnd,
          app.scene,
          app.state.zoom,
          globalPoint,
          app.state.isBindingEnabled,
          midpointSnapping,
        );
      }
    }
    if (sameTarget) {
      return;
    }
    const updates: PointsPositionUpdates = new Map();
    for (const { startOrEnd, target } of endpoints) {
      if (!target) continue;
      const point = updateBoundPoint(
        arrow,
        startOrEnd === "start" ? "startBinding" : "endBinding",
        startOrEnd === "start" ? arrow.startBinding : arrow.endBinding,
        target,
        elementsMap,
      );
      if (point) {
        updates.set(startOrEnd === "start" ? 0 : arrow.points.length - 1, { point });
      }
    }
    if (updates.size) {
      LinearElementEditor.movePoints(arrow, app.scene, updates);
    }
  }

  /**
   * A sketched line from a shape to anything else was meant as a connector:
   * it becomes an arrow. One touching no shape, or inside a single shape,
   * stays a line.
   */
  private maybeUpgradeLineToArrow(
    line: NonDeleted<ExcalidrawLineElement>,
    state: AppState,
  ): NonDeleted<ExcalidrawArrowElement> | null {
    const { app } = this;
    const elementsMap = app.scene.getNonDeletedElementsMap();
    const elements = app.scene.getNonDeletedElements();
    const [startTarget, endTarget] = ([0, -1] as const).map((index) =>
      getHoveredElementForBinding(
        LinearElementEditor.getPointAtIndexGlobalCoordinates(line, index, elementsMap),
        elements,
        elementsMap,
        state.zoom,
      ),
    );
    if ((!startTarget && !endTarget) || startTarget === endTarget) {
      return null;
    }
    return newArrowElement({
      type: "arrow",
      x: line.x,
      y: line.y,
      width: line.width,
      height: line.height,
      startArrowhead: null,
      endArrowhead: state.currentItemEndArrowhead,
      points: line.points,
      groupIds: line.groupIds,
      frameId: line.frameId,
      locked: false,
      angle: line.angle,
      strokeColor: line.strokeColor,
      backgroundColor: line.backgroundColor,
      fillStyle: line.fillStyle,
      roughness: line.roughness,
      opacity: line.opacity,
      strokeStyle: line.strokeStyle,
      strokeWidth: line.strokeWidth,
    });
  }
}
