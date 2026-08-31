/** An icon inside a control, which the control sizes and colours. */

import { createIn } from "@barqjs/css";

export const icon = createIn("barq.ui", {
  /** Not a press target, and not squeezed. */
  plain: {
    "& svg": { pointerEvents: "none", flexShrink: "0" },
  },

  /**
   * `size-4` on an icon that has not been given a size of its own.
   *
   * shadcn's `[&_svg:not([class*='size-'])]:size-4`, which is how a caller
   * overrides it: any `size-*` class on the icon takes the rule out.
   */
  sized: {
    '& svg:not([class*="size-"])': {
      width: "calc(var(--spacing) * 4)",
      height: "calc(var(--spacing) * 4)",
    },
  },

  /** And the colour, on the same terms. */
  muted: {
    '& svg:not([class*="text-"])': { color: "var(--muted-foreground)" },
  },
});
