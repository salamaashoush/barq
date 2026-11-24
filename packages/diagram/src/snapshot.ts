import { type TextMetricsProvider, getNonDeletedElements } from "@excalidraw/element";
import type { Theme } from "@excalidraw/element/types";

import { Fonts } from "./fonts/fonts.ts";
import { restoreElements } from "./data/restore.ts";
import { exportScene } from "./scene/export.ts";
import { createSvgDocument } from "./svg-document.ts";
import type { DiagramScene } from "./data/types.ts";

export interface SvgStringOptions {
  theme?: Theme;
  /** @default 10 */
  padding?: number;
  /** Paint the scene's background color. @default true */
  background?: boolean;
  /**
   * Measures text where the export lays some out itself (frame names). In a
   * browser a canvas does; elsewhere the default estimates from the font size.
   */
  textMetrics?: TextMetricsProvider;
}

/** Half an em per character, a whole one for wide (CJK) characters. */
const estimatedMetrics: TextMetricsProvider = {
  getLineWidth(text, fontString) {
    const size = Number(/(\d+(?:\.\d+)?)px/.exec(fontString)?.[1] ?? 16);
    let width = 0;
    for (const char of text) {
      width +=
        /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/.test(
          char,
        )
          ? size
          : size * 0.5;
    }
    return width;
  },
};

/**
 * The scene as SVG markup, in a browser or in a process with no DOM. Text
 * names its fonts by URL rather than inlining them, so the markup stays small
 * and a page that has the fonts draws it at once. The viewer's `snapshot`.
 */
export async function exportToSvgString(
  scene: DiagramScene,
  options: SvgStringOptions = {},
): Promise<string> {
  const elements = getNonDeletedElements(restoreElements(scene.elements, null));
  const svg = await exportScene({
    type: "svg",
    data: { elements, appState: scene.appState ?? {}, files: scene.files ?? null },
    config: {
      theme: options.theme ?? "light",
      padding: options.padding ?? 10,
      ...(options.background === false ? { canvasBackgroundColor: false as const } : {}),
      skipInliningFonts: true,
      environment: {
        ...(typeof document === "undefined"
          ? { document: createSvgDocument(), textMetrics: options.textMetrics ?? estimatedMetrics }
          : {
              document,
              ...(options.textMetrics === undefined ? {} : { textMetrics: options.textMetrics }),
            }),
        loadFonts: async () => {},
      },
    },
  });
  const style = svg.querySelector(".style-fonts");
  if (style !== null) style.textContent = Fonts.fontFaceRules(elements);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  return svg.outerHTML;
}
