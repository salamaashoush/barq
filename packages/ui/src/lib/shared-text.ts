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

  /**
   * A title's family, which is a separate choice from the body's.
   *
   * shadcn marks every title element `cn-font-heading` and lets the design
   * system decide what that is; `installTheme({ fonts: { heading } })` is that
   * decision here. The fallback is the body font rather than nothing, because
   * an undefined `var()` invalidates the declaration and would drop the title
   * to the browser's default serif — a page that had never asked for a heading
   * font would look broken rather than unchanged.
   */
  heading: {
    fontFamily: "var(--font-heading, var(--font-sans))",
  },
});
