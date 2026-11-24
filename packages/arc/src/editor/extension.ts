import type { Child } from "@barqjs/core";
import type { JSX } from "@barqjs/web";
import type { Transformer } from "@lexical/markdown";
import type {
  AnyLexicalExtensionArgument,
  EditorThemeClasses,
  Klass,
  LexicalEditor,
  LexicalNode,
  RangeSelection,
} from "lexical";

import { type ArcMessages, ENGLISH } from "../components/messages.ts";
import type { AnyBlock, BlockLabel } from "./blocks.tsx";
import type { DocumentSlots } from "./theme.ts";

/** A word that depends on the reader's language, or one fixed. */
export type Label = BlockLabel;

/** Where a command is offered: the `/` menu, the toolbar's Insert menu, a block's `+` picker. */
export type CommandPlace = "slash" | "insert" | "picker";

/** Something an editor can insert or turn a block into, offered by name. */
export interface EditorCommand {
  id: string;
  label: Label;
  /** The heading it sits under. @default arc's "Basic" */
  group?: Label;
  icon?: () => Child;
  /** More words it is found by. */
  keywords?: readonly string[];
  /** A line under the label. */
  description?: Label;
  /** The keys that do the same, as `shortcutLabel` takes them. */
  shortcut?: string;
  /** @default every place */
  places?: readonly CommandPlace[];
  /** Whether the editor offers it now: an upload to send pictures with, a dialog that is mounted. */
  available?: (editor: LexicalEditor) => boolean;
  /** Runs with the caret where the block goes, outside any update. */
  run: (editor: LexicalEditor) => void;
}

/** A button an extension puts on the toolbar, or over selected text. */
export interface EditorToolbarItem {
  id: string;
  label: Label;
  icon: () => Child;
  /** The keys that do the same, as `shortcutLabel` takes them. */
  shortcut?: string;
  /** Read in the editor's state after each update: whether it shows pressed. */
  $pressed?: () => boolean;
  /** Read in the editor's state: whether it is offered for the selection. @default always */
  $shown?: () => boolean;
  run: (editor: LexicalEditor) => void;
  /** How long it stays out of the More menu as the toolbar narrows; higher stays longer. @default 2 */
  priority?: number;
}

/** A choice a block's menu offers for the block it is open on: a callout's tone, a set of columns' layout. */
export interface BlockMenuChoice {
  id: string;
  label: Label;
  /** Read for the block the menu is open on: its options and the one it has, or `null` where it does not apply. */
  $read: (block: LexicalNode) => {
    value: string;
    options: readonly { value: string; label: Label }[];
  } | null;
  /** Inside an update: gives the block the option. */
  $choose: (block: LexicalNode, value: string) => void;
}

/** A key an extension answers, by key or, for digits and punctuation, by the key's place. */
export interface EditorKeyBinding {
  /** `"Mod+Alt+F"`, `"Mod+Shift+\\"`: Mod is Command on a Mac, Control elsewhere. */
  keys: string;
  /** Runs inside the key's update; `false` leaves the key to the next listener. */
  run: (editor: LexicalEditor, event: KeyboardEvent) => boolean | void;
}

/** A rule that turns what is pasted into what it stands for. */
export interface PasteRule {
  /** Asked before the rules under it. @default 0 */
  priority?: number;
  /** Runs inside the paste's update; `true` when it took the paste. */
  $paste: (data: DataTransfer, selection: RangeSelection, editor: LexicalEditor) => boolean;
}

/** How a stored node reads in the renderer, and on the server under an editor that will take the page over. */
export interface RenderScope {
  /** Drawn as the editor draws the node, for the page an editor will take over. */
  editing: boolean;
  slots: DocumentSlots;
  messages: ArcMessages;
  /** Unique to this drawing of the document, for the ids its parts link between. */
  id: string;
  /** A number the document draws itself, as a footnote's, in the reader's digits. */
  formatNumber: (value: number) => string;
  /** The node's children, drawn. */
  children: (node: StoredNode) => Child;
  /** Where the node stands among the document's nodes of its type, counted from one in reading order. */
  ordinal: (node: StoredNode) => number;
  /** The document's nodes of a type, in reading order. */
  nodesOf: (type: string) => readonly StoredNode[];
}

export type NodeRenderer = (node: StoredNode, scope: RenderScope) => Child;

/** A node as stored, read loosely: every type of node a document holds. */
export interface StoredNode {
  type: string;
  version: number;
  children?: StoredNode[];
  text?: string;
  format?: number | string;
  indent?: number;
  direction?: string | null;
  [field: string]: unknown;
}

/** A Word document's pieces as a Word import reads them. */
export interface DocxRules {
  /** Rewrites `word/document.xml` before it is read. */
  prepare?: (xml: XMLDocument) => void;
  /** Writes a Word equation, as LaTeX, as the HTML the document reads it from. */
  formula?: (latex: string, block: boolean) => string;
}

/**
 * Everything an editor feature brings, in one value an editor takes whole:
 * its nodes and blocks, what it offers in the menus and on the toolbar, its
 * keys and paste rules, how it reads and writes markdown, HTML and Word, how
 * the renderer and a server draw it, what a shared document leaves out, its
 * words, and what it loads only when first used.
 */
export interface EditorExtension {
  /** Unique in an editor; a later extension with the same name replaces it. */
  readonly name: string;
  /** Extensions it needs, put in the editor before it. */
  readonly dependencies?: readonly EditorExtension[];
  readonly nodes?: readonly Klass<LexicalNode>[];
  /** Blocks made with `defineBlock`. */
  readonly blocks?: readonly AnyBlock[];
  /** Lexical extensions it is built on. */
  readonly lexical?: readonly AnyLexicalExtensionArgument[];
  /** Transforms and commands, for every editor holding it, a server's included. */
  readonly register?: (editor: LexicalEditor) => () => void;
  readonly theme?: EditorThemeClasses;
  readonly commands?: readonly EditorCommand[];
  readonly toolbar?: readonly EditorToolbarItem[];
  /** Over selected text, after the marks. */
  readonly floating?: readonly EditorToolbarItem[];
  readonly keys?: readonly EditorKeyBinding[];
  /** In a block's menu, for the blocks each applies to. */
  readonly blockMenu?: readonly BlockMenuChoice[];
  readonly paste?: readonly PasteRule[];
  /** Markdown it reads and writes; a function is handed every rule, for a block that holds markdown of its own. */
  readonly markdown?:
    | readonly Transformer[]
    | ((all: () => readonly Transformer[]) => readonly Transformer[]);
  /** Markdown rules are tried by priority, higher first: a block's own line before the general `> ` and `- `. @default 0 */
  readonly markdownPriority?: number;
  /** Rewrites HTML before it is read: a paste, an HTML import, a Word document. */
  readonly html?: (page: Document) => void;
  readonly docx?: DocxRules;
  /** How the renderer draws its stored nodes, by type. */
  readonly render?: Readonly<Record<string, NodeRenderer>>;
  /** Drawn after the document by the renderer, as a list of notes is. */
  readonly renderEnd?: (scope: RenderScope) => Child;
  /** What a shared document keeps to each reader: a node's properties left out of the Yjs document. */
  readonly collaboration?: {
    readonly exclude?: readonly (readonly [Klass<LexicalNode>, readonly string[]])[];
  };
  /** Mounted inside an editor with a screen: panels, dialogs, listeners that need one. */
  readonly plugins?: readonly (() => JSX.Element)[];
  /** Drawn in the editor's footer. */
  readonly footer?: () => JSX.Element;
  /** A heavy module it loads only when first used, through `loadExtension`. */
  readonly load?: () => Promise<unknown>;
}

/** An editor feature: see `EditorExtension`. */
export function defineEditorExtension<T extends EditorExtension>(extension: T): T {
  return extension;
}

/**
 * The extensions an editor holds, each dependency before what needs it and
 * each name once: a later extension with a name already met takes its place.
 */
export function resolveExtensions(list: readonly EditorExtension[]): EditorExtension[] {
  const order: string[] = [];
  const byName = new Map<string, EditorExtension>();
  const visiting = new Set<string>();
  const visit = (extension: EditorExtension, replace: boolean): void => {
    if (visiting.has(extension.name)) return;
    visiting.add(extension.name);
    for (const dependency of extension.dependencies ?? []) {
      if (!byName.has(dependency.name)) visit(dependency, false);
    }
    visiting.delete(extension.name);
    if (!byName.has(extension.name)) order.push(extension.name);
    if (replace || !byName.has(extension.name)) byName.set(extension.name, extension);
  };
  for (const extension of list) visit(extension, true);
  return order.map((name) => byName.get(name)!);
}

/** A preset with some of its extensions left out, by name, and others added or put in their place. */
export function customizeExtensions(
  base: readonly EditorExtension[],
  change: { remove?: readonly string[]; add?: readonly EditorExtension[] },
): EditorExtension[] {
  const removed = new Set(change.remove ?? []);
  return [...base.filter((one) => !removed.has(one.name)), ...(change.add ?? [])];
}

/** Whether `name` is among the extensions, once resolved. */
export function hasExtension(list: readonly EditorExtension[], name: string): boolean {
  return resolveExtensions(list).some((one) => one.name === name);
}

const registry = new WeakMap<LexicalEditor, readonly EditorExtension[]>();

/** Records what an editor was built from, for the UI that reads it. */
export function provideEditorExtensions(
  editor: LexicalEditor,
  extensions: readonly EditorExtension[],
): () => void {
  registry.set(editor, extensions);
  return () => {
    if (registry.get(editor) === extensions) registry.delete(editor);
  };
}

/** The extensions an editor was built from, resolved. */
export function editorExtensions(editor: LexicalEditor): readonly EditorExtension[] {
  return registry.get(editor) ?? [];
}

const wordsByEditor = new WeakMap<LexicalEditor, () => ArcMessages>();

/** Gives an editor the reader's words, for an extension's listener or key that has no component to read them from. */
export function provideEditorMessages(editor: LexicalEditor, messages: () => ArcMessages): void {
  wordsByEditor.set(editor, messages);
}

/** The reader's words in an editor, arc's English until its UI has mounted. */
export function editorMessages(editor: LexicalEditor): ArcMessages {
  return wordsByEditor.get(editor)?.() ?? ENGLISH;
}

const loads = new WeakMap<EditorExtension, Promise<unknown>>();

/** The extension's heavy module, loaded the first time it is asked for and kept. */
export function loadExtension<T = unknown>(extension: EditorExtension): Promise<T> {
  let found = loads.get(extension);
  if (found === undefined) {
    found = (extension.load ?? (() => Promise.resolve(undefined)))();
    // A failed load is asked again the next time, rather than failing for good.
    found.catch(() => loads.delete(extension));
    loads.set(extension, found);
  }
  return found as Promise<T>;
}

/** Every command the extensions offer in a place, in their order, those unavailable left out. */
export function commandsOf(
  extensions: readonly EditorExtension[],
  editor: LexicalEditor | null,
  place: CommandPlace,
): EditorCommand[] {
  return extensions.flatMap((extension) =>
    (extension.commands ?? []).filter(
      (command) =>
        (command.places ?? ["slash", "insert", "picker"]).includes(place) &&
        (editor === null || command.available === undefined || command.available(editor)),
    ),
  );
}

/**
 * Every markdown rule the extensions read and write, the most particular
 * first: by `markdownPriority`, then in the extensions' order.
 */
export function transformersOf(extensions: readonly EditorExtension[]): Transformer[] {
  const all: Transformer[] = [];
  const ranked = extensions
    .map((extension, index) => ({ extension, index }))
    .toSorted(
      (a, b) =>
        (b.extension.markdownPriority ?? 0) - (a.extension.markdownPriority ?? 0) ||
        a.index - b.index,
    );
  for (const { extension } of ranked) {
    const rules = extension.markdown;
    all.push(...(typeof rules === "function" ? rules(() => all) : (rules ?? [])));
  }
  return all;
}

/** Whether a key event is the binding's keys. */
export function keysMatch(event: KeyboardEvent, keys: string): boolean {
  const steps = keys.split("+");
  const key = steps.at(-1) ?? "";
  const code = /^\d$/.test(key)
    ? `Digit${key}`
    : key === "\\"
      ? "Backslash"
      : key === "="
        ? "Equal"
        : key === "."
          ? "Period"
          : key === ","
            ? "Comma"
            : /^[a-z]$/i.test(key)
              ? `Key${key.toUpperCase()}`
              : undefined;
  return (
    (event.metaKey || event.ctrlKey) === steps.includes("Mod") &&
    event.shiftKey === steps.includes("Shift") &&
    event.altKey === steps.includes("Alt") &&
    (event.key.toLowerCase() === key.toLowerCase() || (code !== undefined && event.code === code))
  );
}
