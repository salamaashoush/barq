import { layer } from "@barqjs/css";

import "@barqjs/ui/theme/layers";

/** The editor UI's rules: after `@barqjs/ui`'s and arc's, before anything an app writes unlayered. */
export const diagramLayer = layer("barq.diagram");
