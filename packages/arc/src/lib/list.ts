import { arcLayer as arc } from "../layer.ts";
import { layout } from "../style/index.ts";

/** A `<ul>` or `<ol>` laid out by its parent: no bullets, no indent, no margin. */
export const plainList = arc(layout.flush, { padding: "0px", listStyle: "none" });
