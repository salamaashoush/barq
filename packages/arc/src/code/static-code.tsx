import { Loading, createMemo } from "@barqjs/core";

import { highlightHtml, lineCount } from "./highlight.ts";
import { type CodeLanguage, loadLanguage, loadedLanguage } from "./languages.ts";
import { staticCode } from "./style.ts";

export interface StaticCodeProps {
  code: string;
  language?: CodeLanguage;
  lineNumbers?: boolean;
  wrap?: boolean;
  /** Shown faint in the first line while `code` is empty. */
  placeholder?: string;
  class?: string;
  tabIndex?: number;
}

function placeholderHtml(text: string): string {
  const escaped = text.replace(/[&<>]/g, (one) =>
    one === "&" ? "&amp;" : one === "<" ? "&lt;" : "&gt;",
  );
  return `<span data-line><span data-placeholder>${escaped}</span></span>`;
}

/**
 * `code` highlighted with no editor, as a `<pre>`.
 *
 * The highlighting is an async value: a language loads on first use, so a
 * server render waits for it and seeds the markup, and the browser adopts
 * that markup without loading the language at all. Until the language is
 * here in a browser-only render, the same lines show plain.
 */
export function StaticCode(props: StaticCodeProps) {
  const html = createMemo(
    () => {
      const code = props.code;
      const language = props.language;
      if (code === "" && props.placeholder !== undefined) return placeholderHtml(props.placeholder);
      if (language === undefined) return highlightHtml(code);
      const ready = loadedLanguage(language);
      if (ready !== undefined) return highlightHtml(code, ready);
      return loadLanguage(language).then((support) => highlightHtml(code, support));
    },
    { deferStream: true },
  );

  function pre(markup: () => string) {
    return (
      <pre
        class={[staticCode, props.class]}
        data-slot="code-static"
        data-numbered={props.lineNumbers === true ? "" : undefined}
        data-wrap={props.wrap === true ? "" : undefined}
        style={{ "--code-digits": String(String(lineCount(props.code)).length) }}
        tabIndex={props.tabIndex}
        innerHTML={markup()}
      />
    );
  }

  return <Loading fallback={pre(() => highlightHtml(props.code))}>{pre(html)}</Loading>;
}
