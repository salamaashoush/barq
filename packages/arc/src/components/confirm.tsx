import { type Child, Show, createSignal } from "@barqjs/core";
import { variants } from "@barqjs/css";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@barqjs/ui/alert-dialog";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { useArcMessages } from "./messages.ts";

/** The parts of the dialog `confirm()` draws, for `classes` on the host. */
export const confirmStyles = variants({
  slots: {
    root: arc({}),
    header: arc({}),
    title: arc({}),
    description: arc({}),
    footer: arc({}),
    cancel: arc({}),
    action: arc({}),
  },
});

type Slots = ReturnType<typeof confirmStyles>;

export type ConfirmHostProps = Customisable<Slots>;

export interface ConfirmOptions {
  title: Child;
  description?: Child;
  /** @default "Continue" */
  confirmLabel?: Child;
  /** @default "Cancel" */
  cancelLabel?: Child;
  /** `danger` draws the confirming button as destructive. */
  tone?: "default" | "danger";
}

interface Pending extends ConfirmOptions {
  settle: (answer: boolean) => void;
}

const [pending, setPending] = createSignal<Pending | null>(null);

/**
 * Ask, and wait for the answer.
 *
 * Resolves `true` when the reader confirms and `false` when they cancel. A
 * second question while one is open answers the first `false`: two stacked
 * confirmations are a bug in the flow that asked, not something to queue.
 * Needs a `<ConfirmHost />` on the page, which `<ArcProvider>` renders.
 *
 * ```ts
 * if (await confirm({ title: "Delete the check?", tone: "danger", confirmLabel: "Delete" })) {
 *   await remove(id);
 * }
 * ```
 */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (answer: boolean): void => {
      if (settled) return;
      settled = true;
      resolve(answer);
    };
    setPending((previous) => {
      previous?.settle(false);
      return { ...options, settle };
    });
  });
}

/** Where `confirm()` draws its dialog. One per page. */
export function ConfirmHost(props: ConfirmHostProps) {
  const messages = useArcMessages();
  const cls = (): Slots => parts(confirmStyles(), props.classes);
  const answer = (value: boolean): void => {
    const asked = pending();
    if (asked === null) return;
    asked.settle(value);
    setPending(null);
  };
  return (
    <AlertDialog
      isOpen={pending() !== null}
      onOpenChange={(isOpen) => {
        if (!isOpen) answer(false);
      }}
    >
      <AlertDialogContent class={arc(cls().root, props.class, props.className)}>
        <AlertDialogHeader class={cls().header}>
          <AlertDialogTitle class={cls().title}>{pending()?.title}</AlertDialogTitle>
          <Show when={pending()?.description}>
            <AlertDialogDescription class={cls().description}>
              {pending()?.description}
            </AlertDialogDescription>
          </Show>
        </AlertDialogHeader>
        <AlertDialogFooter class={cls().footer}>
          <AlertDialogCancel class={cls().cancel} onPress={() => answer(false)}>
            {pending()?.cancelLabel ?? messages().cancel}
          </AlertDialogCancel>
          <AlertDialogAction
            class={cls().action}
            variant={pending()?.tone === "danger" ? "destructive" : "default"}
            onPress={() => answer(true)}
          >
            {pending()?.confirmLabel ?? messages().continue}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
