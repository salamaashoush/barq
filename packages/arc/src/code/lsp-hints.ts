import { type Extension, RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import type * as lsp from "vscode-languageserver-protocol";

import { askMapped, fileFeature, mappedOffset } from "./lsp-context.ts";

/** Milliseconds after the last edit before the hints are asked for again. */
const HINT_DELAY = 300;

class HintWidget extends WidgetType {
  constructor(readonly hint: lsp.InlayHint) {
    super();
  }

  get text(): string {
    const label = this.hint.label;
    return typeof label === "string" ? label : label.map((part) => part.value).join("");
  }

  override eq(other: HintWidget): boolean {
    return (
      other.text === this.text &&
      other.hint.kind === this.hint.kind &&
      other.hint.paddingLeft === this.hint.paddingLeft &&
      other.hint.paddingRight === this.hint.paddingRight
    );
  }

  toDOM(): HTMLElement {
    const hint = document.createElement("span");
    hint.className = [
      "cm-inlay-hint",
      this.hint.kind === 1 ? "cm-inlay-hint-type" : "",
      this.hint.kind === 2 ? "cm-inlay-hint-parameter" : "",
      this.hint.paddingLeft === true ? "cm-inlay-hint-before" : "",
      this.hint.paddingRight === true ? "cm-inlay-hint-after" : "",
    ]
      .filter((one) => one !== "")
      .join(" ");
    // What the code says is read from the code; the hint repeats what the server inferred.
    hint.setAttribute("aria-hidden", "true");
    hint.textContent = this.text;
    return hint;
  }
}

const setHints = StateEffect.define<DecorationSet>();

const hintField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update: (hints, transaction) => {
    for (const effect of transaction.effects) if (effect.is(setHints)) return effect.value;
    return hints.map(transaction.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

const hintFeature = fileFeature({
  name: "inlayHint",
  delay: HINT_DELAY,
  offered: (capabilities) =>
    capabilities.inlayHintProvider !== undefined && capabilities.inlayHintProvider !== false,
  ask: async (found) => {
    const doc = found.plugin.view.state.doc;
    const answer = await askMapped<lsp.InlayHint[] | null>(found, "textDocument/inlayHint", {
      textDocument: { uri: found.plugin.uri },
      range: { start: { line: 0, character: 0 }, end: found.plugin.toPosition(doc.length, doc) },
    });
    const placed = (answer.result ?? [])
      .map((hint) => ({ at: mappedOffset(answer, hint.position, 1), hint }))
      .toSorted((a, b) => a.at - b.at);
    const builder = new RangeSetBuilder<Decoration>();
    for (const { at, hint } of placed) {
      builder.add(
        at,
        at,
        Decoration.widget({ widget: new HintWidget(hint), side: hint.kind === 2 ? 1 : -1 }),
      );
    }
    return setHints.of(builder.finish());
  },
});

/** The server's inlay hints: a type after a name, a parameter's name before an argument. */
export function inlayHints(): Extension {
  return [hintField, hintFeature];
}
