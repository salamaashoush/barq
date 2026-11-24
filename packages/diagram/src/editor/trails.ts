import * as laserPointer from "@excalidraw/laser-pointer";
import {
  arrayToMap,
  DEFAULT_LASER_COLOR,
  easeOut,
  getSvgPathFromStroke,
  isShallowEqual,
  sceneCoordsToViewportCoords,
  setColorAlpha,
  SVG_NS,
  THEME,
} from "@excalidraw/common";
import {
  computeBoundTextPosition,
  doBoundsIntersect,
  getBoundTextElement,
  getBoundTextElementId,
  getElementBounds,
  getElementLineSegments,
  getElementsInGroup,
  getFrameChildren,
  getFreedrawOutlineAsSegments,
  getFreedrawOutlinePoints,
  hasBoundTextElement,
  intersectElementWithLineSegment,
  isArrowElement,
  isBoundToContainer,
  isFrameLikeElement,
  isFreeDrawElement,
  isLinearElement,
  isLineElement,
  isPointInElement,
  LinearElementEditor,
  shouldTestInside,
} from "@excalidraw/element";
import {
  lineSegment,
  lineSegmentsDistance,
  pointFrom,
  polygon,
  polygonIncludesPointNonZero,
} from "@excalidraw/math";

import type { Bounds } from "@excalidraw/common";
import type { LaserPointerOptions } from "@excalidraw/laser-pointer";
import type { ElementsMap, ExcalidrawElement } from "@excalidraw/element/types";
import type { GlobalPoint, LineSegment } from "@excalidraw/math";

import { getClientColor } from "../clients.ts";
import { getSelectionColor } from "../renderer/helpers.ts";
import { selectGroupsForSelectedElements } from "./selection.ts";
import { getLassoSelectedElementIds } from "./lasso/utils.ts";

import type { AppState, Collaborator, SocketId } from "../types.ts";
import type { DiagramEditor } from "./editor.ts";

// The package's `main` is a CommonJS build whose exports Node cannot read by
// name, and Node is what loads it when a dev server renders on the server:
// `import { LaserPointer }` failed there and took the page down. Its `module`
// build, which a bundler reads, has the named export and no default.
const LaserPointer: typeof laserPointer.LaserPointer =
  laserPointer.LaserPointer ??
  (laserPointer as unknown as { default: typeof laserPointer }).default.LaserPointer;
type LaserPointer = laserPointer.LaserPointer;

export interface AnimatedTrailOptions {
  fill: (trail: AnimatedTrail) => string;
  stroke?: (trail: AnimatedTrail) => string;
  animateTrail?: boolean;
}

/**
 * A fading stroke drawn into an SVG over the canvas while the pointer moves:
 * the laser, the eraser's and the lasso's. Excalidraw's `AnimatedTrail`; it
 * draws itself each frame while it has something to draw, outside the
 * editor's state.
 */
export class AnimatedTrail {
  private currentTrail?: LaserPointer;
  private pastTrails: LaserPointer[] = [];
  private container?: SVGSVGElement;
  private readonly trailElement: SVGPathElement;
  private readonly trailAnimation?: SVGAnimateElement;
  private frame: number | null = null;

  public constructor(
    protected readonly app: DiagramEditor,
    private readonly options: Partial<LaserPointerOptions> & Partial<AnimatedTrailOptions>,
  ) {
    const document = app.ownerDocument;
    this.trailElement = document.createElementNS(SVG_NS, "path");
    if (this.options.animateTrail) {
      this.trailAnimation = document.createElementNS(SVG_NS, "animate");
      this.trailAnimation.setAttribute("attributeName", "stroke-dashoffset");
      this.trailElement.setAttribute("stroke-dasharray", "7 7");
      this.trailElement.setAttribute("stroke-dashoffset", "10");
      this.trailAnimation.setAttribute("from", "0");
      this.trailAnimation.setAttribute("to", `-14`);
      this.trailAnimation.setAttribute("dur", "0.3s");
      this.trailElement.append(this.trailAnimation);
    }
  }

  public get hasCurrentTrail(): boolean {
    return !!this.currentTrail;
  }

  public hasLastPoint(x: number, y: number): boolean {
    const last = this.currentTrail?.originalPoints.at(-1);
    return !!last && last[0] === x && last[1] === y;
  }

  private cleanup(): void {
    this.pastTrails = [];
    this.currentTrail = undefined;
    if (this.container && this.trailElement.parentNode === this.container) {
      this.trailElement.remove();
    }
  }

  public start(container?: SVGSVGElement): void {
    if (container) {
      this.container = container;
    }
    if (this.container && this.trailElement.parentNode !== this.container) {
      this.container.append(this.trailElement);
    }
    if (this.frame === null) {
      this.tick();
    }
  }

  private tick = (): void => {
    this.frame = null;
    if (this.onFrame()) {
      this.frame = this.app.ownerWindow.requestAnimationFrame(this.tick);
    } else {
      this.cleanup();
    }
  };

  public stop(): void {
    if (this.frame !== null) {
      this.app.ownerWindow.cancelAnimationFrame(this.frame);
      this.frame = null;
    }
    this.cleanup();
  }

  public startPath(x: number, y: number): void {
    this.currentTrail = new LaserPointer(this.options);
    this.currentTrail.addPoint([x, y, performance.now()]);
    this.update();
  }

  public addPointToPath(x: number, y: number): void {
    if (this.currentTrail) {
      this.currentTrail.addPoint([x, y, performance.now()]);
      this.update();
    }
  }

  public endPath(): void {
    if (this.currentTrail) {
      this.currentTrail.close();
      this.currentTrail.options.keepHead = false;
      this.pastTrails.push(this.currentTrail);
      this.currentTrail = undefined;
      this.update();
    }
  }

  public getCurrentTrail(): LaserPointer | undefined {
    return this.currentTrail;
  }

  public clearTrails(): void {
    this.pastTrails = [];
    this.currentTrail = undefined;
    this.update();
  }

  private update(): void {
    this.start();
    if (this.trailAnimation) {
      this.trailAnimation.setAttribute("begin", "indefinite");
      this.trailAnimation.setAttribute("repeatCount", "indefinite");
    }
  }

  /** Draws the trails; whether there is anything left to draw next frame. */
  private onFrame(): boolean {
    const state = this.app.state;
    const paths: string[] = [];
    for (const trail of this.pastTrails) {
      paths.push(this.drawTrail(trail, state));
    }
    if (this.currentTrail) {
      paths.push(this.drawTrail(this.currentTrail, state));
    }
    this.pastTrails = this.pastTrails.filter(
      (trail) => trail.getStrokeOutline(trail.options.size / state.zoom.value).length !== 0,
    );
    if (paths.length === 0) {
      this.trailElement.setAttribute("d", "");
      return false;
    }
    this.trailElement.setAttribute("d", paths.join(" ").trim());
    this.trailElement.setAttribute("fill", (this.options.fill ?? (() => "black"))(this));
    if (this.trailAnimation) {
      this.trailElement.setAttribute("stroke", (this.options.stroke ?? (() => "black"))(this));
    }
    return true;
  }

  private drawTrail(trail: LaserPointer, state: AppState): string {
    const outline = trail.getStrokeOutline(trail.options.size / state.zoom.value).map(([x, y]) => {
      const result = sceneCoordsToViewportCoords({ sceneX: x, sceneY: y }, state);
      // the SVG is over the canvas, not the page
      return [result.x - state.offsetLeft, result.y - state.offsetTop];
    });
    const stroke = this.trailAnimation ? outline.slice(0, outline.length / 2) : outline;
    return getSvgPathFromStroke(stroke, true);
  }
}

const decay =
  (decayTime: number, decayLength: number): LaserPointerOptions["sizeMapping"] =>
  (c) => {
    const t = Math.max(0, 1 - (performance.now() - c.pressure) / decayTime);
    const l = (decayLength - Math.min(decayLength, c.totalLength - c.currentIndex)) / decayLength;
    return Math.min(easeOut(l), easeOut(t));
  };

/** The laser pointer's trails: the user's own, and each collaborator's. */
export class LaserTrails {
  public readonly localTrail: AnimatedTrail;
  private readonly collabTrails = new Map<SocketId, AnimatedTrail>();
  private container?: SVGSVGElement;

  public constructor(private readonly app: DiagramEditor) {
    this.localTrail = new AnimatedTrail(app, {
      ...this.getTrailOptions(),
      fill: () => DEFAULT_LASER_COLOR,
    });
  }

  private getTrailOptions(): Partial<LaserPointerOptions> {
    return { simplify: 0, streamline: 0.4, sizeMapping: decay(1000, 50) };
  }

  public startPath(x: number, y: number): void {
    this.localTrail.startPath(x, y);
  }

  public addPointToPath(x: number, y: number): void {
    this.localTrail.addPointToPath(x, y);
  }

  public endPath(): void {
    this.localTrail.endPath();
  }

  public start(container: SVGSVGElement): void {
    this.container = container;
    this.localTrail.start(container);
  }

  public stop(): void {
    this.localTrail.stop();
    this.stopCollabTrails();
    this.container = undefined;
  }

  private stopCollabTrails(collaborators?: ReadonlyMap<SocketId, Collaborator>): void {
    for (const [key, trail] of this.collabTrails) {
      if (!collaborators?.get(key)) {
        trail.stop();
        this.collabTrails.delete(key);
      }
    }
  }

  /** Draws each collaborator's laser from their pointer, as it is pressed and released. */
  public updateCollabTrails(collaborators: ReadonlyMap<SocketId, Collaborator>): void {
    this.stopCollabTrails(collaborators);
    if (!this.container || collaborators.size === 0) {
      return;
    }
    for (const [key, collaborator] of collaborators.entries()) {
      if (collaborator.isCurrentUser) {
        continue;
      }
      let trail = this.collabTrails.get(key);
      if (!trail) {
        trail = new AnimatedTrail(this.app, {
          ...this.getTrailOptions(),
          fill: () => collaborator.pointer?.laserColor || getClientColor(key, collaborator),
        });
        trail.start(this.container);
        this.collabTrails.set(key, trail);
      }
      const pointer = collaborator.pointer;
      if (pointer && pointer.tool === "laser") {
        const buttonDown = collaborator.button === "down";
        const hasTrail = trail.hasCurrentTrail;
        if (buttonDown && !hasTrail) {
          trail.startPath(pointer.x, pointer.y);
        }
        if (buttonDown && !trail.hasLastPoint(pointer.x, pointer.y)) {
          trail.addPointToPath(pointer.x, pointer.y);
        }
        if (collaborator.button === "up" && hasTrail) {
          trail.addPointToPath(pointer.x, pointer.y);
          trail.endPath();
        }
      }
    }
  }
}

/** Whether the eraser's last segment touches the element. */
const eraserTest = (
  pathSegment: LineSegment<GlobalPoint>,
  element: ExcalidrawElement,
  elementsMap: ElementsMap,
  zoom: number,
): boolean => {
  const lastPoint = pathSegment[1];
  // a cheap bounds test first
  const threshold = isFreeDrawElement(element) ? 15 : element.strokeWidth / 2;
  const segmentBounds: Bounds = [
    Math.min(pathSegment[0][0], pathSegment[1][0]) - threshold,
    Math.min(pathSegment[0][1], pathSegment[1][1]) - threshold,
    Math.max(pathSegment[0][0], pathSegment[1][0]) + threshold,
    Math.max(pathSegment[0][1], pathSegment[1][1]) + threshold,
  ];
  const origElementBounds = getElementBounds(element, elementsMap);
  const elementBounds: Bounds = [
    origElementBounds[0] - threshold,
    origElementBounds[1] - threshold,
    origElementBounds[2] + threshold,
    origElementBounds[3] + threshold,
  ];
  if (!doBoundsIntersect(segmentBounds, elementBounds)) {
    return false;
  }

  // shapes whose inside erases, without the stroke being touched
  if (shouldTestInside(element) && isPointInElement(lastPoint, element, elementsMap)) {
    return true;
  }

  // a drawing erases within a tolerance of its outline, visually tuned
  if (isFreeDrawElement(element)) {
    const outlinePoints = getFreedrawOutlinePoints(element);
    const strokeSegments = getFreedrawOutlineAsSegments(element, outlinePoints, elementsMap);
    const tolerance = Math.max(2.25, 5 / zoom);
    for (const segment of strokeSegments) {
      if (lineSegmentsDistance(segment, pathSegment) <= tolerance) {
        return true;
      }
    }
    const poly = polygon(
      ...outlinePoints.map(([x, y]) => pointFrom<GlobalPoint>(element.x + x, element.y + y)),
    );
    // one end inside the closed outline: the other is too, or the segment
    // crosses the outline anyway
    return polygonIncludesPointNonZero(pathSegment[0], poly);
  }

  const boundTextElement = getBoundTextElement(element, elementsMap);

  if (isArrowElement(element) || (isLineElement(element) && !element.polygon)) {
    const tolerance = Math.max(element.strokeWidth, (element.strokeWidth * 2) / zoom);
    // a fast eraser covers a long way between two points: each segment
    for (const segment of getElementLineSegments(element, elementsMap)) {
      if (lineSegmentsDistance(segment, pathSegment) <= tolerance) {
        return true;
      }
    }
    return false;
  }

  return (
    intersectElementWithLineSegment(element, elementsMap, pathSegment, 0, true).length > 0 ||
    (!!boundTextElement &&
      intersectElementWithLineSegment(
        {
          ...boundTextElement,
          ...computeBoundTextPosition(element, boundTextElement, elementsMap),
        },
        elementsMap,
        pathSegment,
        0,
        true,
      ).length > 0)
  );
};

/**
 * The eraser's trail, and what it marks for erasure as it goes: whole groups,
 * containers with their labels. With alt held, going back over an element
 * restores it.
 */
export class EraserTrail extends AnimatedTrail {
  private readonly elementsToErase = new Set<ExcalidrawElement["id"]>();
  private readonly groupsToErase = new Set<ExcalidrawElement["id"]>();

  public constructor(app: DiagramEditor) {
    super(app, {
      streamline: 0.2,
      size: 5,
      keepHead: true,
      sizeMapping: decay(200, 10),
      fill: () =>
        app.state.theme === THEME.LIGHT ? "rgba(0, 0, 0, 0.2)" : "rgba(255, 255, 255, 0.2)",
    });
  }

  public override startPath(x: number, y: number): void {
    this.endPath();
    super.startPath(x, y);
    this.elementsToErase.clear();
  }

  /** Adds a point and returns the ids to erase. */
  public addPointToPathAndErase(x: number, y: number, restore = false): string[] {
    super.addPointToPath(x, y);
    return this.updateElementsToBeErased(restore);
  }

  private updateElementsToBeErased(restoreToErase: boolean): string[] {
    const eraserPath: GlobalPoint[] =
      this.getCurrentTrail()?.originalPoints.map((p) => pointFrom<GlobalPoint>(p[0], p[1])) ?? [];
    const last = eraserPath.at(-1);
    const beforeLast = eraserPath.at(-2);
    if (!last || !beforeLast) {
      return [];
    }
    const pathSegment = lineSegment<GlobalPoint>(last, beforeLast);
    const candidateElements = this.app.visibleElements.filter((element) => !element.locked);
    const candidateElementsMap = arrayToMap(candidateElements);
    const elementsMap = this.app.scene.getNonDeletedElementsMap();

    for (const element of candidateElements) {
      const marked = this.elementsToErase.has(element.id);
      if (restoreToErase ? !marked : marked) {
        continue;
      }
      if (!eraserTest(pathSegment, element, candidateElementsMap, this.app.state.zoom.value)) {
        continue;
      }
      const shallowestGroupId = element.groupIds.at(-1);
      if (restoreToErase) {
        if (shallowestGroupId && this.groupsToErase.has(shallowestGroupId)) {
          for (const inGroup of getElementsInGroup(elementsMap, shallowestGroupId)) {
            this.elementsToErase.delete(inGroup.id);
          }
          this.groupsToErase.delete(shallowestGroupId);
        }
        if (isBoundToContainer(element)) {
          this.elementsToErase.delete(element.containerId);
        }
        if (hasBoundTextElement(element)) {
          const boundText = getBoundTextElementId(element);
          if (boundText) {
            this.elementsToErase.delete(boundText);
          }
        }
        this.elementsToErase.delete(element.id);
      } else {
        if (shallowestGroupId && !this.groupsToErase.has(shallowestGroupId)) {
          for (const inGroup of getElementsInGroup(elementsMap, shallowestGroupId)) {
            this.elementsToErase.add(inGroup.id);
          }
          this.groupsToErase.add(shallowestGroupId);
        }
        if (hasBoundTextElement(element)) {
          const boundText = getBoundTextElementId(element);
          if (boundText) {
            this.elementsToErase.add(boundText);
          }
        }
        if (isBoundToContainer(element)) {
          this.elementsToErase.add(element.containerId);
        }
        this.elementsToErase.add(element.id);
      }
    }
    return [...this.elementsToErase];
  }

  public override endPath(): void {
    super.endPath();
    super.clearTrails();
    this.elementsToErase.clear();
    this.groupsToErase.clear();
  }
}

interface CanvasTranslate {
  scrollX: number;
  scrollY: number;
  zoom: number;
}

/**
 * The lasso's trail, and the selection it makes as it is drawn: what it
 * encloses, or in overlap mode what it crosses too; shift keeps the
 * selection there was.
 */
export class LassoTrail extends AnimatedTrail {
  private readonly intersectedElements = new Set<ExcalidrawElement["id"]>();
  private readonly enclosedElements = new Set<ExcalidrawElement["id"]>();
  private elementsSegments: Map<string, LineSegment<GlobalPoint>[]> | null = null;
  private canvasTranslate: CanvasTranslate | null = null;
  private keepPreviousSelection = false;

  public constructor(app: DiagramEditor) {
    super(app, {
      animateTrail: true,
      streamline: 0.4,
      sizeMapping: decay(Infinity, 5000),
      // the marquee's colour
      fill: () => setColorAlpha(getSelectionColor(app.interactiveCanvas), 0.05),
      stroke: () => getSelectionColor(app.interactiveCanvas),
    });
  }

  public override startPath(x: number, y: number, keepPreviousSelection = false): void {
    this.endPath();
    super.startPath(x, y);
    this.intersectedElements.clear();
    this.enclosedElements.clear();
    this.keepPreviousSelection = keepPreviousSelection;
    if (!this.keepPreviousSelection) {
      this.app.setState({
        selectedElementIds: {},
        selectedGroupIds: {},
        selectedLinearElement: null,
      });
    }
  }

  public selectElementsFromIds = (ids: string[]): void => {
    this.app.setState((prevState) => {
      const nextSelectedElementIds: Record<ExcalidrawElement["id"], true> = {};
      for (const id of ids) nextSelectedElementIds[id] = true;
      if (this.keepPreviousSelection) {
        for (const id of Object.keys(prevState.selectedElementIds)) {
          nextSelectedElementIds[id] = true;
        }
      }
      // a frame is selected without its children
      for (const id of Object.keys(nextSelectedElementIds)) {
        const element = this.app.scene.getNonDeletedElement(id);
        if (element && isFrameLikeElement(element)) {
          for (const child of getFrameChildren(
            this.app.scene.getNonDeletedElementsMap(),
            element.id,
          )) {
            delete nextSelectedElementIds[child.id];
          }
        }
      }
      const nextSelection = selectGroupsForSelectedElements(
        { editingGroupId: prevState.editingGroupId, selectedElementIds: nextSelectedElementIds },
        this.app.scene.getNonDeletedElements(),
        prevState,
        this.app,
      );
      const selectedIds = Object.keys(nextSelection.selectedElementIds);
      const selectedGroupIds = Object.keys(nextSelection.selectedGroupIds);
      const [onlyId] = selectedIds;
      const only = onlyId ? this.app.scene.getNonDeletedElement(onlyId) : undefined;
      return {
        selectedElementIds: nextSelection.selectedElementIds,
        selectedGroupIds: nextSelection.selectedGroupIds,
        selectedLinearElement:
          selectedIds.length === 1 && !selectedGroupIds.length && only && isLinearElement(only)
            ? new LinearElementEditor(only, this.app.scene.getNonDeletedElementsMap())
            : null,
      };
    });
  };

  public addPointToLasso = (x: number, y: number, keepPreviousSelection = false): void => {
    super.addPointToPath(x, y);
    this.keepPreviousSelection = keepPreviousSelection;
    this.updateSelection();
  };

  private updateSelection = (): void => {
    const lassoPath = this.getCurrentTrail()?.originalPoints.map((p) =>
      pointFrom<GlobalPoint>(p[0], p[1]),
    );
    const currentCanvasTranslate: CanvasTranslate = {
      scrollX: this.app.state.scrollX,
      scrollY: this.app.state.scrollY,
      zoom: this.app.state.zoom.value,
    };
    if (
      !this.elementsSegments ||
      !isShallowEqual(currentCanvasTranslate, this.canvasTranslate ?? {})
    ) {
      this.canvasTranslate = currentCanvasTranslate;
      this.elementsSegments = new Map();
      const visibleElementsMap = arrayToMap(this.app.visibleElements);
      for (const element of this.app.visibleElements) {
        this.elementsSegments.set(element.id, getElementLineSegments(element, visibleElementsMap));
      }
    }
    if (lassoPath) {
      const { selectedElementIds } = getLassoSelectedElementIds({
        lassoPath,
        elements: this.app.visibleElements,
        elementsMap: this.app.scene.getNonDeletedElementsMap(),
        elementsSegments: this.elementsSegments,
        intersectedElements: this.intersectedElements,
        enclosedElements: this.enclosedElements,
        simplifyDistance: 5 / this.app.state.zoom.value,
        mode: this.app.state.boxSelectionMode,
      });
      this.selectElementsFromIds(selectedElementIds);
    }
  };

  public override endPath(): void {
    super.endPath();
    super.clearTrails();
    this.intersectedElements.clear();
    this.enclosedElements.clear();
    this.elementsSegments = null;
  }
}
