import { type Diagnostic, lintGutter, setDiagnostics } from "@codemirror/lint";
import { LSPPlugin } from "@codemirror/lsp-client";
import type { Extension } from "@codemirror/state";
import { type EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import type * as lsp from "vscode-languageserver-protocol";

import { openCodeActions } from "./lsp-actions.ts";
import {
  type ClientContext,
  type PublishedDiagnostics,
  capabilityOf,
  clientContext,
  connected,
} from "./lsp-context.ts";

const SEVERITIES: readonly Diagnostic["severity"][] = ["error", "warning", "info", "hint"];

/** Milliseconds after the last edit before the text goes to the server to be checked again. */
const CHECK_DELAY = 500;

function fileName(uri: string): string {
  const path = uri.replace(/[?#].*$/, "");
  return decodeURIComponent(path.slice(path.lastIndexOf("/") + 1));
}

function messageView(
  view: EditorView,
  context: ClientContext,
  diagnostic: lsp.Diagnostic,
): HTMLElement {
  const root = document.createElement("div");
  root.className = "cm-lsp-diagnostic";
  const message = root.appendChild(document.createElement("div"));
  message.className = "cm-lsp-diagnostic-message";
  message.textContent = textOf(diagnostic);
  if (diagnostic.code !== undefined) {
    const href = diagnostic.codeDescription?.href;
    const code = root.appendChild(document.createElement(href === undefined ? "span" : "a"));
    code.className = "cm-lsp-diagnostic-code";
    code.textContent = String(diagnostic.code);
    if (href !== undefined) {
      code.setAttribute("href", href);
      code.setAttribute("target", "_blank");
      code.setAttribute("rel", "noreferrer");
    }
  }
  const related = diagnostic.relatedInformation ?? [];
  if (related.length > 0) {
    const list = root.appendChild(document.createElement("ul"));
    list.className = "cm-lsp-related";
    list.setAttribute("aria-label", view.state.phrase("Related information"));
    for (const one of related) {
      const item = list.appendChild(document.createElement("li"));
      const place = item.appendChild(document.createElement("button"));
      place.type = "button";
      place.className = "cm-lsp-related-place";
      place.textContent = `${fileName(one.location.uri)}:${String(one.location.range.start.line + 1)}`;
      place.addEventListener("click", () => context.navigate(one.location.uri, one.location.range));
      item.append(` ${one.message}`);
    }
  }
  return root;
}

function textOf(diagnostic: lsp.Diagnostic): string {
  return typeof diagnostic.message === "string" ? diagnostic.message : diagnostic.message.value;
}

function markClassOf(diagnostic: lsp.Diagnostic): string | undefined {
  const tags = diagnostic.tags ?? [];
  const classes = [
    tags.includes(1) ? "cm-lsp-unnecessary" : "",
    tags.includes(2) ? "cm-lsp-deprecated" : "",
  ].filter((one) => one !== "");
  return classes.length === 0 ? undefined : classes.join(" ");
}

/**
 * Shows what the server published for the editor's file, positions carried
 * over the edits made since the text it checked was sent; diagnostics for
 * an older version than the server has are dropped, as newer ones follow.
 */
export function pushDiagnostics(view: EditorView, published: PublishedDiagnostics): void {
  const plugin = LSPPlugin.get(view);
  const context = view.state.facet(clientContext);
  if (plugin === null || context === null) return;
  const file = context.workspace.getFile(published.uri);
  if (published.version !== null && file !== null && published.version !== file.version) return;
  const synced = plugin.syncedDoc;
  const pending = plugin.unsyncedChanges;
  const fixes = capabilityOf(plugin.client, "codeActionProvider") !== undefined;
  function offset(position: lsp.Position, assoc: number): number {
    const line = synced.line(Math.min(Math.max(position.line + 1, 1), synced.lines));
    const at = line.from + Math.min(Math.max(position.character, 0), line.length);
    return pending.mapPos(at, assoc);
  }
  const diagnostics: Diagnostic[] = published.diagnostics.map((one) => {
    const from = offset(one.range.start, 1);
    const to = Math.max(from, offset(one.range.end, -1));
    return {
      from,
      to,
      severity: SEVERITIES[(one.severity ?? 1) - 1] ?? "error",
      message: textOf(one),
      source: one.source,
      markClass: markClassOf(one),
      renderMessage: (target) => messageView(target, context, one),
      actions: fixes
        ? [
            {
              name: view.state.phrase("Quick fix"),
              apply: (target, start, end) => openCodeActions(target, start, end, [one]),
            },
          ]
        : undefined,
    };
  });
  view.dispatch(setDiagnostics(view.state, diagnostics));
}

const checker = ViewPlugin.fromClass(
  class {
    private timer: ReturnType<typeof setTimeout> | undefined;
    private live = true;

    constructor(readonly view: EditorView) {
      queueMicrotask(() => {
        if (!this.live) return;
        const found = connected(view);
        const known = found?.context.published(found.plugin.uri);
        if (known !== undefined) pushDiagnostics(view, known);
      });
    }

    update(update: ViewUpdate): void {
      if (!update.docChanged) return;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => LSPPlugin.get(this.view)?.client.sync(), CHECK_DELAY);
    }

    destroy(): void {
      this.live = false;
      clearTimeout(this.timer);
    }
  },
);

/**
 * The server's diagnostics as wavy underlines and a gutter mark: each with
 * its code, the related places it names (a click shows each), a quick fix,
 * and unused or deprecated code drawn as such. The text goes to the server
 * half a second after the last edit, so it checks what is there.
 */
export function serverDiagnostics(): Extension {
  return [checker, lintGutter()];
}
