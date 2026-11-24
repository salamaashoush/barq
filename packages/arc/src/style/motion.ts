import { on } from "@barqjs/ui/conditions";

import { arcLayer as arc } from "../layer.ts";
import { motionTokens } from "./tokens.ts";

/** The quick duration, gone under reduced motion, on the standard curve. */
const quick = arc({
  transitionDuration: { default: motionTokens.fast, [on.reducedMotion]: "0s" },
  transitionTimingFunction: motionTokens.standard,
});

/**
 * Movement, which stops under reduced motion: the duration goes to nothing
 * rather than the transition going away, so a state still lands.
 */
export const motion = {
  colours: arc(quick, { transitionProperty: "color, background-color, border-color, box-shadow" }),
  transform: arc(quick, { transitionProperty: "rotate, scale, translate, transform" }),
  /** For something arriving: the emphasized curve, which decelerates into place. */
  enter: arc({
    transitionDuration: { default: motionTokens.base, [on.reducedMotion]: "0s" },
    transitionTimingFunction: motionTokens.emphasized,
  }),
};
