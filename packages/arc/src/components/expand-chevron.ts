import { arcLayer as arc } from "../layer.ts";
import { motion } from "../style/index.ts";

/**
 * The chevron of a button that opens what is under it: pointing along the
 * line, turned down while open, mirrored on a right-to-left page.
 */
export const expandChevron = arc(motion.transform, {
  '[aria-expanded="true"] > &': { rotate: "90deg" },
  "&:dir(rtl)": { scale: "-1 1" },
  '[aria-expanded="true"] > &:dir(rtl)': { rotate: "-90deg" },
});
