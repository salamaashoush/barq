import { For, type Incoming } from "@barqjs/core";
import { toastQueue, type Toast, type ToastKind, type ToastOptions } from "@barqjs/aria/toast";
import { layer } from "@barqjs/css";
import { CircleCheck } from "@barqjs/lucide/icons/circle-check";
import { Info } from "@barqjs/lucide/icons/info";
import { OctagonX } from "@barqjs/lucide/icons/octagon-x";
import { TriangleAlert } from "@barqjs/lucide/icons/triangle-alert";
import { X } from "@barqjs/lucide/icons/x";

import "../theme/layers.ts";
import { uiProps } from "../lib/slot.ts";
import { Button } from "./button.tsx";
import { Spinner } from "./spinner.tsx";

import type { UiProps } from "../lib/props.ts";

const ui = layer("barq.ui");

const region = ui({
  pointerEvents: "none",
  position: "fixed",
  right: "0px",
  bottom: "0px",
  zIndex: "100",
  display: "flex",
  width: "100%",
  maxWidth: "100%",
  flexDirection: "column",
  gap: "calc(var(--spacing) * 2)",
  padding: "calc(var(--spacing) * 4)",
  "@media (width >= 40rem)": {
    "&": {
      width: "calc(var(--spacing) * 96)",
    },
  },
});

const shell = ui({
  pointerEvents: "auto",
  display: "flex",
  width: "100%",
  alignItems: "flex-start",
  gap: "calc(var(--spacing) * 2)",
  borderRadius: "var(--radius)",
  borderStyle: "var(--ui-border-style)",
  borderWidth: "1px",
  backgroundColor: "var(--popover)",
  padding: "calc(var(--spacing) * 4)",
  fontSize: "var(--text-sm)",
  lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
  color: "var(--popover-foreground)",
  "--ui-shadow":
    "0 10px 15px -3px var(--ui-shadow-color, rgb(0 0 0 / 0.1)), 0 4px 6px -4px var(--ui-shadow-color, rgb(0 0 0 / 0.1))",
  boxShadow:
    "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
});

const icon = ui({
  marginTop: "calc(var(--spacing) * 0.5)",
  width: "calc(var(--spacing) * 4)",
  height: "calc(var(--spacing) * 4)",
  flexShrink: "0",
});

const body = ui({
  display: "flex",
  minWidth: "0px",
  flex: "1",
  flexDirection: "column",
  gap: "var(--spacing)",
});

const title = ui({
  "--ui-leading": "1",
  lineHeight: "1",
  "--ui-font-weight": "var(--font-weight-medium)",
  fontWeight: "var(--font-weight-medium)",
});

const description = ui({
  fontSize: "var(--text-sm)",
  lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
  color: "var(--muted-foreground)",
});

const action = ui({
  marginLeft: "auto",
  flexShrink: "0",
});

const close = ui({
  marginLeft: "auto",
  flexShrink: "0",
  borderRadius: "calc(var(--radius) - 2px)",
  padding: "var(--spacing)",
  color: "var(--muted-foreground)",
  opacity: "0%",
  transitionProperty: "opacity",
  transitionTimingFunction: "var(--ui-ease, var(--default-transition-timing-function))",
  transitionDuration: "var(--ui-duration, var(--default-transition-duration))",
  "@media (hover: hover)": {
    ":is(:where(.group\\/toast):hover *)": {
      opacity: "100%",
    },
    ":hover": {
      color: "var(--foreground)",
    },
  },
  ":focus-visible": {
    opacity: "100%",
  },
});

/**
 * The one queue a page has.
 *
 * A module-level queue rather than a context, because the whole point of
 * `toast("Saved")` is that it can be called from anywhere: a fetch handler, a
 * store, a route action. A context would put it back inside the tree the
 * caller has usually already left.
 */
const queue = toastQueue();

export interface ToastApi {
  (title: string, options?: ToastOptions): number;
  success(title: string, options?: ToastOptions): number;
  info(title: string, options?: ToastOptions): number;
  warning(title: string, options?: ToastOptions): number;
  error(title: string, options?: ToastOptions): number;
  loading(title: string, options?: ToastOptions): number;
  /** Replaces one in place, keeping its position. */
  update(id: number, options: ToastOptions): void;
  dismiss(id: number): void;
  clear(): void;
  /**
   * `loading` while it runs, then `success` or `error` on the same toast.
   *
   * The whole reason `update` keeps a toast's position: a "Saving" that becomes
   * "Saved" by jumping to the bottom of the column reads as a second thing
   * happening rather than the first one finishing.
   */
  promise<T>(
    work: Promise<T>,
    messages: { loading: string; success: string | ((value: T) => string); error: string },
  ): Promise<T>;
}

function raise(kind: ToastKind, text: string, options?: ToastOptions): number {
  return queue.add({ ...options, title: text, kind });
}

export const toast: ToastApi = Object.assign(
  (text: string, options?: ToastOptions) => raise("default", text, options),
  {
    success: (text: string, options?: ToastOptions) => raise("success", text, options),
    info: (text: string, options?: ToastOptions) => raise("info", text, options),
    warning: (text: string, options?: ToastOptions) => raise("warning", text, options),
    error: (text: string, options?: ToastOptions) => raise("error", text, options),
    loading: (text: string, options?: ToastOptions) =>
      // A loading toast has no duration of its own: it goes when the work says
      // so, and a timer would take it away mid-flight.
      queue.add({ ...options, title: text, kind: "loading", duration: Number.POSITIVE_INFINITY }),
    update: (id: number, options: ToastOptions) => queue.update(id, options),
    dismiss: (id: number) => queue.dismiss(id),
    clear: () => queue.clear(),
    async promise<T>(
      work: Promise<T>,
      messages: { loading: string; success: string | ((value: T) => string); error: string },
    ): Promise<T> {
      const id = queue.add({
        title: messages.loading,
        kind: "loading",
        duration: Number.POSITIVE_INFINITY,
      });
      try {
        const value = await work;
        queue.update(id, {
          title:
            typeof messages.success === "function" ? messages.success(value) : messages.success,
          kind: "success",
        });
        return value;
      } catch (error) {
        queue.update(id, { title: messages.error, kind: "error" });
        throw error;
      }
    },
  },
);

/** What each kind draws, which is shadcn's own mapping. */
function Icon(props: Incoming<{ kind: ToastKind }>) {
  const kind = (): ToastKind => props.kind();
  return (
    <>
      {kind() === "success" ? (
        <CircleCheck class={icon} />
      ) : kind() === "info" ? (
        <Info class={icon} />
      ) : kind() === "warning" ? (
        <TriangleAlert class={icon} />
      ) : kind() === "error" ? (
        <OctagonX class={icon} />
      ) : kind() === "loading" ? (
        <Spinner class={icon} />
      ) : null}
    </>
  );
}

export interface ToasterProps extends UiProps {}

/**
 * ```tsx
 * <Toaster />
 * toast.success("Saved");
 * ```
 *
 * shadcn's is `sonner`'s `<Toaster>` with this package's tokens mapped onto its
 * CSS variables. `sonner` is React, so the queue is `@barqjs/aria`'s and the
 * look is transcribed rather than configured.
 *
 * A live REGION, not a focus trap. Moving focus to something that appeared on
 * its own takes the keyboard away from whatever the person was doing, so a
 * toast is announced and waits to be reached. Hovering the region pauses every
 * timer in it, because a toast that expires while the pointer is over it was
 * never read.
 */
export function Toaster(props: Incoming<ToasterProps>) {
  return (
    <section
      {...uiProps("toaster", region, props)}
      aria-label="Notifications"
      // `polite`, so a toast waits for a screen reader to finish its sentence.
      // `assertive` interrupts, which is for an error the page cannot continue
      // past rather than for "Saved".
      aria-live="polite"
      aria-relevant="additions text"
      onMouseEnter={() => queue.pause()}
      onMouseLeave={() => queue.resume()}
      onFocusIn={() => queue.pause()}
      onFocusOut={() => queue.resume()}
    >
      <For each={() => queue.toasts()}>
        {(each: Toast) => (
          <div class={ui(shell, "group/toast")} data-slot="toast" data-kind={each.kind}>
            <Icon kind={each.kind} />
            <div class={body} data-slot="toast-body">
              <div class={title} data-slot="toast-title">
                {each.title}
              </div>
              {each.description === undefined ? null : (
                <div class={description} data-slot="toast-description">
                  {each.description}
                </div>
              )}
            </div>
            {each.action === undefined ? null : (
              <Button
                size="sm"
                variant="outline"
                class={action}
                data-slot="toast-action"
                onPress={() => {
                  each.action?.onAction();
                  queue.dismiss(each.id);
                }}
              >
                {each.action.label}
              </Button>
            )}
            <button
              type="button"
              class={close}
              data-slot="toast-close"
              aria-label="Dismiss"
              onClick={() => queue.dismiss(each.id)}
            >
              <X />
            </button>
          </div>
        )}
      </For>
    </section>
  );
}
