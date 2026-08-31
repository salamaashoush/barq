/**
 * The ring, on an element the BROWSER decides the state of.
 *
 * `:focus-visible` and `[aria-invalid]` are both the platform's, so a component
 * that hands its state to a native control wears these. One that lets
 * `@barqjs/aria` manage focus wears `ring-slot.ts` instead, and almost nothing
 * wears both: they are separate files so a button does not ship a menu item's
 * ring.
 */

import { createIn } from "@barqjs/css";

export const ring = createIn("barq.ui", {
  focus: {
    ":focus-visible": {
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

  /** `aria-invalid:` — the destructive border and ring. */
  invalid: {
    '[aria-invalid="true"]': {
      borderColor: "var(--destructive)",
      "--ui-ring-color": "var(--destructive)",
      "@supports (color: color-mix(in lab, red, red))": {
        "--ui-ring-color": "color-mix(in oklab, var(--destructive) 20%, transparent)",
      },
    },
  },

  /** Its dark half, which is a different mix and a separate opt-in. */
  invalidDark: {
    ':is(.dark *)[aria-invalid="true"]': {
      "--ui-ring-color": "var(--destructive)",
      "@supports (color: color-mix(in lab, red, red))": {
        "--ui-ring-color": "color-mix(in oklab, var(--destructive) 40%, transparent)",
      },
    },
  },
});
