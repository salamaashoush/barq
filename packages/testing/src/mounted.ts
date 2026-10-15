import type { MountedRef } from "./types.ts";

/**
 * Every root a test mounted and has not disposed, whichever helper mounted it.
 *
 * One set, because `cleanup()` has to reach a hydrated root exactly as it
 * reaches a rendered one: a tree left mounted keeps its document listeners and
 * its place on the overlay stack, and the next test inherits them.
 */
export const mountedContainers: Set<MountedRef> = new Set<MountedRef>();
