import { type Extension, RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
import type * as lsp from "vscode-languageserver-protocol";

import { askMapped, fileFeature, mappedOffset } from "./lsp-context.ts";

/** Semantic token types and modifiers, by their LSP names, to the class names that colour them. */
export type SemanticTokenClasses = Readonly<Record<string, string>>;

/**
 * Arc's colours for the server's token types: the same `tok-*` classes the
 * grammar's highlighting uses, so the theme's `code-*` tokens colour both
 * alike. Every token also carries `cm-semantic-<type>` for an app's own rule.
 */
export const semanticTokenClasses: SemanticTokenClasses = {
  namespace: "tok-type",
  type: "tok-type",
  class: "tok-type",
  enum: "tok-type",
  interface: "tok-type",
  struct: "tok-type",
  typeParameter: "tok-type",
  property: "tok-property",
  event: "tok-property",
  enumMember: "tok-number",
  function: "tok-function",
  method: "tok-function",
  macro: "tok-function",
  decorator: "tok-function",
  keyword: "tok-keyword",
  modifier: "tok-keyword",
  comment: "tok-comment",
  string: "tok-string",
  regexp: "tok-string",
  number: "tok-number",
  operator: "tok-punctuation",
  deprecated: "cm-semantic-deprecated",
};

/** Milliseconds after the last edit before the tokens are asked for again. */
const TOKEN_DELAY = 300;

const setTokens = StateEffect.define<DecorationSet>();

const tokenField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update: (tokens, transaction) => {
    for (const effect of transaction.effects) if (effect.is(setTokens)) return effect.value;
    return tokens.map(transaction.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

function classesOf(
  classes: SemanticTokenClasses,
  legend: lsp.SemanticTokensLegend,
  type: number,
  modifiers: number,
): string {
  const name = legend.tokenTypes[type] ?? "";
  const list = [`cm-semantic-${name}`, classes[name] ?? ""];
  legend.tokenModifiers.forEach((modifier, bit) => {
    if ((modifiers & (1 << bit)) !== 0) list.push(classes[modifier] ?? "");
  });
  return list.filter((one) => one !== "").join(" ");
}

/**
 * The server's semantic tokens drawn over the grammar's highlighting: a
 * name the server knows is a type, a parameter or a deprecated function
 * takes that colour even where the grammar cannot tell.
 */
export function semanticTokens(classes: SemanticTokenClasses = {}): Extension {
  const merged: SemanticTokenClasses = { ...semanticTokenClasses, ...classes };
  const feature = fileFeature({
    name: "semanticTokens",
    delay: TOKEN_DELAY,
    offered: (capabilities) => {
      const provider = capabilities.semanticTokensProvider;
      return provider !== undefined && provider.full !== undefined && provider.full !== false;
    },
    ask: async (found) => {
      const legend = found.plugin.client.serverCapabilities?.semanticTokensProvider?.legend;
      if (legend === undefined) return null;
      const answer = await askMapped<lsp.SemanticTokens | null>(
        found,
        "textDocument/semanticTokens/full",
        { textDocument: { uri: found.plugin.uri } },
      );
      const data = answer.result?.data ?? [];
      const builder = new RangeSetBuilder<Decoration>();
      let line = 0;
      let character = 0;
      for (let at = 0; at + 4 < data.length; at += 5) {
        const lineDelta = data[at] ?? 0;
        line += lineDelta;
        character = lineDelta === 0 ? character + (data[at + 1] ?? 0) : (data[at + 1] ?? 0);
        const length = data[at + 2] ?? 0;
        const from = mappedOffset(answer, { line, character }, 1);
        const to = mappedOffset(answer, { line, character: character + length }, -1);
        const name = classesOf(merged, legend, data[at + 3] ?? 0, data[at + 4] ?? 0);
        if (to > from && name !== "") builder.add(from, to, Decoration.mark({ class: name }));
      }
      return setTokens.of(builder.finish());
    },
  });
  return [tokenField, feature];
}
