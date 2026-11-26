import type { Scope } from "@barqjs/core";
import { Facet } from "@codemirror/state";

/** The component an editor belongs to, so what it draws in a tooltip reads that component's contexts. */
export const editorOwner = Facet.define<Scope | null, Scope | null>({
  combine: (values) => values[0] ?? null,
});
