import { Loading, createMemo } from "@barqjs/core";
import type { LanguageSupport } from "@codemirror/language";

import { highlightLines } from "./highlight.ts";
import { type CodeLanguage, loadLanguage, loadedLanguage } from "./languages.ts";
import { lightHighlightLines } from "./light-highlight.ts";
import {
  type CodeLine,
  type CodeLineMark,
  type CodeLineRenderer,
  type CodeRange,
  clampRange,
  escapeHtml,
  lineCount,
  linesHtml,
  markLines,
} from "./lines.ts";
import { arcLayer as arc } from "../layer.ts";
import { staticCode } from "./style.ts";

export interface StaticCodeProps {
  code: string;
  language?: CodeLanguage;
  lineNumbers?: boolean;
  wrap?: boolean;
  /** Shown faint in the first line while `code` is empty. */
  placeholder?: string;
  /** Lines to mark, counted from 1. */
  marks?: readonly CodeLineMark[];
  /** Only these lines, numbered as they are in `code`. */
  range?: CodeRange;
  /** `light` colours with patterns and loads no grammar. @default "grammar" */
  highlighter?: "grammar" | "light";
  /** Draws the lines in place of the plain highlighted ones. */
  renderLines?: CodeLineRenderer;
  /** Leaves room for the editor's fold gutter. */
  folding?: boolean;
  class?: string;
  tabIndex?: number;
}

function placeholderHtml(text: string): string {
  return `<span data-line><span data-placeholder>${escapeHtml(text)}</span></span>`;
}

/**
 * `code` highlighted with no editor, as a `<pre>`.
 *
 * The highlighting is an async value: a language loads on first use, so a
 * server render waits for it and seeds the markup, and the browser adopts
 * that markup without loading the language at all. Until the language is
 * here in a browser-only render, the same lines show plain.
 */
interface Snapshot {
  code: string;
  name: string | undefined;
  light: boolean;
  placeholder: string | undefined;
  marks: readonly CodeLineMark[] | undefined;
  range: CodeRange | undefined;
  render: CodeLineRenderer | undefined;
}

function markup(what: Snapshot, support: LanguageSupport | undefined): string {
  if (what.code === "" && what.placeholder !== undefined) return placeholderHtml(what.placeholder);
  function highlight(text: string): string[] {
    return what.light ? lightHighlightLines(text, what.name) : highlightLines(text, support);
  }
  const lines: readonly CodeLine[] =
    what.render === undefined
      ? highlight(what.code).map((html) => ({ html }))
      : what.render(what.code, highlight);
  return linesHtml(markLines(lines, what.marks, what.range));
}

function lineStyle(range: CodeRange): Record<string, string> {
  const style: Record<string, string> = { "--code-digits": String(String(range.to).length) };
  if (range.from !== 1) style["--code-line-start"] = String(range.from - 1);
  return style;
}

export function StaticCode(props: StaticCodeProps) {
  function snapshot(): Snapshot {
    return {
      code: props.code,
      name: typeof props.language === "string" ? props.language : undefined,
      light: props.highlighter === "light",
      placeholder: props.placeholder,
      marks: props.marks,
      range: props.range,
      render: props.renderLines,
    };
  }
  const html = createMemo(
    () => {
      const what = snapshot();
      const language = what.light ? undefined : props.language;
      if (language === undefined) return markup(what, undefined);
      const ready = loadedLanguage(language);
      if (ready !== undefined) return markup(what, ready);
      return loadLanguage(language).then((support) => markup(what, support));
    },
    { deferStream: true },
  );
  function shown(): CodeRange {
    return clampRange(props.range, lineCount(props.code));
  }

  function pre(content: () => string) {
    return (
      <pre
        class={arc(staticCode, props.class)}
        data-slot="code-static"
        dir="ltr"
        data-numbered={props.lineNumbers === true ? "" : undefined}
        data-folding={props.folding === true ? "" : undefined}
        data-wrap={props.wrap === true ? "" : undefined}
        style={lineStyle(shown())}
        tabIndex={props.tabIndex}
        innerHTML={content()}
      />
    );
  }

  return <Loading fallback={pre(() => markup(snapshot(), undefined))}>{pre(html)}</Loading>;
}
