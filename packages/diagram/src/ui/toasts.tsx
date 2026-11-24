import { createEffect } from "@barqjs/core";
import { toast } from "@barqjs/ui/sonner";

import { isLocalizedMessage } from "../i18n.ts";
import { useDiagramUI } from "./context.tsx";

import type { DiagramUI } from "./context.tsx";

/** A message the editor set, as a string in the language of the moment. */
const messageText = (ui: DiagramUI, message: unknown): string => {
  if (isLocalizedMessage(message)) return ui.t(message.key, message.replacement);
  if (message instanceof Error) return message.message;
  return typeof message === "string" ? message : String(message);
};

/**
 * The editor's `toast` and `errorMessage` as arc's toasts, on the toast stack
 * the page's `<ArcProvider>` renders: a notice goes after its time or when
 * closed, an error stays until closed. Either leaves the state once it goes,
 * as Excalidraw clears it when its toast or dialog closes.
 */
export function EditorToasts() {
  const ui = useDiagramUI();
  const store = ui.store;
  let shownToast: unknown = null;
  let shownError: unknown = null;

  createEffect(
    () => store.state("toast"),
    (next) => {
      if (!next || next === shownToast) return;
      shownToast = next;
      // out of the effect: the toast stack writes signals of its own
      queueMicrotask(() =>
        toast(messageText(ui, next.message), {
          duration: next.duration ?? (next.closable === true ? Infinity : 5000),
          closeButton: next.closable === true,
          testId: "editor-toast",
          onDismiss: () => {
            const editor = store.editor;
            if (editor?.state.toast === next) {
              editor.batch(() => editor.setState({ toast: null }));
            }
          },
        }),
      );
    },
  );

  createEffect(
    () => store.state("errorMessage"),
    (next) => {
      if (!next || next === shownError) return;
      shownError = next;
      queueMicrotask(() =>
        toast.error(messageText(ui, next), {
          duration: Infinity,
          closeButton: true,
          testId: "editor-error",
          onDismiss: () => {
            const editor = store.editor;
            if (editor?.state.errorMessage === next) {
              editor.batch(() => editor.setState({ errorMessage: null }));
            }
          },
        }),
      );
    },
  );

  return null;
}
