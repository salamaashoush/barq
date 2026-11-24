/**
 * A preview: a non-modal popover that opens on hover, keyboard focus or a long
 * press, and unlike a tooltip may hold interactive content.
 *
 * A link to a profile that shows the profile card while the pointer rests on
 * it is the case. Its timing is a tooltip's, warm-up and cool-down included,
 * and shared with the page's tooltips: moving from one preview to the next is
 * one gesture. Four things a tooltip does not need:
 *
 * - **The pointer has to reach it.** A tooltip may vanish as the pointer
 *   leaves the trigger; a preview with a button in it may not. The preview
 *   stays open while the pointer is anywhere in the SAFE AREA: the trigger,
 *   the popover, and the hull joining them, so a diagonal path across the gap
 *   does not close it, whatever side the popover is on.
 * - **The keyboard has to reach it.** Keyboard focus opens it after the delay
 *   rather than at once, so tabbing quickly down a list of links does not open
 *   and close a popover per stop. Once it is open, Tab from the trigger goes
 *   into it, and Tab out of it continues after the trigger.
 * - **A touch has no hover.** A long press opens it, and focus moves into the
 *   popover so a touch screen reader's cursor goes with it. The long press is
 *   described to assistive technology only while the user is on touch.
 * - **Escape closes it and gives focus back** to the trigger, which must not
 *   then reopen it on the focus it was given.
 *
 * The popover is `role="dialog"`. Its PLACEMENT element is the `<Popover>`
 * this renders; the dialog is the element inside it, which is the one that
 * takes the caller's class, style and id, as every popover part here does.
 */

import {
  cells,
  type Child,
  createContext,
  createEffect,
  getContext,
  provide,
  untrack,
} from "@barqjs/core";
import { isServer } from "@barqjs/web";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import { Popover, popoverStateProps, providePopoverTrigger } from "./dialog.tsx";
import {
  activeElement,
  contains,
  focusWithoutScrolling,
  ownerDocument,
  ownerWindow,
} from "./dom.ts";
import { focusableWalker, focusScope } from "./focus.ts";
import { focusWithin } from "./interactions/focus-events.ts";
import { hover } from "./interactions/hover.ts";
import type { BaseEvent } from "./interactions/keyboard.ts";
import { longPress } from "./interactions/long-press.ts";
import { getInteractionModality, isFocusVisible, modality } from "./interactions/modality.ts";
import type { ElementRef } from "./interactions/press.ts";
import { dismissButtonProps, type Placement } from "./overlays.ts";
import {
  tooltipTriggerState,
  type TooltipTriggerState,
  type TooltipTriggerStateOptions,
} from "./tooltip.tsx";
import {
  access,
  type DOMProps,
  filterDOMProps,
  fromProps,
  id,
  type MaybeAccessor,
  mergeProps,
  provideTriggerSlot,
  type StyleProps,
  styleProps,
} from "./utils.ts";

/** The event a focus scope sends before it puts focus back on an element. */
const RESTORE_EVENT = "barq-focus-scope-restore";

const LONG_PRESS_MESSAGE = "Long press to open preview";

// ---------------------------------------------------------------------------
// The safe area
// ---------------------------------------------------------------------------

interface Point {
  x: number;
  y: number;
}

/** Forgiveness around both boxes, for sub-pixel jitter and the gap between them. */
const PADDING = 8;

function rectContains(rect: DOMRect, point: Point): boolean {
  return (
    point.x >= rect.left - PADDING &&
    point.x <= rect.right + PADDING &&
    point.y >= rect.top - PADDING &&
    point.y <= rect.bottom + PADDING
  );
}

function rectCorners(rect: DOMRect): Point[] {
  const left = rect.left - PADDING;
  const right = rect.right + PADDING;
  const top = rect.top - PADDING;
  const bottom = rect.bottom + PADDING;
  return [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ];
}

function cross(origin: Point, a: Point, b: Point): number {
  return (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
}

/** The convex hull, by the monotone chain. */
function convexHull(points: Point[]): Point[] {
  const sorted = points.toSorted((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length < 3) return sorted;

  const lower: Point[] = [];
  for (const point of sorted) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2] as Point, lower[lower.length - 1] as Point, point) <= 0
    ) {
      lower.pop();
    }
    lower.push(point);
  }

  const upper: Point[] = [];
  for (const point of sorted.toReversed()) {
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2] as Point, upper[upper.length - 1] as Point, point) <= 0
    ) {
      upper.pop();
    }
    upper.push(point);
  }

  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

/** Ray casting. */
function isPointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i] as Point;
    const b = polygon[j] as Point;
    const crosses =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** Whether `point` is on the trigger, on the overlay, or in the hull joining the two. */
export function isPointInSafeArea(
  point: Point,
  triggerRect: DOMRect,
  overlayRect: DOMRect | null,
): boolean {
  if (rectContains(triggerRect, point)) return true;
  if (overlayRect === null) return false;
  if (rectContains(overlayRect, point)) return true;
  const hull = convexHull([...rectCorners(triggerRect), ...rectCorners(overlayRect)]);
  return hull.length >= 3 && isPointInPolygon(point, hull);
}

export interface SafeAreaOptions {
  triggerRef: ElementRef;
  overlayRef: ElementRef;
  isOpen: MaybeAccessor<boolean | undefined>;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  /** Told on every pointer move, and when the pointer leaves the document. */
  onSafeAreaChange: (isInSafeArea: boolean) => void;
}

/**
 * Track whether the pointer is in the region joining a trigger and its
 * overlay, while the overlay is open.
 */
export function safeArea(options: SafeAreaOptions): void {
  if (isServer) return;
  createEffect(
    () =>
      access(options.isDisabled) === true || access(options.isOpen) !== true
        ? null
        : ((access(options.triggerRef) as Element | null) ?? null),
    (trigger) => {
      if (trigger === null) return undefined;
      const onPointerMove: (event: PointerEvent) => void = (event) => {
        if (event.pointerType === "touch") return;
        const overlay = untrack(() => access(options.overlayRef)) as Element | null;
        options.onSafeAreaChange(
          isPointInSafeArea(
            { x: event.clientX, y: event.clientY },
            trigger.getBoundingClientRect(),
            overlay?.getBoundingClientRect() ?? null,
          ),
        );
      };
      function onPointerLeave(): void {
        return options.onSafeAreaChange(false);
      }

      const view = ownerWindow(trigger);
      const root = ownerDocument(trigger).documentElement;
      view.addEventListener("pointermove", onPointerMove);
      root.addEventListener("pointerleave", onPointerLeave);
      return () => {
        view.removeEventListener("pointermove", onPointerMove);
        root.removeEventListener("pointerleave", onPointerLeave);
      };
    },
  );
}

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

export interface PreviewTriggerOptions {
  /** The trigger, usually a link. */
  triggerRef: ElementRef;
  /** The popover's dialog element. */
  popoverRef: ElementRef;
  isDisabled?: MaybeAccessor<boolean | undefined>;
}

export interface PreviewTriggerResult {
  triggerProps: DOMProps;
  /** For the popover's dialog element. */
  popoverProps: DOMProps;
}

function isTouchCapable(): boolean {
  return typeof window !== "undefined" && "ontouchstart" in window;
}

export function previewTrigger(
  options: PreviewTriggerOptions,
  state: TooltipTriggerState,
): PreviewTriggerResult {
  const popoverId = id();
  function isDisabled(): boolean {
    return access(options.isDisabled) === true;
  }
  function trigger(): HTMLElement | null {
    return (access(options.triggerRef) as HTMLElement | null) ?? null;
  }
  function popover(): HTMLElement | null {
    return (access(options.popoverRef) as HTMLElement | null) ?? null;
  }

  // The focus a focus scope gives back on close must not reopen the preview.
  let ignoreFocus = false;
  // Opened by a long press: focus follows into the popover, for a touch screen reader.
  let shouldFocusOnOpen = false;
  let pointerInSafeArea = false;

  function keepOpen(): void {
    return state.open(true);
  }

  function checkClose(): void {
    if (pointerInSafeArea) return;
    const element = trigger();
    const active = element === null ? null : activeElement(ownerDocument(element));
    if (isFocusVisible() && (contains(element, active) || contains(popover(), active))) return;
    state.close();
  }

  if (!isServer) {
    createEffect(
      () => (state.isOpen() ? popover() : null),
      (element) => {
        if (element === null || !shouldFocusOnOpen) return;
        shouldFocusOnOpen = false;
        focusWithoutScrolling(element);
      },
    );

    createEffect(trigger, (element) => {
      if (element === null) return undefined;
      const onRestore: (event: Event) => void = (event) => {
        event.preventDefault();
        // Only for the length of the call: focus events are dispatched inside
        // it, and a flag left for the next event would swallow a real one
        // whenever the trigger was already focused and none came.
        ignoreFocus = true;
        try {
          element.focus();
        } finally {
          ignoreFocus = false;
        }
      };
      element.addEventListener(RESTORE_EVENT, onRestore);
      return () => element.removeEventListener(RESTORE_EVENT, onRestore);
    });
  }

  const { hoverProps } = hover({
    isDisabled,
    onHoverStart: () => {
      // What `tooltip.tsx` decides too: a hover that began because something
      // covering the trigger went away is not the pointer arriving.
      const how = getInteractionModality();
      if (how === "keyboard" || how === "virtual") return;
      pointerInSafeArea = true;
      state.open();
    },
    onHoverEnd: () => {
      // Before it opens, leaving cancels the warm-up. After, the safe area
      // decides, so the pointer can cross the gap to the popover.
      if (state.isOpen()) return;
      pointerInSafeArea = false;
      state.close();
    },
  });

  function onFocus(event: FocusEvent): void {
    if (isDisabled()) return;
    if (ignoreFocus) return;
    // A long press focuses the link on release, after focus already went into
    // the popover; it goes back there.
    const element = popover();
    if (state.isOpen() && element !== null && event.relatedTarget === element) {
      focusWithoutScrolling(element);
      return;
    }
    // After the delay, not at once: tabbing quickly through a list of links
    // must not open, and add the Tab stops of, a preview per link.
    if (isFocusVisible()) state.open();
  }

  function onKeyDown(event: KeyboardEvent): void {
    const element = popover();
    if (event.key === "Tab" && !event.shiftKey && state.isOpen() && element !== null) {
      const first = focusableWalker(element, { tabbable: true }).nextNode() as HTMLElement | null;
      if (first !== null) {
        event.preventDefault();
        first.focus();
        return;
      }
    } else if (event.key === "Escape") {
      const wasOpen = state.isOpen();
      state.close(true);
      // An Escape that closed the preview is spent; one that closed nothing
      // belongs to whatever is around the trigger.
      if (wasOpen) {
        event.preventDefault();
        return;
      }
    }
    (event as Partial<BaseEvent<KeyboardEvent>>).continuePropagation?.();
  }

  const how = modality();
  function shouldLongPress(): boolean {
    const current = how();
    return (current === "pointer" || current === "virtual" || current === null) && isTouchCapable();
  }

  const { longPressProps } = longPress({
    isDisabled,
    pointerType: "touch",
    accessibilityDescription: () => (shouldLongPress() ? LONG_PRESS_MESSAGE : undefined),
    onLongPress: () => {
      shouldFocusOnOpen = true;
      state.open(true);
    },
  });

  safeArea({
    triggerRef: options.triggerRef,
    overlayRef: options.popoverRef,
    isOpen: state.isOpen,
    isDisabled,
    onSafeAreaChange: (inside) => {
      if (inside === pointerInSafeArea) return;
      pointerInSafeArea = inside;
      if (inside) keepOpen();
      else checkClose();
    },
  });

  const { focusWithinProps } = focusWithin({
    onFocusWithin: keepOpen,
    onBlurWithin: checkClose,
  });

  const longPressDescription = longPressProps["aria-describedby"] as
    | MaybeAccessor<string | undefined>
    | undefined;

  return {
    triggerProps: mergeProps(hoverProps, longPressProps, {
      onFocus,
      onBlur: checkClose,
      onKeyDown,
      "aria-haspopup": "dialog",
      "aria-expanded": () => state.isOpen(),
      "aria-controls": () => (state.isOpen() ? popoverId() : undefined),
      "aria-describedby": () =>
        [access(longPressDescription), state.isOpen() ? popoverId() : undefined]
          .filter((each) => each !== undefined && each !== "")
          .join(" ") || undefined,
    }),
    popoverProps: mergeProps(focusWithinProps, { id: popoverId }),
  };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export interface PreviewTriggerValue {
  state: TooltipTriggerState;
  triggerRef: ReturnType<typeof makeRef<HTMLElement>>;
  popoverRef: ReturnType<typeof makeRef<HTMLElement>>;
  /** For a trigger this package does not provide. A `<Button>` takes them itself. */
  triggerProps: DOMProps;
  popoverProps: DOMProps;
}

const PreviewTriggerContext = createContext<PreviewTriggerValue | null>(null);

/** The enclosing {@link PreviewTrigger}. */
export function usePreviewTrigger(): PreviewTriggerValue {
  const value = getContext(PreviewTriggerContext);
  if (value === null || value === undefined) {
    throw new Error("This must be rendered inside a PreviewTrigger.");
  }
  return value;
}

export interface PreviewTriggerComponentProps {
  /** The trigger, and a {@link PreviewPopover}. */
  children?: Child;
  isOpen?: boolean;
  defaultOpen?: boolean;
  isDisabled?: boolean;
  /** @default 600 */
  delay?: number;
  /** @default 200 */
  closeDelay?: number;
  onOpenChange?: (isOpen: boolean) => void;
}

/**
 * ```tsx
 * <PreviewTrigger>
 *   <Link href="/people/salama">Salama</Link>
 *   <PreviewPopover aria-label="Salama's profile">
 *     <ProfileCard />
 *   </PreviewPopover>
 * </PreviewTrigger>
 * ```
 *
 * The trigger takes its props through the trigger slot, as a tooltip's does.
 * A control that does not read the slot spreads `usePreviewTrigger().triggerProps`
 * and sets `triggerRef` itself.
 */
export function PreviewTrigger(props: PreviewTriggerComponentProps) {
  const triggerRef = makeRef<HTMLElement>();
  const popoverRef = makeRef<HTMLElement>();
  const options = fromProps(cells(props));
  const state = tooltipTriggerState({
    ...(options as TooltipTriggerStateOptions),
    delay: () => props.delay ?? 600,
    closeDelay: () => props.closeDelay ?? 200,
  });

  const { triggerProps, popoverProps } = previewTrigger(
    { triggerRef, popoverRef, isDisabled: () => props.isDisabled },
    state,
  );

  const value: PreviewTriggerValue = {
    state,
    triggerRef,
    popoverRef,
    triggerProps,
    popoverProps,
  };

  function setOpen(open: boolean): void {
    return open ? state.open(true) : state.close(true);
  }

  return (
    <>
      {provide(
        PreviewTriggerContext,
        () => value,
        () => {
          provideTriggerSlot({ props: triggerProps, ref: triggerRef.set });
          return providePopoverTrigger(
            {
              triggerRef,
              state: {
                isOpen: state.isOpen,
                setOpen,
                open: () => setOpen(true),
                close: () => setOpen(false),
                toggle: () => setOpen(!state.isOpen()),
              },
              shouldContainFocus: false,
            },
            () => props.children,
          );
        },
      )}
    </>
  );
}

export interface PreviewPopoverComponentProps extends StyleProps {
  children?: Child;
  /** @default "bottom" */
  placement?: Placement;
  /** @default 8 */
  offset?: number;
  crossOffset?: number;
  shouldFlip?: boolean;
  containerPadding?: number;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  /** The dialog element. */
  ref?: RefTarget<HTMLDivElement>;
}

/** The preview itself, mounted while it is open. */
export function PreviewPopover(props: PreviewPopoverComponentProps) {
  return (
    <Popover
      placement={props.placement}
      offset={props.offset}
      crossOffset={props.crossOffset}
      shouldFlip={props.shouldFlip}
      containerPadding={props.containerPadding}
    >
      <PreviewBody {...props} />
    </Popover>
  );
}

/**
 * Inside the popover's `<Show>`, so the focus scope comes and goes with the
 * content: disposing it is what gives focus back to the trigger.
 */
function PreviewBody(props: PreviewPopoverComponentProps) {
  const preview = usePreviewTrigger();
  const state = preview.state;
  // Focus is given back on close, and Tab out of the preview continues after
  // the trigger, but nothing holds focus in and nothing is focused on opening:
  // the preview is not modal, and a hover must not take the keyboard.
  const scope = focusScope({ restoreFocus: true });

  const elementProps = mergeProps(
    preview.popoverProps,
    popoverStateProps(),
    filterDOMProps(fromProps(cells(props)), { global: true, labelable: true }),
    styleProps(cells(props)),
    {
      role: "dialog",
      tabIndex: -1,
      "data-skip-animation": state.shouldSkipAnimation,
      "data-testid": () => props["data-testid"],
    },
  );

  return (
    <>
      <span hidden ref={scope.startRef} />
      <div {...elementProps} ref={mergeRefs(preview.popoverRef.set, props.ref)}>
        {props.children}
        <button type="button" {...dismissButtonProps(() => state.close(true))} />
      </div>
      <span hidden ref={scope.endRef} />
    </>
  );
}
