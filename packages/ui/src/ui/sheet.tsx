import { Dialog as AriaDialog, Heading, Modal } from "@barqjs/aria/dialog";
import { Show, type Child, type Incoming } from "@barqjs/core";
import { firstThatWorks, layer, variants } from "@barqjs/css";
import { X } from "@barqjs/lucide/icons/x";

import "../theme/layers.ts";
import { box } from "../lib/shared-box.ts";
import { icon } from "../lib/shared-icon.ts";
import { text } from "../lib/shared-text.ts";
import { overlayFamily, type OverlayRootProps } from "../lib/overlay.tsx";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";
import { Button, type ButtonProps } from "./button.tsx";
import { srOnly } from "./sr-only.ts";

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

const header = ui({
  display: "flex",
  flexDirection: "column",
  gap: "calc(var(--spacing) * 1.5)",
  padding: "calc(var(--spacing) * 4)",
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

const close = ui(box.transition, icon.plain, icon.sized, {
  position: "absolute",
  top: "calc(var(--spacing) * 4)",
  right: "calc(var(--spacing) * 4)",
  borderRadius: "var(--radius-xs)",
  opacity: "70%",
  "--ui-ring-offset-color": "var(--background)",
  transitionProperty: "opacity",
  "@media (hover: hover)": {
    ":hover": {
      opacity: "100%",
    },
  },
  "[data-focus-visible]": {
    "--ui-ring-shadow":
      "var(--ui-ring-inset,) 0 0 0 calc(2px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
    boxShadow:
      "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
    "--ui-ring-color": "var(--ring)",
    "--ui-ring-offset-width": "2px",
    "--ui-ring-offset-shadow":
      "var(--ui-ring-inset,) 0 0 0 var(--ui-ring-offset-width) var(--ui-ring-offset-color)",
  },
  "[data-disabled]": {
    pointerEvents: "none",
  },
});

export type SheetSide = "top" | "right" | "bottom" | "left";

export const sheetVariants = variants({
  base: ui(box.shadow, {
    position: "fixed",
    zIndex: "50",
    display: "flex",
    animation:
      "enter var(--ui-animation-duration, var(--ui-duration, 0.15s)) var(--ui-ease, ease) var(--ui-animation-delay, 0s) var(--ui-animation-iteration-count, 1) var(--ui-animation-direction, normal) var(--ui-animation-fill-mode, none)",
    flexDirection: "column",
    gap: "calc(var(--spacing) * 4)",
    backgroundColor: "var(--background)",
    "--ui-shadow":
      "0 10px 15px -3px var(--ui-shadow-color, rgb(0 0 0 / 0.1)), 0 4px 6px -4px var(--ui-shadow-color, rgb(0 0 0 / 0.1))",
    transitionProperty:
      "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --ui-gradient-from, --ui-gradient-via, --ui-gradient-to, opacity, box-shadow, transform, translate, scale, rotate, filter, -webkit-backdrop-filter, backdrop-filter, display, content-visibility, overlay, pointer-events",
    transitionTimingFunction: firstThatWorks(
      "var(--ease-in-out)",
      "var(--ui-ease, var(--default-transition-timing-function))",
    ),
    transitionDuration: firstThatWorks(
      "500ms",
      "var(--ui-duration, var(--default-transition-duration))",
    ),
    "--ui-duration": "500ms",
    "--ui-ease": "var(--ease-in-out)",
    "[data-closed]": {
      animation:
        "exit var(--ui-animation-duration, var(--ui-duration, 0.15s)) var(--ui-ease, ease) var(--ui-animation-delay, 0s) var(--ui-animation-iteration-count, 1) var(--ui-animation-direction, normal) var(--ui-animation-fill-mode, none)",
      "--ui-duration": "300ms",
      transitionDuration: "300ms",
    },
  }),
  variants: {
    side: {
      right: ui({
        insetBlock: "0px",
        right: "0px",
        height: "100%",
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
        height: "100%",
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
      top: ui({
        insetInline: "0px",
        top: "0px",
        height: "auto",
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
        height: "auto",
        borderTopStyle: "var(--ui-border-style)",
        borderTopWidth: "1px",
        "--ui-enter-translate-y": "100%",
        "[data-closed]": {
          "--ui-exit-translate-y": "100%",
        },
      }),
    },
  },
  defaults: { side: "right" },
});

const family = overlayFamily("Sheet");

export interface SheetProps extends OverlayRootProps {}

/**
 * A dialog that comes in from an edge.
 *
 * The same modality as `<Dialog>` — contained focus, an inert page, Escape —
 * with a different shape and a slide rather than a zoom.
 *
 * ```tsx
 * <Sheet>
 *   <SheetTrigger><Button>Filters</Button></SheetTrigger>
 *   <SheetContent side="left">
 *     <SheetHeader><SheetTitle>Filters</SheetTitle></SheetHeader>
 *   </SheetContent>
 * </Sheet>
 * ```
 */
export function Sheet(props: Incoming<SheetProps>) {
  return <family.Root {...props} />;
}

export function SheetTrigger(props: Incoming<{ children?: Child }>) {
  return <family.Trigger {...props} />;
}

export interface SheetContentProps extends UiProps {
  /** @default "right" */
  side?: SheetSide;
  /** @default true */
  showCloseButton?: boolean;
  /** @default true */
  isDismissable?: boolean;
  isKeyboardDismissDisabled?: boolean;
  /** @default "Close" */
  closeLabel?: string;
}

export function SheetContent(props: Incoming<SheetContentProps>) {
  const { state } = family.use();

  return (
    <Modal
      isOpen={state.isOpen()}
      onOpenChange={state.setOpen}
      isDismissable={props.isDismissable?.() !== false}
      isKeyboardDismissDisabled={props.isKeyboardDismissDisabled?.() === true}
      underlayClass={overlay}
      class={ui(sheetVariants({ side: props.side?.() }), props.class?.(), props.className?.())}
      data-slot={props["data-slot"]?.() ?? "sheet-content"}
      data-side={props.side?.() ?? "right"}
    >
      <AriaDialog class={contents}>
        {props.children}
        <Show when={props.showCloseButton?.() !== false}>
          <button type="button" data-slot="sheet-close" class={close} onClick={() => state.close()}>
            <X />
            <span class={srOnly}>{props.closeLabel?.() ?? "Close"}</span>
          </button>
        </Show>
      </AriaDialog>
    </Modal>
  );
}

/** See `dialog.tsx`: the dialog's own element lays nothing out. */
const contents = ui({
  display: "contents",
});

export function SheetHeader(props: Incoming<UiProps>) {
  return <div {...uiProps("sheet-header", header, props)}>{props.children}</div>;
}

export function SheetFooter(props: Incoming<UiProps>) {
  return <div {...uiProps("sheet-footer", footer, props)}>{props.children}</div>;
}

/** The sheet's accessible name. */
export function SheetTitle(props: Incoming<UiProps>) {
  return (
    <Heading
      {...props}
      slot="title"
      data-slot={props["data-slot"]?.() ?? "sheet-title"}
      class={ui(title, props.class?.(), props.className?.())}
    />
  );
}

export function SheetDescription(props: Incoming<UiProps>) {
  return <p {...uiProps("sheet-description", description, props)}>{props.children}</p>;
}

export interface SheetCloseProps extends ButtonProps {}

export function SheetClose(props: Incoming<SheetCloseProps>) {
  const { state } = family.use();
  return (
    <Button
      {...props}
      data-slot={props["data-slot"]?.() ?? "sheet-close"}
      variant={props.variant?.() ?? "outline"}
      onPress={(event) => {
        props.onPress?.()?.(event);
        state.close();
      }}
    />
  );
}
