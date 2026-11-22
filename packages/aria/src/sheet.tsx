/**
 * Sheets: an overlay that slides in from an edge of the viewport and is swiped
 * away.
 *
 * The gesture is the browser's own scrolling, which is upstream's design and
 * the reason this shares no engine with `drawer.ts`. The sheet sits in a stage
 * one viewport into a scroll container two viewports long. Opening scrolls the
 * stage on screen, a swipe scrolls it off, scroll snapping decides where a
 * release comes to rest, and the moment the content has left the viewport an
 * `IntersectionObserver` closes the sheet. Momentum, rubber-banding and the
 * hand-off between a list inside the sheet and the sheet itself are the
 * platform's, run off the main thread. `drawer.ts` measures a pointer and
 * decides in script, with Vaul's thresholds and a snap point that is a share of
 * the viewport; a snap point here is a CSS length the browser resolves against
 * the sheet. The two agree on nothing that could be shared without making one
 * of them wrong.
 *
 * Swipe and stack animations are CSS keyframes bound to the content's view
 * timeline, so they track the finger exactly. Where view timelines are missing
 * (Firefox) they play over a fixed time while the sheet enters and leaves.
 */

import {
  cells,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  For,
  getContext,
  isBlock,
  omit,
  onCleanup,
  onSettled,
  provide,
  Show,
  untrack,
  type Accessor,
  type Child,
  type Incoming,
} from "@barqjs/core";
import { Portal } from "@barqjs/web";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";

import { Dialog, type DialogComponentProps } from "./dialog.tsx";
import {
  activeElement,
  contains,
  focusWithoutScrolling,
  isScrollable,
  ownerDocument,
  ownerWindow,
} from "./dom.ts";
import { focusScope } from "./focus.ts";
import { useLocale } from "./i18n.ts";
import {
  dismissButtonProps,
  followOpen,
  modalOverlay,
  overlayTrigger,
  overlayTriggerState,
  portalContainer,
  usePortalTarget,
  type OverlayTriggerState,
} from "./overlays.ts";
import { isIOS, isSafari } from "./platform.ts";
import { exitDuration } from "./presence.ts";
import {
  callback,
  filterDOMProps,
  fromProps,
  clearTriggerSlot,
  mergeProps,
  provideTriggerSlot,
  type DOMProps,
  type StyleProps,
} from "./utils.ts";

export type SheetPosition = "bottom" | "top" | "left" | "right" | "center";
export type SheetSwipeDirection = "bottom" | "top" | "vertical" | "left" | "right" | "horizontal";
/** Pixels as a number, or any CSS length. A percentage is of the sheet's own size. */
export type SheetSnapPoint = number | string;

type Axis = "x" | "y";
type Style = Record<string, string | number | undefined>;

/** What every part of a sheet can read, each field live. */
export interface SheetRenderState {
  /** `start` and `end` already resolved for the reading direction. */
  position: Accessor<SheetPosition>;
  swipeDirection: Accessor<SheetSwipeDirection>;
  /** Its place among the open sheets, 0 for the one at the back. */
  stackIndex: Accessor<number>;
  /** Whether another sheet is open in front of it. */
  hasDescendants: Accessor<boolean>;
  /** Resting at its last snap point, wholly on screen. */
  isExpanded: Accessor<boolean>;
  isEntering: Accessor<boolean>;
  isExiting: Accessor<boolean>;
  close: () => void;
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

interface SwipeConfig {
  axis: Axis;
  /** Can be swiped off the top or left edge. */
  before: boolean;
  /** Can be swiped off the bottom or right edge. */
  after: boolean;
  /** Distance between the two extreme scroll positions, in viewport percent. */
  maxScroll: number;
  /** The scroll position at which it is fully entered, in viewport percent. */
  enteredScroll: number;
  /** Offset of the scroll container along the axis, in viewport percent. */
  containerOffset: number;
  viewRange: "cover" | "exit" | "entry";
  viewDirection: "normal" | "reverse" | "alternate";
  viewIterations: number;
}

function swipeConfig(direction: SheetSwipeDirection): SwipeConfig {
  const axis: Axis =
    direction === "top" || direction === "bottom" || direction === "vertical" ? "y" : "x";
  const before =
    direction === "top" ||
    direction === "left" ||
    direction === "vertical" ||
    direction === "horizontal";
  const after =
    direction === "bottom" ||
    direction === "right" ||
    direction === "vertical" ||
    direction === "horizontal";
  // A sheet that leaves only toward the start edge rests at scroll 0 and is
  // dismissed toward the far end; every other one rests a viewport in.
  const startOnly = before && !after;
  // In view-timeline terms `entry` is the scrollport's end edge and `exit` its
  // start edge. Each direction is chosen so progress 0 is gone and 1 is
  // entered, matching keyframes written from exited to entered. A sheet that
  // crosses both edges runs the same keyframes twice over `cover`, alternating,
  // so an author never writes a symmetric 0/50/100 variant.
  return {
    axis,
    before,
    after,
    maxScroll: (Number(before) + Number(after)) * 100,
    enteredScroll: startOnly ? 0 : 100,
    containerOffset: startOnly ? -100 : 0,
    viewRange: before && after ? "cover" : before ? "exit" : "entry",
    viewDirection: before && after ? "alternate" : before ? "reverse" : "normal",
    viewIterations: before && after ? 2 : 1,
  };
}

function resolveDirection<T extends string>(
  value: T | "start" | "end",
  direction: "ltr" | "rtl",
): T | "left" | "right" {
  if (value === "start") return direction === "rtl" ? "right" : "left";
  if (value === "end") return direction === "rtl" ? "left" : "right";
  return value;
}

/** The resting `[x, y]` flex alignment for each position, whatever the swipe. */
const POSITION_ALIGNMENT: Record<SheetPosition, [string, string]> = {
  top: ["center", "flex-start"],
  bottom: ["center", "flex-end"],
  left: ["flex-start", "center"],
  right: ["flex-end", "center"],
  center: ["center", "center"],
};

/**
 * iOS Safari draws past the viewport it reports, behind its toolbar, even with
 * the toolbar collapsed. A bottom sheet is pushed that much further out so it
 * is wholly gone before it counts as gone. The 58px is upstream's measurement
 * of the toolbar.
 */
function viewportPadding(after: boolean, axis: Axis): string {
  return after && axis === "y" && isIOS() && isSafari() ? "calc(100lvh - 100svh + 58px)" : "0px";
}

function toLength(point: SheetSnapPoint): string {
  return typeof point === "number" ? `${point}px` : point;
}

/** A `calc()` resolved to pixels by laying it out, since nothing else can. */
function calcToPx(value: string, doc: Document): string {
  if (!value.startsWith("calc(")) return value;
  const probe = doc.createElement("div");
  probe.inert = true;
  probe.style.position = "absolute";
  probe.style.top = "0px";
  probe.style.left = "0px";
  probe.style.contain = "strict";
  probe.style.height = value;
  doc.body.append(probe);
  const height = ownerWindow(probe).getComputedStyle(probe).height;
  probe.remove();
  return height;
}

function reduceMotion(view: Window): boolean {
  return (
    typeof view.matchMedia === "function" &&
    view.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function supportsViewTimeline(): boolean {
  return (
    typeof CSS !== "undefined" &&
    typeof CSS.supports === "function" &&
    CSS.supports("animation-timeline: view()")
  );
}

function scrollAlongAxis(element: HTMLElement, axis: Axis, value: number, smooth = false): void {
  const behavior: ScrollBehavior | undefined =
    smooth && !reduceMotion(ownerWindow(element)) ? "smooth" : undefined;
  element.scrollTo(axis === "y" ? { top: value, behavior } : { left: value, behavior });
}

/**
 * Move the scroller so the sheet's leading edge sits at the viewport edge,
 * with snapping off so the browser does not pull it back. Returns whether it
 * moved: an enter animation that starts a viewport away spends its first part
 * moving nothing anyone can see.
 */
function skipOffscreenTravel(
  scroller: HTMLElement,
  content: HTMLElement,
  axis: Axis,
  viewport: number,
): boolean {
  const rect = content.getBoundingClientRect();
  const start = axis === "y" ? rect.top : rect.left;
  const end = axis === "y" ? rect.bottom : rect.right;
  const delta = start > viewport ? start - viewport : end < 0 ? end : 0;
  if (delta === 0) return false;

  scroller.style.scrollSnapType = "none";
  if (axis === "y") scroller.scrollTop += delta;
  else scroller.scrollLeft += delta;
  return true;
}

/** Rest a snap marker where scroll snapping would, less or plus its scroll margin. */
function scrollDetentIntoView(
  scroller: HTMLElement,
  marker: HTMLElement,
  axis: Axis,
  align: "start" | "end",
  smooth: boolean,
): void {
  const behavior: ScrollBehavior =
    smooth && !reduceMotion(ownerWindow(scroller)) ? "smooth" : "auto";
  const markerRect = marker.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();
  const style = ownerWindow(marker).getComputedStyle(marker);
  if (axis === "y") {
    const top =
      align === "start"
        ? markerRect.top -
          scrollerRect.top +
          scroller.scrollTop -
          (Number.parseFloat(style.scrollMarginTop) || 0)
        : markerRect.bottom -
          scrollerRect.top +
          scroller.scrollTop +
          (Number.parseFloat(style.scrollMarginBottom) || 0) -
          scroller.clientHeight;
    scroller.scrollTo({ top, behavior });
    return;
  }
  const left =
    align === "start"
      ? markerRect.left -
        scrollerRect.left +
        scroller.scrollLeft -
        (Number.parseFloat(style.scrollMarginLeft) || 0)
      : markerRect.right -
        scrollerRect.left +
        scroller.scrollLeft +
        (Number.parseFloat(style.scrollMarginRight) || 0) -
        scroller.clientWidth;
  scroller.scrollTo({ left, behavior });
}

function waitFor(target: EventTarget, type: string): Promise<void> {
  return new Promise((resolve) => {
    target.addEventListener(type, () => resolve(), { once: true });
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// The stack of open sheets
// ---------------------------------------------------------------------------

interface StackEntry {
  id: string;
  timelineName: string;
  range: string;
  direction: string;
  iterations: number;
}

let sheetStack: readonly StackEntry[] = [];
const [stackVersion, publishStack] = createSignal(0, { equals: false, ownedWrite: true });

function readStack(): readonly StackEntry[] {
  stackVersion();
  return sheetStack;
}

/**
 * A parent sheet's stack animation runs on its CHILD's view timeline, which is
 * declared inside the child and is out of the parent's reach. `timeline-scope`
 * on the root hoists every open sheet's timeline to where any element can name
 * it.
 */
function writeStack(doc: Document): void {
  doc.documentElement.style.setProperty(
    "timeline-scope",
    sheetStack.map((entry) => entry.timelineName).join(", "),
  );
  publishStack(0);
}

function registerSheet(entry: StackEntry, doc: Document): () => void {
  sheetStack = [...sheetStack, entry];
  writeStack(doc);
  return () => {
    sheetStack = sheetStack.filter((other) => other.id !== entry.id);
    writeStack(doc);
  };
}

// ---------------------------------------------------------------------------
// Contexts
// ---------------------------------------------------------------------------

interface SheetTriggerValue {
  state: OverlayTriggerState;
}

const SheetTriggerContext = createContext<SheetTriggerValue | null>(null);

/** The triggers whose sheets enclose this point, outermost first. */
const EnclosingTriggersContext = createContext<readonly SheetTriggerValue[]>([]);

interface SheetContextValue {
  config: Accessor<SwipeConfig>;
  position: Accessor<SheetPosition>;
  swipeDirection: Accessor<SheetSwipeDirection>;
  snapPoints: Accessor<readonly SheetSnapPoint[] | undefined>;
  preventDismissal: Accessor<boolean>;
  isNonModal: Accessor<boolean>;
  isEntering: Accessor<boolean>;
  isExiting: Accessor<boolean>;
  timelineName: string;
  descendants: Accessor<readonly StackEntry[]>;
  /** The `data-*` every part writes. */
  dataProps: DOMProps;
  /** Escape and focus-within, for the sheet's own element. */
  modalProps: DOMProps;
  setModal: (element: HTMLDivElement | null) => void;
  modal: Accessor<HTMLDivElement | null>;
  state: SheetRenderState;
  /** The triggers whose sheets enclose this one, its own last. */
  triggers: readonly SheetTriggerValue[];
}

const SheetContext = createContext<SheetContextValue | null>(null);

function useSheetContext(part: string): SheetContextValue {
  const value = getContext(SheetContext);
  if (value === null || value === undefined) {
    throw new Error(`A ${part} must be rendered inside a SheetOverlay.`);
  }
  return value;
}

/** The enclosing sheet's state, or `null` outside one. */
export function useSheet(): SheetRenderState | null {
  return getContext(SheetContext)?.state ?? null;
}

function SheetProvider(props: { value: SheetContextValue; children?: Child }) {
  return provide(
    SheetContext,
    () => props.value,
    () =>
      provide(
        EnclosingTriggersContext,
        () => props.value.triggers,
        () => props.children as unknown,
      ),
  );
}

type RenderChildren = (state: SheetRenderState) => Child;

/** A children callback, told from content by declaring its parameter. */
function renderFunction(children: unknown): RenderChildren | null {
  if (typeof children !== "function") return null;
  if (children.length > 0) return children as RenderChildren;
  if (isBlock(children)) return null;
  const inner: unknown = (children as () => unknown)();
  return typeof inner === "function" && inner.length > 0 ? (inner as RenderChildren) : null;
}

/**
 * The callback runs once. Its fields are accessors that its JSX follows; a
 * read in its body must not rebuild everything it returned.
 */
function renderChildren(children: unknown, state: SheetRenderState): Child {
  const render = renderFunction(children);
  return render === null ? (children as Child) : untrack(() => render(state));
}

// ---------------------------------------------------------------------------
// SheetTrigger
// ---------------------------------------------------------------------------

export interface SheetTriggerProps {
  children?: Child;
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

/**
 * A button and the sheet it opens, sharing one piece of state.
 *
 * ```tsx
 * <SheetTrigger>
 *   <Button>Open</Button>
 *   <SheetOverlay>
 *     <SheetBackdrop />
 *     <Sheet>
 *       <SheetContent>
 *         <Heading slot="title">Order</Heading>
 *       </SheetContent>
 *     </Sheet>
 *   </SheetOverlay>
 * </SheetTrigger>
 * ```
 */
export function SheetTrigger(props: Incoming<SheetTriggerProps>) {
  const options = fromProps(props);
  const state = overlayTriggerState(options);
  const { triggerProps } = overlayTrigger({ type: "dialog" }, state);
  const value: SheetTriggerValue = { state };

  return provide(
    SheetTriggerContext,
    () => value,
    () => {
      provideTriggerSlot({ props: triggerProps });
      return props.children;
    },
  );
}

// ---------------------------------------------------------------------------
// SheetOverlay
// ---------------------------------------------------------------------------

export interface SheetOverlayProps extends StyleProps {
  children?: Child | ((state: SheetRenderState) => Child);
  /**
   * The edge it is anchored to. `start` and `end` follow the reading direction.
   * @default "bottom"
   */
  position?: "bottom" | "top" | "left" | "right" | "start" | "end" | "center";
  /**
   * Which way it can be swiped. `start` and `end` follow the reading direction.
   * @default the position, or `"vertical"` for a centred sheet
   */
  swipeDirection?:
    | "bottom"
    | "top"
    | "vertical"
    | "left"
    | "right"
    | "start"
    | "end"
    | "horizontal";
  /**
   * Where it stops, as how much of it is visible. It opens at the first and
   * can always be swiped to fully open.
   */
  snapPoints?: readonly SheetSnapPoint[];
  /**
   * No swipe, Escape or outside press closes it. It still moves between its
   * snap points, and closes when told to. @default false
   */
  preventDismissal?: boolean;
  /**
   * Leave the page behind usable: nothing behind is hidden or inert, the page
   * scrolls, focus may leave and a press outside does not close it. Escape
   * still does. @default false
   */
  isNonModal?: boolean;
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  /** Veto an outside press for a particular element. */
  shouldCloseOnInteractOutside?: (element: Element) => boolean;
  ref?: RefTarget<HTMLDivElement>;
}

interface OverlayShared {
  state: OverlayTriggerState;
  triggers: readonly SheetTriggerValue[];
  id: string;
  timelineName: string;
  position: Accessor<SheetPosition>;
  swipeDirection: Accessor<SheetSwipeDirection>;
  config: Accessor<SwipeConfig>;
  snapPoints: Accessor<readonly SheetSnapPoint[] | undefined>;
  preventDismissal: Accessor<boolean>;
  isNonModal: Accessor<boolean>;
  isExiting: Accessor<boolean>;
  shouldCloseOnInteractOutside: (element: Element) => boolean;
  domProps: DOMProps;
  className: Accessor<string | undefined>;
  style: Accessor<Style | undefined>;
  ref: RefTarget<HTMLDivElement> | undefined;
  attach: (body: OverlayBody | null) => void;
}

interface OverlayBody {
  enter(): void;
  exit(): Promise<void>;
}

/**
 * The layer a sheet and its backdrop live in, portalled over the page.
 *
 * Inside a {@link SheetTrigger} it uses the trigger's state, unless it is given
 * `isOpen` or `defaultOpen` of its own, which a sheet without a trigger needs.
 */
export function SheetOverlay(props: SheetOverlayProps) {
  clearTriggerSlot();
  const options = fromProps(cells(props));
  const trigger = getContext(SheetTriggerContext) ?? null;
  const enclosing = getContext(EnclosingTriggersContext) ?? [];
  const local = overlayTriggerState(options);
  const target = usePortalTarget();
  const locale = useLocale();

  const own = (): boolean =>
    props.isOpen !== undefined || props.defaultOpen !== undefined || trigger === null;
  const current = (): OverlayTriggerState => (own() || trigger === null ? local : trigger.state);
  const state: OverlayTriggerState = {
    isOpen: () => current().isOpen(),
    setOpen: (open) => current().setOpen(open),
    open: () => current().open(),
    close: () => current().close(),
    toggle: () => current().toggle(),
  };

  const position = createMemo((): SheetPosition =>
    resolveDirection(props.position ?? "bottom", locale().direction),
  );
  const swipeDirection = createMemo((): SheetSwipeDirection => {
    const given = props.swipeDirection;
    if (given !== undefined) return resolveDirection(given, locale().direction);
    const at = position();
    return at === "center" ? "vertical" : at;
  });
  const config = createMemo(() => swipeConfig(swipeDirection()));

  const id = createUniqueId();
  const [isPresent, setPresent] = createSignal(state.isOpen());
  const [isExiting, setExiting] = createSignal(false);
  let body: OverlayBody | null = null;
  let exits = 0;

  followOpen(state.isOpen, (open) => {
    if (open) {
      exits++;
      if (isExiting()) {
        setExiting(false);
        body?.enter();
      }
      setPresent(true);
      return undefined;
    }
    if (!isPresent()) return undefined;
    if (body === null) {
      setPresent(false);
      return undefined;
    }
    const exit = ++exits;
    setExiting(true);
    void body.exit().then(() => {
      if (exit !== exits) return;
      setExiting(false);
      setPresent(false);
    });
    return undefined;
  });

  const shared: OverlayShared = {
    state,
    triggers: trigger === null ? enclosing : [...enclosing, trigger],
    id,
    timelineName: `--sheet-timeline-${id.replace(/[^\w-]/g, "")}`,
    position,
    swipeDirection,
    config,
    snapPoints: () => props.snapPoints,
    preventDismissal: () => props.preventDismissal === true,
    isNonModal: () => props.isNonModal === true,
    isExiting,
    shouldCloseOnInteractOutside: (element) =>
      callback(options.shouldCloseOnInteractOutside)?.(element) ?? true,
    domProps: filterDOMProps(options, { global: true }),
    className: () => props.class ?? props.className,
    style: () => props.style,
    ref: props.ref,
    attach: (next) => {
      body = next;
    },
  };

  return (
    <Show when={isPresent()}>
      <Portal mount={portalContainer(target)}>
        <SheetOverlayBody shared={shared}>{props.children}</SheetOverlayBody>
      </Portal>
    </Show>
  );
}

interface ViewportBox {
  width: number;
  height: number;
  pageWidth: number;
  pageHeight: number;
}

function measureViewport(doc: Document): ViewportBox {
  const view = ownerWindow(doc.documentElement);
  const root = doc.documentElement;
  const visual = view.visualViewport;
  const scrolling = isScrollable(doc.body) ? doc.body : (doc.scrollingElement ?? root);
  const box = scrolling.getBoundingClientRect();
  return {
    // The visual viewport's width can include the scrollbar gutter.
    width: visual ? Math.min(visual.width * visual.scale, root.clientWidth) : root.clientWidth,
    height: visual ? visual.height * visual.scale : root.clientHeight,
    // A fractional page size makes Firefox add scrollbars.
    pageWidth: scrolling.scrollWidth - (box.width % 1),
    pageHeight: scrolling.scrollHeight - (box.height % 1),
  };
}

/**
 * Everything that exists only while the sheet is on screen.
 *
 * A component of its own because the focus scope has to be created with the
 * content it contains: disposing this subtree is what puts focus back.
 */
function SheetOverlayBody(props: { shared: OverlayShared; children?: Child | RenderChildren }) {
  const shared = props.shared;
  const overlayRef = makeRef<HTMLDivElement>();
  const modalRef = makeRef<HTMLDivElement>();
  const [isEntering, setEntering] = createSignal(true);
  const [isExpanded, setExpanded] = createSignal(false);
  const [viewport, setViewport] = createSignal<ViewportBox | null>(
    typeof document === "undefined" ? null : measureViewport(document),
  );

  let visible = false;
  let seen = false;
  let disposed = false;
  let enters = 0;
  let hidden: (() => void)[] = [];

  const scope = focusScope({
    contain: () => !shared.isNonModal() && !shared.isExiting(),
    restoreFocus: true,
    autoFocus: false,
  });

  // While the sheet slides in, nothing behind it is hidden and focus stays
  // where it was: moving the VoiceOver cursor into the sheet scrolls, and on
  // iOS that interrupts the scroll that is bringing it on screen.
  const { overlayProps, modalProps } = modalOverlay(
    {
      isDismissable: () => !shared.preventDismissal() && !shared.isNonModal(),
      isKeyboardDismissDisabled: shared.preventDismissal,
      isScrollDisabled: shared.isNonModal,
      isNonModal: shared.isNonModal,
      isEntering,
      shouldCloseOnEscapeAnywhere: shared.isNonModal,
      shouldCloseOnInteractOutside: shared.shouldCloseOnInteractOutside,
    },
    shared.state,
    modalRef,
  );

  const stackIndex = createMemo(() =>
    Math.max(
      0,
      readStack().findIndex((entry) => entry.id === shared.id),
    ),
  );
  const descendants = createMemo((): readonly StackEntry[] => {
    const all = readStack();
    const at = all.findIndex((entry) => entry.id === shared.id);
    return at < 0 ? [] : all.slice(at + 1);
  });

  const renderState: SheetRenderState = {
    position: shared.position,
    swipeDirection: shared.swipeDirection,
    stackIndex,
    hasDescendants: () => descendants().length > 0,
    isExpanded,
    isEntering,
    isExiting: shared.isExiting,
    close: () => shared.state.close(),
  };

  const dataProps: DOMProps = {
    "data-position": shared.position,
    "data-swipe-direction": shared.swipeDirection,
    "data-expanded": () => (isExpanded() ? "" : undefined),
    "data-stack-index": () => String(stackIndex()),
    "data-has-descendants": () => (descendants().length > 0 ? "" : undefined),
  };

  const viewportExtent = (element: Element, config: SwipeConfig): number => {
    const view = ownerWindow(element);
    return config.axis === "y"
      ? view.innerHeight +
          Number.parseFloat(
            calcToPx(viewportPadding(config.after, config.axis), ownerDocument(element)),
          )
      : view.innerWidth;
  };

  const enter = (): void => {
    const overlay = overlayRef();
    if (overlay === null) return;
    const scroller = overlay.querySelector<HTMLElement>("[data-sheet-scroll]");
    if (scroller === null) return;
    setEntering(true);
    const attempt = ++enters;
    const config = shared.config();
    const content = overlay.querySelector<HTMLElement>("[data-sheet-content]");
    const initial = overlay.querySelector<HTMLElement>("[data-sheet-initial]");
    const extent = viewportExtent(overlay, config);
    const view = ownerWindow(overlay);

    const scrollToRest = (smooth: boolean): void => {
      if (initial === null) {
        scrollAlongAxis(scroller, config.axis, (config.enteredScroll / 100) * extent, smooth);
      } else {
        scrollDetentIntoView(
          scroller,
          initial,
          config.axis,
          config.after ? "start" : "end",
          smooth,
        );
      }
    };

    // Resting at scroll 0 means mounting already entered: jump to the exit.
    if (config.enteredScroll === 0) {
      scrollAlongAxis(scroller, config.axis, (config.maxScroll / 100) * extent);
    }
    const snapType = scroller.style.scrollSnapType;
    const skipped =
      content !== null &&
      !reduceMotion(view) &&
      skipOffscreenTravel(scroller, content, config.axis, extent);

    const start = (): void => {
      if (disposed || attempt !== enters) return;
      scrollToRest(true);
      // Listened for only once the smooth scroll has begun, so the jump's own
      // `scrollend` does not end the entrance.
      void waitFor(scroller, "scrollend").then(() => {
        if (skipped) scroller.style.scrollSnapType = snapType;
        if (disposed || attempt !== enters) return;
        entered();
      });
    };

    // A jump and a smooth scroll in the same task can leave the browser stuck
    // at the jumped-to position.
    if (config.enteredScroll === 0 || skipped) view.requestAnimationFrame(start);
    else start();
  };

  const entered = (): void => {
    setEntering(false);
    const content = overlayRef()?.querySelector<HTMLElement>("[data-sheet-content]") ?? null;
    if (content !== null && !contains(content, activeElement(ownerDocument(content)))) {
      focusWithoutScrolling(content);
    }
  };

  const exit = (): Promise<void> => {
    enters++;
    const overlay = overlayRef();
    if (overlay === null) return Promise.resolve();
    const scroller = overlay.querySelector<HTMLElement>("[data-sheet-scroll]");
    const config = shared.config();

    // An exit rule is selected by `data-exiting`, which the binding writes a
    // flush from now. Measured a task later so the rule is in the cascade.
    const animations = delay(0).then(() => {
      const modal = modalRef();
      const longest = Math.max(exitDuration(overlay), modal === null ? 0 : exitDuration(modal));
      return longest > 0 ? delay(longest) : undefined;
    });

    let motion: Promise<void>;
    if (!visible || scroller === null) {
      // Swiped away already. Desktop Safari keeps the momentum going, and a
      // scroll that outlives the sheet lands on the one behind it. A sheet
      // never seen on screen was not swiped, and no `scrollend` is coming.
      motion =
        scroller !== null && seen && isSafari() && !isIOS()
          ? waitFor(scroller, "scrollend").then(() => delay(50))
          : Promise.resolve();
    } else {
      const extent = viewportExtent(overlay, config);
      const furthest = (config.maxScroll / 100) * extent;
      const at = config.axis === "y" ? scroller.scrollTop : scroller.scrollLeft;
      const to =
        config.after && !config.before
          ? 0
          : config.before && !config.after
            ? furthest
            : at > (config.enteredScroll / 100) * extent
              ? furthest
              : 0;
      scrollAlongAxis(scroller, config.axis, to, true);
      motion = new Promise((resolve) => hidden.push(resolve));
    }

    return Promise.all([motion, animations]).then(() => undefined);
  };

  shared.attach({ enter, exit });
  onCleanup(() => {
    disposed = true;
    shared.attach(null);
  });

  onSettled(() => {
    const overlay = overlayRef();
    if (overlay === null) return undefined;
    const doc = ownerDocument(overlay);
    const view = ownerWindow(overlay);
    const config = shared.config();
    const scroller = overlay.querySelector<HTMLElement>("[data-sheet-scroll]");

    // A sheet resting at scroll 0 mounts already entered. It is moved out
    // before the observer looks, or the observer would see it entered and
    // then close it when the entrance jumps it out.
    if (config.enteredScroll === 0 && scroller !== null) {
      scrollAlongAxis(
        scroller,
        config.axis,
        (config.maxScroll / 100) * (config.axis === "y" ? view.innerHeight : view.innerWidth),
      );
    }

    const observer =
      typeof view.IntersectionObserver === "function"
        ? new view.IntersectionObserver(
            (entries) => {
              const entry = entries[0];
              if (entry === undefined) return;
              // `data-expanded` lets a stylesheet make the content scroll only
              // once the sheet is fully open; until then a swipe on the
              // content grows the sheet, as on iOS.
              setExpanded(entry.intersectionRatio >= 1);
              visible = entry.intersectionRatio > 0;
              seen ||= visible;
              if (seen && entry.intersectionRatio <= 0) {
                shared.state.close();
                const waiting = hidden;
                hidden = [];
                for (const resolve of waiting) resolve();
              }
            },
            {
              threshold: [0, 1],
              rootMargin: `0px 0px ${calcToPx(viewportPadding(config.after, config.axis), doc)} 0px`,
            },
          )
        : null;
    const content = overlay.querySelector("[data-sheet-content]");
    if (observer !== null && content !== null) observer.observe(content);

    const unregister = registerSheet(
      {
        id: shared.id,
        timelineName: shared.timelineName,
        range: config.viewRange,
        direction: config.viewDirection,
        iterations: config.viewIterations,
      },
      doc,
    );

    const resize = (): void => {
      const visual = view.visualViewport;
      if (visual !== null && visual.scale > 1) return;
      setViewport(measureViewport(doc));
    };
    const resizes: EventTarget = view.visualViewport ?? view;
    resizes.addEventListener("resize", resize);
    setViewport(measureViewport(doc));

    enter();

    return () => {
      observer?.disconnect();
      unregister();
      resizes.removeEventListener("resize", resize);
    };
  });

  const setModal = (element: HTMLDivElement | null): void => {
    modalRef.set(element);
  };

  const value: SheetContextValue = {
    config: shared.config,
    position: shared.position,
    swipeDirection: shared.swipeDirection,
    snapPoints: shared.snapPoints,
    preventDismissal: shared.preventDismissal,
    isNonModal: shared.isNonModal,
    isEntering,
    isExiting: shared.isExiting,
    timelineName: shared.timelineName,
    descendants,
    dataProps,
    modalProps: mergeProps(overlayProps, modalProps),
    setModal,
    modal: modalRef,
    state: renderState,
    triggers: shared.triggers,
  };

  const style = (): Style => {
    const box = viewport();
    return {
      // Absolute rather than fixed, or iOS Safari clips it.
      position: "absolute",
      top: 0,
      left: 0,
      width: "max(var(--page-width), 100vw)",
      height: "max(var(--page-height), 100dvh)",
      overflow: "clip",
      pointerEvents: shared.isNonModal() ? "none" : undefined,
      ...shared.style(),
      "--sheet-scroll-padding-x": "calc(100vw - var(--visual-viewport-width))",
      "--sheet-scroll-padding-y": "calc(100dvh - var(--visual-viewport-height))",
      "--visual-viewport-width": box === null ? undefined : `${box.width}px`,
      "--visual-viewport-height": box === null ? undefined : `${box.height}px`,
      "--page-width": box === null ? undefined : `${box.pageWidth}px`,
      "--page-height": box === null ? undefined : `${box.pageHeight}px`,
    };
  };

  const elementProps = mergeProps(shared.domProps, dataProps, {
    class: shared.className,
    style,
    "data-entering": () => (isEntering() ? "" : undefined),
    "data-exiting": () => (shared.isExiting() ? "" : undefined),
  });

  return (
    <div {...elementProps} ref={mergeRefs(overlayRef.set, shared.ref)}>
      <span hidden ref={scope.startRef} />
      <SheetProvider value={value}>{renderChildren(props.children, renderState)}</SheetProvider>
      <span hidden ref={scope.endRef} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Swipe animations
// ---------------------------------------------------------------------------

interface SwipeAnimationProps {
  /** A CSS `@keyframes` name, played from exited to entered as the sheet moves. */
  swipeAnimation?: string;
  /**
   * The snap points, by index, between which it plays.
   * @default the whole of the sheet's travel
   */
  swipeAnimationRange?: { start?: number; end?: number };
}

function swipeAnimationStyle(
  sheet: SheetContextValue,
  animation: string | undefined,
  range: { start?: number; end?: number } | undefined,
): Style {
  if (animation === undefined || animation === "") return {};
  const direction = sheet.swipeDirection();
  const config = sheet.config();
  const points = sheet.snapPoints();

  let start = range?.start === undefined ? "0%" : toLength(points?.[range.start] ?? "0%");
  let end = range?.end === undefined ? "100%" : toLength(points?.[range.end] ?? "100%");
  if (direction === "top" || direction === "left") {
    [start, end] = [`calc(100% - ${end})`, `calc(100% - ${start})`];
  }

  if (supportsViewTimeline()) {
    return {
      animationName: animation,
      animationTimeline: sheet.timelineName,
      animationDirection: config.viewDirection,
      animationIterationCount: String(config.viewIterations),
      animationFillMode: "both",
      animationRange: `${config.viewRange} ${start} ${config.viewRange} ${end}`,
      animationTimingFunction: "linear",
      animationComposition: "replace",
    };
  }
  const exiting = sheet.isExiting();
  if (!sheet.isEntering() && !exiting) return {};
  return {
    animationName: animation,
    animationDirection: exiting ? "reverse" : "normal",
    animationDuration: "300ms",
    animationIterationCount: "1",
    animationFillMode: "both",
    animationTimingFunction: "linear",
    animationComposition: "replace",
  };
}

// ---------------------------------------------------------------------------
// Sheet
// ---------------------------------------------------------------------------

export interface SheetProps extends StyleProps, SwipeAnimationProps {
  children?: Child | ((state: SheetRenderState) => Child);
  /**
   * A CSS `@keyframes` name played once for every sheet open in front of this
   * one, on that sheet's swipe, so a stack recedes as it grows.
   */
  stackAnimation?: string;
  /** Pad the sheet past the viewport edge, so a rubber-band pull shows more sheet. */
  overscrollPadding?: boolean;
  ref?: RefTarget<HTMLDivElement>;
}

/**
 * The surface that slides, inside the scroll container that moves it.
 *
 * Its element is the modal: what Escape is heard on, what a press outside is
 * measured against, and what stays visible while the page behind is hidden.
 */
export function Sheet(props: SheetProps) {
  const sheet = useSheetContext("Sheet");
  const options = fromProps(cells(props));
  const locale = useLocale();
  const scrollRef = makeRef<HTMLDivElement>();
  const stageRef = makeRef<HTMLDivElement>();
  const config = sheet.config;

  const viewport = (): string => (config().axis === "y" ? "100dvh" : "100dvw");
  const isTransitioning = (): boolean => sheet.isEntering() || sheet.isExiting();
  const hasSnapPoints = (): boolean =>
    (sheet.snapPoints()?.length ?? 0) > 0 && config().before !== config().after;
  // Enter and exit still need the room to leave, so the clamp holds only while
  // the sheet is at rest.
  const isClamped = (): boolean => sheet.preventDismissal() && !isTransitioning();

  const travel = snapPointTravel(stageRef, sheet.modal, config, () =>
    sheet.preventDismissal() && hasSnapPoints() ? (sheet.snapPoints() ?? []).join(" ") : null,
  );
  // At least 1px, so there is still somewhere to scroll and the browser still
  // bounces when there is nowhere to snap to.
  const clampedTravel = (): string => `${hasSnapPoints() ? Math.max(1, travel()) : 1}px`;

  const stageStart = (): string => {
    const { after, axis } = config();
    return isClamped() && after
      ? clampedTravel()
      : `calc(${viewport()} + ${viewportPadding(after, axis)})`;
  };
  const endMarker = (): string => {
    const { before, after } = config();
    if (isClamped() && before && after) return `calc(${stageStart()} + ${viewport()} + 1px)`;
    if (isClamped() && before) return `calc(${clampedTravel()} + ${viewport()})`;
    return `calc(${stageStart()} + ${viewport()}${before && after ? ` + ${viewport()}` : ""})`;
  };

  // The clamped geometry moves the stage. The scroll position moves with it,
  // so the sheet stays where it was on screen.
  let stageOffset: number | null = null;
  let wasClamped = untrack(isClamped);
  createEffect(
    () => [isClamped(), stageStart(), stageRef(), scrollRef(), config().axis] as const,
    ([clamped, , stage, scroller, axis]) => {
      if (stage === null || scroller === null) return;
      const vertical = axis === "y";
      const offset = vertical ? stage.offsetTop : stage.offsetLeft;
      if (clamped !== wasClamped && stageOffset !== null && offset !== stageOffset) {
        if (vertical) scroller.scrollTop += offset - stageOffset;
        else scroller.scrollLeft += offset - stageOffset;
      }
      wasClamped = clamped;
      stageOffset = offset;
    },
  );

  const overscrollInset = (): string | undefined =>
    props.overscrollPadding === true && sheet.position() === sheet.swipeDirection()
      ? config().axis === "y"
        ? "100vh"
        : "100vw"
      : undefined;

  const ownStyle = (): Style => {
    const style: Style = {
      position: "relative",
      pointerEvents: sheet.isNonModal() ? "auto" : undefined,
      ...swipeAnimationStyle(sheet, props.swipeAnimation, props.swipeAnimationRange),
    };

    const inset = overscrollInset();
    if (inset !== undefined) {
      const side = sheet.position();
      const edge = side.charAt(0).toUpperCase() + side.slice(1);
      style[`padding${edge}`] = inset;
      style[`margin${edge}`] = `-${inset}`;
    }

    const stacked = sheet.descendants();
    if (props.stackAnimation && stacked.length > 0 && supportsViewTimeline()) {
      const name = props.stackAnimation;
      const perSheet: Record<string, (entry: StackEntry) => string> = {
        animationName: () => name,
        animationTimeline: (entry) => entry.timelineName,
        animationDirection: (entry) => entry.direction,
        animationIterationCount: (entry) => String(entry.iterations),
        animationFillMode: () => "both",
        animationRange: (entry) => entry.range,
        animationComposition: () => "accumulate",
        animationTimingFunction: () => "linear",
      };
      for (const [key, value] of Object.entries(perSheet)) {
        style[key] = [style[key], ...stacked.map(value)].filter(Boolean).join(", ");
      }
    }
    return style;
  };

  const scrollerStyle = (): Style => {
    const { axis, containerOffset } = config();
    const view = typeof window === "undefined" ? null : window;
    const scrollX = view === null ? 0 : untrack(() => view.scrollX);
    const scrollY = view === null ? 0 : untrack(() => view.scrollY);
    return {
      position: "absolute",
      top: axis === "y" ? `calc(${scrollY}px + ${containerOffset}dvh)` : `${scrollY}px`,
      left: axis === "x" ? `calc(${scrollX}px + ${containerOffset}dvw)` : `${scrollX}px`,
      height: axis === "y" ? "200dvh" : "100dvh",
      width: axis === "x" ? "200dvw" : "100dvw",
      overflowX: axis === "x" ? "auto" : "hidden",
      overflowY: axis === "y" ? "auto" : "hidden",
      // Only off while a sheet that cannot be dismissed changes geometry.
      // Changing it during a swipe away cancels Safari's momentum scroll
      // without the `scrollend` the exit waits for.
      scrollSnapType: sheet.preventDismissal() && isTransitioning() ? "none" : `${axis} mandatory`,
      overscrollBehaviorY: axis === "y" ? "contain" : "none",
      overscrollBehaviorX: axis === "x" ? "contain" : "none",
      scrollbarWidth: "none",
      // The scroll geometry is physical whatever the reading direction.
      direction: "ltr",
    };
  };

  const stageStyle = (): Style => {
    const { axis } = config();
    const [x, y] = POSITION_ALIGNMENT[sheet.position()];
    return {
      position: "absolute",
      top: axis === "y" ? stageStart() : 0,
      left: axis === "x" ? stageStart() : 0,
      height: "100dvh",
      width: "100dvw",
      display: "flex",
      flexDirection: axis === "y" ? "column" : "row",
      alignItems: axis === "y" ? x : y,
      justifyContent: axis === "y" ? y : x,
    };
  };

  const markersStyle = (): Style => {
    const inset = overscrollInset();
    return {
      position: "absolute",
      inset: 0,
      ...(inset === undefined ? null : { [sheet.position()]: inset }),
      pointerEvents: "none",
    };
  };

  const elementProps = mergeProps(
    sheet.modalProps,
    filterDOMProps(options, { global: true }),
    sheet.dataProps,
    {
      class: () => props.class ?? props.className,
      style: () => ({ direction: locale().direction, ...props.style, ...ownStyle() }),
      "data-entering": () => (sheet.isEntering() ? "" : undefined),
      "data-exiting": () => (sheet.isExiting() ? "" : undefined),
    },
  );

  const scrollerProps: DOMProps = { "data-sheet-scroll": "", style: scrollerStyle };
  const dismissProps = dismissButtonProps(() => sheet.state.close());
  const stageProps: DOMProps = { style: stageStyle };
  const markersProps: DOMProps = { style: markersStyle };

  return (
    <div {...scrollerProps} ref={scrollRef.set}>
      <SnapPoint
        point={0}
        align={isClamped() && config().after ? "none" : "start"}
        axis={config().axis}
      />
      <Show when={config().before && config().after}>
        <SnapPoint point={stageStart()} align="start" axis={config().axis} />
      </Show>
      <div {...stageProps} ref={stageRef.set}>
        <div {...elementProps} ref={mergeRefs(sheet.setModal, props.ref)}>
          <Show when={!sheet.preventDismissal() && !sheet.isNonModal()}>
            <button type="button" {...dismissProps} />
          </Show>
          <Show when={sheet.snapPoints()}>
            <div {...markersProps}>
              <For each={sheet.snapPoints() ?? []} keyed={false}>
                {(point, index) => (
                  <DetentPoint
                    point={point()}
                    axis={config().axis}
                    after={config().after}
                    isInitial={index === 0}
                  />
                )}
              </For>
            </div>
          </Show>
          {renderChildren(props.children, sheet.state)}
        </div>
      </div>
      <SnapPoint
        point={endMarker()}
        align={isClamped() && config().before ? "none" : "end"}
        axis={config().axis}
      />
    </div>
  );
}

/** A full viewport long, so its start or end edge lands on the snap position. */
function SnapPoint(props: { point: SheetSnapPoint; align: "start" | "end" | "none"; axis: Axis }) {
  const style = (): Style => {
    const offset = toLength(props.point);
    const main = props.axis === "y" ? "dvh" : "dvw";
    return {
      position: "absolute",
      top: props.axis === "y" ? offset : 0,
      left: props.axis === "x" ? offset : 0,
      scrollSnapAlign: props.align,
      width: props.axis === "x" ? `100${main}` : "1px",
      height: props.axis === "y" ? `100${main}` : "1px",
    };
  };
  const elementProps: DOMProps = { style };
  return <div {...elementProps} />;
}

/**
 * A snap marker inside the sheet, `point` in from its leading edge.
 *
 * It moves with the sheet, so snapping it with a scroll margin of one viewport
 * rests it at the viewport's edge with exactly `point` of the sheet on screen.
 * The point is an inset rather than part of the margin, which is what makes a
 * percentage one of the sheet's size.
 */
function DetentPoint(props: {
  point: SheetSnapPoint;
  axis: Axis;
  after: boolean;
  isInitial: boolean;
}) {
  const style = (): Style => {
    const viewport = props.axis === "y" ? "100dvh" : "100dvw";
    const offset = toLength(props.point);
    const edge: Style =
      props.axis === "y"
        ? props.after
          ? { top: offset, left: 0, scrollMarginTop: viewport }
          : { bottom: offset, left: 0, scrollMarginBottom: viewport }
        : props.after
          ? { top: 0, left: offset, scrollMarginLeft: viewport }
          : { top: 0, right: offset, scrollMarginRight: viewport };
    return {
      position: "absolute",
      width: "1px",
      height: "1px",
      scrollSnapAlign: props.after ? "start" : "end",
      ...edge,
    };
  };
  const elementProps: DOMProps = {
    "data-sheet-detent": "",
    "data-sheet-initial": () => (props.isInitial ? "" : undefined),
    style,
  };
  return <div {...elementProps} />;
}

/**
 * How far a sheet that cannot be dismissed travels from its smallest snap
 * point to fully open: from that point's marker to the stage's exit edge.
 *
 * Measured from the rendered markers, so a snap point may be any CSS length,
 * and from layout offsets rather than boxes, so a swipe or stack transform
 * does not move the answer.
 */
function snapPointTravel(
  stage: Accessor<HTMLElement | null>,
  sheet: Accessor<HTMLElement | null>,
  config: Accessor<SwipeConfig>,
  key: Accessor<string | null>,
): Accessor<number> {
  const [travel, setTravel] = createSignal(0);

  followOpen(
    () => [key(), stage(), sheet(), config().axis, config().after] as const,
    ([points, stageElement, sheetElement, axis, after]) => {
      if (points === null || stageElement === null || sheetElement === null) return undefined;

      const measure = (): void => {
        const stageSize = axis === "y" ? stageElement.clientHeight : stageElement.clientWidth;
        let max = 0;
        for (const marker of sheetElement.querySelectorAll<HTMLElement>("[data-sheet-detent]")) {
          let offset = 0;
          let at: HTMLElement | null = marker;
          while (at !== null && at !== stageElement) {
            offset += axis === "y" ? at.offsetTop : at.offsetLeft;
            at = (at.offsetParent as HTMLElement | null) ?? null;
          }
          const size = axis === "y" ? marker.offsetHeight : marker.offsetWidth;
          max = Math.max(max, after ? stageSize - offset : offset + size);
        }
        setTravel(max);
      };

      measure();
      const view = ownerWindow(stageElement);
      if (typeof view.ResizeObserver !== "function") return undefined;
      const observer = new view.ResizeObserver(measure);
      observer.observe(stageElement);
      observer.observe(sheetElement);
      return () => observer.disconnect();
    },
  );

  return travel;
}

// ---------------------------------------------------------------------------
// SheetBackdrop
// ---------------------------------------------------------------------------

export interface SheetBackdropProps extends StyleProps, SwipeAnimationProps {
  ref?: RefTarget<HTMLDivElement>;
}

/** What covers the page behind the sheet. A press on it is a press outside. */
export function SheetBackdrop(props: SheetBackdropProps) {
  const sheet = useSheetContext("SheetBackdrop");
  const options = fromProps(cells(props));

  const elementProps = mergeProps(filterDOMProps(options, { global: true }), sheet.dataProps, {
    class: () => props.class ?? props.className,
    style: () => ({
      ...swipeAnimationStyle(sheet, props.swipeAnimation, props.swipeAnimationRange),
      position: "absolute",
      inset: 0,
      ...props.style,
    }),
    "data-entering": () => (sheet.isEntering() ? "" : undefined),
    "data-exiting": () => (sheet.isExiting() ? "" : undefined),
  });

  return <div {...elementProps} ref={mergeRefs(props.ref)} />;
}

// ---------------------------------------------------------------------------
// SheetContent
// ---------------------------------------------------------------------------

export interface SheetContentProps extends Omit<DialogComponentProps, "children"> {
  children?: Child | ((state: SheetRenderState) => Child);
}

/**
 * The dialog inside the sheet, and the subject of the view timeline every
 * swipe and stack animation runs on.
 *
 * The timeline is the content's rather than the sheet's because overscroll
 * padding leaves the sheet never wholly on screen. The inset crops the scroll
 * container down to the viewport that is actually visible.
 */
export function SheetContent(props: SheetContentProps) {
  const sheet = useSheetContext("SheetContent");

  const style = (): Style => {
    const { axis, before, after } = sheet.config();
    const viewport = axis === "y" ? "100dvh" : "100dvw";
    return {
      ...props.style,
      width: "100%",
      height: "100%",
      viewTimelineName: sheet.timelineName,
      viewTimelineAxis: axis,
      viewTimelineInset: before && !after ? `${viewport} 0` : `0 ${viewport}`,
    };
  };

  return (
    <Dialog {...omit(props, "children", "style")} style={style()} data-sheet-content="">
      {renderChildren(props.children, sheet.state)}
    </Dialog>
  );
}
