import {
  getCommonFrameId,
  getFrameChildrenInsertionIndex,
  getContainerElement,
  getElementBounds,
  isElementInViewport,
  isTextElement,
} from "@excalidraw/element";

import {
  arrayToMap,
  memoize,
  toBrandedType,
  viewportCoordsToSceneCoords,
} from "@excalidraw/common";

import type {
  ExcalidrawElement,
  ExcalidrawFrameLikeElement,
  NonDeleted,
  NonDeletedElementsMap,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

import type { Scene } from "@excalidraw/element";

import { cancelStaticSceneThrottle } from "../renderer/static-scene.ts";

import type { RenderableElementsMap } from "./types.ts";

import type { AppState, ElementRenderOffsets } from "../types.ts";

/** The side of a culling cell, in scene units. */
const INDEX_CELL = 512;
/** An element covering more cells than this is tested on its own. */
const INDEX_MAX_CELLS_PER_ELEMENT = 64;
/** Below this many elements a walk is as quick as the grid. */
const INDEX_MIN_ELEMENTS = 2000;
/** Cells by their coordinates, packed into one number. */
function cellKey(cx: number, cy: number): number {
  return cx * 1_048_576 + cy;
}

type GetRenderableElementsOpts = {
  zoom: AppState["zoom"];
  offsetLeft: AppState["offsetLeft"];
  offsetTop: AppState["offsetTop"];
  scrollX: AppState["scrollX"];
  scrollY: AppState["scrollY"];
  height: AppState["height"];
  width: AppState["width"];
  editingTextElement: AppState["editingTextElement"];
  newElement: AppState["newElement"];
  selectedElements: readonly NonDeletedExcalidrawElement[];
  selectedElementsAreBeingDragged: AppState["selectedElementsAreBeingDragged"];
  frameToHighlight: AppState["frameToHighlight"];
};

interface VisibleCanvasInput {
  visibleElements: readonly NonDeletedExcalidrawElement[];
  elementsMap: RenderableElementsMap;
  offsets: ElementRenderOffsets;
}

interface RendererVisibilityIndex {
  nonce: string;
  elementsMap: NonDeletedElementsMap;
  order: Map<string, number>;
  cells: Map<number, NonDeletedExcalidrawElement[]>;
  /** Elements too large for cells, tested every time. */
  large: NonDeletedExcalidrawElement[];
  bounds: Map<string, readonly [number, number, number, number]>;
}

interface GetVisibleCanvasElementsOptions {
  nonce: string;
  elementsMap: NonDeletedElementsMap;
  zoom: AppState["zoom"];
  offsetLeft: AppState["offsetLeft"];
  offsetTop: AppState["offsetTop"];
  scrollX: AppState["scrollX"];
  scrollY: AppState["scrollY"];
  height: AppState["height"];
  width: AppState["width"];
}

interface RenderableElementsInput {
  elements: readonly NonDeletedExcalidrawElement[];
  editingTextElement: AppState["editingTextElement"];
  newElement: AppState["newElement"];
}

interface SortSelectedElementsIntoHighlightedFrameOptions<T extends ExcalidrawElement> {
  selectedElements: readonly NonDeletedExcalidrawElement[];
  visibleElements: readonly T[];
  frameToHighlight: NonDeleted<ExcalidrawFrameLikeElement>;
}

interface CanvasNonce {
  canvasNonce: string;
}

export class Renderer {
  private scene: Scene;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * Adjusts the document-visible set for render-override translations: an
   * element leaves it when its offset moves it out of view and enters it when
   * its offset brings it in; everything else keeps its document visibility.
   * Only translated elements go through viewport geometry. The result is
   * memoized on the offsets' identity so that opacity-only snapshots don't
   * reach it at all.
   */
  public getVisibleElementsWithRenderOffsets(
    visibleElements: readonly NonDeletedExcalidrawElement[],
    elementsMap: RenderableElementsMap,
    appState: AppState,
    offsets: ElementRenderOffsets,
  ) {
    return this._getVisibleElementsWithRenderOffsets({
      visibleElements,
      elementsMap,
      offsets,
      zoom: appState.zoom,
      scrollX: appState.scrollX,
      scrollY: appState.scrollY,
      offsetLeft: appState.offsetLeft,
      offsetTop: appState.offsetTop,
      width: appState.width,
      height: appState.height,
      selectedElements: this.scene.getSelectedElements(appState),
      frameToHighlight: appState.selectedElementsAreBeingDragged ? appState.frameToHighlight : null,
    });
  }

  private _getVisibleElementsWithRenderOffsets = memoize(
    ({
      visibleElements,
      elementsMap,
      offsets,
      selectedElements,
      frameToHighlight,
      ...viewport
    }: Pick<
      GetRenderableElementsOpts,
      | "zoom"
      | "scrollX"
      | "scrollY"
      | "offsetLeft"
      | "offsetTop"
      | "width"
      | "height"
      | "selectedElements"
      | "frameToHighlight"
    > &
      VisibleCanvasInput) => {
      // Shifting the viewport instead of the element also works for arrow
      // labels, whose coordinates derive from their container.
      function isVisible(
        element: NonDeletedExcalidrawElement,
        offset: ElementRenderOffsets extends ReadonlyMap<string, infer T> ? T : never,
      ) {
        return isElementInViewport(
          element,
          viewport.width,
          viewport.height,
          {
            ...viewport,
            scrollX: viewport.scrollX + offset.x,
            scrollY: viewport.scrollY + offset.y,
          },
          elementsMap,
        );
      }

      const documentVisible = this.getVisibleSet(visibleElements);
      const added = new Set<NonDeletedExcalidrawElement>();
      const removed = new Set<NonDeletedExcalidrawElement>();
      function update(element: NonDeletedExcalidrawElement, visible: boolean) {
        if (documentVisible.has(element) !== visible) {
          (visible ? added : removed).add(element);
        }
      }
      for (const [id, offset] of offsets) {
        const element = elementsMap.get(id);
        // A bound label's own offset is ignored, and it needs no entry of
        // its own: the static renderer draws it with its container and skips
        // its entry, so its document visibility can stay as it is.
        if (!element || (isTextElement(element) && getContainerElement(element, elementsMap))) {
          continue;
        }
        update(element, isVisible(element, offset));
      }

      if (!added.size && !removed.size) {
        return visibleElements;
      }

      const needsFrameReordering =
        frameToHighlight && getCommonFrameId(selectedElements) !== frameToHighlight.id;
      if (!added.size && !needsFrameReordering) {
        return visibleElements.filter((element) => !removed.has(element));
      }

      // Rebuild in scene order when elements enter the view. Frame-drag
      // ordering also needs rebuilding on removals, since the anchoring frame
      // may have left the view.
      const result: NonDeletedExcalidrawElement[] = [];
      for (const element of elementsMap.values()) {
        if (added.has(element) || (documentVisible.has(element) && !removed.has(element))) {
          result.push(element);
        }
      }
      return needsFrameReordering
        ? this.sortSelectedElementsIntoHighlightedFrame({
            visibleElements: result,
            selectedElements,
            frameToHighlight,
          })
        : result;
    },
  );

  /** the document-visible elements as a set, cached per visible array */
  private visibleSets = new WeakMap<
    readonly NonDeletedExcalidrawElement[],
    Set<NonDeletedExcalidrawElement>
  >();

  private getVisibleSet(visibleElements: readonly NonDeletedExcalidrawElement[]) {
    let set = this.visibleSets.get(visibleElements);
    if (!set) {
      set = new Set(visibleElements);
      this.visibleSets.set(visibleElements, set);
    }
    return set;
  }

  /**
   * The elements' bounds on a grid, for the viewport to find the ones it
   * covers without testing every element: built once a scene state is asked
   * for a second time, so a pan or a zoom over an unchanged scene reads a few
   * cells, and a drag, which changes the scene every frame, keeps the walk.
   */
  private visibilityIndex: RendererVisibilityIndex | null = null;

  /** The scene state the last walk was for: asked for again, it gets its grid. */
  private walkedNonce: string | null = null;

  private indexFor(
    nonce: string,
    elementsMap: NonDeletedElementsMap,
  ): NonNullable<Renderer["visibilityIndex"]> {
    const current = this.visibilityIndex;
    if (current && current.nonce === nonce && current.elementsMap === elementsMap) {
      return current;
    }
    const order = new Map<string, number>();
    const cells = new Map<number, NonDeletedExcalidrawElement[]>();
    const large: NonDeletedExcalidrawElement[] = [];
    const bounds = new Map<string, readonly [number, number, number, number]>();
    let index = 0;
    for (const element of elementsMap.values()) {
      order.set(element.id, index++);
      const [x1, y1, x2, y2] = getElementBounds(element, elementsMap);
      bounds.set(element.id, [x1, y1, x2, y2]);
      const cx1 = Math.floor(x1 / INDEX_CELL);
      const cy1 = Math.floor(y1 / INDEX_CELL);
      const cx2 = Math.floor(x2 / INDEX_CELL);
      const cy2 = Math.floor(y2 / INDEX_CELL);
      if (
        !Number.isFinite(cx1 + cy1 + cx2 + cy2) ||
        (cx2 - cx1 + 1) * (cy2 - cy1 + 1) > INDEX_MAX_CELLS_PER_ELEMENT
      ) {
        large.push(element);
        continue;
      }
      for (let cx = cx1; cx <= cx2; cx++) {
        for (let cy = cy1; cy <= cy2; cy++) {
          const key = cellKey(cx, cy);
          const cell = cells.get(key);
          if (cell) cell.push(element);
          else cells.set(key, [element]);
        }
      }
    }
    const built = { nonce, elementsMap, order, cells, large, bounds };
    this.visibilityIndex = built;
    return built;
  }

  private getVisibleCanvasElements({
    nonce,
    elementsMap,
    zoom,
    offsetLeft,
    offsetTop,
    scrollX,
    scrollY,
    height,
    width,
  }: GetVisibleCanvasElementsOptions): readonly NonDeletedExcalidrawElement[] {
    // `isElementInViewport`'s test, with the viewport's corners in scene
    // coordinates worked out once rather than twice for every element
    const view = { zoom, offsetLeft, offsetTop, scrollX, scrollY };
    const topLeft = viewportCoordsToSceneCoords({ clientX: offsetLeft, clientY: offsetTop }, view);
    const bottomRight = viewportCoordsToSceneCoords(
      { clientX: offsetLeft + width, clientY: offsetTop + height },
      view,
    );
    function inView(x1: number, y1: number, x2: number, y2: number): boolean {
      return topLeft.x <= x2 && topLeft.y <= y2 && bottomRight.x >= x1 && bottomRight.y >= y1;
    }

    const cx1 = Math.floor(topLeft.x / INDEX_CELL);
    const cy1 = Math.floor(topLeft.y / INDEX_CELL);
    const cx2 = Math.floor(bottomRight.x / INDEX_CELL);
    const cy2 = Math.floor(bottomRight.y / INDEX_CELL);
    const queried = (cx2 - cx1 + 1) * (cy2 - cy1 + 1);
    const indexed =
      this.visibilityIndex?.nonce === nonce && this.visibilityIndex.elementsMap === elementsMap;
    const settled = indexed || this.walkedNonce === nonce;
    this.walkedNonce = nonce;
    // a small scene, a view over most of it, or a scene changing under a drag is walked as it is
    if (!settled || elementsMap.size < INDEX_MIN_ELEMENTS || queried * 4 > elementsMap.size) {
      const visibleElements: NonDeletedExcalidrawElement[] = [];
      for (const element of elementsMap.values()) {
        const [x1, y1, x2, y2] = getElementBounds(element, elementsMap);
        if (inView(x1, y1, x2, y2)) visibleElements.push(element);
      }
      return visibleElements;
    }

    const index = this.indexFor(nonce, elementsMap);
    const found = new Set<NonDeletedExcalidrawElement>();
    function consider(element: NonDeletedExcalidrawElement): void {
      if (found.has(element)) return;
      const box = index.bounds.get(element.id);
      if (box && inView(box[0], box[1], box[2], box[3])) found.add(element);
    }
    for (let cx = cx1; cx <= cx2; cx++) {
      for (let cy = cy1; cy <= cy2; cy++) {
        const cell = index.cells.get(cellKey(cx, cy));
        if (cell) for (const element of cell) consider(element);
      }
    }
    for (const element of index.large) consider(element);
    // in the scene's order, which is the drawing order
    return [...found].toSorted(
      (a, b) => (index.order.get(a.id) ?? 0) - (index.order.get(b.id) ?? 0),
    );
  }

  private getRenderableElementsMap({
    elements,
    editingTextElement,
    newElement,
  }: RenderableElementsInput) {
    const elementsMap = toBrandedType<RenderableElementsMap>(new Map());
    const newElementCanvasElement = newElement?.frameId ? null : newElement;

    for (const element of elements) {
      if (newElementCanvasElement?.id === element.id) {
        continue;
      }

      // we don't want to render text element that's being currently edited
      // (it's rendered on remote only)
      if (
        !editingTextElement ||
        editingTextElement.type !== "text" ||
        element.id !== editingTextElement.id
      ) {
        elementsMap.set(element.id, element);
      }
    }
    return { elementsMap, newElementCanvasElement };
  }

  private sortSelectedElementsIntoHighlightedFrame<T extends ExcalidrawElement>({
    visibleElements,
    selectedElements,
    frameToHighlight,
  }: SortSelectedElementsIntoHighlightedFrameOptions<T>): readonly T[] {
    if (!selectedElements.length) {
      return visibleElements;
    }

    // we assume all selected elements are eligible frame children if
    // frameToHighlight is defined
    const selectedElementsMap = arrayToMap(selectedElements);

    // thus, all deselected elements are the ones we won't reorder
    const deselectedElements = visibleElements.filter(
      (element) => !selectedElementsMap.has(element.id),
    );

    const insertionIndex = getFrameChildrenInsertionIndex(deselectedElements, frameToHighlight.id);

    if (insertionIndex === null) {
      return visibleElements;
    }

    return [
      ...deselectedElements.slice(0, insertionIndex),
      ...selectedElements,
      ...deselectedElements.slice(insertionIndex),
    ] as readonly T[];
  }

  /**
   * The elements to draw, by the scene's list: a pan, a zoom or a drag (which
   * moves elements in place) rebuilds no map; adding, removing or reordering
   * elements gives the scene a new list, and the map follows.
   */
  private _getRenderableElementsMap = memoize((opts: RenderableElementsInput) =>
    this.getRenderableElementsMap(opts),
  );

  private _getRenderableElements = memoize(
    ({
      canvasNonce,
      zoom,
      offsetLeft,
      offsetTop,
      scrollX,
      scrollY,
      height,
      width,
      editingTextElement,
      newElement,
    }: Omit<
      GetRenderableElementsOpts,
      "selectedElements" | "selectedElementsAreBeingDragged" | "frameToHighlight"
    > &
      CanvasNonce) => {
      const { elementsMap, newElementCanvasElement } = this._getRenderableElementsMap({
        elements: this.scene.getNonDeletedElements(),
        editingTextElement,
        newElement,
      });

      const visibleElements = this.getVisibleCanvasElements({
        nonce: canvasNonce,
        elementsMap,
        zoom,
        offsetLeft,
        offsetTop,
        scrollX,
        scrollY,
        height,
        width,
      });

      return {
        elementsMap,
        visibleElements,
        newElementCanvasElement,
        canvasNonce,
      };
    },
  );

  public getRenderableElements = (opts: GetRenderableElementsOpts) => {
    const { newElement } = opts;
    // A new element being drag-sized is mutated in place without informing
    // the scene, so `sceneNonce` doesn't move. Fold the element's own nonce
    // in where a canvas draws it from the live element but memoizes on this
    // nonce: a framed new element stays in the static canvas' element map
    // (see getRenderableElementsMap), and a new text gets its dashed text box
    // drawn by the interactive canvas (it doubles as `editingTextElement`).
    const canvasNonce = `${this.scene.getSceneNonce()}${
      newElement?.frameId || isTextElement(newElement) ? `:${newElement.versionNonce}` : ""
    }`;

    const ret = this._getRenderableElements({
      canvasNonce,

      // don't spread `opts` because we don't want to memoize on some props

      zoom: opts.zoom,
      offsetLeft: opts.offsetLeft,
      offsetTop: opts.offsetTop,
      scrollX: opts.scrollX,
      scrollY: opts.scrollY,
      height: opts.height,
      width: opts.width,
      editingTextElement: opts.editingTextElement,
      newElement: opts.newElement,
    });

    // if we're dragging elements over a frame, reorder the selected elements
    // inside the frame during render (we don't set the `element.frameId` until
    // pointerup else we'd have to painstainly restore the orig index if user
    // didn't end up adding elements to the frame)
    if (
      opts.frameToHighlight &&
      opts.selectedElementsAreBeingDragged &&
      // if all dragged elements are already in the frame, don't reorder
      getCommonFrameId(opts.selectedElements) !== opts.frameToHighlight.id
    ) {
      const reorderedVisibleElements = this.sortSelectedElementsIntoHighlightedFrame({
        visibleElements: ret.visibleElements,
        selectedElements: opts.selectedElements,
        frameToHighlight: opts.frameToHighlight,
      });

      return {
        ...ret,
        visibleElements: reorderedVisibleElements,
      };
    }

    return ret;
  };

  // NOTE Doesn't destroy everything (scene, rc, etc.) because it may not be
  // safe to break TS contract here (for upstream cases)
  public destroy(staticCanvas: HTMLCanvasElement) {
    cancelStaticSceneThrottle(staticCanvas);
    this._getRenderableElements.clear();
    this._getRenderableElementsMap.clear();
    this.visibilityIndex = null;
    this.walkedNonce = null;
    this._getVisibleElementsWithRenderOffsets.clear();
  }
}
