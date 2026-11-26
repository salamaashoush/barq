import { foldService } from "@codemirror/language";
import { type Extension, Prec, StateEffect, StateField } from "@codemirror/state";
import type * as lsp from "vscode-languageserver-protocol";

import { type Mapped, askMapped, fileFeature } from "./lsp-context.ts";

/** Milliseconds after the last edit before the folds are asked for again. */
const FOLD_DELAY = 500;

interface Fold {
  from: number;
  to: number;
}

const setFolds = StateEffect.define<readonly Fold[]>();

const foldField = StateField.define<readonly Fold[]>({
  create: () => [],
  update: (folds, transaction) => {
    for (const effect of transaction.effects) if (effect.is(setFolds)) return effect.value;
    if (!transaction.docChanged) return folds;
    return folds
      .map((fold) => ({
        from: transaction.changes.mapPos(fold.from, 1),
        to: transaction.changes.mapPos(fold.to, -1),
      }))
      .filter((fold) => fold.to > fold.from);
  },
});

function foldOf(answer: Mapped<unknown>, range: lsp.FoldingRange): Fold | null {
  const doc = answer.start;
  if (range.startLine >= doc.lines || range.endLine <= range.startLine) return null;
  const first = doc.line(range.startLine + 1);
  const last = doc.line(Math.min(range.endLine + 1, doc.lines));
  const from = first.from + Math.min(range.startCharacter ?? first.length, first.length);
  const to =
    range.endCharacter === undefined
      ? last.to
      : last.from + Math.min(range.endCharacter, last.length);
  const since = answer.since;
  const fold =
    since === null ? { from, to } : { from: since.mapPos(from, 1), to: since.mapPos(to, -1) };
  return fold.to > fold.from ? fold : null;
}

const foldFeature = fileFeature({
  name: "foldingRange",
  delay: FOLD_DELAY,
  offered: (capabilities) =>
    capabilities.foldingRangeProvider !== undefined && capabilities.foldingRangeProvider !== false,
  ask: async (found) => {
    const answer = await askMapped<lsp.FoldingRange[] | null>(found, "textDocument/foldingRange", {
      textDocument: { uri: found.plugin.uri },
    });
    const folds = (answer.result ?? [])
      .map((range) => foldOf(answer, range))
      .filter((fold): fold is Fold => fold !== null);
    return setFolds.of(folds);
  },
});

/**
 * The server's folding ranges, for `CodeEditor`'s `folding` gutter and its
 * keys: a block folds from the end of its first line.
 */
export function serverFolding(): Extension {
  return [
    foldField,
    foldFeature,
    Prec.high(
      foldService.of((state, lineStart, lineEnd) => {
        const folds = state.field(foldField, false) ?? [];
        const found = folds.find((fold) => fold.from >= lineStart && fold.from <= lineEnd);
        return found === undefined || state.doc.lineAt(found.to).from <= lineEnd ? null : found;
      }),
    ),
  ];
}
