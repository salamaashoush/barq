import { type Accessor, isServer, signal } from "@barqjs/core";
import { tryCleanup } from "./utils.ts";

export interface ClipboardHandle {
  /** Write text, and raise `copied` for a moment. */
  copy: (text: string) => Promise<void>;
  /** True from a successful copy until `resetAfter` elapses. */
  copied: Accessor<boolean>;
  /** Whatever the last copy threw, or `undefined`. */
  error: Accessor<unknown>;
}

export interface ClipboardOptions {
  /** How long `copied` stays true. Defaults to 2000ms; `0` keeps it raised. */
  resetAfter?: number;
}

/**
 * Copying to the clipboard, with the "Copied!" state that always ends up
 * written by hand next to it.
 *
 * The write needs a user gesture and a secure context. Where either is missing
 * the promise rejects and `error` holds the reason; `copied` stays false, so a
 * button bound to it does not lie.
 */
export function clipboard(options?: ClipboardOptions): ClipboardHandle {
  const copied = signal(false);
  const error = signal<unknown>(undefined);
  const resetAfter = options?.resetAfter ?? 2000;
  let timer: ReturnType<typeof setTimeout> | undefined;

  tryCleanup(() => {
    if (timer !== undefined) clearTimeout(timer);
  });

  const copy = async (text: string): Promise<void> => {
    try {
      await writeClipboard(text);
      error.set(undefined);
      copied.set(true);
      if (resetAfter > 0) {
        if (timer !== undefined) clearTimeout(timer);
        timer = setTimeout(() => copied.set(false), resetAfter);
      }
    } catch (failure) {
      error.set(failure);
      copied.set(false);
      throw failure;
    }
  };

  return { copy, copied, error };
}

/** Write text to the clipboard. Rejects where the API is missing or refused. */
export async function writeClipboard(text: string): Promise<void> {
  if (isServer || typeof navigator === "undefined" || navigator.clipboard === undefined) {
    throw new Error("The clipboard API is unavailable here");
  }
  await navigator.clipboard.writeText(text);
}

/** Read text from the clipboard. Needs permission, and rejects without it. */
export async function readClipboard(): Promise<string> {
  if (isServer || typeof navigator === "undefined" || navigator.clipboard === undefined) {
    throw new Error("The clipboard API is unavailable here");
  }
  return await navigator.clipboard.readText();
}
