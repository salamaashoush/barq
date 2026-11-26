import { createContext } from "@barqjs/core";
import type { MaybeAccessor } from "./utils.ts";

/**
 * What a component wrapping a progress bar needs it to carry. A pending
 * `<Button>` names itself with its progress bar, so it hands down the id.
 *
 * In a module of its own so that `button.tsx` can provide it without bringing
 * the progress bar, and everything beside it, into the button's entry.
 */
export interface ProgressBarContextValue {
  id?: MaybeAccessor<string | undefined>;
  /**
   * Called with `true` while a progress bar carrying `id` is mounted, so the
   * button names itself with it only while there is one to point at.
   */
  present?: (mounted: boolean) => void;
}

export const ProgressBarContext = createContext<ProgressBarContextValue | null>(null);
