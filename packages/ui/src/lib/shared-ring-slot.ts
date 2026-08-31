/**
 * The same rings, keyed off what `@barqjs/aria` writes.
 *
 * A component whose focus is managed rather than the browser's, a menu item or
 * a calendar day, carries `data-focus-visible` and never matches the
 * pseudo-class; a field validated by the library carries `data-invalid` rather
 * than `aria-invalid`. Same look, different selector, and a component wears one
 * pair or the other.
 */

import { createIn } from "@barqjs/css";

export const ringSlot = createIn("barq.ui", {
  focus: {
    "[data-focus-visible]": {
      borderColor: "var(--ring)",
      "--ui-ring-shadow":
        "var(--ui-ring-inset,) 0 0 0 calc(3px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
      boxShadow:
        "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
      "--ui-ring-color": "var(--ring)",
      "@supports (color: color-mix(in lab, red, red))": {
        "--ui-ring-color": "color-mix(in oklab, var(--ring) 50%, transparent)",
      },
    },
  },

  invalid: {
    "[data-invalid]": {
      borderColor: "var(--destructive)",
      "--ui-ring-color": "var(--destructive)",
      "@supports (color: color-mix(in lab, red, red))": {
        "--ui-ring-color": "color-mix(in oklab, var(--destructive) 20%, transparent)",
      },
    },
  },

  invalidDark: {
    ":is(.dark *)[data-invalid]": {
      "--ui-ring-color": "var(--destructive)",
      "@supports (color: color-mix(in lab, red, red))": {
        "--ui-ring-color": "color-mix(in oklab, var(--destructive) 40%, transparent)",
      },
    },
  },
});
