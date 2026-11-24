import { For, Show, createSignal, createUniqueId, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import {
  type Decoration,
  useLexicalEditable,
  useLexicalEditor,
  useLexicalNodeSelection,
} from "@barqjs/lexical";
import { Superscript } from "@barqjs/lucide/icons/superscript";
import { Button } from "@barqjs/ui/button";
import { Field, FieldLabel } from "@barqjs/ui/field";
import { Textarea } from "@barqjs/ui/textarea";
import type { TextMatchTransformer } from "@lexical/markdown";
import {
  $createNodeSelection,
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  type DOMConversionMap,
  type DOMExportOutput,
  DecoratorNode,
  type EditorConfig,
  type LexicalEditor,
  type LexicalNode,
  type LexicalUpdateJSON,
  type NodeKey,
  SKIP_DOM_SELECTION_TAG,
  type SerializedLexicalNode,
  type Spread,
} from "lexical";

import { useArcMessages } from "../components/messages.ts";
import { ResponsiveOverlay } from "../components/responsive-overlay.tsx";
import { arcLayer as arc } from "../layer.ts";
import { edge, fg, focus, gap, layout, rounded, space, type } from "../style/index.ts";
import { buildDrawn } from "./containers.tsx";
import { defineEditorExtension } from "./extension.ts";
import { documentStyles } from "./theme.ts";

/** A number set above the line, as a footnote's is. */
const raised = arc({ verticalAlign: "super", fontSize: "0.75em", lineHeight: "1" });

export const footnoteStyles = variants({
  slots: {
    // The number is the footnote's place among the document's, drawn by a
    // counter so it follows every footnote added, moved or taken out.
    mark: arc(raised, fg.link, type.medium, focus.visible, rounded.xs, {
      counterIncrement: "arc-footnote",
      paddingInline: "0.1em",
      cursor: "pointer",
      "&::after": { content: "counter(arc-footnote)" },
    }),
    reference: arc(raised, fg.link),
    form: arc(layout.column, gap[3]),
    actions: arc(layout.row, layout.end, gap[2]),
    notes: arc(type.caption, fg.muted, edge.top, {
      marginBlockStart: space.x8,
      paddingBlockStart: space.x3,
    }),
    back: arc(fg.link, { marginInlineStart: space.x1, textDecorationLine: "none" }),
  },
});

export type SerializedFootnoteNode = Spread<
  { note: string; source?: unknown },
  SerializedLexicalNode
>;

/**
 * A footnote: a number in the line and the words it stands for, listed under
 * the document. One piece in the line, so the caret steps over it as over a
 * word, and its words are written in a popover from the number.
 */
export class FootnoteNode extends DecoratorNode<Decoration> {
  __note: string;
  /** A source the note cites, kept as it was written; the bibliography reads it. */
  __source: unknown;

  constructor(note = "", source: unknown = null, key?: NodeKey) {
    super(key);
    this.__note = note;
    this.__source = source;
  }

  $config() {
    return this.config("footnote", { extends: DecoratorNode });
  }

  static clone(node: FootnoteNode): FootnoteNode {
    return new FootnoteNode(node.__note, node.__source, node.__key);
  }

  static importJSON(json: SerializedFootnoteNode): FootnoteNode {
    return new FootnoteNode().updateFromJSON(json);
  }

  /** A note brought in from another document, as a Word file's are, marked with its words. */
  static importDOM(): DOMConversionMap {
    return {
      sup: (element: HTMLElement) =>
        element.hasAttribute("data-footnote")
          ? {
              conversion: () => ({
                node: new FootnoteNode(element.getAttribute("data-footnote") ?? ""),
              }),
              priority: 2,
            }
          : null,
    };
  }

  updateFromJSON(json: LexicalUpdateJSON<SerializedFootnoteNode>): this {
    const node = super.updateFromJSON(json).getWritable();
    node.__note = typeof json.note === "string" ? json.note : "";
    node.__source = json.source ?? null;
    return node;
  }

  exportJSON(): SerializedFootnoteNode {
    const node = this.getLatest();
    return {
      ...super.exportJSON(),
      note: node.__note,
      ...(node.__source === null || node.__source === undefined ? {} : { source: node.__source }),
    };
  }

  exportDOM(): DOMExportOutput {
    return { element: buildDrawn({ tag: "sup", attributes: { "data-footnote": this.getNote() } }) };
  }

  createDOM(config: EditorConfig): HTMLElement {
    const theme = config.theme.footnote;
    return buildDrawn({
      tag: "span",
      attributes: {
        "data-slot": "footnote",
        ...(typeof theme === "string" && theme !== "" ? { class: theme } : {}),
      },
    });
  }

  updateDOM(): boolean {
    return false;
  }

  isInline(): true {
    return true;
  }

  getNote(): string {
    return this.getLatest().__note;
  }

  getSource(): unknown {
    return this.getLatest().__source;
  }

  setNote(note: string): this {
    const writable = this.getWritable();
    writable.__note = note;
    return writable;
  }

  setSource(source: unknown): this {
    const writable = this.getWritable();
    writable.__source = source;
    return writable;
  }

  decorate(): Decoration<this> {
    return (node) => <FootnoteMark nodeKey={node().getKey()} note={node().__note} />;
  }
}

export function $createFootnoteNode(note = ""): FootnoteNode {
  return new FootnoteNode(note);
}

export function $isFootnoteNode(node: LexicalNode | null | undefined): node is FootnoteNode {
  return node instanceof FootnoteNode;
}

/**
 * Adds a footnote after the words chosen, or at the caret, and chooses it so
 * its words are written next.
 */
export function $insertFootnote(): FootnoteNode | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  if (!selection.isCollapsed()) {
    const end = selection.isBackward() ? selection.anchor : selection.focus;
    const { key, offset, type: kind } = end;
    selection.anchor.set(key, offset, kind);
    selection.focus.set(key, offset, kind);
  }
  const node = $createFootnoteNode();
  selection.insertNodes([node]);
  const chosen = $createNodeSelection();
  chosen.add(node.getKey());
  $setSelection(chosen);
  return node;
}

/** A footnote left without words or a source is not kept; the caret goes where it was. */
function $settle(key: NodeKey): void {
  const node = $getNodeByKey(key);
  if (!$isFootnoteNode(node)) return;
  const kept = node.getNote().trim() !== "" || (node.getSource() ?? null) !== null;
  if (kept) {
    node.selectNext(0, 0);
    return;
  }
  const previous = node.getPreviousSibling();
  node.remove();
  if (previous !== null) previous.selectEnd();
}

function FootnoteMark(props: { nodeKey: NodeKey; note: string }) {
  const editor = useLexicalEditor();
  const editable = useLexicalEditable();
  const messages = useArcMessages();
  const cls = footnoteStyles();
  const id = createUniqueId();
  const [selected, setSelected] = useLexicalNodeSelection(props.nodeKey);
  const [draft, setDraft] = createSignal("", { ownedWrite: true });
  const [dismissed, setDismissed] = createSignal(false, { ownedWrite: true });
  const open = (): boolean => editable() && selected() && !dismissed();
  const write = (note: string): void => {
    setDraft(note);
    editor.update(
      () => {
        const node = $getNodeByKey(props.nodeKey);
        if ($isFootnoteNode(node)) node.setNote(note);
      },
      { tag: SKIP_DOM_SELECTION_TAG },
    );
  };
  const close = (): void => {
    setDismissed(true);
    editor.update(() => $settle(props.nodeKey));
    editor.focus();
  };
  const remove = (): void => {
    editor.update(() => {
      const node = $getNodeByKey(props.nodeKey);
      const previous = node?.getPreviousSibling() ?? null;
      node?.remove();
      previous?.selectEnd();
    });
    editor.focus();
  };
  return (
    <ResponsiveOverlay
      heading={messages().footnote}
      desktop="popover"
      open={open()}
      onOpenChange={(next: boolean) => {
        if (next) {
          setDraft(untrack(() => props.note));
          setDismissed(false);
          setSelected(true);
        } else if (untrack(open)) close();
      }}
      trigger={
        <button
          type="button"
          class={arc(cls.mark, selected() ? documentStyles().blockSelected : undefined)}
          data-slot="footnote-mark"
          data-selected={selected() ? "" : undefined}
          aria-label={
            props.note === "" ? messages().footnote : `${messages().footnote}: ${props.note}`
          }
          onPointerDown={(event: PointerEvent) => event.preventDefault()}
        />
      }
      footer={
        <>
          <Button variant="ghost" size="sm" onPress={remove}>
            {messages().removeFootnote}
          </Button>
          <Button size="sm" onPress={close}>
            {messages().done}
          </Button>
        </>
      }
    >
      <Field>
        <FieldLabel for={id}>{messages().footnote}</FieldLabel>
        <Textarea
          id={id}
          dir="auto"
          rows={3}
          maxLength={2000}
          autoFocus
          value={draft()}
          placeholder={messages().footnoteHint}
          onInput={(event: Event) => write((event.currentTarget as HTMLTextAreaElement).value)}
        />
      </Field>
    </ResponsiveOverlay>
  );
}

/** Pandoc's inline note, `^[words]`, read and written as a footnote. */
const FOOTNOTE_MARKDOWN: TextMatchTransformer = {
  type: "text-match",
  dependencies: [FootnoteNode],
  export: (node) =>
    $isFootnoteNode(node) ? `^[${node.getNote().replace(/[\\\]]/g, "\\$&")}]` : null,
  importRegExp: /\^\[((?:[^\]\\]|\\.)*)\]/,
  regExp: /\^\[((?:[^\]\\]|\\.)*)\]$/,
  replace: (node, match) => {
    node.replace($createFootnoteNode((match[1] ?? "").replace(/\\(.)/g, "$1")));
  },
  trigger: "]",
};

/** Words in a note, with each web address in it a link. */
function Linked(props: { text: string }) {
  // Empty pieces are dropped: a row holding no text has nothing a server writes for it.
  const parts = (): { text: string; link: boolean }[] =>
    props.text
      .split(/(https?:\/\/[^\s<>()]+[^\s<>().,;:!?])/u)
      .map((text, index) => ({ text, link: index % 2 === 1 }))
      .filter((part) => part.text !== "");
  return (
    <For each={parts()}>
      {(part: { text: string; link: boolean }) =>
        part.link ? (
          <a href={part.text} rel="noopener noreferrer" target="_blank">
            {part.text}
          </a>
        ) : (
          part.text
        )
      }
    </For>
  );
}

function insertFootnote(editor: LexicalEditor): void {
  editor.update(() => void $insertFootnote());
}

/**
 * Footnotes: a number in the line, numbered in reading order, and its words
 * written in a popover from it; Mod+Alt+F or the button over selected text
 * adds one. The renderer lists them under the document, each linking to its
 * place in the text and back. Markdown writes Pandoc's `^[note]`, and a Word
 * document's footnotes come in as footnotes.
 */
export const footnoteExtension = defineEditorExtension({
  name: "arc/footnote",
  nodes: [FootnoteNode],
  keys: [{ keys: "Mod+Alt+f", run: () => $insertFootnote() !== null }],
  commands: [
    {
      id: "footnote",
      label: (messages) => messages.footnote,
      icon: () => <Superscript />,
      keywords: ["note", "reference", "citation"],
      places: ["slash"],
      run: insertFootnote,
    },
  ],
  floating: [
    {
      id: "footnote",
      label: (messages) => messages.addFootnote,
      icon: () => <Superscript />,
      shortcut: "Mod+Alt+F",
      run: insertFootnote,
    },
  ],
  markdown: [FOOTNOTE_MARKDOWN],
  render: {
    footnote: (node, scope) => {
      const number = scope.formatNumber(scope.ordinal(node));
      if (scope.editing) {
        return (
          <span data-slot="footnote">
            <span class={footnoteStyles().mark} />
          </span>
        );
      }
      return (
        <sup class={footnoteStyles().reference} data-slot="footnote">
          <a
            href={`#${scope.id}-note-${number}`}
            id={`${scope.id}-ref-${number}`}
            aria-label={scope.messages.footnoteReference(number)}
          >
            {number}
          </a>
        </sup>
      );
    },
  },
  renderEnd: (scope) => {
    const notes = scope.nodesOf("footnote");
    const cls = footnoteStyles();
    return (
      <Show when={notes.length > 0}>
        <section class={cls.notes} aria-label={scope.messages.footnotes} data-slot="footnotes">
          <ol>
            <For each={notes}>
              {(note, index: () => number) => {
                const number = scope.formatNumber(index() + 1);
                return (
                  <li id={`${scope.id}-note-${number}`} dir="auto">
                    <Linked text={typeof note.note === "string" ? note.note : ""} />
                    <a
                      class={cls.back}
                      href={`#${scope.id}-ref-${number}`}
                      aria-label={scope.messages.backToReference(number)}
                    >
                      ↩
                    </a>
                  </li>
                );
              }}
            </For>
          </ol>
        </section>
      </Show>
    );
  },
});
