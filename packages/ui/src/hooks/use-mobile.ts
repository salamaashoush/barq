import type { Accessor } from "@barqjs/core";
import { mediaQuery } from "@barqjs/primitives/media";

import { breakpointQuery } from "../lib/conditions.ts";

/**
 * Whether the viewport is narrower than the `md` step, shadcn's mobile
 * breakpoint, read from the one scale every style here is written on.
 *
 * ```tsx
 * const isMobile = useIsMobile();
 * <Show when={isMobile()} fallback={<Columns />}><Stack /></Show>
 * ```
 *
 * The media query list rather than a resize listener: the browser already
 * knows when the answer changes, and every caller shares one list. On the
 * server it reads `false`, which is the desktop layout upstream also renders
 * first.
 */
export function useIsMobile(): Accessor<boolean> {
  return mediaQuery(breakpointQuery("md", "down"));
}
