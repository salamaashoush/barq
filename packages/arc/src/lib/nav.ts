import { tokens } from "@barqjs/ui/theme/tokens";

import { arcLayer as arc } from "../layer.ts";

/** A link in a list of places: no underline, and the current one in the full text colour. */
export const navLink = arc({
  textDecorationLine: "none",
  "[aria-current]": { color: tokens.foreground },
});
