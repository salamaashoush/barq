import { debounce, easeOut, isBounds, type Bounds } from "@excalidraw/common";
import { clamp } from "@excalidraw/math";
import {
  getCommonBounds,
  getElementsInGroup,
  isElementLink,
  isExcalidrawElement,
  parseElementLinkFromURL,
} from "@excalidraw/element";

import type {
  ExcalidrawElement,
  NonDeleted,
  NonDeletedSceneElementsMap,
} from "@excalidraw/element/types";

import { isRTLLanguage, type LocalizedMessage } from "../i18n.ts";
import {
  cancelAnimation,
  isAnimationRunning,
  startAnimation,
  type AnimationScheduler,
} from "../renderer/animation.ts";
import {
  DEFAULT_OVERSCROLL,
  constrainScrollState,
  zoomToFitBounds,
  type SetViewportOptions,
  type SetViewportRect,
} from "../viewport.ts";

import type {
  AppState,
  NormalizedZoomValue,
  Offsets,
  ScrollConstraints,
  ViewportOffsets,
  ViewportOffsetsOptions,
  ViewportUIDock,
  ViewportUIName,
} from "../types.ts";
import type { DiagramEditor } from "./editor.ts";

const DEFAULT_SCROLL_ANIMATION_DURATION = 500;

/** Snappier than a navigation, so a released overscroll feels responsive. */
const SNAP_BACK_ANIMATION_DURATION = 250;

/** How long after the last pan or zoom the overscroll springs back. */
const SCROLL_CONSTRAINTS_SNAP_BACK_DELAY = 200;

/** The sidebar's footprint before it was ever measured. */
const SIDEBAR_APPROX_WIDTH = 316;

/** The styles panel's footprint (and the editor's edge inset) before it was ever measured. */
const STYLES_PANEL_APPROX_WIDTH = { full: 216, compact: 64 };

type Viewport = Pick<AppState, "scrollX" | "scrollY" | "zoom">;

type ConstrainableState = Pick<
  AppState,
  "scrollX" | "scrollY" | "zoom" | "width" | "height" | "scrollConstraints"
>;

const isSetViewportRect = (target: unknown): target is SetViewportRect => {
  if (!target || typeof target !== "object" || Array.isArray(target)) {
    return false;
  }
  const rect = target as Partial<SetViewportRect>;
  return (
    typeof rect.x === "number" &&
    typeof rect.y === "number" &&
    (rect.width === undefined || typeof rect.width === "number") &&
    (rect.height === undefined || typeof rect.height === "number")
  );
};

const getElementsFromId = (id: string, elementsMap: NonDeletedSceneElementsMap) => {
  const element = elementsMap.get(id);
  return element ? [element] : getElementsInGroup(elementsMap, id);
};

type ResolvedViewportTarget = {
  /** `null` for an unknown id or link, or elements all deleted. */
  bounds: Bounds | null;
  type: "element" | "area" | "link";
};

const resolveViewportTarget = (
  target: SetViewportOptions["target"],
  elementsMap: NonDeletedSceneElementsMap,
  appState: Pick<AppState, "width" | "height">,
): ResolvedViewportTarget => {
  if (typeof target === "string") {
    const isLink = isElementLink(target);
    const type = isLink ? ("link" as const) : ("element" as const);
    const id = isLink ? parseElementLinkFromURL(target) : target;
    const resolved = id ? getElementsFromId(id, elementsMap) : [];
    if (resolved.length === 0) {
      return { bounds: null, type };
    }
    return { bounds: getCommonBounds(resolved, elementsMap), type };
  }
  if (isBounds(target)) {
    return { bounds: target, type: "area" };
  }
  if (isSetViewportRect(target) && !isExcalidrawElement(target)) {
    const width = target.width ?? appState.width;
    const height = target.height ?? appState.height;
    return {
      bounds: [target.x, target.y, target.x + width, target.y + height],
      type: "area",
    };
  }
  const targetElements: readonly (ExcalidrawElement | undefined | null)[] = Array.isArray(target)
    ? target
    : [target as ExcalidrawElement];
  const elements: NonDeleted<ExcalidrawElement>[] = [];
  for (const element of targetElements) {
    if (element && !element.isDeleted) {
      const sceneElement = elementsMap.get(element.id);
      if (sceneElement) {
        elements.push(sceneElement);
      }
    }
  }
  if (elements.length !== targetElements.length || elements.length === 0) {
    console.warn(
      "supplied element target(s) for setViewport contain deleted or non-existent elements which have been filtered out",
    );
  }
  if (elements.length === 0) {
    return { bounds: null, type: "element" };
  }
  return { bounds: getCommonBounds(elements, elementsMap), type: "element" };
};

const resolveOverscroll = (overscroll: boolean | number | undefined): number => {
  if (overscroll === false) {
    return 0;
  }
  if (overscroll === true || overscroll === undefined) {
    return DEFAULT_OVERSCROLL;
  }
  return Math.max(overscroll, 0);
};

/**
 * The viewport landing on `bounds`, and the scroll lock to install with it,
 * or `scrollConstraints: null` to lift a previous one.
 */
const getConstrainedTargetViewport = (
  appState: AppState,
  bounds: Bounds,
  { fit, offsets, lock }: Pick<SetViewportOptions, "fit" | "lock"> & { offsets?: Offsets },
): Viewport & { scrollConstraints: ScrollConstraints | null } => {
  const { appState: fitted } = zoomToFitBounds({
    bounds,
    appState,
    fit: fit ?? "scale-down",
    canvasOffsets: offsets,
    steppedZoom: false,
  });
  const viewport = { scrollX: fitted.scrollX, scrollY: fitted.scrollY, zoom: fitted.zoom };
  if (!lock?.scroll && !lock?.zoom) {
    return { ...viewport, scrollConstraints: null };
  }
  const [x1, y1, x2, y2] = bounds;
  const scrollConstraints: ScrollConstraints = {
    x: x1,
    y: y1,
    width: x2 - x1,
    height: y2 - y1,
    lockScroll: !!lock.scroll,
    lockZoom: !!lock.zoom,
    zoom: viewport.zoom.value,
    overscroll: resolveOverscroll(lock.overscroll),
    offsets,
  };
  return {
    ...constrainScrollState({ ...appState, ...viewport, scrollConstraints }),
    scrollConstraints,
  };
};

/**
 * The viewport between `from` (0) and `target` (1) at an eased `factor`: the
 * zoom geometric, and the scroll blended with the weight the zoom implies,
 * so every scene point travels a straight line on the screen.
 */
const interpolateViewport = ({
  from,
  target,
  factor,
}: {
  from: Viewport;
  target: Viewport;
  factor: number;
}): Viewport => {
  if (factor >= 1) {
    return { ...target };
  }
  const zoom = (from.zoom.value *
    Math.pow(target.zoom.value / from.zoom.value, factor)) as NormalizedZoomValue;
  const weight =
    target.zoom.value === from.zoom.value
      ? factor
      : (zoom - from.zoom.value) / (target.zoom.value - from.zoom.value);
  return {
    scrollX:
      ((1 - weight) * from.scrollX * from.zoom.value +
        weight * target.scrollX * target.zoom.value) /
      zoom,
    scrollY:
      ((1 - weight) * from.scrollY * from.zoom.value +
        weight * target.scrollY * target.zoom.value) /
      zoom,
    zoom: { value: zoom },
  };
};

const resolveAnimationDuration = (animation: SetViewportOptions["animation"]): number | null => {
  if (animation === false) {
    return null;
  }
  if (animation === true || animation === undefined) {
    return DEFAULT_SCROLL_ANIMATION_DURATION;
  }
  return animation.duration ?? DEFAULT_SCROLL_ANIMATION_DURATION;
};

type TranslateUpdate =
  | Partial<AppState>
  | null
  | ((prevState: Readonly<AppState>) => Partial<AppState> | null);

/**
 * Excalidraw's `AppViewport`: `setViewport` and its animation and locks, the
 * offsets the rendered UI leaves (`getOffsets`), and a user's pan or zoom
 * held to the lock with its rubberband give, which springs back once the
 * gesture is over.
 */
export class EditorViewport {
  private activeTransition: { target: Viewport & Pick<AppState, "scrollConstraints"> } | null =
    null;
  private readonly uiLastMeasured = new Map<
    ViewportUIName,
    { side: "left" | "right"; offset: number }
  >();
  private activeExternalGestures = 0;
  // one editor's own: two editors on a page never cancel each other's
  public readonly scrollToContentAnimationKey = Symbol("scrollToContentAnimation");
  public readonly snapBackAnimationKey = Symbol("snapBackAnimation");

  public constructor(
    private readonly app: DiagramEditor,
    private readonly dependencies: { isGestureActive: () => boolean },
  ) {}

  public get isAnimating(): boolean {
    return (
      isAnimationRunning(this.scrollToContentAnimationKey) ||
      isAnimationRunning(this.snapBackAnimationKey)
    );
  }

  /** Whether an animated `setViewport` into a lock holds the user's pan and zoom off. */
  public get isLockedTransitionPending(): boolean {
    return !!this.activeTransition?.target.scrollConstraints;
  }

  private get scheduler(): AnimationScheduler {
    return this.app.ownerWindow;
  }

  private get isRTL(): boolean {
    return isRTLLanguage(this.app.host.langCode ?? "en");
  }

  public invalidateUIOffset(name: ViewportUIName): void {
    this.uiLastMeasured.delete(name);
  }

  private measureSide(node: HTMLElement, containerRect: DOMRect) {
    const rect = node.getBoundingClientRect();
    const left = rect.left - containerRect.left;
    const right = rect.right - containerRect.left;
    return left + rect.width / 2 < this.app.state.width / 2
      ? { side: "left" as const, offset: right }
      : { side: "right" as const, offset: this.app.state.width - left };
  }

  private getReservedSide(name: keyof NonNullable<ViewportOffsetsOptions["reserve"]>) {
    const isRTL = this.isRTL;
    return (
      this.uiLastMeasured.get(name) ??
      (name === "stylesPanel"
        ? {
            side: isRTL ? ("right" as const) : ("left" as const),
            offset:
              this.app.editorInterface.formFactor === "tablet"
                ? STYLES_PANEL_APPROX_WIDTH.compact
                : STYLES_PANEL_APPROX_WIDTH.full,
          }
        : {
            side: isRTL ? ("left" as const) : ("right" as const),
            offset: SIDEBAR_APPROX_WIDTH,
          })
    );
  }

  /** `offsets` in pixels per side, the static sides over the measured UI. */
  public resolveOffsets(offsets: ViewportOffsets | undefined): Offsets | undefined {
    if (!offsets) {
      return offsets;
    }
    const { ui, ...staticOffsets } = offsets;
    if (!ui) {
      return staticOffsets;
    }
    const measured = this.getOffsets(ui === true ? undefined : ui);
    return {
      top: staticOffsets.top ?? measured.top,
      right: staticOffsets.right ?? measured.right,
      bottom: staticOffsets.bottom ?? measured.bottom,
      left: staticOffsets.left ?? measured.left,
    };
  }

  /**
   * Excalidraw's `getViewportOffsets`: how far the rendered UI (what carries
   * `data-viewport-ui`) reaches into the canvas from each side, with padding,
   * and room for the hidden surfaces `reserve` names.
   */
  public getOffsets = (opts?: ViewportOffsetsOptions): Offsets => {
    const { container } = this.app;
    const containerRect = container.getBoundingClientRect();
    const isRTL = this.isRTL;
    const measured = { top: 0, right: 0, bottom: 0, left: 0 };
    const rendered = new Set<ViewportUIName>();

    for (const node of container.querySelectorAll<HTMLElement>("[data-viewport-ui]")) {
      const rect = node.getBoundingClientRect();
      switch (node.dataset.viewportUi as ViewportUIDock) {
        case "top":
          measured.top = Math.max(measured.top, rect.bottom - containerRect.top);
          break;
        case "bottom":
          measured.bottom = Math.max(
            measured.bottom,
            this.app.state.height - (rect.top - containerRect.top),
          );
          break;
        case "side": {
          const { side, offset } = this.measureSide(node, containerRect);
          measured[side] = Math.max(measured[side], offset);
          const name = node.dataset.viewportUiName as ViewportUIName | undefined;
          if (name) {
            rendered.add(name);
            if (offset > 0) {
              this.uiLastMeasured.set(name, { side, offset });
            }
          }
          break;
        }
      }
    }

    if (opts?.reserve && this.app.editorInterface.formFactor !== "phone") {
      for (const name of ["stylesPanel", "sidebar"] as const) {
        if (opts.reserve[name] && !rendered.has(name)) {
          const { side, offset } = this.getReservedSide(name);
          measured[side] = Math.max(measured[side], offset);
        }
      }
    }

    const padding = opts?.padding ?? 24;
    const topPadding = opts?.paddingTop ?? padding;
    const rightPadding = (isRTL ? opts?.paddingLeft : opts?.paddingRight) ?? padding;
    const bottomPadding = opts?.paddingBottom ?? padding;
    const leftPadding = (isRTL ? opts?.paddingRight : opts?.paddingLeft) ?? padding;

    return {
      top: opts?.top ?? measured.top + topPadding,
      right: (isRTL ? opts?.left : opts?.right) ?? measured.right + rightPadding,
      bottom: opts?.bottom ?? measured.bottom + bottomPadding,
      left: (isRTL ? opts?.right : opts?.left) ?? measured.left + leftPadding,
    };
  };

  /** `initialState.viewport` against the restored scene: the viewport to open at, or `null`. */
  public resolveInitialViewport(
    opts: Omit<SetViewportOptions, "animation">,
    elementsMap: NonDeletedSceneElementsMap,
    appState: AppState,
  ): (Viewport & { scrollConstraints: ScrollConstraints | null }) | null {
    const { bounds } = resolveViewportTarget(opts.target, elementsMap, appState);
    if (!bounds) {
      return null;
    }
    return getConstrainedTargetViewport(appState, bounds, {
      ...opts,
      offsets: this.resolveOffsets(opts.offsets),
    });
  }

  /**
   * Excalidraw's `setViewport`: shows a target, animated unless `animation`
   * is `false`, and installs or lifts a lock; `null` lifts the lock alone.
   * It stops following a collaborator, as a pan does.
   */
  public setViewport = (opts: SetViewportOptions | null): void => {
    if (opts === null) {
      this.cancelTransition();
      cancelAnimation(this.snapBackAnimationKey);
      this.snapBackDebounced.cancel();
      this.app.setState({ scrollConstraints: null, shouldCacheIgnoreZoom: false });
      return;
    }

    const { target, fit, lock, animation } = opts;
    const offsets = this.resolveOffsets(opts.offsets);
    const { bounds, type } = resolveViewportTarget(
      target,
      this.app.scene.getNonDeletedElementsMap(),
      this.app.state,
    );
    if (!bounds) {
      if (type === "link") {
        this.app.setState({
          toast: {
            message: { key: "elementLink.notFound" } satisfies LocalizedMessage,
            duration: 3000,
            closable: true,
          },
        });
      }
      return;
    }

    this.app.requestUnfollow();
    const viewportUpdate = getConstrainedTargetViewport(this.app.state, bounds, {
      fit,
      offsets,
      lock,
    });
    const duration = resolveAnimationDuration(animation);
    const from = {
      scrollX: this.app.state.scrollX,
      scrollY: this.app.state.scrollY,
      zoom: this.app.state.zoom,
    };

    // a new navigation takes over from the last frame the previous one drew
    this.cancelTransition();
    cancelAnimation(this.snapBackAnimationKey);
    this.snapBackDebounced.cancel();

    if (duration === null) {
      this.app.setState({ ...viewportUpdate, shouldCacheIgnoreZoom: false });
      return;
    }

    const transition = { target: viewportUpdate };
    this.activeTransition = transition;
    // the new lock waits outside the state, so it holds no frame back, and
    // lands with the final viewport
    if (this.app.state.scrollConstraints) {
      this.app.setState({ scrollConstraints: null });
    }

    startAnimation<{ elapsed: number }>(
      this.scrollToContentAnimationKey,
      ({ deltaTime, state }) => {
        const elapsed = (state?.elapsed ?? 0) + deltaTime;
        const progress = Math.min(elapsed / duration, 1);
        if (progress < 1) {
          if (this.activeTransition === transition) {
            const factor = easeOut(clamp(progress, 0, 1));
            this.app.batch(() =>
              this.app.setState({
                ...interpolateViewport({ from, target: viewportUpdate, factor }),
                shouldCacheIgnoreZoom: true,
              }),
            );
          }
          return { elapsed };
        }
        if (this.activeTransition === transition) {
          this.activeTransition = null;
          this.app.batch(() =>
            this.app.setState({ ...transition.target, shouldCacheIgnoreZoom: false }),
          );
        }
        return null;
      },
      this.scheduler,
    );
  };

  /**
   * A user's pan or zoom: held to the lock, a pan with its rubberband give,
   * which springs back after a pause. Refused while an animated
   * `setViewport` into a lock is under way.
   */
  public translate(
    update: TranslateUpdate,
    opts?: { zoomPreConstrained?: boolean; preserveScrollConstraintsSnapBack?: boolean },
  ): boolean {
    if (this.isLockedTransitionPending) {
      return false;
    }
    // a gesture taking over an animation draws crisp again: the animation's
    // end, which would, no longer runs
    if (this.activeTransition) {
      this.app.setState({ shouldCacheIgnoreZoom: false });
    }
    this.cancelTransition();
    if (!opts?.preserveScrollConstraintsSnapBack) {
      cancelAnimation(this.snapBackAnimationKey);
    }
    this.app.requestUnfollow();
    this.app.setState((prevState) => {
      const next = typeof update === "function" ? update(prevState) : update;
      if (!next) {
        return null;
      }
      const nextState = { ...prevState, ...next };
      if (!nextState.scrollConstraints) {
        return next;
      }
      const zoomed = !opts?.zoomPreConstrained && nextState.zoom.value !== prevState.zoom.value;
      const overscroll = zoomed ? 0 : nextState.scrollConstraints.overscroll;
      if (overscroll > 0) {
        this.snapBackDebounced();
      }
      return { ...next, ...constrainScrollState(nextState, overscroll) };
    });
    return true;
  }

  /**
   * A viewport gesture from outside the canvas (the minimap's drag) holds an
   * overscroll as a pan does; the returned function ends it.
   */
  public beginGesture(): () => void {
    let active = true;
    this.activeExternalGestures++;
    cancelAnimation(this.snapBackAnimationKey);
    return () => {
      if (active) {
        active = false;
        this.activeExternalGestures--;
        this.releaseOverscroll();
      }
    };
  }

  /** Springs a held overscroll back at once, as a gesture ends. */
  public releaseOverscroll(): void {
    if (!this.app.state.scrollConstraints) {
      return;
    }
    this.snapBackDebounced.cancel();
    this.snapBack();
  }

  public destroy(): void {
    this.cancelTransition();
    cancelAnimation(this.snapBackAnimationKey);
    this.snapBackDebounced.cancel();
  }

  private snapBack = (): void => {
    if (
      this.app.isDestroyed ||
      this.dependencies.isGestureActive() ||
      this.activeExternalGestures > 0
    ) {
      return;
    }
    const state: ConstrainableState = this.app.state;
    const target = constrainScrollState(state);
    if (
      target.scrollX === state.scrollX &&
      target.scrollY === state.scrollY &&
      target.zoom.value === state.zoom.value
    ) {
      return;
    }
    // a navigation owns the viewport until it settles
    if (isAnimationRunning(this.scrollToContentAnimationKey)) {
      return;
    }
    // the displacement in screen pixels, decaying over the resting viewport
    // of each frame, which a zoom may move meanwhile
    const overscrollX = (state.scrollX - target.scrollX) * state.zoom.value;
    const overscrollY = (state.scrollY - target.scrollY) * state.zoom.value;
    startAnimation<{ elapsed: number }>(
      this.snapBackAnimationKey,
      ({ deltaTime, state: animation }) => {
        const elapsed = (animation?.elapsed ?? 0) + deltaTime;
        const progress = Math.min(elapsed / SNAP_BACK_ANIMATION_DURATION, 1);
        const remaining = 1 - easeOut(clamp(progress, 0, 1));
        this.app.batch(() =>
          this.app.setState((current) => {
            if (!current.scrollConstraints) {
              return null;
            }
            const resting = constrainScrollState(current);
            const zoom = resting.zoom.value;
            return {
              scrollX: resting.scrollX + (overscrollX * remaining) / zoom,
              scrollY: resting.scrollY + (overscrollY * remaining) / zoom,
              zoom: resting.zoom,
            };
          }),
        );
        return progress < 1 ? { elapsed } : null;
      },
      this.scheduler,
    );
  };

  private readonly snapBackDebounced = debounce(this.snapBack, SCROLL_CONSTRAINTS_SNAP_BACK_DELAY);

  private cancelTransition(): void {
    this.activeTransition = null;
    cancelAnimation(this.scrollToContentAnimationKey);
  }
}
