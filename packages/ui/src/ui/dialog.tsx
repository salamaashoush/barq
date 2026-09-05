import { Dialog as AriaDialog, Heading, Modal, useDialogDescription } from "@barqjs/aria/dialog";
import { Show, type Child, type Incoming } from "@barqjs/core";
import { firstThatWorks, layer } from "@barqjs/css";
import { X } from "@barqjs/lucide/icons/x";

import { Button, type ButtonProps } from "./button.tsx";

import "../theme/layers.ts";
import { box } from "../lib/shared-box.ts";
import { icon } from "../lib/shared-icon.ts";
import { when } from "../lib/shared-when.ts";
import { text } from "../lib/shared-text.ts";
import { overlayFamily, type OverlayRootProps } from "../lib/overlay.tsx";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";
import { srOnly } from "./sr-only.ts";

const ui = layer("barq.ui");

// A tenth of black and a blur, not half of black: the page behind stays
// readable and the dialog reads as a layer over it rather than a hole in it.
const overlay = ui({
  position: "fixed",
  inset: "0px",
  isolation: "isolate",
  zIndex: "50",
  animation:
    "enter var(--ui-animation-duration, var(--ui-duration, 0.15s)) var(--ui-ease, ease) var(--ui-animation-delay, 0s) var(--ui-animation-iteration-count, 1) var(--ui-animation-direction, normal) var(--ui-animation-fill-mode, none)",
  backgroundColor: "color-mix(in srgb, #000 10%, transparent)",
  "--ui-duration": "100ms",
  transitionDuration: "100ms",
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
});

const content = ui(box.shadow, box.outline, text.sm, when.closing, {
  position: "fixed",
  top: "calc(1 / 2 * 100%)",
  left: "calc(1 / 2 * 100%)",
  zIndex: "50",
  display: "grid",
  width: "100%",
  maxWidth: "calc(100% - 2rem)",
  "--ui-translate-x": "calc(calc(1 / 2 * 100%) * -1)",
  translate: "var(--ui-translate-x) var(--ui-translate-y)",
  "--ui-translate-y": "calc(calc(1 / 2 * 100%) * -1)",
  animation:
    "enter var(--ui-animation-duration, var(--ui-duration, 0.15s)) var(--ui-ease, ease) var(--ui-animation-delay, 0s) var(--ui-animation-iteration-count, 1) var(--ui-animation-direction, normal) var(--ui-animation-fill-mode, none)",
  gap: "calc(var(--spacing) * 4)",
  borderRadius: "calc(var(--radius) * 1.4)",
  backgroundColor: "var(--popover)",
  padding: "calc(var(--spacing) * 4)",
  color: "var(--popover-foreground)",
  "--ui-ring-shadow":
    "var(--ui-ring-inset,) 0 0 0 calc(1px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
  "--ui-ring-color": "var(--foreground)",
  "--ui-duration": "100ms",
  transitionDuration: "100ms",
  "--ui-enter-opacity": firstThatWorks("0", "calc(0/100)"),
  "--ui-enter-scale": firstThatWorks("0.95", "calc(95*1%)"),
  "@supports (color: color-mix(in lab, red, red))": {
    "--ui-ring-color": "color-mix(in oklab, var(--foreground) 10%, transparent)",
  },
  "@media (width >= 40rem)": {
    "&": {
      maxWidth: "var(--container-sm)",
    },
  },
});

const header = ui({
  display: "flex",
  flexDirection: "column",
  gap: "calc(var(--spacing) * 2)",
});

// The footer is pulled out to the content's own edges and given the content's
// bottom corners, so the muted band reaches the sides rather than floating
// inside the padding.
const footer = ui({
  marginInline: "calc(var(--spacing) * -4)",
  marginBottom: "calc(var(--spacing) * -4)",
  display: "flex",
  flexDirection: "column-reverse",
  gap: "calc(var(--spacing) * 2)",
  borderBottomRightRadius: "calc(var(--radius) * 1.4)",
  borderBottomLeftRadius: "calc(var(--radius) * 1.4)",
  borderTopStyle: "var(--ui-border-style)",
  borderTopWidth: "1px",
  backgroundColor: "var(--muted)",
  padding: "calc(var(--spacing) * 4)",
  "@supports (color: color-mix(in lab, red, red))": {
    backgroundColor: "color-mix(in oklab, var(--muted) 50%, transparent)",
  },
  "@media (width >= 40rem)": {
    "&": {
      flexDirection: "row",
      justifyContent: "flex-end",
    },
  },
});

const title = ui(text.heading, text.medium, {
  fontSize: "var(--text-base)",
  lineHeight: firstThatWorks("1", "var(--ui-leading, var(--text-base--line-height))"),
  "--ui-leading": "1",
});

const description = ui(text.sm, {
  color: "var(--muted-foreground)",
  ":is(& > *):is(a)": {
    textDecorationLine: "underline",
    textUnderlineOffset: "3px",
  },
  "@media (hover: hover)": {
    ":is(& > *):is(a):hover": {
      color: "var(--foreground)",
    },
  },
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

const family = overlayFamily("Dialog");

export interface DialogProps extends OverlayRootProps {}

/**
 * ```tsx
 * <Dialog>
 *   <DialogTrigger><Button>Delete</Button></DialogTrigger>
 *   <DialogContent>
 *     <DialogHeader>
 *       <DialogTitle>Delete the project?</DialogTitle>
 *       <DialogDescription>This cannot be undone.</DialogDescription>
 *     </DialogHeader>
 *     <DialogFooter><DialogClose>Cancel</DialogClose></DialogFooter>
 *   </DialogContent>
 * </Dialog>
 * ```
 *
 * `<DialogTrigger>` renders no element of its own: the button inside it picks
 * up `aria-haspopup`, `aria-expanded` and the press handler through a slot, so
 * focus goes to the control and returns to it when the dialog closes.
 *
 * The dialog is not in the document while closed. There is no exit animation
 * for the same reason — the element is gone the moment `isOpen` turns false —
 * which is the one visible difference from shadcn's.
 */
export function Dialog(props: Incoming<DialogProps>) {
  return <family.Root {...props} />;
}

export function DialogTrigger(props: Incoming<{ children?: Child }>) {
  return <family.Trigger {...props} />;
}

export interface DialogContentProps extends UiProps {
  /** @default true */
  showCloseButton?: boolean;
  /** @default true */
  isDismissable?: boolean;
  isKeyboardDismissDisabled?: boolean;
  /** What the close button says to a screen reader. @default "Close" */
  closeLabel?: string;
  role?: "dialog" | "alertdialog";
}

export function DialogContent(props: Incoming<DialogContentProps>) {
  const { state } = family.use();

  return (
    <Modal
      isOpen={state.isOpen()}
      onOpenChange={state.setOpen}
      isDismissable={props.isDismissable?.() !== false}
      isKeyboardDismissDisabled={props.isKeyboardDismissDisabled?.() === true}
      underlayClass={overlay}
      underlaySlot="dialog-overlay"
      class={ui(content, props.class?.(), props.className?.())}
      data-slot={props["data-slot"]?.() ?? "dialog-content"}
    >
      <AriaDialog role={props.role?.() ?? "dialog"} class={contents}>
        {props.children}
        <Show when={props.showCloseButton?.() !== false}>
          <CornerClose label={props.closeLabel?.() ?? "Close"} />
        </Show>
      </AriaDialog>
    </Modal>
  );
}

/**
 * The `<section>` `@barqjs/aria` renders for the dialog role lays nothing out;
 * the grid is on the modal around it, and `display: contents` keeps the section
 * out of it.
 */
const contents = ui({
  display: "contents",
});

export function DialogHeader(props: Incoming<UiProps>) {
  return <div {...uiProps("dialog-header", header, props)}>{props.children}</div>;
}

export function DialogFooter(props: Incoming<UiProps>) {
  return <div {...uiProps("dialog-footer", footer, props)}>{props.children}</div>;
}

/** The dialog's accessible name. Every dialog needs one. */
export function DialogTitle(props: Incoming<UiProps>) {
  return (
    <Heading
      {...props}
      slot="title"
      data-slot={props["data-slot"]?.() ?? "dialog-title"}
      class={ui(title, props.class?.(), props.className?.())}
    />
  );
}

export function DialogDescription(props: Incoming<UiProps>) {
  const described = useDialogDescription();
  // The dialog points at this element, and only because the hook was called:
  // a description nothing references is read by whoever goes looking for it
  // and by nobody else.
  return (
    <p {...uiProps("dialog-description", description, props)} id={props.id?.() ?? described?.id()}>
      {props.children}
    </p>
  );
}

/** The ✕ in the corner. Not `<DialogClose>`, which is a real button with padding and a border. */
function CornerClose(props: Incoming<{ label: string }>) {
  const { state } = family.use();
  return (
    <button type="button" data-slot="dialog-close" class={close} onClick={() => state.close()}>
      <X />
      <span class={srOnly}>{props.label()}</span>
    </button>
  );
}

export interface DialogCloseProps extends ButtonProps {}

/**
 * A button that closes the dialog.
 *
 * shadcn writes `<DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>`,
 * which is Radix cloning the child to attach a handler. This IS the button, and
 * it takes the same `variant` and `size` — nothing is cloned and nothing nests
 * a `<button>` inside a `<button>`.
 */
export function DialogClose(props: Incoming<DialogCloseProps>) {
  const { state } = family.use();
  return (
    <Button
      {...props}
      data-slot={props["data-slot"]?.() ?? "dialog-close"}
      variant={props.variant?.() ?? "outline"}
      onPress={(event) => {
        props.onPress?.()?.(event);
        state.close();
      }}
    />
  );
}
