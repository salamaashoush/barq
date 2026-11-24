/**
 * A control under forced colours and under a request for more contrast.
 *
 * A forced-colours mode (Windows High Contrast) replaces every colour on the
 * page with a short system palette, and three things a component draws in
 * colour alone vanish with it: a focus ring that is a box shadow (shadows are
 * dropped), a filled control whose edge was only its fill, and a selected or
 * checked state that was only a background. Each is redrawn here in the
 * system's own colours, `Highlight` for what is focused or chosen and
 * `GrayText` for what is disabled, which is what the platform's own controls
 * use and what the reader has tuned.
 *
 * `moreContrast` is the gentler request (`prefers-contrast: more`): the theme
 * keeps its colours, and a control's edge is drawn in the foreground instead of
 * the faint `--input` or `--border`.
 *
 * The conditions are `on.forcedColors` and `on.moreContrast` from
 * `conditions.ts`, spelled out because this package folds every style
 * object in its own module.
 */

import { layer } from "@barqjs/css";

const ui = layer("barq.ui");

export const contrast = ui.create({
  /** Focus as an outline, which a forced-colours mode keeps, where the ring was a shadow. */
  focus: {
    "@media (forced-colors: active)": {
      ":focus-visible": {
        outlineStyle: "solid",
        outlineWidth: "2px",
        outlineColor: "Highlight",
        outlineOffset: "2px",
      },
      "[data-focus-visible]": {
        outlineStyle: "solid",
        outlineWidth: "2px",
        outlineColor: "Highlight",
        outlineOffset: "2px",
      },
    },
  },

  /** An edge for a control whose edge was its fill. */
  edge: {
    "@media (forced-colors: active)": {
      borderStyle: "solid",
      borderWidth: "1px",
      borderColor: "ButtonText",
    },
    "@media (prefers-contrast: more)": {
      borderColor: "var(--foreground)",
    },
  },

  /** Selected, checked, pressed or highlighted, in the system's highlight. */
  selected: {
    "@media (forced-colors: active)": {
      ':is([data-selected], [data-focused], [aria-selected="true"], [aria-checked="true"], [aria-pressed="true"], [data-state="checked"], [data-state="on"])':
        {
          forcedColorAdjust: "none",
          backgroundColor: "Highlight",
          borderColor: "Highlight",
          color: "HighlightText",
        },
    },
  },

  /** Disabled, in the system's disabled text, at full opacity so it still reads. */
  disabled: {
    "@media (forced-colors: active)": {
      ':is(:disabled, [data-disabled], [aria-disabled="true"])': {
        opacity: "1",
        borderColor: "GrayText",
        color: "GrayText",
      },
    },
  },
});
