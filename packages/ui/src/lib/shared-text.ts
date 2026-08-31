/** Type: the two treatments almost every slot in the package wears. */

import { createIn } from "@barqjs/css";

export const text = createIn("barq.ui", {
  /** `text-sm`, which carries a line height with it. */
  sm: {
    fontSize: "var(--text-sm)",
    lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
  },

  /** `font-medium`, and the custom property a descendant reads it back from. */
  medium: {
    "--ui-font-weight": "var(--font-weight-medium)",
    fontWeight: "var(--font-weight-medium)",
  },
});
