import { Dialog as AriaDialog, Heading, Modal } from "@barqjs/aria/dialog";
import { Show, type Child, type Incoming } from "@barqjs/core";
import { clsx, css } from "@barqjs/css";
import { X } from "@barqjs/lucide/icons/x";

import { Button, type ButtonProps } from "./button.tsx";

import "../theme/layers.ts";
import { overlayFamily, type OverlayRootProps } from "../lib/overlay.tsx";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";
import { srOnly } from "./sr-only.ts";

const overlay = css`
  @layer barq.ui {
    position: fixed;
    inset: 0px;
    z-index: 50;
    animation: enter var(--ui-animation-duration, var(--ui-duration, 0.15s)) var(--ui-ease, ease)
      var(--ui-animation-delay, 0s) var(--ui-animation-iteration-count, 1)
      var(--ui-animation-direction, normal) var(--ui-animation-fill-mode, none);
    background-color: color-mix(in srgb, #000 50%, transparent);
    @supports (color: color-mix(in lab, red, red)) {
      background-color: color-mix(in oklab, var(--color-black) 50%, transparent);
    }
    --ui-enter-opacity: calc(0/100);
    --ui-enter-opacity: 0;
    &[data-closed] {
      animation: exit var(--ui-animation-duration, var(--ui-duration, 0.15s)) var(--ui-ease, ease)
        var(--ui-animation-delay, 0s) var(--ui-animation-iteration-count, 1)
        var(--ui-animation-direction, normal) var(--ui-animation-fill-mode, none);
      --ui-exit-opacity: calc(0/100);
      --ui-exit-opacity: 0;
    }
  }
`;

const content = css`
  @layer barq.ui {
    position: fixed;
    top: 50%;
    left: 50%;
    z-index: 50;
    display: grid;
    width: 100%;
    max-width: calc(100% - 2rem);
    --ui-translate-x: -50%;
    translate: var(--ui-translate-x) var(--ui-translate-y);
    --ui-translate-y: -50%;
    animation: enter var(--ui-animation-duration, var(--ui-duration, 0.15s)) var(--ui-ease, ease)
      var(--ui-animation-delay, 0s) var(--ui-animation-iteration-count, 1)
      var(--ui-animation-direction, normal) var(--ui-animation-fill-mode, none);
    gap: calc(var(--spacing) * 4);
    border-radius: var(--radius);
    border-style: var(--ui-border-style);
    border-width: 1px;
    background-color: var(--background);
    padding: calc(var(--spacing) * 6);
    --ui-shadow:
      0 10px 15px -3px var(--ui-shadow-color, rgb(0 0 0 / 0.1)),
      0 4px 6px -4px var(--ui-shadow-color, rgb(0 0 0 / 0.1));
    box-shadow:
      var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow),
      var(--ui-ring-shadow), var(--ui-shadow);
    --ui-duration: 200ms;
    transition-duration: 200ms;
    --ui-enter-opacity: calc(0/100);
    --ui-enter-opacity: 0;
    --ui-outline-style: none;
    outline-style: none;
    --ui-enter-scale: calc(95*1%);
    --ui-enter-scale: 0.95;
    @media (width >= 40rem) {
      & {
        max-width: var(--container-lg);
      }
    }
    &[data-closed] {
      animation: exit var(--ui-animation-duration, var(--ui-duration, 0.15s)) var(--ui-ease, ease)
        var(--ui-animation-delay, 0s) var(--ui-animation-iteration-count, 1)
        var(--ui-animation-direction, normal) var(--ui-animation-fill-mode, none);
      --ui-exit-opacity: calc(0/100);
      --ui-exit-opacity: 0;
      --ui-exit-scale: calc(95*1%);
      --ui-exit-scale: 0.95;
    }
  }
`;

const header = css`
  @layer barq.ui {
    display: flex;
    flex-direction: column;
    gap: calc(var(--spacing) * 2);
    text-align: center;
    @media (width >= 40rem) {
      & {
        text-align: left;
      }
    }
  }
`;

const footer = css`
  @layer barq.ui {
    display: flex;
    flex-direction: column-reverse;
    gap: calc(var(--spacing) * 2);
    @media (width >= 40rem) {
      & {
        flex-direction: row;
        justify-content: flex-end;
      }
    }
  }
`;

const title = css`
  @layer barq.ui {
    font-size: var(--text-lg);
    line-height: var(--ui-leading, var(--text-lg--line-height));
    --ui-leading: 1;
    line-height: 1;
    --ui-font-weight: var(--font-weight-semibold);
    font-weight: var(--font-weight-semibold);
  }
`;

const description = css`
  @layer barq.ui {
    font-size: var(--text-sm);
    line-height: var(--ui-leading, var(--text-sm--line-height));
    color: var(--muted-foreground);
  }
`;

const close = css`
  @layer barq.ui {
    position: absolute;
    top: calc(var(--spacing) * 4);
    right: calc(var(--spacing) * 4);
    border-radius: var(--radius-xs);
    opacity: 70%;
    --ui-ring-offset-color: var(--background);
    transition-property: opacity;
    transition-timing-function: var(--ui-ease, var(--default-transition-timing-function));
    transition-duration: var(--ui-duration, var(--default-transition-duration));
    @media (hover: hover) {
      &:hover {
        opacity: 100%;
      }
    }
    &[data-focus-visible] {
      --ui-ring-shadow: var(--ui-ring-inset,) 0 0 0 calc(2px + var(--ui-ring-offset-width))
        var(--ui-ring-color, currentcolor);
      box-shadow:
        var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow),
        var(--ui-ring-shadow), var(--ui-shadow);
      --ui-ring-color: var(--ring);
      --ui-ring-offset-width: 2px;
      --ui-ring-offset-shadow: var(--ui-ring-inset,) 0 0 0 var(--ui-ring-offset-width)
        var(--ui-ring-offset-color);
    }
    &[data-disabled] {
      pointer-events: none;
    }
    & svg {
      pointer-events: none;
      flex-shrink: 0;
    }
    & svg:not([class*="size-"]) {
      width: calc(var(--spacing) * 4);
      height: calc(var(--spacing) * 4);
    }
  }
`;

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
      class={clsx(content, props.class?.(), props.className?.())}
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
const contents = css`
  @layer barq.ui {
    display: contents;
  }
`;

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
      class={clsx(title, props.class?.(), props.className?.())}
    />
  );
}

export function DialogDescription(props: Incoming<UiProps>) {
  return <p {...uiProps("dialog-description", description, props)}>{props.children}</p>;
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
