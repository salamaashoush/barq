const ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

/** Text made safe to write as an element's content. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>]/g, (one) => ESCAPES[one] ?? one);
}

function escapeAttribute(text: string): string {
  return text.replace(/[&<>"]/g, (one) => ESCAPES[one] ?? one);
}

/** One line of a static code rendering: its markup, and attributes for its `<span data-line>`. */
export interface CodeLine {
  html: string;
  attributes?: Readonly<Record<string, string>>;
}

/** Highlights text with whatever highlighter the rendering uses: one string of HTML per line. */
export type HighlightText = (text: string) => string[];

/**
 * Draws `code`'s lines in place of the plain highlighted ones, with
 * `highlight` for whatever part of them is code.
 */
export type CodeLineRenderer = (code: string, highlight: HighlightText) => readonly CodeLine[];

/** The tones a marked line can carry: arc's status tones. */
export type CodeMarkTone = "danger" | "warning" | "info" | "success" | "neutral";

export interface CodeLineMark {
  /** The line, counted from 1. */
  line: number;
  /** @default "neutral" */
  tone?: CodeMarkTone;
  /** What a screen reader hears before the line, such as "Error" or "Failed here". */
  label?: string;
}

/** Lines `from` to `to`, counted from 1, both included. */
export interface CodeRange {
  from: number;
  to: number;
}

/** How many lines `code` has, as an editor counts them. */
export function lineCount(code: string): number {
  let count = 1;
  for (let at = code.indexOf("\n"); at !== -1; at = code.indexOf("\n", at + 1)) count++;
  return count;
}

/**
 * The lines around `line` in `code`: `context` before and after, cut at the
 * first and last line. What a failure shows of the script it failed in.
 */
export function rangeAround(code: string, line: number, context = 3): CodeRange {
  const last = lineCount(code);
  const at = Math.min(Math.max(1, Math.trunc(line)), last);
  return { from: Math.max(1, at - context), to: Math.min(last, at + context) };
}

/** `range` cut to the lines `count` has. */
export function clampRange(range: CodeRange | undefined, count: number): CodeRange {
  if (range === undefined) return { from: 1, to: count };
  const from = Math.min(Math.max(1, Math.trunc(range.from)), count);
  return { from, to: Math.min(Math.max(from, Math.trunc(range.to)), count) };
}

/** Each line in `range`, with its mark's tone and label as attributes. */
export function markLines(
  lines: readonly CodeLine[],
  marks: readonly CodeLineMark[] | undefined,
  range: CodeRange | undefined,
): CodeLine[] {
  const { from, to } = clampRange(range, Math.max(1, lines.length));
  const byLine = new Map<number, CodeLineMark>();
  for (const mark of marks ?? []) byLine.set(mark.line, mark);
  const out: CodeLine[] = [];
  for (let number = from; number <= to; number++) {
    const line = lines[number - 1] ?? { html: "" };
    const mark = byLine.get(number);
    if (mark === undefined) {
      out.push(line);
      continue;
    }
    const attributes: Record<string, string> = {
      ...line.attributes,
      "data-mark": mark.tone ?? "neutral",
    };
    if (mark.label !== undefined && mark.label !== "") attributes["data-mark-label"] = mark.label;
    out.push({ html: line.html, attributes });
  }
  return out;
}

/** The lines as the `<pre>`'s markup: one `<span data-line>` each, joined by newlines. */
export function linesHtml(lines: readonly CodeLine[]): string {
  return lines
    .map((line) => {
      let attributes = "";
      for (const [name, value] of Object.entries(line.attributes ?? {})) {
        attributes += ` ${name}="${escapeAttribute(value)}"`;
      }
      return `<span data-line${attributes}>${line.html}</span>`;
    })
    .join("\n");
}

/** The text of lines `range` of `code`, for a copy of what an excerpt shows. */
export function sliceLines(code: string, range: CodeRange | undefined): string {
  if (range === undefined) return code;
  const lines = code.split("\n");
  const { from, to } = clampRange(range, lines.length);
  return lines.slice(from - 1, to).join("\n");
}
