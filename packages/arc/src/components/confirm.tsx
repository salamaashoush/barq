import { type Child, Show, createSignal } from "@barqjs/core";
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
export function ConfirmHost() {
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
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{pending()?.title}</AlertDialogTitle>
          <Show when={pending()?.description}>
            <AlertDialogDescription>{pending()?.description}</AlertDialogDescription>
          </Show>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onPress={() => answer(false)}>
            {pending()?.cancelLabel ?? "Cancel"}
          </AlertDialogCancel>
          <AlertDialogAction
            variant={pending()?.tone === "danger" ? "destructive" : "default"}
            onPress={() => answer(true)}
          >
            {pending()?.confirmLabel ?? "Continue"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
