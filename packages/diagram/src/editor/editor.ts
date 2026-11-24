import {
  ARROW_TYPE,
  CURSOR_TYPE,
  getFontString,
  DEFAULT_COLLISION_THRESHOLD,
  DEFAULT_STROKE_STREAMLINE,
  DEFAULT_STROKE_STREAMLINE_PRECISE,
  DOUBLE_TAP_POSITION_THRESHOLD,
  DRAGGING_THRESHOLD,
  ELEMENT_SHIFT_TRANSLATE_AMOUNT,
  ELEMENT_TRANSLATE_AMOUNT,
  Emitter,
  KEYS,
  LINE_CONFIRM_THRESHOLD,
  MINIMUM_ARROW_SIZE,
  POINTER_BUTTON,
  TAP_TWICE_TIMEOUT,
  ROUNDNESS,
  createUserAgentDescriptor,
  getGridPoint,
  getStrokeWidthByKey,
  invariant,
  isArrowKey,
  isTransparent,
  isInputLike,
  isSelectionLikeTool,
  isShallowEqual,
  isWritableElement,
  shouldMaintainAspectRatio,
  shouldResizeFromCenter,
  shouldRotateWithDiscreteAngle,
  tupleToCoors,
  updateActiveTool,
  updateStable,
  viewportCoordsToSceneCoords,
} from "@excalidraw/common";
import {
  bindBindingElementToFixedPoint,
  bindOrUnbindBindingElement,
  bindOrUnbindBindingElements,
  calculateFixedPointForNonElbowArrowBinding,
  CaptureUpdateAction,
  deepCopyElement,
  dragNewElement,
  dragNewTextElement,
  getEndpointBoundTextDragAnchor,
  getTextBindingForArrowEndpoint,
  getUnboundArrowEndpointAtPoint,
  getContainerCenter,
  getMinTextElementWidth,
  hasBoundTextElement,
  isEndpointBoundText,
  isTextBindableContainer,
  isValidTextContainer,
  getBindingStrategyForDraggingBindingElementEndpoints,
  getCommonBounds,
  getContainingFrame,
  getCursorForResizingElement,
  getDragOffsetXY,
  getElementsInResizingFrame,
  getFrameArrowIdsToReattach,
  getFrameChildrenInsertionIndex,
  getHoveredElementForBinding,
  getNormalizedDimensions,
  getSelectedGroupIdForElement,
  getSelectedGroupIds,
  getSnapOutlineMidPoint,
  handleFocusPointDrag,
  handleFocusPointHover,
  handleFocusPointPointerUp,
  hasBoundingBox,
  hitElementBoundingBox,
  hitElementBoundText,
  hitElementItself,
  isArrowElement,
  isBindableElement,
  isBindingElement,
  isBoundToContainer,
  isBindingElementType,
  isBindingEnabled,
  isBoundToElementNotIn,
  isCursorInFrame,
  isElbowArrow,
  isEligibleFrameChildType,
  isFrameClippable,
  isFrameLikeElement,
  isIframeLikeElement,
  isInvisiblySmallElement,
  isLinearElement,
  isLineElement,
  isPathALoop,
  isPointInElement,
  isSimpleArrow,
  isTextElement,
  isUsingAdaptiveRadius,
  LinearElementEditor,
  makeNextSelectedElementIds,
  maybeHandleArrowPointlikeDrag,
  mutateElement,
  newElementWith,
  moveFrameArrows,
  newArrowElement,
  newElement,
  newFreeDrawElement,
  newLinearElement,
  removeArrowsWithoutEndInFrame,
  removeElementsFromFrame,
  replaceAllElementsInFrame,
  Store,
  updateBoundElements,
  updateFrameMembershipOfSelectedElements,
  elementOverlapsWithFrame,
} from "@excalidraw/element";
import { getRenderEnvironment } from "@excalidraw/element/renderEnvironment";
import { pointDistance, pointFrom } from "@excalidraw/math";

import type { EditorInterface } from "@excalidraw/common";
import type { ArrowEndpoint, BindingStrategy } from "@excalidraw/element";
import type { RenderEnvironment } from "@excalidraw/element/renderEnvironment";
import type {
  ExcalidrawBindableElement,
  ExcalidrawElbowArrowElement,
  ExcalidrawElement,
  ExcalidrawFrameLikeElement,
  ExcalidrawGenericElement,
  ExcalidrawIframeLikeElement,
  ExcalidrawLinearElement,
  ExcalidrawTextContainer,
  ExcalidrawTextElement,
  FixedPoint,
  NonDeleted,
  NonDeletedExcalidrawElement,
  Ordered,
  OrderedExcalidrawElement,
  Theme,
} from "@excalidraw/element/types";
import type { GlobalPoint, LocalPoint } from "@excalidraw/math";

import { getDefaultAppState, isEraserActive, isHandToolActive } from "../app-state.ts";
import { restore } from "../data/restore.ts";
import { fitToContent, wheelNavigation, type ViewportState } from "../navigation.ts";
import { getSelectionColor } from "../renderer/helpers.ts";
import { renderInteractiveScene } from "../renderer/interactive-scene.ts";
import { renderNewElementScene } from "../renderer/new-element-scene.ts";
import { SceneCanvas, type RenderableElements } from "../scene-canvas.ts";
import { getNormalizedZoom } from "../scene/normalize.ts";
import { isOverScrollBars } from "../scene/scrollbars.ts";
import {
  constrainScrollState,
  getViewportForZoomWithScrollConstraints,
  type ViewportFit,
} from "../viewport.ts";
import { ActionManager } from "./actions/manager.ts";
import { actionFinalize } from "./actions/finalize.ts";
import { actionToggleLinearEditor } from "./actions/linear-editor.ts";
import { createRedoAction, createUndoAction, editorActions } from "./actions/index.ts";
import { describeSelection, describeTool } from "./announce.ts";
import { EditorCursor } from "./cursor.ts";
import { History } from "./history.ts";
import { EditorSelection, selectGroupsForSelectedElements } from "./selection.ts";
import { SelectionTool } from "./selection-tool.ts";
import {
  getReferenceSnapPoints,
  getSnapLinesAtPointer,
  getVisibleGaps,
  isActiveToolNonLinearSnappable,
  isSnappingEnabled,
  SnapCache,
  snapNewElement,
} from "./snapping.ts";
import { EditorText } from "./text.ts";
import { EraserTrail, LaserTrails, LassoTrail } from "./trails.ts";
import { TextTool } from "./text-tool.ts";
import { TOGGLE_TOOLS, findToolByKey, isEditorTool } from "./tools.ts";
import { patchLinearEditor } from "./linear.ts";

import type { DiagramScene } from "../data/types.ts";
import type { InteractiveSceneRenderAnimationState, ScrollBars } from "../scene/types.ts";
import type {
  AppState,
  BinaryFiles,
  KeyboardModifiersObject,
  NullableGridSize,
  ToolType,
} from "../types.ts";
import type { FinalizeData } from "./actions/finalize.ts";
import type { TextEditRequest } from "./text.ts";

export type { TextEditRequest };
import type {
  Action,
  ActionResult,
  ElementApp,
  PointerDownState,
  ReactCanvasPointerEvent,
} from "./types.ts";

/** What `onChange` hands over: Excalidraw's `onChange` arguments. */
export type DiagramChangeListener = (
  elements: readonly OrderedExcalidrawElement[],
  appState: AppState,
  files: BinaryFiles,
) => void;

/** The scene an `updateScene` replaces, and how the change is recorded for undo. */
export interface SceneData {
  elements?: readonly ExcalidrawElement[];
  appState?: Partial<AppState> | null;
  /**
   * `"IMMEDIATELY"` is undoable at once, `"NEVER"` never (remote updates,
   * loading a scene), `"EVENTUALLY"` with the next undoable change.
   * @default "EVENTUALLY"
   */
  captureUpdate?: (typeof CaptureUpdateAction)[keyof typeof CaptureUpdateAction];
}

/**
 * What a page can do with a mounted editor, under the names of Excalidraw's
 * imperative API, so code written against `excalidrawAPI` ports as it is.
 */
export interface DiagramEditorApi {
  updateScene(scene: SceneData): void;
  getSceneElements(): readonly NonDeletedExcalidrawElement[];
  getSceneElementsIncludingDeleted(): readonly OrderedExcalidrawElement[];
  getAppState(): Readonly<AppState>;
  getFiles(): BinaryFiles;
  setActiveTool(tool: { type: ToolType; locked?: boolean }): void;
  scrollToContent(target?: readonly ExcalidrawElement[], opts?: { fit?: ViewportFit }): void;
  resetScene(): void;
  refresh(): void;
  history: { clear(): void };
  /** Subscribes to every change; returns the unsubscribe. */
  onChange(listener: DiagramChangeListener): () => void;
}

export interface DiagramEditorOptions {
  /** The focusable element the canvases sit in: it takes the keyboard and is measured for the viewport. */
  container: HTMLElement;
  /** The scene. */
  canvas: HTMLCanvasElement;
  /** The element being drawn out, above the scene. */
  newElementCanvas: HTMLCanvasElement;
  /** The selection, handles and hover, above both; it takes the pointer. */
  interactiveCanvas: HTMLCanvasElement;
  /** An SVG over the canvases the laser, eraser and lasso draw their trails in. */
  svgLayer?: SVGSVGElement | null;
  initialData?: DiagramScene | null;
  theme?: Theme;
  viewModeEnabled?: boolean;
  gridModeEnabled?: boolean;
}

interface Gesture {
  pointers: Map<number, { x: number; y: number }>;
  lastCenter: { x: number; y: number } | null;
  initialDistance: number | null;
  initialScale: number | null;
}

type StateUpdate = Partial<AppState> | null | ((prevState: AppState) => Partial<AppState> | null);

const DEFAULT_EDITOR_INTERFACE: EditorInterface = {
  formFactor: "desktop",
  desktopUIMode: "full",
  userAgent: createUserAgentDescriptor(typeof navigator === "undefined" ? "" : navigator.userAgent),
  isTouchScreen: false,
  canFitSidebar: false,
  isLandscape: true,
};

/** The size a shape inserted from the keyboard takes, in scene units. */
const KEYBOARD_SHAPE_SIZE = 100;

const getCenter = (pointers: Map<number, { x: number; y: number }>) => {
  const all = [...pointers.values()];
  return {
    x: all.reduce((sum, each) => sum + each.x, 0) / all.length,
    y: all.reduce((sum, each) => sum + each.y, 0) / all.length,
  };
};

const getDistance = (pointers: Map<number, { x: number; y: number }>) => {
  const [a, b] = [...pointers.values()];
  return a === undefined || b === undefined ? 0 : Math.hypot(a.x - b.x, a.y - b.y);
};

/**
 * Excalidraw's editor, without React: the scene, the app state, the store and
 * its history, the tools, and the pointer and keyboard input that drive them,
 * over three canvases (the scene, the element being drawn, and the selection
 * with its handles). Ported from Excalidraw's `App` on `@excalidraw/element`.
 *
 * State changes are synchronous: `state` reads the latest at once. What
 * follows a change (the store's commit, which history records, `onChange`,
 * the live announcement) runs once per input event, or once per call from
 * outside one, and the canvases draw once a frame. A drag mutates the
 * dragged elements in place and redraws; nothing reactive runs per pointer
 * move.
 */
export class DiagramEditor {
  public readonly scene;
  public readonly store: Store;
  public readonly history: History;
  public readonly actionManager: ActionManager;
  public readonly selection: EditorSelection;
  public readonly selectionTool: SelectionTool;
  public readonly cursor: EditorCursor;
  public readonly text: EditorText;
  public readonly textTool: TextTool;
  public readonly laserTrails: LaserTrails;
  public readonly eraserTrail: EraserTrail;
  public readonly lassoTrail: LassoTrail;
  /** What the eraser has marked, erased on pointer up. */
  public elementsPendingErasure = new Set<ExcalidrawElement["id"]>();
  public readonly renderEnvironment: RenderEnvironment;
  public readonly ownerWindow: Window & typeof globalThis;
  public readonly ownerDocument: Document;
  public editorInterface: EditorInterface = DEFAULT_EDITOR_INTERFACE;
  public readonly api: DiagramEditorApi;

  /**
   * Text and arrows, Excalidraw's `AppArrowText`: the free endpoint a new
   * text binds to, the binding, drag-sizing such a text, and grabbing a label.
   */
  public readonly arrowText = {
    isBoundTextGrabbable: (element: NonDeletedExcalidrawElement, x: number, y: number) =>
      this.isBoundTextGrabbable(element, x, y),
    /**
     * A free arrow endpoint a new text could bind to: an arrow binding, so
     * Ctrl or Cmd turns it off. An element stacked above the arrow that the
     * pointer hits owns the click instead.
     */
    getBindableEndpointAtPosition: (x: number, y: number): ArrowEndpoint | null => {
      if (!isBindingEnabled(this.state)) {
        return null;
      }
      const endpoint = getUnboundArrowEndpointAtPoint(
        pointFrom(x, y),
        this.scene.getNonDeletedElements(),
        this.scene.getNonDeletedElementsMap(),
        this.state.zoom,
      );
      if (!endpoint) {
        return null;
      }
      const hitElement = this.getElementAtPosition(x, y, { includeLockedElements: true });
      if (
        hitElement &&
        hitElement.id !== endpoint.arrow.id &&
        this.scene.getElementIndex(hitElement.id) > this.scene.getElementIndex(endpoint.arrow.id)
      ) {
        return null;
      }
      return endpoint;
    },
    /** How a text reads as this endpoint's label: the side to bind, its alignment and place. */
    getTextBinding: ({ arrow, startOrEnd }: ArrowEndpoint, targetStrokeWidth: number) =>
      getTextBindingForArrowEndpoint(
        arrow,
        startOrEnd,
        this.scene.getNonDeletedElementsMap(),
        targetStrokeWidth,
      ),
    bindText: (
      { arrow, startOrEnd }: ArrowEndpoint,
      text: NonDeleted<ExcalidrawTextElement>,
      fixedPoint: FixedPoint,
    ): void => {
      bindBindingElementToFixedPoint(arrow, text, startOrEnd, fixedPoint, this.scene);
    },
    /** A text bound to an endpoint is placed by the binding: only its width is dragged out. */
    maybeDragNewText: (
      newElementBeingDrawn: ExcalidrawElement,
      pointerCoords: { x: number; y: number },
    ): boolean => {
      if (
        !isTextElement(newElementBeingDrawn) ||
        !isEndpointBoundText(newElementBeingDrawn, this.scene.getNonDeletedElementsMap())
      ) {
        return false;
      }
      dragNewTextElement({
        newElement: newElementBeingDrawn,
        ...getEndpointBoundTextDragAnchor(newElementBeingDrawn),
        pointerX: pointerCoords.x,
        zoom: this.state.zoom.value,
        scene: this.scene,
        renderEnvironment: this.renderEnvironment,
      });
      return true;
    },
  };

  public lastPointerMoveEvent: PointerEvent | null = null;
  public lastPointerMoveCoords: { x: number; y: number } | null = null;
  public lastPointerDownEvent: PointerEvent | null = null;
  public lastPointerUpEvent: PointerEvent | null = null;
  /** The last pointer up came within a double tap's time of the one before. */
  public lastPointerUpIsDoubleClick = false;
  /** The pending switch into the inside-binding mode; the interactive renderer reads it. */
  public bindModeHandler: ReturnType<typeof setTimeout> | null = null;
  public activeResizeHandle: string | null = null;
  /** The text whose editor handed its alt-press over to the canvas, while it is replayed. */
  public handedOverTextId: ExcalidrawTextElement["id"] | null = null;

  private _state: AppState;
  private committedState: AppState;
  private files: BinaryFiles = {};
  private readonly sceneCanvas: SceneCanvas;
  private readonly changeEmitter = new Emitter<Parameters<DiagramChangeListener>>();
  private readonly announceEmitter = new Emitter<[message: string]>();
  private readonly textEditEmitter = new Emitter<[request: TextEditRequest]>();
  private readonly textEditEndEmitter = new Emitter();
  private readonly listeners: (() => void)[] = [];
  private readonly resize: ResizeObserver | null = null;
  private readonly gesture: Gesture = {
    pointers: new Map(),
    lastCenter: null,
    initialDistance: null,
    initialScale: null,
  };
  private batchDepth = 0;
  private stateDirty = false;
  private sceneDirty = false;
  private commitScheduled = false;
  private committing = false;
  private afterCommit: (() => void)[] = [];
  private frame: number | null = null;
  private lastStaticKey: string | null = null;
  private renderable: RenderableElements | null = null;
  private scrollBars: ScrollBars | null = null;
  private animationState: InteractiveSceneRenderAnimationState | undefined;
  private lastFrameTime = 0;
  private pendingPointerUp: ((event: PointerEvent | null) => void) | null = null;
  private lastCompletedCanvasClicks: { x: number; y: number }[] = [];
  private lastPosition = { x: 0, y: 0 };
  private spaceHeld = false;
  private panTeardown: (() => void) | null = null;
  private isDraggingScrollBar = false;
  private destroyed = false;

  public constructor(private readonly options: DiagramEditorOptions) {
    const { container, interactiveCanvas } = options;
    // the ref may run before the container is in the page, while it still
    // belongs to a template's inert document
    this.ownerWindow = container.ownerDocument.defaultView ?? window;
    this.ownerDocument = this.ownerWindow.document;
    this.renderEnvironment = getRenderEnvironment();

    const defaults = getDefaultAppState();
    this._state = {
      ...defaults,
      theme: options.theme ?? defaults.theme,
      viewModeEnabled: options.viewModeEnabled ?? false,
      gridModeEnabled: options.gridModeEnabled ?? false,
      width: 1,
      height: 1,
      offsetLeft: 0,
      offsetTop: 0,
    };
    this.committedState = this._state;

    this.sceneCanvas = new SceneCanvas(options.canvas, [], () => this.onSceneUpdate());
    this.scene = this.sceneCanvas.scene;
    this.store = new Store(this);
    this.history = new History(this.store);
    this.store.onDurableIncrementEmitter.on((increment) => {
      this.history.record(increment.delta);
    });

    this.actionManager = new ActionManager(
      (result, action) => this.syncActionResult(result, action),
      () => this.state,
      () => this.scene.getElementsIncludingDeleted(),
      this,
    );
    this.actionManager.registerAll(editorActions);
    this.actionManager.registerAll([
      createUndoAction(this.history),
      createRedoAction(this.history),
    ]);

    this.selection = new EditorSelection(this);
    this.selectionTool = new SelectionTool(this);
    this.cursor = new EditorCursor(interactiveCanvas, () => this.state);
    this.text = new EditorText(this);
    this.textTool = new TextTool(this);
    this.laserTrails = new LaserTrails(this);
    this.eraserTrail = new EraserTrail(this);
    this.lassoTrail = new LassoTrail(this);
    if (options.svgLayer) {
      this.laserTrails.start(options.svgLayer);
      this.eraserTrail.start(options.svgLayer);
      this.lassoTrail.start(options.svgLayer);
    }

    this.api = {
      updateScene: (scene) => this.batch(() => this.updateScene(scene)),
      getSceneElements: () => this.scene.getNonDeletedElements(),
      getSceneElementsIncludingDeleted: () => this.scene.getElementsIncludingDeleted(),
      getAppState: () => this.state,
      getFiles: () => this.files,
      setActiveTool: (tool) => this.batch(() => this.setActiveTool(tool)),
      scrollToContent: (target, opts) => this.batch(() => this.scrollToContent(target, opts)),
      resetScene: () => this.batch(() => this.resetScene()),
      refresh: () => this.batch(() => this.refresh()),
      history: { clear: () => this.history.clear() },
      onChange: (listener) => this.changeEmitter.on(listener),
    };

    this.measure();
    this.batch(() => this.loadScene(options.initialData ?? null));
    this.cursor.reset();
    this.listen();

    this.resize =
      "ResizeObserver" in this.ownerWindow
        ? new this.ownerWindow.ResizeObserver(() => this.batch(() => this.refresh()))
        : null;
    this.resize?.observe(container);
  }

  // ---------------------------------------------------------------------------
  // state

  public get container(): HTMLElement {
    return this.options.container;
  }

  public get canvas(): HTMLCanvasElement {
    return this.options.canvas;
  }

  public get interactiveCanvas(): HTMLCanvasElement {
    return this.options.interactiveCanvas;
  }

  public get state(): AppState {
    return this._state;
  }

  /** `@excalidraw/element` takes the editor as Excalidraw's `App`, of which it reads a few members. */
  public get elementApp(): ElementApp {
    return this;
  }

  /**
   * Merges into the state at once. What follows a change runs when the
   * current input event is handled, or right away outside of one; `callback`
   * runs after it.
   */
  public setState(update: StateUpdate, callback?: () => void): void {
    const next = typeof update === "function" ? update(this._state) : update;
    if (next) {
      this._state = { ...this._state, ...next };
      this.stateDirty = true;
    }
    if (callback) this.afterCommit.push(callback);
    this.requestCommit();
  }

  /** Runs `fn` as one change: what follows it runs once, at the end. */
  public batch<T>(fn: () => T): T {
    this.batchDepth++;
    try {
      return fn();
    } finally {
      this.batchDepth--;
      if (this.batchDepth === 0) this.commit();
    }
  }

  /** Subscribes to every change, with Excalidraw's `onChange` arguments. */
  public onChange(listener: DiagramChangeListener): () => void {
    return this.changeEmitter.on(listener);
  }

  /** Subscribes to what the live region should say: tool and selection changes, and actions. */
  public onAnnounce(listener: (message: string) => void): () => void {
    return this.announceEmitter.on(listener);
  }

  /**
   * Subscribes to requests to edit text: a double-click, Enter on text or a
   * shape, the text tool. The host answers with a textarea given to
   * `request.attach`; without a subscriber, text is not edited.
   */
  public onTextEditRequest(listener: (request: TextEditRequest) => void): () => void {
    return this.textEditEmitter.on(listener);
  }

  /** Subscribes to the end of a text edit, when the host removes its textarea. */
  public onTextEditEnd(listener: () => void): () => void {
    return this.textEditEndEmitter.on(listener);
  }

  public hasTextEditor(): boolean {
    return this.textEditEmitter.subscribers.length > 0;
  }

  public emitTextEditRequest(request: TextEditRequest): void {
    this.textEditEmitter.trigger(request);
  }

  public emitTextEditEnd(): void {
    this.textEditEndEmitter.trigger();
  }

  public get isDestroyed(): boolean {
    return this.destroyed;
  }

  /** The elements in the viewport, as the canvas draws them. */
  public get visibleElements(): readonly NonDeletedExcalidrawElement[] {
    const { state } = this;
    return this.sceneCanvas.renderer.getRenderableElements({
      zoom: state.zoom,
      offsetLeft: state.offsetLeft,
      offsetTop: state.offsetTop,
      scrollX: state.scrollX,
      scrollY: state.scrollY,
      height: state.height,
      width: state.width,
      editingTextElement: state.editingTextElement,
      newElement: state.newElement,
      selectedElements: this.scene.getSelectedElements(state),
      selectedElementsAreBeingDragged: state.selectedElementsAreBeingDragged,
      frameToHighlight: state.frameToHighlight,
    }).visibleElements;
  }

  /** The scene's fonts, which load the faces text needs and measure it again. */
  public get fonts() {
    return this.sceneCanvas.fonts;
  }

  /** Runs `callback` once what is under way has been committed. */
  public afterNextCommit(callback: () => void): void {
    this.afterCommit.push(callback);
    this.requestCommit();
  }

  /** Whether the viewport is being navigated: space held, a drag-pan, a scrollbar, the hand tool. */
  public isNavigating(): boolean {
    return (
      this.spaceHeld ||
      this.panTeardown !== null ||
      this.isDraggingScrollBar ||
      isHandToolActive(this.state)
    );
  }

  public getFiles(): BinaryFiles {
    return this.files;
  }

  public getEffectiveGridSize = (): NullableGridSize =>
    (this.state.gridModeEnabled ? this.state.gridSize : null) as NullableGridSize;

  public isToolLocked(): boolean {
    return this.state.activeTool.locked;
  }

  public focusContainer = (): void => {
    this.options.container.focus({ preventScroll: true });
  };

  private requestCommit(): void {
    if (this.batchDepth > 0 || this.committing) return;
    if (this.commitScheduled) return;
    this.commitScheduled = true;
    queueMicrotask(() => {
      this.commitScheduled = false;
      if (this.batchDepth === 0) this.commit();
    });
  }

  private onSceneUpdate(): void {
    this.sceneDirty = true;
    this.scheduleRender();
    this.requestCommit();
  }

  /** What Excalidraw runs in `componentDidUpdate`: the store's commit, `onChange`, the announcements. */
  private commit(): void {
    if (this.committing || this.destroyed) return;
    this.committing = true;
    try {
      for (let round = 0; round < 16 && (this.stateDirty || this.sceneDirty); round++) {
        const prevState = this.committedState;
        this.stateDirty = false;
        this.sceneDirty = false;
        this.committedState = this._state;
        this.didUpdate(prevState);
      }
    } finally {
      this.committing = false;
    }
    const callbacks = this.afterCommit;
    this.afterCommit = [];
    if (callbacks.length > 0) {
      this.batch(() => {
        for (const callback of callbacks) callback();
      });
    }
  }

  private didUpdate(prevState: AppState): void {
    // the line editor ends once its line is no longer selected
    if (
      this.state.selectedLinearElement?.isEditing &&
      !this.state.selectedElementIds[this.state.selectedLinearElement.elementId]
    ) {
      this.actionManager.executeAction(actionFinalize);
    }

    // only elements in the scene are selected
    const staleSelectedElementIds = Object.keys(this.state.selectedElementIds).filter((id) => {
      const element = this.scene.getElement(id);
      return !element || element.isDeleted;
    });
    if (staleSelectedElementIds.length > 0) {
      const nextSelectedElementIds = { ...this.state.selectedElementIds };
      for (const id of staleSelectedElementIds) delete nextSelectedElementIds[id];
      this._state = {
        ...this._state,
        selectedElementIds: makeNextSelectedElementIds(nextSelectedElementIds, this._state),
      };
      this.committedState = this._state;
    }

    // neither the text tool's hover nor a pending centre click outlives the tool
    if (prevState.activeTool.type === "text" && this.state.activeTool.type !== "text") {
      this.textTool.clearHover();
      this.textTool.cancel();
    }
    if (
      prevState.zoom.value !== this.state.zoom.value ||
      prevState.scrollX !== this.state.scrollX ||
      prevState.scrollY !== this.state.scrollY
    ) {
      // the scene moved under a still pointer
      this.textTool.refresh();
    }
    if (isEraserActive(prevState) && !isEraserActive(this.state)) {
      this.eraserTrail.endPath();
    }
    if (Object.keys(this.state.selectedElementIds).length && isEraserActive(this.state)) {
      this._state = {
        ...this._state,
        activeTool: updateActiveTool(this._state, { type: "selection" }),
      };
      this.committedState = this._state;
    }
    if (
      (this.state.activeTool.type === "eraser" || this.state.activeTool.type === "laser") &&
      prevState.theme !== this.state.theme
    ) {
      this.cursor.applyForTool();
    }
    if (this.state.viewModeEnabled && !prevState.viewModeEnabled) {
      // nothing is edited in view mode
      queueMicrotask(() => this.text.textWysiwygSubmitHandler?.());
    }

    this.store.commit(this.scene.getElementsMapIncludingDeleted(), this.state);
    this.changeEmitter.trigger(this.scene.getElementsIncludingDeleted(), this.state, this.files);
    this.announceChanges(prevState);
    this.scheduleRender();
  }

  private announceChanges(prevState: AppState): void {
    const state = this.state;
    if (prevState.activeTool.type !== state.activeTool.type) {
      this.announce(describeTool(state.activeTool.type));
    }
    if (
      prevState.selectedElementIds !== state.selectedElementIds &&
      !isShallowEqual(prevState.selectedElementIds, state.selectedElementIds) &&
      !state.newElement &&
      !state.multiElement
    ) {
      this.announce(describeSelection(this.scene.getSelectedElements(state), state));
    } else if (prevState.editingGroupId !== state.editingGroupId && state.editingGroupId) {
      this.announce("Editing group");
    }
  }

  private announce(message: string): void {
    this.announceEmitter.trigger(message);
  }

  // ---------------------------------------------------------------------------
  // scene

  private loadScene(data: DiagramScene | null): void {
    const restored = restore(data, null, null, { repairBindings: true });
    const { width, height, offsetLeft, offsetTop, theme, viewModeEnabled, gridModeEnabled } =
      this.state;
    this.store.clear();
    this.history.clear();
    this.files = restored.files;
    this.syncActionResult({
      elements: restored.elements,
      appState: {
        ...restored.appState,
        width,
        height,
        offsetLeft,
        offsetTop,
        theme: this.options.theme ?? (data?.appState?.theme ? restored.appState.theme : theme),
        viewModeEnabled,
        gridModeEnabled: data?.appState?.gridModeEnabled ?? gridModeEnabled,
        isLoading: false,
      },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    void Promise.all([this.sceneCanvas.loadFonts(), this.sceneCanvas.setFiles(this.files)]).catch(
      (error: unknown) => {
        console.error("DiagramEditor: the scene's fonts or images did not load", error);
      },
    );
  }

  /** Replaces elements or merges app state, recording the change as `captureUpdate` says. */
  public updateScene({ elements, appState, captureUpdate }: SceneData): void {
    if (captureUpdate) {
      this.store.scheduleMicroAction({
        action: captureUpdate,
        elements,
        appState: appState ? { ...this.store.snapshot.appState, ...appState } : undefined,
      });
    }
    if (appState) {
      this.setState(appState);
    }
    if (elements) {
      this.scene.replaceAllElements(elements);
    }
  }

  /** Clears the scene, the store and the history, keeping the theme. */
  public resetScene(): void {
    this.scene.replaceAllElements([]);
    const { width, height, offsetLeft, offsetTop, theme } = this.state;
    this.setState({
      ...getDefaultAppState(),
      width,
      height,
      offsetLeft,
      offsetTop,
      theme,
    });
    this.store.clear();
    this.history.clear();
  }

  /** Applies what an action returned. */
  public syncActionResult(result: ActionResult, action?: Action): void {
    if (this.destroyed || result === false) {
      return;
    }
    this.batch(() => {
      this.store.scheduleAction(result.captureUpdate);
      let didUpdate = false;
      if (result.elements) {
        this.scene.replaceAllElements(result.elements);
        didUpdate = true;
      }
      if (result.files) {
        this.files = { ...this.files, ...result.files };
      }
      if (result.appState) {
        const appState = result.appState;
        this.setState((prevState) => ({
          ...prevState,
          ...appState,
          contextMenu: null,
          editingTextElement: appState.editingTextElement ?? null,
          viewModeEnabled: appState.viewModeEnabled ?? prevState.viewModeEnabled,
          theme: appState.theme ?? prevState.theme,
          name: appState.name ?? prevState.name,
        }));
        didUpdate = true;
      }
      if (!didUpdate) {
        this.scene.triggerUpdate();
      }
      const label = action?.label;
      if (label) {
        this.afterCommit.push(() => this.announce(label));
      }
    });
  }

  public insertNewElements(elements: readonly ExcalidrawElement[]): void {
    const chunks: ExcalidrawElement[][] = [];
    for (const element of elements) {
      const current = chunks[chunks.length - 1];
      if (current?.[0]?.frameId === element.frameId) {
        current.push(element);
      } else {
        chunks.push([element]);
      }
    }
    for (const chunk of chunks) {
      const frameId = chunk[0]?.frameId;
      const insertionIndex = frameId
        ? getFrameChildrenInsertionIndex(this.scene.getElementsIncludingDeleted(), frameId)
        : null;
      this.scene.insertElementsAtIndex(chunk, insertionIndex);
    }
  }

  public insertNewElement(element: ExcalidrawElement): void {
    this.insertNewElements([element]);
    const frame = element.frameId ? this.scene.getNonDeletedElement(element.frameId) : null;
    this.updateFrameToHighlight(frame && isFrameLikeElement(frame) ? frame : null);
  }

  // ---------------------------------------------------------------------------
  // tools

  public setActiveTool(
    tool: { type: ToolType; locked?: boolean; fromSelection?: boolean },
    opts: { keepSelection?: boolean; toggle?: boolean } = {},
  ): void {
    if (!isEditorTool(tool.type)) {
      console.warn(`DiagramEditor: the "${tool.type}" tool is not available`);
      return;
    }
    const isToggleTool = TOGGLE_TOOLS.includes(tool.type);
    const toggle = opts.toggle === true && isToggleTool;

    const nextActiveTool: AppState["activeTool"] =
      toggle && this.state.activeTool.type === tool.type
        ? updateActiveTool(this.state, {
            ...(this.state.activeTool.lastActiveTool ?? {
              type: this.state.preferredSelectionTool.type,
            }),
            lastActiveTool: null,
          })
        : isToggleTool && this.state.activeTool.type !== tool.type
          ? updateActiveTool(this.state, { ...tool, lastActiveTool: this.state.activeTool })
          : updateActiveTool(this.state, tool);

    if (nextActiveTool.type === "hand") {
      this.cursor.set(CURSOR_TYPE.GRAB);
    } else if (!this.spaceHeld) {
      this.cursor.applyForTool(nextActiveTool);
    }
    if (!isBindingElementType(nextActiveTool.type)) {
      this.setState({ suggestedBinding: null });
    }

    this.setState((prevState) => {
      const commonResets = {
        snapLines: prevState.snapLines.length ? [] : prevState.snapLines,
        originSnapOffset: null,
        activeEmbeddable: null,
        selectedLinearElement: isSelectionLikeTool(nextActiveTool.type)
          ? prevState.selectedLinearElement
          : null,
        frameToHighlight: null,
      } as const;

      if (nextActiveTool.type === "freedraw") {
        this.store.scheduleCapture();
      }

      if (nextActiveTool.type === "lasso") {
        return {
          ...commonResets,
          activeTool: nextActiveTool,
          ...(opts.keepSelection
            ? {}
            : {
                selectedElementIds: makeNextSelectedElementIds({}, prevState),
                selectedGroupIds: makeNextSelectedElementIds({}, prevState),
                editingGroupId: null,
                multiElement: null,
              }),
        };
      }
      if (nextActiveTool.type !== "selection") {
        return {
          ...commonResets,
          activeTool: nextActiveTool,
          selectedElementIds: makeNextSelectedElementIds({}, prevState),
          selectedGroupIds: makeNextSelectedElementIds({}, prevState),
          editingGroupId: null,
          multiElement: null,
        };
      }
      return { ...commonResets, activeTool: nextActiveTool };
    });
  }

  public toggleLock(): void {
    this.setState((prevState) => ({
      activeTool: {
        ...prevState.activeTool,
        ...updateActiveTool(
          prevState,
          prevState.activeTool.locked
            ? { type: prevState.preferredSelectionTool.type }
            : prevState.activeTool,
        ),
        locked: !prevState.activeTool.locked,
      },
    }));
  }

  private getCurrentItemRoundness(
    elementType: "selection" | "rectangle" | "diamond" | "ellipse",
  ): ExcalidrawElement["roundness"] {
    return this.state.currentItemRoundness === "round"
      ? {
          type: isUsingAdaptiveRadius(elementType)
            ? ROUNDNESS.ADAPTIVE_RADIUS
            : ROUNDNESS.PROPORTIONAL_RADIUS,
        }
      : null;
  }

  public getCurrentItemStrokeWidth(elementType: ExcalidrawElement["type"]): number {
    return getStrokeWidthByKey(elementType, this.state.currentItemStrokeWidthKey);
  }

  // ---------------------------------------------------------------------------
  // viewport

  /** Moves the viewport, held to `scrollConstraints`. */
  public translateViewport(
    update: Partial<ViewportState> | ((state: AppState) => Partial<ViewportState> | null),
  ): void {
    this.setState((state) => {
      const next = typeof update === "function" ? update(state) : update;
      if (!next) return null;
      return constrainScrollState({ ...state, ...next });
    });
  }

  /** Fits `target` (every element by default) in the viewport. */
  public scrollToContent(
    target: readonly ExcalidrawElement[] = this.scene.getNonDeletedElements(),
    opts: { fit?: ViewportFit } = {},
  ): void {
    const fitted = fitToContent(this.state, target, opts.fit ?? "scale-down");
    this.setState(constrainScrollState({ ...this.state, ...fitted }));
  }

  /** Measures the container again, after it moved or resized. */
  public refresh(): void {
    this.measure();
    this.scheduleRender();
  }

  private measure(): void {
    const { container } = this.options;
    const rect = container.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || container.clientWidth));
    const height = Math.max(1, Math.round(rect.height || container.clientHeight));
    const { state } = this;
    if (
      state.width !== width ||
      state.height !== height ||
      state.offsetLeft !== rect.left ||
      state.offsetTop !== rect.top
    ) {
      this.setState({ width, height, offsetLeft: rect.left, offsetTop: rect.top });
    }
  }

  // ---------------------------------------------------------------------------
  // hit testing

  public getElementHitThreshold(element: ExcalidrawElement): number {
    return Math.max(
      element.strokeWidth / 2 + 0.1,
      // under 0.63 the hit test turns unreliable at high zoom, from float imprecision
      0.85 * (DEFAULT_COLLISION_THRESHOLD / this.state.zoom.value),
    );
  }

  public hitElement(
    x: number,
    y: number,
    element: NonDeletedExcalidrawElement,
    considerBoundingBox = true,
  ): boolean {
    // a selected element is hit anywhere in its bounding box
    if (
      considerBoundingBox &&
      this.state.selectedElementIds[element.id] &&
      hasBoundingBox([element], this.state, this.editorInterface) &&
      hitElementBoundingBox(
        pointFrom(x, y),
        element,
        this.scene.getNonDeletedElementsMap(),
        this.getElementHitThreshold(element),
      )
    ) {
      return true;
    }
    if (hitElementBoundText(pointFrom(x, y), element, this.scene.getNonDeletedElementsMap())) {
      return true;
    }
    return hitElementItself({
      point: pointFrom(x, y),
      element,
      threshold: this.getElementHitThreshold(element),
      elementsMap: this.scene.getNonDeletedElementsMap(),
      frameNameBound: null,
    });
  }

  /** Whether the element's frame clips it away at the point. */
  public isClippedByFrameAt(x: number, y: number, element: ExcalidrawElement): boolean {
    const elementsMap = this.scene.getNonDeletedElementsMap();
    const containingFrame = getContainingFrame(element, elementsMap);
    return (
      !!containingFrame &&
      this.state.frameRendering.enabled &&
      this.state.frameRendering.clip &&
      !isIframeLikeElement(element) &&
      isFrameClippable(element, elementsMap) &&
      !isCursorInFrame(
        { x, y },
        containingFrame as NonDeleted<ExcalidrawFrameLikeElement>,
        elementsMap,
      )
    );
  }

  /** The elements at a scene point, bottom first; embeds on top. */
  public getElementsAtPosition(
    x: number,
    y: number,
    opts?: { includeBoundTextElement?: boolean; includeLockedElements?: boolean },
  ): NonDeleted<ExcalidrawElement>[] {
    const iframeLikes: Ordered<NonDeleted<ExcalidrawIframeLikeElement>>[] = [];
    const elements = this.scene
      .getNonDeletedElements()
      .filter(
        (element) =>
          (opts?.includeLockedElements || !element.locked) &&
          (opts?.includeBoundTextElement || !(isTextElement(element) && element.containerId)),
      )
      .filter((element) => this.hitElement(x, y, element))
      .filter((element) => !this.isClippedByFrameAt(x, y, element))
      .filter((element) => {
        if (isIframeLikeElement(element)) {
          iframeLikes.push(element);
          return false;
        }
        return true;
      });
    return [...elements, ...iframeLikes];
  }

  /** The topmost element at a scene point, preferring a selected one when asked. */
  public getElementAtPosition(
    x: number,
    y: number,
    opts?: (
      | { includeBoundTextElement?: boolean; includeLockedElements?: boolean }
      | { allHitElements: NonDeleted<ExcalidrawElement>[] }
    ) & { preferSelected?: boolean },
  ): NonDeleted<ExcalidrawElement> | null {
    const allHitElements =
      opts && "allHitElements" in opts
        ? opts.allHitElements
        : this.getElementsAtPosition(x, y, {
            includeBoundTextElement: opts?.includeBoundTextElement,
            includeLockedElements: opts?.includeLockedElements,
          });

    if (allHitElements.length > 1) {
      if (opts?.preferSelected) {
        for (let index = allHitElements.length - 1; index > -1; index--) {
          const candidate = allHitElements[index];
          if (candidate && this.state.selectedElementIds[candidate.id]) {
            return candidate;
          }
        }
      }
      const topmost = allHitElements[allHitElements.length - 1];
      if (!topmost) return null;
      // hitting the topmost only on its bounding box while hitting another's
      // shape: the other one
      return hitElementItself({
        point: pointFrom(x, y),
        element: topmost,
        threshold: this.getElementHitThreshold(topmost) / 2,
        elementsMap: this.scene.getNonDeletedElementsMap(),
        frameNameBound: null,
      })
        ? topmost
        : (allHitElements[allHitElements.length - 2] ?? null);
    }
    return allHitElements[0] ?? null;
  }

  private isBoundTextGrabbable(
    element: NonDeletedExcalidrawElement,
    x: number,
    y: number,
  ): boolean {
    if (
      !isArrowElement(element) ||
      !hitElementBoundText(pointFrom(x, y), element, this.scene.getNonDeletedElementsMap())
    ) {
      return false;
    }
    const hitElements = this.getElementsAtPosition(x, y);
    const arrowIndex = hitElements.findIndex((el) => el.id === element.id);
    return (
      arrowIndex !== -1 &&
      !hitElements.slice(arrowIndex + 1).some((el) => this.hitElement(x, y, el, false))
    );
  }

  public getTopLayerFrameAtSceneCoords(
    sceneCoords: { x: number; y: number },
    opts?: {
      excludeElementIds?: AppState["selectedElementIds"];
      currentFrameId?: ExcalidrawElement["frameId"];
    },
  ): NonDeleted<ExcalidrawFrameLikeElement> | null {
    const elementsMap = this.scene.getNonDeletedElementsMap();
    const framesUnderCursor = this.scene
      .getNonDeletedFramesLikes()
      .filter((frame) => !frame.locked && isCursorInFrame(sceneCoords, frame, elementsMap));

    const topLayerFrame = framesUnderCursor.at(-1);
    if (!topLayerFrame) {
      return null;
    }

    const hitElement = this.getElementsAtPosition(sceneCoords.x, sceneCoords.y, {
      includeLockedElements: true,
    }).findLast((element) => !opts?.excludeElementIds?.[element.id]);

    if (hitElement) {
      if (isFrameLikeElement(hitElement) && !hitElement.locked) {
        return topLayerFrame;
      }
      const hitElementIndex = this.scene.getElementIndex(hitElement.id);
      const topLayerFrameIndex = this.scene.getElementIndex(topLayerFrame.id);
      if (
        hitElementIndex !== -1 &&
        topLayerFrameIndex !== -1 &&
        hitElementIndex <= topLayerFrameIndex
      ) {
        return topLayerFrame;
      }
      // a frame child dragged under an element covering the pointer
      const currentFrame = opts?.currentFrameId
        ? (framesUnderCursor.find((frame) => frame.id === opts.currentFrameId) ?? null)
        : null;
      if (currentFrame) {
        return currentFrame;
      }
      return hitElement.frameId
        ? (framesUnderCursor.find((frame) => frame.id === hitElement.frameId) ?? null)
        : null;
    }
    return topLayerFrame;
  }

  /** Caches the points the selection snaps to, unless cached; snapping is per drag. */
  public maybeCacheReferenceSnapPoints(
    event: KeyboardModifiersObject,
    selectedElements: readonly NonDeletedExcalidrawElement[],
    recomputeAnyways = false,
  ): void {
    if (
      isSnappingEnabled({ event, app: this, selectedElements }) &&
      (recomputeAnyways || !SnapCache.getReferenceSnapPoints())
    ) {
      SnapCache.setReferenceSnapPoints(
        getReferenceSnapPoints(
          this.scene.getNonDeletedElements(),
          selectedElements,
          this.state,
          this.scene.getNonDeletedElementsMap(),
        ),
      );
    }
  }

  /** Caches the gaps between visible elements the selection snaps into, unless cached. */
  public maybeCacheVisibleGaps(
    event: KeyboardModifiersObject,
    selectedElements: readonly NonDeletedExcalidrawElement[],
    recomputeAnyways = false,
  ): void {
    if (
      isSnappingEnabled({ event, app: this, selectedElements }) &&
      (recomputeAnyways || !SnapCache.getVisibleGaps())
    ) {
      SnapCache.setVisibleGaps(
        getVisibleGaps(
          this.scene.getNonDeletedElements(),
          selectedElements,
          this.state,
          this.scene.getNonDeletedElementsMap(),
        ),
      );
    }
  }

  public updateFrameToHighlight(frameToHighlight: AppState["frameToHighlight"]): void {
    if (this.state.frameToHighlight !== frameToHighlight) {
      this.setState({ frameToHighlight });
    }
  }

  // ---------------------------------------------------------------------------
  // input: listeners

  private listen(): void {
    const { container, interactiveCanvas } = this.options;
    const on = <K extends keyof HTMLElementEventMap>(
      target: HTMLElement,
      type: K,
      handler: (event: HTMLElementEventMap[K]) => void,
      options?: AddEventListenerOptions,
    ) => {
      const wrapped = (event: HTMLElementEventMap[K]) => this.batch(() => handler(event));
      target.addEventListener(type, wrapped, options);
      this.listeners.push(() => target.removeEventListener(type, wrapped, options));
    };
    on(interactiveCanvas, "pointerdown", (event) => this.handleCanvasPointerDown(event));
    on(interactiveCanvas, "pointermove", (event) => this.handleCanvasPointerMove(event));
    on(interactiveCanvas, "pointerup", (event) => this.handleCanvasPointerUp(event));
    on(interactiveCanvas, "pointercancel", (event) => this.handleCanvasPointerCancel(event));
    on(interactiveCanvas, "dblclick", (event) => this.handleCanvasDoubleClick(event));
    on(interactiveCanvas, "click", (event) => this.handleCanvasClick(event));
    on(interactiveCanvas, "contextmenu", (event) => event.preventDefault());
    on(container, "keydown", (event) => this.onKeyDown(event));
    on(container, "keyup", (event) => this.onKeyUp(event));
    on(container, "wheel", (event) => this.onWheel(event), { passive: false });
    on(container, "focusout", (event) => {
      if (!container.contains(event.relatedTarget as Node | null)) this.onBlur();
    });
  }

  private addWindowListener<K extends keyof WindowEventMap>(
    type: K,
    handler: (event: WindowEventMap[K]) => void,
  ): () => void {
    const wrapped = (event: WindowEventMap[K]) => this.batch(() => handler(event));
    this.ownerWindow.addEventListener(type, wrapped);
    return () => this.ownerWindow.removeEventListener(type, wrapped);
  }

  private onBlur(): void {
    this.spaceHeld = false;
    this.setState({ isBindingEnabled: this.state.bindingPreference === "enabled" });
  }

  // ---------------------------------------------------------------------------
  // input: wheel and gestures

  private onWheel(event: WheelEvent): void {
    // a drag-pan owns the viewport
    if (this.panTeardown !== null && (event.buttons & 4) === 0) {
      return;
    }
    this.measure();
    const next = wheelNavigation(event, this.state);
    event.preventDefault();
    if (next !== null) {
      this.setState(next);
    }
  }

  private updateGestureOnPointerDown(event: PointerEvent): void {
    const { gesture } = this;
    gesture.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (gesture.pointers.size === 2) {
      gesture.lastCenter = getCenter(gesture.pointers);
      gesture.initialScale = this.state.zoom.value;
      gesture.initialDistance = getDistance(gesture.pointers);
    }
  }

  /** The two-finger pinch: zooms and pans together. */
  private updateMultiTouchGesture(event: PointerEvent): void {
    const { gesture } = this;
    if (gesture.pointers.has(event.pointerId)) {
      gesture.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    const { initialScale, initialDistance, lastCenter } = gesture;
    if (gesture.pointers.size === 2 && lastCenter && initialScale && initialDistance) {
      const center = getCenter(gesture.pointers);
      const deltaX = center.x - lastCenter.x;
      const deltaY = center.y - lastCenter.y;
      gesture.lastCenter = center;

      const distance = getDistance(gesture.pointers);
      const scaleFactor =
        this.state.activeTool.type === "freedraw" && this.state.penMode
          ? 1
          : distance / initialDistance;
      const nextZoom = scaleFactor
        ? getNormalizedZoom(initialScale * scaleFactor)
        : this.state.zoom.value;

      this.translateViewport((state) => {
        const zoomed = getViewportForZoomWithScrollConstraints(
          { viewportX: center.x, viewportY: center.y, nextZoom },
          state,
        );
        return {
          zoom: zoomed.zoom,
          scrollX: zoomed.scrollX + deltaX / zoomed.zoom.value,
          scrollY: zoomed.scrollY + deltaY / zoomed.zoom.value,
        };
      });
    } else {
      gesture.lastCenter = gesture.initialDistance = gesture.initialScale = null;
    }
  }

  private removePointer(event: PointerEvent): void {
    this.gesture.pointers.delete(event.pointerId);
  }

  /**
   * Starts a drag-pan for the pointer down if it is one: the wheel or the
   * secondary button, the main button with space held or the hand tool, or
   * any button in view mode.
   */
  public startPan(event: PointerEvent): boolean {
    if (
      !(
        this.gesture.pointers.size <= 1 &&
        (event.button === POINTER_BUTTON.WHEEL ||
          event.button === POINTER_BUTTON.SECONDARY ||
          (event.button === POINTER_BUTTON.MAIN && this.spaceHeld) ||
          isHandToolActive(this.state) ||
          this.state.viewModeEnabled)
      )
    ) {
      return false;
    }
    this.focusContainer();
    event.preventDefault();
    this.cursor.set(CURSOR_TYPE.GRABBING);

    let lastX = event.clientX;
    let lastY = event.clientY;
    const offMove = this.addWindowListener("pointermove", (move) => {
      const deltaX = lastX - move.clientX;
      const deltaY = lastY - move.clientY;
      lastX = move.clientX;
      lastY = move.clientY;
      this.translateViewport((state) => ({
        scrollX: state.scrollX - deltaX / state.zoom.value,
        scrollY: state.scrollY - deltaY / state.zoom.value,
      }));
    });
    const teardown = () => {
      this.panTeardown = null;
      offMove();
      offUp();
      if (!this.spaceHeld) this.cursor.reset();
      this.setState({ cursorButton: "up" });
    };
    const offUp = this.addWindowListener("pointerup", teardown);
    this.panTeardown = teardown;
    return true;
  }

  // ---------------------------------------------------------------------------
  // input: pointer

  private handleCanvasPointerDown(event: PointerEvent): void {
    if (!event.ctrlKey) {
      const preferenceEnabled = this.state.bindingPreference === "enabled";
      if (this.state.isBindingEnabled !== preferenceEnabled) {
        this.setState({ isBindingEnabled: preferenceEnabled });
      }
    }

    this.measure();
    const scenePointer = viewportCoordsToSceneCoords(event, this.state);
    this.lastPointerMoveCoords = { x: scenePointer.x, y: scenePointer.y };

    const target = event.target as HTMLElement | null;
    target?.setPointerCapture?.(event.pointerId);

    // a pointer up may never have come (the user tabbed away)
    this.maybeCleanupAfterMissingPointerUp(event);
    this.focusContainer();

    if (this.state.contextMenu) {
      this.setState({ contextMenu: null });
    }
    if (this.state.snapLines.length) {
      this.setState({ snapLines: [] });
    }

    this.updateGestureOnPointerDown(event);

    // a second finger on a freedraw stroke: a short stroke is a spike and
    // goes; a longer one stays
    if (event.pointerType === "touch" && this.state.newElement?.type === "freedraw") {
      const element = this.state.newElement;
      this.updateScene({
        ...(element.points.length < 10
          ? {
              elements: this.scene
                .getElementsIncludingDeleted()
                .filter((el) => el.id !== element.id),
            }
          : {}),
        appState: {
          newElement: null,
          editingTextElement: null,
          suggestedBinding: null,
          selectedElementIds: makeNextSelectedElementIds(
            Object.fromEntries(
              Object.entries(this.state.selectedElementIds).filter(([id]) => id !== element.id),
            ) as AppState["selectedElementIds"],
            this.state,
          ),
        },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      return;
    }

    if (!this.state.penDetected && event.pointerType === "pen") {
      this.setState({
        penMode: true,
        penDetected: true,
        currentItemStrokeVariability: "variable",
      });
    }
    if (!this.editorInterface.isTouchScreen && ["pen", "touch"].includes(event.pointerType)) {
      this.editorInterface = { ...this.editorInterface, isTouchScreen: true };
    }

    if (this.panTeardown !== null) {
      return;
    }

    this.lastPointerDownEvent = event;

    if (this.startPan(event)) {
      return;
    }

    this.setState({
      lastPointerDownWith: event.pointerType as AppState["lastPointerDownWith"],
      cursorButton: "down",
    });

    // a pen's eraser end erases for as long as it is pressed
    if (event.button === POINTER_BUTTON.ERASER && this.state.activeTool.type !== "eraser") {
      this.setState({
        activeTool: updateActiveTool(this.state, {
          type: "eraser",
          lastActiveTool: this.state.activeTool,
        }),
      });
      const offUp = this.addWindowListener("pointerup", () => {
        offUp();
        if (isEraserActive(this.state)) {
          this.setState({
            activeTool: updateActiveTool(this.state, {
              ...(this.state.activeTool.lastActiveTool ?? { type: "selection" }),
              lastActiveTool: null,
            }),
          });
        }
      });
    }

    // only the main button and touch
    if (event.button !== POINTER_BUTTON.MAIN && event.button !== POINTER_BUTTON.TOUCH) {
      return;
    }

    // a two-finger gesture navigates
    if (this.gesture.pointers.size > 1) {
      return;
    }

    const pointerDownState = this.initialPointerDownState(event);

    this.setState({ selectedElementsAreBeingDragged: false });

    if (
      this.text.handleTextAutoResizeHandlePointerDown(
        this.scene.getSelectedElements(this.state),
        pointerDownState.origin,
      )
    ) {
      return;
    }

    if (this.handleDraggingScrollBar(event, pointerDownState)) {
      return;
    }

    this.clearSelectionIfNotUsingSelection();

    if (this.selectionTool.handleSelectionOnPointerDown(event, pointerDownState)) {
      return;
    }

    const allowOnPointerDown =
      !this.state.penMode ||
      event.pointerType !== "touch" ||
      this.state.activeTool.type === "selection" ||
      this.state.activeTool.type === "lasso" ||
      this.state.activeTool.type === "text" ||
      this.state.activeTool.type === "image";
    if (!allowOnPointerDown) {
      return;
    }

    const toolType = this.state.activeTool.type;
    if (toolType === "lasso") {
      const hitSelectedElement =
        pointerDownState.hit.element &&
        this.selection.isASelectedElement(pointerDownState.hit.element);
      const shouldForceLassoReselect =
        event.altKey && event[KEYS.CTRL_OR_CMD] && !pointerDownState.resize.handleType;
      const shouldStartLassoSelection =
        shouldForceLassoReselect ||
        (!pointerDownState.hit.hasHitCommonBoundingBoxOfSelectedElements &&
          !pointerDownState.resize.handleType &&
          !hitSelectedElement);
      if (shouldStartLassoSelection) {
        if (!this.lassoTrail.hasCurrentTrail) {
          this.lassoTrail.startPath(
            pointerDownState.origin.x,
            pointerDownState.origin.y,
            event.shiftKey,
          );
        }
        // on a desktop the lasso's press does not drag what it selects
        pointerDownState.drag.blockDragging = this.editorInterface.formFactor === "desktop";
      }
      // on a phone or tablet, a hit is selected at once
      if (
        this.editorInterface.formFactor !== "desktop" &&
        pointerDownState.hit.element &&
        !hitSelectedElement
      ) {
        this.selection.add(pointerDownState.hit.element);
        pointerDownState.hit.wasAddedToSelection = true;
      }
    } else if (toolType === "laser") {
      this.laserTrails.startPath(pointerDownState.lastCoords.x, pointerDownState.lastCoords.y);
    } else if (toolType === "text") {
      this.textTool.handlePointerDown(event, pointerDownState);
    } else if (toolType === "arrow" || toolType === "line") {
      this.handleLinearElementOnPointerDown(event, toolType, pointerDownState);
    } else if (toolType === "freedraw") {
      this.handleFreeDrawElementOnPointerDown(event, pointerDownState);
    } else if (
      toolType === "rectangle" ||
      toolType === "diamond" ||
      toolType === "ellipse" ||
      toolType === "selection"
    ) {
      this.createGenericElementOnPointerDown(toolType, pointerDownState);
    }

    if (toolType === "eraser") {
      this.eraserTrail.startPath(pointerDownState.lastCoords.x, pointerDownState.lastCoords.y);
    }

    const onPointerMove = (moveEvent: PointerEvent) =>
      this.onPointerMoveFromPointerDownHandler(pointerDownState, moveEvent);
    const onPointerUp = (upEvent: PointerEvent | null) =>
      this.onPointerUpFromPointerDownHandler(pointerDownState, upEvent ?? event);
    const onKeyChange = (keyEvent: KeyboardEvent) => {
      if (this.selectionTool.maybeHandleResize(pointerDownState, keyEvent)) {
        return;
      }
      this.maybeDragNewGenericElement(pointerDownState, keyEvent);
    };

    const offMove = this.addWindowListener("pointermove", onPointerMove);
    const offUp = this.addWindowListener("pointerup", (upEvent) => onPointerUp(upEvent));
    const offKeyDown = this.addWindowListener("keydown", onKeyChange);
    const offKeyUp = this.addWindowListener("keyup", onKeyChange);
    pointerDownState.eventListeners.onMove = onPointerMove;
    pointerDownState.eventListeners.onUp = onPointerUp;
    pointerDownState.eventListeners.onKeyDown = onKeyChange;
    pointerDownState.eventListeners.onKeyUp = onKeyChange;
    this.pendingPointerUp = (upEvent) => {
      offMove();
      offUp();
      offKeyDown();
      offKeyUp();
      this.pendingPointerUp = null;
      onPointerUp(upEvent);
    };
  }

  /** Ends a pointer interaction whose pointer up never came. */
  private maybeCleanupAfterMissingPointerUp(event: PointerEvent | null): void {
    this.panTeardown?.();
    this.pendingPointerUp?.(event);
  }

  private handleCanvasPointerCancel(event: PointerEvent): void {
    this.removePointer(event);
    this.maybeCleanupAfterMissingPointerUp(event);
  }

  private handleCanvasPointerUp(event: PointerEvent): void {
    this.removePointer(event);
    this.lastPointerUpIsDoubleClick =
      this.lastPointerUpEvent !== null &&
      event.timeStamp - this.lastPointerUpEvent.timeStamp <= TAP_TWICE_TIMEOUT;
    this.lastPointerUpEvent = event;
    if (!event.ctrlKey) {
      const preferenceEnabled = this.state.bindingPreference === "enabled";
      if (this.state.isBindingEnabled !== preferenceEnabled) {
        this.setState({ isBindingEnabled: preferenceEnabled });
      }
    }
    const scenePointer = viewportCoordsToSceneCoords(event, this.state);
    this.lastPointerMoveCoords = { x: scenePointer.x, y: scenePointer.y };
    // the window listener ends the interaction; a pointer up the window does
    // not see (its listener is added on pointer down, after this one)
    if (this.pendingPointerUp) {
      this.pendingPointerUp(event);
    }
  }

  private handleCanvasClick(event: MouseEvent): void {
    if (event.button !== POINTER_BUTTON.MAIN) {
      this.lastCompletedCanvasClicks = [];
      return;
    }
    this.lastCompletedCanvasClicks = [
      ...this.lastCompletedCanvasClicks.slice(-1),
      { x: event.clientX, y: event.clientY },
    ];
  }

  private initialPointerDownState(event: PointerEvent): PointerDownState {
    const origin = viewportCoordsToSceneCoords(event, this.state);
    const selectedElements = this.scene.getSelectedElements(this.state);
    const [minX, minY, maxX, maxY] = getCommonBounds(selectedElements);
    const isElbowArrowOnly = selectedElements.findIndex(isElbowArrow) === 0;

    return {
      origin,
      withCmdOrCtrl: event[KEYS.CTRL_OR_CMD],
      originInGrid: tupleToCoors(
        getGridPoint(
          origin.x,
          origin.y,
          event[KEYS.CTRL_OR_CMD] || isElbowArrowOnly ? null : this.getEffectiveGridSize(),
        ),
      ),
      scrollbars: isOverScrollBars(
        this.scrollBars ?? { horizontal: null, vertical: null },
        event.clientX - this.state.offsetLeft,
        event.clientY - this.state.offsetTop,
      ),
      lastCoords: { ...origin },
      originalElements: this.scene
        .getNonDeletedElements()
        .reduce((acc: PointerDownState["originalElements"], element) => {
          acc.set(element.id, deepCopyElement(element));
          return acc;
        }, new Map()),
      resize: {
        handleType: false,
        isResizing: false,
        offset: { x: 0, y: 0 },
        arrowDirection: "origin",
        center: { x: (maxX + minX) / 2, y: (maxY + minY) / 2 },
      },
      hit: {
        element: null,
        allHitElements: [],
        wasAddedToSelection: false,
        cycleTarget: null,
        hasBeenDuplicated: false,
        advancedListMarkers: [],
        editedTextId: this.handedOverTextId,
        arrowLabel: false,
        hasHitCommonBoundingBoxOfSelectedElements:
          this.selection.isHittingCommonBoundingBoxOfSelectedElements(origin, selectedElements),
      },
      drag: {
        hasOccurred: false,
        offset: null,
        origin: { ...origin },
        lastOffset: { x: 0, y: 0 },
        blockDragging: false,
      },
      eventListeners: { onMove: null, onUp: null, onKeyUp: null, onKeyDown: null },
      boxSelection: { hasOccurred: false },
    };
  }

  /** Dragging a scrollbar, when the pointer went down on one. */
  private handleDraggingScrollBar(
    event: PointerEvent,
    pointerDownState: PointerDownState,
  ): boolean {
    if (!(pointerDownState.scrollbars.isOverEither && !this.state.multiElement)) {
      return false;
    }
    this.isDraggingScrollBar = true;
    pointerDownState.lastCoords.x = event.clientX;
    pointerDownState.lastCoords.y = event.clientY;
    const offMove = this.addWindowListener("pointermove", (move) => {
      this.handlePointerMoveOverScrollbars(move, pointerDownState);
    });
    const offUp = this.addWindowListener("pointerup", () => {
      this.isDraggingScrollBar = false;
      this.setState({ cursorButton: "up" });
      offMove();
      offUp();
    });
    return true;
  }

  private handlePointerMoveOverScrollbars(
    event: PointerEvent,
    pointerDownState: PointerDownState,
  ): boolean {
    if (pointerDownState.scrollbars.isOverHorizontal) {
      const dx = event.clientX - pointerDownState.lastCoords.x;
      this.translateViewport({
        scrollX:
          this.state.scrollX -
          (dx * (this.scrollBars?.horizontal?.deltaMultiplier ?? 1)) / this.state.zoom.value,
      });
      pointerDownState.lastCoords.x = event.clientX;
      return true;
    }
    if (pointerDownState.scrollbars.isOverVertical) {
      const dy = event.clientY - pointerDownState.lastCoords.y;
      this.translateViewport({
        scrollY:
          this.state.scrollY -
          (dy * (this.scrollBars?.vertical?.deltaMultiplier ?? 1)) / this.state.zoom.value,
      });
      pointerDownState.lastCoords.y = event.clientY;
      return true;
    }
    return false;
  }

  private clearSelectionIfNotUsingSelection(): void {
    if (!isSelectionLikeTool(this.state.activeTool.type)) {
      this.selection.clear();
    }
  }

  private handleFreeDrawElementOnPointerDown(
    event: PointerEvent,
    pointerDownState: PointerDownState,
  ): void {
    const [gridX, gridY] = getGridPoint(pointerDownState.origin.x, pointerDownState.origin.y, null);
    const topLayerFrame = this.getTopLayerFrameAtSceneCoords({ x: gridX, y: gridY });
    const simulatePressure = event.pressure === 0.5;

    const element = newFreeDrawElement({
      type: "freedraw",
      x: gridX,
      y: gridY,
      strokeColor: this.state.currentItemStrokeColor,
      backgroundColor: this.state.currentItemBackgroundColor,
      fillStyle: this.state.currentItemFillStyle,
      strokeWidth: this.getCurrentItemStrokeWidth("freedraw"),
      strokeStyle: this.state.currentItemStrokeStyle,
      roughness: this.state.currentItemRoughness,
      opacity: this.state.currentItemOpacity,
      roundness: null,
      simulatePressure,
      strokeOptions: {
        variability: this.state.currentItemStrokeVariability,
        streamline:
          event.pointerType !== "mouse"
            ? DEFAULT_STROKE_STREAMLINE_PRECISE
            : DEFAULT_STROKE_STREAMLINE,
      },
      locked: false,
      frameId: topLayerFrame ? topLayerFrame.id : null,
      points: [pointFrom<LocalPoint>(0, 0)],
      // pressures matter only to a stroke with real pressure
      pressures: simulatePressure ? [] : [event.pressure],
    });

    this.insertNewElement(element);

    this.setState((prevState) => {
      const nextSelectedElementIds = { ...prevState.selectedElementIds };
      delete nextSelectedElementIds[element.id];
      return {
        selectedElementIds: makeNextSelectedElementIds(nextSelectedElementIds, prevState),
      };
    });
    this.setState({ newElement: element, suggestedBinding: null });
  }

  private handleLinearElementOnPointerDown(
    event: PointerEvent,
    elementType: ExcalidrawLinearElement["type"],
    pointerDownState: PointerDownState,
  ): void {
    if (event.ctrlKey) {
      this.setState({ isBindingEnabled: this.state.bindingPreference !== "enabled" });
    }

    if (this.state.multiElement) {
      const { multiElement, selectedLinearElement } = this.state;
      invariant(selectedLinearElement, "selectedLinearElement is expected to be set");

      // a line whose ends meet closes
      if (multiElement.type === "line" && isPathALoop(multiElement.points, this.state.zoom.value)) {
        this.setState({
          selectedLinearElement: patchLinearEditor(selectedLinearElement, {
            lastCommittedPoint: multiElement.points[multiElement.points.length - 1] ?? null,
            initialState: { ...selectedLinearElement.initialState, lastClickedPoint: -1 },
          }),
        });
        this.actionManager.executeAction(actionFinalize);
        return;
      }

      // an elbow arrow takes its two ends only
      if (isElbowArrow(multiElement) && multiElement.points.length > 1) {
        this.actionManager.executeAction(actionFinalize, {
          event,
          sceneCoords: { x: pointerDownState.origin.x, y: pointerDownState.origin.y },
        } satisfies FinalizeData);
        return;
      }

      const { x: rx, y: ry } = multiElement;
      const { lastCommittedPoint } = selectedLinearElement;
      const sceneCoords = viewportCoordsToSceneCoords(event, this.state);
      const lastPoint = multiElement.points[multiElement.points.length - 1];
      const noBinding: BindingStrategy = { mode: undefined };
      const { start, end } =
        isBindingElement(multiElement) && isBindingEnabled(this.state) && lastPoint
          ? getBindingStrategyForDraggingBindingElementEndpoints(
              multiElement,
              new Map([[multiElement.points.length - 1, { point: lastPoint, isDragging: false }]]),
              sceneCoords.x,
              sceneCoords.y,
              this.scene.getNonDeletedElementsMap(),
              this.scene.getNonDeletedElements(),
              this.state,
              { newArrow: Boolean(this.state.newElement) },
            )
          : { start: noBinding, end: noBinding };

      const elementsMap = this.scene.getNonDeletedElementsMap();
      // both ends on the same element, the end on its outline: done
      const endOutsideSameElement =
        start.mode !== undefined &&
        start.mode !== null &&
        end.mode !== undefined &&
        end.mode !== null &&
        start.element.id === end.element.id &&
        !isPointInElement(end.focusPoint, end.element, elementsMap);
      const boundOutsideFromElsewhere =
        end.mode === "orbit" && multiElement.startBinding?.elementId !== end.element?.id;
      const lastCommittedPointIsInsideCommitZone =
        lastCommittedPoint &&
        pointDistance(
          pointFrom(pointerDownState.origin.x - rx, pointerDownState.origin.y - ry),
          lastCommittedPoint,
        ) < LINE_CONFIRM_THRESHOLD;

      if (
        boundOutsideFromElsewhere ||
        endOutsideSameElement ||
        (multiElement.points.length > 1 && lastCommittedPointIsInsideCommitZone)
      ) {
        this.actionManager.executeAction(actionFinalize, {
          event,
          sceneCoords: { x: pointerDownState.origin.x, y: pointerDownState.origin.y },
        } satisfies FinalizeData);
        return;
      }

      this.setState((prevState) => ({
        selectedElementIds: makeNextSelectedElementIds(
          { ...prevState.selectedElementIds, [multiElement.id]: true },
          prevState,
        ),
      }));
      this.cursor.set(CURSOR_TYPE.POINTER);
      return;
    }

    const [gridX, gridY] = getGridPoint(
      pointerDownState.origin.x,
      pointerDownState.origin.y,
      event[KEYS.CTRL_OR_CMD] ? null : this.getEffectiveGridSize(),
    );
    const topLayerFrame = this.getTopLayerFrameAtSceneCoords({ x: gridX, y: gridY });

    const { currentItemStartArrowhead, currentItemEndArrowhead } = this.state;
    const [startArrowhead, endArrowhead] =
      elementType === "arrow" ? [currentItemStartArrowhead, currentItemEndArrowhead] : [null, null];

    const base = {
      x: gridX,
      y: gridY,
      strokeColor: this.state.currentItemStrokeColor,
      backgroundColor: this.state.currentItemBackgroundColor,
      fillStyle: this.state.currentItemFillStyle,
      strokeWidth: this.getCurrentItemStrokeWidth(elementType),
      strokeStyle: this.state.currentItemStrokeStyle,
      roughness: this.state.currentItemRoughness,
      opacity: this.state.currentItemOpacity,
      locked: false,
      frameId: topLayerFrame ? topLayerFrame.id : null,
    };
    const element =
      elementType === "arrow"
        ? newArrowElement({
            ...base,
            type: elementType,
            roundness:
              this.state.currentItemArrowType === ARROW_TYPE.round
                ? { type: ROUNDNESS.PROPORTIONAL_RADIUS }
                : null,
            startArrowhead,
            endArrowhead,
            elbowed: this.state.currentItemArrowType === ARROW_TYPE.elbow,
            fixedSegments: this.state.currentItemArrowType === ARROW_TYPE.elbow ? [] : null,
          })
        : newLinearElement({
            ...base,
            type: elementType,
            roundness:
              this.state.currentItemRoundness === "round"
                ? { type: ROUNDNESS.PROPORTIONAL_RADIUS }
                : null,
          });

    const point = pointFrom<GlobalPoint>(pointerDownState.origin.x, pointerDownState.origin.y);
    const elementsMap = this.scene.getNonDeletedElementsMap();
    const boundElement = isBindingEnabled(this.state)
      ? getHoveredElementForBinding(
          point,
          this.scene.getNonDeletedElements(),
          elementsMap,
          this.state.zoom,
        )
      : null;

    this.scene.mutateElement(element, {
      points: [pointFrom<LocalPoint>(0, 0), pointFrom<LocalPoint>(0, 0)],
    });

    this.insertNewElement(element);

    if (isBindingElement(element)) {
      // the first binding, for the binding strategy to start from
      bindOrUnbindBindingElement(
        element,
        new Map([[0, { point: pointFrom<LocalPoint>(0, 0), isDragging: false }]]),
        point[0],
        point[1],
        this.scene,
        this.state,
        {
          newArrow: true,
          altKey: event.altKey,
          initialBinding: true,
          angleLocked: shouldRotateWithDiscreteAngle(event),
        },
      );
    }

    this.setState((prevState) => {
      let linearElementEditor: LinearElementEditor | null = null;
      if (isLinearElement(element)) {
        const editor = new LinearElementEditor(element, this.scene.getNonDeletedElementsMap());
        const endIdx = element.points.length - 1;
        linearElementEditor = patchLinearEditor(editor, {
          selectedPointsIndices: [endIdx],
          initialState: {
            ...editor.initialState,
            arrowStartIsInside: event.altKey,
            lastClickedPoint: endIdx,
            origin: pointFrom<GlobalPoint>(pointerDownState.origin.x, pointerDownState.origin.y),
          },
        });
      }
      return {
        bindMode: "orbit",
        newElement: element,
        suggestedBinding:
          boundElement && isBindingElement(element)
            ? {
                element: boundElement,
                midPoint: getSnapOutlineMidPoint(
                  point,
                  boundElement,
                  elementsMap,
                  this.state.zoom,
                  element,
                ),
              }
            : null,
        selectedElementIds: !this.isToolLocked()
          ? makeNextSelectedElementIds({ [element.id]: true }, prevState)
          : prevState.selectedElementIds,
        selectedLinearElement: linearElementEditor,
      };
    });
  }

  private createGenericElementOnPointerDown(
    elementType: ExcalidrawGenericElement["type"],
    pointerDownState: PointerDownState,
  ): void {
    const [gridX, gridY] = getGridPoint(
      pointerDownState.origin.x,
      pointerDownState.origin.y,
      this.lastPointerDownEvent?.[KEYS.CTRL_OR_CMD] ? null : this.getEffectiveGridSize(),
    );
    const topLayerFrame = this.getTopLayerFrameAtSceneCoords({ x: gridX, y: gridY });

    const element = newElement({
      type: elementType,
      x: gridX,
      y: gridY,
      strokeColor: this.state.currentItemStrokeColor,
      backgroundColor: this.state.currentItemBackgroundColor,
      fillStyle: this.state.currentItemFillStyle,
      strokeWidth: this.getCurrentItemStrokeWidth(elementType),
      strokeStyle: this.state.currentItemStrokeStyle,
      roughness: this.state.currentItemRoughness,
      opacity: this.state.currentItemOpacity,
      roundness: this.getCurrentItemRoundness(elementType),
      locked: false,
      frameId: topLayerFrame ? topLayerFrame.id : null,
    });

    if (element.type === "selection") {
      this.setState({ selectionElement: element });
    } else {
      this.insertNewElement(element);
      this.setState({ multiElement: null, newElement: element });
    }
  }

  /** Sizes the element being drawn out, or the selection box, to the pointer. */
  public maybeDragNewGenericElement(
    pointerDownState: PointerDownState,
    event: MouseEvent | KeyboardEvent,
    informMutation = true,
  ): void {
    const { selectionElement } = this.state;
    const pointerCoords = pointerDownState.lastCoords;
    if (selectionElement && pointerDownState.boxSelection.hasOccurred) {
      dragNewElement({
        newElement: selectionElement,
        elementType: this.state.activeTool.type,
        originX: pointerDownState.origin.x,
        originY: pointerDownState.origin.y,
        x: pointerCoords.x,
        y: pointerCoords.y,
        width: Math.abs(pointerDownState.origin.x - pointerCoords.x),
        height: Math.abs(pointerDownState.origin.y - pointerCoords.y),
        shouldMaintainAspectRatio: shouldMaintainAspectRatio(event),
        shouldResizeFromCenter: false,
        scene: this.scene,
        zoom: this.state.zoom.value,
        renderEnvironment: this.renderEnvironment,
        informMutation: false,
      });
      return;
    }

    const newElementBeingDrawn = this.state.newElement;
    if (!newElementBeingDrawn) {
      return;
    }

    if (this.arrowText.maybeDragNewText(newElementBeingDrawn, pointerCoords)) {
      return;
    }

    let [gridX, gridY] = getGridPoint(
      pointerCoords.x,
      pointerCoords.y,
      event[KEYS.CTRL_OR_CMD] ? null : this.getEffectiveGridSize(),
    );

    this.maybeCacheReferenceSnapPoints(event, [newElementBeingDrawn]);

    const { snapOffset, snapLines } = snapNewElement(
      newElementBeingDrawn,
      this,
      event,
      {
        x: pointerDownState.originInGrid.x + (this.state.originSnapOffset?.x ?? 0),
        y: pointerDownState.originInGrid.y + (this.state.originSnapOffset?.y ?? 0),
      },
      {
        x: gridX - pointerDownState.originInGrid.x,
        y: gridY - pointerDownState.originInGrid.y,
      },
      this.scene.getNonDeletedElementsMap(),
    );
    gridX += snapOffset.x;
    gridY += snapOffset.y;
    this.setState({ snapLines });

    if (!isBindingElement(newElementBeingDrawn)) {
      dragNewElement({
        newElement: newElementBeingDrawn,
        elementType: this.state.activeTool.type,
        originX: pointerDownState.originInGrid.x,
        originY: pointerDownState.originInGrid.y,
        x: gridX,
        y: gridY,
        width: Math.abs(pointerDownState.originInGrid.x - gridX),
        height: Math.abs(pointerDownState.originInGrid.y - gridY),
        shouldMaintainAspectRatio: shouldMaintainAspectRatio(event),
        shouldResizeFromCenter: shouldResizeFromCenter(event),
        zoom: this.state.zoom.value,
        scene: this.scene,
        renderEnvironment: this.renderEnvironment,
        widthAspectRatio: null,
        originOffset: this.state.originSnapOffset,
        informMutation,
      });
    }

    this.setState({ newElement: newElementBeingDrawn });
  }

  private onPointerMoveFromPointerDownHandler(
    pointerDownState: PointerDownState,
    event: PointerEvent,
  ): void {
    const pointerCoords = viewportCoordsToSceneCoords(event, this.state);

    if (this.state.activeLockedId) {
      this.setState({ activeLockedId: null });
    }

    const linear = this.state.selectedLinearElement;
    if (linear?.elbowed && linear.initialState.segmentMidpoint.index) {
      const [gridX, gridY] = getGridPoint(
        pointerCoords.x,
        pointerCoords.y,
        event[KEYS.CTRL_OR_CMD] ? null : this.getEffectiveGridSize(),
      );
      let index = linear.initialState.segmentMidpoint.index;
      if (index < 0) {
        const nextCoords = LinearElementEditor.getSegmentMidpointHitCoords(
          patchLinearEditor(linear, { segmentMidPointHoveredCoords: null }),
          { x: gridX, y: gridY },
          this.state,
          this.scene.getNonDeletedElementsMap(),
        );
        index = nextCoords
          ? LinearElementEditor.getSegmentMidPointIndex(
              linear,
              this.state,
              nextCoords,
              this.scene.getNonDeletedElementsMap(),
            )
          : -1;
      }
      const ret = LinearElementEditor.moveFixedSegment(linear, index, gridX, gridY, this.scene);
      this.setState({
        selectedLinearElement: patchLinearEditor(linear, {
          isDragging: true,
          segmentMidPointHoveredCoords: ret.segmentMidPointHoveredCoords,
          initialState: ret.initialState,
        }),
      });
      return;
    }

    // set here rather than on pointer down, once the selection has settled
    if (pointerDownState.drag.offset === null) {
      pointerDownState.drag.offset = tupleToCoors(
        getDragOffsetXY(
          this.scene.getSelectedElements(this.state),
          pointerDownState.origin.x,
          pointerDownState.origin.y,
        ),
      );
    }

    if (this.handlePointerMoveOverScrollbars(event, pointerDownState)) {
      return;
    }

    if (this.textTool.handlePointerMove(event, pointerDownState)) {
      return;
    }

    if (isEraserActive(this.state)) {
      this.handleEraser(event, pointerCoords);
      return;
    }

    if (this.state.activeTool.type === "laser") {
      this.laserTrails.addPointToPath(pointerCoords.x, pointerCoords.y);
    }

    const [gridX, gridY] = getGridPoint(
      pointerCoords.x,
      pointerCoords.y,
      event[KEYS.CTRL_OR_CMD] ? null : this.getEffectiveGridSize(),
    );

    if (pointerDownState.resize.isResizing) {
      pointerDownState.lastCoords.x = pointerCoords.x;
      pointerDownState.lastCoords.y = pointerCoords.y;
      if (this.selectionTool.maybeHandleResize(pointerDownState, event)) {
        return;
      }
    }
    const elementsMap = this.scene.getNonDeletedElementsMap();

    if (this.state.selectedLinearElement) {
      const linearElementEditor = this.state.selectedLinearElement;

      if (linearElementEditor.draggedFocusPointBinding) {
        handleFocusPointDrag(
          linearElementEditor,
          elementsMap,
          pointerCoords,
          this.scene,
          this.state,
          this.getEffectiveGridSize(),
          event.altKey,
        );
        this.setState({
          selectedLinearElement: patchLinearEditor(linearElementEditor, {
            isDragging: false,
            selectedPointsIndices: [],
            initialState: { ...linearElementEditor.initialState, lastClickedPoint: -1 },
          }),
        });
        return;
      }

      if (this.maybeDragArrowLabel(linearElementEditor, pointerDownState, pointerCoords)) {
        return;
      }

      if (
        LinearElementEditor.shouldAddMidpoint(
          linearElementEditor,
          pointerCoords,
          this.state,
          elementsMap,
        )
      ) {
        const ret = LinearElementEditor.addMidpoint(
          linearElementEditor,
          pointerCoords,
          this.elementApp,
          !event[KEYS.CTRL_OR_CMD],
          this.scene,
        );
        if (!ret) {
          return;
        }
        if (this.state.selectedLinearElement) {
          this.setState({
            selectedLinearElement: patchLinearEditor(this.state.selectedLinearElement, {
              initialState: ret.pointerDownState,
              selectedPointsIndices: ret.selectedPointsIndices,
              segmentMidPointHoveredCoords: null,
              isDragging: true,
            }),
          });
        }
        return;
      } else if (
        linearElementEditor.initialState.segmentMidpoint.value !== null &&
        !linearElementEditor.initialState.segmentMidpoint.added
      ) {
        return;
      } else if (linearElementEditor.initialState.lastClickedPoint > -1) {
        const element = LinearElementEditor.getElement(linearElementEditor.elementId, elementsMap);
        if (element?.isDeleted) {
          return;
        }

        const newState = LinearElementEditor.handlePointDragging(
          event,
          this.elementApp,
          pointerCoords.x,
          pointerCoords.y,
          linearElementEditor,
        );

        if (newState) {
          pointerDownState.lastCoords.x = pointerCoords.x;
          pointerDownState.lastCoords.y = pointerCoords.y;
          pointerDownState.drag.hasOccurred = true;
          this.setState(newState);
          return;
        }
      }
    }

    if (
      this.selectionTool.handleSelectionDragOnPointerMove(event, pointerDownState, pointerCoords)
    ) {
      return;
    }

    if (this.state.selectionElement) {
      pointerDownState.lastCoords.x = pointerCoords.x;
      pointerDownState.lastCoords.y = pointerCoords.y;
      if (event.altKey) {
        // alt turns the box into a lasso
        this.setActiveTool(
          { type: "lasso", fromSelection: true },
          { keepSelection: event.shiftKey },
        );
        this.lassoTrail.startPath(
          pointerDownState.origin.x,
          pointerDownState.origin.y,
          event.shiftKey,
        );
        this.setState({ selectionElement: null });
        return;
      }
      this.maybeDragNewGenericElement(pointerDownState, event);
    } else if (this.state.activeTool.type === "lasso") {
      if (!event.altKey && this.state.activeTool.fromSelection) {
        // letting go of alt turns it back into a box
        this.setActiveTool({ type: "selection" });
        this.createGenericElementOnPointerDown("selection", pointerDownState);
        pointerDownState.lastCoords.x = pointerCoords.x;
        pointerDownState.lastCoords.y = pointerCoords.y;
        this.maybeDragNewGenericElement(pointerDownState, event);
        this.lassoTrail.endPath();
      } else {
        this.lassoTrail.addPointToLasso(pointerCoords.x, pointerCoords.y, event.shiftKey);
      }
    } else {
      // read on every move: the state changes under the drag
      const newElementBeingDrawn = this.state.newElement;
      if (!newElementBeingDrawn) {
        return;
      }

      if (newElementBeingDrawn.type === "freedraw") {
        const { points } = newElementBeingDrawn;
        const dx = pointerCoords.x - newElementBeingDrawn.x;
        const dy = pointerCoords.y - newElementBeingDrawn.y;
        const lastPoint = points[points.length - 1];
        const discardPoint = lastPoint !== undefined && lastPoint[0] === dx && lastPoint[1] === dy;

        if (!discardPoint) {
          const pressures = newElementBeingDrawn.simulatePressure
            ? newElementBeingDrawn.pressures
            : [...newElementBeingDrawn.pressures, event.pressure];
          this.scene.mutateElement(
            newElementBeingDrawn,
            { points: [...points, pointFrom<LocalPoint>(dx, dy)], pressures },
            { informMutation: false, isDragging: false },
          );
          this.setState({ newElement: newElementBeingDrawn });
        }
      } else if (isLinearElement(newElementBeingDrawn) && !newElementBeingDrawn.isDeleted) {
        pointerDownState.drag.hasOccurred = true;
        const { points } = newElementBeingDrawn;
        invariant(points.length > 1, "Do not create linear elements with less than 2 points");

        let linearElementEditor = this.state.selectedLinearElement;
        if (!linearElementEditor || linearElementEditor.elementId !== newElementBeingDrawn.id) {
          linearElementEditor = new LinearElementEditor(
            newElementBeingDrawn,
            this.scene.getNonDeletedElementsMap(),
          );
        }
        if (
          linearElementEditor.initialState.lastClickedPoint < 0 ||
          linearElementEditor.initialState.lastClickedPoint >= points.length
        ) {
          linearElementEditor = patchLinearEditor(linearElementEditor, {
            selectedPointsIndices: [points.length - 1],
            initialState: {
              ...linearElementEditor.initialState,
              prevSelectedPointsIndices: null,
              lastClickedPoint: points.length - 1,
            },
            hoverPointIndex: points.length - 1,
          });
        }
        this.setState({
          newElement: newElementBeingDrawn,
          ...LinearElementEditor.handlePointDragging(
            event,
            this.elementApp,
            gridX,
            gridY,
            linearElementEditor,
          ),
        });
      } else {
        pointerDownState.lastCoords.x = pointerCoords.x;
        pointerDownState.lastCoords.y = pointerCoords.y;
        this.maybeDragNewGenericElement(pointerDownState, event, false);
      }
    }

    this.selectionTool.handleBoxSelectionOnPointerMove(event, pointerDownState);
  }

  /** Dragging a label along its arrow, when the pointer went down on it. */
  private maybeDragArrowLabel(
    linearElementEditor: LinearElementEditor,
    pointerDownState: PointerDownState,
    pointerCoords: { x: number; y: number },
  ): boolean {
    if (!pointerDownState.hit.arrowLabel) {
      return false;
    }
    this.cursor.set(CURSOR_TYPE.GRABBING);
    if (
      linearElementEditor.isDragging ||
      pointDistance(
        pointFrom(pointerDownState.origin.x, pointerDownState.origin.y),
        pointFrom(pointerCoords.x, pointerCoords.y),
      ) >=
        DRAGGING_THRESHOLD / this.state.zoom.value
    ) {
      const updatedEditor = LinearElementEditor.handleBoundTextDragging(
        linearElementEditor,
        this.scene,
        pointerCoords.x,
        pointerCoords.y,
      );
      if (updatedEditor) {
        pointerDownState.drag.hasOccurred = true;
        this.setState({ selectedLinearElement: updatedEditor });
      }
    }
    return true;
  }

  private onPointerUpFromPointerDownHandler(
    pointerDownState: PointerDownState,
    childEvent: PointerEvent,
  ): void {
    const elementsMap = this.scene.getNonDeletedElementsMap();

    this.removePointer(childEvent);
    pointerDownState.drag.blockDragging = false;

    this.textTool.handlePointerUp(childEvent, pointerDownState);

    const {
      newElement: newElementAtUp,
      resizingElement,
      multiElement,
      activeTool,
      isResizing,
      isRotating,
    } = this.state;

    this.activeResizeHandle = null;
    this.setState((prevState) => ({
      isResizing: false,
      isRotating: false,
      isCropping: false,
      resizingElement: null,
      selectionElement: null,
      frameToHighlight: null,
      elementsToHighlight: null,
      cursorButton: "up",
      snapLines: updateStable(prevState.snapLines, []),
      originSnapOffset: null,
    }));

    // the tool may have changed mid-drag: the lasso always ends
    this.lassoTrail.endPath();

    SnapCache.setReferenceSnapPoints(null);
    SnapCache.setVisibleGaps(null);

    const hitElements = pointerDownState.hit.allHitElements;
    const sceneCoords = viewportCoordsToSceneCoords(
      { clientX: childEvent.clientX, clientY: childEvent.clientY },
      this.state,
    );

    // a click on a locked element marks it, for unlocking
    if (
      this.state.activeTool.type === "selection" &&
      !pointerDownState.boxSelection.hasOccurred &&
      !pointerDownState.resize.isResizing &&
      !hitElements.some((el) => this.state.selectedElementIds[el.id])
    ) {
      const hitLockedElement = this.getElementAtPosition(sceneCoords.x, sceneCoords.y, {
        includeLockedElements: true,
      });
      if (!this.text.isEditingTextContent()) {
        this.store.scheduleCapture();
      }
      this.setState({
        activeLockedId: hitLockedElement?.locked
          ? hitLockedElement.groupIds.length > 0
            ? (hitLockedElement.groupIds.at(-1) ?? "")
            : hitLockedElement.id
          : null,
      });
    } else {
      this.setState({ activeLockedId: null });
    }

    this.setState({ selectedElementsAreBeingDragged: false, bindMode: "orbit" });

    if (pointerDownState.drag.hasOccurred && pointerDownState.hit.element?.id) {
      const element = elementsMap.get(pointerDownState.hit.element.id);
      if (isBindableElement(element)) {
        // elbow arrows moved indirectly are normalized
        for (const bound of element.boundElements ?? []) {
          if (bound.type !== "arrow") continue;
          const arrow = elementsMap.get(bound.id);
          if (arrow && isElbowArrow(arrow)) {
            this.scene.mutateElement(arrow, {});
          }
        }
      }
    }

    // the end of dragging a line editor's point: may close a loop, and binds
    if (
      this.state.selectedLinearElement?.isEditing &&
      !this.state.newElement &&
      this.state.selectedLinearElement.draggedFocusPointBinding === null
    ) {
      if (
        !pointerDownState.boxSelection.hasOccurred &&
        pointerDownState.hit?.element?.id !== this.state.selectedLinearElement.elementId
      ) {
        this.actionManager.executeAction(actionFinalize);
      } else {
        const editingLinearElement = LinearElementEditor.handlePointerUp(
          childEvent,
          this.state.selectedLinearElement,
          this.state,
          this.scene,
        );
        this.actionManager.executeAction(actionFinalize, {
          event: childEvent,
          sceneCoords,
          hitBoundText: pointerDownState.hit.arrowLabel,
        } satisfies FinalizeData);
        if (editingLinearElement !== this.state.selectedLinearElement) {
          this.setState({ selectedLinearElement: editingLinearElement, suggestedBinding: null });
        }
      }
    } else if (this.state.selectedLinearElement) {
      // elbow arrows lose their close parallel segments
      if (this.state.selectedLinearElement.elbowed) {
        const element = LinearElementEditor.getElement(
          this.state.selectedLinearElement.elementId,
          this.scene.getNonDeletedElementsMap(),
        );
        if (element) {
          this.scene.mutateElement(element as ExcalidrawElbowArrowElement, {});
        }
      }

      if (this.state.selectedLinearElement.draggedFocusPointBinding) {
        handleFocusPointPointerUp(this.state.selectedLinearElement, this.scene);
        this.setState({
          selectedLinearElement: patchLinearEditor(this.state.selectedLinearElement, {
            draggedFocusPointBinding: null,
            initialState: {
              ...this.state.selectedLinearElement.initialState,
              arrowOtherEndpointInitialBinding: null,
            },
          }),
        });
      } else if (pointerDownState.hit?.element?.id !== this.state.selectedLinearElement.elementId) {
        // no line handles with more than one element selected
        if (this.scene.getSelectedElements(this.state).length > 1) {
          this.setState({ selectedLinearElement: null });
        }
      } else if (this.state.selectedLinearElement.isDragging) {
        this.setState({
          selectedLinearElement: patchLinearEditor(this.state.selectedLinearElement, {
            isDragging: false,
          }),
        });
        this.actionManager.executeAction(actionFinalize, {
          event: childEvent,
          sceneCoords,
          hitBoundText: pointerDownState.hit.arrowLabel,
        } satisfies FinalizeData);
      }

      const current = this.state;
      if (
        current.newElement &&
        current.multiElement &&
        isLinearElement(current.newElement) &&
        current.selectedLinearElement
      ) {
        this.setState({
          selectedLinearElement: patchLinearEditor(current.selectedLinearElement, {
            lastCommittedPoint:
              current.multiElement.points[current.multiElement.points.length - 1] ?? null,
          }),
        });
      }
    }

    if (newElementAtUp?.type === "freedraw") {
      const pointerCoords = viewportCoordsToSceneCoords(childEvent, this.state);
      const { points } = newElementAtUp;
      let dx = pointerCoords.x - newElementAtUp.x;
      let dy = pointerCoords.y - newElementAtUp.y;
      // a dot is not invisibly small
      const first = points[0];
      if (first && dx === first[0] && dy === first[1]) {
        dy += 0.0001;
        dx += 0.0001;
      }
      const pressures = newElementAtUp.simulatePressure
        ? []
        : [...newElementAtUp.pressures, childEvent.pressure];
      this.scene.mutateElement(newElementAtUp, {
        points: [...points, pointFrom<LocalPoint>(dx, dy)],
        pressures,
      });
      this.actionManager.executeAction(actionFinalize);
      return;
    }

    if (isLinearElement(newElementAtUp)) {
      const pointerCoords = viewportCoordsToSceneCoords(childEvent, this.state);
      const dragDistance =
        pointDistance(
          pointFrom(pointerCoords.x, pointerCoords.y),
          pointFrom(pointerDownState.origin.x, pointerDownState.origin.y),
        ) * this.state.zoom.value;

      if (
        (!pointerDownState.drag.hasOccurred || dragDistance < MINIMUM_ARROW_SIZE) &&
        !multiElement
      ) {
        if (this.editorInterface.isTouchScreen) {
          const FIXED_DELTA_X = Math.min((this.state.width * 0.7) / this.state.zoom.value, 100);
          this.scene.mutateElement(
            newElementAtUp,
            {
              x: newElementAtUp.x - FIXED_DELTA_X / 2,
              points: [pointFrom<LocalPoint>(0, 0), pointFrom<LocalPoint>(FIXED_DELTA_X, 0)],
            },
            { informMutation: false, isDragging: false },
          );
          this.actionManager.executeAction(actionFinalize);
        } else {
          // moving out of the commit zone adds the next point
          this.setState({ multiElement: newElementAtUp, newElement: newElementAtUp });
        }
      } else if (pointerDownState.drag.hasOccurred && !multiElement) {
        this.store.scheduleCapture();
        this.actionManager.executeAction(actionFinalize, {
          event: childEvent,
          sceneCoords,
        } satisfies FinalizeData);
        this.setState({ suggestedBinding: null });
        if (!this.isToolLocked()) {
          this.setState(
            (prevState) => ({
              newElement: null,
              activeTool: updateActiveTool(prevState, {
                type: prevState.preferredSelectionTool.type,
              }),
              selectedElementIds: makeNextSelectedElementIds(
                { ...prevState.selectedElementIds, [newElementAtUp.id]: true },
                prevState,
              ),
              selectedLinearElement: new LinearElementEditor(
                newElementAtUp,
                this.scene.getNonDeletedElementsMap(),
              ),
            }),
            () => this.cursor.reset(),
          );
        } else {
          this.setState({ newElement: null });
        }
        this.scene.triggerUpdate();
      }
      return;
    }

    if (isTextElement(newElementAtUp)) {
      const minWidth = getMinTextElementWidth(
        getFontString({ fontSize: newElementAtUp.fontSize, fontFamily: newElementAtUp.fontFamily }),
        newElementAtUp.lineHeight,
        this.renderEnvironment,
      );
      // too narrow to have been sized: it grows with its content
      if (newElementAtUp.width < minWidth) {
        this.scene.mutateElement(newElementAtUp, { autoResize: true });
      }
      this.cursor.reset();
      this.text.handleTextWysiwyg(newElementAtUp, { isExistingElement: true });
    }

    if (
      activeTool.type !== "selection" &&
      newElementAtUp &&
      isInvisiblySmallElement(newElementAtUp)
    ) {
      // a click without a drag leaves nothing, and nothing for undo
      this.updateScene({
        elements: this.scene
          .getElementsIncludingDeleted()
          .filter((el) => el.id !== newElementAtUp.id),
        appState: { newElement: null },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      return;
    }

    if (newElementAtUp) {
      this.scene.mutateElement(newElementAtUp, getNormalizedDimensions(newElementAtUp), {
        informMutation: false,
        isDragging: false,
      });
      this.scene.triggerUpdate();
    }

    if (pointerDownState.drag.hasOccurred) {
      const linear = this.state.selectedLinearElement;
      if (linear?.isDragging) {
        // a line dragged out of its frame leaves it
        const linearElement = this.scene.getElement(linear.elementId);
        if (linearElement?.frameId) {
          const frame = getContainingFrame(linearElement, elementsMap);
          if (
            frame &&
            !elementOverlapsWithFrame(linearElement, frame, this.scene.getNonDeletedElementsMap())
          ) {
            this.scene.mutateElement(linearElement, { groupIds: [] });
            removeElementsFromFrame([linearElement], this.scene.getNonDeletedElementsMap());
            this.scene.triggerUpdate();
          }
        }
      } else {
        this.selectionTool.handleSelectionDragOnPointerUp(childEvent);
      }
    }

    if (resizingElement) {
      this.store.scheduleCapture();
    }

    if (resizingElement && isInvisiblySmallElement(resizingElement)) {
      this.updateScene({
        elements: this.scene
          .getElementsIncludingDeleted()
          .filter((el) => el.id !== resizingElement.id),
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    }

    // frame membership after resizing frames or their children
    if (pointerDownState.resize.isResizing) {
      let nextElements = updateFrameMembershipOfSelectedElements(
        this.scene.getElementsIncludingDeleted(),
        this.state,
        this.elementApp,
      );
      for (const frame of this.scene.getSelectedElements(this.state).filter(isFrameLikeElement)) {
        nextElements = replaceAllElementsInFrame(
          nextElements,
          getElementsInResizingFrame(
            this.scene.getElementsIncludingDeleted(),
            frame,
            this.state,
            elementsMap,
          ),
          frame,
        );
      }
      this.scene.replaceAllElements(nextElements);
    }

    const hitElement = pointerDownState.hit.element;
    if (
      this.state.selectedLinearElement?.elementId !== hitElement?.id &&
      isLinearElement(hitElement)
    ) {
      if (this.scene.getSelectedElements(this.state).length === 1) {
        this.setState({
          selectedLinearElement: new LinearElementEditor(
            hitElement,
            this.scene.getNonDeletedElementsMap(),
          ),
        });
      }
    }

    const pointerStart = this.lastPointerDownEvent;
    const pointerEnd = this.lastPointerUpEvent ?? this.lastPointerMoveEvent;
    if (isEraserActive(this.state) && pointerStart && pointerEnd) {
      this.eraserTrail.endPath();
      const draggedDistance = pointDistance(
        pointFrom(pointerStart.clientX, pointerStart.clientY),
        pointFrom(pointerEnd.clientX, pointerEnd.clientY),
      );
      // a click erases what it is on
      if (draggedDistance === 0) {
        const scenePointer = viewportCoordsToSceneCoords(
          { clientX: pointerEnd.clientX, clientY: pointerEnd.clientY },
          this.state,
        );
        for (const hit of this.getElementsAtPosition(scenePointer.x, scenePointer.y)) {
          this.elementsPendingErasure.add(hit.id);
        }
      }
      this.eraseElements();
      return;
    } else if (this.elementsPendingErasure.size) {
      this.restoreReadyToEraseElements();
    }

    if (this.selectionTool.handleSelectionOnPointerUp(childEvent, pointerDownState, elementsMap)) {
      return;
    }

    const selectedTextEditingContainer = this.text.getSelectedTextEditingContainerAtPosition(
      hitElement,
      sceneCoords,
    );
    if (
      activeTool.type === this.state.preferredSelectionTool.type &&
      !this.state.editingTextElement &&
      !pointerDownState.drag.hasOccurred &&
      !pointerDownState.hit.wasAddedToSelection &&
      !childEvent.shiftKey &&
      !childEvent[KEYS.CTRL_OR_CMD] &&
      !childEvent.altKey &&
      childEvent.pointerType !== "touch" &&
      hitElement &&
      ((isTextElement(hitElement) &&
        this.state.selectedElementIds[hitElement.id] &&
        this.scene.getSelectedElements(this.state).length === 1) ||
        selectedTextEditingContainer)
    ) {
      // a click on the selected text, or on a selected shape's label, edits it
      // with the caret where it was clicked
      this.text.startTextEditing({
        sceneX: sceneCoords.x,
        sceneY: sceneCoords.y,
        container: selectedTextEditingContainer,
        initialCaretSceneCoords: this.lastPointerUpIsDoubleClick ? undefined : sceneCoords,
      });
      return;
    }

    if (!this.isToolLocked() && activeTool.type !== "freedraw" && newElementAtUp) {
      this.setState((prevState) => ({
        selectedElementIds: makeNextSelectedElementIds(
          { ...prevState.selectedElementIds, [newElementAtUp.id]: true },
          prevState,
        ),
      }));
    }

    if (
      !this.text.isEditingTextContent() &&
      (activeTool.type !== "selection" ||
        this.scene.getSelectedElements(this.state).length > 0 ||
        !isShallowEqual(this.state.previousSelectedElementIds, this.state.selectedElementIds))
    ) {
      this.store.scheduleCapture();
    }

    if (
      (pointerDownState.drag.hasOccurred && !this.state.selectedLinearElement) ||
      isResizing ||
      isRotating
    ) {
      // only arrows bind, by their ends
      bindOrUnbindBindingElements(
        this.scene.getSelectedElements(this.state).filter(isArrowElement),
        this.scene,
        this.state,
      );
    }

    if (activeTool.type === "laser") {
      this.laserTrails.endPath();
      return;
    }

    if (
      // only a genuine pointer up is a click of the tool, which reverts it
      childEvent.type === "pointerup" &&
      !this.isToolLocked() &&
      activeTool.type !== "freedraw" &&
      // a lasso reverts only when it came from the selection tool's alt
      (activeTool.type !== "lasso" || activeTool.fromSelection)
    ) {
      this.setState(
        (prevState) => ({
          newElement: null,
          suggestedBinding: null,
          activeTool: updateActiveTool(prevState, { type: prevState.preferredSelectionTool.type }),
        }),
        () => this.cursor.reset(),
      );
    } else {
      this.setState({ newElement: null, suggestedBinding: null });
    }
  }

  /** The hover: the cursor, line handles, binding suggestions, and the line being drawn point by point. */
  private handleCanvasPointerMove(event: PointerEvent): void {
    this.lastPointerMoveEvent = event;
    this.lastPosition = { x: event.clientX, y: event.clientY };
    const scenePointer = viewportCoordsToSceneCoords(event, this.state);
    const { x: scenePointerX, y: scenePointerY } = scenePointer;
    this.lastPointerMoveCoords = { x: scenePointerX, y: scenePointerY };

    this.updateMultiTouchGesture(event);

    if (
      this.spaceHeld ||
      this.panTeardown !== null ||
      this.isDraggingScrollBar ||
      isHandToolActive(this.state)
    ) {
      return;
    }

    const isOverScrollBar = isOverScrollBars(
      this.scrollBars ?? { horizontal: null, vertical: null },
      event.clientX - this.state.offsetLeft,
      event.clientY - this.state.offsetTop,
    ).isOverEither;
    if (
      !this.state.newElement &&
      !this.state.selectionElement &&
      !this.state.selectedElementsAreBeingDragged &&
      !this.state.multiElement
    ) {
      if (isOverScrollBar) {
        this.cursor.set(CURSOR_TYPE.AUTO);
      } else {
        this.cursor.applyForTool();
      }
    }

    if (
      !this.state.newElement &&
      !this.state.multiElement &&
      !this.state.selectionElement &&
      !this.state.selectedElementsAreBeingDragged
    ) {
      this.updateFrameToHighlight(
        !isOverScrollBar && isEligibleFrameChildType(this.state.activeTool.type)
          ? this.getTopLayerFrameAtSceneCoords(scenePointer)
          : null,
      );
    }

    const textToolTarget = this.textTool.updateHover(scenePointer, event, isOverScrollBar);

    if (!this.state.newElement && isActiveToolNonLinearSnappable(this.state.activeTool.type)) {
      // where a shape would start, snapped to the others
      const { originOffset, snapLines } = getSnapLinesAtPointer(
        this.scene.getNonDeletedElements(),
        this,
        { x: scenePointerX, y: scenePointerY },
        event,
        this.scene.getNonDeletedElementsMap(),
      );
      this.setState((prevState) => {
        const nextSnapLines = updateStable(prevState.snapLines, snapLines);
        const nextOriginOffset = prevState.originSnapOffset
          ? updateStable(prevState.originSnapOffset, originOffset)
          : originOffset;
        if (
          prevState.snapLines === nextSnapLines &&
          prevState.originSnapOffset === nextOriginOffset
        ) {
          return null;
        }
        return { snapLines: nextSnapLines, originSnapOffset: nextOriginOffset };
      });
    } else if (
      !this.state.newElement &&
      !this.state.selectedElementsAreBeingDragged &&
      !this.state.selectionElement &&
      this.state.snapLines.length
    ) {
      this.setState({ snapLines: [] });
    }

    if (
      this.state.selectedLinearElement?.isEditing &&
      !this.state.selectedLinearElement.isDragging
    ) {
      const editingLinearElement = this.state.newElement
        ? null
        : LinearElementEditor.handlePointerMoveInEditMode(
            event as unknown as ReactCanvasPointerEvent,
            scenePointerX,
            scenePointerY,
            this.elementApp,
          );
      if (editingLinearElement && editingLinearElement !== this.state.selectedLinearElement) {
        this.setState({ selectedLinearElement: editingLinearElement });
      }
    }

    if (isBindingElementType(this.state.activeTool.type)) {
      // a binding suggestion while hovering with the arrow tool, or between
      // the points of a line drawn by clicks
      if (!this.state.newElement && isBindingEnabled(this.state)) {
        const globalPoint = pointFrom<GlobalPoint>(scenePointerX, scenePointerY);
        const elementsMap = this.scene.getNonDeletedElementsMap();
        const hoveredElement = getHoveredElementForBinding(
          globalPoint,
          this.scene.getNonDeletedElements(),
          elementsMap,
          this.state.zoom,
        );
        if (hoveredElement) {
          this.setState({
            suggestedBinding: {
              element: hoveredElement,
              midPoint: getSnapOutlineMidPoint(
                globalPoint,
                hoveredElement,
                elementsMap,
                this.state.zoom,
                { elbowed: this.state.currentItemArrowType === ARROW_TYPE.elbow },
              ),
            },
          });
        } else if (this.state.suggestedBinding) {
          this.setState({ suggestedBinding: null });
        }
      }
    }

    if (this.state.multiElement && this.state.selectedLinearElement) {
      this.handleMultiElementPointerMove(event, scenePointerX, scenePointerY);
      return;
    }

    if (this.state.activeTool.type === "arrow" && !this.state.newElement) {
      const point = pointFrom<GlobalPoint>(scenePointerX, scenePointerY);
      const elementsMap = this.scene.getNonDeletedElementsMap();
      const hit = getHoveredElementForBinding(
        point,
        this.scene.getNonDeletedElements(),
        elementsMap,
        this.state.zoom,
      );
      if (hit && !isPointInElement(point, hit, elementsMap)) {
        this.setState({
          suggestedBinding: {
            element: hit,
            midPoint: getSnapOutlineMidPoint(point, hit, elementsMap, this.state.zoom, {
              elbowed: this.state.currentItemArrowType === ARROW_TYPE.elbow,
            }),
          },
        });
      }
    }

    if (
      Boolean(event.buttons) ||
      (this.state.activeTool.type !== "selection" &&
        this.state.activeTool.type !== "lasso" &&
        this.state.activeTool.type !== "text" &&
        this.state.activeTool.type !== "eraser")
    ) {
      return;
    }

    const selectedElements = this.scene.getSelectedElements(this.state);

    if (this.text.isHittingTextAutoResizeHandle(selectedElements, scenePointer)) {
      this.cursor.set(CURSOR_TYPE.POINTER);
      return;
    }

    const editedTextResizeHandle = this.text.getEditedTextResizeHandleAt(scenePointer);
    if (editedTextResizeHandle) {
      this.cursor.set(getCursorForResizingElement(editedTextResizeHandle));
      return;
    }

    if (!isOverScrollBar) {
      // a line's points take precedence over the edge it can be resized by
      if (
        selectedElements.length === 1 &&
        !this.state.selectedLinearElement?.isEditing &&
        this.state.selectedLinearElement
      ) {
        this.handleHoverSelectedLinearElement(
          this.state.selectedLinearElement,
          scenePointerX,
          scenePointerY,
        );
      }

      const transformHandle = this.selectionTool.getTransformHandleAt(
        selectedElements,
        scenePointerX,
        scenePointerY,
        event.pointerType as Parameters<SelectionTool["getTransformHandleAt"]>[3],
      );
      if (transformHandle) {
        this.cursor.set(getCursorForResizingElement(transformHandle));
        return;
      }
    }

    const hitElementMightBeLocked = this.getElementAtPosition(scenePointerX, scenePointerY, {
      preferSelected: true,
      includeLockedElements: true,
    });
    const hitElement = hitElementMightBeLocked?.locked ? null : hitElementMightBeLocked;

    if (this.state.activeTool.type === "text") {
      this.cursor.set(this.textTool.cursorFor(textToolTarget));
    } else if (
      !event[KEYS.CTRL_OR_CMD] &&
      this.selection.isHittingCommonBoundingBoxOfSelectedElements(scenePointer, selectedElements)
    ) {
      this.cursor.set(CURSOR_TYPE.MOVE);
    } else if (this.state.viewModeEnabled) {
      this.cursor.set(CURSOR_TYPE.GRAB);
    } else if (isOverScrollBar) {
      this.cursor.set(CURSOR_TYPE.AUTO);
    } else if (!event[KEYS.CTRL_OR_CMD]) {
      if (hitElement && !hitElement.locked) {
        // an elbow arrow moves only when unconnected
        if (!isElbowArrow(hitElement) || !(hitElement.startBinding || hitElement.endBinding)) {
          this.cursor.set(CURSOR_TYPE.MOVE);
        }
      }
    } else {
      this.cursor.set(CURSOR_TYPE.AUTO);
    }

    if (this.state.selectedLinearElement) {
      this.handleHoverSelectedLinearElement(
        this.state.selectedLinearElement,
        scenePointerX,
        scenePointerY,
      );
    }
  }

  /** Between the clicks of a line drawn point by point: the rubber-band point, and the commit zone. */
  private handleMultiElementPointerMove(
    event: PointerEvent,
    scenePointerX: number,
    scenePointerY: number,
  ): void {
    const { multiElement, selectedLinearElement } = this.state;
    if (!multiElement || !selectedLinearElement) return;
    const { x: rx, y: ry, points } = multiElement;
    const lastPoint = points[points.length - 1];
    const { lastCommittedPoint } = selectedLinearElement;

    this.cursor.applyForTool();

    if (lastPoint === lastCommittedPoint) {
      // past the commit zone with no point being placed: start placing one
      if (
        lastPoint &&
        pointDistance(pointFrom(scenePointerX - rx, scenePointerY - ry), lastPoint) >=
          LINE_CONFIRM_THRESHOLD
      ) {
        this.store.scheduleCapture();
        this.setState({
          selectedLinearElement: patchLinearEditor(selectedLinearElement, {
            lastCommittedPoint: lastPoint,
            selectedPointsIndices: [multiElement.points.length],
            initialState: {
              ...selectedLinearElement.initialState,
              lastClickedPoint: multiElement.points.length,
            },
          }),
        });
        this.scene.mutateElement(
          multiElement,
          { points: [...points, pointFrom<LocalPoint>(scenePointerX - rx, scenePointerY - ry)] },
          { informMutation: false, isDragging: false },
        );
      } else {
        this.cursor.set(CURSOR_TYPE.POINTER);
      }
    } else if (
      points.length > 2 &&
      lastCommittedPoint &&
      pointDistance(pointFrom(scenePointerX - rx, scenePointerY - ry), lastCommittedPoint) <
        LINE_CONFIRM_THRESHOLD
    ) {
      // back in the commit zone: the point being placed goes
      this.cursor.set(CURSOR_TYPE.POINTER);
      this.scene.mutateElement(
        multiElement,
        { points: points.slice(0, -1) },
        { informMutation: false, isDragging: false },
      );
      const newLastIdx = multiElement.points.length - 1;
      this.setState({
        selectedLinearElement: patchLinearEditor(selectedLinearElement, {
          selectedPointsIndices: selectedLinearElement.selectedPointsIndices
            ? [
                ...new Set(
                  selectedLinearElement.selectedPointsIndices.map((idx) =>
                    Math.min(idx, newLastIdx),
                  ),
                ),
              ]
            : selectedLinearElement.selectedPointsIndices,
          lastCommittedPoint: multiElement.points[newLastIdx] ?? null,
          initialState: { ...selectedLinearElement.initialState, lastClickedPoint: newLastIdx },
        }),
      });
    } else {
      if (isPathALoop(points, this.state.zoom.value)) {
        this.cursor.set(CURSOR_TYPE.POINTER);
      }
      const newState = LinearElementEditor.handlePointerMove(
        event,
        this.elementApp,
        scenePointerX,
        scenePointerY,
        selectedLinearElement,
      );
      if (newState) {
        this.setState(newState);
      }
    }
  }

  /** The hover over a selected line or arrow: its points, its midpoints, its focus points. */
  private handleHoverSelectedLinearElement(
    linearElementEditor: LinearElementEditor,
    scenePointerX: number,
    scenePointerY: number,
  ): void {
    const elementsMap = this.scene.getNonDeletedElementsMap();
    const element = LinearElementEditor.getElement(linearElementEditor.elementId, elementsMap);
    if (!element || this.state.editingTextElement || !this.state.selectedLinearElement) {
      return;
    }

    const hoverPointIndex = LinearElementEditor.getPointIndexUnderCursor(
      element,
      elementsMap,
      this.state.zoom,
      scenePointerX,
      scenePointerY,
    );
    const isHoveringAPointHandle = LinearElementEditor.isPointHandle(element, hoverPointIndex);
    const segmentMidPointHoveredCoords = isHoveringAPointHandle
      ? null
      : LinearElementEditor.getSegmentMidpointHitCoords(
          linearElementEditor,
          { x: scenePointerX, y: scenePointerY },
          this.state,
          elementsMap,
        );

    if (isHoveringAPointHandle || segmentMidPointHoveredCoords) {
      this.cursor.set(CURSOR_TYPE.POINTER);
    } else if (this.isBoundTextGrabbable(element, scenePointerX, scenePointerY)) {
      this.cursor.set(CURSOR_TYPE.GRAB);
    } else if (
      this.hitElement(scenePointerX, scenePointerY, element) &&
      (!isElbowArrow(element) || !(element.startBinding || element.endBinding))
    ) {
      this.cursor.set(CURSOR_TYPE.MOVE);
    }

    if (this.state.selectedLinearElement.hoverPointIndex !== hoverPointIndex) {
      this.setState((prevState) => ({
        selectedLinearElement:
          prevState.selectedLinearElement &&
          patchLinearEditor(prevState.selectedLinearElement, {
            hoverPointIndex,
          }),
      }));
    }

    if (
      !LinearElementEditor.arePointsEqual(
        this.state.selectedLinearElement?.segmentMidPointHoveredCoords ?? null,
        segmentMidPointHoveredCoords,
      )
    ) {
      this.setState((prevState) => ({
        selectedLinearElement:
          prevState.selectedLinearElement &&
          patchLinearEditor(prevState.selectedLinearElement, {
            segmentMidPointHoveredCoords,
          }),
      }));
    }

    let hoveredFocusPointBinding: "start" | "end" | null = null;
    if (isArrowElement(element) && (element.startBinding || element.endBinding)) {
      hoveredFocusPointBinding = handleFocusPointHover(
        element,
        scenePointerX,
        scenePointerY,
        this.scene,
        this.state,
      );
    }
    if (this.state.selectedLinearElement?.hoveredFocusPointBinding !== hoveredFocusPointBinding) {
      this.setState((prevState) => ({
        selectedLinearElement:
          prevState.selectedLinearElement &&
          patchLinearEditor(prevState.selectedLinearElement, {
            isDragging: false,
            hoveredFocusPointBinding,
          }),
      }));
    }
    if (hoveredFocusPointBinding) {
      this.cursor.set(CURSOR_TYPE.POINTER);
    }
  }

  private shouldHandleBrowserCanvasDoubleClick(type: string): boolean {
    if (type === "touch" || this.lastCompletedCanvasClicks.length === 0) {
      return true;
    }
    const [firstClick, secondClick] = this.lastCompletedCanvasClicks;
    if (!firstClick || !secondClick) {
      return false;
    }
    return (
      pointDistance(
        pointFrom(firstClick.x, firstClick.y),
        pointFrom(secondClick.x, secondClick.y),
      ) <= DOUBLE_TAP_POSITION_THRESHOLD
    );
  }

  /**
   * A double-click: into the line editor on a line, into the group under the
   * pointer on a selected group, and otherwise a request to edit text there.
   */
  private handleCanvasDoubleClick(event: MouseEvent): void {
    if (
      this.state.editingTextElement ||
      !this.shouldHandleBrowserCanvasDoubleClick(event.type) ||
      // alt-clicks cycle the selection
      event.altKey ||
      // a double-click with the line tool would both create text and draw
      this.state.multiElement ||
      this.state.activeTool.type !== this.state.preferredSelectionTool.type
    ) {
      return;
    }

    const selectedElements = this.scene.getSelectedElements(this.state);
    const { x: sceneX, y: sceneY } = viewportCoordsToSceneCoords(event, this.state);
    const [selected] = selectedElements;

    if (selectedElements.length === 1 && selected && isLinearElement(selected)) {
      if (
        ((event[KEYS.CTRL_OR_CMD] && isSimpleArrow(selected)) || isLineElement(selected)) &&
        (!this.state.selectedLinearElement?.isEditing ||
          this.state.selectedLinearElement.elementId !== selected.id)
      ) {
        this.actionManager.executeAction(actionToggleLinearEditor);
        return;
      } else if (this.state.selectedLinearElement && isElbowArrow(selected)) {
        const hitCoords = LinearElementEditor.getSegmentMidpointHitCoords(
          this.state.selectedLinearElement,
          { x: sceneX, y: sceneY },
          this.state,
          this.scene.getNonDeletedElementsMap(),
        );
        const midPoint = hitCoords
          ? LinearElementEditor.getSegmentMidPointIndex(
              this.state.selectedLinearElement,
              this.state,
              hitCoords,
              this.scene.getNonDeletedElementsMap(),
            )
          : -1;
        if (midPoint && midPoint > -1) {
          this.store.scheduleCapture();
          LinearElementEditor.deleteFixedSegment(selected, this.scene, midPoint);
          return;
        }
      } else if (
        this.state.selectedLinearElement?.isEditing &&
        this.state.selectedLinearElement.elementId === selected.id &&
        isLineElement(selected)
      ) {
        return;
      }
    }

    this.cursor.reset();

    if (getSelectedGroupIds(this.state).length > 0) {
      const hitElement = this.getElementAtPosition(sceneX, sceneY);
      const selectedGroupId =
        hitElement && getSelectedGroupIdForElement(hitElement, this.state.selectedGroupIds);
      if (hitElement && selectedGroupId) {
        this.store.scheduleCapture();
        this.setState((prevState) => ({
          ...selectGroupsForSelectedElements(
            { editingGroupId: selectedGroupId, selectedElementIds: { [hitElement.id]: true } },
            this.scene.getNonDeletedElements(),
            prevState,
            this,
          ),
        }));
        return;
      }
    }

    if (this.state.viewModeEnabled || this.state.selectedLinearElement?.isEditing) {
      // the line editor's double-click is too often a false positive
      return;
    }
    let textX = sceneX;
    let textY = sceneY;
    const container: NonDeleted<ExcalidrawTextContainer> | null =
      // Ctrl or Cmd skips binding to a container
      !event[KEYS.CTRL_OR_CMD]
        ? // a single selected element is what the double-click is about,
          // wherever it lands
          selectedElements.length === 1
          ? selected && isTextBindableContainer(selected, false)
            ? selected
            : null
          : this.text.getTextBindableContainerAtPosition(sceneX, sceneY)
        : null;
    if (
      container &&
      (hasBoundTextElement(container) ||
        !isTransparent(container.backgroundColor) ||
        hitElementItself({
          point: pointFrom(sceneX, sceneY),
          element: container,
          elementsMap: this.scene.getNonDeletedElementsMap(),
          threshold: this.getElementHitThreshold(container),
          frameNameBound: null,
        }))
    ) {
      const midPoint = getContainerCenter(container, this.scene.getNonDeletedElementsMap());
      textX = midPoint.x;
      textY = midPoint.y;
    }
    this.text.startTextEditing({
      sceneX: textX,
      sceneY: textY,
      insertAtParentCenter: !event.altKey,
      container,
    });
  }

  /** Marks what the eraser's trail touches, faded until the pointer goes up. */
  private handleEraser(event: PointerEvent, scenePointer: { x: number; y: number }): void {
    this.elementsPendingErasure = new Set(
      this.eraserTrail.addPointToPathAndErase(scenePointer.x, scenePointer.y, event.altKey),
    );
    this.scheduleRender(true);
  }

  private restoreReadyToEraseElements(): void {
    this.elementsPendingErasure = new Set();
    this.scheduleRender(true);
  }

  /** Deletes what the eraser marked, a frame's children and labels with it, in one undo step. */
  private eraseElements(): void {
    let didChange = false;
    const elementsMap = this.scene.getElementsMapIncludingDeleted();
    // a binding is held on both ends: the deleted one goes from the other
    for (const id of this.elementsPendingErasure) {
      const element = this.scene.getElement(id);
      if (isBindingElement(element)) {
        for (const binding of [element.startBinding, element.endBinding]) {
          const bindable = binding ? this.scene.getElement(binding.elementId) : null;
          if (bindable) {
            mutateElement(bindable, elementsMap, {
              boundElements: (bindable.boundElements ?? []).filter(
                (bound) => bound.id !== element.id,
              ),
            });
          }
        }
      } else if (isBindableElement(element)) {
        for (const bound of element.boundElements ?? []) {
          if (bound.type !== "arrow") continue;
          const arrow = this.scene.getElement(bound.id);
          if (!arrow || !isArrowElement(arrow)) continue;
          if (arrow.startBinding?.elementId === element.id) {
            mutateElement(arrow, elementsMap, { startBinding: null });
          }
          if (arrow.endBinding?.elementId === element.id) {
            mutateElement(arrow, elementsMap, { endBinding: null });
          }
        }
      }
    }
    const elements = this.scene.getElementsIncludingDeleted().map((element) => {
      if (
        this.elementsPendingErasure.has(element.id) ||
        (element.frameId && this.elementsPendingErasure.has(element.frameId)) ||
        (isBoundToContainer(element) && this.elementsPendingErasure.has(element.containerId))
      ) {
        didChange = true;
        return newElementWith(element, { isDeleted: true });
      }
      return element;
    });
    this.elementsPendingErasure = new Set();
    if (didChange) {
      this.store.scheduleCapture();
      this.scene.replaceAllElements(elements);
    }
  }

  /**
   * An alt-press on the text being edited, once it ended the edit, is handed
   * to the canvas, for the text to be alt-dragged (duplicated) as on it.
   */
  public handOverTextEditorPress(event: PointerEvent, textElementId: string): void {
    this.handedOverTextId = textElementId;
    try {
      this.interactiveCanvas.dispatchEvent(new this.ownerWindow.PointerEvent(event.type, event));
    } finally {
      this.handedOverTextId = null;
    }
  }

  // ---------------------------------------------------------------------------
  // input: keyboard

  private onKeyDown(event: KeyboardEvent): void {
    // CapsLock inverts the case of letters; the shortcuts read the key as if
    // it were off
    if (
      (!event.shiftKey && /^[A-Z]$/.test(event.key)) ||
      (event.shiftKey && /^[a-z]$/.test(event.key))
    ) {
      const key = event.shiftKey ? event.key.toUpperCase() : event.key.toLowerCase();
      event = new Proxy(event, {
        get(target, prop) {
          if (prop === "key") return key;
          const value: unknown = Reflect.get(target, prop);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    }

    // inside an input (but Escape), or arrows over a button
    if (
      (isWritableElement(event.target) && event.key !== KEYS.ESCAPE) ||
      (isArrowKey(event.key) && isInputLike(event.target))
    ) {
      return;
    }

    if (this.maybeHandlePageScrollKeyDown(event)) {
      event.preventDefault();
      return;
    }

    if (event.key === KEYS.ALT) {
      maybeHandleArrowPointlikeDrag({ app: this.elementApp, event });
    }

    if (this.actionManager.handleKeyDown(event)) {
      return;
    }

    if (this.state.viewModeEnabled && event.key === KEYS.ESCAPE) {
      return;
    }

    if (
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      !this.state.newElement &&
      !this.state.selectionElement &&
      !this.state.selectedElementsAreBeingDragged
    ) {
      const shape = findToolByKey(event.key, this.state, event.shiftKey);
      if (this.state.viewModeEnabled && shape !== "hand" && shape !== "laser") {
        return;
      }
      if (shape) {
        if (shape === "arrow" && this.state.activeTool.type === "arrow") {
          // the arrow key again cycles the arrow's kind
          this.setState({
            currentItemArrowType:
              this.state.currentItemArrowType === ARROW_TYPE.sharp
                ? ARROW_TYPE.round
                : this.state.currentItemArrowType === ARROW_TYPE.round
                  ? ARROW_TYPE.elbow
                  : ARROW_TYPE.sharp,
          });
        }
        if (shape === "lasso" && this.state.activeTool.type === "laser") {
          this.setActiveTool({ type: this.state.preferredSelectionTool.type });
        } else {
          this.setActiveTool({ type: shape }, { toggle: true });
        }
        event.stopPropagation();
        event.preventDefault();
        return;
      } else if (event.key.toLowerCase() === KEYS.Q) {
        this.toggleLock();
        event.stopPropagation();
        return;
      }
    }

    if (this.state.viewModeEnabled) {
      return;
    }

    if (event[KEYS.CTRL_OR_CMD] && !event.repeat) {
      this.setState({ isBindingEnabled: this.state.bindingPreference !== "enabled" });
      // what a text-tool click here would do changed, with no pointer move
      this.textTool.refresh(event);
      maybeHandleArrowPointlikeDrag({ app: this.elementApp, event });
    }

    if (isArrowKey(event.key)) {
      this.handleArrowKey(event);
      event.preventDefault();
    } else if (event.key === KEYS.ENTER) {
      this.handleEnterKey(event);
    } else if (event.key === KEYS.TAB && !event[KEYS.CTRL_OR_CMD] && !event.altKey) {
      this.cycleSelection(event);
    }

    if (event.key === KEYS.SPACE && this.gesture.pointers.size === 0) {
      this.spaceHeld = true;
      this.cursor.set(CURSOR_TYPE.GRAB);
      event.preventDefault();
    }
  }

  /**
   * Arrow keys move the selection, by a grid cell on the grid (by a larger
   * step with shift) or by a pixel (by five with shift); with nothing
   * selected they pan, by a tenth of the viewport (a whole one with shift).
   */
  private handleArrowKey(event: KeyboardEvent): void {
    const selectedElements = this.scene.getSelectedElements({
      selectedElementIds: this.state.selectedElementIds,
      includeBoundTextElement: true,
      includeElementsInFrames: true,
    });

    if (selectedElements.length === 0) {
      const page = (size: number) => (event.shiftKey ? size : size / 10) / this.state.zoom.value;
      const dx =
        event.key === KEYS.ARROW_LEFT
          ? page(this.state.width)
          : event.key === KEYS.ARROW_RIGHT
            ? -page(this.state.width)
            : 0;
      const dy =
        event.key === KEYS.ARROW_UP
          ? page(this.state.height)
          : event.key === KEYS.ARROW_DOWN
            ? -page(this.state.height)
            : 0;
      this.translateViewport((state) => ({
        scrollX: state.scrollX + dx,
        scrollY: state.scrollY + dy,
      }));
      return;
    }

    const selectedElementIds = new Set(selectedElements.map((element) => element.id));
    const frameArrowIds = getFrameArrowIdsToReattach(selectedElements);
    // an arrow bound to an unselected element moves only with what it is
    // bound to, unless its frame moves it
    const movedElements = selectedElements.filter(
      (element) =>
        !isBindingElement(element) ||
        frameArrowIds.has(element.id) ||
        !isBoundToElementNotIn(element, selectedElementIds),
    );

    const gridSize = this.getEffectiveGridSize();
    const step: number =
      (gridSize && (event.shiftKey ? ELEMENT_TRANSLATE_AMOUNT : gridSize)) ||
      (event.shiftKey ? ELEMENT_SHIFT_TRANSLATE_AMOUNT : ELEMENT_TRANSLATE_AMOUNT);

    const offsetX =
      event.key === KEYS.ARROW_LEFT ? -step : event.key === KEYS.ARROW_RIGHT ? step : 0;
    const offsetY = event.key === KEYS.ARROW_UP ? -step : event.key === KEYS.ARROW_DOWN ? step : 0;

    for (const element of movedElements) {
      if (frameArrowIds.has(element.id)) continue;
      this.scene.mutateElement(
        element,
        { x: element.x + offsetX, y: element.y + offsetY },
        { informMutation: false, isDragging: false },
      );
      updateBoundElements(element, this.scene, {
        simultaneouslyUpdated: movedElements,
        renderEnvironment: this.renderEnvironment,
      });
    }
    moveFrameArrows(frameArrowIds, { x: offsetX, y: offsetY }, this.scene, {
      renderEnvironment: this.renderEnvironment,
    });
    removeArrowsWithoutEndInFrame(movedElements, this.scene.getNonDeletedElementsMap());
    this.scene.triggerUpdate();
  }

  /**
   * Enter: the line editor on a line (on an arrow with ctrl or cmd), a text
   * edit request on text; with a drawing tool, a shape of the tool's at the
   * middle of the viewport, which is how a keyboard draws.
   */
  private handleEnterKey(event: KeyboardEvent): void {
    const toolType = this.state.activeTool.type;
    if (
      toolType === "rectangle" ||
      toolType === "diamond" ||
      toolType === "ellipse" ||
      toolType === "arrow" ||
      toolType === "line"
    ) {
      this.insertShapeAtViewportCenter(toolType);
      event.preventDefault();
      return;
    }

    const selectedElements = this.scene.getSelectedElements(this.state);
    const [selected] = selectedElements;
    if (selectedElements.length !== 1 || !selected) {
      return;
    }
    if (event[KEYS.CTRL_OR_CMD] || isLineElement(selected)) {
      if (
        isLinearElement(selected) &&
        (!this.state.selectedLinearElement?.isEditing ||
          this.state.selectedLinearElement.elementId !== selected.id)
      ) {
        this.store.scheduleCapture();
        if (!isElbowArrow(selected)) {
          this.actionManager.executeAction(actionToggleLinearEditor);
        }
      }
      event.preventDefault();
    } else if (isTextElement(selected) || isValidTextContainer(selected)) {
      const midPoint = getContainerCenter(selected, this.scene.getNonDeletedElementsMap());
      this.text.startTextEditing({
        sceneX: midPoint.x,
        sceneY: midPoint.y,
        container: isTextElement(selected) ? undefined : selected,
      });
      event.preventDefault();
    }
  }

  /** A shape of the active tool's, its default size, at the middle of the viewport. */
  private insertShapeAtViewportCenter(
    type: "rectangle" | "diamond" | "ellipse" | "arrow" | "line",
  ): void {
    const { x, y } = viewportCoordsToSceneCoords(
      {
        clientX: this.state.offsetLeft + this.state.width / 2,
        clientY: this.state.offsetTop + this.state.height / 2,
      },
      this.state,
    );
    const size = KEYBOARD_SHAPE_SIZE;
    const [gridX, gridY] = getGridPoint(x - size / 2, y - size / 2, this.getEffectiveGridSize());
    const base = {
      x: gridX,
      y: gridY,
      strokeColor: this.state.currentItemStrokeColor,
      backgroundColor: this.state.currentItemBackgroundColor,
      fillStyle: this.state.currentItemFillStyle,
      strokeWidth: this.getCurrentItemStrokeWidth(type),
      strokeStyle: this.state.currentItemStrokeStyle,
      roughness: this.state.currentItemRoughness,
      opacity: this.state.currentItemOpacity,
      locked: false,
    };
    const points = [pointFrom<LocalPoint>(0, 0), pointFrom<LocalPoint>(size, 0)];
    const element =
      type === "arrow"
        ? newArrowElement({
            ...base,
            y: gridY + size / 2,
            width: size,
            height: 0,
            type,
            points,
            roundness:
              this.state.currentItemArrowType === ARROW_TYPE.round
                ? { type: ROUNDNESS.PROPORTIONAL_RADIUS }
                : null,
            startArrowhead: this.state.currentItemStartArrowhead,
            endArrowhead: this.state.currentItemEndArrowhead,
            elbowed: this.state.currentItemArrowType === ARROW_TYPE.elbow,
            fixedSegments: this.state.currentItemArrowType === ARROW_TYPE.elbow ? [] : null,
          })
        : type === "line"
          ? newLinearElement({
              ...base,
              y: gridY + size / 2,
              width: size,
              height: 0,
              type,
              points,
              roundness:
                this.state.currentItemRoundness === "round"
                  ? { type: ROUNDNESS.PROPORTIONAL_RADIUS }
                  : null,
            })
          : newElement({
              ...base,
              type,
              width: size,
              height: size,
              roundness: this.getCurrentItemRoundness(type),
            });

    this.store.scheduleCapture();
    this.insertNewElement(element);
    if (!this.isToolLocked()) {
      this.setState({
        activeTool: updateActiveTool(this.state, { type: this.state.preferredSelectionTool.type }),
      });
      this.cursor.reset();
    }
    this.selection.select(element);
  }

  /**
   * Tab and Shift+Tab move the selection to the next or the previous element
   * (a group counts as one); past the last, the selection clears and the key
   * moves focus on, out of the editor.
   */
  private cycleSelection(event: KeyboardEvent): void {
    const units: NonDeletedExcalidrawElement[] = [];
    const seen = new Set<string>();
    for (const element of this.scene.getNonDeletedElements()) {
      if (element.locked || (isTextElement(element) && element.containerId)) continue;
      const unit = element.groupIds.at(-1) ?? element.id;
      if (seen.has(unit)) continue;
      seen.add(unit);
      units.push(element);
    }
    if (units.length === 0) return;

    const selected = this.scene.getSelectedElements(this.state);
    const current = selected[0];
    const currentIndex = current
      ? units.findIndex(
          (unit) => (unit.groupIds.at(-1) ?? unit.id) === (current.groupIds.at(-1) ?? current.id),
        )
      : -1;
    const nextIndex = event.shiftKey
      ? currentIndex === -1
        ? units.length - 1
        : currentIndex - 1
      : currentIndex + 1;
    const next = units[nextIndex];
    if (!next) {
      if (selected.length > 0) this.selection.clear();
      return;
    }
    event.preventDefault();
    this.selection.select(next);
  }

  private maybeHandlePageScrollKeyDown(event: KeyboardEvent): boolean {
    if (event.key !== KEYS.PAGE_UP && event.key !== KEYS.PAGE_DOWN) {
      return false;
    }
    let offset = (event.shiftKey ? this.state.width : this.state.height) / this.state.zoom.value;
    if (event.key === KEYS.PAGE_DOWN) {
      offset = -offset;
    }
    if (event.shiftKey) {
      this.translateViewport((state) => ({ scrollX: state.scrollX + offset }));
    } else {
      this.translateViewport((state) => ({ scrollY: state.scrollY + offset }));
    }
    return true;
  }

  private onKeyUp(event: KeyboardEvent): void {
    if (event.key === KEYS.SPACE) {
      if (this.state.viewModeEnabled) {
        this.cursor.set(CURSOR_TYPE.GRAB);
      } else if (isSelectionLikeTool(this.state.activeTool.type)) {
        this.cursor.reset();
      } else {
        this.cursor.applyForTool();
        this.selection.clear();
      }
      this.spaceHeld = false;
    }

    if (event.key === KEYS.ALT) {
      maybeHandleArrowPointlikeDrag({ app: this.elementApp, event });
    }

    if (
      (event.key === KEYS.ALT && this.state.bindMode === "skip") ||
      (!event[KEYS.CTRL_OR_CMD] && !isBindingEnabled(this.state))
    ) {
      this.setState({ bindMode: "orbit" });
    }

    if (!event[KEYS.CTRL_OR_CMD]) {
      const preferenceEnabled = this.state.bindingPreference === "enabled";
      if (this.state.isBindingEnabled !== preferenceEnabled) {
        this.setState({ isBindingEnabled: preferenceEnabled });
        this.textTool.refresh(event);
      }
      maybeHandleArrowPointlikeDrag({ app: this.elementApp, event });
    }

    if (isArrowKey(event.key)) {
      bindOrUnbindBindingElements(
        this.scene.getSelectedElements(this.state).filter(isArrowElement),
        this.scene,
        this.state,
      );

      const elementsMap = this.scene.getNonDeletedElementsMap();
      // a simple arrow's fixed points follow where it was moved to
      for (const element of this.scene.getSelectedElements(this.state).filter(isSimpleArrow)) {
        if (element.startBinding) {
          this.scene.mutateElement(element, {
            startBinding: {
              ...element.startBinding,
              ...calculateFixedPointForNonElbowArrowBinding(
                element,
                elementsMap.get(
                  element.startBinding.elementId,
                ) as NonDeleted<ExcalidrawBindableElement>,
                "start",
                elementsMap,
              ),
            },
          });
        }
        if (element.endBinding) {
          this.scene.mutateElement(element, {
            endBinding: {
              ...element.endBinding,
              ...calculateFixedPointForNonElbowArrowBinding(
                element,
                elementsMap.get(
                  element.endBinding.elementId,
                ) as NonDeleted<ExcalidrawBindableElement>,
                "end",
                elementsMap,
              ),
            },
          });
        }
      }

      this.setState({ suggestedBinding: null });
      // an arrow-key move is one undo step per key press
      this.store.scheduleCapture();
    }
  }

  // ---------------------------------------------------------------------------
  // rendering

  /**
   * Draws on the next frame; many calls in one frame draw once. `invalidate`
   * redraws the scene too when nothing its key covers changed.
   */
  public scheduleRender(invalidate = false): void {
    if (invalidate) {
      this.lastStaticKey = null;
    }
    if (this.frame !== null || this.destroyed) return;
    this.frame = this.ownerWindow.requestAnimationFrame((time) => {
      this.frame = null;
      this.render(time);
    });
  }

  /** Draws all three canvases now. */
  public render(time = 0): void {
    if (this.destroyed) return;
    const { state } = this;
    const scale = this.ownerWindow.devicePixelRatio || 1;
    const selectedElements = this.scene.getSelectedElements(state);

    const staticKey = [
      this.scene.getSceneNonce(),
      state.zoom.value,
      state.scrollX,
      state.scrollY,
      state.width,
      state.height,
      state.theme,
      state.viewBackgroundColor,
      state.gridModeEnabled,
      state.gridSize,
      state.gridStep,
      state.newElement?.id,
      state.newElement?.versionNonce,
      state.editingTextElement?.id,
      state.selectedElementsAreBeingDragged,
      state.frameToHighlight?.id,
      state.editingGroupId,
      scale,
    ].join("|");
    if (staticKey !== this.lastStaticKey || this.renderable === null) {
      this.lastStaticKey = staticKey;
      this.renderable = this.sceneCanvas.render(state, scale, {
        selectedElements,
        renderGrid: state.gridModeEnabled,
        elementsPendingErasure: this.elementsPendingErasure,
      });
    }
    const renderable = this.renderable;
    const allElementsMap = this.scene.getNonDeletedElementsMap();

    const { newElementCanvas, interactiveCanvas, container } = this.options;
    this.sizeCanvas(newElementCanvas, scale);
    renderNewElementScene({
      canvas: newElementCanvas,
      rc: this.sceneCanvas.rc,
      newElement: renderable.newElementCanvasElement,
      elementsMap: renderable.elementsMap,
      allElementsMap,
      scale,
      appState: state,
      renderConfig: {
        imageCache: this.sceneCanvas.imageCache,
        isExporting: false,
        scale,
        renderEnvironment: this.renderEnvironment,
        renderGrid: false,
        canvasBackgroundColor: state.viewBackgroundColor,
        embedsValidationStatus: new Map(),
        elementsPendingErasure: new Set(),
        pendingFlowchartNodes: null,
        theme: state.theme,
      },
    });

    this.sizeCanvas(interactiveCanvas, scale);
    const deltaTime = this.lastFrameTime ? time - this.lastFrameTime : 0;
    this.lastFrameTime = time;
    const result = renderInteractiveScene({
      app: this,
      canvas: interactiveCanvas,
      elementsMap: renderable.elementsMap,
      visibleElements: renderable.visibleElements,
      selectedElements,
      allElementsMap,
      scale,
      appState: state,
      renderConfig: {
        remotePointerViewportCoords: new Map(),
        remotePointerButton: new Map(),
        remoteSelectedElementIds: new Map(),
        remotePointerUsernames: new Map(),
        remotePointerUserStates: new Map(),
        selectionColor: getSelectionColor(container),
        renderScrollbars: false,
        lastViewportPosition: this.lastPosition,
      },
      editorInterface: this.editorInterface,
      callback: ({ scrollBars }) => {
        if (scrollBars) this.scrollBars = scrollBars;
      },
      animationState: this.animationState ?? { bindingHighlight: undefined },
      deltaTime,
    });
    const next = result.animationState;
    this.animationState = next;
    if (next && Object.values(next).some((value) => value !== undefined)) {
      this.scheduleRender();
    } else {
      this.lastFrameTime = 0;
    }
  }

  private sizeCanvas(canvas: HTMLCanvasElement, scale: number): void {
    const { width, height } = this.state;
    const pixelWidth = Math.max(1, Math.round(width * scale));
    const pixelHeight = Math.max(1, Math.round(height * scale));
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.maybeCleanupAfterMissingPointerUp(null);
    this.text.destroy();
    this.laserTrails.stop();
    this.eraserTrail.stop();
    this.lassoTrail.stop();
    this.destroyed = true;
    if (this.frame !== null) this.ownerWindow.cancelAnimationFrame(this.frame);
    this.resize?.disconnect();
    for (const remove of this.listeners) remove();
    this.changeEmitter.clear();
    this.announceEmitter.clear();
    this.textEditEmitter.clear();
    this.textEditEndEmitter.clear();
    this.store.onDurableIncrementEmitter.clear();
    SnapCache.destroy();
    this.sceneCanvas.destroy();
  }
}
