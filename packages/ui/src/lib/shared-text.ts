/** Type: the two treatments almost every slot in the package wears. */

import { layer } from "@barqjs/css";

const ui = layer("barq.ui");

export const text = ui.create({
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
