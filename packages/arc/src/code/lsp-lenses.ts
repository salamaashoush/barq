import { type Extension, RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import type * as lsp from "vscode-languageserver-protocol";

import {
  type Connected,
  ask,
  askMapped,
  capabilityOf,
  fileFeature,
  mappedOffset,
} from "./lsp-context.ts";

/** Milliseconds after the last edit before the lenses are asked for again. */
const LENS_DELAY = 400;

interface PlacedLens {
  line: number;
  lens: lsp.CodeLens;
}

class LensWidget extends WidgetType {
  constructor(
    readonly lenses: readonly lsp.CodeLens[],
    readonly run: (lens: lsp.CodeLens) => void,
  ) {
    super();
  }

  override eq(other: LensWidget): boolean {
    return (
      other.lenses.length === this.lenses.length &&
      other.lenses.every(
        (lens, index) => lens.command?.title === this.lenses[index]?.command?.title,
      )
    );
  }

  toDOM(): HTMLElement {
    const row = document.createElement("div");
    row.className = "cm-code-lenses";
    for (const lens of this.lenses) {
      const button = row.appendChild(document.createElement("button"));
      button.type = "button";
      button.className = "cm-code-lens";
      button.textContent = lens.command?.title ?? "";
      button.addEventListener("click", () => this.run(lens));
    }
    return row;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

const setLenses = StateEffect.define<DecorationSet>();

const lensField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update: (lenses, transaction) => {
    for (const effect of transaction.effects) if (effect.is(setLenses)) return effect.value;
    return lenses.map(transaction.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

function decorations(found: Connected, placed: readonly PlacedLens[]): DecorationSet {
  const doc = found.plugin.view.state.doc;
  const byLine = new Map<number, lsp.CodeLens[]>();
  for (const one of placed) {
    if (one.lens.command === undefined) continue;
    const line = doc.lineAt(Math.min(one.line, doc.length)).from;
    byLine.set(line, [...(byLine.get(line) ?? []), one.lens]);
  }
  const builder = new RangeSetBuilder<Decoration>();
  function run(lens: lsp.CodeLens): void {
    if (lens.command === undefined) return;
    found.context
      .executeCommand(lens.command)
      .catch((error: unknown) => found.context.report(error));
  }
  for (const line of [...byLine.keys()].toSorted((a, b) => a - b)) {
    builder.add(
      line,
      line,
      Decoration.widget({
        widget: new LensWidget(byLine.get(line) ?? [], run),
        block: true,
        side: -1,
      }),
    );
  }
  return builder.finish();
}

async function resolved(found: Connected, lens: lsp.CodeLens): Promise<lsp.CodeLens> {
  if (lens.command !== undefined) return lens;
  if (capabilityOf(found.plugin.client, "codeLensProvider")?.resolveProvider !== true) return lens;
  return ask<lsp.CodeLens>(found.plugin.client, "codeLens/resolve", lens);
}

const lensFeature = fileFeature({
  name: "codeLens",
  delay: LENS_DELAY,
  offered: (capabilities) => capabilities.codeLensProvider !== undefined,
  ask: async (found) => {
    const answer = await askMapped<lsp.CodeLens[] | null>(found, "textDocument/codeLens", {
      textDocument: { uri: found.plugin.uri },
    });
    const lenses = await Promise.all((answer.result ?? []).map((one) => resolved(found, one)));
    const placed = lenses.map((lens) => ({ line: mappedOffset(answer, lens.range.start), lens }));
    return setLenses.of(decorations(found, placed));
  },
});

/** The server's code lenses: a row of commands above the line each names, a click running one. */
export function codeLenses(): Extension {
  return [lensField, lensFeature];
}
