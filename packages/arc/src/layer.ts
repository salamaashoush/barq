import { layer } from "@barqjs/css";

import "@barqjs/ui/theme/layers";

/** arc's rules: after `@barqjs/ui`'s and its styles, before anything an app writes unlayered. */
export const arcLayer = layer("barq.arc");
