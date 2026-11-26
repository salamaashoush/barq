import { type LSPClient, LSPPlugin } from "@codemirror/lsp-client";
import {
  type ChangeDesc,
  type ChangeSpec,
  type Extension,
  Facet,
  StateEffect,
  type Text,
} from "@codemirror/state";
import { type EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import type * as lsp from "vscode-languageserver-protocol";

import type { LanguageWorkspace } from "./lsp-workspace.ts";

/** Diagnostics a server published for one file, at the version they describe. */
export interface PublishedDiagnostics {
  uri: string;
  version: number | null;
  diagnostics: readonly lsp.Diagnostic[];
}

/** What the editor features share of their client. */
export interface ClientContext {
  readonly client: LSPClient;
  readonly workspace: LanguageWorkspace;
  /** The language a file's code blocks in docs are highlighted as. */
  languageOf(uri: string): string;
  published(uri: string): PublishedDiagnostics | undefined;
  navigate(uri: string, range: lsp.Range | undefined): void;
  applyEdit(edit: lsp.WorkspaceEdit): Promise<boolean>;
  executeCommand(command: lsp.Command): Promise<unknown>;
  /** Fails quietly: every answer is an aid, so an editor never waits on one that broke. */
  report(error: unknown): void;
}

export const clientContext = Facet.define<ClientContext, ClientContext | null>({
  combine: (values) => values[0] ?? null,
});

/** The server asked for this feature to be asked again: `workspace/inlayHint/refresh` and the like. */
export const refreshEffect = StateEffect.define<string>();

export interface Connected {
  plugin: LSPPlugin;
  context: ClientContext;
}

/** The editor's file and client, when it has both. */
export function connected(view: EditorView): Connected | null {
  const plugin = LSPPlugin.get(view);
  const context = view.state.facet(clientContext);
  if (plugin === null || context === null) return null;
  return { plugin, context };
}

export function capabilityOf<Key extends keyof lsp.ServerCapabilities>(
  client: LSPClient,
  key: Key,
): lsp.ServerCapabilities[Key] | undefined {
  return client.serverCapabilities?.[key];
}

/** A request the editor can drop: the server is told to stop when `signal` aborts. */
export function ask<Result>(
  client: LSPClient,
  method: string,
  params: object,
  signal?: AbortSignal,
): Promise<Result> {
  if (signal?.aborted === true) return Promise.reject(new Error("Aborted."));
  signal?.addEventListener("abort", () => client.cancelRequest(params), { once: true });
  return client.request<object, Result>(method, params);
}

/** LSP's code for a request the client cancelled, which is no failure. */
export function cancelled(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === -32800;
}

export function clampedOffset(doc: Text, position: lsp.Position): number {
  if (position.line < 0) return 0;
  if (position.line >= doc.lines) return doc.length;
  const line = doc.line(position.line + 1);
  return line.from + Math.min(Math.max(position.character, 0), line.length);
}

/**
 * Text edits the server computed against `start`, the text it was sent, as
 * changes to the editor's text now. `null` when the user has since typed
 * inside one of them, which makes the whole answer stale.
 */
export function editsToChanges(
  start: Text,
  since: ChangeDesc | null,
  edits: readonly lsp.TextEdit[],
): ChangeSpec[] | null {
  const changes: ChangeSpec[] = [];
  for (const edit of edits) {
    let from = clampedOffset(start, edit.range.start);
    let to = clampedOffset(start, edit.range.end);
    if (since !== null) {
      if (since.touchesRange(from, to)) return null;
      from = since.mapPos(from, 1);
      to = since.mapPos(to, -1);
    }
    changes.push({ from, to, insert: edit.newText });
  }
  return changes;
}

/** An answer, with the way from the text it was asked about to the editor's text now. */
export interface Mapped<Result> {
  result: Result;
  /** The text the server answered about. */
  start: Text;
  /** The user's changes since, `null` for none. */
  since: ChangeDesc | null;
}

/** Sends the editor's changes, asks, and keeps track of what the user types while the answer travels. */
export async function askMapped<Result>(
  found: Connected,
  method: string,
  params: object,
  signal?: AbortSignal,
): Promise<Mapped<Result>> {
  const { plugin } = found;
  const client = plugin.client;
  client.sync();
  const start = plugin.view.state.doc;
  const mapping = client.workspaceMapping();
  try {
    const result = await ask<Result>(client, method, params, signal);
    return { result, start, since: mapping.getMapping(plugin.uri) };
  } finally {
    mapping.destroy();
  }
}

/** A position in the text the server answered about, in the editor's text now. */
export function mappedOffset(answer: Mapped<unknown>, position: lsp.Position, assoc = -1): number {
  const at = clampedOffset(answer.start, position);
  return answer.since === null ? at : answer.since.mapPos(at, assoc);
}

/** A feature asked of the server for the whole file: lenses, hints, tokens, folds. */
export interface FileFeature {
  /** What `workspace/<name>/refresh` names it. */
  name: string;
  /** Milliseconds after the last edit before it is asked again. */
  delay: number;
  /** Whether the server offers it. */
  offered(capabilities: lsp.ServerCapabilities): boolean;
  /** The effects that show the answer, `null` for nothing to show. */
  ask(found: Connected): Promise<StateEffect<unknown> | null>;
}

/**
 * Asks for `feature` when the editor opens, after each pause in typing and
 * when the server asks to be asked again; an answer overtaken by a newer
 * question is dropped.
 */
export function fileFeature(feature: FileFeature): Extension {
  return ViewPlugin.fromClass(
    class {
      private timer: ReturnType<typeof setTimeout> | undefined;
      private asked = 0;

      constructor(readonly view: EditorView) {
        this.schedule(0);
      }

      update(update: ViewUpdate): void {
        const refreshed = update.transactions.some((transaction) =>
          transaction.effects.some(
            (effect) => effect.is(refreshEffect) && effect.value === feature.name,
          ),
        );
        if (update.docChanged || refreshed) this.schedule(feature.delay);
      }

      schedule(delay: number): void {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => void this.run(), delay);
      }

      async run(): Promise<void> {
        const found = connected(this.view);
        if (found === null) return;
        const ticket = ++this.asked;
        try {
          await found.plugin.client.initializing;
          const capabilities = found.plugin.client.serverCapabilities;
          if (capabilities === null || !feature.offered(capabilities)) return;
          const effect = await feature.ask(found);
          if (ticket === this.asked && effect !== null) this.view.dispatch({ effects: effect });
        } catch (error) {
          if (!cancelled(error)) found.context.report(error);
        }
      }

      destroy(): void {
        clearTimeout(this.timer);
        this.asked++;
      }
    },
  );
}
