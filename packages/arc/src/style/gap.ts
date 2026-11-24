import { arcLayer as arc } from "../layer.ts";
import { space } from "./tokens.ts";

/** Space between children, on the spacing scale. */
export const gap = arc.create({
  0: { gap: space.x0 },
  0.5: { gap: space.x0_5 },
  1: { gap: space.x1 },
  1.5: { gap: space.x1_5 },
  2: { gap: space.x2 },
  3: { gap: space.x3 },
  4: { gap: space.x4 },
  5: { gap: space.x5 },
  6: { gap: space.x6 },
  8: { gap: space.x8 },
  10: { gap: space.x10 },
  12: { gap: space.x12 },
});
