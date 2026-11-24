import { arcLayer as arc } from "../layer.ts";
import { space } from "../style/index.ts";

/**
 * A square on the spacing scale, for a part drawn at a fixed size: a swatch,
 * a star, a thumb, an icon button that is not one of ui's.
 */
export const square = arc.create({
  x4: { width: space.x4, height: space.x4 },
  x5: { width: space.x5, height: space.x5 },
  x6: { width: space.x6, height: space.x6 },
  x8: { width: space.x8, height: space.x8 },
});
