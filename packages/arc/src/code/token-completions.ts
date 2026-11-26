import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { EditorState, type Extension } from "@codemirror/state";

export interface CompletionToken {
  name: string;
  /** A word beside the name in the list, such as "secret" or "variable". */
  kind?: string;
  /** A sentence about the token, shown beside the list for the highlighted one. */
  info?: string;
}

export interface TokenCompletionOptions {
  /** The names to offer, or an accessor read each time the list opens. */
  tokens: readonly CompletionToken[] | (() => readonly CompletionToken[]);
  /** What comes right before a name: `"process.env."`, `"{{"`. */
  trigger: string;
  /** Written after a chosen name, unless the text after the cursor starts with it already: `"}}"`. */
  close?: string;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Names offered in a `CodeEditor` after a trigger: the variables after
 * `process.env.`, the secrets inside `{{ }}`.
 *
 * ```tsx
 * <CodeEditor
 *   language="yaml"
 *   extensions={tokenCompletions({ trigger: "{{", close: "}}", tokens: () => names() })}
 * />
 * ```
 *
 * The tokens are read when the list opens, so an accessor that changes needs
 * no new extension and the editor is not reconfigured as it does.
 */
export function tokenCompletions(options: TokenCompletionOptions): Extension {
  const pattern = new RegExp(`${escapeRegExp(options.trigger)}\\w*`);
  function source(context: CompletionContext): CompletionResult | null {
    const found = context.matchBefore(pattern);
    if (found === null) return null;
    const tokens = typeof options.tokens === "function" ? options.tokens() : options.tokens;
    if (tokens.length === 0) return null;
    const close = options.close;
    const closed =
      close !== undefined &&
      context.state.sliceDoc(context.pos, context.pos + close.length) === close;
    return {
      from: found.from + options.trigger.length,
      validFor: /^\w*$/,
      options: tokens.map((token) => ({
        label: token.name,
        type: "variable",
        detail: token.kind,
        info: token.info,
        apply: close === undefined || closed ? token.name : `${token.name}${close}`,
      })),
    };
  }
  return EditorState.languageData.of(() => [{ autocomplete: source }]);
}
