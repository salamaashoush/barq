import { escapeHtml } from "./lines.ts";

type Classify = string | ((match: RegExpExecArray) => string);

interface Rule {
  pattern: RegExp;
  token: Classify;
}

function rule(pattern: RegExp, token: Classify): Rule {
  return { pattern, token };
}

const STRING = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/y;
const SCRIPT_STRING = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/y;
const KEYWORDS =
  /\b(?:await|async|break|case|catch|class|const|continue|default|delete|do|else|enum|export|extends|finally|for|from|function|if|implements|import|in|instanceof|interface|let|new|of|return|satisfies|static|switch|throw|try|type|typeof|var|void|while|yield|true|false|null|undefined)\b/y;

function keywordOrValue(match: RegExpExecArray): string {
  return /^(?:true|false|null|undefined)$/.test(match[0]) ? "tok-number" : "tok-keyword";
}

/**
 * Patterns tried in order at each position, the first that matches taking
 * the text. Each is sticky (`y`), so it matches only where the scan stands.
 */
const RULES: Readonly<Record<string, readonly Rule[]>> = {
  shell: [
    rule(/#.*/y, "tok-comment"),
    rule(STRING, "tok-string"),
    rule(/\$\{?[A-Za-z_]\w*\}?|\$\(/y, "tok-number"),
    rule(/(?<=\s|^)--?[A-Za-z][\w-]*/my, "tok-property"),
    rule(/(?<=^\s*|[|&;]\s*|\$\(\s*)[A-Za-z_][\w.-]*(?==)/my, "tok-property"),
    rule(/(?<=^\s*|[|&;]\s*|\$\(\s*)[\w./-]+/my, "tok-function"),
  ],
  toml: [
    rule(/#.*/y, "tok-comment"),
    rule(STRING, "tok-string"),
    rule(/^\s*\[\[?[^\]\n]+\]\]?/my, "tok-type"),
    rule(/[A-Za-z_][\w.-]*(?=\s*=)/y, "tok-property"),
    rule(/\b(?:true|false|-?\d+(?:\.\d+)?)\b/y, "tok-number"),
  ],
  yaml: [
    rule(/#.*/y, "tok-comment"),
    rule(STRING, "tok-string"),
    rule(/[A-Za-z_][\w.-]*(?=:(?:\s|$))/my, "tok-property"),
    rule(/\$\{\{[^}]*\}\}/y, "tok-number"),
    rule(/(?<=:\s+|-\s+)(?:true|false|null|-?\d+(?:\.\d+)?)(?=\s*$)/my, "tok-number"),
  ],
  json: [
    rule(/"(?:[^"\\\n]|\\.)*"(?=\s*:)/y, "tok-property"),
    rule(STRING, "tok-string"),
    rule(/\b(?:true|false|null)\b|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/y, "tok-number"),
    rule(/[{}[\],:]/y, "tok-punctuation"),
  ],
  typescript: [
    rule(/\/\/.*/y, "tok-comment"),
    rule(/\/\*[\s\S]*?(?:\*\/|$)/y, "tok-comment"),
    rule(SCRIPT_STRING, "tok-string"),
    rule(KEYWORDS, keywordOrValue),
    rule(/\b\d+(?:\.\d+)?\b/y, "tok-number"),
    rule(/(?<=:\s*|<\s*)[A-Z][\w$]*/y, "tok-type"),
    rule(/[A-Za-z_$][\w$]*(?=\s*\()/y, "tok-function"),
    rule(/(?<=\.)[A-Za-z_$][\w$]*/y, "tok-property"),
  ],
};

const ALIASES: Readonly<Record<string, string>> = {
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  console: "shell",
  yml: "yaml",
  jsonc: "json",
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  javascript: "typescript",
  js: "typescript",
  jsx: "typescript",
  mjs: "typescript",
};

function rulesOf(language: string): readonly Rule[] | undefined {
  const key = language.toLowerCase();
  return RULES[ALIASES[key] ?? key];
}

/** The names the light highlighter colours, aliases left out. */
export function lightLanguageNames(): string[] {
  return Object.keys(RULES);
}

/** Whether the light highlighter colours `language`, by its name or an alias. */
export function isLightLanguage(language: string): boolean {
  return rulesOf(language) !== undefined;
}

/**
 * `code` as one string of HTML per line, coloured by a few regular
 * expressions per language into the same `tok-*` classes the grammars use.
 *
 * For the snippets of a page that must not load a grammar, such as a
 * marketing page: shell, TOML, YAML, JSON and TypeScript (JavaScript too),
 * by name or alias. It knows no syntax, so it is close rather than exact;
 * another language is plain.
 */
export function lightHighlightLines(code: string, language: string | undefined): string[] {
  const rules = language === undefined ? undefined : rulesOf(language);
  const lines: string[] = [];
  let line = "";
  function put(text: string, token: string | undefined): void {
    const pieces = text.split("\n");
    pieces.forEach((piece, index) => {
      if (index > 0) {
        lines.push(line);
        line = "";
      }
      if (piece === "") return;
      line +=
        token === undefined
          ? escapeHtml(piece)
          : `<span class="${token}">${escapeHtml(piece)}</span>`;
    });
  }
  if (rules === undefined) {
    put(code, undefined);
    lines.push(line);
    return lines;
  }
  let plain = "";
  let at = 0;
  scan: while (at < code.length) {
    for (const { pattern, token } of rules) {
      pattern.lastIndex = at;
      const match = pattern.exec(code);
      if (match === null || match[0].length === 0) continue;
      put(plain, undefined);
      plain = "";
      put(match[0], typeof token === "string" ? token : token(match));
      at += match[0].length;
      continue scan;
    }
    plain += code[at];
    at += 1;
  }
  put(plain, undefined);
  lines.push(line);
  return lines;
}
