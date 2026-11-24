import { convertToExcalidrawElements } from "@excalidraw/element";
import type { MermaidConfig } from "@excalidraw/mermaid-to-excalidraw";

import type { BinaryFiles } from "./types.ts";

export interface MermaidScene {
  elements: ReturnType<typeof convertToExcalidrawElements>;
  files: BinaryFiles;
}

/**
 * A Mermaid definition as scene elements, through
 * `@excalidraw/mermaid-to-excalidraw` and `convertToExcalidrawElements`. The
 * converter parses with the document's `DOMParser`; where there is none it
 * draws the diagram as one image instead, which `files` then holds.
 *
 * Throws what the parser throws for a definition it cannot read.
 */
export async function mermaidToExcalidraw(
  definition: string,
  config?: MermaidConfig,
): Promise<MermaidScene> {
  const { parseMermaidToExcalidraw } = await import("@excalidraw/mermaid-to-excalidraw");
  const parsed = await parseMermaidToExcalidraw(definition, config);
  return {
    elements: convertToExcalidrawElements(parsed.elements, {
      regenerateIds: false,
    }),
    files: (parsed.files ?? {}) as unknown as BinaryFiles,
  };
}

export type { MermaidConfig };
