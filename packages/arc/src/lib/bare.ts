import { arcLayer as arc } from "../layer.ts";
import { place } from "./place.ts";
import { bg, edge, fg, interaction } from "../style/index.ts";

/** A `<button>` drawn as nothing but its content: no fill, no edge, no padding, the text around it. */
export const bareButton = arc(
  bg.transparent,
  edge.none,
  fg.inherit,
  interaction.pressable,
  place.unpadded,
  { font: "inherit" },
);
