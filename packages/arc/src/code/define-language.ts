import {
  type IndentContext,
  LanguageSupport,
  StreamLanguage,
  type StreamParser,
  type StringStream,
  foldService,
  matchBrackets,
} from "@codemirror/language";
import type { EditorState } from "@codemirror/state";

/** A kind of string literal: where it opens and closes, and how a quote inside is escaped. */
export interface StringRule {
  open: string;
  /** @default the same as `open` */
  close?: string;
  /** Takes the next character literally. `null` for none. @default "\\" */
  escape?: string | null;
  /** Runs on past the end of a line, as a template or a raw block does. @default false */
  multiline?: boolean;
}

export interface BlockComment {
  open: string;
  close: string;
  /** A comment opened inside one closes before the outer one does. @default false */
  nested?: boolean;
}

export interface CommentRules {
  /** What starts a comment that runs to the end of the line. */
  line?: string | readonly string[];
  block?: BlockComment;
}

/**
 * A language described by its words and punctuation, which `defineLanguage`
 * turns into an editor language: highlighting, indentation, comments,
 * brackets that close themselves and blocks that fold.
 */
export interface LanguageDefinition {
  /** Names the language to a language server, and in a fenced code block. */
  name: string;
  keywords?: readonly string[];
  /** Words drawn as types: `int`, `List`. */
  types?: readonly string[];
  /** Words drawn as values: `true`, `false`, `nil`. */
  constants?: readonly string[];
  /** Words drawn as functions: what the language provides. */
  builtins?: readonly string[];
  /** Matched longest first, so `==` is one operator rather than two `=`. */
  operators?: readonly string[];
  /** @default double and single quotes, escaped with a backslash */
  strings?: readonly StringRule[];
  comments?: CommentRules;
  /** Matched at the start of the rest of a line. @default decimals, exponents, hex and `_` separators */
  numbers?: RegExp;
  /** Matched at the start of the rest of a line. @default a letter or `_`, then letters, digits and `_` */
  identifiers?: RegExp;
  /** Pairs, opener then closer. They indent what they hold and fold. @default "()[]{}" */
  brackets?: string;
  /** Typed openers whose closer goes in with them. @default every bracket opener and string quote */
  autoClose?: readonly string[];
  /**
   * A line that, once typed, is indented again: by default a line that is
   * only a closing bracket.
   */
  indentOnInput?: RegExp;
  /** Keywords match whatever their case. @default false */
  caseInsensitive?: boolean;
}

interface Scanner {
  readonly definition: LanguageDefinition;
  readonly words: ReadonlyMap<string, string>;
  readonly operators: readonly string[];
  readonly strings: readonly StringRule[];
  readonly lineComments: readonly string[];
  readonly openers: string;
  readonly closers: string;
  readonly numbers: RegExp;
  readonly identifiers: RegExp;
}

interface ScanState {
  /** The brackets open at this point, innermost last. */
  open: string[];
  string: StringRule | null;
  /** How deep in block comments, 0 outside one. */
  comment: number;
}

const DEFAULT_STRINGS: readonly StringRule[] = [{ open: '"' }, { open: "'" }];
const DEFAULT_NUMBERS =
  /^(?:0[xX][\da-fA-F_]+|0[bB][01_]+|(?:\d[\d_]*)?\.?\d[\d_]*(?:[eE][+-]?\d+)?)/;
const DEFAULT_IDENTIFIERS = /^[A-Za-z_][\w]*/;
const PUNCTUATION = /^[,;.:]/;

function escapePattern(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

function scannerOf(definition: LanguageDefinition): Scanner {
  const words = new Map<string, string>();
  function add(list: readonly string[] | undefined, token: string): void {
    for (const word of list ?? []) {
      words.set(definition.caseInsensitive === true ? word.toLowerCase() : word, token);
    }
  }
  add(definition.builtins, "variableName.function.standard");
  add(definition.constants, "atom");
  add(definition.types, "typeName");
  add(definition.keywords, "keyword");
  const brackets = definition.brackets ?? "()[]{}";
  let openers = "";
  let closers = "";
  for (let at = 0; at + 1 < brackets.length; at += 2) {
    openers += brackets[at];
    closers += brackets[at + 1];
  }
  const line = definition.comments?.line;
  return {
    definition,
    words,
    operators: (definition.operators ?? []).toSorted((a, b) => b.length - a.length),
    strings: definition.strings ?? DEFAULT_STRINGS,
    lineComments: line === undefined ? [] : typeof line === "string" ? [line] : line,
    openers,
    closers,
    numbers: definition.numbers ?? DEFAULT_NUMBERS,
    identifiers: definition.identifiers ?? DEFAULT_IDENTIFIERS,
  };
}

function readString(stream: StringStream, state: ScanState): string {
  const rule = state.string;
  if (rule === null) return "string";
  const close = rule.close ?? rule.open;
  const escape = rule.escape === undefined ? "\\" : rule.escape;
  while (!stream.eol()) {
    if (escape !== null && stream.match(escape)) {
      stream.next();
      continue;
    }
    if (stream.match(close)) {
      state.string = null;
      return "string";
    }
    stream.next();
  }
  if (rule.multiline !== true) state.string = null;
  return "string";
}

function readComment(stream: StringStream, state: ScanState, block: BlockComment): string {
  while (!stream.eol()) {
    if (block.nested === true && stream.match(block.open)) {
      state.comment++;
      continue;
    }
    if (stream.match(block.close)) {
      state.comment--;
      if (state.comment === 0) return "blockComment";
      continue;
    }
    stream.next();
  }
  return "blockComment";
}

function readToken(scanner: Scanner, stream: StringStream, state: ScanState): string | null {
  const block = scanner.definition.comments?.block;
  if (state.string !== null) return readString(stream, state);
  if (state.comment > 0 && block !== undefined) return readComment(stream, state, block);
  if (stream.eatSpace()) return null;
  if (block !== undefined && stream.match(block.open)) {
    state.comment = 1;
    return readComment(stream, state, block);
  }
  for (const prefix of scanner.lineComments) {
    if (stream.match(prefix)) {
      stream.skipToEnd();
      return "lineComment";
    }
  }
  for (const rule of scanner.strings) {
    if (stream.match(rule.open)) {
      state.string = rule;
      return readString(stream, state);
    }
  }
  if (stream.match(scanner.numbers)) return "number";
  const word = stream.match(scanner.identifiers);
  if (word !== null && word !== true && word !== false) {
    const text = scanner.definition.caseInsensitive === true ? word[0].toLowerCase() : word[0];
    const known = scanner.words.get(text);
    if (known !== undefined) return known;
    return stream.match(/^\s*\(/, false) === null ? "variableName" : "variableName.function";
  }
  const next = stream.peek() ?? "";
  if (scanner.openers.includes(next)) {
    stream.next();
    state.open.push(next);
    return "bracket";
  }
  if (scanner.closers.includes(next)) {
    stream.next();
    const opener = scanner.openers[scanner.closers.indexOf(next)];
    const at = state.open.lastIndexOf(opener ?? "");
    if (at >= 0) state.open.length = at;
    return "bracket";
  }
  for (const operator of scanner.operators) {
    if (stream.match(operator)) return "operator";
  }
  if (stream.match(PUNCTUATION)) return "punctuation";
  stream.next();
  return null;
}

function languageData(
  scanner: Scanner,
  block: BlockComment | undefined,
  line: string | undefined,
): Record<string, unknown> {
  const data: Record<string, unknown> = {
    commentTokens: {
      ...(line === undefined ? {} : { line }),
      ...(block === undefined ? {} : { block: { open: block.open, close: block.close } }),
    },
    closeBrackets: {
      brackets: scanner.definition.autoClose ?? [
        ...scanner.openers.split(""),
        ...scanner.strings.filter((rule) => rule.open.length === 1).map((rule) => rule.open),
      ],
    },
  };
  const reindent =
    scanner.definition.indentOnInput ??
    (scanner.closers === "" ? undefined : new RegExp(`^\\s*[${escapePattern(scanner.closers)}]$`));
  if (reindent !== undefined) data.indentOnInput = reindent;
  return data;
}

function parserOf(scanner: Scanner): StreamParser<ScanState> {
  const block = scanner.definition.comments?.block;
  const line = scanner.lineComments[0];
  return {
    name: scanner.definition.name,
    startState: () => ({ open: [], string: null, comment: 0 }),
    copyState: (state) => ({ open: [...state.open], string: state.string, comment: state.comment }),
    token: (stream, state) => readToken(scanner, stream, state),
    indent: (state: ScanState, textAfter: string, context: IndentContext) => {
      if (state.string !== null || state.comment > 0) return null;
      const closes = textAfter.length > 0 && scanner.closers.includes(textAfter[0] ?? "");
      return Math.max(0, state.open.length - (closes ? 1 : 0)) * context.unit;
    },
    languageData: languageData(scanner, block, line),
  };
}

/** Folds from an opening bracket at the end of a line to its partner on a later one. */
function bracketFolds(scanner: Scanner) {
  return foldService.of((state: EditorState, from: number, to: number) => {
    const text = state.sliceDoc(from, to);
    for (let at = text.length - 1; at >= 0; at--) {
      const char = text[at] ?? "";
      if (/\s/.test(char)) continue;
      if (!scanner.openers.includes(char)) return null;
      const match = matchBrackets(state, from + at, 1);
      if (match?.end === undefined || !match.matched) return null;
      if (state.doc.lineAt(match.end.from).number === state.doc.lineAt(from).number) return null;
      return { from: from + at + 1, to: match.end.from };
    }
    return null;
  });
}

/**
 * An editor language from a description of its words and punctuation, with
 * no grammar to write: keywords, types, constants and builtins coloured as
 * arc's themes colour them, strings and comments that span lines, operators
 * matched longest first, brackets that indent, close themselves and fold,
 * and the comment keys.
 *
 * ```ts
 * const toy = defineLanguage({
 *   name: "toy",
 *   keywords: ["let", "fn", "if", "else", "return"],
 *   constants: ["true", "false", "nil"],
 *   operators: ["==", "!=", "->", "=", "+", "-", "*", "/"],
 *   comments: { line: "#", block: { open: "#[", close: "]#" } },
 * });
 * registerLanguage("toy", async () => toy, ["ty"]);
 * ```
 *
 * The result is a `LanguageSupport`, so `CodeEditor`, `CodeBlock` and the
 * server's render highlight with it alike, and a language server's semantic
 * tokens draw over it.
 */
export function defineLanguage(definition: LanguageDefinition): LanguageSupport {
  const scanner = scannerOf(definition);
  const language = StreamLanguage.define(parserOf(scanner));
  return new LanguageSupport(language, scanner.openers === "" ? [] : [bracketFolds(scanner)]);
}
