/**
 * Syntax colouring for the snippets a documentation page shows.
 *
 * Upstream runs `rehype-pretty-code` over a Shiki grammar at build time and
 * ships the result as inline `style` attributes. There is no build step here
 * that could do that and no highlighter small enough to put in the bundle, so
 * this is a hand-written scanner over the two languages the site actually
 * shows: TypeScript with JSX, and a shell command line.
 *
 * It is a SCANNER, not a parser. It does not know scope, types or whether an
 * identifier resolves; it knows what a token looks like. That is enough to
 * colour a snippet and honest about what it cannot do — a template literal
 * holding an expression is one string, and a regular expression is division.
 *
 * The palette is github-light and github-dark, which is what upstream's theme
 * resolves to, read off their card page as `#D73A49`/`#F97583` for a keyword,
 * `#032F62`/`#9ECBFF` for a string and `#24292E`/`#E1E4E8` for plain text.
 */

import { css } from "@barqjs/css";

/**
 * The palette and the rule that applies it, for any `<pre>` that shows tokens.
 *
 * github-light and github-dark, which is what upstream's Shiki theme resolves
 * to — read off their card page rather than off the theme's JSON. The colour
 * is keyed off the token's own attribute rather than a class per kind, so the
 * whole palette is one rule set a theme can reach.
 */
export const highlighted = css`
  --code-keyword: #d73a49;
  --code-string: #032f62;
  --code-comment: #6a737d;
  --code-number: #005cc5;
  --code-tag: #22863a;
  --code-attribute: #6f42c1;
  --code-property: #005cc5;
  --code-function: #6f42c1;

  :is(.dark) & {
    --code-keyword: #f97583;
    --code-string: #9ecbff;
    --code-comment: #6a737d;
    --code-number: #79b8ff;
    --code-tag: #85e89d;
    --code-attribute: #b392f0;
    --code-property: #79b8ff;
    --code-function: #b392f0;
  }

  & [data-token="keyword"] {
    color: var(--code-keyword);
  }
  & [data-token="string"] {
    color: var(--code-string);
  }
  & [data-token="comment"] {
    color: var(--code-comment);
    font-style: italic;
  }
  & [data-token="number"] {
    color: var(--code-number);
  }
  & [data-token="tag"] {
    color: var(--code-tag);
  }
  & [data-token="attribute"] {
    color: var(--code-attribute);
  }
  & [data-token="property"] {
    color: var(--code-property);
  }
  & [data-token="function"] {
    color: var(--code-function);
  }
`;

/** What a run of characters is, which is all the colour depends on. */
export type TokenKind =
  | "plain"
  | "comment"
  | "keyword"
  | "string"
  | "number"
  | "tag"
  | "attribute"
  | "property"
  | "function"
  | "punctuation";

export interface Token {
  readonly text: string;
  readonly kind: TokenKind;
}

const KEYWORDS = new Set([
  "import",
  "from",
  "export",
  "default",
  "const",
  "let",
  "var",
  "function",
  "return",
  "if",
  "else",
  "for",
  "while",
  "do",
  "switch",
  "case",
  "break",
  "continue",
  "new",
  "class",
  "extends",
  "implements",
  "interface",
  "type",
  "enum",
  "as",
  "of",
  "in",
  "typeof",
  "instanceof",
  "void",
  "delete",
  "await",
  "async",
  "yield",
  "throw",
  "try",
  "catch",
  "finally",
  "true",
  "false",
  "null",
  "undefined",
  "this",
  "super",
  "satisfies",
  "readonly",
  "declare",
]);

const IDENTIFIER = /[A-Za-z_$][\w$]*/y;
const NUMBER = /\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?/iy;

/** Whether the identifier at `at` is the name of a JSX element. */
function isTagName(source: string, start: number): boolean {
  for (let at = start - 1; at >= 0; at--) {
    const character = source[at] ?? "";
    if (character === " " || character === "\n" || character === "\t") continue;
    return character === "<" || character === "/";
  }
  return false;
}

/** Whether what follows the identifier ending at `at` is a call. */
function isCall(source: string, at: number): boolean {
  for (let scan = at; scan < source.length; scan++) {
    const character = source[scan] ?? "";
    if (character === " ") continue;
    return character === "(";
  }
  return false;
}

/** Whether what follows is `=`, which makes the identifier a JSX attribute. */
function isAttribute(source: string, at: number): boolean {
  for (let scan = at; scan < source.length; scan++) {
    const character = source[scan] ?? "";
    if (character === " ") continue;
    return character === "=";
  }
  return false;
}

/** The end of a quoted run beginning at `start`, past any escapes. */
function endOfString(source: string, start: number): number {
  const quote = source[start];
  for (let at = start + 1; at < source.length; at++) {
    if (source[at] === "\\") {
      at++;
      continue;
    }
    if (source[at] === quote) return at + 1;
    // A single- or double-quoted string does not span lines, and treating an
    // unterminated one as running to the end of the file colours the rest of
    // the snippet as a string.
    if (quote !== "`" && source[at] === "\n") return at;
  }
  return source.length;
}

/**
 * A shell command: the program, its flags and its quoted arguments.
 *
 * Separate from the TypeScript scanner because nothing carries over. `add` is
 * not a keyword and `--force` is not a decrement.
 */
export function shellTokens(source: string): readonly Token[] {
  const out: Token[] = [];
  const push = (text: string, kind: TokenKind): void => {
    if (text !== "") out.push({ text, kind });
  };

  for (const line of source.split("\n")) {
    if (out.length > 0) push("\n", "plain");
    if (line.trimStart().startsWith("#")) {
      push(line, "comment");
      continue;
    }
    let first = true;
    for (const [word] of line.matchAll(/\s+|[^\s]+/g)) {
      if (word.trim() === "") {
        push(word, "plain");
        continue;
      }
      if (word.startsWith("-")) push(word, "attribute");
      else if (word.startsWith('"') || word.startsWith("'")) push(word, "string");
      else if (first) push(word, "function");
      else push(word, "plain");
      first = false;
    }
  }
  return out;
}

/** TypeScript with JSX, scanned. */
export function codeTokens(source: string): readonly Token[] {
  const out: Token[] = [];
  const push = (text: string, kind: TokenKind): void => {
    if (text !== "") out.push({ text, kind });
  };

  let at = 0;
  let plain = 0;
  const flush = (to: number): void => {
    push(source.slice(plain, to), "plain");
  };

  while (at < source.length) {
    const character = source[at] ?? "";

    if (character === "/" && source[at + 1] === "/") {
      flush(at);
      const end = source.indexOf("\n", at);
      const stop = end === -1 ? source.length : end;
      push(source.slice(at, stop), "comment");
      at = stop;
      plain = at;
      continue;
    }

    if (character === "/" && source[at + 1] === "*") {
      flush(at);
      const end = source.indexOf("*/", at + 2);
      const stop = end === -1 ? source.length : end + 2;
      push(source.slice(at, stop), "comment");
      at = stop;
      plain = at;
      continue;
    }

    if (character === '"' || character === "'" || character === "`") {
      flush(at);
      const stop = endOfString(source, at);
      push(source.slice(at, stop), "string");
      at = stop;
      plain = at;
      continue;
    }

    if (/\d/.test(character) && !/[\w$]/.test(source[at - 1] ?? "")) {
      NUMBER.lastIndex = at;
      const found = NUMBER.exec(source);
      if (found !== null) {
        flush(at);
        push(found[0], "number");
        at += found[0].length;
        plain = at;
        continue;
      }
    }

    if (/[A-Za-z_$]/.test(character)) {
      IDENTIFIER.lastIndex = at;
      const found = IDENTIFIER.exec(source);
      if (found !== null) {
        const word = found[0];
        const after = at + word.length;
        let kind: TokenKind | null = null;
        if (KEYWORDS.has(word)) kind = "keyword";
        else if (isTagName(source, at)) kind = "tag";
        else if (isAttribute(source, after)) kind = "attribute";
        else if (isCall(source, after)) kind = "function";
        else if (source[at - 1] === ".") kind = "property";

        if (kind !== null) {
          flush(at);
          push(word, kind);
          at = after;
          plain = at;
          continue;
        }
        at = after;
        continue;
      }
    }

    at++;
  }
  flush(source.length);
  return out;
}
