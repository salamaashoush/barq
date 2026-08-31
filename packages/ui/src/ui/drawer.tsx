import { Dialog as AriaDialog, Heading, Modal, useDialogDescription } from "@barqjs/aria/dialog";
import { canDragFrom, drawerDrag, type DrawerDirection } from "@barqjs/aria/drawer";
import {
  context,
  getContext,
  getOwner,
  provide,
  Show,
  type Child,
  type Incoming,
} from "@barqjs/core";
import { firstThatWorks, layer, variants } from "@barqjs/css";

import "../theme/layers.ts";
import { text } from "../lib/shared-text.ts";
import { overlayFamily, type OverlayRootProps } from "../lib/overlay.tsx";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";
import { Button, type ButtonProps } from "./button.tsx";

const ui = layer("barq.ui");

const overlay = ui({
  position: "fixed",
  inset: "0px",
  zIndex: "50",
  animation:
    "enter var(--ui-animation-duration, var(--ui-duration, 0.15s)) var(--ui-ease, ease) var(--ui-animation-delay, 0s) var(--ui-animation-iteration-count, 1) var(--ui-animation-direction, normal) var(--ui-animation-fill-mode, none)",
  backgroundColor: "color-mix(in srgb, #000 50%, transparent)",
  "--ui-enter-opacity": firstThatWorks("0", "calc(0/100)"),
  "@supports (color: color-mix(in lab, red, red))": {
    backgroundColor: "color-mix(in oklab, var(--color-black) 50%, transparent)",
  },
  "[data-closed]": {
    animation:
      "exit var(--ui-animation-duration, var(--ui-duration, 0.15s)) var(--ui-ease, ease) var(--ui-animation-delay, 0s) var(--ui-animation-iteration-count, 1) var(--ui-animation-direction, normal) var(--ui-animation-fill-mode, none)",
    "--ui-exit-opacity": firstThatWorks("0", "calc(0/100)"),
  },
});

export const drawerVariants = variants({
  base: ui({
    position: "fixed",
    zIndex: "50",
    display: "flex",
    height: "auto",
    flexDirection: "column",
    backgroundColor: "var(--background)",
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
    "[data-closed]": {
      animation:
        "exit var(--ui-animation-duration, var(--ui-duration, 0.15s)) var(--ui-ease, ease) var(--ui-animation-delay, 0s) var(--ui-animation-iteration-count, 1) var(--ui-animation-direction, normal) var(--ui-animation-fill-mode, none)",
    },
    // A drag has to move the drawer and nothing else: without this the pointer
    // scrolls the page behind it on a touch screen and the drawer stays put.
    touchAction: "none",
  }),
  variants: {
    direction: {
      top: ui({
        insetInline: "0px",
        top: "0px",
        marginBottom: "calc(var(--spacing) * 24)",
        maxHeight: "80vh",
        borderBottomRightRadius: "var(--radius)",
        borderBottomLeftRadius: "var(--radius)",
        borderBottomStyle: "var(--ui-border-style)",
        borderBottomWidth: "1px",
        "--ui-enter-translate-y": "-100%",
        "[data-closed]": {
          "--ui-exit-translate-y": "-100%",
        },
      }),
      bottom: ui({
        insetInline: "0px",
        bottom: "0px",
        marginTop: "calc(var(--spacing) * 24)",
        maxHeight: "80vh",
        borderTopLeftRadius: "var(--radius)",
        borderTopRightRadius: "var(--radius)",
        borderTopStyle: "var(--ui-border-style)",
        borderTopWidth: "1px",
        "--ui-enter-translate-y": "100%",
        "[data-closed]": {
          "--ui-exit-translate-y": "100%",
        },
      }),
      right: ui({
        insetBlock: "0px",
        right: "0px",
        width: "calc(3 / 4 * 100%)",
        borderLeftStyle: "var(--ui-border-style)",
        borderLeftWidth: "1px",
        "--ui-enter-translate-x": "100%",
        "[data-closed]": {
          "--ui-exit-translate-x": "100%",
        },
        "@media (width >= 40rem)": {
          "&": {
            maxWidth: "var(--container-sm)",
          },
        },
      }),
      left: ui({
        insetBlock: "0px",
        left: "0px",
        width: "calc(3 / 4 * 100%)",
        borderRightStyle: "var(--ui-border-style)",
        borderRightWidth: "1px",
        "--ui-enter-translate-x": "-100%",
        "[data-closed]": {
          "--ui-exit-translate-x": "-100%",
        },
        "@media (width >= 40rem)": {
          "&": {
            maxWidth: "var(--container-sm)",
          },
        },
      }),
    },
  },
  defaults: { direction: "bottom" },
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
  "@media (width >= 48rem)": {
    "&": {
      gap: "calc(var(--spacing) * 1.5)",
      textAlign: "left",
    },
  },
});

/** A drawer coming from an edge with no side is read down the middle. */
const headerCentered = ui({
  textAlign: "center",
});

const footer = ui({
  marginTop: "auto",
  display: "flex",
  flexDirection: "column",
  gap: "calc(var(--spacing) * 2)",
  padding: "calc(var(--spacing) * 4)",
});

const title = ui({
  "--ui-font-weight": "var(--font-weight-semibold)",
  fontWeight: "var(--font-weight-semibold)",
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
}

const DrawerContext = context<DrawerValue | null>(null);

function useDrawer(): DrawerValue {
  return getContext(DrawerContext) ?? { direction: () => "bottom" };
}

export interface DrawerProps extends OverlayRootProps {
  /** Which edge it comes from. @default "bottom" */
  direction?: DrawerDirection;
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
 */
export function Drawer(props: Incoming<DrawerProps>) {
  return (
    <family.Root {...props}>
      <DrawerProvider direction={props.direction}>{props.children}</DrawerProvider>
    </family.Root>
  );
}

/**
 * Its own component, because a `provide` callback that BUILDS the children is
 * the only place the scope exists. Inlined in `Drawer` the callback would run
 * where its siblings read and the direction would be the default everywhere.
 */
function DrawerProvider(
  props: Incoming<{ direction?: DrawerDirection | undefined; children?: Child }>,
) {
  const owner = getOwner();
  const value: DrawerValue = { direction: () => props.direction?.() ?? "bottom" };
  if (owner === null) return <>{props.children}</>;
  return provide(
    owner,
    DrawerContext,
    () => value,
    () => props.children,
  ) as never;
}

export function DrawerTrigger(props: Incoming<{ children?: Child }>) {
  return <family.Trigger {...props} />;
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

export function DrawerContent(props: Incoming<DrawerContentProps>) {
  const { state } = family.use();
  const drawer = useDrawer();
  const direction = (): DrawerDirection => props.direction?.() ?? drawer.direction();

  const drag = drawerDrag({
    direction,
    onClose: () => state.close(),
  });

  let element: HTMLElement | null = null;

  const place = (): void => {
    if (element === null) return;
    const moved = drag.offset();
    const axis = direction() === "top" || direction() === "bottom" ? "Y" : "X";
    const sign = direction() === "bottom" || direction() === "right" ? 1 : -1;
    element.style.transform = `translate${axis}(${String(moved * sign)}px)`;
  };

  const release = (): void => {
    if (element === null) return;
    // The inline transform goes so the rule's own transition carries it back,
    // and the exit keyframes override it anyway when the drag closed it.
    element.style.transform = "";
    element.style.transitionDuration = "";
    element.removeAttribute("data-dragging");
  };

  const onMove = (event: PointerEvent): void => {
    drag.move({ x: event.clientX, y: event.clientY });
    place();
  };

  const onUp = (): void => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    drag.end();
    release();
  };

  const onCancel = (): void => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    drag.cancel();
    release();
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || isControl(event.target)) return;
    const target = event.currentTarget;
    if (!(target instanceof HTMLElement)) return;
    if (!canDragFrom(event.target instanceof Element ? event.target : null, target, direction()))
      return;

    element = target;
    const rect = target.getBoundingClientRect();
    const vertical = direction() === "top" || direction() === "bottom";
    drag.start({ x: event.clientX, y: event.clientY }, vertical ? rect.height : rect.width);
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

  return (
    <Modal
      isOpen={state.isOpen()}
      onOpenChange={state.setOpen}
      isDismissable={props.isDismissable?.() !== false}
      isKeyboardDismissDisabled={props.isKeyboardDismissDisabled?.() === true}
      underlayClass={overlay}
      underlaySlot="drawer-overlay"
      class={ui(drawerVariants({ direction: direction() }), props.class?.(), props.className?.())}
      data-slot={props["data-slot"]?.() ?? "drawer-content"}
      data-direction={direction()}
      onPointerDown={onPointerDown}
    >
      <AriaDialog class={contents}>
        <Show when={props.showHandle?.() !== false && direction() === "bottom"}>
          <div data-slot="drawer-handle" class={handle} aria-hidden="true" />
        </Show>
        {props.children}
      </AriaDialog>
    </Modal>
  );
}

export interface DrawerHeaderProps extends UiProps {
  /** @default true for a top or bottom drawer */
  centered?: boolean;
}

export function DrawerHeader(props: Incoming<DrawerHeaderProps>) {
  const drawer = useDrawer();
  const centered = (): boolean => {
    const said = props.centered?.();
    if (said !== undefined) return said;
    return drawer.direction() === "top" || drawer.direction() === "bottom";
  };

  return (
    <div {...uiProps("drawer-header", ui(header, centered() ? headerCentered : ""), props)}>
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

export function DrawerClose(props: Incoming<DrawerCloseProps>) {
  const { state } = family.use();
  return (
    <Button
      {...props}
      data-slot={props["data-slot"]?.() ?? "drawer-close"}
      variant={props.variant?.() ?? "outline"}
      onPress={(event) => {
        props.onPress?.()?.(event);
        state.close();
      }}
    />
  );
}
