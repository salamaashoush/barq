import {
  Dialog as AriaDialog,
  Heading,
  Modal,
  PortalProvider,
  useDialogDescription,
} from "@barqjs/aria/dialog";
import {
  canDragFrom,
  drawerBackground,
  drawerDrag,
  drawerKeyboard,
  nestedDrawerTransform,
  type DrawerDirection,
  type DrawerDrag,
  type DrawerSnapPoint,
} from "@barqjs/aria/drawer";
import { portalContainer, usePortalTarget } from "@barqjs/aria/overlays";
import { exitDuration } from "@barqjs/aria/presence";
import { provideTriggerSlot } from "@barqjs/aria/utils";
import {
  createContext,
  createEffect,
  getContext,
  getOwner,
  onCleanup,
  onSettled,
  provide,
  Show,
  untrack,
  type Child,
  type Incoming,
} from "@barqjs/core";
import { Portal } from "@barqjs/web";
import { firstThatWorks, layer } from "@barqjs/css";

import "../theme/layers.ts";
import { text } from "../lib/shared-text.ts";
import { overlayFamily, type OverlayRootProps } from "../lib/overlay.tsx";
import type { UiProps } from "../lib/props.ts";
import { handedOn, named, uiProps } from "../lib/slot.ts";
import { Button, type ButtonProps } from "./button.tsx";

const ui = layer("barq.ui");

/** Where a drawer that is not modal sits: over the page and out of its way. */
const passThrough = ui({
  position: "fixed",
  inset: "0px",
  zIndex: "50",
  pointerEvents: "none",
  "& > *": {
    pointerEvents: "auto",
  },
});

const overlay = ui({
  position: "fixed",
  inset: "0px",
  zIndex: "50",
  animation:
    "enter var(--ui-animation-duration, var(--ui-duration, 0.15s)) var(--ui-ease, ease) var(--ui-animation-delay, 0s) var(--ui-animation-iteration-count, 1) var(--ui-animation-direction, normal) var(--ui-animation-fill-mode, none)",
  backgroundColor: "color-mix(in srgb, #000 10%, transparent)",
  "--ui-enter-opacity": firstThatWorks("0", "calc(0/100)"),
  "@supports (color: color-mix(in lab, red, red))": {
    backgroundColor: "color-mix(in oklab, var(--color-black) 10%, transparent)",
  },
  "@supports (backdrop-filter: var(--tw))": {
    "&": {
      "--ui-backdrop-blur": "blur(var(--blur-xs))",
      "-webkit-backdrop-filter":
        "var(--ui-backdrop-blur,) var(--ui-backdrop-brightness,) var(--ui-backdrop-contrast,) var(--ui-backdrop-grayscale,) var(--ui-backdrop-hue-rotate,) var(--ui-backdrop-invert,) var(--ui-backdrop-opacity,) var(--ui-backdrop-saturate,) var(--ui-backdrop-sepia,)",
      backdropFilter:
        "var(--ui-backdrop-blur,) var(--ui-backdrop-brightness,) var(--ui-backdrop-contrast,) var(--ui-backdrop-grayscale,) var(--ui-backdrop-hue-rotate,) var(--ui-backdrop-invert,) var(--ui-backdrop-opacity,) var(--ui-backdrop-saturate,) var(--ui-backdrop-sepia,)",
    },
  },
  "[data-closed]": {
    animation:
      "exit var(--ui-animation-duration, var(--ui-duration, 0.15s)) var(--ui-ease, ease) var(--ui-animation-delay, 0s) var(--ui-animation-iteration-count, 1) var(--ui-animation-direction, normal) var(--ui-animation-fill-mode, none)",
    "--ui-animation-fill-mode": "forwards",
    "--ui-exit-opacity": firstThatWorks("0", "calc(0/100)"),
  },
  // How dim the page is while a pull or a snap point says "not fully". A
  // custom property scaling the colour rather than `opacity`, because this
  // element CONTAINS the drawer and opacity would fade the drawer with it.
  "[data-fading]": {
    backgroundColor:
      "color-mix(in srgb, #000 calc(10% * var(--drawer-overlay-opacity, 1)), transparent)",
    "@supports (color: color-mix(in lab, red, red))": {
      backgroundColor:
        "color-mix(in oklab, var(--color-black) calc(10% * var(--drawer-overlay-opacity, 1)), transparent)",
    },
    "@supports (backdrop-filter: var(--tw))": {
      "&": {
        "--ui-backdrop-blur": "blur(calc(var(--blur-xs) * var(--drawer-overlay-opacity, 1)))",
      },
    },
  },
});

/**
 * One class, four directions, keyed off `data-direction`.
 *
 * It was a `variants()` with a class per direction. Upstream writes one class
 * list with `data-[vaul-drawer-direction=…]` in it — the same shape with
 * Vaul's attribute name — and the side is a thing a style can select on rather
 * than a class only the component chooses.
 */
const content = ui("group/drawer-content", {
  position: "fixed",
  zIndex: "50",
  display: "flex",
  height: "auto",
  flexDirection: "column",
  backgroundColor: "var(--popover)",
  color: "var(--popover-foreground)",
  fontSize: "var(--text-sm)",
  lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
  animation:
    "enter var(--ui-animation-duration, var(--ui-duration, 0.15s)) var(--ui-ease, ease) var(--ui-animation-delay, 0s) var(--ui-animation-iteration-count, 1) var(--ui-animation-direction, normal) var(--ui-animation-fill-mode, none)",
  transitionProperty: "transform",
  transitionTimingFunction: firstThatWorks(
    "var(--ease-out)",
    "var(--ui-ease, var(--default-transition-timing-function))",
  ),
  transitionDuration: firstThatWorks(
    "300ms",
    "var(--ui-duration, var(--default-transition-duration))",
  ),
  "--ui-duration": "300ms",
  "--ui-ease": "var(--ease-out)",
  // A drag has to move the drawer and nothing else: without this the pointer
  // scrolls the page behind it on a touch screen and the drawer stays put.
  touchAction: "none",
  '[data-direction="top"]': {
    insetInline: "0px",
    top: "0px",
    marginBottom: "calc(var(--spacing) * 24)",
    maxHeight: "80vh",
    borderBottomRightRadius: "calc(var(--radius) * 1.4)",
    borderBottomLeftRadius: "calc(var(--radius) * 1.4)",
    borderBottomStyle: "var(--ui-border-style)",
    borderBottomWidth: "1px",
    "--ui-enter-translate-y": "-100%",
  },
  '[data-direction="bottom"]': {
    insetInline: "0px",
    bottom: "0px",
    marginTop: "calc(var(--spacing) * 24)",
    maxHeight: "80vh",
    borderTopLeftRadius: "calc(var(--radius) * 1.4)",
    borderTopRightRadius: "calc(var(--radius) * 1.4)",
    borderTopStyle: "var(--ui-border-style)",
    borderTopWidth: "1px",
    "--ui-enter-translate-y": "100%",
  },
  '[data-direction="right"]': {
    insetBlock: "0px",
    right: "0px",
    width: "calc(3 / 4 * 100%)",
    borderTopLeftRadius: "calc(var(--radius) * 1.4)",
    borderBottomLeftRadius: "calc(var(--radius) * 1.4)",
    borderLeftStyle: "var(--ui-border-style)",
    borderLeftWidth: "1px",
    "--ui-enter-translate-x": "100%",
  },
  '[data-direction="left"]': {
    insetBlock: "0px",
    left: "0px",
    width: "calc(3 / 4 * 100%)",
    borderTopRightRadius: "calc(var(--radius) * 1.4)",
    borderBottomRightRadius: "calc(var(--radius) * 1.4)",
    borderRightStyle: "var(--ui-border-style)",
    borderRightWidth: "1px",
    "--ui-enter-translate-x": "-100%",
  },
  "@media (width >= 40rem)": {
    '[data-direction="left"]': {
      maxWidth: "var(--container-sm)",
    },
    '[data-direction="right"]': {
      maxWidth: "var(--container-sm)",
    },
  },
  "[data-closed]": {
    animation:
      "exit var(--ui-animation-duration, var(--ui-duration, 0.15s)) var(--ui-ease, ease) var(--ui-animation-delay, 0s) var(--ui-animation-iteration-count, 1) var(--ui-animation-direction, normal) var(--ui-animation-fill-mode, none)",
    "--ui-animation-fill-mode": "forwards",
  },
  '[data-closed][data-direction="top"]': {
    "--ui-exit-translate-y": "-100%",
  },
  '[data-closed][data-direction="bottom"]': {
    "--ui-exit-translate-y": "100%",
  },
  '[data-closed][data-direction="right"]': {
    "--ui-exit-translate-x": "100%",
  },
  '[data-closed][data-direction="left"]': {
    "--ui-exit-translate-x": "-100%",
  },
});

const handle = ui({
  marginInline: "auto",
  marginTop: "calc(var(--spacing) * 4)",
  height: "calc(var(--spacing) * 2)",
  width: "100px",
  flexShrink: "0",
  borderRadius: "calc(infinity * 1px)",
  backgroundColor: "var(--muted)",
});

const header = ui({
  display: "flex",
  flexDirection: "column",
  gap: "calc(var(--spacing) * 0.5)",
  padding: "calc(var(--spacing) * 4)",
  // A drawer coming from the top or the bottom is the full width of the
  // viewport and reads down the middle; one from a side is a column.
  '[data-slot="drawer-content"][data-direction="bottom"] &': {
    textAlign: "center",
  },
  '[data-slot="drawer-content"][data-direction="top"] &': {
    textAlign: "center",
  },
  "@media (width >= 48rem)": {
    "&": {
      gap: "calc(var(--spacing) * 0.5)",
      textAlign: "start",
    },
  },
});

/** What `centered` writes when a caller overrides the direction's default. */
const headerCentered = ui({
  textAlign: "center",
});

const headerAligned = ui({
  textAlign: "start",
});

const footer = ui({
  marginTop: "auto",
  display: "flex",
  flexDirection: "column",
  gap: "calc(var(--spacing) * 2)",
  padding: "calc(var(--spacing) * 4)",
});

const title = ui(text.heading, text.medium, {
  fontSize: "var(--text-base)",
  lineHeight: "var(--ui-leading, var(--text-base--line-height))",
  color: "var(--foreground)",
});

const description = ui(text.sm, {
  color: "var(--muted-foreground)",
});

/** See `dialog.tsx`: the dialog's own element lays nothing out. */
const contents = ui({
  display: "contents",
});

const family = overlayFamily("Drawer");

interface DrawerValue {
  direction: () => DrawerDirection;
  snapPoints: () => readonly DrawerSnapPoint[] | undefined;
  activeSnapPoint: () => DrawerSnapPoint | null | undefined;
  setActiveSnapPoint: (point: DrawerSnapPoint | null) => void;
  fadeFromIndex: () => number | undefined;
  snapToSequentialPoint: () => boolean;
  dismissible: () => boolean;
  handleOnly: () => boolean;
  closeThreshold: () => number | undefined;
  shouldScaleBackground: () => boolean;
  setBackgroundColorOnScale: () => boolean;
  modal: () => boolean;
  autoFocus: () => boolean;
  fixed: () => boolean;
  repositionInputs: () => boolean;
  container: () => Element | null;
  onAnimationEnd: (open: boolean) => void;
  onDrag: (event: PointerEvent, progress: number) => void;
  onRelease: (event: PointerEvent, open: boolean) => void;
  onClose: () => void;
  /** The drawer this one was opened from inside of. */
  parent: DrawerSurface | null;
}

const DEFAULTS: DrawerValue = {
  direction: () => "bottom",
  snapPoints: () => undefined,
  activeSnapPoint: () => undefined,
  setActiveSnapPoint: () => {},
  fadeFromIndex: () => undefined,
  snapToSequentialPoint: () => false,
  dismissible: () => true,
  handleOnly: () => false,
  closeThreshold: () => undefined,
  shouldScaleBackground: () => false,
  setBackgroundColorOnScale: () => true,
  modal: () => true,
  autoFocus: () => true,
  fixed: () => false,
  repositionInputs: () => true,
  container: () => null,
  onAnimationEnd: () => {},
  onDrag: () => {},
  onRelease: () => {},
  onClose: () => {},
  parent: null,
};

const DrawerContext = createContext<DrawerValue | null>(null);

function useDrawer(): DrawerValue {
  return getContext(DrawerContext) ?? DEFAULTS;
}

/** What an open drawer offers the parts inside it, a nested drawer included. */
interface DrawerSurface {
  readonly drag: DrawerDrag;
  /** The handle was pressed, unless that press was the end of a drag. */
  press(): void;
  /** A drawer opened from inside this one has opened or closed. */
  nestedOpen(open: boolean): void;
  /** That drawer is `progress` of the way to closed under a pointer. */
  nestedDrag(progress: number): void;
}

const DrawerSurfaceContext = createContext<DrawerSurface | null>(null);

export interface DrawerProps extends OverlayRootProps {
  /** Which edge it comes from. @default "bottom" */
  direction?: DrawerDirection;
  /** The same as `isOpen`, under the name shadcn's drawer uses. */
  open?: boolean;
  /**
   * Whether anything but the caller can close it. @default true
   *
   * `false` refuses Escape, a press outside, a drag and `<DrawerClose>` alike,
   * so pair it with `open` and close it from your own handler.
   */
  dismissible?: boolean;
  /** Only the handle starts a drag, and the rest of the drawer is left to its content. */
  handleOnly?: boolean;
  /**
   * Where the drawer may rest, smallest first: a fraction of the viewport, or
   * pixels as `"148px"`.
   */
  snapPoints?: readonly DrawerSnapPoint[];
  /** The snap point it rests at. Leave it out and the drawer keeps its own. */
  activeSnapPoint?: DrawerSnapPoint | null;
  setActiveSnapPoint?: (point: DrawerSnapPoint | null) => void;
  /** The snap point from which the page behind is dimmed. @default the last */
  fadeFromIndex?: number;
  /** A throw moves one snap point at a time rather than to the end. */
  snapToSequentialPoint?: boolean;
  /** How much of the drawer a pull has to take away to close it. @default 0.25 */
  closeThreshold?: number;
  /**
   * Scale the page down behind the drawer.
   *
   * The page is the element carrying `data-drawer-wrapper` (or Vaul's
   * `data-vaul-drawer-wrapper`), which the application puts around its content.
   */
  shouldScaleBackground?: boolean;
  /** Paint the body black behind the scaled page. @default true */
  setBackgroundColorOnScale?: boolean;
  /** Set to `false` for a drawer inside another that should not push it back. */
  nested?: boolean;
  /**
   * `false` leaves the page behind usable: no overlay, Tab may leave, a press
   * outside does not close it, and nothing behind is hidden from a screen
   * reader. @default true
   */
  modal?: boolean;
  /**
   * Move focus into the drawer when it opens. @default true
   *
   * Vaul's default is `false`; a dialog that opens and leaves focus behind is
   * one a keyboard user has to go looking for.
   */
  autoFocus?: boolean;
  /** With a keyboard on screen, shorten the drawer rather than lift it. */
  fixed?: boolean;
  /** Keep a bottom drawer clear of an on-screen keyboard. @default true */
  repositionInputs?: boolean;
  /** Draw the drawer in this element rather than the body. */
  container?: Element | null;
  /** Leave the body's own style alone: the scaled page has no black behind it. */
  noBodyStyles?: boolean;
  /** Opening or closing has finished animating, with whether it is open. */
  onAnimationEnd?: (open: boolean) => void;
  /** Every pointer move of a drag, with how much of the drawer is off screen. */
  onDrag?: (event: PointerEvent, progress: number) => void;
  /** The end of a drag, with whether the drawer stayed open. */
  onRelease?: (event: PointerEvent, open: boolean) => void;
  /** It closed, however that happened. */
  onClose?: () => void;
}

/**
 * A dialog that a pointer can pull away.
 *
 * The modality is `<Dialog>`'s and the shape is `<Sheet>`'s. What makes it a
 * drawer is that dragging it toward its edge closes it, which is the gesture a
 * touch screen has instead of a close button.
 *
 * ```tsx
 * <Drawer>
 *   <DrawerTrigger><Button>Open</Button></DrawerTrigger>
 *   <DrawerContent>
 *     <DrawerHeader><DrawerTitle>Move goal</DrawerTitle></DrawerHeader>
 *     <DrawerFooter><DrawerClose>Done</DrawerClose></DrawerFooter>
 *   </DrawerContent>
 * </Drawer>
 * ```
 *
 * A `<Drawer>` written inside a `<DrawerContent>` is nested: the one beneath
 * steps back while it is open and follows its drag.
 */
export function Drawer(props: Incoming<DrawerProps>) {
  return (
    <family.Root {...props} isOpen={props.isOpen?.() ?? props.open?.()}>
      <DrawerProvider {...props}>
        <Show when={props.container?.() !== undefined} fallback={props.children}>
          <PortalProvider getContainer={() => props.container?.() ?? null}>
            {props.children}
          </PortalProvider>
        </Show>
      </DrawerProvider>
    </family.Root>
  );
}

/**
 * Its own component, because a `provide` callback that BUILDS the children is
 * the only place the scope exists. Inlined in `Drawer` the callback would run
 * where its siblings read and the direction would be the default everywhere.
 */
function DrawerProvider(props: Incoming<DrawerProps>) {
  const owner = getOwner();
  const surface = getContext(DrawerSurfaceContext) ?? null;
  const value: DrawerValue = {
    direction: () => props.direction?.() ?? "bottom",
    snapPoints: () => props.snapPoints?.(),
    activeSnapPoint: () => props.activeSnapPoint?.(),
    setActiveSnapPoint: (point) => props.setActiveSnapPoint?.()?.(point),
    fadeFromIndex: () => props.fadeFromIndex?.(),
    snapToSequentialPoint: () => props.snapToSequentialPoint?.() === true,
    dismissible: () => props.dismissible?.() !== false,
    handleOnly: () => props.handleOnly?.() === true,
    closeThreshold: () => props.closeThreshold?.(),
    shouldScaleBackground: () => props.shouldScaleBackground?.() === true,
    setBackgroundColorOnScale: () =>
      props.setBackgroundColorOnScale?.() !== false && props.noBodyStyles?.() !== true,
    modal: () => props.modal?.() !== false,
    autoFocus: () => props.autoFocus?.() !== false,
    fixed: () => props.fixed?.() === true,
    repositionInputs: () => props.repositionInputs?.() !== false,
    container: () => props.container?.() ?? null,
    onAnimationEnd: (open) => props.onAnimationEnd?.()?.(open),
    onDrag: (event, progress) => props.onDrag?.()?.(event, progress),
    onRelease: (event, open) => props.onRelease?.()?.(event, open),
    onClose: () => props.onClose?.()?.(),
    parent: props.nested?.() === false ? null : surface,
  };
  if (owner === null) return <>{props.children}</>;
  return provide(
    DrawerContext,
    () => value,
    () => props.children,
  );
}

const TriggerScope = createContext<true | null>(null);

export function DrawerTrigger(props: Incoming<{ children?: Child }>) {
  return (
    <family.Trigger>
      <DrawerTriggerSlot>{props.children}</DrawerTriggerSlot>
    </family.Trigger>
  );
}

/**
 * Names the control `drawer-trigger`, as upstream's `asChild` does.
 *
 * Inside a `provide`, because that is the only scope of its own a component
 * has: installed on the ambient owner the name would land beside the control
 * rather than above it.
 */
function DrawerTriggerSlot(props: Incoming<{ children?: Child }>) {
  return provide(
    TriggerScope,
    () => true as const,
    () => {
      provideTriggerSlot({ props: { "data-slot": "drawer-trigger" } });
      return props.children;
    },
  );
}

/**
 * Renders its children outside the tree while the drawer is open.
 *
 * `<DrawerContent>` already does this for itself. This is for a surface that is
 * not `<DrawerContent>`: something drawn over the page that the drawer's state
 * opens, with `<DrawerOverlay>` behind it.
 */
export function DrawerPortal(props: Incoming<{ children?: Child }>) {
  const { state } = family.use();
  const target = usePortalTarget();

  return (
    <Show when={state.isOpen()}>
      <Portal mount={portalContainer(target)}>{props.children}</Portal>
    </Show>
  );
}

/**
 * The dimmed page behind a surface of your own.
 *
 * `<DrawerContent>` draws one already, named the same, so this is only for use
 * inside `<DrawerPortal>`. It is decoration to a screen reader and a way out to
 * a pointer: pressing it closes the drawer unless the drawer says it cannot be
 * dismissed.
 */
export function DrawerOverlay(props: Incoming<UiProps>) {
  const { state } = family.use();
  const drawer = useDrawer();

  return (
    <div
      {...uiProps("drawer-overlay", overlay, props)}
      aria-hidden="true"
      data-state={() => (state.isOpen() ? "open" : "closed")}
      onClick={(event: MouseEvent) => {
        props.onClick?.()?.(event);
        if (drawer.dismissible()) state.close();
      }}
    />
  );
}

export interface DrawerHandleProps extends UiProps {
  /** Pressing it does nothing of its own: no next snap point, no closing. */
  preventCycle?: boolean;
}

/**
 * The grip.
 *
 * `<DrawerContent>` draws one on a bottom drawer; this is the same part for
 * anywhere else. Dragging it drags the drawer, which matters under
 * `handleOnly`, where it is the only thing that does. Pressing it goes to the
 * next snap point and closes the drawer after the last, or straight away when
 * there are none.
 *
 * It is hidden from assistive technology: the drawer is a dialog with Escape
 * and a close button, and a grip adds nothing to that but a nameless stop.
 */
export function DrawerHandle(props: Incoming<DrawerHandleProps>) {
  const surface = getContext(DrawerSurfaceContext) ?? null;

  return (
    <div
      {...uiProps("drawer-handle", handle, props)}
      aria-hidden="true"
      onClick={(event: MouseEvent) => {
        props.onClick?.()?.(event);
        if (props.preventCycle?.() === true) return;
        surface?.press();
      }}
    />
  );
}

export interface DrawerContentProps extends UiProps {
  /** Overrides the root's direction for this content. */
  direction?: DrawerDirection;
  /** @default true */
  showHandle?: boolean;
  /** @default true */
  isDismissable?: boolean;
  isKeyboardDismissDisabled?: boolean;
}

/** A control the pointer belongs to, whatever the drawer would rather do. */
function isControl(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest("input, textarea, select, [contenteditable], [role='slider']") !== null;
}

function isHandle(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[data-slot="drawer-handle"]') !== null;
}

export function DrawerContent(props: Incoming<DrawerContentProps>) {
  const { state } = family.use();
  const drawer = useDrawer();
  const direction = (): DrawerDirection => props.direction?.() ?? drawer.direction();
  const vertical = (): boolean => direction() === "top" || direction() === "bottom";
  const snaps = (): boolean => (drawer.snapPoints()?.length ?? 0) > 0;

  let element: HTMLElement | null = null;
  let underlay: HTMLElement | null = null;
  const section: { current: HTMLElement | null } = { current: null };
  let extent = 0;
  let pointer: PointerEvent | null = null;
  let draggedTo = 0;
  let nestedIsOpen = false;
  let announced = false;
  let stopKeyboard: () => void = () => {};
  let entered: ReturnType<typeof setTimeout> | undefined;

  const background = drawerBackground({
    direction,
    setBackgroundColor: () => drawer.setBackgroundColorOnScale(),
  });

  const drag = drawerDrag({
    direction,
    threshold: () => drawer.closeThreshold(),
    dismissible: () => drawer.dismissible(),
    snapPoints: () => drawer.snapPoints(),
    activeSnapPoint: () => drawer.activeSnapPoint(),
    onSnapPointChange: (point) => drawer.setActiveSnapPoint(point),
    fadeFromIndex: () => drawer.fadeFromIndex(),
    snapToSequentialPoint: () => drawer.snapToSequentialPoint(),
    onDrag: (progress) => {
      if (pointer !== null) drawer.onDrag(pointer, progress);
    },
    onRelease: (open) => {
      if (pointer !== null) drawer.onRelease(pointer, open);
    },
    onClose: () => state.close(),
  });

  /** How much of the drawer the pointer has taken away, which is what the page and a parent follow. */
  const pulled = (): number => (extent > 0 ? Math.min(1, Math.max(0, drag.offset()) / extent) : 0);

  const fade = (): void => {
    if (underlay === null) return;
    if (snaps() || drag.offset() !== 0) {
      underlay.setAttribute("data-fading", "");
      underlay.style.setProperty("--drawer-overlay-opacity", String(drag.overlayOpacity()));
    } else {
      underlay.removeAttribute("data-fading");
      underlay.style.removeProperty("--drawer-overlay-opacity");
    }
  };

  const place = (): void => {
    if (element === null) return;
    if (nestedIsOpen) return;
    const moved = drag.position();
    const axis = vertical() ? "Y" : "X";
    const sign = direction() === "bottom" || direction() === "right" ? 1 : -1;
    element.style.transform = moved === 0 ? "" : `translate${axis}(${String(moved * sign)}px)`;
    fade();
  };

  const measure = (): void => {
    if (element === null) return;
    const rect = element.getBoundingClientRect();
    extent = vertical() ? rect.height : rect.width;
    drag.measure(extent);
  };

  const release = (): void => {
    if (element === null) return;
    // The duration goes so the rule's own transition carries it to where it
    // rests, and the exit keyframes override it anyway when the drag closed it.
    element.style.transitionDuration = "";
    element.removeAttribute("data-dragging");
    place();
  };

  const unlisten = (): void => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
  };

  const onMove = (event: PointerEvent): void => {
    pointer = event;
    drag.move({ x: event.clientX, y: event.clientY });
    draggedTo = Math.max(draggedTo, Math.abs(drag.offset()));
    place();
    if (drawer.shouldScaleBackground()) background.drag(pulled());
    drawer.parent?.nestedDrag(pulled());
  };

  const onUp = (event: PointerEvent): void => {
    unlisten();
    pointer = event;
    const closed = drag.end();
    release();
    if (!closed) settle();
    pointer = null;
  };

  const onCancel = (): void => {
    unlisten();
    pointer = null;
    drag.cancel();
    release();
    settle();
  };

  /** The page and a parent drawer go back to how an open drawer leaves them. */
  const settle = (): void => {
    if (drawer.shouldScaleBackground()) background.settle();
    drawer.parent?.nestedDrag(0);
  };

  const onPointerDown = (event: PointerEvent): void => {
    props.onPointerDown?.()?.(event);
    draggedTo = 0;
    if (event.button !== 0 || isControl(event.target)) return;
    if (drawer.handleOnly() && !isHandle(event.target)) return;
    if (!drawer.dismissible() && !snaps()) return;
    const target = event.currentTarget;
    if (!(target instanceof HTMLElement)) return;
    if (!canDragFrom(event.target instanceof Element ? event.target : null, target, direction()))
      return;

    element = target;
    pointer = event;
    const rect = target.getBoundingClientRect();
    extent = vertical() ? rect.height : rect.width;
    drag.start({ x: event.clientX, y: event.clientY }, extent);
    target.setAttribute("data-dragging", "");
    // The rule's transition is what carries the snap BACK; during the drag it
    // would make the drawer lag a third of a second behind the finger.
    target.style.transitionDuration = "0s";

    // On the window rather than through `setPointerCapture`: a captured
    // pointer retargets its events to the drawer, so `click` is dispatched to
    // the drawer instead of the button that was pressed, and every control
    // inside stops working.
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  };

  const announce = (open: boolean): void => {
    if (announced === open) return;
    announced = open;
    if (drawer.shouldScaleBackground()) {
      if (open) background.open();
      else background.close();
    }
    drawer.parent?.nestedOpen(open);
    if (!open) drawer.onClose();
  };

  const mounted = (): void => {
    const found = section.current?.parentElement ?? null;
    if (found === null) return;
    element = found;
    underlay = found.parentElement;
    underlay?.setAttribute("data-state", "open");
    measure();
    place();
    announce(true);
    window.addEventListener("resize", onResize);
    // Vaul leaves a drawer that is not modal where it is.
    if (drawer.modal() && drawer.repositionInputs()) {
      stopKeyboard = drawerKeyboard(found, { fixed: () => drawer.fixed() });
    }
    const settled = found;
    entered = setTimeout(() => {
      entered = undefined;
      if (element === settled) drawer.onAnimationEnd(true);
    }, exitDuration(found));
  };

  const unmounted = (): void => {
    unlisten();
    window.removeEventListener("resize", onResize);
    stopKeyboard();
    stopKeyboard = () => {};
    clearTimeout(entered);
    entered = undefined;
    // Unmounted once the exit has finished drawing, which is the end of closing.
    drawer.onAnimationEnd(false);
    announce(false);
    element = null;
    underlay = null;
    nestedIsOpen = false;
  };

  const onResize = (): void => {
    measure();
    place();
  };

  // Where it rests is the caller's to move as well as the pointer's: a
  // controlled snap point, or a new list of them, lands here.
  createEffect(
    () => {
      drag.rest();
      drag.overlayOpacity();
      drag.position();
      direction();
      return drag.isDragging();
    },
    (dragging) => {
      if (!dragging) untrack(place);
    },
  );

  // On the way OUT, not once it has gone: the page scales back and a parent
  // comes forward while this one is still sliding away.
  createEffect(
    () => state.isOpen(),
    (open) => {
      if (open) return;
      underlay?.setAttribute("data-state", "closed");
      untrack(() => announce(false));
    },
  );

  const surface: DrawerSurface = {
    drag,
    press: () => {
      // A drag that ends over the handle is followed by a click on it.
      if (draggedTo > 2) return;
      drag.cycle();
    },
    nestedOpen: (open) => {
      nestedIsOpen = open;
      if (element === null) return;
      if (open) {
        element.setAttribute("data-nested-drawer-open", "");
        element.style.transform = nestedDrawerTransform(direction(), window.innerWidth, 0);
      } else {
        element.removeAttribute("data-nested-drawer-open");
        element.style.transitionDuration = "";
        place();
      }
    },
    nestedDrag: (progress) => {
      if (element === null || !nestedIsOpen) return;
      // No transition while it follows a pointer, and the rule's own again
      // once the pointer lets go.
      element.style.transitionDuration = progress > 0 ? "0s" : "";
      element.style.transform = nestedDrawerTransform(direction(), window.innerWidth, progress);
    },
  };

  const request = (open: boolean): void => {
    if (!open && !drawer.dismissible()) return;
    state.setOpen(open);
  };

  return (
    <Modal
      isOpen={state.isOpen()}
      onOpenChange={request}
      isDismissable={props.isDismissable?.() !== false && drawer.dismissible()}
      isKeyboardDismissDisabled={
        props.isKeyboardDismissDisabled?.() === true || !drawer.dismissible()
      }
      isNonModal={!drawer.modal()}
      autoFocus={drawer.autoFocus()}
      underlayClass={drawer.modal() ? overlay : passThrough}
      underlaySlot={drawer.modal() ? "drawer-overlay" : undefined}
      data-vaul-custom-container={drawer.container() === null ? "false" : "true"}
      {...handedOn(props)}
      class={ui(content, props.class?.(), props.className?.())}
      data-slot={props["data-slot"]?.() ?? "drawer-content"}
      dir={props.dir?.()}
      title={props.title?.()}
      data-direction={direction()}
      data-vaul-drawer-direction={direction()}
      data-state={state.isOpen() ? "open" : "closed"}
      onPointerDown={onPointerDown}
    >
      <AriaDialog {...named(props)} class={contents} ref={section}>
        <DrawerSurfaceProvider value={surface} onMount={mounted} onUnmount={unmounted}>
          <Show when={props.showHandle?.() !== false && direction() === "bottom"}>
            <DrawerHandle />
          </Show>
          {props.children}
        </DrawerSurfaceProvider>
      </AriaDialog>
    </Modal>
  );
}

/**
 * The surface's context, and the two moments the drawer's element exists
 * between.
 *
 * `onSettled` rather than the dialog's `ref`: a ref fires before its element
 * is in the document, and what the drawer needs is the element's PARENT, which
 * is the one that moves.
 */
function DrawerSurfaceProvider(
  props: Incoming<{
    value: DrawerSurface;
    onMount: () => void;
    onUnmount: () => void;
    children?: Child;
  }>,
) {
  onSettled(() => {
    props.onMount()();
  });
  onCleanup(() => {
    props.onUnmount()();
  });
  return provide(
    DrawerSurfaceContext,
    () => props.value(),
    () => props.children,
  );
}

export interface DrawerHeaderProps extends UiProps {
  /** @default true for a top or bottom drawer */
  centered?: boolean;
}

export function DrawerHeader(props: Incoming<DrawerHeaderProps>) {
  const drawer = useDrawer();
  // The direction already decides this in CSS; the prop only exists to say
  // otherwise, so it writes a class either way rather than leaving the
  // direction's rule in place under a `centered={false}`.
  const centered = (): boolean =>
    props.centered?.() ?? (drawer.direction() === "top" || drawer.direction() === "bottom");

  return (
    <div
      {...uiProps("drawer-header", ui(header, centered() ? headerCentered : headerAligned), props)}
    >
      {props.children}
    </div>
  );
}

export function DrawerFooter(props: Incoming<UiProps>) {
  return <div {...uiProps("drawer-footer", footer, props)}>{props.children}</div>;
}

/** The drawer's accessible name. */
export function DrawerTitle(props: Incoming<UiProps>) {
  return (
    <Heading
      {...props}
      slot="title"
      data-slot={props["data-slot"]?.() ?? "drawer-title"}
      class={ui(title, props.class?.(), props.className?.())}
    />
  );
}

export function DrawerDescription(props: Incoming<UiProps>) {
  const described = useDialogDescription();
  // The dialog points at this element, and only because the hook was called:
  // a description nothing references is read by whoever goes looking for it
  // and by nobody else.
  return (
    <p {...uiProps("drawer-description", description, props)} id={props.id?.() ?? described?.id()}>
      {props.children}
    </p>
  );
}

export interface DrawerCloseProps extends ButtonProps {}

/**
 * Closes the drawer, unless the drawer was told it cannot be dismissed, in
 * which case `onPress` is where the caller closes it.
 */
export function DrawerClose(props: Incoming<DrawerCloseProps>) {
  const { state } = family.use();
  const drawer = useDrawer();
  return (
    <Button
      {...props}
      data-slot={props["data-slot"]?.() ?? "drawer-close"}
      variant={props.variant?.() ?? "outline"}
      onPress={(event) => {
        props.onPress?.()?.(event);
        if (drawer.dismissible()) state.close();
      }}
    />
  );
}
