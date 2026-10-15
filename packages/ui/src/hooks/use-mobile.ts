import type { Accessor } from "@barqjs/core";
import { mediaQuery } from "@barqjs/primitives/media";

const MOBILE_BREAKPOINT = 768;

/**
 * Whether the viewport is narrower than shadcn's mobile breakpoint.
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
  return mediaQuery(`(max-width: ${String(MOBILE_BREAKPOINT - 1)}px)`);
}
