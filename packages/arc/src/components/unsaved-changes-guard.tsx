import { type Child, cells } from "@barqjs/core";
import { useBlocker } from "@barqjs/router";

import { confirm } from "./confirm.tsx";
import { type ArcMessages, ENGLISH, useArcMessages } from "./messages.ts";

export interface DiscardLabels {
  /** @default "Discard unsaved changes?" */
  heading?: Child;
  /** @default "What you changed here has not been saved." */
  description?: Child;
  /** @default "Discard" */
  discardLabel?: Child;
  /** @default "Keep editing" */
  keepLabel?: Child;
}

/** Whether the reader agrees to lose what they changed, in the words given or arc's. */
export function confirmDiscard(
  labels: DiscardLabels = {},
  messages: ArcMessages = ENGLISH,
): Promise<boolean> {
  return confirm({
    title: labels.heading ?? messages.discardHeading,
    description: labels.description ?? messages.discardDescription,
    confirmLabel: labels.discardLabel ?? messages.discard,
    cancelLabel: labels.keepLabel ?? messages.keepEditing,
    tone: "danger",
  });
}

export interface UnsavedChangesGuardProps extends DiscardLabels {
  /** Whether leaving would lose something. Read at every navigation. */
  when: boolean;
}

/**
 * Asks before a page with unsaved changes is left: a link, the back button,
 * or closing the tab.
 *
 * ```tsx
 * <UnsavedChangesGuard when={form.useSelector((state) => state.isDirty)()} />
 * ```
 *
 * In the app it asks through `confirm()`, so it needs the `<ConfirmHost />`
 * that `<ArcProvider>` renders. Closing or reloading the tab gets the
 * browser's own question, the only one a page may ask there. It stops
 * guarding when it unmounts.
 */
export function UnsavedChangesGuard(props: UnsavedChangesGuardProps) {
  // It renders nothing, so the compiler does not see a component here and
  // leaves its props as the Cells they arrive as.
  const incoming = cells(props);
  const messages = useArcMessages();
  function when(): boolean {
    return incoming.when();
  }
  useBlocker({
    shouldBlockFn: async () => {
      if (!when()) return false;
      const discard = await confirmDiscard(
        {
          heading: incoming.heading?.(),
          description: incoming.description?.(),
          discardLabel: incoming.discardLabel?.(),
          keepLabel: incoming.keepLabel?.(),
        },
        messages(),
      );
      return !discard;
    },
    enableBeforeUnload: when,
  });
  return null;
}
