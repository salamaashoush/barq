import { Show, createSignal } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { useLexicalEditor } from "@barqjs/lexical";
import { FileText } from "@barqjs/lucide/icons/file-text";
import { X } from "@barqjs/lucide/icons/x";
import { Progress } from "@barqjs/ui/progress";
import { DRAG_DROP_PASTE } from "@lexical/rich-text";
import {
  $getSelection,
  $setSelection,
  type BaseSelection,
  COMMAND_PRIORITY_LOW,
  COMMAND_PRIORITY_NORMAL,
  type LexicalCommand,
  type LexicalEditor,
  createCommand,
  mergeRegister,
} from "lexical";

import { IconButton } from "../components/icon-button.tsx";
import { useArcMessages } from "../components/messages.ts";
import { arcLayer as arc } from "../layer.ts";
import { fg, gap, layout, place, rounded, surface, truncate, type } from "../style/index.ts";
import {
  type DocxRules,
  type EditorExtension,
  defineEditorExtension,
  editorExtensions,
  loadExtension,
} from "./extension.ts";
import { useRegistration } from "./hooks.ts";
import { $insertHtml } from "./html-import.ts";
import { editorUploads } from "./media.tsx";
import { ommlToLatex } from "./omml.ts";

/** Opens the file picker for a Word document to read in where the caret is. */
export const IMPORT_WORD_COMMAND: LexicalCommand<void> = createCommand("IMPORT_WORD");

const WORD_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

/** Where an equation stood, as the reader passes text through: a numbered mark. */
const FORMULA = /(\d+)/g;

type Mammoth = typeof import("mammoth");
type Fflate = typeof import("fflate");

interface DocxReader {
  mammoth: Mammoth;
  fflate: Fflate;
}

interface MammothModule {
  default?: Mammoth;
}

/** What reading a Word document loads, the first time one is read. */
async function loadReader(): Promise<DocxReader> {
  const [mammoth, fflate] = await Promise.all([import("mammoth"), import("fflate")]);
  return { mammoth: (mammoth as MammothModule).default ?? mammoth, fflate };
}

export function isWordFile(file: File): boolean {
  return /\.docx$/i.test(file.name) || file.type === WORD_TYPE;
}

interface Formula {
  latex: string;
  block: boolean;
}

interface PreparedDocx {
  docx: Uint8Array;
  formulas: Formula[];
}

/**
 * A Word document readied for its reader, which drops equations: each becomes
 * a numbered mark in the text, its LaTeX kept apart, and every extension's
 * own rules run over the document's XML.
 */
function prepareDocx(bytes: Uint8Array, fflate: Fflate, rules: readonly DocxRules[]): PreparedDocx {
  const files = fflate.unzipSync(bytes);
  const body = files["word/document.xml"];
  if (body === undefined) return { docx: bytes, formulas: [] };
  const xml = new DOMParser().parseFromString(fflate.strFromU8(body), "application/xml");
  const formulas: Formula[] = [];
  function mark(index: number): Element {
    const run = xml.createElementNS(WORD_NS, "w:r");
    const words = xml.createElementNS(WORD_NS, "w:t");
    words.textContent = `${String(index)}`;
    run.append(words);
    return run;
  }
  // A tag's collection is live and shrinks as its elements are replaced, so
  // each loop walks a copy taken first.
  // Word writes Office Math under its `m:` prefix, which is what is looked for.
  for (const shown of Array.from(xml.getElementsByTagName("m:oMathPara"))) {
    const marks = [...shown.getElementsByTagName("m:oMath")].map((math) => {
      formulas.push({ latex: ommlToLatex(math), block: true });
      return mark(formulas.length - 1);
    });
    shown.replaceWith(...marks);
  }
  for (const math of Array.from(xml.getElementsByTagName("m:oMath"))) {
    formulas.push({ latex: ommlToLatex(math), block: false });
    math.replaceWith(mark(formulas.length - 1));
  }
  for (const rule of rules) rule.prepare?.(xml);
  files["word/document.xml"] = fflate.strToU8(new XMLSerializer().serializeToString(xml));
  return { docx: fflate.zipSync(files), formulas };
}

function attribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/** An equation where no extension reads formulas: its LaTeX, kept as code. */
function formulaAsCode(latex: string): string {
  const text = latex.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return `<code data-latex="${attribute(latex)}">${text}</code>`;
}

/** Where the notes of a Word document stand in the HTML it is read into. */
const NOTE = /^#word-(?:foot|end)note-\d+$/;

/**
 * A Word document's footnotes and endnotes, which come as numbered links to a
 * list at its end, become notes in the line they belong to, the way the
 * footnote extension reads them; the list goes.
 */
export function notesInPlace(page: Document): void {
  for (const link of page.querySelectorAll("sup > a[href]")) {
    const target = link.getAttribute("href") ?? "";
    const note = NOTE.test(target) ? page.getElementById(target.slice(1)) : null;
    const sup = link.parentElement;
    if (note === null || sup === null) continue;
    for (const back of note.querySelectorAll('a[href^="#word-"]')) back.remove();
    sup.setAttribute(
      "data-footnote",
      (note.textContent ?? "").replaceAll(/\s+/g, " ").trim().slice(0, 2000),
    );
    link.remove();
  }
  for (const item of page.querySelectorAll('li[id^="word-footnote-"], li[id^="word-endnote-"]')) {
    item.remove();
  }
  // What is left of the notes' list, and of the comments' list Word documents end with.
  for (const list of page.querySelectorAll("body > ol, body > dl")) {
    if (list.children.length === 0) list.remove();
  }
}

/** A picture of a Word document as stored: its address, and attributes its image reads. */
export interface WordPicture {
  src: string;
  attributes?: Readonly<Record<string, string>>;
}

export interface WordReading {
  /** The document as HTML, its equations and notes in place. */
  html: string;
  /** Pictures left out: of a kind no browser shows, or with nowhere to upload them. */
  skipped: number;
}

export interface WordToHtmlOptions {
  extensions?: readonly EditorExtension[];
  /** Stores a picture and answers how the document shows it: its address and any attributes, or `null` to leave it out. */
  picture?: (file: File) => Promise<WordPicture | null>;
}

/**
 * A Word document read as HTML: headings, lists, tables, links, its
 * footnotes and endnotes as footnotes, its equations as each extension's
 * formula (LaTeX in code where none reads them), and its pictures through
 * `picture`, which stores each and answers its address, or `null` to leave
 * it out. Mammoth and fflate load the first time one is read.
 */
export async function wordToHtml(
  bytes: Uint8Array,
  options: WordToHtmlOptions = {},
): Promise<WordReading> {
  const { mammoth, fflate } = await loadReader();
  const rules = (options.extensions ?? []).flatMap((extension) =>
    extension.docx === undefined ? [] : [extension.docx],
  );
  const { docx, formulas } = prepareDocx(bytes, fflate, rules);
  let skipped = 0;
  let pictures = 0;
  const arrayBuffer = docx.buffer.slice(docx.byteOffset, docx.byteOffset + docx.byteLength);
  // mammoth's browser build reads an ArrayBuffer, its server build a buffer; each finds its own.
  const input = { arrayBuffer, buffer: docx } as unknown as Parameters<Mammoth["convertToHtml"]>[0];
  const { value } = await mammoth.convertToHtml(input, {
    idPrefix: "word-",
    externalFileAccess: false,
    convertImage: mammoth.images.imgElement(async (image) => {
      // mammoth hands each picture its description, though its types leave it out.
      const alt = "altText" in image && typeof image.altText === "string" ? image.altText : "";
      const extension = image.contentType.split("/")[1] ?? "png";
      pictures += 1;
      const file = new File(
        [await image.readAsArrayBuffer()],
        `picture-${String(pictures)}.${extension}`,
        {
          type: image.contentType,
        },
      );
      const stored = image.contentType.startsWith("image/")
        ? await options.picture?.(file).catch(() => null)
        : null;
      if (stored === null || stored === undefined) {
        skipped += 1;
        return { src: "", alt };
      }
      return { ...stored.attributes, src: stored.src, alt };
    }),
  });
  const formula = rules.find((rule) => rule.formula !== undefined)?.formula ?? formulaAsCode;
  const withFormulas = value.replaceAll(FORMULA, (whole, index: string) => {
    const found = formulas[Number(index)];
    return found === undefined ? whole : formula(found.latex, found.block);
  });
  const page = new DOMParser().parseFromString(withFormulas, "text/html");
  notesInPlace(page);
  return { html: page.body.innerHTML, skipped };
}

/** Each picture a Word document holds, sent up the editor's upload queue, its preview shown meanwhile. */
function uploadPicture(
  editor: LexicalEditor,
): ((file: File) => Promise<WordPicture | null>) | undefined {
  const uploads = editorUploads(editor);
  if (uploads === null) return undefined;
  return (file) => {
    const [item] = uploads.queue.add([file]);
    // The image block takes the upload's id, and its address once the queue has sent it.
    return Promise.resolve(
      item === undefined
        ? null
        : { src: item.preview ?? "", attributes: { "data-upload-id": item.id } },
    );
  };
}

export const wordImportStyles = variants({
  slots: {
    card: arc(surface.bordered, layout.row, gap[3], place.padded, rounded.lg, { margin: "0px" }),
    icon: arc(fg.muted, layout.noShrink),
    text: arc(layout.column, layout.grow, layout.minZero, gap[1]),
    name: arc(truncate, type.label),
    status: arc(type.caption, fg.muted),
    failed: arc(type.caption, fg.danger),
  },
});

type Reading =
  | { name: string; state: "reading" }
  | { name: string; state: "done"; skipped: number }
  | { name: string; state: "failed" };

/** The file picker, the drop of a Word file on the editor, and the card that says how the reading went. */
function WordImport() {
  const editor = useLexicalEditor();
  const messages = useArcMessages();
  const cls = wordImportStyles();
  const [reading, setReading] = createSignal<Reading | null>(null, { ownedWrite: true });
  let input: HTMLInputElement | undefined;
  let caret: BaseSelection | null = null;

  async function read(file: File): Promise<void> {
    setReading({ name: file.name, state: "reading" });
    try {
      const { html, skipped } = await wordToHtml(new Uint8Array(await file.arrayBuffer()), {
        extensions: editorExtensions(editor),
        picture: uploadPicture(editor),
      });
      const page = new DOMParser().parseFromString(html, "text/html");
      editor.getRootElement()?.focus({ preventScroll: true });
      editor.update(
        () => {
          $setSelection(caret?.clone() ?? null);
          $insertHtml(editor, page);
        },
        { discrete: true },
      );
      setReading({ name: file.name, state: "done", skipped });
    } catch {
      setReading({ name: file.name, state: "failed" });
    }
  }

  useRegistration(() =>
    mergeRegister(
      editor.registerCommand(
        IMPORT_WORD_COMMAND,
        () => {
          caret = $getSelection()?.clone() ?? null;
          // The reader loads while the file is being chosen.
          void loadExtension(wordImportExtension);
          queueMicrotask(() => input?.click());
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      // A Word document dropped or pasted is read in where it lands; any other file is left to others.
      editor.registerCommand(
        DRAG_DROP_PASTE,
        (files) => {
          if (files.length === 0 || !files.every(isWordFile)) return false;
          caret = $getSelection()?.clone() ?? null;
          // One after another, so each lands after the one before.
          void files.reduce<Promise<void>>(
            (before, file) => before.then(() => read(file)),
            Promise.resolve(),
          );
          return true;
        },
        COMMAND_PRIORITY_NORMAL,
      ),
    ),
  );

  return (
    <>
      <input
        ref={(element: HTMLInputElement) => {
          input = element;
        }}
        type="file"
        hidden
        tabIndex={-1}
        aria-hidden="true"
        accept={`.docx,${WORD_TYPE}`}
        data-slot="word-import-input"
        onChange={(event: Event) => {
          const field = event.currentTarget as HTMLInputElement;
          const [file] = [...(field.files ?? [])];
          field.value = "";
          if (file !== undefined) void read(file);
        }}
      />
      <Show when={reading()}>
        {(now: () => Reading) => (
          <div class={cls.card} data-slot="word-import" data-state={now().state}>
            <span class={cls.icon} aria-hidden="true">
              <FileText />
            </span>
            <div class={cls.text}>
              <bdi class={cls.name}>{now().name}</bdi>
              {now().state === "reading" ? (
                <>
                  <output class={cls.status}>{messages().readingWordDocument}</output>
                  <Progress label={messages().readingWordDocument} isIndeterminate />
                </>
              ) : now().state === "failed" ? (
                <span class={cls.failed} role="alert">
                  {messages().wordDocumentFailed}
                </span>
              ) : (
                <output class={cls.status}>
                  {(() => {
                    const done = now();
                    return done.state === "done" && done.skipped > 0
                      ? messages().wordPicturesSkipped(done.skipped)
                      : messages().wordDocumentRead;
                  })()}
                </output>
              )}
            </div>
            <Show when={now().state !== "reading"}>
              <IconButton label={messages().close} size="xs" onPress={() => setReading(null)}>
                <X />
              </IconButton>
            </Show>
          </div>
        )}
      </Show>
    </>
  );
}

/**
 * Word documents read in where the caret is, chosen from the Insert menu or
 * `/word`, or dropped on the editor: headings, lists, tables, links,
 * pictures (uploaded where the editor uploads, left out and counted where
 * it does not), footnotes and endnotes as footnotes, and equations as
 * formulas. A card says how the reading went. Mammoth and fflate load only
 * when a document is first read.
 */
export const wordImportExtension: EditorExtension = defineEditorExtension({
  name: "arc/word-import",
  load: loadReader,
  commands: [
    {
      id: "word",
      label: (messages) => messages.wordDocument,
      group: (messages) => messages.mediaBlocks,
      icon: () => <FileText />,
      keywords: ["docx", "word", "import", "office"],
      run: (editor) => editor.dispatchCommand(IMPORT_WORD_COMMAND, undefined),
    },
  ],
  plugins: [WordImport],
});
