import { touch } from "@barqjs/ui/shared-touch";

import { arcLayer as arc } from "../layer.ts";

/** A pointer's minimum target, 24px. */
const fine = arc.create({
  size: { minBlockSize: "1.5rem", minInlineSize: "1.5rem" },
});

/**
 * Room for a pointer on a part that is not one of ui's controls, which grow
 * by themselves: 24px under a fine pointer, ui's 44px under a coarse one.
 */
export const target = {
  /** At least 24px under a fine pointer and ui's 44px under a coarse one. */
  size: arc(fine.size, touch.target),
};
