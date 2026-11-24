import { readProp } from "@barqjs/core";
import type { JSX } from "@barqjs/web";

import { hostSlot, isHostChild } from "./host-children.ts";

import type { DiagramToCodeOptions } from "../editor/magic-frame.ts";

/**
 * Excalidraw's `DiagramToCodePlugin`, given to `<DiagramEditor>` as a child:
 * the app's wireframe-to-code backend, which the magic frame generates with.
 * Without it, the magic frame is not offered.
 */
export function DiagramToCodePlugin(props: DiagramToCodeOptions): JSX.Element {
  // no JSX here: the compiler does not read the props for it
  return isHostChild()
    ? hostSlot("diagramToCode", {
        get generate() {
          return readProp(props.generate) as DiagramToCodeOptions["generate"];
        },
      })
    : null;
}
