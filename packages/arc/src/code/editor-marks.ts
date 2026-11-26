import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";

import type { CodeLineMark } from "./lines.ts";

/**
 * Lines of an editor marked as `CodeBlock` marks them: a tone's fill, a rule
 * at the start, and the label for a screen reader. A mark past the last line
 * is left out.
 */
export function lineMarks(marks: readonly CodeLineMark[]) {
  const ordered = marks.toSorted((a, b) => a.line - b.line);
  return EditorView.decorations.of((view): DecorationSet => {
    const builder = new RangeSetBuilder<Decoration>();
    const doc = view.state.doc;
    let last = 0;
    for (const mark of ordered) {
      if (mark.line < 1 || mark.line > doc.lines || mark.line === last) continue;
      last = mark.line;
      const attributes: Record<string, string> = { "data-mark": mark.tone ?? "neutral" };
      if (mark.label !== undefined && mark.label !== "") {
        attributes["data-mark-label"] = mark.label;
      }
      builder.add(
        doc.line(mark.line).from,
        doc.line(mark.line).from,
        Decoration.line({ attributes }),
      );
    }
    return builder.finish();
  });
}
