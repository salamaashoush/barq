import { arcLayer as arc } from "../layer.ts";

/** An `::after` drawn over its positioned parent, for a part that adds a mark or a hit area of its own. */
export const afterLayer = arc({ "::after": { content: '""', position: "absolute" } });
