import { type LSPClient, LSPPlugin, Workspace, type WorkspaceFile } from "@codemirror/lsp-client";
import { ChangeSet, Text, type TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type * as lsp from "vscode-languageserver-protocol";

interface FileUpdate {
  file: WorkspaceFile;
  prevDoc: Text;
  changes: ChangeSet;
}

/**
 * A file the server knows. `doc` is what it was last sent; a file with no
 * editor keeps its own text in `current` and the edits since in `pending`.
 */
class OpenFile implements WorkspaceFile {
  view: EditorView | null = null;
  /** The app opened it, so it stays open with no editor. */
  held = false;
  /** An editor arrived holding other text than the server has. */
  stale = false;
  current: Text;
  pending: ChangeSet | null = null;

  constructor(
    readonly uri: string,
    readonly languageId: string,
    public version: number,
    public doc: Text,
  ) {
    this.current = doc;
  }

  getView(): EditorView | null {
    return this.view;
  }
}

/** Where a navigation goes once an editor shows its file. */
interface PendingNavigation {
  uri: string;
  range: lsp.Range | undefined;
  settle: (view: EditorView | null) => void;
}

export interface WorkspaceHooks {
  /** Show the file: switch to its tab, open an editor on it. */
  navigate: (uri: string, range: lsp.Range | undefined) => void;
  /** The server changed a file no editor shows. */
  edited: (uri: string, text: string) => void;
  /** A file's text reached the server. */
  synced: (uri: string) => void;
  /** The server was told a file is open. */
  opened: (uri: string) => void;
}

export function textOf(text: string): Text {
  return Text.of(text.split(/\r\n?|\n/));
}

function replaceAll(from: Text, to: Text): ChangeSet {
  return ChangeSet.of({ from: 0, to: from.length, insert: to }, from.length);
}

/**
 * The files a language server sees: one per URI, each shown by at most one
 * editor, and the ones an app opened kept open when no editor shows them, so
 * a server answers across a project whose files sit in tabs.
 */
export class LanguageWorkspace extends Workspace {
  files: OpenFile[] = [];
  private versions = new Map<string, number>();
  private navigation: PendingNavigation | null = null;

  constructor(
    client: LSPClient,
    private readonly hooks: WorkspaceHooks,
  ) {
    super(client);
  }

  private nextVersion(uri: string): number {
    const version = (this.versions.get(uri) ?? -1) + 1;
    this.versions.set(uri, version);
    return version;
  }

  override getFile(uri: string): OpenFile | null {
    return this.files.find((file) => file.uri === uri) ?? null;
  }

  syncFiles(): readonly FileUpdate[] {
    const updates: FileUpdate[] = [];
    for (const file of this.files) {
      let changes: ChangeSet | null = null;
      let next = file.current;
      if (file.view !== null) {
        const plugin = LSPPlugin.get(file.view);
        if (plugin === null) continue;
        next = file.view.state.doc;
        if (file.stale) {
          changes = replaceAll(file.doc, next);
          file.stale = false;
        } else if (!plugin.unsyncedChanges.empty) {
          changes = plugin.unsyncedChanges;
        }
        plugin.clear();
      } else if (file.pending !== null) {
        changes = file.pending;
        file.pending = null;
      }
      if (changes === null) continue;
      updates.push({ file, prevDoc: file.doc, changes });
      file.doc = next;
      file.current = next;
      file.version = this.nextVersion(file.uri);
    }
    if (updates.length > 0) {
      queueMicrotask(() => {
        for (const update of updates) this.hooks.synced(update.file.uri);
      });
    }
    return updates;
  }

  openFile(uri: string, languageId: string, view: EditorView): void {
    const known = this.getFile(uri);
    if (known !== null) {
      if (known.view !== null && known.view !== view) {
        throw new Error(`${uri} is already open in another editor.`);
      }
      known.view = view;
      known.pending = null;
      if (known.doc.toString() !== view.state.doc.toString()) {
        known.stale = true;
        queueMicrotask(() => this.client.sync());
      }
    } else {
      const file = new OpenFile(uri, languageId, this.nextVersion(uri), view.state.doc);
      file.view = view;
      this.files.push(file);
      this.client.didOpen(file);
      this.hooks.opened(uri);
    }
    const waiting = this.navigation;
    if (waiting !== null && waiting.uri === uri) {
      this.navigation = null;
      queueMicrotask(() => waiting.settle(view));
    }
  }

  closeFile(uri: string, view: EditorView): void {
    const file = this.getFile(uri);
    if (file === null || file.view !== view) return;
    file.view = null;
    if (!file.held) {
      this.files = this.files.filter((one) => one !== file);
      this.client.didClose(uri);
      return;
    }
    const last = view.state.doc;
    if (last.toString() !== file.doc.toString()) {
      file.current = last;
      file.pending = replaceAll(file.doc, last);
      queueMicrotask(() => this.client.sync());
    }
  }

  /** Opens a file with no editor, or holds one an editor has open so it outlives the editor. */
  hold(uri: string, text: string, languageId: string): void {
    const known = this.getFile(uri);
    if (known !== null) {
      known.held = true;
      if (known.view === null) this.replace(known, textOf(text));
      return;
    }
    const file = new OpenFile(uri, languageId, this.nextVersion(uri), textOf(text));
    file.held = true;
    this.files.push(file);
    this.client.didOpen(file);
    this.hooks.opened(uri);
  }

  /** New text for a file no editor shows; an editor's own text wins over this. */
  setText(uri: string, text: string): void {
    const file = this.getFile(uri);
    if (file === null || file.view !== null) return;
    this.replace(file, textOf(text));
  }

  release(uri: string): void {
    const file = this.getFile(uri);
    if (file === null) return;
    file.held = false;
    if (file.view !== null) return;
    this.files = this.files.filter((one) => one !== file);
    this.client.didClose(uri);
  }

  private replace(file: OpenFile, next: Text): void {
    if (next.eq(file.current)) return;
    const changes = replaceAll(file.current, next);
    file.pending = file.pending === null ? changes : file.pending.compose(changes);
    file.current = next;
    this.client.sync();
  }

  override updateFile(uri: string, update: TransactionSpec): void {
    const file = this.getFile(uri);
    if (file === null) return;
    if (file.view !== null) {
      file.view.dispatch(update);
      return;
    }
    const changes = ChangeSet.of(update.changes ?? [], file.current.length);
    file.current = changes.apply(file.current);
    file.pending = file.pending === null ? changes : file.pending.compose(changes);
    this.hooks.edited(uri, file.current.toString());
    this.client.sync();
  }

  override displayFile(uri: string): Promise<EditorView | null> {
    return this.show(uri, undefined);
  }

  /** Puts `uri` in front: its editor if one shows it, the app's `navigate` otherwise. */
  show(uri: string, range: lsp.Range | undefined): Promise<EditorView | null> {
    const view = this.getFile(uri)?.view ?? null;
    if (view !== null) return Promise.resolve(view);
    this.navigation?.settle(null);
    return new Promise((resolve) => {
      this.navigation = { uri, range, settle: resolve };
      this.hooks.navigate(uri, range);
    });
  }
}
